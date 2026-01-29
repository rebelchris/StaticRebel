/**
 * Git Operations - Comprehensive Git integration for StaticRebel
 *
 * Features:
 * - Branch management
 * - Commit with AI-generated messages
 * - Status checking and diff viewing
 * - Stash management for safety
 * - Integration with agent reasoning
 *
 * @module gitOperations
 */

import { simpleGit } from 'simple-git';
import path from 'path';
import fs from 'fs/promises';
import { getDefaultModel, chatCompletion } from './modelRegistry.js';

// ============================================================================
// Git Instance Management
// ============================================================================

let gitInstances = new Map();

/**
 * Get or create a git instance for a repository
 * @param {string} repoPath - Repository path
 * @returns {Object} SimpleGit instance
 */
export function getGit(repoPath = process.cwd()) {
  if (!gitInstances.has(repoPath)) {
    gitInstances.set(repoPath, simpleGit(repoPath));
  }
  return gitInstances.get(repoPath);
}

/**
 * Check if a directory is a git repository
 * @param {string} dirPath - Directory path
 * @returns {Promise<boolean>}
 */
export async function isGitRepository(dirPath = process.cwd()) {
  try {
    const git = getGit(dirPath);
    await git.status();
    return true;
  } catch {
    return false;
  }
}

/**
 * Find the root of the git repository
 * @param {string} startPath - Starting path
 * @returns {Promise<string|null>} Repository root or null
 */
export async function findRepoRoot(startPath = process.cwd()) {
  try {
    const git = getGit(startPath);
    const result = await git.revparse(['--show-toplevel']);
    return result.trim();
  } catch {
    return null;
  }
}

// ============================================================================
// Status & Information
// ============================================================================

/**
 * Get detailed repository status
 * @param {string} repoPath - Repository path
 * @returns {Promise<Object>} Status object
 */
export async function getStatus(repoPath = process.cwd()) {
  const git = getGit(repoPath);

  try {
    const status = await git.status();
    const branch = await git.branch();
    const remotes = await git.getRemotes(true);

    return {
      current: status.current,
      tracking: status.tracking,
      ahead: status.ahead,
      behind: status.behind,
      staged: status.staged,
      modified: status.modified,
      created: status.created,
      deleted: status.deleted,
      renamed: status.renamed,
      conflicted: status.conflicted,
      notAdded: status.not_added,
      isClean: status.isClean(),
      branches: branch.all,
      currentBranch: branch.current,
      remotes: remotes.map(r => ({
        name: r.name,
        url: r.refs.fetch,
      })),
    };
  } catch (error) {
    throw new Error(`Failed to get status: ${error.message}`);
  }
}

/**
 * Get current branch name
 * @param {string} repoPath - Repository path
 * @returns {Promise<string>}
 */
export async function getCurrentBranch(repoPath = process.cwd()) {
  const git = getGit(repoPath);
  const status = await git.status();
  return status.current;
}

/**
 * List all branches
 * @param {string} repoPath - Repository path
 * @param {boolean} includeRemote - Include remote branches
 * @returns {Promise<Array<{name: string, current: boolean, remote: boolean}>>}
 */
export async function listBranches(repoPath = process.cwd(), includeRemote = false) {
  const git = getGit(repoPath);
  const result = await git.branch(['-a']);

  return result.all.map(name => ({
    name: name.replace('remotes/', ''),
    current: result.current === name,
    remote: name.includes('remotes/'),
  }));
}

// ============================================================================
// Branch Operations
// ============================================================================

/**
 * Create and checkout a new branch
 * @param {string} branchName - Branch name
 * @param {string} fromBranch - Branch to create from (default: current)
 * @param {string} repoPath - Repository path
 * @returns {Promise<Object>}
 */
export async function createBranch(branchName, fromBranch = null, repoPath = process.cwd()) {
  const git = getGit(repoPath);

  try {
    if (fromBranch) {
      await git.checkoutBranch(branchName, fromBranch);
    } else {
      await git.checkoutLocalBranch(branchName);
    }

    return {
      success: true,
      branch: branchName,
      from: fromBranch || 'current',
    };
  } catch (error) {
    throw new Error(`Failed to create branch: ${error.message}`);
  }
}

/**
 * Checkout a branch
 * @param {string} branchName - Branch name
 * @param {string} repoPath - Repository path
 * @returns {Promise<Object>}
 */
export async function checkout(branchName, repoPath = process.cwd()) {
  const git = getGit(repoPath);

  try {
    await git.checkout(branchName);
    return {
      success: true,
      branch: branchName,
    };
  } catch (error) {
    throw new Error(`Failed to checkout branch: ${error.message}`);
  }
}

/**
 * Delete a branch
 * @param {string} branchName - Branch name
 * @param {boolean} force - Force delete
 * @param {string} repoPath - Repository path
 * @returns {Promise<Object>}
 */
export async function deleteBranch(branchName, force = false, repoPath = process.cwd()) {
  const git = getGit(repoPath);

  try {
    if (force) {
      await git.deleteLocalBranch(branchName, true);
    } else {
      await git.deleteLocalBranch(branchName, false);
    }

    return {
      success: true,
      branch: branchName,
    };
  } catch (error) {
    throw new Error(`Failed to delete branch: ${error.message}`);
  }
}

/**
 * Merge a branch into current
 * @param {string} branchName - Branch to merge
 * @param {string} repoPath - Repository path
 * @returns {Promise<Object>}
 */
export async function merge(branchName, repoPath = process.cwd()) {
  const git = getGit(repoPath);

  try {
    const result = await git.merge([branchName]);
    return {
      success: result.result === 'success',
      conflicts: result.conflicts || [],
      merged: result.result === 'success',
    };
  } catch (error) {
    throw new Error(`Failed to merge branch: ${error.message}`);
  }
}

// ============================================================================
// Commit Operations
// ============================================================================

/**
 * Stage files for commit
 * @param {string|string[]} files - File(s) to stage
 * @param {string} repoPath - Repository path
 * @returns {Promise<Object>}
 */
export async function stage(files, repoPath = process.cwd()) {
  const git = getGit(repoPath);

  try {
    const filesToStage = Array.isArray(files) ? files : [files];
    await git.add(filesToStage);

    return {
      success: true,
      staged: filesToStage,
    };
  } catch (error) {
    throw new Error(`Failed to stage files: ${error.message}`);
  }
}

/**
 * Unstage files
 * @param {string|string[]} files - File(s) to unstage
 * @param {string} repoPath - Repository path
 * @returns {Promise<Object>}
 */
export async function unstage(files, repoPath = process.cwd()) {
  const git = getGit(repoPath);

  try {
    const filesToUnstage = Array.isArray(files) ? files : [files];
    await git.reset(['--', ...filesToUnstage]);

    return {
      success: true,
      unstaged: filesToUnstage,
    };
  } catch (error) {
    throw new Error(`Failed to unstage files: ${error.message}`);
  }
}

/**
 * Commit staged changes
 * @param {string} message - Commit message
 * @param {Object} options - Commit options
 * @param {string} repoPath - Repository path
 * @returns {Promise<Object>}
 */
export async function commit(message, options = {}, repoPath = process.cwd()) {
  const git = getGit(repoPath);

  try {
    const commitOptions = {};
    if (options.noVerify) commitOptions['--no-verify'] = null;
    if (options.sign) commitOptions['-S'] = null;

    const result = await git.commit(message, null, commitOptions);

    return {
      success: true,
      commit: result.commit,
      summary: result.summary,
    };
  } catch (error) {
    throw new Error(`Failed to commit: ${error.message}`);
  }
}

/**
 * Generate AI commit message based on diff
 * @param {string} repoPath - Repository path
 * @returns {Promise<string>}
 */
export async function generateCommitMessage(repoPath = process.cwd()) {
  const git = getGit(repoPath);

  try {
    // Get staged diff
    const diff = await git.diff(['--cached']);

    if (!diff) {
      return 'No staged changes';
    }

    // Get list of changed files
    const status = await git.status();
    const files = [
      ...status.staged,
      ...status.created.filter(f => status.staged.includes(f)),
      ...status.modified.filter(f => status.staged.includes(f)),
    ];

    const model = getDefaultModel();

    const prompt = `Generate a concise, descriptive git commit message for the following changes.

Changed files:
${files.join('\n')}

Diff summary:
${diff.slice(0, 3000)}

Rules:
1. Use conventional commits format (type: description)
2. Types: feat, fix, docs, style, refactor, test, chore
3. Keep the message under 72 characters
4. Be specific but concise
5. Use present tense ("Add feature" not "Added feature")

Respond with ONLY the commit message, no explanation.`;

    const response = await chatCompletion(
      model,
      [
        { role: 'system', content: 'You are a commit message generator. Output only the commit message.' },
        { role: 'user', content: prompt },
      ],
      { temperature: 0.3 }
    );

    return response.trim();
  } catch (error) {
    console.error('[GitOperations] Failed to generate commit message:', error.message);
    return 'Update files'; // Fallback
  }
}

/**
 * Commit with AI-generated message
 * @param {Object} options - Options
 * @param {string} repoPath - Repository path
 * @returns {Promise<Object>}
 */
export async function commitWithAIMessage(options = {}, repoPath = process.cwd()) {
  const message = await generateCommitMessage(repoPath);

  if (message === 'No staged changes') {
    return {
      success: false,
      error: 'No staged changes to commit',
    };
  }

  return commit(message, options, repoPath);
}

// ============================================================================
// Diff Operations
// ============================================================================

/**
 * Get diff of changes
 * @param {Object} options - Diff options
 * @param {string} repoPath - Repository path
 * @returns {Promise<string>}
 */
export async function getDiff(options = {}, repoPath = process.cwd()) {
  const git = getGit(repoPath);

  try {
    const args = [];

    if (options.staged) args.push('--cached');
    if (options.stat) args.push('--stat');
    if (options.nameOnly) args.push('--name-only');
    if (options.files) args.push('--', ...options.files);

    return await git.diff(args);
  } catch (error) {
    throw new Error(`Failed to get diff: ${error.message}`);
  }
}

/**
 * Get diff for specific files
 * @param {string[]} files - Files to diff
 * @param {string} repoPath - Repository path
 * @returns {Promise<string>}
 */
export async function getFileDiff(files, repoPath = process.cwd()) {
  return getDiff({ files }, repoPath);
}

// ============================================================================
// Stash Operations
// ============================================================================

/**
 * Stash current changes
 * @param {string} message - Stash message
 * @param {string} repoPath - Repository path
 * @returns {Promise<Object>}
 */
export async function stash(message = null, repoPath = process.cwd()) {
  const git = getGit(repoPath);

  try {
    const result = message
      ? await git.stash(['save', message])
      : await git.stash();

    return {
      success: true,
      message: message || 'WIP',
      result,
    };
  } catch (error) {
    throw new Error(`Failed to stash: ${error.message}`);
  }
}

/**
 * Pop the most recent stash
 * @param {Object} options - Options
 * @param {string} repoPath - Repository path
 * @returns {Promise<Object>}
 */
export async function popStash(options = {}, repoPath = process.cwd()) {
  const git = getGit(repoPath);

  try {
    const args = ['pop'];
    if (options.index !== undefined) args.push(`stash@{${options.index}}`);

    await git.stash(args);

    return {
      success: true,
    };
  } catch (error) {
    throw new Error(`Failed to pop stash: ${error.message}`);
  }
}

/**
 * List all stashes
 * @param {string} repoPath - Repository path
 * @returns {Promise<Array<{index: number, message: string, hash: string}>>}
 */
export async function listStashes(repoPath = process.cwd()) {
  const git = getGit(repoPath);

  try {
    const result = await git.stash(['list']);

    if (!result) return [];

    return result.split('\n')
      .filter(line => line.trim())
      .map((line, index) => {
        const match = line.match(/stash@\{(\d+)\}: (.+)/);
        return {
          index: match ? parseInt(match[1]) : index,
          message: match ? match[2] : line,
          hash: line.split(':')[0],
        };
      });
  } catch {
    return [];
  }
}

// ============================================================================
// History & Log
// ============================================================================

/**
 * Get commit history
 * @param {Object} options - Log options
 * @param {string} repoPath - Repository path
 * @returns {Promise<Array<Object>>}
 */
export async function getLog(options = {}, repoPath = process.cwd()) {
  const git = getGit(repoPath);

  try {
    const logOptions = {
      maxCount: options.maxCount || 20,
    };

    if (options.file) logOptions.file = options.file;
    if (options.from) logOptions.from = options.from;
    if (options.to) logOptions.to = options.to;

    const log = await git.log(logOptions);

    return log.all.map(commit => ({
      hash: commit.hash,
      message: commit.message,
      author: commit.author_name,
      email: commit.author_email,
      date: commit.date,
      refs: commit.refs,
      body: commit.body,
    }));
  } catch (error) {
    throw new Error(`Failed to get log: ${error.message}`);
  }
}

/**
 * Get file history (blame)
 * @param {string} filePath - File path
 * @param {string} repoPath - Repository path
 * @returns {Promise<Array<Object>>}
 */
export async function getBlame(filePath, repoPath = process.cwd()) {
  const git = getGit(repoPath);

  try {
    const blame = await git.raw(['blame', '--line-porcelain', filePath]);

    const lines = blame.split('\n');
    const results = [];
    let current = null;

    for (const line of lines) {
      if (line.startsWith('author ')) {
        if (current) results.push(current);
        current = {
          hash: line.split(' ')[0],
          author: line.slice(7),
        };
      } else if (current && line.startsWith('author-time ')) {
        current.timestamp = parseInt(line.slice(12)) * 1000;
      } else if (current && line.startsWith('\t')) {
        current.content = line.slice(1);
      }
    }

    if (current) results.push(current);

    return results;
  } catch (error) {
    throw new Error(`Failed to get blame: ${error.message}`);
  }
}

// ============================================================================
// Remote Operations
// ============================================================================

/**
 * Push changes to remote
 * @param {Object} options - Push options
 * @param {string} repoPath - Repository path
 * @returns {Promise<Object>}
 */
export async function push(options = {}, repoPath = process.cwd()) {
  const git = getGit(repoPath);

  try {
    const pushOptions = [];
    if (options.force) pushOptions.push('--force');
    if (options.setUpstream) pushOptions.push('-u');

    const remote = options.remote || 'origin';
    const branch = options.branch || await getCurrentBranch(repoPath);

    await git.push(remote, branch, pushOptions);

    return {
      success: true,
      remote,
      branch,
    };
  } catch (error) {
    throw new Error(`Failed to push: ${error.message}`);
  }
}

/**
 * Pull changes from remote
 * @param {Object} options - Pull options
 * @param {string} repoPath - Repository path
 * @returns {Promise<Object>}
 */
export async function pull(options = {}, repoPath = process.cwd()) {
  const git = getGit(repoPath);

  try {
    const pullOptions = [];
    if (options.rebase) pullOptions.push('--rebase');

    const result = await git.pull(pullOptions);

    return {
      success: !result.conflicts || result.conflicts.length === 0,
      summary: result.summary,
      conflicts: result.conflicts || [],
    };
  } catch (error) {
    throw new Error(`Failed to pull: ${error.message}`);
  }
}

/**
 * Fetch from remote
 * @param {string} remote - Remote name
 * @param {string} repoPath - Repository path
 * @returns {Promise<Object>}
 */
export async function fetch(remote = 'origin', repoPath = process.cwd()) {
  const git = getGit(repoPath);

  try {
    await git.fetch(remote);
    return { success: true, remote };
  } catch (error) {
    throw new Error(`Failed to fetch: ${error.message}`);
  }
}

// ============================================================================
// Safety & Utility
// ============================================================================

/**
 * Check if there are uncommitted changes
 * @param {string} repoPath - Repository path
 * @returns {Promise<boolean>}
 */
export async function hasUncommittedChanges(repoPath = process.cwd()) {
  const status = await getStatus(repoPath);
  return !status.isClean;
}

/**
 * Get repository summary for AI context
 * @param {string} repoPath - Repository path
 * @returns {Promise<Object>}
 */
export async function getRepositoryContext(repoPath = process.cwd()) {
  const [status, branches, log] = await Promise.all([
    getStatus(repoPath),
    listBranches(repoPath, true),
    getLog({ maxCount: 5 }, repoPath),
  ]);

  return {
    currentBranch: status.current,
    isClean: status.isClean,
    ahead: status.ahead,
    behind: status.behind,
    modifiedCount: status.modified.length,
    stagedCount: status.staged.length,
    untrackedCount: status.notAdded.length,
    totalBranches: branches.length,
    recentCommits: log.slice(0, 3).map(c => ({
      message: c.message.split('\n')[0],
      author: c.author,
      date: c.date,
    })),
  };
}

// ============================================================================
// Export Default
// ============================================================================

export default {
  getGit,
  isGitRepository,
  findRepoRoot,
  getStatus,
  getCurrentBranch,
  listBranches,
  createBranch,
  checkout,
  deleteBranch,
  merge,
  stage,
  unstage,
  commit,
  generateCommitMessage,
  commitWithAIMessage,
  getDiff,
  getFileDiff,
  stash,
  popStash,
  listStashes,
  getLog,
  getBlame,
  push,
  pull,
  fetch,
  hasUncommittedChanges,
  getRepositoryContext,
};
