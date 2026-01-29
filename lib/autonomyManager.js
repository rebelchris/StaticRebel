/**
 * Autonomy Manager - Manage autonomy levels and permissions
 *
 * Implements 4 levels of autonomy:
 * - Level 0 (Chat): Pure Q&A, no actions
 * - Level 1 (Assisted): Suggests actions, asks permission
 * - Level 2 (Semi-Autonomous): Executes safe actions, confirms risky ones
 * - Level 3 (Autonomous): Works toward goals over multiple steps
 */

import { EventEmitter } from 'events';

// ============================================================================
// Autonomy Levels Definition
// ============================================================================

export const AUTONOMY_LEVELS = {
  CHAT: {
    level: 0,
    name: 'Chat',
    description: 'Pure Q&A - no actions executed',
    canExecuteTools: false,
    canModifyFilesystem: false,
    canExecuteShell: false,
    canAccessNetwork: false,
    requiresConfirmation: true,
    maxIterations: 1,
  },
  ASSISTED: {
    level: 1,
    name: 'Assisted',
    description: 'Suggests actions but asks for permission',
    canExecuteTools: true,
    canModifyFilesystem: false,
    canExecuteShell: false,
    canAccessNetwork: true,
    requiresConfirmation: true,
    maxIterations: 1,
  },
  SEMI_AUTONOMOUS: {
    level: 2,
    name: 'Semi-Autonomous',
    description: 'Executes safe actions automatically, confirms risky ones',
    canExecuteTools: true,
    canModifyFilesystem: true,
    canExecuteShell: true,
    canAccessNetwork: true,
    requiresConfirmation: false,
    maxIterations: 5,
    // Safe tools can be executed without confirmation
    safeToolCategories: ['readonly', 'search', 'planning'],
  },
  AUTONOMOUS: {
    level: 3,
    name: 'Autonomous',
    description: 'Works toward goals over multiple steps, can resume tasks',
    canExecuteTools: true,
    canModifyFilesystem: true,
    canExecuteShell: true,
    canAccessNetwork: true,
    requiresConfirmation: false,
    maxIterations: 20,
    safeToolCategories: [
      'readonly',
      'search',
      'planning',
      'filesystem',
      'shell',
      'network',
    ],
    canResumeTasks: true,
    canDelegateTasks: true,
  },
};

// ============================================================================
// Risk Assessment
// ============================================================================

export const RISK_CATEGORIES = {
  READONLY: {
    name: 'readonly',
    description: 'Read-only operations',
    riskLevel: 0,
    examples: ['file_read', 'search', 'web_fetch'],
  },
  PLANNING: {
    name: 'planning',
    description: 'Planning and reasoning',
    riskLevel: 0,
    examples: ['task_planner'],
  },
  SEARCH: {
    name: 'search',
    description: 'Search operations',
    riskLevel: 0,
    examples: ['search'],
  },
  FILESYSTEM: {
    name: 'filesystem',
    description: 'File system modifications',
    riskLevel: 1,
    examples: ['file_write', 'file_delete', 'mkdir'],
  },
  SHELL: {
    name: 'shell',
    description: 'Shell command execution',
    riskLevel: 2,
    examples: ['shell', 'exec'],
  },
  NETWORK: {
    name: 'network',
    description: 'Network operations',
    riskLevel: 1,
    examples: ['web_fetch', 'api_call'],
  },
  DESTRUCTIVE: {
    name: 'destructive',
    description: 'Destructive operations',
    riskLevel: 3,
    examples: ['delete', 'rm', 'format'],
  },
};

// ============================================================================
// Autonomy Manager Class
// ============================================================================

export class AutonomyManager extends EventEmitter {
  constructor(options = {}) {
    super();

    this.currentLevel = options.level ?? 1; // Default to Assisted
    this.config = options.config || {};
    this.sessionPermissions = new Map();
    this.blockedTools = new Set(options.blockedTools || []);
    this.allowedPaths = options.allowedPaths || [];

    // Track user confirmations for this session
    this.confirmations = new Map();

    // Safety overrides
    this.safetyOverrides = new Set();
  }

  /**
   * Get current autonomy level configuration
   */
  getLevel() {
    return this.getLevelConfig(this.currentLevel);
  }

  /**
   * Get configuration for a specific level
   */
  getLevelConfig(level) {
    switch (level) {
      case 0:
        return AUTONOMY_LEVELS.CHAT;
      case 1:
        return AUTONOMY_LEVELS.ASSISTED;
      case 2:
        return AUTONOMY_LEVELS.SEMI_AUTONOMOUS;
      case 3:
        return AUTONOMY_LEVELS.AUTONOMOUS;
      default:
        return AUTONOMY_LEVELS.ASSISTED;
    }
  }

  /**
   * Set autonomy level
   */
  setLevel(level) {
    const oldLevel = this.currentLevel;

    if (level < 0 || level > 3) {
      throw new Error(`Invalid autonomy level: ${level}. Must be 0-3.`);
    }

    this.currentLevel = level;

    this.emit('level:changed', {
      oldLevel,
      newLevel: level,
      config: this.getLevelConfig(level),
    });

    return this.getLevelConfig(level);
  }

  /**
   * Check if an action can be executed at current autonomy level
   */
  canExecute(action) {
    const level = this.getLevel();

    // Level 0: No actions allowed
    if (this.currentLevel === 0) {
      return {
        allowed: false,
        reason: 'Autonomy level 0 (Chat) does not allow any actions',
        requiresConfirmation: false,
      };
    }

    // Check if tool is blocked
    if (this.blockedTools.has(action.type)) {
      return {
        allowed: false,
        reason: `Tool '${action.type}' is blocked`,
        requiresConfirmation: false,
      };
    }

    // Assess risk
    const risk = this.assessRisk(action);

    // Check if tool requires confirmation at this level
    const requiresConfirmation = this.requiresConfirmation(action, risk);

    // Check if already confirmed this session
    const confirmationKey = `${action.type}:${JSON.stringify(action.params)}`;
    const isConfirmed = this.confirmations.has(confirmationKey);

    // Level 1: Everything requires confirmation
    if (this.currentLevel === 1) {
      return {
        allowed: isConfirmed,
        reason: isConfirmed
          ? 'Confirmed by user'
          : 'Assisted mode requires confirmation',
        requiresConfirmation: !isConfirmed,
        risk,
      };
    }

    // Level 2: Safe actions allowed, risky requires confirmation
    if (this.currentLevel === 2) {
      const isSafe = this.isSafeAction(action, risk);

      if (isSafe || isConfirmed) {
        return {
          allowed: true,
          reason: isSafe ? 'Safe action at level 2' : 'Confirmed by user',
          requiresConfirmation: false,
          risk,
        };
      }

      return {
        allowed: false,
        reason: 'Risky action requires confirmation at level 2',
        requiresConfirmation: true,
        risk,
      };
    }

    // Level 3: All actions allowed (with safety checks)
    if (this.currentLevel === 3) {
      // Even at level 3, destructive actions might need confirmation
      if (
        risk.level >= 3 &&
        !isConfirmed &&
        !this.safetyOverrides.has('destructive')
      ) {
        return {
          allowed: false,
          reason: 'Destructive action requires explicit confirmation',
          requiresConfirmation: true,
          risk,
        };
      }

      return {
        allowed: true,
        reason: 'Autonomous mode allows execution',
        requiresConfirmation: false,
        risk,
      };
    }

    return {
      allowed: false,
      reason: 'Unknown autonomy level',
      requiresConfirmation: true,
    };
  }

  /**
   * Assess risk of an action
   */
  assessRisk(action) {
    const risk = {
      level: 0,
      categories: [],
      factors: [],
    };

    // Check action type against risk categories
    for (const category of Object.values(RISK_CATEGORIES)) {
      if (category.examples.includes(action.type)) {
        risk.categories.push(category.name);
        risk.level = Math.max(risk.level, category.riskLevel);
      }
    }

    // Additional risk factors
    if (action.params) {
      // Check for destructive keywords in params
      const paramStr = JSON.stringify(action.params).toLowerCase();
      const destructiveKeywords = [
        'delete',
        'remove',
        'drop',
        'truncate',
        'rm -rf',
      ];

      for (const keyword of destructiveKeywords) {
        if (paramStr.includes(keyword)) {
          risk.factors.push(`Contains destructive keyword: ${keyword}`);
          risk.level = Math.max(risk.level, 2);
        }
      }

      // Check for system paths
      const systemPaths = ['/etc', '/usr', '/bin', '/sbin', '/sys', '/dev'];
      for (const sysPath of systemPaths) {
        if (paramStr.includes(sysPath)) {
          risk.factors.push(`References system path: ${sysPath}`);
          risk.level = Math.max(risk.level, 3);
        }
      }
    }

    // Check if action modifies filesystem
    if (action.type.includes('write') || action.type.includes('delete')) {
      risk.level = Math.max(risk.level, 1);
    }

    // Check if action executes shell
    if (action.type.includes('shell') || action.type.includes('exec')) {
      risk.level = Math.max(risk.level, 2);
    }

    return risk;
  }

  /**
   * Check if an action is considered safe at current level
   */
  isSafeAction(action, risk) {
    const level = this.getLevel();

    if (!level.safeToolCategories) {
      return false;
    }

    // Check if all risk categories are in safe categories
    for (const category of risk.categories) {
      if (!level.safeToolCategories.includes(category)) {
        return false;
      }
    }

    // Check risk level
    if (risk.level >= 2) {
      return false;
    }

    return true;
  }

  /**
   * Check if an action requires confirmation
   */
  requiresConfirmation(action, risk) {
    const level = this.getLevel();

    // Level 0: No actions
    if (this.currentLevel === 0) {
      return false;
    }

    // Level 1: Everything requires confirmation
    if (this.currentLevel === 1) {
      return true;
    }

    // Check if explicitly marked as requiring confirmation
    if (action.requiresConfirmation) {
      return true;
    }

    // Level 2: Risky actions require confirmation
    if (this.currentLevel === 2) {
      return !this.isSafeAction(action, risk);
    }

    // Level 3: Only destructive actions
    if (this.currentLevel === 3) {
      return risk.level >= 3;
    }

    return true;
  }

  /**
   * Confirm an action for this session
   */
  confirmAction(action, permanent = false) {
    const confirmationKey = `${action.type}:${JSON.stringify(action.params)}`;
    this.confirmations.set(confirmationKey, {
      action,
      confirmedAt: new Date(),
      permanent,
    });

    this.emit('action:confirmed', { action, permanent });

    return true;
  }

  /**
   * Revoke confirmation for an action
   */
  revokeConfirmation(action) {
    const confirmationKey = `${action.type}:${JSON.stringify(action.params)}`;
    const existed = this.confirmations.delete(confirmationKey);

    if (existed) {
      this.emit('action:revoked', { action });
    }

    return existed;
  }

  /**
   * Block a tool from being used
   */
  blockTool(toolName) {
    this.blockedTools.add(toolName);
    this.emit('tool:blocked', { toolName });
  }

  /**
   * Unblock a tool
   */
  unblockTool(toolName) {
    const existed = this.blockedTools.delete(toolName);
    if (existed) {
      this.emit('tool:unblocked', { toolName });
    }
    return existed;
  }

  /**
   * Add a safety override
   */
  addSafetyOverride(override) {
    this.safetyOverrides.add(override);
  }

  /**
   * Remove a safety override
   */
  removeSafetyOverride(override) {
    this.safetyOverrides.delete(override);
  }

  /**
   * Get current permissions summary
   */
  getPermissions() {
    const level = this.getLevel();

    return {
      level: this.currentLevel,
      levelName: level.name,
      canExecuteTools: level.canExecuteTools,
      canModifyFilesystem: level.canModifyFilesystem,
      canExecuteShell: level.canExecuteShell,
      canAccessNetwork: level.canAccessNetwork,
      requiresConfirmation: level.requiresConfirmation,
      maxIterations: level.maxIterations,
      blockedTools: Array.from(this.blockedTools),
      confirmedActions: this.confirmations.size,
      safetyOverrides: Array.from(this.safetyOverrides),
    };
  }

  /**
   * Create a permission prompt for user
   */
  createPermissionPrompt(action, risk) {
    const level = this.getLevel();

    return {
      type: 'permission_request',
      action: {
        type: action.type,
        description: action.description,
        params: action.params,
      },
      risk,
      currentLevel: level.name,
      message: this.generatePermissionMessage(action, risk),
      options: [
        {
          id: 'once',
          label: 'Allow once',
          description: 'Allow this action only',
        },
        {
          id: 'session',
          label: 'Allow for session',
          description: 'Allow this action type for this session',
        },
        {
          id: 'always',
          label: 'Always allow',
          description: 'Always allow this action type (not recommended)',
        },
        { id: 'deny', label: 'Deny', description: 'Do not allow this action' },
      ],
    };
  }

  /**
   * Generate a human-readable permission message
   */
  generatePermissionMessage(action, risk) {
    const parts = [`The agent wants to execute: ${action.type}`];

    if (action.description) {
      parts.push(`Description: ${action.description}`);
    }

    if (risk.level > 0) {
      parts.push(`Risk level: ${risk.level}/3`);
    }

    if (risk.categories.length > 0) {
      parts.push(`Categories: ${risk.categories.join(', ')}`);
    }

    if (risk.factors.length > 0) {
      parts.push(`Warning: ${risk.factors.join('; ')}`);
    }

    return parts.join('\n');
  }

  /**
   * Validate a path is allowed
   */
  validatePath(filePath) {
    if (this.allowedPaths.length === 0) {
      return { valid: true };
    }

    const isAllowed = this.allowedPaths.some((allowed) =>
      filePath.startsWith(allowed),
    );

    if (!isAllowed) {
      return {
        valid: false,
        reason: `Path '${filePath}' is not in allowed paths: ${this.allowedPaths.join(', ')}`,
      };
    }

    return { valid: true };
  }

  /**
   * Add an allowed path
   */
  addAllowedPath(filePath) {
    this.allowedPaths.push(filePath);
    this.emit('path:allowed', { path: filePath });
  }

  /**
   * Reset session (clear confirmations)
   */
  resetSession() {
    this.confirmations.clear();
    this.emit('session:reset');
  }

  /**
   * Export current configuration
   */
  exportConfig() {
    return {
      level: this.currentLevel,
      blockedTools: Array.from(this.blockedTools),
      allowedPaths: this.allowedPaths,
      safetyOverrides: Array.from(this.safetyOverrides),
    };
  }

  /**
   * Import configuration
   */
  importConfig(config) {
    if (config.level !== undefined) {
      this.setLevel(config.level);
    }

    if (config.blockedTools) {
      this.blockedTools = new Set(config.blockedTools);
    }

    if (config.allowedPaths) {
      this.allowedPaths = config.allowedPaths;
    }

    if (config.safetyOverrides) {
      this.safetyOverrides = new Set(config.safetyOverrides);
    }

    this.emit('config:imported', config);
  }
}

// ============================================================================
// Convenience Functions
// ============================================================================

export function createAutonomyManager(options = {}) {
  return new AutonomyManager(options);
}

export function getAutonomyLevelName(level) {
  const config = new AutonomyManager().getLevelConfig(level);
  return config.name;
}

export function isValidAutonomyLevel(level) {
  return level >= 0 && level <= 3;
}

// ============================================================================
// Default Export
// ============================================================================

export default AutonomyManager;
