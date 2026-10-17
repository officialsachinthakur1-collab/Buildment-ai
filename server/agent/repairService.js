// server/agent/repairService.js — AI Debugging & Automatic Repair Agent
const {
  FileModel,
  DiagnosticModel,
  CheckpointModel,
  RepairProposalModel,
  RepairAuditModel,
  ProjectVersionModel,
  validateFilePath,
  validateFileContent
} = require('../db');
const { diagnoseAndFix } = require('../aiService');
const RuntimeManager = require('../runtime/runtimeManager');

const MAX_REPAIR_ATTEMPTS = 3;

/**
 * Generate a simple line-by-line unified diff between oldText and newText
 */
function computeUnifiedDiff(oldText = '', newText = '', filename = '') {
  const oldLines = oldText.split('\n');
  const newLines = newText.split('\n');
  const diffLines = [];
  let linesAdded = 0;
  let linesRemoved = 0;

  diffLines.push(`--- a/${filename}`);
  diffLines.push(`+++ b/${filename}`);

  const maxLines = Math.max(oldLines.length, newLines.length);
  for (let i = 0; i < maxLines; i++) {
    const oldL = oldLines[i];
    const newL = newLines[i];

    if (oldL === newL) {
      if (oldL !== undefined) {
        diffLines.push(`  ${oldL}`);
      }
    } else {
      if (oldL !== undefined) {
        diffLines.push(`- ${oldL}`);
        linesRemoved++;
      }
      if (newL !== undefined) {
        diffLines.push(`+ ${newL}`);
        linesAdded++;
      }
    }
  }

  return {
    rawDiff: diffLines.slice(0, 200).join('\n'), // cap for display
    linesAdded,
    linesRemoved,
    summary: `+${linesAdded} / -${linesRemoved} lines`
  };
}

class RepairService {
  /**
   * Request AI diagnosis and generate a minimal, targeted patch for an active diagnostic error
   */
  static async diagnose({ projectId, diagnosticId = null, userId = null }) {
    // 1. Retrieve the diagnostic record
    let diagnostic = null;
    if (diagnosticId) {
      diagnostic = DiagnosticModel.getById(diagnosticId);
    } else {
      diagnostic = DiagnosticModel.getLatestUnresolved(projectId);
    }

    if (!diagnostic) {
      const recentDiags = DiagnosticModel.getByProject(projectId, 1);
      if (recentDiags.length > 0) {
        diagnostic = recentDiags[0];
      }
    }

    if (!diagnostic) {
      return {
        success: false,
        error: 'No active diagnostics or error logs found for this project. Start the preview or run tests to detect issues.'
      };
    }

    // 2. Prevent infinite repair loops (Rate Limit check: max 3 attempts per 15 min)
    const recentAttempts = RepairProposalModel.getRecentAttemptsCount(projectId, 15);
    if (recentAttempts >= MAX_REPAIR_ATTEMPTS) {
      return {
        success: false,
        error: `Maximum automated repair limit (${MAX_REPAIR_ATTEMPTS} attempts) reached for this session. Please review source files in the code editor to avoid an infinite repair loop.`,
        limitReached: true,
        attemptsCount: recentAttempts
      };
    }

    // 3. Collect current project source code context
    const currentFiles = FileModel.getByProject(projectId);
    if (!currentFiles || currentFiles.length === 0) {
      return {
        success: false,
        error: 'Project has no files to debug.'
      };
    }

    // 4. Request structured diagnosis and targeted file fixes from AI provider
    DiagnosticModel.updateStatus(diagnostic.id, 'diagnosing');

    let aiResult;
    try {
      aiResult = await diagnoseAndFix({
        errorDetails: diagnostic,
        currentFiles
      });
    } catch (err) {
      DiagnosticModel.updateStatus(diagnostic.id, 'unresolved');
      throw err;
    }

    // 5. Validate proposed files against security rules (path traversal, size, extensions)
    const validatedChanges = [];
    for (const proposedFile of aiResult.files) {
      const pathCheck = validateFilePath(proposedFile.path);
      if (!pathCheck.valid) {
        throw new Error(`Security Violation in proposed fix: ${pathCheck.error}`);
      }

      const contentCheck = validateFileContent(proposedFile.content);
      if (!contentCheck.valid) {
        throw new Error(`Security Violation in proposed fix: ${contentCheck.error}`);
      }

      const existing = currentFiles.find(f => f.path === pathCheck.cleanPath);
      const oldContent = existing ? existing.content : '';
      const diffInfo = computeUnifiedDiff(oldContent, contentCheck.cleanContent, pathCheck.cleanPath);

      validatedChanges.push({
        path: pathCheck.cleanPath,
        oldContent,
        newContent: contentCheck.cleanContent,
        diff: diffInfo.rawDiff,
        linesAdded: diffInfo.linesAdded,
        linesRemoved: diffInfo.linesRemoved,
        summary: diffInfo.summary
      });
    }

    if (validatedChanges.length === 0) {
      DiagnosticModel.updateStatus(diagnostic.id, 'unresolved');
      return {
        success: false,
        error: 'AI did not propose any actionable file modifications.'
      };
    }

    // 6. Save proposal into SQLite database
    const proposal = RepairProposalModel.create(projectId, {
      diagnostic_id: diagnostic.id,
      diagnosis: aiResult.diagnosis,
      root_cause: aiResult.rootCause,
      reasoning: aiResult.reasoning,
      diff_summary: validatedChanges.map(c => `${c.path} (${c.summary})`).join(', '),
      changes_json: validatedChanges,
      attempt_number: recentAttempts + 1
    });

    // Record AI Usage Metering for Automated Repair
    if (userId) {
      try {
        const { recordOperationUsage } = require('../quota/quotaService');
        recordOperationUsage({
          userId,
          projectId,
          operation: 'diagnose_repair',
          provider: 'gemini',
          model: 'gemini-2.5-flash',
          promptText: diagnostic.message || '',
          outputText: JSON.stringify(aiResult || '')
        });
      } catch (usageErr) {
        console.warn('[UsageMetering] Failed to record diagnose usage:', usageErr.message);
      }
    }

    return {
      success: true,
      proposal: {
        id: proposal.id,
        diagnosticId: diagnostic.id,
        diagnosis: aiResult.diagnosis,
        rootCause: aiResult.rootCause,
        reasoning: aiResult.reasoning,
        attemptNumber: proposal.attempt_number,
        maxAttempts: MAX_REPAIR_ATTEMPTS,
        changes: validatedChanges.map(c => ({
          path: c.path,
          diff: c.diff,
          linesAdded: c.linesAdded,
          linesRemoved: c.linesRemoved,
          summary: c.summary
        }))
      }
    };
  }

  /**
   * Apply an approved repair patch:
   * 1. Creates a recoverable checkpoint of the entire project
   * 2. Writes the modified files safely
   * 3. Immediately reruns the build & retest in the isolated runtime
   * 4. Records an audit trail entry
   */
  static async applyRepair({ projectId, proposalId, userId = null }) {
    const proposal = RepairProposalModel.getById(proposalId);
    if (!proposal || proposal.project_id !== projectId) {
      return { success: false, error: 'Repair proposal not found.' };
    }

    if (proposal.status === 'approved') {
      return { success: false, error: 'This repair proposal has already been applied.' };
    }

    // 1. CREATE RECOVERABLE CHECKPOINT BEFORE MODIFYING FILES
    const checkpointDesc = `Auto-checkpoint before AI Fix #${proposal.attempt_number}: ${proposal.diagnosis.substring(0, 60)}`;
    const checkpoint = CheckpointModel.create(projectId, checkpointDesc);

    // 2. APPLY PROPOSED CHANGES
    const changes = proposal.changes || [];
    for (const change of changes) {
      // Re-verify path safety
      const pathCheck = validateFilePath(change.path);
      if (!pathCheck.valid) {
        throw new Error(`Unsafe path rejected: ${pathCheck.error}`);
      }
      FileModel.save(projectId, pathCheck.cleanPath, change.newContent);
    }

    // 2.5 TRACK MEANINGFUL CHANGE IN VERSION HISTORY
    try {
      const gitAdapter = require('../versioning/gitAdapter');
      let gitCommitHash = null;
      if (gitAdapter.isAvailable()) {
        const currentFiles = FileModel.getByProject(projectId);
        const gitRes = gitAdapter.commitProjectFiles(
          projectId,
          currentFiles,
          `AI Auto-Repair: ${proposal.diagnosis.substring(0, 80)}`
        );
        if (gitRes.success) gitCommitHash = gitRes.commitHash;
      }
      ProjectVersionModel.create(projectId, {
        userId,
        summary: `AI Auto-Repair: ${proposal.diagnosis.substring(0, 80)}`,
        source: 'ai_repair',
        git_commit_hash: gitCommitHash
      });
    } catch (verErr) {
      console.warn('[RepairService] Version snapshot recording failed:', verErr.message);
    }

    // 3. LOG AUDIT ENTRY
    RepairAuditModel.log(projectId, {
      repair_proposal_id: proposal.id,
      action: 'applied',
      user_id: userId,
      details: `Applied ${changes.length} file changes (Checkpoint: ${checkpoint.id}). Changes: ${changes.map(c => c.path).join(', ')}`
    });

    // 4. RETEST: Rerun build and runtime health check in isolated execution environment
    let retestStatus = 'pending';
    let retestMessage = '';

    try {
      const buildResult = await RuntimeManager.start(projectId);
      if (!buildResult.success) {
        retestStatus = 'failed';
        retestMessage = `Build failed during retest: ${buildResult.error}`;
      } else {
        retestStatus = 'passed';
        retestMessage = 'Application successfully compiled and started in isolated sandbox.';
      }
    } catch (err) {
      retestStatus = 'failed';
      retestMessage = `Runtime execution error during retest: ${err.message}`;
    }

    // 5. UPDATE PROPOSAL & DIAGNOSTIC STATUS
    RepairProposalModel.updateStatus(proposal.id, 'approved', {
      retest_status: retestStatus,
      retest_logs: retestMessage,
      checkpoint_id: checkpoint.id
    });

    if (retestStatus === 'passed' && proposal.diagnostic_id) {
      DiagnosticModel.updateStatus(proposal.diagnostic_id, 'fixed');
    }

    return {
      success: true,
      proposalId: proposal.id,
      checkpointId: checkpoint.id,
      retestStatus,
      retestMessage,
      appliedFilesCount: changes.length
    };
  }

  /**
   * Roll back to a previous checkpoint
   */
  static async rollback({ projectId, checkpointId, userId = null }) {
    const checkpoint = CheckpointModel.getById(checkpointId);
    if (!checkpoint || checkpoint.project_id !== projectId) {
      return { success: false, error: 'Checkpoint not found or mismatched project.' };
    }

    // Restore files
    const restoreResult = CheckpointModel.restore(checkpointId);

    // Log audit trail
    RepairAuditModel.log(projectId, {
      action: 'rolled_back',
      user_id: userId,
      details: `Rolled back to checkpoint ${checkpointId} (${restoreResult.restoredFilesCount} files restored). Description: ${checkpoint.description}`
    });

    // Restart runtime
    await RuntimeManager.start(projectId);

    return {
      success: true,
      checkpointId,
      message: `Project successfully restored to checkpoint from ${new Date(checkpoint.created_at).toLocaleTimeString()}.`,
      restoredFilesCount: restoreResult.restoredFilesCount
    };
  }

  /**
   * Reject a proposal without applying it
   */
  static rejectRepair({ projectId, proposalId, userId = null }) {
    const proposal = RepairProposalModel.getById(proposalId);
    if (!proposal || proposal.project_id !== projectId) {
      return { success: false, error: 'Repair proposal not found.' };
    }

    RepairProposalModel.updateStatus(proposalId, 'rejected');

    RepairAuditModel.log(projectId, {
      repair_proposal_id: proposalId,
      action: 'rejected',
      user_id: userId,
      details: `User rejected AI repair proposal #${proposal.attempt_number}`
    });

    if (proposal.diagnostic_id) {
      DiagnosticModel.updateStatus(proposal.diagnostic_id, 'unresolved');
    }

    return { success: true, message: 'Repair proposal rejected.' };
  }
}

module.exports = RepairService;
