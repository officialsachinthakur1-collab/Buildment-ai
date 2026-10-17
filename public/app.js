// public/app.js — BuildAI Client Controller with Real Workspace & Runtime Architecture

const appState = {
  currentView: 'dashboard', // 'dashboard' | 'workspace'
  currentUser: null,
  authToken: localStorage.getItem('buildai_auth_token') || null,
  activeProjectId: null,
  activeProject: null,
  activeFiles: [],
  activeFilePath: null,
  hasUnsavedChanges: false,
  aiStatus: { configured: false, activeProvider: null },
  runtimeStatus: 'stopped', // 'stopped' | 'starting' | 'running' | 'failed'
  viewport: 'desktop',
  rightTab: 'preview', // 'preview' | 'console'
  logs: [],
  diffMode: 'split', // 'split' | 'unified'
  activeProposal: null,
  starterTemplates: []
};

let cmEditorInstance = null;
let runtimePollTimer = null;

// -------------------------------------------------------------
// DOM Elements
// -------------------------------------------------------------
const dashboardView = document.getElementById('dashboardView');
const workspaceView = document.getElementById('workspaceView');

const sidebarProjectCount = document.getElementById('sidebarProjectCount');
const sidebarProjectList = document.getElementById('sidebarProjectList');
const projectsGrid = document.getElementById('projectsGrid');
const heroProjectName = document.getElementById('heroProjectName');
const heroPromptInput = document.getElementById('heroPromptInput');
const createAndBuildBtn = document.getElementById('createAndBuildBtn');
const userAccountLabel = document.getElementById('userAccountLabel');

const aiStatusDot = document.getElementById('aiStatusDot');
const aiStatusTitle = document.getElementById('aiStatusTitle');
const aiStatusSub = document.getElementById('aiStatusSub');

const wsProjectName = document.getElementById('wsProjectName');
const wsFileCountBadge = document.getElementById('wsFileCountBadge');
const wsAiBadge = document.getElementById('wsAiBadge');
const aiWarningBanner = document.getElementById('aiWarningBanner');
const wsChatMessages = document.getElementById('wsChatMessages');
const wsChatInput = document.getElementById('wsChatInput');
const wsSendBtn = document.getElementById('wsSendBtn');

const wsExplorerList = document.getElementById('wsExplorerList');
const wsFilesTabList = document.getElementById('wsFilesTabList');
const currentEditingPath = document.getElementById('currentEditingPath');
const unsavedIndicator = document.getElementById('unsavedIndicator');
const wsCodeEditor = document.getElementById('wsCodeEditor');
const editorFileInfo = document.getElementById('editorFileInfo');
const editorCursorInfo = document.getElementById('editorCursorInfo');

const wsRuntimeStatusDot = document.getElementById('wsRuntimeStatusDot');
const wsRuntimeStatusText = document.getElementById('wsRuntimeStatusText');
const wsStartRuntimeBtn = document.getElementById('wsStartRuntimeBtn');
const wsStopRuntimeBtn = document.getElementById('wsStopRuntimeBtn');
const wsRestartRuntimeBtn = document.getElementById('wsRestartRuntimeBtn');

const tabPreviewBtn = document.getElementById('tabPreviewBtn');
const tabConsoleBtn = document.getElementById('tabConsoleBtn');
const logCountPill = document.getElementById('logCountPill');
const previewViewportControls = document.getElementById('previewViewportControls');
const consoleActionControls = document.getElementById('consoleActionControls');
const previewFrameContainer = document.getElementById('previewFrameContainer');
const runtimeConsoleContainer = document.getElementById('runtimeConsoleContainer');
const runtimeStoppedPlaceholder = document.getElementById('runtimeStoppedPlaceholder');
const runtimeErrorBanner = document.getElementById('runtimeErrorBanner');
const runtimeErrorMessage = document.getElementById('runtimeErrorMessage');
const wsPreviewIframe = document.getElementById('wsPreviewIframe');
const wsConsoleLogs = document.getElementById('wsConsoleLogs');

const tabDebuggerBtn = document.getElementById('tabDebuggerBtn');
const diagAlertPill = document.getElementById('diagAlertPill');
const debuggerActionControls = document.getElementById('debuggerActionControls');
const runtimeDebuggerContainer = document.getElementById('runtimeDebuggerContainer');
const dbgAttemptsBadge = document.getElementById('dbgAttemptsBadge');
const dbgErrorTypeBadge = document.getElementById('dbgErrorTypeBadge');
const dbgFileContext = document.getElementById('dbgFileContext');
const dbgErrorTime = document.getElementById('dbgErrorTime');
const dbgErrorMessage = document.getElementById('dbgErrorMessage');
const btnTriggerDiagnosis = document.getElementById('btnTriggerDiagnosis');
const dbgAnalyzingIndicator = document.getElementById('dbgAnalyzingIndicator');
const dbgProposalCard = document.getElementById('dbgProposalCard');
const dbgDiagnosisText = document.getElementById('dbgDiagnosisText');
const dbgRootCauseText = document.getElementById('dbgRootCauseText');
const dbgReasoningText = document.getElementById('dbgReasoningText');
const dbgDiffSummary = document.getElementById('dbgDiffSummary');
const dbgDiffViewer = document.getElementById('dbgDiffViewer');
const btnApplyRepair = document.getElementById('btnApplyRepair');
const dbgRetestBanner = document.getElementById('dbgRetestBanner');
const dbgCheckpointsList = document.getElementById('dbgCheckpointsList');


const wsGeneratingOverlay = document.getElementById('wsGeneratingOverlay');
const wsGeneratingTitle = document.getElementById('wsGeneratingTitle');
const wsGeneratingDetails = document.getElementById('wsGeneratingDetails');

const newProjectModal = document.getElementById('newProjectModal');
const modalProjectName = document.getElementById('modalProjectName');
const modalProjectPrompt = document.getElementById('modalProjectPrompt');

const newFileModal = document.getElementById('newFileModal');
const modalFilePathInput = document.getElementById('modalFilePathInput');
const filePathValidationError = document.getElementById('filePathValidationError');

const versionHistoryModal = document.getElementById('versionHistoryModal');
const versionModalFilePath = document.getElementById('versionModalFilePath');
const versionHistoryList = document.getElementById('versionHistoryList');

const projectHistoryModal = document.getElementById('projectHistoryModal');
const projectVersionList = document.getElementById('projectVersionList');
const projHistCount = document.getElementById('projHistCount');
const wsVersionCountBadge = document.getElementById('wsVersionCountBadge');
const createVersionBox = document.getElementById('createVersionBox');
const customVersionSummary = document.getElementById('customVersionSummary');

// -------------------------------------------------------------
// Authenticated Fetch Helper
// -------------------------------------------------------------
async function authFetch(url, options = {}) {
  const headers = options.headers ? { ...options.headers } : {};
  if (appState.authToken) {
    headers['x-auth-token'] = appState.authToken;
  }
  const opts = {
    ...options,
    headers,
    credentials: 'same-origin'
  };
  const res = await fetch(url, opts);
  if (res.status === 401 && !url.includes('/api/auth/')) {
    openAuthModal('login');
  }
  return res;
}

// -------------------------------------------------------------
// Initialization
// -------------------------------------------------------------
async function init() {
  await initUserSession();
  await checkAIStatus();
  await fetchUserQuota();
  await loadProjects();
  await loadTemplates();
  initCodeMirror();
  setupEventListeners();
  setupParentBridgeListener();
}

async function initUserSession() {
  try {
    const res = await authFetch('/api/auth/session');
    if (res.status === 401) {
      appState.currentUser = null;
      appState.authToken = null;
      localStorage.removeItem('buildai_auth_token');
      if (userAccountLabel) userAccountLabel.textContent = 'Sign In';
      openAuthModal('login');
      return;
    }
    const data = await res.json();
    if (data.success && data.user) {
      appState.currentUser = data.user;
      appState.authToken = data.token || data.user.token;
      if (appState.authToken) {
        localStorage.setItem('buildai_auth_token', appState.authToken);
      }
      if (userAccountLabel) {
        userAccountLabel.textContent = data.user.username;
      }
      const migrationBadge = document.getElementById('migrationAlertBadge');
      if (migrationBadge) {
        if (data.user.needs_password_migration) {
          migrationBadge.classList.remove('hidden');
        } else {
          migrationBadge.classList.add('hidden');
        }
      }
    }
  } catch (err) {
    console.warn('Session init warning:', err);
  }
}

function initCodeMirror() {
  if (window.CodeMirror && wsCodeEditor) {
    try {
      cmEditorInstance = CodeMirror.fromTextArea(wsCodeEditor, {
        lineNumbers: true,
        theme: 'dracula',
        mode: 'htmlmixed',
        indentUnit: 2,
        tabSize: 2,
        lineWrapping: true,
        autoCloseTags: true,
        autoCloseBrackets: true
      });

      cmEditorInstance.on('change', () => {
        setUnsavedStatus(true);
      });

      cmEditorInstance.on('cursorActivity', () => {
        const cursor = cmEditorInstance.getCursor();
        if (editorCursorInfo) {
          editorCursorInfo.textContent = `Ln ${cursor.line + 1}, Col ${cursor.ch + 1}`;
        }
      });

      // Bind Ctrl+S / Cmd+S
      cmEditorInstance.setOption('extraKeys', {
        'Ctrl-S': () => saveActiveFileContent(),
        'Cmd-S': () => saveActiveFileContent()
      });
    } catch (e) {
      console.warn('CodeMirror initialization fallback to textarea:', e);
    }
  }
}

function setupEventListeners() {
  // Global Keyboard Shortcuts
  window.addEventListener('keydown', (e) => {
    const targetTag = (e.target && e.target.tagName) ? e.target.tagName.toUpperCase() : '';
    const isTextInput = ['INPUT', 'TEXTAREA'].includes(targetTag) || (e.target && e.target.closest && e.target.closest('.CodeMirror'));

    // Ctrl+S / Cmd+S: Save active file
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      saveActiveFileContent();
      return;
    }

    // Ctrl+P / Cmd+P: Toggle Live Preview Runtime
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'p') {
      e.preventDefault();
      if (appState.activeProjectId) {
        if (appState.runtimeStatus === 'running') {
          handleStopRuntime();
        } else {
          handleStartRuntime();
        }
      }
      return;
    }

    // Ctrl+Shift+H: Open Project Version History
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'h') {
      e.preventDefault();
      if (appState.activeProjectId) {
        openProjectHistoryModal();
      }
      return;
    }

    // Ctrl+Shift+F: Create New File Modal
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'f') {
      e.preventDefault();
      if (appState.activeProjectId) {
        openNewFileModal();
      }
      return;
    }

    // '?' key: Toggle Keyboard Shortcuts Modal (when not in a text field)
    if (e.key === '?' && !isTextInput && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      toggleShortcutsModal();
      return;
    }

    // Escape: Close all active modals
    if (e.key === 'Escape') {
      closeAllModals();
    }
  });

  if (wsChatInput) {
    wsChatInput.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        handleSendChatMessage(e);
      }
    });
  }

  if (heroPromptInput) {
    heroPromptInput.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        handleCreateFromHero();
      }
    });
  }
}

// -------------------------------------------------------------
// Sandboxed Iframe Bridge Listener (Heartbeat & Console Capture)
// -------------------------------------------------------------
function setupParentBridgeListener() {
  window.addEventListener('message', async (event) => {
    const data = event.data;
    if (!data || typeof data !== 'object') return;

    // Health check ready signal from iframe
    if (data.type === 'buildai:ready') {
      if (appState.activeProjectId) {
        try {
          const res = await authFetch(`/api/projects/${appState.activeProjectId}/preview/heartbeat`, { method: 'POST' });
          const hbData = await res.json();
          if (hbData.success) {
            setRuntimeUIState('running');
            addConsoleLogEntry('info', '[HEALTH CHECK] Client reported ready. Runtime is operational.');
          }
        } catch (err) {
          console.error('Heartbeat submission error:', err);
        }
      }
    }

    // Console message relay from iframe
    if (data.type === 'buildai:console') {
      const level = data.level || 'log';
      const args = data.args || [];
      const text = args.join(' ');
      addConsoleLogEntry(level, `[CLIENT.${level.toUpperCase()}] ${text}`);

      // Relay to server log buffer
      if (appState.activeProjectId) {
        authFetch(`/api/projects/${appState.activeProjectId}/preview/log`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ level, args })
        }).catch(() => {});
      }
    }
  });
}

// -------------------------------------------------------------
// AI Status Checking
// -------------------------------------------------------------
async function checkAIStatus(showToast = false) {
  try {
    const res = await authFetch('/api/status');
    const data = await res.json();
    appState.aiStatus = data.ai || { configured: false };

    if (appState.aiStatus.configured) {
      aiStatusDot.className = 'w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_#34d399]';
      aiStatusTitle.textContent = `AI: ${appState.aiStatus.activeProvider.toUpperCase()}`;
      aiStatusTitle.className = 'font-semibold text-emerald-300 text-[11px]';
      aiStatusSub.textContent = 'Ready to generate';
      if (wsAiBadge) wsAiBadge.textContent = appState.aiStatus.activeProvider.toUpperCase();
      if (aiWarningBanner) aiWarningBanner.classList.add('hidden');
    } else {
      aiStatusDot.className = 'w-2 h-2 rounded-full bg-amber-400 animate-pulse';
      aiStatusTitle.textContent = 'AI Not Configured';
      aiStatusTitle.className = 'font-semibold text-amber-300 text-[11px]';
      aiStatusSub.textContent = 'Set key in .env';
      if (wsAiBadge) wsAiBadge.textContent = 'Unconfigured';
      if (aiWarningBanner) aiWarningBanner.classList.remove('hidden');
    }

    if (showToast) {
      const msg = `Configured: ${appState.aiStatus.configured ? 'Active (' + appState.aiStatus.activeProvider.toUpperCase() + ')' : 'None (Set GEMINI_API_KEY)'} | Container: ${data.containerRuntime?.supported ? 'Supported' : 'Sandboxed Web Runtime Active'}`;
      window.showToast?.('AI & Runtime Telemetry', msg, appState.aiStatus.configured ? 'success' : 'warning', 4500);
    }
  } catch (err) {
    console.error('Failed to check AI status:', err);
  }
}

// -------------------------------------------------------------
// Project Management (SQLite API)
// -------------------------------------------------------------
async function loadProjects() {
  try {
    const res = await authFetch('/api/projects');
    const data = await res.json();
    if (!data.success) throw new Error(data.error);

    const projects = data.projects || [];
    sidebarProjectCount.textContent = projects.length;

    renderSidebarProjects(projects);
    renderProjectsGrid(projects);
  } catch (err) {
    console.error('Error loading projects:', err);
    sidebarProjectList.innerHTML = `<div class="p-3 text-xs text-red-400 text-center">Failed to load projects</div>`;
  }
}

function renderSidebarProjects(projects) {
  if (projects.length === 0) {
    sidebarProjectList.innerHTML = `<div class="p-3 text-xs text-neutral-500 text-center">No projects yet</div>`;
    return;
  }

  sidebarProjectList.innerHTML = projects.map(p => {
    const isActive = appState.activeProjectId === p.id;
    return `
      <div 
        onclick="openWorkspace('${p.id}')"
        class="group flex items-center justify-between px-2.5 py-2 rounded-lg cursor-pointer transition text-xs ${isActive ? 'bg-white/10 text-white font-semibold' : 'text-neutral-400 hover:bg-white/5 hover:text-white'}"
      >
        <div class="flex items-center gap-2 truncate">
          <i class="fa-solid fa-code text-[10px] ${isActive ? 'text-cyan-400' : 'text-neutral-500'}"></i>
          <span class="truncate">${escapeHtml(p.name)}</span>
        </div>
        <div class="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition">
          <button onclick="deleteProject('${p.id}', event)" class="p-1 hover:text-red-400 transition" title="Delete Project">
            <i class="fa-regular fa-trash-can text-[10px]"></i>
          </button>
        </div>
      </div>
    `;
  }).join('');
}

function renderProjectsGrid(projects) {
  if (projects.length === 0) {
    projectsGrid.innerHTML = `
      <div class="col-span-full border border-dashed border-white/10 rounded-2xl p-10 text-center text-neutral-400 space-y-3">
        <div class="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center mx-auto text-neutral-400 text-lg">
          <i class="fa-regular fa-folder-open"></i>
        </div>
        <h3 class="text-sm font-bold text-white">No projects created yet</h3>
        <p class="text-xs max-w-sm mx-auto text-neutral-400">
          Enter an idea in the prompt input above to generate your first web application.
        </p>
      </div>
    `;
    return;
  }

  projectsGrid.innerHTML = projects.map(p => {
    const dateStr = p.updated_at ? new Date(p.updated_at).toLocaleDateString() : 'Just now';
    return `
      <div 
        onclick="openWorkspace('${p.id}')"
        class="group bg-[#14151a] border border-white/10 hover:border-white/20 rounded-2xl p-4 transition-all duration-200 cursor-pointer flex flex-col justify-between hover:shadow-xl hover:-translate-y-0.5"
      >
        <div>
          <div class="flex items-start justify-between gap-2 mb-2">
            <div class="w-8 h-8 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-cyan-400 group-hover:bg-cyan-500/10 group-hover:border-cyan-500/30 transition">
              <i class="fa-solid fa-layer-group text-xs"></i>
            </div>
            <div class="flex items-center gap-1">
              <button onclick="downloadProjectZip('${p.id}', event)" class="text-neutral-500 hover:text-amber-400 p-1.5 rounded-lg hover:bg-white/5 transition" title="Export Project ZIP">
                <i class="fa-solid fa-file-zipper text-xs"></i>
              </button>
              <button onclick="deleteProject('${p.id}', event)" class="text-neutral-500 hover:text-red-400 p-1.5 rounded-lg hover:bg-white/5 transition" title="Delete Project">
                <i class="fa-regular fa-trash-can text-xs"></i>
              </button>
            </div>
          </div>
          <h3 class="font-bold text-sm text-white group-hover:text-cyan-300 transition truncate">${escapeHtml(p.name)}</h3>
          <p class="text-xs text-neutral-400 line-clamp-2 mt-1 leading-relaxed">${escapeHtml(p.prompt || p.description || 'Custom Web Application')}</p>
        </div>

        <div class="pt-4 mt-4 border-t border-white/5 flex items-center justify-between text-[11px] text-neutral-400">
          <span class="flex items-center gap-1.5">
            <i class="fa-regular fa-file-code text-cyan-400"></i>
            <span>${p.file_count || 0} files</span>
          </span>
          <span class="font-mono text-[10px] text-neutral-400">${dateStr}</span>
        </div>
      </div>
    `;
  }).join('');
}

// -------------------------------------------------------------
// Workspace Controller
// -------------------------------------------------------------
async function openWorkspace(projectId, triggerAiIfAvailable = false) {
  try {
    const res = await authFetch(`/api/projects/${projectId}`);
    const data = await res.json();
    if (!data.success) throw new Error(data.error);

    appState.activeProjectId = projectId;
    appState.activeProject = data.project;
    appState.activeFiles = data.files || [];
    appState.currentView = 'workspace';

    dashboardView.classList.add('hidden');
    workspaceView.classList.remove('hidden');

    wsProjectName.textContent = data.project.name;
    updateFileCountBadge();
    updateProjectVersionBadge();

    // Render Chat Messages
    renderChatMessages(data.messages || []);

    // Render File Explorer & Tabs
    renderExplorerList();
    renderFileTabs();

    // Select default file
    if (appState.activeFiles.length > 0) {
      const defaultFile = appState.activeFiles.find(f => f.path === 'index.html') || appState.activeFiles[0];
      selectFile(defaultFile.path);
    } else {
      selectFile(null);
    }

    // Set initial runtime status from server
    if (data.runtimeStatus) {
      setRuntimeUIState(data.runtimeStatus.status || 'stopped', data.runtimeStatus.errorMessage);
    }

    // If initial files exist, start runtime preview
    if (appState.activeFiles.length > 0) {
      handleStartRuntime();
    } else {
      setRuntimeUIState('stopped');
      if (triggerAiIfAvailable && data.project.prompt) {
        if (appState.aiStatus.configured) {
          triggerInitialAiGeneration(data.project.prompt);
        } else {
          appendChatMessage({
            role: 'system',
            content: '⚠️ AI Generation is not configured. Please add GEMINI_API_KEY to your .env file to enable live code generation. You can create files manually using the "+ File" button in the explorer.'
          });
        }
      }
    }

    loadProjects();
    fetchDiagnostics();
    loadCheckpointsList();
  } catch (err) {
    alert('Failed to open workspace: ' + err.message);
  }
}

function exitWorkspaceToDashboard() {
  if (runtimePollTimer) clearInterval(runtimePollTimer);

  appState.currentView = 'dashboard';
  appState.activeProjectId = null;
  appState.activeProject = null;
  appState.activeFiles = [];
  appState.activeFilePath = null;

  workspaceView.classList.add('hidden');
  dashboardView.classList.remove('hidden');

  loadProjects();
}

function updateFileCountBadge() {
  wsFileCountBadge.textContent = `${appState.activeFiles.length} file${appState.activeFiles.length === 1 ? '' : 's'}`;
}

// -------------------------------------------------------------
// File Explorer & Editor Logic
// -------------------------------------------------------------
function getFileIcon(filePath) {
  if (filePath.endsWith('.html')) return 'fa-brands fa-html5 text-orange-400';
  if (filePath.endsWith('.css')) return 'fa-brands fa-css3-alt text-blue-400';
  if (filePath.endsWith('.js') || filePath.endsWith('.jsx')) return 'fa-brands fa-js text-yellow-400';
  if (filePath.endsWith('.json')) return 'fa-solid fa-code text-emerald-400';
  if (filePath.endsWith('.md')) return 'fa-brands fa-markdown text-purple-400';
  if (filePath.endsWith('.svg')) return 'fa-regular fa-image text-pink-400';
  return 'fa-regular fa-file-code text-cyan-400';
}

function renderExplorerList() {
  if (appState.activeFiles.length === 0) {
    wsExplorerList.innerHTML = `
      <div class="p-4 text-center text-neutral-500 italic text-[11px]">
        No files in project.<br/>Click "+ File" to create one.
      </div>
    `;
    return;
  }

  wsExplorerList.innerHTML = appState.activeFiles.map(f => {
    const isSelected = appState.activeFilePath === f.path;
    const isDirty = isSelected && appState.hasUnsavedChanges;
    const byteSize = (f.content || '').length;
    const sizeStr = byteSize > 1024 ? `${(byteSize / 1024).toFixed(1)}k` : `${byteSize}b`;

    return `
      <div 
        onclick="selectFile('${escapeHtml(f.path)}')"
        class="group flex items-center justify-between px-2.5 py-1.5 rounded-lg cursor-pointer transition text-xs ${isSelected ? 'bg-white/10 text-white font-semibold' : 'text-neutral-400 hover:text-white hover:bg-white/5'}"
      >
        <div class="flex items-center gap-2 truncate">
          <i class="${getFileIcon(f.path)} text-[11px]"></i>
          <span class="truncate">${escapeHtml(f.path)}</span>
          ${isDirty ? '<span class="w-1.5 h-1.5 rounded-full bg-amber-400"></span>' : ''}
        </div>
        <div class="flex items-center gap-1.5">
          <span class="text-[9px] font-mono text-neutral-500">${sizeStr}</span>
          <button onclick="deleteFile('${escapeHtml(f.path)}', event)" class="opacity-0 group-hover:opacity-100 hover:text-red-400 p-0.5 transition" title="Delete file">
            <i class="fa-regular fa-trash-can text-[10px]"></i>
          </button>
        </div>
      </div>
    `;
  }).join('');
}

function renderFileTabs() {
  if (appState.activeFiles.length === 0) {
    wsFilesTabList.innerHTML = `<span class="text-[11px] text-neutral-500 italic px-2">No files</span>`;
    return;
  }

  wsFilesTabList.innerHTML = appState.activeFiles.map(f => {
    const isSelected = appState.activeFilePath === f.path;
    const isDirty = isSelected && appState.hasUnsavedChanges;

    return `
      <div 
        onclick="selectFile('${escapeHtml(f.path)}')"
        class="group flex items-center gap-1.5 px-3 py-1.5 rounded-t-lg text-xs cursor-pointer transition select-none ${isSelected ? 'bg-[#090a0d] text-cyan-300 font-semibold border-t border-x border-white/10' : 'text-neutral-400 hover:text-white hover:bg-white/5'}"
      >
        <i class="${getFileIcon(f.path)} text-[11px]"></i>
        <span>${escapeHtml(f.path)}</span>
        ${isDirty ? '<span class="text-amber-400 font-bold text-xs leading-none">●</span>' : ''}
        <button onclick="deleteFile('${escapeHtml(f.path)}', event)" class="opacity-0 group-hover:opacity-100 hover:text-red-400 ml-1 transition" title="Delete File">
          <i class="fa-solid fa-xmark text-[9px]"></i>
        </button>
      </div>
    `;
  }).join('');
}

function selectFile(filePath) {
  appState.activeFilePath = filePath;
  currentEditingPath.textContent = filePath || 'No file selected';

  if (!filePath) {
    setEditorContent('');
    setEditorEnabled(false);
    setUnsavedStatus(false);
    renderExplorerList();
    renderFileTabs();
    return;
  }

  const file = appState.activeFiles.find(f => f.path === filePath);
  setEditorEnabled(true);
  setEditorContent(file ? file.content : '');
  setUnsavedStatus(false);

  // Set CodeMirror syntax mode based on extension
  if (cmEditorInstance) {
    let mode = 'htmlmixed';
    if (filePath.endsWith('.css')) mode = 'css';
    else if (filePath.endsWith('.js') || filePath.endsWith('.json')) mode = 'javascript';
    cmEditorInstance.setOption('mode', mode);
  }

  if (editorFileInfo) {
    const byteSize = file ? (file.content || '').length : 0;
    editorFileInfo.textContent = `UTF-8 • ${(byteSize / 1024).toFixed(1)} KB • Editable`;
  }

  renderExplorerList();
  renderFileTabs();
}

function getEditorContent() {
  if (cmEditorInstance) {
    return cmEditorInstance.getValue();
  }
  return wsCodeEditor ? wsCodeEditor.value : '';
}

function setEditorContent(val) {
  if (cmEditorInstance) {
    cmEditorInstance.setValue(val || '');
    cmEditorInstance.clearHistory();
  } else if (wsCodeEditor) {
    wsCodeEditor.value = val || '';
  }
}

function setEditorEnabled(enabled) {
  if (cmEditorInstance) {
    cmEditorInstance.setOption('readOnly', !enabled);
  } else if (wsCodeEditor) {
    wsCodeEditor.disabled = !enabled;
  }
}

function setUnsavedStatus(unsaved) {
  appState.hasUnsavedChanges = unsaved;
  if (unsaved) {
    unsavedIndicator.classList.remove('hidden');
  } else {
    unsavedIndicator.classList.add('hidden');
  }
  renderFileTabs();
  renderExplorerList();
}

async function saveActiveFileContent() {
  if (!appState.activeFilePath || !appState.activeProjectId) return;

  const content = getEditorContent();
  const saveBtn = document.getElementById('saveFileBtn');
  if (saveBtn) saveBtn.disabled = true;

  try {
    const res = await authFetch(`/api/projects/${appState.activeProjectId}/files`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: appState.activeFilePath, content })
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error);

    // Update file in local state
    const existing = appState.activeFiles.find(f => f.path === appState.activeFilePath);
    if (existing) {
      existing.content = content;
    } else {
      appState.activeFiles.push(data.file);
    }

    setUnsavedStatus(false);
    addConsoleLogEntry('build', `[BUILD] Saved ${appState.activeFilePath}. Reloading preview...`);

    // Reload live preview
    if (appState.runtimeStatus === 'running') {
      reloadPreviewIframe();
    } else {
      handleStartRuntime();
    }

  } catch (err) {
    alert('Failed to save file: ' + err.message);
  } finally {
    if (saveBtn) saveBtn.disabled = false;
  }
}

// -------------------------------------------------------------
// Live Runtime & Preview Session Controller
// -------------------------------------------------------------
function setRuntimeUIState(status, errorMessage = null) {
  appState.runtimeStatus = status;

  if (status === 'running') {
    wsRuntimeStatusDot.className = 'w-2.5 h-2.5 rounded-full bg-emerald-400 shadow-[0_0_8px_#34d399]';
    wsRuntimeStatusText.className = 'font-bold text-emerald-400';
    wsRuntimeStatusText.textContent = 'RUNNING';
    runtimeStoppedPlaceholder.classList.add('hidden');
    runtimeErrorBanner.classList.add('hidden');
    wsPreviewIframe.classList.remove('hidden');
  } else if (status === 'starting') {
    wsRuntimeStatusDot.className = 'w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse';
    wsRuntimeStatusText.className = 'font-bold text-amber-400';
    wsRuntimeStatusText.textContent = 'STARTING';
    runtimeStoppedPlaceholder.classList.add('hidden');
    runtimeErrorBanner.classList.add('hidden');
    wsPreviewIframe.classList.remove('hidden');
  } else if (status === 'failed') {
    wsRuntimeStatusDot.className = 'w-2.5 h-2.5 rounded-full bg-red-400';
    wsRuntimeStatusText.className = 'font-bold text-red-400';
    wsRuntimeStatusText.textContent = 'FAILED';
    runtimeErrorBanner.classList.remove('hidden');
    if (runtimeErrorMessage) {
      runtimeErrorMessage.textContent = errorMessage || 'Health check timeout or script compilation error.';
    }
    fetchDiagnostics();
    runtimeStoppedPlaceholder.classList.add('hidden');
  } else { // stopped
    wsRuntimeStatusDot.className = 'w-2.5 h-2.5 rounded-full bg-slate-500';
    wsRuntimeStatusText.className = 'font-bold text-slate-400';
    wsRuntimeStatusText.textContent = 'STOPPED';
    runtimeStoppedPlaceholder.classList.remove('hidden');
    runtimeErrorBanner.classList.add('hidden');
    wsPreviewIframe.classList.add('hidden');
    wsPreviewIframe.src = 'about:blank';
  }
}

async function handleStartRuntime() {
  if (!appState.activeProjectId) return;
  setRuntimeUIState('starting');
  addConsoleLogEntry('build', `[BUILD] Initializing preview build for ${appState.activeProjectId}...`);

  try {
    const res = await authFetch(`/api/projects/${appState.activeProjectId}/preview/start`, { method: 'POST' });
    const data = await res.json();
    if (!data.success) {
      setRuntimeUIState('failed', data.error);
      addConsoleLogEntry('error', `[BUILD ERROR] ${data.error}`);
      return;
    }

    // Load bundle into iframe with cache buster
    const bundleUrl = `/api/projects/${appState.activeProjectId}/bundle?t=${Date.now()}`;
    wsPreviewIframe.src = bundleUrl;

    // Start polling status to catch health check confirmation or timeout
    pollRuntimeStatus();

  } catch (err) {
    setRuntimeUIState('failed', err.message);
    addConsoleLogEntry('error', `[RUNTIME ERROR] ${err.message}`);
  }
}

async function handleStopRuntime() {
  if (!appState.activeProjectId) return;
  if (runtimePollTimer) clearInterval(runtimePollTimer);

  try {
    await authFetch(`/api/projects/${appState.activeProjectId}/preview/stop`, { method: 'POST' });
    setRuntimeUIState('stopped');
    addConsoleLogEntry('info', '[RUNTIME] Preview session stopped by user.');
  } catch (err) {
    console.error('Failed to stop runtime:', err);
  }
}

async function handleRestartRuntime() {
  if (!appState.activeProjectId) return;
  addConsoleLogEntry('info', '[RUNTIME] Restarting runtime session...');
  handleStartRuntime();
}

function pollRuntimeStatus() {
  if (runtimePollTimer) clearInterval(runtimePollTimer);
  let attempts = 0;

  runtimePollTimer = setInterval(async () => {
    attempts++;
    if (!appState.activeProjectId || attempts > 15) {
      clearInterval(runtimePollTimer);
      return;
    }

    try {
      const res = await authFetch(`/api/projects/${appState.activeProjectId}/preview/status`);
      const data = await res.json();
      if (data.success && data.status) {
        if (data.status.status === 'running') {
          setRuntimeUIState('running');
          clearInterval(runtimePollTimer);
        } else if (data.status.status === 'failed') {
          setRuntimeUIState('failed', data.status.errorMessage);
          clearInterval(runtimePollTimer);
        }
      }
    } catch (e) {}
  }, 1000);
}

function reloadPreviewIframe() {
  if (!appState.activeProjectId) return;
  if (appState.runtimeStatus === 'stopped') {
    handleStartRuntime();
    return;
  }
  const currentSrc = wsPreviewIframe.src;
  wsPreviewIframe.src = 'about:blank';
  setTimeout(() => {
    wsPreviewIframe.src = `/api/projects/${appState.activeProjectId}/bundle?t=${Date.now()}`;
  }, 50);
}

function openExternalPreview() {
  if (!appState.activeProjectId) return;
  window.open(`/api/projects/${appState.activeProjectId}/bundle`, '_blank');
}

function downloadProjectBundle() {
  if (!appState.activeProjectId) return;
  const htmlFile = appState.activeFiles.find(f => f.path === 'index.html');
  if (!htmlFile) {
    alert('No index.html file found in project.');
    return;
  }
  window.open(`/api/projects/${appState.activeProjectId}/bundle`, '_blank');
}

async function downloadProjectZip(projectId = null, event = null) {
  if (event) event.stopPropagation();
  const targetId = projectId || appState.activeProjectId;
  if (!targetId) {
    alert('No active project to export.');
    return;
  }

  try {
    const res = await authFetch(`/api/projects/${targetId}/export/zip`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Export failed' }));
      throw new Error(err.error || 'Failed to generate ZIP archive');
    }

    const disposition = res.headers.get('content-disposition');
    let filename = `project-${targetId}.zip`;
    if (disposition && disposition.includes('filename=')) {
      const match = disposition.match(/filename="?([^"]+)"?/);
      if (match && match[1]) filename = match[1];
    }

    const blob = await res.blob();
    const blobUrl = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(blobUrl);

    addConsoleLogEntry('build', `[EXPORT] Downloaded ${filename} (${(blob.size / 1024).toFixed(1)} KB)`);
  } catch (err) {
    alert('ZIP Export Error: ' + err.message);
  }
}

// -------------------------------------------------------------
// Project Version History & Restore Controller
// -------------------------------------------------------------
async function updateProjectVersionBadge() {
  if (!appState.activeProjectId) return;
  try {
    const res = await authFetch(`/api/projects/${appState.activeProjectId}/versions`);
    const data = await res.json();
    if (data.success && data.versions) {
      if (wsVersionCountBadge) {
        wsVersionCountBadge.textContent = `v${data.versions.length}`;
      }
    }
  } catch (e) {}
}

async function openProjectHistoryModal() {
  if (!appState.activeProjectId) return;
  projectHistoryModal.classList.remove('hidden');
  toggleCreateVersionBox(false);
  await loadProjectVersions();
}

function closeProjectHistoryModal() {
  projectHistoryModal.classList.add('hidden');
}

function toggleCreateVersionBox(show) {
  if (show === undefined) {
    createVersionBox.classList.toggle('hidden');
  } else if (show) {
    createVersionBox.classList.remove('hidden');
    customVersionSummary.focus();
  } else {
    createVersionBox.classList.add('hidden');
  }
}

function openCreateVersionPrompt() {
  toggleCreateVersionBox(true);
}

async function submitManualVersion() {
  if (!appState.activeProjectId) return;
  const summary = customVersionSummary.value.trim() || 'Manual project snapshot';

  try {
    const res = await authFetch(`/api/projects/${appState.activeProjectId}/versions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ summary })
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error);

    customVersionSummary.value = '';
    toggleCreateVersionBox(false);
    await loadProjectVersions();
    addConsoleLogEntry('build', `[VERSION] Created Version #${data.version.version_number}: "${summary}"`);
  } catch (err) {
    alert('Failed to save version: ' + err.message);
  }
}

async function loadProjectVersions() {
  if (!appState.activeProjectId) return;
  projectVersionList.innerHTML = `<div class="p-6 text-center text-xs text-neutral-500"><i class="fa-solid fa-spinner fa-spin mr-1.5"></i>Loading versions...</div>`;

  try {
    const res = await authFetch(`/api/projects/${appState.activeProjectId}/versions`);
    const data = await res.json();
    if (!data.success) throw new Error(data.error);

    const versions = data.versions || [];
    if (projHistCount) projHistCount.textContent = `${versions.length} version${versions.length === 1 ? '' : 's'}`;
    if (wsVersionCountBadge) wsVersionCountBadge.textContent = `v${versions.length || 0}`;

    renderProjectVersionsList(versions);
  } catch (err) {
    projectVersionList.innerHTML = `<div class="p-4 text-center text-xs text-red-400">Failed to load versions: ${escapeHtml(err.message)}</div>`;
  }
}

function renderProjectVersionsList(versions = []) {
  if (versions.length === 0) {
    projectVersionList.innerHTML = `
      <div class="p-8 text-center text-neutral-500 space-y-2">
        <i class="fa-solid fa-clock-rotate-left text-2xl text-neutral-600"></i>
        <p class="text-xs">No version snapshots recorded yet.</p>
        <p class="text-[11px] text-neutral-400">Click "Save Version" above or generate code with AI to create your first version snapshot.</p>
      </div>
    `;
    return;
  }

  projectVersionList.innerHTML = versions.map(v => {
    const dateStr = new Date(v.created_at).toLocaleString();
    let badgeClass = 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20';
    let sourceLabel = 'Manual';
    if (v.source === 'ai_generation') {
      badgeClass = 'bg-purple-500/10 text-purple-400 border border-purple-500/20';
      sourceLabel = 'AI Gen';
    } else if (v.source === 'ai_chat') {
      badgeClass = 'bg-blue-500/10 text-blue-400 border border-blue-500/20';
      sourceLabel = 'AI Chat';
    } else if (v.source === 'ai_repair') {
      badgeClass = 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20';
      sourceLabel = 'AI Fix';
    } else if (v.source === 'pre_restore') {
      badgeClass = 'bg-amber-500/10 text-amber-400 border border-amber-500/20';
      sourceLabel = 'Backup';
    }

    const gitTag = v.git_commit_hash 
      ? `<span class="px-1.5 py-0.5 rounded bg-black/40 border border-white/5 font-mono text-[9px] text-neutral-400 flex items-center gap-1"><i class="fa-brands fa-git-alt text-amber-400"></i>${v.git_commit_hash.substring(0, 7)}</span>`
      : '';

    return `
      <div class="p-3.5 hover:bg-white/5 transition flex items-start justify-between gap-3 text-xs">
        <div class="space-y-1.5 flex-1 min-w-0">
          <div class="flex items-center gap-2 flex-wrap">
            <span class="px-2 py-0.5 rounded-full font-mono font-bold text-xs bg-white/10 text-white">v${v.version_number}</span>
            <span class="px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider ${badgeClass}">${sourceLabel}</span>
            ${gitTag}
            <span class="text-[11px] text-neutral-400 font-mono">${dateStr}</span>
          </div>
          <div class="font-medium text-white text-xs truncate leading-snug">${escapeHtml(v.summary)}</div>
          <div class="flex items-center gap-3 text-[10px] text-neutral-400 font-mono">
            <span><i class="fa-regular fa-file-code mr-1 text-cyan-400"></i>${v.file_count} file(s)</span>
            <span><i class="fa-solid fa-hard-drive mr-1 text-neutral-400"></i>${(v.total_bytes / 1024).toFixed(1)} KB</span>
          </div>
        </div>
        <div class="flex items-center gap-2 shrink-0">
          <button 
            onclick="handleRestoreProjectVersion('${v.id}', ${v.version_number})" 
            class="px-2.5 py-1.5 rounded-lg bg-cyan-600/20 hover:bg-cyan-600/40 text-cyan-300 border border-cyan-500/30 font-semibold text-xs flex items-center gap-1.5 transition"
            title="Restore project to this version"
          >
            <i class="fa-solid fa-rotate-left text-[10px]"></i>
            <span>Restore</span>
          </button>
        </div>
      </div>
    `;
  }).join('');
}

async function handleRestoreProjectVersion(versionId, versionNumber) {
  if (!confirm(`Restore project to Version #${versionNumber}?\n\nBuildAI will create a pre-restore safety checkpoint of your current files before reverting.`)) {
    return;
  }

  try {
    const res = await authFetch(`/api/projects/${appState.activeProjectId}/versions/${versionId}/restore`, {
      method: 'POST'
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error);

    alert(`Success: ${data.message}\n${data.result.restoredFilesCount} files restored.`);
    closeProjectHistoryModal();

    // Reload workspace files and update editor
    await openWorkspace(appState.activeProjectId);
    addConsoleLogEntry('build', `[RESTORE] Successfully restored project to Version #${versionNumber} (${data.result.restoredFilesCount} files).`);
  } catch (err) {
    alert('Restore failed: ' + err.message);
  }
}

function setPreviewViewport(mode) {
  appState.viewport = mode;
  const deskBtn = document.getElementById('vpDeskBtn');
  const tabBtn = document.getElementById('vpTabBtn');
  const mobBtn = document.getElementById('vpMobBtn');

  deskBtn.className = 'p-1 px-2 rounded font-semibold text-neutral-400 hover:text-white transition';
  tabBtn.className = 'p-1 px-2 rounded font-semibold text-neutral-400 hover:text-white transition';
  mobBtn.className = 'p-1 px-2 rounded font-semibold text-neutral-400 hover:text-white transition';

  if (mode === 'desktop') {
    deskBtn.className = 'p-1 px-2 rounded font-semibold bg-white/15 text-white';
    wsPreviewIframe.style.width = '100%';
    wsPreviewIframe.style.height = '100%';
    wsPreviewIframe.style.borderRadius = '0px';
  } else if (mode === 'tablet') {
    tabBtn.className = 'p-1 px-2 rounded font-semibold bg-white/15 text-white';
    wsPreviewIframe.style.width = '768px';
    wsPreviewIframe.style.height = '100%';
    wsPreviewIframe.style.borderRadius = '16px';
  } else if (mode === 'mobile') {
    mobBtn.className = 'p-1 px-2 rounded font-semibold bg-white/15 text-white';
    wsPreviewIframe.style.width = '375px';
    wsPreviewIframe.style.height = '667px';
    wsPreviewIframe.style.borderRadius = '24px';
  }
}

// -------------------------------------------------------------
// Console & Runtime Logs View
// -------------------------------------------------------------
function switchWorkspaceRightTab(tab) {
  appState.rightTab = tab;

  // Reset tab button styles
  tabPreviewBtn.className = 'px-2.5 py-1 rounded font-semibold text-neutral-400 hover:text-white flex items-center gap-1.5 transition';
  tabConsoleBtn.className = 'px-2.5 py-1 rounded font-semibold text-neutral-400 hover:text-white flex items-center gap-1.5 transition';
  if (tabDebuggerBtn) tabDebuggerBtn.className = 'px-2.5 py-1 rounded font-semibold text-neutral-400 hover:text-white flex items-center gap-1.5 transition relative';

  // Hide all right sub-views and toolbar controls
  previewFrameContainer.classList.add('hidden');
  runtimeConsoleContainer.classList.add('hidden');
  if (runtimeDebuggerContainer) runtimeDebuggerContainer.classList.add('hidden');
  previewViewportControls.classList.add('hidden');
  consoleActionControls.classList.add('hidden');
  if (debuggerActionControls) debuggerActionControls.classList.add('hidden');

  if (tab === 'preview') {
    tabPreviewBtn.className = 'px-2.5 py-1 rounded font-semibold bg-white/15 text-white flex items-center gap-1.5 transition';
    previewFrameContainer.classList.remove('hidden');
    previewViewportControls.classList.remove('hidden');
  } else if (tab === 'console') {
    tabConsoleBtn.className = 'px-2.5 py-1 rounded font-semibold bg-white/15 text-white flex items-center gap-1.5 transition';
    runtimeConsoleContainer.classList.remove('hidden');
    consoleActionControls.classList.remove('hidden');
    fetchRuntimeLogs();
  } else if (tab === 'debugger') {
    if (tabDebuggerBtn) tabDebuggerBtn.className = 'px-2.5 py-1 rounded font-semibold bg-white/15 text-amber-300 flex items-center gap-1.5 transition relative';
    if (runtimeDebuggerContainer) runtimeDebuggerContainer.classList.remove('hidden');
    if (debuggerActionControls) debuggerActionControls.classList.remove('hidden');
    fetchDiagnostics();
    loadCheckpointsList();
  }
}

// -------------------------------------------------------------
// AI Debugging & Automatic Repair Agent Handlers
// -------------------------------------------------------------
function openDebuggerWithActiveError() {
  switchWorkspaceRightTab('debugger');
  fetchDiagnostics();
}

async function fetchDiagnostics() {
  if (!appState.activeProjectId) return;
  try {
    const res = await authFetch(`/api/projects/${appState.activeProjectId}/diagnostics`);
    const data = await res.json();
    if (data.success && data.diagnostics) {
      const diags = data.diagnostics || [];
      if (diags.length > 0) {
        appState.activeDiagnostic = diags[0];
        dbgErrorTypeBadge.textContent = diags[0].type.toUpperCase();
        dbgFileContext.textContent = diags[0].file_path ? `${diags[0].file_path}${diags[0].line_number ? ':' + diags[0].line_number : ''}` : 'Runtime Context';
        dbgErrorMessage.textContent = diags[0].message;
        dbgErrorTime.textContent = new Date(diags[0].created_at).toLocaleTimeString();
        if (diagAlertPill) diagAlertPill.classList.remove('hidden');
        if (btnTriggerDiagnosis) btnTriggerDiagnosis.disabled = false;
      } else {
        appState.activeDiagnostic = null;
        dbgErrorTypeBadge.textContent = 'SYSTEM_HEALTHY';
        dbgFileContext.textContent = 'All modules operational';
        dbgErrorMessage.textContent = 'No active errors or diagnostics recorded. The runtime environment is running cleanly.';
        dbgErrorTime.textContent = 'Telemetry verified';
        if (diagAlertPill) diagAlertPill.classList.add('hidden');
        if (btnTriggerDiagnosis) btnTriggerDiagnosis.disabled = true;
      }
    }
  } catch (err) {
    console.error('Failed to fetch diagnostics:', err);
  }
}

async function triggerAIDiagnosis() {
  if (!appState.activeProjectId) return;
  if (!appState.aiStatus.configured) {
    alert('AI Provider is not configured. Please add GEMINI_API_KEY (recommended free tier from https://aistudio.google.com) to your .env file to enable automated AI debugging.');
    return;
  }

  dbgAnalyzingIndicator.classList.remove('hidden');
  dbgProposalCard.classList.add('hidden');
  dbgRetestBanner.classList.add('hidden');
  btnTriggerDiagnosis.disabled = true;

  try {
    const res = await authFetch(`/api/projects/${appState.activeProjectId}/debug/diagnose`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ diagnosticId: appState.activeDiagnostic?.id })
    });

    if (res.status === 429) {
      const errData = await res.json().catch(() => ({}));
      alert(`Daily Quota Exceeded: ${errData.message || 'You have reached your daily repair quota.'}`);
      await fetchUserQuota();
      openPlanUpgradeModal();
      return;
    }

    const data = await res.json();

    if (!data.success) {
      alert(`Diagnosis Error: ${data.error}`);
      return;
    }

    fetchUserQuota();

    appState.activeProposal = data.proposal;

    // Populate Proposal Card
    dbgDiagnosisText.textContent = data.proposal.diagnosis;
    dbgRootCauseText.textContent = data.proposal.rootCause;
    dbgReasoningText.textContent = data.proposal.reasoning;
    dbgAttemptsBadge.textContent = `Attempts: ${data.proposal.attemptNumber}/${data.proposal.maxAttempts}`;
    
    renderDiffViewer(data.proposal.changes);
    dbgProposalCard.classList.remove('hidden');

  } catch (err) {
    alert(`Diagnosis Failed: ${err.message}`);
  } finally {
    dbgAnalyzingIndicator.classList.add('hidden');
    btnTriggerDiagnosis.disabled = false;
  }
}

function setDiffMode(mode) {
  appState.diffMode = mode;
  const btnSplit = document.getElementById('btnDiffSplit');
  const btnUnified = document.getElementById('btnDiffUnified');

  if (btnSplit) {
    btnSplit.className = mode === 'split' 
      ? 'px-2 py-0.5 rounded text-white bg-white/10 transition flex items-center gap-1 font-bold'
      : 'px-2 py-0.5 rounded text-neutral-400 hover:text-white transition flex items-center gap-1';
  }
  if (btnUnified) {
    btnUnified.className = mode === 'unified' 
      ? 'px-2 py-0.5 rounded text-white bg-white/10 transition flex items-center gap-1 font-bold'
      : 'px-2 py-0.5 rounded text-neutral-400 hover:text-white transition flex items-center gap-1';
  }

  if (appState.activeProposal && appState.activeProposal.changes) {
    renderDiffViewer(appState.activeProposal.changes);
  }
}

function renderDiffViewer(changes = []) {
  if (!dbgDiffViewer) return;
  if (!changes || changes.length === 0) {
    dbgDiffViewer.innerHTML = `<div class="p-4 text-center text-neutral-500 italic">No file changes in proposal.</div>`;
    return;
  }

  let totalAdded = 0;
  let totalRemoved = 0;
  let fullDiffHtml = '';

  changes.forEach(c => {
    const linesAdded = c.linesAdded != null ? c.linesAdded : (c.diff ? (c.diff.match(/^\+[^+]/gm) || []).length : 0);
    const linesRemoved = c.linesRemoved != null ? c.linesRemoved : (c.diff ? (c.diff.match(/^-[^-]/gm) || []).length : 0);
    totalAdded += linesAdded;
    totalRemoved += linesRemoved;

    if (appState.diffMode === 'split') {
      // Split (Side-by-Side) Diff View
      const oldLines = (c.oldContent || '').split('\n');
      const newLines = (c.newContent || '').split('\n');
      const maxLines = Math.max(oldLines.length, newLines.length);

      let rowsHtml = '';
      for (let i = 0; i < maxLines; i++) {
        const oldL = oldLines[i];
        const newL = newLines[i];

        let oldClass = 'text-neutral-400';
        let newClass = 'text-neutral-400';

        if (oldL !== undefined && newL !== undefined) {
          if (oldL !== newL) {
            oldClass = 'diff-line-del';
            newClass = 'diff-line-add';
          }
        } else if (oldL !== undefined) {
          oldClass = 'diff-line-del';
        } else if (newL !== undefined) {
          newClass = 'diff-line-add';
        }

        const oldNum = oldL !== undefined ? i + 1 : '';
        const newNum = newL !== undefined ? i + 1 : '';
        const oldText = oldL !== undefined ? escapeHtml(oldL) : '';
        const newText = newL !== undefined ? escapeHtml(newL) : '';

        rowsHtml += `
          <div class="grid grid-cols-2 divide-x divide-white/10 text-[10.5px] leading-5 font-mono">
            <div class="flex items-start ${oldClass} px-2 py-0.5 overflow-hidden">
              <span class="w-7 shrink-0 text-[10px] text-neutral-600 select-none text-right pr-2">${oldNum}</span>
              <span class="whitespace-pre overflow-x-auto">${oldText}</span>
            </div>
            <div class="flex items-start ${newClass} px-2 py-0.5 overflow-hidden">
              <span class="w-7 shrink-0 text-[10px] text-neutral-600 select-none text-right pr-2">${newNum}</span>
              <span class="whitespace-pre overflow-x-auto">${newText}</span>
            </div>
          </div>
        `;
      }

      fullDiffHtml += `
        <div class="border-b border-white/10 last:border-b-0">
          <div class="p-2 bg-[#0d0e12] border-b border-white/10 flex items-center justify-between text-xs">
            <div class="flex items-center gap-2">
              <i class="fa-regular fa-file-code text-cyan-400 text-xs"></i>
              <span class="font-bold text-white font-mono">${escapeHtml(c.path)}</span>
            </div>
            <div class="flex items-center gap-2 text-[10px] font-mono">
              <span class="text-emerald-400 font-semibold">+${linesAdded}</span>
              <span class="text-rose-400 font-semibold">-${linesRemoved}</span>
            </div>
          </div>
          <div class="grid grid-cols-2 divide-x divide-white/10 bg-[#090a0d] border-b border-white/10 text-[10px] font-bold uppercase tracking-wider text-neutral-500 py-1 px-3">
            <div class="flex items-center gap-1.5 text-rose-300">
              <i class="fa-solid fa-minus text-[8px]"></i>
              <span>Original (Current)</span>
            </div>
            <div class="flex items-center gap-1.5 text-emerald-300 pl-2">
              <i class="fa-solid fa-plus text-[8px]"></i>
              <span>Proposed Fix</span>
            </div>
          </div>
          <div class="overflow-y-auto max-h-56 divide-y divide-white/5">
            ${rowsHtml}
          </div>
        </div>
      `;
    } else {
      // Unified Diff View
      fullDiffHtml += `
        <div class="border-b border-white/10 last:border-b-0">
          <div class="p-2 bg-[#0d0e12] border-b border-white/10 flex items-center justify-between text-xs">
            <div class="flex items-center gap-2">
              <i class="fa-regular fa-file-code text-cyan-400 text-xs"></i>
              <span class="font-bold text-white font-mono">${escapeHtml(c.path)}</span>
            </div>
            <div class="flex items-center gap-2 text-[10px] font-mono">
              <span class="text-emerald-400 font-semibold">+${linesAdded}</span>
              <span class="text-rose-400 font-semibold">-${linesRemoved}</span>
            </div>
          </div>
          <div class="p-3 bg-[#08090b] overflow-x-auto max-h-56 leading-relaxed">
      `;

      const lines = (c.diff || '').split('\n');
      lines.forEach(line => {
        let lineClass = 'diff-line-ctx';
        if (line.startsWith('+') && !line.startsWith('+++')) {
          lineClass = 'diff-line-add px-1 rounded my-0.5';
        } else if (line.startsWith('-') && !line.startsWith('---')) {
          lineClass = 'diff-line-del px-1 rounded my-0.5';
        } else if (line.startsWith('@@')) {
          lineClass = 'diff-line-hunk px-1 rounded my-1';
        } else if (line.startsWith('---') || line.startsWith('+++')) {
          lineClass = 'text-cyan-400 font-bold';
        }
        fullDiffHtml += `<div class="${lineClass} whitespace-pre">${escapeHtml(line)}</div>`;
      });

      fullDiffHtml += `
          </div>
        </div>
      `;
    }
  });

  if (dbgDiffSummary) {
    dbgDiffSummary.textContent = `+${totalAdded} / -${totalRemoved} lines across ${changes.length} file(s)`;
  }
  dbgDiffViewer.innerHTML = fullDiffHtml;
}

async function handleApplyRepair() {
  if (!appState.activeProposal || !appState.activeProjectId) return;
  btnApplyRepair.disabled = true;
  btnApplyRepair.innerHTML = `<i class="fa-solid fa-spinner fa-spin text-[10px]"></i><span>Applying & Retesting...</span>`;

  try {
    const res = await authFetch(`/api/projects/${appState.activeProjectId}/debug/apply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ proposalId: appState.activeProposal.id })
    });
    const data = await res.json();

    if (!data.success) {
      alert(`Failed to apply repair: ${data.error}`);
      return;
    }

    // Refresh files in local state
    const projRes = await authFetch(`/api/projects/${appState.activeProjectId}`);
    const projData = await projRes.json();
    if (projData.success) {
      appState.activeFiles = projData.files || [];
      renderExplorerList();
      renderFileTabs();
      if (appState.activeFilePath) {
        selectFile(appState.activeFilePath);
      }
    }

    // Show Retest Banner
    dbgRetestBanner.classList.remove('hidden');
    if (data.retestStatus === 'passed') {
      dbgRetestBanner.className = 'p-3.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 space-y-1';
      dbgRetestBanner.innerHTML = `
        <div class="flex items-center gap-2 font-bold text-xs">
          <i class="fa-solid fa-circle-check text-emerald-400"></i>
          <span>Auto-Repair Passed Retest!</span>
        </div>
        <p class="text-[11px] text-emerald-200/80 leading-relaxed">
          The proposed fix was safely applied. Compilation and sandbox health check passed cleanly.
        </p>
      `;
      dbgProposalCard.classList.add('hidden');
      if (diagAlertPill) diagAlertPill.classList.add('hidden');
      setRuntimeUIState('running');
    } else {
      dbgRetestBanner.className = 'p-3.5 rounded-xl border border-red-500/30 bg-red-500/10 text-red-300 space-y-1';
      dbgRetestBanner.innerHTML = `
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2 font-bold text-xs">
            <i class="fa-solid fa-triangle-exclamation text-red-400"></i>
            <span>Retest Failed</span>
          </div>
          <button onclick="handleRollbackCheckpoint('${data.checkpointId}')" class="px-2.5 py-1 rounded bg-red-500/20 hover:bg-red-500/30 text-white font-bold text-[10px] border border-red-500/30 transition">
            Undo (Rollback)
          </button>
        </div>
        <p class="text-[11px] text-red-200/80 leading-relaxed">
          ${escapeHtml(data.retestMessage || 'Application still failed health verification.')}
        </p>
      `;
    }

    loadCheckpointsList();

  } catch (err) {
    alert(`Repair Application Failed: ${err.message}`);
  } finally {
    btnApplyRepair.disabled = false;
    btnApplyRepair.innerHTML = `<i class="fa-solid fa-check text-[11px]"></i><span>Apply Fix & Retest</span>`;
  }
}

async function handleRejectProposal() {
  if (!appState.activeProposal || !appState.activeProjectId) return;
  try {
    await authFetch(`/api/projects/${appState.activeProjectId}/debug/reject`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ proposalId: appState.activeProposal.id })
    });
    dbgProposalCard.classList.add('hidden');
    appState.activeProposal = null;
  } catch (err) {
    console.error('Error rejecting proposal:', err);
  }
}

async function loadCheckpointsList() {
  if (!appState.activeProjectId) return;
  try {
    const res = await authFetch(`/api/projects/${appState.activeProjectId}/checkpoints`);
    const data = await res.json();
    if (data.success && data.checkpoints) {
      if (data.checkpoints.length === 0) {
        dbgCheckpointsList.innerHTML = `<span class="text-neutral-500 italic text-[11px]">No checkpoints recorded yet. Created automatically before any auto-repair fix.</span>`;
        return;
      }
      dbgCheckpointsList.innerHTML = data.checkpoints.slice(0, 5).map(ckpt => {
        const time = new Date(ckpt.created_at).toLocaleTimeString();
        return `
          <div class="p-2 rounded-lg bg-[#0c0d10] border border-white/5 flex items-center justify-between text-xs">
            <div class="truncate mr-2">
              <div class="font-mono text-[10px] text-cyan-300 truncate">${escapeHtml(ckpt.description)}</div>
              <div class="text-[9px] text-neutral-500 font-mono">${time}</div>
            </div>
            <button onclick="handleRollbackCheckpoint('${ckpt.id}')" class="px-2.5 py-1 rounded bg-white/10 hover:bg-white/20 text-white font-semibold text-[10px] transition shrink-0">
              Rollback
            </button>
          </div>
        `;
      }).join('');
    }
  } catch (err) {
    console.error('Failed to load checkpoints:', err);
  }
}

async function handleRollbackCheckpoint(checkpointId) {
  if (!checkpointId || !appState.activeProjectId) return;
  if (!confirm('Roll back project to this checkpoint? All files will be restored to this exact previous state.')) return;

  try {
    const res = await authFetch(`/api/projects/${appState.activeProjectId}/debug/rollback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ checkpointId })
    });
    const data = await res.json();

    if (!data.success) {
      alert(`Rollback failed: ${data.error}`);
      return;
    }

    alert(data.message);

    // Refresh files
    const projRes = await authFetch(`/api/projects/${appState.activeProjectId}`);
    const projData = await projRes.json();
    if (projData.success) {
      appState.activeFiles = projData.files || [];
      renderExplorerList();
      renderFileTabs();
      if (appState.activeFilePath) {
        selectFile(appState.activeFilePath);
      }
    }

    dbgRetestBanner.classList.add('hidden');
    dbgProposalCard.classList.add('hidden');
    reloadPreviewIframe();
    fetchDiagnostics();
    loadCheckpointsList();

  } catch (err) {
    alert(`Rollback failed: ${err.message}`);
  }
}


function addConsoleLogEntry(level, message) {
  const time = new Date().toLocaleTimeString();
  let color = 'text-neutral-300';
  if (level === 'error') color = 'text-red-400 font-semibold';
  else if (level === 'warn') color = 'text-amber-400';
  else if (level === 'build') color = 'text-cyan-400';
  else if (level === 'info') color = 'text-emerald-400';

  const row = document.createElement('div');
  row.className = `font-mono text-[11px] leading-relaxed flex items-start gap-2 ${color}`;
  row.innerHTML = `<span class="text-neutral-600 select-none">${time}</span><span>${escapeHtml(message)}</span>`;

  if (wsConsoleLogs.querySelector('.italic')) {
    wsConsoleLogs.innerHTML = '';
  }
  wsConsoleLogs.appendChild(row);
  wsConsoleLogs.scrollTop = wsConsoleLogs.scrollHeight;

  appState.logs.push({ level, message, time });
  if (logCountPill) {
    logCountPill.textContent = appState.logs.length;
  }
}

async function fetchRuntimeLogs() {
  if (!appState.activeProjectId) return;
  try {
    const res = await authFetch(`/api/projects/${appState.activeProjectId}/preview/logs`);
    const data = await res.json();
    if (data.success && data.logs) {
      wsConsoleLogs.innerHTML = '';
      if (data.logs.length === 0) {
        wsConsoleLogs.innerHTML = `<div class="text-neutral-500 italic">No logs recorded yet.</div>`;
      } else {
        data.logs.forEach(l => {
          addConsoleLogEntry(l.level, l.message);
        });
      }
    }
  } catch (err) {
    console.error('Failed to fetch logs:', err);
  }
}

async function clearRuntimeLogs() {
  if (!appState.activeProjectId) return;
  try {
    await authFetch(`/api/projects/${appState.activeProjectId}/preview/logs`, { method: 'DELETE' });
    wsConsoleLogs.innerHTML = `<div class="text-neutral-500 italic">Logs cleared.</div>`;
    appState.logs = [];
    if (logCountPill) logCountPill.textContent = '0';
  } catch (err) {
    console.error('Failed to clear logs:', err);
  }
}

// -------------------------------------------------------------
// New File Creation & Version History Modals
// -------------------------------------------------------------
function openNewFileModal() {
  modalFilePathInput.value = '';
  filePathValidationError.classList.add('hidden');
  newFileModal.classList.remove('hidden');
  setTimeout(() => modalFilePathInput.focus(), 50);
}

function closeNewFileModal() {
  newFileModal.classList.add('hidden');
}

async function handleConfirmCreateFile() {
  const filePath = modalFilePathInput.value.trim();
  if (!filePath) {
    showFileValidationError('Filename cannot be empty');
    return;
  }

  // Pre-validate extension
  const validExtensions = ['.html', '.htm', '.css', '.js', '.jsx', '.json', '.md', '.svg'];
  const ext = filePath.slice(filePath.lastIndexOf('.')).toLowerCase();
  if (!validExtensions.includes(ext)) {
    showFileValidationError(`Disallowed extension "${ext}". Allowed: ${validExtensions.join(', ')}`);
    return;
  }

  try {
    const defaultContent = filePath.endsWith('.html') 
      ? '<!DOCTYPE html>\n<html>\n<head><title>New Page</title></head>\n<body>\n  <h1>New Page</h1>\n</body>\n</html>' 
      : filePath.endsWith('.css') 
      ? '/* Custom Styles */\n' 
      : '/* Script Logic */\n';

    const res = await authFetch(`/api/projects/${appState.activeProjectId}/files`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: filePath, content: defaultContent })
    });
    const data = await res.json();
    if (!data.success) {
      showFileValidationError(data.error);
      return;
    }

    closeNewFileModal();
    appState.activeFiles.push(data.file);
    updateFileCountBadge();
    renderExplorerList();
    renderFileTabs();
    selectFile(filePath);

  } catch (err) {
    showFileValidationError(err.message);
  }
}

function showFileValidationError(msg) {
  filePathValidationError.textContent = msg;
  filePathValidationError.classList.remove('hidden');
}

async function deleteFile(filePath, event) {
  if (event) event.stopPropagation();
  if (!confirm(`Delete file "${filePath}"?`)) return;

  try {
    const res = await authFetch(`/api/projects/${appState.activeProjectId}/files?path=${encodeURIComponent(filePath)}`, {
      method: 'DELETE'
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error);

    appState.activeFiles = appState.activeFiles.filter(f => f.path !== filePath);
    updateFileCountBadge();

    if (appState.activeFilePath === filePath) {
      const nextFile = appState.activeFiles[0];
      selectFile(nextFile ? nextFile.path : null);
    } else {
      renderExplorerList();
      renderFileTabs();
    }

    reloadPreviewIframe();
  } catch (err) {
    alert('Failed to delete file: ' + err.message);
  }
}

// Version History Revert
async function openVersionHistoryModal() {
  if (!appState.activeFilePath || !appState.activeProjectId) return;
  versionModalFilePath.textContent = appState.activeFilePath;
  versionHistoryList.innerHTML = `<div class="p-4 text-center text-xs text-neutral-500">Loading version snapshots...</div>`;
  versionHistoryModal.classList.remove('hidden');

  try {
    const res = await authFetch(`/api/projects/${appState.activeProjectId}/files/versions?path=${encodeURIComponent(appState.activeFilePath)}`);
    const data = await res.json();
    if (!data.success) throw new Error(data.error);

    const versions = data.versions || [];
    if (versions.length === 0) {
      versionHistoryList.innerHTML = `<div class="p-6 text-center text-xs text-neutral-500">No prior snapshots recorded yet. Versions are created automatically when you save changes.</div>`;
      return;
    }

    versionHistoryList.innerHTML = versions.map(v => {
      const date = new Date(v.created_at).toLocaleString();
      return `
        <div class="p-3 flex items-center justify-between text-xs hover:bg-white/5 transition">
          <div>
            <div class="font-bold text-white flex items-center gap-2">
              <span>Version ${v.version_number}</span>
              <span class="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white/10 text-cyan-300">${(v.byte_size / 1024).toFixed(1)} KB</span>
            </div>
            <div class="text-[10px] text-neutral-400 mt-0.5">${date}</div>
          </div>
          <button onclick="revertFileVersion('${v.id}')" class="px-3 py-1 rounded-lg bg-cyan-600/30 hover:bg-cyan-600 text-cyan-200 hover:text-white font-semibold text-xs transition border border-cyan-500/30">
            Revert
          </button>
        </div>
      `;
    }).join('');

  } catch (err) {
    versionHistoryList.innerHTML = `<div class="p-4 text-center text-xs text-red-400">${err.message}</div>`;
  }
}

function closeVersionHistoryModal() {
  versionHistoryModal.classList.add('hidden');
}

async function revertFileVersion(versionId) {
  if (!confirm('Revert file to this previous snapshot? Unsaved changes will be replaced.')) return;

  try {
    const res = await authFetch(`/api/projects/${appState.activeProjectId}/files/revert`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: appState.activeFilePath, versionId })
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error);

    closeVersionHistoryModal();
    // Update local state
    const current = appState.activeFiles.find(f => f.path === appState.activeFilePath);
    if (current) current.content = data.file.content;

    setEditorContent(data.file.content);
    setUnsavedStatus(false);
    reloadPreviewIframe();
    addConsoleLogEntry('build', `[VERSION] Reverted ${appState.activeFilePath} to snapshot.`);

  } catch (err) {
    alert('Failed to revert version: ' + err.message);
  }
}

// -------------------------------------------------------------
// Real AI Streaming Generation
// -------------------------------------------------------------
async function triggerInitialAiGeneration(prompt) {
  wsGeneratingOverlay.classList.remove('hidden');
  wsGeneratingTitle.textContent = 'Generating Application...';
  wsGeneratingDetails.textContent = 'Synthesizing source files via streaming SSE';

  try {
    const res = await authFetch(`/api/projects/${appState.activeProjectId}/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt })
    });

    if (res.status === 429) {
      const errData = await res.json().catch(() => ({}));
      const msg = errData.message || 'Daily generation quota exceeded.';
      appendChatMessage({ role: 'system', content: `⚠️ ${msg}` });
      await fetchUserQuota();
      openPlanUpgradeModal();
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n\n');
      buffer = lines.pop();

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const payload = JSON.parse(line.slice(6));

          if (payload.type === 'status') {
            wsGeneratingDetails.textContent = payload.message;
          } else if (payload.type === 'done') {
            appState.activeFiles = payload.files || [];
            updateFileCountBadge();
            renderExplorerList();
            renderFileTabs();
            selectFile('index.html');
            handleStartRuntime();
            appendChatMessage({ role: 'assistant', content: payload.summary });
            fetchUserQuota();
          } else if (payload.type === 'error') {
            appendChatMessage({ role: 'system', content: `⚠️ ${payload.message || payload.error}` });
          }
        }
      }
    }
  } catch (err) {
    appendChatMessage({ role: 'system', content: `⚠️ Generation error: ${err.message}` });
  } finally {
    wsGeneratingOverlay.classList.add('hidden');
  }
}

async function handleSendChatMessage(e) {
  if (e) e.preventDefault();
  const text = wsChatInput.value.trim();
  if (!text || !appState.activeProjectId) return;

  wsChatInput.value = '';
  wsSendBtn.disabled = true;

  appendChatMessage({ role: 'user', content: text });

  try {
    const res = await authFetch(`/api/projects/${appState.activeProjectId}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: text })
    });

    if (res.status === 429) {
      const errData = await res.json().catch(() => ({}));
      const msg = errData.message || 'Daily chat update limit exceeded.';
      appendChatMessage({ role: 'system', content: `⚠️ ${msg}` });
      await fetchUserQuota();
      openPlanUpgradeModal();
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n\n');
      buffer = lines.pop();

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const payload = JSON.parse(line.slice(6));

          if (payload.type === 'done') {
            appState.activeFiles = payload.allFiles || [];
            updateFileCountBadge();
            renderExplorerList();
            renderFileTabs();
            if (appState.activeFilePath) selectFile(appState.activeFilePath);
            reloadPreviewIframe();
            appendChatMessage({ role: 'assistant', content: payload.summary });
            fetchUserQuota();
          } else if (payload.type === 'error') {
            appendChatMessage({ role: 'system', content: `⚠️ ${payload.message || payload.error}` });
          }
        }
      }
    }
  } catch (err) {
    appendChatMessage({ role: 'system', content: `⚠️ ${err.message}` });
  } finally {
    wsSendBtn.disabled = false;
  }
}

function renderChatMessages(messages) {
  wsChatMessages.innerHTML = '';
  if (messages.length === 0) {
    wsChatMessages.innerHTML = `
      <div class="text-center text-neutral-500 py-6 space-y-1">
        <i class="fa-regular fa-comment-dots text-lg"></i>
        <p class="text-[11px]">No chat history.<br/>Ask the AI to modify or enhance your app.</p>
      </div>
    `;
    return;
  }
  messages.forEach(appendChatMessage);
}

function appendChatMessage(msg) {
  const isUser = msg.role === 'user';
  const isSystem = msg.role === 'system';

  const div = document.createElement('div');
  div.className = isUser ? 'flex justify-end' : 'flex justify-start';

  let bubbleClass = 'bg-[#14151a] border border-white/10 text-neutral-200 rounded-2xl p-3 max-w-[90%] leading-relaxed text-xs shadow-md';
  if (isSystem) {
    bubbleClass = 'bg-amber-500/10 border border-amber-500/20 text-amber-200 rounded-xl p-2.5 max-w-[95%] text-[11px] leading-relaxed';
  } else if (isUser) {
    bubbleClass = 'bg-cyan-600 text-white font-medium rounded-2xl p-2.5 max-w-[85%] text-xs shadow-md';
  }

  div.innerHTML = `<div class="${bubbleClass}">${escapeHtml(msg.content)}</div>`;
  wsChatMessages.appendChild(div);
  wsChatMessages.scrollTop = wsChatMessages.scrollHeight;
}

// -------------------------------------------------------------
// New Project Handlers
// -------------------------------------------------------------
function openNewProjectModal() {
  modalProjectName.value = '';
  modalProjectPrompt.value = '';
  newProjectModal.classList.remove('hidden');
  setTimeout(() => modalProjectName.focus(), 50);
}

function closeNewProjectModal() {
  newProjectModal.classList.add('hidden');
}

async function handleCreateProjectFromModal() {
  const name = modalProjectName.value.trim();
  const prompt = modalProjectPrompt.value.trim();

  if (!name) {
    showToast('Project Name Required', 'Please provide a name for your new project.', 'warning', 3000);
    return;
  }

  closeNewProjectModal();
  await createProject(name, prompt);
}

async function handleCreateFromHero() {
  const name = heroProjectName.value.trim() || 'My New App';
  const prompt = heroPromptInput.value.trim();

  if (!prompt) {
    showToast('Description Required', 'Please enter an app description in the prompt box.', 'warning', 3000);
    return;
  }

  createAndBuildBtn.disabled = true;
  await createProject(name, prompt);
  createAndBuildBtn.disabled = false;
}

async function createProject(name, prompt) {
  try {
    const res = await authFetch('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, prompt })
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error);

    showToast('Project Created', `Opening workspace for ${data.project.name}...`, 'success', 2000);
    // Open workspace immediately
    openWorkspace(data.project.id, true);

  } catch (err) {
    showToast('Creation Failed', err.message, 'error', 5000);
  }
}

async function deleteProject(projectId, event) {
  if (event) event.stopPropagation();
  if (!confirm('Are you sure you want to delete this project and all its files?')) return;

  try {
    const res = await authFetch(`/api/projects/${projectId}`, { method: 'DELETE' });
    const data = await res.json();
    if (!data.success) throw new Error(data.error);

    if (appState.activeProjectId === projectId) {
      exitWorkspaceToDashboard();
    } else {
      loadProjects();
    }
  } catch (err) {
    alert('Failed to delete project: ' + err.message);
  }
}

// -------------------------------------------------------------
// Utility Helpers
// -------------------------------------------------------------
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// -------------------------------------------------------------
// Authentication Modal & Controller
// -------------------------------------------------------------
const authModal = document.getElementById('authModal');
const authTabLogin = document.getElementById('authTabLogin');
const authTabRegister = document.getElementById('authTabRegister');
const authTabMigrate = document.getElementById('authTabMigrate');
const authLoginForm = document.getElementById('authLoginForm');
const authRegisterForm = document.getElementById('authRegisterForm');
const authMigrateForm = document.getElementById('authMigrateForm');
const authErrorBanner = document.getElementById('authErrorBanner');
const authErrorMessage = document.getElementById('authErrorMessage');
const authModalTitle = document.getElementById('authModalTitle');
const authModalSub = document.getElementById('authModalSub');

function showAuthError(msg) {
  if (authErrorBanner && authErrorMessage) {
    authErrorMessage.textContent = msg;
    authErrorBanner.classList.remove('hidden');
  }
}

function clearAuthError() {
  if (authErrorBanner) {
    authErrorBanner.classList.add('hidden');
  }
}

function openAuthModal(tab = 'login') {
  if (!authModal) return;
  clearAuthError();
  authModal.classList.remove('hidden');

  if (appState.currentUser && appState.currentUser.needs_password_migration) {
    if (authTabMigrate) authTabMigrate.classList.remove('hidden');
  } else {
    if (authTabMigrate) authTabMigrate.classList.add('hidden');
  }

  switchAuthTab(tab);
}

function closeAuthModal() {
  if (authModal) authModal.classList.add('hidden');
  clearAuthError();
}

function switchAuthTab(tab) {
  clearAuthError();

  const isLogin = tab === 'login';
  const isRegister = tab === 'register';
  const isMigrate = tab === 'migrate';

  if (authLoginForm) authLoginForm.classList.toggle('hidden', !isLogin);
  if (authRegisterForm) authRegisterForm.classList.toggle('hidden', !isRegister);
  if (authMigrateForm) authMigrateForm.classList.toggle('hidden', !isMigrate);

  if (authTabLogin) {
    authTabLogin.className = isLogin 
      ? 'flex-1 pb-2 border-b-2 border-cyan-400 text-white font-bold transition'
      : 'flex-1 pb-2 border-b-2 border-transparent text-neutral-400 hover:text-white font-medium transition';
  }
  if (authTabRegister) {
    authTabRegister.className = isRegister 
      ? 'flex-1 pb-2 border-b-2 border-cyan-400 text-white font-bold transition'
      : 'flex-1 pb-2 border-b-2 border-transparent text-neutral-400 hover:text-white font-medium transition';
  }
  if (authTabMigrate) {
    authTabMigrate.className = isMigrate 
      ? 'flex-1 pb-2 border-b-2 border-amber-400 text-amber-300 font-bold transition'
      : 'flex-1 pb-2 border-b-2 border-transparent text-amber-400 hover:text-amber-300 font-medium transition';
  }

  if (authModalTitle && authModalSub) {
    if (isMigrate) {
      authModalTitle.textContent = 'Initialize Account Password';
      authModalSub.textContent = 'Hash and secure your account with Argon2id';
    } else if (isRegister) {
      authModalTitle.textContent = 'Create New Account';
      authModalSub.textContent = 'Register to build and own private applications';
    } else {
      authModalTitle.textContent = 'Account Authentication';
      authModalSub.textContent = 'Secure Argon2id Authentication';
    }
  }
}

async function handleLoginSubmit(e) {
  e.preventDefault();
  clearAuthError();

  const identifier = document.getElementById('loginIdentifier')?.value?.trim();
  const password = document.getElementById('loginPassword')?.value;
  const btn = document.getElementById('btnLoginSubmit');

  if (!identifier || !password) {
    showAuthError('Please enter your username/email and password.');
    return;
  }

  if (btn) btn.disabled = true;

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ identifier, password })
    });
    const data = await res.json();

    if (!res.ok || !data.success) {
      if (data.needs_password_migration) {
        showAuthError(data.error);
        if (authTabMigrate) authTabMigrate.classList.remove('hidden');
        switchAuthTab('migrate');
        return;
      }
      throw new Error(data.error || 'Login failed.');
    }

    appState.currentUser = data.user;
    appState.authToken = data.token;
    localStorage.setItem('buildai_auth_token', data.token);

    if (userAccountLabel) userAccountLabel.textContent = data.user.username;
    closeAuthModal();
    await loadProjects();
    await fetchUserQuota();
  } catch (err) {
    showAuthError(err.message);
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function handleRegisterSubmit(e) {
  e.preventDefault();
  clearAuthError();

  const username = document.getElementById('regUsername')?.value?.trim();
  const email = document.getElementById('regEmail')?.value?.trim();
  const password = document.getElementById('regPassword')?.value;
  const btn = document.getElementById('btnRegSubmit');

  if (!username || !password) {
    showAuthError('Username and password are required.');
    return;
  }

  if (btn) btn.disabled = true;

  try {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ username, email: email || null, password })
    });
    const data = await res.json();

    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Registration failed.');
    }

    appState.currentUser = data.user;
    appState.authToken = data.token;
    localStorage.setItem('buildai_auth_token', data.token);

    if (userAccountLabel) userAccountLabel.textContent = data.user.username;
    closeAuthModal();
    await loadProjects();
    await fetchUserQuota();
  } catch (err) {
    showAuthError(err.message);
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function handleMigrateSubmit(e) {
  e.preventDefault();
  clearAuthError();

  const password = document.getElementById('migratePassword')?.value;
  const confirmPassword = document.getElementById('migrateConfirmPassword')?.value;
  const btn = document.getElementById('btnMigrateSubmit');

  if (!password || !confirmPassword) {
    showAuthError('Please fill in both password fields.');
    return;
  }
  if (password !== confirmPassword) {
    showAuthError('Passwords do not match.');
    return;
  }

  if (btn) btn.disabled = true;

  try {
    const res = await authFetch('/api/auth/migrate-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password })
    });
    const data = await res.json();

    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Password setup failed.');
    }

    appState.currentUser = data.user;
    appState.authToken = data.token;
    localStorage.setItem('buildai_auth_token', data.token);

    const migrationBadge = document.getElementById('migrationAlertBadge');
    if (migrationBadge) migrationBadge.classList.add('hidden');

    alert('Password initialized successfully with Argon2id!');
    closeAuthModal();
  } catch (err) {
    showAuthError(err.message);
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function handleLogout() {
  if (!confirm('Are you sure you want to log out?')) return;
  try {
    await authFetch('/api/auth/logout', { method: 'POST' });
  } catch (e) {
    // Ignore network error on logout
  }

  appState.currentUser = null;
  appState.authToken = null;
  localStorage.removeItem('buildai_auth_token');

  if (userAccountLabel) userAccountLabel.textContent = 'Sign In';
  if (appState.currentView === 'workspace') {
    exitWorkspaceToDashboard();
  }
  openAuthModal('login');
}

// -------------------------------------------------------------
// User Plan Tiers, Quota & Token Metering Controller
// -------------------------------------------------------------
const sidebarQuotaWidget = document.getElementById('sidebarQuotaWidget');
const userPlanBadge = document.getElementById('userPlanBadge');
const btnUpgradePlan = document.getElementById('btnUpgradePlan');
const planActionText = document.getElementById('planActionText');
const quotaGenerationsText = document.getElementById('quotaGenerationsText');
const quotaGenerationsBar = document.getElementById('quotaGenerationsBar');
const quotaTokensText = document.getElementById('quotaTokensText');
const quotaResetText = document.getElementById('quotaResetText');
const wsQuotaPill = document.getElementById('wsQuotaPill');

const planUpgradeModal = document.getElementById('planUpgradeModal');
const modalCurrentTierBadge = document.getElementById('modalCurrentTierBadge');
const mStatsGenerations = document.getElementById('mStatsGenerations');
const mStatsGenerationsRem = document.getElementById('mStatsGenerationsRem');
const mStatsEdits = document.getElementById('mStatsEdits');
const mStatsEditsRem = document.getElementById('mStatsEditsRem');
const mStatsRepairs = document.getElementById('mStatsRepairs');
const mStatsRepairsRem = document.getElementById('mStatsRepairsRem');
const mStatsTokens = document.getElementById('mStatsTokens');
const mStatsResetTime = document.getElementById('mStatsResetTime');
const badgeFreeActive = document.getElementById('badgeFreeActive');
const badgeProActive = document.getElementById('badgeProActive');
const btnSwitchFree = document.getElementById('btnSwitchFree');
const btnSwitchPro = document.getElementById('btnSwitchPro');
const usageLogsDrawer = document.getElementById('usageLogsDrawer');
const usageLogsCount = document.getElementById('usageLogsCount');
const usageLogsChevron = document.getElementById('usageLogsChevron');

async function fetchUserQuota() {
  if (!appState.currentUser) return;
  try {
    const res = await authFetch('/api/user/quota');
    if (!res.ok) return;
    const data = await res.json();
    if (data.success && data.quota) {
      appState.userQuota = data.quota;
      renderQuotaUI(data.quota);
    }
  } catch (err) {
    console.warn('Failed to fetch quota telemetry:', err.message);
  }
}

function renderQuotaUI(quota) {
  if (!quota) return;

  const isPro = (quota.tier || '').toLowerCase() === 'pro';
  
  // Sidebar plan badge
  if (userPlanBadge) {
    userPlanBadge.textContent = isPro ? 'PRO DEVELOPER' : 'FREE PLAN';
    userPlanBadge.className = isPro
      ? 'px-2 py-0.5 rounded-full font-bold text-[9px] tracking-wide uppercase bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
      : 'px-2 py-0.5 rounded-full font-bold text-[9px] tracking-wide uppercase bg-amber-500/20 text-amber-300 border border-amber-500/30';
  }

  // Sidebar action button text
  if (planActionText) {
    planActionText.textContent = isPro ? 'Manage' : 'Upgrade';
  }

  // Sidebar generations progress
  const usedGen = quota.todayUsage.generationsToday || 0;
  const limitGen = quota.limits.dailyGenerations || 5;
  const remGen = quota.remaining.generations;
  const genPct = quota.percentages.generationUsage || 0;

  if (quotaGenerationsText) {
    quotaGenerationsText.textContent = `${usedGen} / ${limitGen}`;
  }

  if (quotaGenerationsBar) {
    quotaGenerationsBar.style.width = `${Math.min(100, genPct)}%`;
    if (genPct >= 100) {
      quotaGenerationsBar.className = 'h-full bg-red-400 rounded-full transition-all duration-300';
    } else if (genPct >= 80) {
      quotaGenerationsBar.className = 'h-full bg-amber-400 rounded-full transition-all duration-300';
    } else {
      quotaGenerationsBar.className = 'h-full bg-cyan-400 rounded-full transition-all duration-300';
    }
  }

  // Sidebar token budget & reset countdown
  const usedTokens = quota.todayUsage.totalTokens || 0;
  const budgetTokens = quota.limits.dailyTokenBudget || 100000;
  const hoursLeft = Math.ceil((quota.resetsInSeconds || 0) / 3600);

  if (quotaTokensText) {
    const formattedUsed = usedTokens >= 1000 ? `${(usedTokens / 1000).toFixed(0)}k` : `${usedTokens}`;
    const formattedBudget = `${(budgetTokens / 1000).toFixed(0)}k`;
    quotaTokensText.textContent = `${formattedUsed} / ${formattedBudget} tok`;
  }

  if (quotaResetText) {
    quotaResetText.innerHTML = `<i class="fa-regular fa-clock mr-1"></i>${hoursLeft}h reset`;
  }

  // Workspace AI header pill
  if (wsQuotaPill) {
    wsQuotaPill.textContent = `${remGen}/${limitGen} left`;
    if (remGen <= 0) {
      wsQuotaPill.className = 'text-[9px] font-mono px-2 py-0.5 rounded-full bg-red-500/20 text-red-300 border border-red-500/40 hover:bg-red-500/30 transition cursor-pointer font-bold';
    } else if (remGen <= 1) {
      wsQuotaPill.className = 'text-[9px] font-mono px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 hover:bg-amber-500/30 transition cursor-pointer';
    } else {
      wsQuotaPill.className = 'text-[9px] font-mono px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-300 border border-cyan-500/30 hover:bg-cyan-500/20 transition cursor-pointer';
    }
  }

  // Modal telemetry updates
  if (modalCurrentTierBadge) {
    modalCurrentTierBadge.textContent = quota.tierName;
    modalCurrentTierBadge.className = isPro
      ? 'px-2 py-0.5 rounded-full text-[10px] uppercase font-bold tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
      : 'px-2 py-0.5 rounded-full text-[10px] uppercase font-bold tracking-wider bg-amber-500/20 text-amber-300 border border-amber-500/30';
  }

  if (mStatsGenerations) mStatsGenerations.textContent = `${usedGen} / ${limitGen}`;
  if (mStatsGenerationsRem) mStatsGenerationsRem.textContent = `${remGen} remaining`;

  if (mStatsEdits) mStatsEdits.textContent = `${quota.todayUsage.editsToday} / ${quota.limits.dailyEdits}`;
  if (mStatsEditsRem) mStatsEditsRem.textContent = `${quota.remaining.edits} remaining`;

  if (mStatsRepairs) mStatsRepairs.textContent = `${quota.todayUsage.repairsToday} / ${quota.limits.dailyRepairs}`;
  if (mStatsRepairsRem) mStatsRepairsRem.textContent = `${quota.remaining.repairs} remaining`;

  if (mStatsTokens) mStatsTokens.textContent = `${usedTokens.toLocaleString()} / ${(budgetTokens / 1000).toFixed(0)}k`;
  if (mStatsResetTime) mStatsResetTime.innerHTML = `<i class="fa-regular fa-clock mr-1"></i>Resets in ${hoursLeft}h (00:00 UTC)`;

  if (badgeFreeActive) badgeFreeActive.classList.toggle('hidden', isPro);
  if (badgeProActive) badgeProActive.classList.toggle('hidden', !isPro);

  if (btnSwitchFree) {
    btnSwitchFree.disabled = !isPro;
    btnSwitchFree.textContent = !isPro ? 'Current Plan' : 'Downgrade to Free';
    btnSwitchFree.className = !isPro
      ? 'w-full py-2 rounded-xl text-xs font-bold transition border border-white/5 bg-white/5 text-neutral-500 cursor-not-allowed'
      : 'w-full py-2 rounded-xl text-xs font-bold transition border border-white/10 bg-white/5 text-neutral-300 hover:text-white hover:bg-white/10';
  }

  if (btnSwitchPro) {
    btnSwitchPro.disabled = isPro;
    btnSwitchPro.innerHTML = isPro
      ? '<span>Active Plan</span>'
      : '<i class="fa-solid fa-bolt text-[11px]"></i><span>Upgrade to Pro Developer</span>';
    btnSwitchPro.className = isPro
      ? 'w-full py-2 rounded-xl text-xs font-bold transition border border-white/5 bg-white/5 text-neutral-500 cursor-not-allowed flex items-center justify-center gap-1.5'
      : 'w-full py-2 rounded-xl text-xs font-bold transition bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-black shadow-md flex items-center justify-center gap-1.5 cursor-pointer';
  }
}

async function openPlanUpgradeModal() {
  await fetchUserQuota();
  if (planUpgradeModal) {
    planUpgradeModal.classList.remove('hidden');
  }
}

function closePlanUpgradeModal() {
  if (planUpgradeModal) {
    planUpgradeModal.classList.add('hidden');
  }
}

async function handleSwitchPlan(targetTier) {
  try {
    const res = await authFetch('/api/user/plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan_tier: targetTier })
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error);

    appState.userQuota = data.quota;
    renderQuotaUI(data.quota);
    alert(data.message || `Switched plan to ${targetTier.toUpperCase()}!`);
  } catch (err) {
    alert('Plan switch failed: ' + err.message);
  }
}

let isUsageLogsDrawerOpen = false;
async function toggleUsageLogsDrawer() {
  isUsageLogsDrawerOpen = !isUsageLogsDrawerOpen;
  if (usageLogsDrawer) {
    usageLogsDrawer.classList.toggle('hidden', !isUsageLogsDrawerOpen);
  }
  if (usageLogsChevron) {
    usageLogsChevron.style.transform = isUsageLogsDrawerOpen ? 'rotate(180deg)' : 'rotate(0deg)';
  }
  if (isUsageLogsDrawerOpen) {
    await fetchUsageLogs();
  }
}

async function fetchUsageLogs() {
  if (!usageLogsDrawer) return;
  usageLogsDrawer.innerHTML = `<div class="p-2 text-center text-neutral-500">Loading usage history...</div>`;
  try {
    const res = await authFetch('/api/user/usage/logs');
    const data = await res.json();
    if (!data.success) throw new Error(data.error);

    const logs = data.logs || [];
    if (usageLogsCount) usageLogsCount.textContent = `${logs.length} requests`;

    if (logs.length === 0) {
      usageLogsDrawer.innerHTML = `<div class="p-3 text-center text-neutral-500">No AI usage recorded yet today.</div>`;
      return;
    }

    usageLogsDrawer.innerHTML = logs.map(l => {
      const date = new Date(l.created_at).toLocaleTimeString();
      let opBadge = 'bg-cyan-500/20 text-cyan-300';
      if (l.operation === 'chat_edit') opBadge = 'bg-emerald-500/20 text-emerald-300';
      if (l.operation === 'diagnose_repair') opBadge = 'bg-purple-500/20 text-purple-300';

      return `
        <div class="py-1.5 flex items-center justify-between text-[10px]">
          <div class="flex items-center gap-2">
            <span class="text-neutral-500 font-mono">${date}</span>
            <span class="px-1.5 py-0.2 rounded uppercase font-bold text-[8px] ${opBadge}">${escapeHtml(l.operation)}</span>
            <span class="text-neutral-300 truncate max-w-[120px]">${escapeHtml(l.model || 'gemini')}</span>
          </div>
          <div class="flex items-center gap-2 text-neutral-400 font-mono">
            <span>in: ${l.prompt_tokens}</span>
            <span>out: ${l.completion_tokens}</span>
            <span class="text-white font-bold">${l.total_tokens} tok</span>
          </div>
        </div>
      `;
    }).join('');
  } catch (err) {
    usageLogsDrawer.innerHTML = `<div class="p-2 text-center text-red-400">${escapeHtml(err.message)}</div>`;
  }
}

// -------------------------------------------------------------
// Modern Toast Notification Engine
// -------------------------------------------------------------
function showToast(title, message = '', type = 'info', duration = 3500) {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const id = `toast_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  
  let icon = 'fa-circle-info';
  let border = 'border-cyan-500/30';
  let iconColor = 'text-cyan-400';
  let titleColor = 'text-white';
  let bg = 'bg-[#14151a]';

  if (type === 'success') {
    icon = 'fa-circle-check';
    border = 'border-emerald-500/30';
    iconColor = 'text-emerald-400';
  } else if (type === 'error') {
    icon = 'fa-circle-exclamation';
    border = 'border-rose-500/30';
    iconColor = 'text-rose-400';
  } else if (type === 'warning') {
    icon = 'fa-triangle-exclamation';
    border = 'border-amber-500/30';
    iconColor = 'text-amber-400';
  }

  const toast = document.createElement('div');
  toast.id = id;
  toast.className = `pointer-events-auto p-3.5 rounded-xl border ${border} ${bg} shadow-2xl flex items-start justify-between gap-3 text-xs toast-enter transition-all duration-200 select-none`;
  toast.innerHTML = `
    <div class="flex items-start gap-2.5">
      <i class="fa-solid ${icon} ${iconColor} text-sm mt-0.5 shrink-0"></i>
      <div>
        <div class="font-bold ${titleColor} text-xs">${escapeHtml(title)}</div>
        ${message ? `<div class="text-[11px] text-neutral-300 mt-0.5 leading-snug">${escapeHtml(message)}</div>` : ''}
      </div>
    </div>
    <button onclick="dismissToast('${id}')" class="text-neutral-500 hover:text-white p-0.5 shrink-0 transition" title="Dismiss">
      <i class="fa-solid fa-xmark text-[11px]"></i>
    </button>
  `;

  container.appendChild(toast);

  if (duration > 0) {
    setTimeout(() => {
      dismissToast(id);
    }, duration);
  }
  return id;
}

function dismissToast(id) {
  const toast = document.getElementById(id);
  if (!toast) return;
  toast.classList.remove('toast-enter');
  toast.classList.add('toast-exit');
  setTimeout(() => {
    if (toast.parentNode) toast.parentNode.removeChild(toast);
  }, 200);
}

// -------------------------------------------------------------
// Starter Templates Gallery Controller
// -------------------------------------------------------------
async function loadTemplates() {
  const grid = document.getElementById('starterTemplatesGrid');
  if (!grid) return;

  try {
    const res = await fetch('/api/templates');
    const data = await res.json();
    if (!data.success) throw new Error(data.error);

    appState.starterTemplates = data.templates || [];
    renderStarterTemplates(appState.starterTemplates);
  } catch (err) {
    console.warn('Failed to load starter templates:', err.message);
    if (grid) {
      grid.innerHTML = `<div class="col-span-full p-4 text-center text-xs text-red-400">Failed to load starter templates: ${escapeHtml(err.message)}</div>`;
    }
  }
}

function renderStarterTemplates(templates) {
  const grid = document.getElementById('starterTemplatesGrid');
  if (!grid) return;

  if (templates.length === 0) {
    grid.innerHTML = `<div class="col-span-full p-6 text-center text-xs text-neutral-500">No starter templates available.</div>`;
    return;
  }

  const badgeColorMap = {
    cyan: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
    purple: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
    emerald: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
    amber: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
    blue: 'bg-blue-500/20 text-blue-300 border-blue-500/30'
  };

  grid.innerHTML = templates.map(t => {
    const badgeStyle = badgeColorMap[t.badgeColor] || badgeColorMap.cyan;
    return `
      <div class="group bg-[#14151a] border border-white/10 hover:border-white/20 rounded-2xl p-4 transition-all duration-200 flex flex-col justify-between hover:shadow-xl hover:-translate-y-0.5">
        <div>
          <div class="flex items-center justify-between mb-3">
            <div class="flex items-center gap-2.5">
              <div class="w-8 h-8 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-cyan-400 group-hover:bg-cyan-500/10 group-hover:border-cyan-500/30 transition text-sm">
                <i class="fa-solid ${t.icon || 'fa-cubes'}"></i>
              </div>
              <div>
                <span class="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">${escapeHtml(t.category)}</span>
                <h3 class="font-bold text-sm text-white group-hover:text-cyan-300 transition truncate">${escapeHtml(t.name)}</h3>
              </div>
            </div>
            ${t.badge ? `<span class="text-[9px] font-bold px-2 py-0.5 rounded-full border ${badgeStyle}">${escapeHtml(t.badge)}</span>` : ''}
          </div>

          <p class="text-xs text-neutral-400 line-clamp-2 leading-relaxed mb-3">${escapeHtml(t.description)}</p>

          <div class="flex flex-wrap gap-1 mb-3">
            ${(t.tags || []).map(tag => `<span class="text-[9px] px-2 py-0.5 rounded-md bg-white/5 text-neutral-400 border border-white/5">${escapeHtml(tag)}</span>`).join('')}
          </div>
        </div>

        <div class="pt-3 border-t border-white/5 flex items-center justify-between">
          <span class="text-[11px] font-mono text-neutral-400 flex items-center gap-1.5">
            <i class="fa-regular fa-folder-closed text-cyan-400 text-[10px]"></i>
            <span>${t.fileCount} files</span>
          </span>
          <button 
            onclick="handleLaunchTemplate('${t.id}')" 
            class="px-3.5 py-1.5 rounded-xl bg-white hover:bg-neutral-200 text-black font-bold text-xs transition flex items-center gap-1.5 shadow-md active:scale-95"
          >
            <i class="fa-solid fa-play text-[9px] text-cyan-600"></i>
            <span>Launch App</span>
          </button>
        </div>
      </div>
    `;
  }).join('');
}

async function handleLaunchTemplate(templateId) {
  try {
    showToast('Initializing Project', 'Synthesizing template files and creating version snapshot...', 'info', 2000);
    const res = await authFetch('/api/projects/template', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ templateId })
    });

    const data = await res.json();
    if (!data.success) throw new Error(data.error);

    showToast('Project Created', `Successfully created ${data.project.name}`, 'success', 3000);
    await loadProjects();
    openWorkspace(data.project.id);
  } catch (err) {
    showToast('Launch Error', err.message, 'error', 5000);
  }
}

// -------------------------------------------------------------
// Share & Deploy Modal Controller
// -------------------------------------------------------------
function openShareDeployModal() {
  if (!appState.activeProjectId) return;
  const modal = document.getElementById('shareDeployModal');
  if (!modal) return;

  const project = appState.activeProject;
  const badge = document.getElementById('shareModalProjectBadge');
  if (badge) badge.textContent = (project?.name || 'Project').substring(0, 24);

  const previewUrl = `${window.location.origin}/api/projects/${appState.activeProjectId}/bundle`;
  const urlInput = document.getElementById('sharePreviewUrlInput');
  if (urlInput) urlInput.value = previewUrl;

  const embedSnippet = `<iframe 
  src="${previewUrl}" 
  width="100%" 
  height="600" 
  frameborder="0" 
  sandbox="allow-scripts allow-forms"
  allow="clipboard-write"
  title="${escapeHtml(project?.name || 'BuildAI Application')}"
></iframe>`;

  const snippetEl = document.getElementById('shareEmbedSnippet');
  if (snippetEl) snippetEl.textContent = embedSnippet;

  switchShareTab('embed');
  modal.classList.remove('hidden');
}

function closeShareDeployModal() {
  const modal = document.getElementById('shareDeployModal');
  if (modal) modal.classList.add('hidden');
}

function switchShareTab(tab) {
  const paneEmbed = document.getElementById('paneShareEmbed');
  const paneDeploy = document.getElementById('paneShareDeploy');
  const paneExport = document.getElementById('paneShareExport');

  const btnEmbed = document.getElementById('btnTabShareEmbed');
  const btnDeploy = document.getElementById('btnTabShareDeploy');
  const btnExport = document.getElementById('btnTabShareExport');

  if (paneEmbed) paneEmbed.classList.toggle('hidden', tab !== 'embed');
  if (paneDeploy) paneDeploy.classList.toggle('hidden', tab !== 'deploy');
  if (paneExport) paneExport.classList.toggle('hidden', tab !== 'export');

  if (btnEmbed) {
    btnEmbed.className = tab === 'embed'
      ? 'px-3 py-1.5 rounded-lg bg-white/10 text-white flex items-center gap-1.5 transition'
      : 'px-3 py-1.5 rounded-lg text-neutral-400 hover:text-white flex items-center gap-1.5 transition';
  }
  if (btnDeploy) {
    btnDeploy.className = tab === 'deploy'
      ? 'px-3 py-1.5 rounded-lg bg-white/10 text-white flex items-center gap-1.5 transition'
      : 'px-3 py-1.5 rounded-lg text-neutral-400 hover:text-white flex items-center gap-1.5 transition';
  }
  if (btnExport) {
    btnExport.className = tab === 'export'
      ? 'px-3 py-1.5 rounded-lg bg-white/10 text-white flex items-center gap-1.5 transition'
      : 'px-3 py-1.5 rounded-lg text-neutral-400 hover:text-white flex items-center gap-1.5 transition';
  }
}

async function copyShareUrl() {
  const input = document.getElementById('sharePreviewUrlInput');
  if (!input) return;
  try {
    await navigator.clipboard.writeText(input.value);
    showToast('URL Copied', 'Live preview URL copied to clipboard', 'success', 2500);
    const btnText = document.getElementById('copyUrlBtnText');
    if (btnText) {
      btnText.textContent = 'Copied!';
      setTimeout(() => { btnText.textContent = 'Copy'; }, 2000);
    }
  } catch (e) {
    input.select();
    document.execCommand('copy');
    showToast('URL Copied', 'Live preview URL copied to clipboard', 'success', 2500);
  }
}

async function copyEmbedSnippet() {
  const snippetEl = document.getElementById('shareEmbedSnippet');
  if (!snippetEl) return;
  try {
    await navigator.clipboard.writeText(snippetEl.textContent);
    showToast('Embed Code Copied', 'HTML iframe snippet copied to clipboard', 'success', 2500);
    const btnText = document.getElementById('copySnippetBtnText');
    if (btnText) {
      btnText.textContent = 'Copied!';
      setTimeout(() => { btnText.textContent = 'Copy Embed Code'; }, 2000);
    }
  } catch (e) {
    showToast('Copy Failed', 'Please manually select and copy the embed snippet', 'warning', 3000);
  }
}

async function copyCommand(cmd) {
  try {
    await navigator.clipboard.writeText(cmd);
    showToast('Command Copied', `Copied "${cmd}" to clipboard`, 'success', 2000);
  } catch (e) {
    showToast('Command', cmd, 'info', 3000);
  }
}

// -------------------------------------------------------------
// Keyboard Shortcuts Modal & Helpers
// -------------------------------------------------------------
function openShortcutsModal() {
  const modal = document.getElementById('shortcutsModal');
  if (modal) modal.classList.remove('hidden');
}

function closeShortcutsModal() {
  const modal = document.getElementById('shortcutsModal');
  if (modal) modal.classList.add('hidden');
}

function toggleShortcutsModal() {
  const modal = document.getElementById('shortcutsModal');
  if (modal) {
    if (modal.classList.contains('hidden')) {
      openShortcutsModal();
    } else {
      closeShortcutsModal();
    }
  }
}

function closeAllModals() {
  closeShortcutsModal();
  closeShareDeployModal();
  closeProjectHistoryModal();
  closeVersionHistoryModal();
  closeNewProjectModal();
  closeNewFileModal();
  closeAuthModal();
  if (typeof closePlanUpgradeModal === 'function') closePlanUpgradeModal();
}

// Run Initialization on DOM load
window.addEventListener('DOMContentLoaded', init);
