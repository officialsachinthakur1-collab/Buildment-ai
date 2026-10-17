// server/versioning/versionService.js — Full-Stack Project Versioning & Restore Service
const { ProjectVersionModel, FileModel, ProjectModel, RepairAuditModel } = require('../db');
const gitAdapter = require('./gitAdapter');
const RuntimeManager = require('../runtime/runtimeManager');

class VersionService {
  /**
   * Captures a meaningful project version snapshot in SQLite and Git (if available).
   * Never claims success unless persistence succeeds.
   */
  createVersion(projectId, { userId = null, user = {}, summary = 'Manual project snapshot', source = 'manual' } = {}) {
    const project = ProjectModel.getById(projectId);
    if (!project) {
      throw new Error(`Project not found: ${projectId}`);
    }

    const currentFiles = FileModel.getByProject(projectId);
    if (!currentFiles || currentFiles.length === 0) {
      throw new Error('Cannot commit version: Project has no files.');
    }

    // 1. Commit to Git repository if git is available
    let gitCommitHash = null;
    if (gitAdapter.isAvailable()) {
      const gitResult = gitAdapter.commitProjectFiles(
        projectId,
        currentFiles,
        summary,
        user.username ? user : { username: 'BuildAI User', email: 'developer@buildai.local' }
      );
      if (gitResult.success) {
        gitCommitHash = gitResult.commitHash;
      }
    }

    // 2. Persist version snapshot in SQLite database
    const version = ProjectVersionModel.create(projectId, {
      userId,
      summary,
      source,
      git_commit_hash: gitCommitHash
    });

    // 3. Log to audit trail
    RepairAuditModel.log(projectId, {
      action: 'version_created',
      user_id: userId,
      details: `Version #${version.version_number} (${version.id}) created [${source}]: "${summary}". ${currentFiles.length} files, ${gitCommitHash ? 'Git: ' + gitCommitHash.slice(0, 7) : 'Git: N/A'}.`
    });

    return version;
  }

  /**
   * Retrieves all versions for a project with metadata.
   */
  getVersions(projectId) {
    const project = ProjectModel.getById(projectId);
    if (!project) {
      throw new Error(`Project not found: ${projectId}`);
    }
    return ProjectVersionModel.getByProject(projectId);
  }

  /**
   * Retrieves single version with full file contents.
   */
  getVersionById(versionId) {
    const version = ProjectVersionModel.getById(versionId);
    if (!version) {
      throw new Error(`Version not found: ${versionId}`);
    }
    return version;
  }

  /**
   * Restores a project to a prior version atomically with safety checkpoints.
   */
  async restoreVersion(projectId, versionId, { userId = null, user = {} } = {}) {
    const version = ProjectVersionModel.getById(versionId);
    if (!version) {
      throw new Error(`Version not found: ${versionId}`);
    }

    if (version.project_id !== projectId) {
      throw new Error('Version does not belong to the specified project.');
    }

    // 1. Restore SQLite files atomically
    const restoreResult = ProjectVersionModel.restore(versionId, userId);

    // 2. Mirror restore in Git working tree if available
    let gitCommitHash = null;
    if (gitAdapter.isAvailable()) {
      const currentFiles = FileModel.getByProject(projectId);
      const gitResult = gitAdapter.commitProjectFiles(
        projectId,
        currentFiles,
        `Restored to Version #${version.version_number} (${version.id})`,
        user.username ? user : { username: 'BuildAI User', email: 'developer@buildai.local' }
      );
      if (gitResult.success) {
        gitCommitHash = gitResult.commitHash;
      }
    }

    // 3. Log audit event
    RepairAuditModel.log(projectId, {
      action: 'version_restored',
      user_id: userId,
      details: `Restored project to Version #${version.version_number} (${version.id}). ${restoreResult.restoredFilesCount} files restored. Safety checkpoint: ${restoreResult.preRestoreCheckpointId}.`
    });

    // 4. If preview session was running, trigger a restart so the preview reflects the restored state
    const currentStatus = RuntimeManager.getStatus(projectId);
    if (currentStatus.status === 'running' || currentStatus.status === 'failed') {
      try {
        await RuntimeManager.restart(projectId);
      } catch (e) {
        console.warn(`[VersionService] Failed to auto-restart runtime after restore for ${projectId}:`, e.message);
      }
    }

    return {
      success: true,
      restoredVersionId: version.id,
      versionNumber: version.version_number,
      summary: version.summary,
      restoredFilesCount: restoreResult.restoredFilesCount,
      preRestoreCheckpointId: restoreResult.preRestoreCheckpointId,
      gitCommitHash
    };
  }
}

module.exports = new VersionService();
