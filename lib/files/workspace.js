/**
 * Workspace Management
 * Multi-workspace support and workspace operations
 */

import fs from 'fs';
import path from 'path';
import os from 'os';

const WORKSPACES_DIR = path.join(os.homedir(), '.static-rebel', 'workspaces');

/**
 * List all available workspaces
 */
function listWorkspaces() {
  try {
    if (!fs.existsSync(WORKSPACES_DIR)) return [];
    return fs.readdirSync(WORKSPACES_DIR).filter((w) => {
      const full = path.join(WORKSPACES_DIR, w);
      return fs.statSync(full).isDirectory();
    });
  } catch (e) {
    return [];
  }
}

/**
 * Get full path for workspace
 */
function getWorkspacePath(name) {
  if (name.startsWith('/') || name.startsWith('~')) {
    return path.resolve(name.replace('~', os.homedir()));
  }
  return path.join(WORKSPACES_DIR, name);
}

/**
 * Create a new workspace
 */
function createWorkspace(name) {
  try {
    const workspacePath = getWorkspacePath(name);
    if (!fs.existsSync(workspacePath)) {
      fs.mkdirSync(workspacePath, { recursive: true });
      return { success: true, path: workspacePath };
    } else {
      return { success: false, error: 'Workspace already exists' };
    }
  } catch (e) {
    return { success: false, error: e.message };
  }
}

/**
 * Delete workspace
 */
function deleteWorkspace(name) {
  try {
    const workspacePath = getWorkspacePath(name);
    if (fs.existsSync(workspacePath)) {
      fs.rmSync(workspacePath, { recursive: true, force: true });
      return { success: true };
    } else {
      return { success: false, error: 'Workspace does not exist' };
    }
  } catch (e) {
    return { success: false, error: e.message };
  }
}

/**
 * Check if workspace exists
 */
function workspaceExists(name) {
  const workspacePath = getWorkspacePath(name);
  return fs.existsSync(workspacePath) && fs.statSync(workspacePath).isDirectory();
}

export {
  WORKSPACES_DIR,
  listWorkspaces,
  getWorkspacePath,
  createWorkspace,
  deleteWorkspace,
  workspaceExists,
};