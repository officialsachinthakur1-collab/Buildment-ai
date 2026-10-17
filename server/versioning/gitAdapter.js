// server/versioning/gitAdapter.js — Isolated Per-Project Git Repository Integration
const { execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const reposBaseDir = path.join(__dirname, '../../data/git_repos');

class GitAdapter {
  constructor() {
    this._gitAvailable = null;
  }

  isAvailable() {
    if (this._gitAvailable !== null) {
      return this._gitAvailable;
    }
    try {
      execFileSync('git', ['--version'], { stdio: 'pipe' });
      this._gitAvailable = true;
    } catch (e) {
      this._gitAvailable = false;
    }
    return this._gitAvailable;
  }

  getRepoDir(projectId) {
    return path.join(reposBaseDir, projectId);
  }

  initRepo(projectId, { username = 'BuildAI User', email = 'developer@buildai.local' } = {}) {
    if (!this.isAvailable()) return false;

    const repoDir = this.getRepoDir(projectId);
    if (!fs.existsSync(repoDir)) {
      fs.mkdirSync(repoDir, { recursive: true });
    }

    const gitDir = path.join(repoDir, '.git');
    if (!fs.existsSync(gitDir)) {
      try {
        execFileSync('git', ['init', '-b', 'main'], { cwd: repoDir, stdio: 'pipe' });
      } catch (e) {
        // Fallback for older git versions that do not support -b main
        execFileSync('git', ['init'], { cwd: repoDir, stdio: 'pipe' });
      }

      execFileSync('git', ['config', 'user.name', username || 'BuildAI User'], { cwd: repoDir, stdio: 'pipe' });
      execFileSync('git', ['config', 'user.email', email || 'developer@buildai.local'], { cwd: repoDir, stdio: 'pipe' });
      execFileSync('git', ['config', 'commit.gpgSign', 'false'], { cwd: repoDir, stdio: 'pipe' });
    }

    return true;
  }

  commitProjectFiles(projectId, files = [], message = 'Update project files', user = {}) {
    if (!this.isAvailable()) {
      return { success: false, commitHash: null, reason: 'Git is not installed or available on host.' };
    }

    try {
      this.initRepo(projectId, user);
      const repoDir = this.getRepoDir(projectId);

      // Clean existing non-git files
      const removeExtraFiles = (dir) => {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.name === '.git') continue;
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            removeExtraFiles(fullPath);
            try { fs.rmdirSync(fullPath); } catch (e) {}
          } else {
            const relPath = path.relative(repoDir, fullPath).replace(/\\/g, '/');
            const existsInNew = files.some(f => f.path.replace(/\\/g, '/') === relPath);
            if (!existsInNew) {
              fs.unlinkSync(fullPath);
            }
          }
        }
      };

      removeExtraFiles(repoDir);

      // Write updated files
      for (const file of files) {
        const cleanRelPath = file.path.replace(/\\/g, '/');
        const targetPath = path.join(repoDir, cleanRelPath);
        const targetDir = path.dirname(targetPath);
        if (!fs.existsSync(targetDir)) {
          fs.mkdirSync(targetDir, { recursive: true });
        }
        fs.writeFileSync(targetPath, file.content || '', 'utf8');
      }

      // Stage all changes
      execFileSync('git', ['add', '-A'], { cwd: repoDir, stdio: 'pipe' });

      // Check if there are changes to commit
      const statusOutput = execFileSync('git', ['status', '--porcelain'], { cwd: repoDir, encoding: 'utf8' }).trim();
      if (!statusOutput) {
        // Nothing changed; return existing commit hash if any
        try {
          const currentHash = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repoDir, encoding: 'utf8' }).trim();
          return { success: true, commitHash: currentHash, noChanges: true };
        } catch (e) {
          return { success: true, commitHash: null, noChanges: true };
        }
      }

      // Commit changes
      const safeMessage = message.replace(/[\r\n]+/g, ' ').slice(0, 150) || 'Version commit';
      execFileSync('git', ['commit', '-m', safeMessage], { cwd: repoDir, stdio: 'pipe' });

      // Extract new commit hash
      const commitHash = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repoDir, encoding: 'utf8' }).trim();
      return { success: true, commitHash };
    } catch (err) {
      console.warn(`[GitAdapter] Commit failed for ${projectId}:`, err.message);
      return { success: false, commitHash: null, error: err.message };
    }
  }

  getCommitLog(projectId, limit = 20) {
    if (!this.isAvailable()) return [];
    const repoDir = this.getRepoDir(projectId);
    if (!fs.existsSync(path.join(repoDir, '.git'))) return [];

    try {
      const output = execFileSync(
        'git',
        ['log', `-n${limit}`, '--pretty=format:%H|%an|%ae|%ad|%s', '--date=iso'],
        { cwd: repoDir, encoding: 'utf8' }
      );
      if (!output.trim()) return [];
      return output.trim().split('\n').map(line => {
        const [hash, authorName, authorEmail, date, subject] = line.split('|');
        return { hash, authorName, authorEmail, date, subject };
      });
    } catch (e) {
      return [];
    }
  }
}

module.exports = new GitAdapter();
