# ⚡ BuildAI — Full-Stack AI Application Builder Platform

BuildAI is a real, maintainable full-stack application builder platform inspired by **Emergent**, **v0**, and **Lovable**. It empowers users to describe applications in natural language, generate clean multi-file web applications using real AI models, edit code directly in an integrated editor or via chat iterations, and run the resulting application in a secure, isolated runtime environment.

---

## 🎯 Architecture & Execution Infrastructure

### 1. Isolated Runtime & Live Preview Session Architecture
- **Real Session Lifecycle**: Preview sessions maintain active states: `queued`, `starting`, `running`, `failed`, or `stopped`.
- **Pre-Execution Build Validation**:
  - Validates source files (enforces presence of `index.html`).
  - Enforces project storage quota (maximum 10MB total project source size).
  - Inspects file structure and logs compilation events.
- **Strict Health-Check Verification**:
  - The application is marked `running` **only after** it has successfully started and passed a health check.
  - A parent-bridge signals readiness on DOM/script initialization. If the application crashes on boot or fails to report within 8000ms, the runtime automatically marks the session as `failed` with clear error diagnostics and a **Retry** action.
- **Runtime Console & Log Streaming**:
  - Real-time logging of build steps, runtime lifecycle events, uncaught exceptions, and console output (`console.log`, `console.info`, `console.warn`, `console.error`) relayed securely from the running preview.
- **Container Infrastructure Capability**:
  - Built-in container adapter detects whether a container daemon (e.g., Docker Desktop) is installed on the host.
  - For client-side web apps, the isolated browser sandbox adapter is active.
  - For future backend container execution (Node.js servers, databases), the container adapter checks host cgroups and resource isolation. If Docker is absent, the platform cleanly explains what is required rather than faking execution.

### 2. Execution Security
- **Never Execute Untrusted Code on Host Server**: Generated code runs exclusively within an isolated browser sandbox runtime or dedicated container, never inside the main Node.js server process.
- **Restrictive Content-Security-Policy (CSP)**:
  - Blocks connection to private/internal IPs and cloud metadata services (e.g. `http://169.254.169.254`).
  - Restricts frame ancestors to prevent clickjacking.
- **Opaque Origin Sandbox**:
  - The preview iframe is sandboxed with `allow-scripts allow-forms allow-modals` (crucially **without** `allow-same-origin`).
  - Prevents untrusted user applications from accessing host `localStorage`, session cookies, or backend tokens.
- **Path Traversal & Extension Hardening**:
  - Strict validation blocks directory traversal (`../`, absolute paths, null bytes, illegal characters).
  - Enforces allowed file extensions (`.html`, `.css`, `.js`, `.json`, `.svg`, `.md`, `.txt`) and 2MB per-file size limits.

### 3. Project File Explorer & Code Editor
- **Interactive File Explorer**: Lists project files with icons, sizes, and real-time **● Unsaved edits** indicators.
- **CodeMirror 5 Syntax Highlighting**: Full-featured code editor with syntax highlighting for HTML, CSS, and JavaScript, line numbers, tab indentation, and Ctrl+S / Cmd+S save shortcuts.
- **Automatic Version Snapshots**: Saving changes automatically archives previous revisions into SQLite. Users can inspect historical versions and revert with a single click.
- **Ownership & Access Control**: Multi-tenant database schema ensures users can only read, edit, or delete their own projects. Unauthorized requests are blocked with HTTP `403 Forbidden`.

### 4. AI Debugging & Automatic Repair Agent
- **Automated Error Collection**: Captures compiler/build errors, missing entrypoints (`index.html`), runtime syntax errors, unhandled exceptions, and `console.error` events directly from the sandboxed execution environment. Stores diagnostics persistently in SQLite.
- **Root-Cause Diagnosis**: Analyzes errors and source code using configured AI models (Gemini, Claude, OpenAI) to generate structured diagnoses with root-cause explanations and minimal targeted diffs.
- **Strict No-Mocking AI Guardrail**: If AI credentials are not configured, requests fail cleanly with actionable instructions rather than fabricating fake diagnoses or mock repairs.
- **Safety Checkpoints & Rollback**: Creates an immutable snapshot checkpoint before applying any modifications. Reverts all files and deletes newly created files on rollback.
- **Visual Diff Inspection**: Computes line-by-line unified diffs with `+` insertions and `-` deletions before applying fixes.
- **Automated Retesting**: Automatically triggers a sandboxed rebuild and health-check watchdog after applying repairs. Reports success only when the application starts cleanly and passes health checks.
- **Infinite Repair Loop Protection**: Hard rate-limits automated repair attempts (maximum 3 attempts per 15 minutes per project) to prevent infinite loops and wasted tokens.
- **Audit Logging**: Persists an immutable audit log of all repair proposals, applied changes, and rollbacks.

### 5. Project Version History, Atomic Restore & Secure ZIP Export
- **Comprehensive Change Tracking**: Automatically tracks meaningful milestones across the application lifecycle: initial AI generation, AI chat iterations, approved AI repairs, and user-initiated manual commits.
- **Sequential Version Numbering**: Every project maintains an ordered sequence of versions (`v1`, `v2`, `v3`, etc.) with user attribution, change summary, file count, and byte statistics.
- **Git Repository Integration**: Automatically creates and maintains an isolated Git repository for each project (`data/git_repos/<projectId>`), records commits with user attribution, and links Git commit SHAs into SQLite records. Falls back gracefully to native SQLite versioning if Git is not present on the host.
- **Atomic Project Restore with Pre-Restore Checkpoints**: Users can inspect and restore any previous version. Before restoring, an immutable safety checkpoint and a `pre_restore` backup snapshot are captured. Restoration executes inside an atomic SQLite transaction—deleting extraneous files added in later versions and restoring exact contents without corrupting project state.
- **Secure Native ZIP Export**: Packs project files into standard PKZip-compliant `.zip` archives with zero third-party dependencies using native `node:zlib` (`deflateRawSync` and `crc32`).
- **Secrets & Internal Data Exclusion**: Automatically filters out `.env` files, credentials, secrets, SQLite database binaries, internal task logs, and system artifacts.
- **Self-Contained Run Guide**: Auto-generates a clean `README.md` inside exported archives with instructions for running locally via browser, Node.js (`npx serve .`), or Python (`python -m http.server`).

### 6. Persistent Local Database (SQLite via `node:sqlite`)
- Uses Node.js native `node:sqlite` (`DatabaseSync`), requiring zero third-party compiled C++ binaries.
- Tables: `users`, `projects`, `files`, `file_versions`, `messages`, `preview_sessions`, `diagnostics`, `checkpoints`, `repair_proposals`, `repair_audit`, `project_versions`, `sessions`, and `ai_usage_logs`.
- Stored in [`data/buildai.sqlite`](file:///c:/Users/sachi/OneDrive/Desktop/EMERGENT/data/buildai.sqlite).

### 7. User Token Quotas, Multi-Tier Plans & Cost Protection Metering
- **Runaway Cost Prevention**: Protects Google AI Studio / Gemini / Anthropic / OpenAI API quotas by enforcing strict daily limits per user.
- **Multi-Tier Plan Architecture**:
  - **Free Starter Plan**: 5 AI generations/day, 20 chat edits/day, 10 automated repairs/day, 100,000 tokens daily budget.
  - **Pro Developer Plan**: 100 AI generations/day, 500 chat edits/day, 200 automated repairs/day, 2,000,000 tokens daily budget.
- **Pre-Flight Quota Enforcement**: All `/generate`, `/chat`, and `/debug/diagnose` endpoints execute synchronous pre-flight checks before invoking AI models or opening streaming responses. Exhausted quotas return HTTP `429 Too Many Requests` with a clean `DAILY_QUOTA_EXCEEDED` error, reset countdown, and instant upgrade path.
- **Immutable Usage Auditing (`ai_usage_logs`)**: Records operation type, provider, model, prompt tokens, completion tokens, total tokens, and timestamp with sub-second SQLite indexes.
- **Dynamic Frontend Quota Widgets**:
  - Dashboard sidebar displays real-time progress bar, remaining generations, and midnight UTC countdown.
  - Workspace header displays live generation pill (`5/5 left`).
  - Interactive Plan Upgrade Modal (`#planUpgradeModal`) provides instant plan switching and live request history telemetry drawer.

---

## 📋 Prerequisites

- **Node.js**: `v22.0.0` or newer (includes native `node:sqlite`).
- **npm**: `v10+` (bundled with Node.js).
- **Web Browser**: Chrome, Edge, Firefox, or Safari.
- **Container Runtime (Optional)**: Docker Desktop (required only if running full-stack containerized backend servers; client-side web runtime runs out of the box).

---

## 🚀 Installation & Setup

### 1. Clone or Open the Workspace
```bash
cd c:\Users\sachi\OneDrive\Desktop\EMERGENT
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Configure Environment Variables
Copy the example environment configuration:
```bash
cp .env.example .env
```
*(On Windows PowerShell, use `Copy-Item .env.example .env`)*

Configure your desired AI API key in `.env`:
```env
PORT=3001
GEMINI_API_KEY=your_gemini_api_key_here
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
```
> **Tip for Beginners on a Budget**: You can get a free API key for **Google Gemini 2.0 Flash** at [Google AI Studio](https://aistudio.google.com). No credit card required.

---

## 💻 Running the Application

### Start the Server
```bash
npm start
```

### Development Mode (with hot reload)
```bash
npm run dev
```

The application will be live at:
```
http://localhost:3001
```

---

## 🧪 Running the Automated Test Suite

An automated end-to-end verification suite tests user authentication, project ownership isolation, path traversal defense, file versioning, runtime session transitions, and container capability reporting:

```bash
npm test
```

---

## 📁 Project Structure

```
EMERGENT/
├── .env.example                   # Clean template of environment variables (no secrets)
├── package.json                   # Project scripts and dependencies
├── data/
│   ├── buildai.sqlite             # Persistent SQLite database (auto-created)
│   └── git_repos/                 # Isolated per-project Git repositories
├── server/
│   ├── index.js                   # Express HTTP, SSE streaming, & REST API routes
│   ├── db.js                      # Native SQLite schema, models, & versioning
│   ├── aiService.js               # Multi-provider streaming AI & debugging client
│   ├── agent/
│   │   └── repairService.js       # AI auto-repair, diffing, checkpoints, & retest agent
│   ├── versioning/
│   │   ├── gitAdapter.js          # Isolated per-project Git commit & history manager
│   │   ├── versionService.js      # Project version snapshot & atomic restore service
│   │   └── zipExporter.js         # Zero-dependency native PKZip archive packager
│   ├── middleware/
│   │   └── auth.js                # Authentication & project ownership enforcement
│   └── runtime/
│       ├── runtimeManager.js      # Preview session lifecycle & health check manager
│       └── containerAdapter.js    # Container runtime inspection & limits interface
├── public/
│   ├── index.html                 # Dark-themed workspace UI with CodeMirror, Preview, & History
│   └── app.js                     # State controller, CodeMirror integration, & preview bridge
└── tests/
    ├── workspace.test.js          # Workspace, security, & runtime tests
    ├── repair.test.js             # AI debugging & auto-repair verification suite
    └── version_export.test.js     # Project version history, atomic restore & ZIP export tests
```

---

## 🔌 API Reference

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/status` | Returns system status, AI configuration, and container capabilities |
| `GET` | `/api/auth/session` | Retrieves authenticated user session and token |
| `POST` | `/api/auth/register` | Registers a new user identity |
| `GET` | `/api/projects` | Lists projects belonging to the authenticated user |
| `POST` | `/api/projects` | Creates a new persistent project with owner assignment |
| `GET` | `/api/projects/:id` | Returns project details, files, and runtime status (Ownership verified) |
| `POST` | `/api/projects/:id/files` | Validates and saves a file with automatic version snapshot |
| `DELETE` | `/api/projects/:id/files?path=...` | Deletes a file and cleans up version history |
| `GET` | `/api/projects/:id/files/versions?path=...` | Retrieves version history for a file |
| `POST` | `/api/projects/:id/files/revert` | Reverts file to a prior snapshot |
| `GET` | `/api/projects/:id/versions` | Lists all project-level versions (`v1`, `v2`, ...) with commit metadata |
| `POST` | `/api/projects/:id/versions` | Creates a manual version snapshot with custom change summary |
| `GET` | `/api/projects/:id/versions/:versionId` | Retrieves details and file snapshots for a specific version |
| `POST` | `/api/projects/:id/versions/:versionId/restore` | Atomically restores project to a prior version with safety checkpoint |
| `GET` | `/api/projects/:id/export/zip` | Exports actual project files as a secure ZIP archive with run guide |
| `GET` | `/api/projects/:id/preview/status` | Returns real runtime status and health metrics |
| `POST` | `/api/projects/:id/preview/start` | Starts preview session, validates files, begins health watchdog |
| `POST` | `/api/projects/:id/preview/stop` | Stops preview session |
| `POST` | `/api/projects/:id/preview/restart` | Restarts preview session with fresh build |
| `GET` | `/api/projects/:id/preview/logs` | Fetches session logs (build events, console logs, errors) |
| `DELETE` | `/api/projects/:id/preview/logs` | Clears session logs |
| `POST` | `/api/projects/:id/preview/heartbeat` | Health check heartbeat from sandboxed iframe |
| `POST` | `/api/projects/:id/preview/log` | Relays console logs from sandboxed iframe |
| `GET` | `/api/projects/:id/bundle` | Bundles and serves HTML/CSS/JS with CSP headers |
| `GET` | `/api/projects/:id/diagnostics` | Retrieves recorded build and runtime diagnostic errors |
| `POST` | `/api/projects/:id/diagnostics` | Records a diagnostic error (build failure, console error) |
| `DELETE` | `/api/projects/:id/diagnostics` | Clears resolved diagnostics for the project |
| `POST` | `/api/projects/:id/debug/diagnose` | Invokes AI debugging agent to analyze errors and generate unified diff proposal |
| `POST` | `/api/projects/:id/debug/apply` | Takes safety checkpoint, applies proposed fix, and runs health-check retest |
| `POST` | `/api/projects/:id/debug/reject` | Dismisses a repair proposal and logs audit entry |
| `POST` | `/api/projects/:id/debug/rollback` | Restores project files to a previous safety checkpoint |
| `GET` | `/api/projects/:id/checkpoints` | Lists available safety checkpoints for the project |
| `GET` | `/api/projects/:id/debug/audit` | Retrieves audit history of all repairs and rollbacks |
