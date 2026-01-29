/**
 * Safety Policies - Configurable safety policies and guardrails
 *
 * Features:
 * - Configurable safety policies
 * - Per-action permission levels
 * - User confirmation workflows
 * - Automatic safety recommendations
 *
 * @module safetyPolicies
 */

import { EventEmitter } from 'events';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

// ============================================================================
// Configuration
// ============================================================================

const CONFIG_DIR = path.join(os.homedir(), '.static-rebel');
const POLICIES_FILE = path.join(CONFIG_DIR, 'safety-policies.json');

// ============================================================================
// Default Policies
// ============================================================================

const DEFAULT_POLICIES = {
  version: '1.0.0',
  global: {
    requireConfirmation: true,
    dryRunByDefault: false,
    maxFileSize: 10 * 1024 * 1024, // 10MB
    maxOutputSize: 1024 * 1024, // 1MB
    shellTimeout: 30000,
    maxRecursionDepth: 10,
  },
  actions: {
    file_read: {
      allowed: true,
      requireConfirmation: false,
      riskLevel: 'low',
      constraints: {
        maxSize: 10 * 1024 * 1024,
        allowedPaths: [],
        blockedPaths: [
          '/etc/passwd',
          '/etc/shadow',
          '/etc/hosts',
          '/proc',
          '/sys',
          '/dev',
        ],
      },
    },
    file_write: {
      allowed: true,
      requireConfirmation: true,
      riskLevel: 'medium',
      constraints: {
        backupBeforeWrite: true,
        allowedExtensions: [
          '.js', '.ts', '.jsx', '.tsx',
          '.json', '.md', '.txt',
          '.html', '.css', '.scss',
          '.yml', '.yaml', '.xml',
          '.py', '.rb', '.go', '.rs',
        ],
        blockedExtensions: ['.exe', '.dll', '.so', '.dylib', '.bin'],
      },
    },
    file_delete: {
      allowed: true,
      requireConfirmation: true,
      riskLevel: 'high',
      constraints: {
        backupBeforeDelete: true,
        maxFilesPerOperation: 10,
        confirmPattern: true,
      },
    },
    shell: {
      allowed: true,
      requireConfirmation: true,
      riskLevel: 'high',
      constraints: {
        blockedCommands: [
          'rm -rf /',
          'rm -rf /*',
          'mkfs',
          'dd if=/dev/zero',
          ':(){ :|:& };:',
          'while true',
        ],
        blockedPatterns: [
          'curl.*|.*sh',
          'wget.*|.*sh',
          '> /dev/sda',
          '> /dev/hda',
        ],
        requireDryRun: true,
      },
    },
    git_commit: {
      allowed: true,
      requireConfirmation: true,
      riskLevel: 'medium',
      constraints: {
        requireCleanStatus: false,
        allowEmpty: false,
      },
    },
    git_push: {
      allowed: true,
      requireConfirmation: true,
      riskLevel: 'high',
      constraints: {
        requireUpstream: true,
        confirmForce: true,
      },
    },
  },
  patterns: {
    destructive: {
      patterns: ['delete', 'remove', 'drop', 'rm', 'destroy'],
      riskLevel: 'high',
      requireConfirmation: true,
    },
    network: {
      patterns: ['fetch', 'request', 'download', 'upload'],
      riskLevel: 'medium',
      requireConfirmation: false,
    },
    system: {
      patterns: ['sudo', 'chmod', 'chown', 'systemctl'],
      riskLevel: 'critical',
      requireConfirmation: true,
    },
  },
};

// ============================================================================
// Safety Policies Class
// ============================================================================

class SafetyPolicies extends EventEmitter {
  constructor() {
    super();
    this.policies = null;
    this.operationLog = [];
    this.stash = new Map();
    this.checkpoints = new Map();
  }

  /**
   * Initialize safety policies
   */
  async init() {
    await this.loadPolicies();
    console.log('[SafetyPolicies] Initialized');
  }

  /**
   * Load policies from file or use defaults
   */
  async loadPolicies() {
    try {
      const data = await fs.readFile(POLICIES_FILE, 'utf-8');
      this.policies = JSON.parse(data);
    } catch {
      this.policies = { ...DEFAULT_POLICIES };
      await this.savePolicies();
    }
  }

  /**
   * Save policies to file
   */
  async savePolicies() {
    await fs.mkdir(CONFIG_DIR, { recursive: true });
    await fs.writeFile(POLICIES_FILE, JSON.stringify(this.policies, null, 2));
  }

  /**
   * Get policy for an action
   * @param {string} action - Action name
   * @returns {Object}
   */
  getActionPolicy(action) {
    return this.policies.actions[action] || {
      allowed: false,
      requireConfirmation: true,
      riskLevel: 'unknown',
    };
  }

  /**
   * Check if an action is allowed
   * @param {string} action - Action name
   * @param {Object} params - Action parameters
   * @returns {Object}
   */
  checkAction(action, params = {}) {
    const policy = this.getActionPolicy(action);

    if (!policy.allowed) {
      return {
        allowed: false,
        reason: 'Action not allowed by policy',
        requiresConfirmation: false,
      };
    }

    // Check constraints
    const violations = this.checkConstraints(action, params, policy.constraints);

    if (violations.length > 0) {
      return {
        allowed: false,
        reason: 'Policy constraints violated',
        violations,
        requiresConfirmation: false,
      };
    }

    return {
      allowed: true,
      requiresConfirmation: policy.requireConfirmation,
      riskLevel: policy.riskLevel,
    };
  }

  /**
   * Check constraints for an action
   * @param {string} action - Action name
   * @param {Object} params - Action parameters
   * @param {Object} constraints - Policy constraints
   * @returns {string[]}
   */
  checkConstraints(action, params, constraints) {
    const violations = [];

    if (!constraints) return violations;

    // Check file size
    if (constraints.maxSize && params.size > constraints.maxSize) {
      violations.push(`File size ${params.size} exceeds maximum ${constraints.maxSize}`);
    }

    // Check file extensions
    if (constraints.allowedExtensions && params.path) {
      const ext = path.extname(params.path);
      if (!constraints.allowedExtensions.includes(ext)) {
        violations.push(`File extension ${ext} not allowed`);
      }
    }

    if (constraints.blockedExtensions && params.path) {
      const ext = path.extname(params.path);
      if (constraints.blockedExtensions.includes(ext)) {
        violations.push(`File extension ${ext} is blocked`);
      }
    }

    // Check blocked paths
    if (constraints.blockedPaths && params.path) {
      for (const blocked of constraints.blockedPaths) {
        if (params.path.includes(blocked)) {
          violations.push(`Path contains blocked segment: ${blocked}`);
        }
      }
    }

    // Check blocked commands
    if (constraints.blockedCommands && params.command) {
      const cmd = params.command.toLowerCase();
      for (const blocked of constraints.blockedCommands) {
        if (cmd.includes(blocked.toLowerCase())) {
          violations.push(`Command contains blocked pattern: ${blocked}`);
        }
      }
    }

    // Check blocked patterns
    if (constraints.blockedPatterns && params.command) {
      for (const pattern of constraints.blockedPatterns) {
        const regex = new RegExp(pattern, 'i');
        if (regex.test(params.command)) {
          violations.push(`Command matches blocked pattern: ${pattern}`);
        }
      }
    }

    return violations;
  }

  /**
   * Update a policy
   * @param {string} action - Action name
   * @param {Object} updates - Policy updates
   */
  async updatePolicy(action, updates) {
    if (!this.policies.actions[action]) {
      this.policies.actions[action] = {};
    }

    this.policies.actions[action] = {
      ...this.policies.actions[action],
      ...updates,
    };

    await this.savePolicies();
    this.emit('policy:updated', { action, policy: this.policies.actions[action] });
  }

  /**
   * Reset policies to defaults
   */
  async resetPolicies() {
    this.policies = { ...DEFAULT_POLICIES };
    await this.savePolicies();
    this.emit('policies:reset');
  }

  // ============================================================================
  // Stash Operations
  // ============================================================================

  /**
   * Stash changes before an operation
   * @param {string} operationId - Operation ID
   * @param {Object} data - Data to stash
   * @returns {string} Stash ID
   */
  stashChanges(operationId, data) {
    const stashId = `stash-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    this.stash.set(stashId, {
      operationId,
      data,
      timestamp: new Date(),
    });

    this.emit('stash:created', { stashId, operationId });
    return stashId;
  }

  /**
   * Restore stashed changes
   * @param {string} stashId - Stash ID
   * @returns {Object|null}
   */
  restoreStash(stashId) {
    const stash = this.stash.get(stashId);

    if (!stash) {
      return null;
    }

    this.stash.delete(stashId);
    this.emit('stash:restored', { stashId, operationId: stash.operationId });

    return stash.data;
  }

  /**
   * Clear old stashes
   * @param {number} maxAge - Maximum age in ms
   */
  clearOldStashes(maxAge = 24 * 60 * 60 * 1000) {
    const now = Date.now();

    for (const [stashId, stash] of this.stash) {
      if (now - stash.timestamp > maxAge) {
        this.stash.delete(stashId);
        this.emit('stash:expired', { stashId });
      }
    }
  }

  // ============================================================================
  // Checkpoint Operations
  // ============================================================================

  /**
   * Create a checkpoint
   * @param {string} name - Checkpoint name
   * @param {Object} state - State to save
   * @returns {string} Checkpoint ID
   */
  createCheckpoint(name, state) {
    const checkpointId = `checkpoint-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    this.checkpoints.set(checkpointId, {
      name,
      state,
      timestamp: new Date(),
    });

    this.emit('checkpoint:created', { checkpointId, name });
    return checkpointId;
  }

  /**
   * Restore a checkpoint
   * @param {string} checkpointId - Checkpoint ID
   * @returns {Object|null}
   */
  restoreCheckpoint(checkpointId) {
    const checkpoint = this.checkpoints.get(checkpointId);

    if (!checkpoint) {
      return null;
    }

    this.emit('checkpoint:restored', { checkpointId, name: checkpoint.name });
    return checkpoint.state;
  }

  /**
   * List checkpoints
   * @returns {Array<Object>}
   */
  listCheckpoints() {
    return Array.from(this.checkpoints.entries()).map(([id, checkpoint]) => ({
      id,
      name: checkpoint.name,
      timestamp: checkpoint.timestamp,
    }));
  }

  /**
   * Delete a checkpoint
   * @param {string} checkpointId - Checkpoint ID
   * @returns {boolean}
   */
  deleteCheckpoint(checkpointId) {
    const deleted = this.checkpoints.delete(checkpointId);

    if (deleted) {
      this.emit('checkpoint:deleted', { checkpointId });
    }

    return deleted;
  }

  // ============================================================================
  // Operation Logging
  // ============================================================================

  /**
   * Log an operation
   * @param {Object} operation - Operation details
   */
  logOperation(operation) {
    const entry = {
      id: `op-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date(),
      ...operation,
    };

    this.operationLog.push(entry);

    // Keep only last 1000 operations
    if (this.operationLog.length > 1000) {
      this.operationLog.shift();
    }

    this.emit('operation:logged', entry);
  }

  /**
   * Get operation log
   * @param {Object} filters - Filters
   * @returns {Array<Object>}
   */
  getOperationLog(filters = {}) {
    let logs = [...this.operationLog];

    if (filters.action) {
      logs = logs.filter(op => op.action === filters.action);
    }

    if (filters.status) {
      logs = logs.filter(op => op.status === filters.status);
    }

    if (filters.since) {
      logs = logs.filter(op => op.timestamp >= filters.since);
    }

    return logs;
  }

  /**
   * Get recent operations
   * @param {number} limit - Maximum number of operations
   * @returns {Array<Object>}
   */
  getRecentOperations(limit = 20) {
    return this.operationLog.slice(-limit);
  }

  /**
   * Clear operation log
   */
  clearOperationLog() {
    this.operationLog = [];
    this.emit('log:cleared');
  }

  // ============================================================================
  // Undo/Redo
  // ============================================================================

  /**
   * Undo last operation
   * @returns {Object|null}
   */
  undo() {
    const lastOp = this.operationLog.pop();

    if (!lastOp) {
      return null;
    }

    this.emit('operation:undone', lastOp);
    return lastOp;
  }

  /**
   * Get operations that can be undone
   * @returns {Array<Object>}
   */
  getUndoableOperations() {
    return [...this.operationLog].reverse();
  }
}

// ============================================================================
// Singleton Export
// ============================================================================

const safetyPolicies = new SafetyPolicies();

export default safetyPolicies;

// Named exports
export {
  SafetyPolicies,
  DEFAULT_POLICIES,
};
