// server/runtime/runtimeManager.js — Isolated Runtime Adapter & Preview Session Manager
const { FileModel, PreviewSessionModel, ProjectModel, DiagnosticModel } = require('../db');
const { checkContainerCapability } = require('./containerAdapter');

const activeWatchdogs = new Map();
const MAX_PROJECT_STORAGE_BYTES = 10 * 1024 * 1024; // 10MB limit per project

class RuntimeManager {
  static getStatus(projectId) {
    const session = PreviewSessionModel.get(projectId);
    const container = checkContainerCapability();
    const latestDiag = DiagnosticModel.getLatestUnresolved(projectId);

    return {
      projectId,
      status: session.status,
      startedAt: session.started_at,
      stoppedAt: session.stopped_at,
      lastHealthCheck: session.last_health_check,
      errorMessage: session.error_message,
      containerCapability: container,
      logCount: (session.logs || []).length,
      activeDiagnostic: latestDiag || null
    };
  }

  static getLogs(projectId) {
    const session = PreviewSessionModel.get(projectId);
    return session.logs || [];
  }

  static clearLogs(projectId) {
    PreviewSessionModel.clearLogs(projectId);
    return { success: true };
  }

  static async start(projectId) {
    // Clear any pending watchdogs
    if (activeWatchdogs.has(projectId)) {
      clearTimeout(activeWatchdogs.get(projectId));
      activeWatchdogs.delete(projectId);
    }

    PreviewSessionModel.setStatus(projectId, 'starting');
    PreviewSessionModel.addLog(projectId, 'build', `[BUILD] Initializing build pipeline for project ${projectId}...`);

    const files = FileModel.getByProject(projectId);
    
    // Check 1: Empty project files
    if (!files || files.length === 0) {
      const err = 'Build Failed: Project has no files. Create an index.html or generate files via AI.';
      PreviewSessionModel.setStatus(projectId, 'failed', err);
      PreviewSessionModel.addLog(projectId, 'error', `[BUILD ERROR] ${err}`);
      DiagnosticModel.add(projectId, {
        type: 'build_error',
        message: err,
        file_path: 'index.html'
      });
      return { success: false, status: 'failed', error: err };
    }

    // Check 2: Total storage limit enforcement
    let totalBytes = 0;
    for (const file of files) {
      totalBytes += Buffer.byteLength(file.content || '', 'utf8');
    }
    if (totalBytes > MAX_PROJECT_STORAGE_BYTES) {
      const err = `Build Failed: Total project storage (${(totalBytes / 1024 / 1024).toFixed(2)}MB) exceeds limit of 10MB.`;
      PreviewSessionModel.setStatus(projectId, 'failed', err);
      PreviewSessionModel.addLog(projectId, 'error', `[SECURITY ERROR] ${err}`);
      DiagnosticModel.add(projectId, {
        type: 'build_error',
        message: err
      });
      return { success: false, status: 'failed', error: err };
    }

    // Check 3: index.html entry point
    const htmlFile = files.find(f => f.path.toLowerCase() === 'index.html');
    if (!htmlFile || !htmlFile.content.trim()) {
      const err = 'Build Failed: Missing entry point "index.html". The application must include an index.html file.';
      PreviewSessionModel.setStatus(projectId, 'failed', err);
      PreviewSessionModel.addLog(projectId, 'error', `[BUILD ERROR] ${err}`);
      DiagnosticModel.add(projectId, {
        type: 'build_error',
        message: err,
        file_path: 'index.html'
      });
      return { success: false, status: 'failed', error: err };
    }

    // Check 4: HTML structure verification
    if (!htmlFile.content.toLowerCase().includes('<html') && !htmlFile.content.toLowerCase().includes('<!doctype')) {
      PreviewSessionModel.addLog(projectId, 'warn', '[BUILD WARNING] index.html does not contain standard <html> tags. Auto-wrapping for execution.');
    }

    PreviewSessionModel.addLog(projectId, 'build', `[BUILD] Source files validated (${files.length} files, ${(totalBytes / 1024).toFixed(1)} KB). Bundling sandboxed application...`);
    PreviewSessionModel.addLog(projectId, 'info', '[RUNTIME] Starting application in isolated browser sandbox. Waiting for health check verification...');

    // Set a health check watchdog timer (8 seconds)
    const watchdogTimer = setTimeout(() => {
      const current = PreviewSessionModel.get(projectId);
      if (current.status === 'starting') {
        const timeoutErr = 'Health Check Timeout: Application did not signal ready state within 8000ms. Check console for runtime script errors.';
        PreviewSessionModel.setStatus(projectId, 'failed', timeoutErr);
        PreviewSessionModel.addLog(projectId, 'error', `[RUNTIME ERROR] ${timeoutErr}`);
        DiagnosticModel.add(projectId, {
          type: 'health_check_timeout',
          message: timeoutErr,
          file_path: 'app.js'
        });
      }
      activeWatchdogs.delete(projectId);
    }, 8000);

    activeWatchdogs.set(projectId, watchdogTimer);

    return {
      success: true,
      status: 'starting',
      bundleUrl: `/api/projects/${projectId}/bundle`
    };
  }

  static stop(projectId) {
    if (activeWatchdogs.has(projectId)) {
      clearTimeout(activeWatchdogs.get(projectId));
      activeWatchdogs.delete(projectId);
    }
    PreviewSessionModel.setStatus(projectId, 'stopped');
    PreviewSessionModel.addLog(projectId, 'info', '[RUNTIME] Preview session stopped by user.');
    return { success: true, status: 'stopped' };
  }

  static async restart(projectId) {
    this.stop(projectId);
    PreviewSessionModel.addLog(projectId, 'info', '[RUNTIME] Restarting preview session...');
    return this.start(projectId);
  }

  static recordHeartbeat(projectId) {
    if (activeWatchdogs.has(projectId)) {
      clearTimeout(activeWatchdogs.get(projectId));
      activeWatchdogs.delete(projectId);
    }
    PreviewSessionModel.recordHealthCheck(projectId);
    PreviewSessionModel.addLog(projectId, 'info', '[HEALTH CHECK] Application reported healthy. Status: RUNNING.');

    // If there were unresolved diagnostics, mark them resolved
    const unresolved = DiagnosticModel.getLatestUnresolved(projectId);
    if (unresolved) {
      DiagnosticModel.updateStatus(unresolved.id, 'fixed');
    }

    return { success: true, status: 'running' };
  }

  static recordClientLog(projectId, level, args) {
    const formatted = Array.isArray(args) 
      ? args.map(a => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ')
      : String(args);

    PreviewSessionModel.addLog(projectId, level || 'console', `[CONSOLE.${(level || 'log').toUpperCase()}] ${formatted}`);

    // If it's an error, automatically record into diagnostics
    if (level === 'error') {
      let filePath = null;
      let lineNum = null;
      let colNum = null;

      // Extract file:line from string (e.g. app.js:42:15 or index.html:10)
      const locMatch = /([a-zA-Z0-9_\-\.]+\.(?:js|html|css)):(\d+)(?::(\d+))?/.exec(formatted);
      if (locMatch) {
        filePath = locMatch[1];
        lineNum = parseInt(locMatch[2], 10);
        if (locMatch[3]) colNum = parseInt(locMatch[3], 10);
      }

      DiagnosticModel.add(projectId, {
        type: 'runtime_error',
        message: formatted,
        file_path: filePath,
        line_number: lineNum,
        col_number: colNum,
        stack_trace: formatted
      });
    }
  }

  static recordDiagnostic(projectId, details) {
    return DiagnosticModel.add(projectId, details);
  }
}

module.exports = RuntimeManager;
