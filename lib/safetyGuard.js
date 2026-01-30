/**
 * Safety Guard - Safety constraints and guardrails for StaticRebel
 *
 * Features:
 * - Dry-run mode for filesystem/shell operations
 * - Explicit user confirmation for risky ops
 * - No silent destructive actions
 * - Path validation
 * - Command sanitization
 */

import { EventEmitter } from 'events';
import path from 'path';
import os from 'os';

// ============================================================================
// Safety Configuration
// ============================================================================

export const SAFETY_CONFIG = {
  // Maximum file size for read operations (10MB)
  MAX_FILE_SIZE: 10 * 1024 * 1024,

  // Maximum output size (1MB)
  MAX_OUTPUT_SIZE: 1024 * 1024,

  // Shell command timeout (30 seconds)
  SHELL_TIMEOUT: 30000,

  // Maximum recursion depth for operations
  MAX_RECURSION_DEPTH: 10,

  // Allowed file extensions for write operations
  ALLOWED_EXTENSIONS: [
    '.js',
    '.ts',
    '.json',
    '.md',
    '.txt',
    '.html',
    '.css',
    '.yml',
    '.yaml',
    '.xml',
    '.csv',
    '.log',
    '.conf',
    '.config',
    '.env',
    '.gitignore',
    '.dockerignore',
  ],

  // Blocked file extensions
  BLOCKED_EXTENSIONS: [
    '.exe',
    '.dll',
    '.so',
    '.dylib',
    '.bin',
    '.sh',
    '.bat',
    '.cmd',
    '.ps1',
  ],

  // System paths that should never be accessed
  PROTECTED_PATHS: [
    '/etc/passwd',
    '/etc/shadow',
    '/etc/hosts',
    '/proc',
    '/sys',
    '/dev',
    '/boot',
    '/root',
    path.join(os.homedir(), '.ssh'),
    path.join(os.homedir(), '.gnupg'),
  ],
};

// ============================================================================
// Command Allowlist (Clawdbot-style exec-approvals.json)
// ============================================================================

export const DEFAULT_ALLOWED_COMMANDS = [
  // Read-only / safe commands
  'ls',
  'cat',
  'head',
  'tail',
  'grep',
  'find',
  'pwd',
  'cd',
  'echo',
  'date',
  'whoami',
  'which',
  'file',
  'stat',
  'wc',
  'sort',
  'uniq',
  'cut',
  'tr',
  'sed',
  'awk',
  'less',
  'more',
  'diff',
  'cmp',

  // Git commands (safe for most repos)
  'git status',
  'git diff',
  'git log',
  'git show',
  'git branch',
  'git remote -v',
  'git remote get-url',

  // Package managers (read-only mostly)
  'npm list',
  'npm view',
  'npm search',
  'pip show',
  'pip list',
  'cargo search',

  // Network tools (safe)
  'curl -s',
  'curl -I',
  'wget -q',
  'ping -c',
  'dig',
  'nslookup',

  // System info (read-only)
  'uname -a',
  'free -h',
  'df -h',
  'du -sh',
];

// ============================================================================
// Blocked Commands & Patterns
// ============================================================================

export const BLOCKED_COMMANDS = [
  // Destructive commands
  'rm -rf /',
  'rm -rf /*',
  'rm -rf ~',
  'rm -rf ~/*',
  'mkfs',
  'mkfs.ext',
  'mkfs.xfs',
  'mkfs.btrfs',
  'dd if=/dev/zero',
  'dd if=/dev/random',
  'dd if=/dev/urandom',

  // Fork bombs and resource exhaustion
  ':(){ :|:& };:',
  'fork bomb',
  'while true',

  // System modification
  'chmod 777 /',
  'chmod -R 777 /',
  'chown -R root /',

  // Network dangerous
  'iptables -F',
  'iptables --flush',

  // Data destruction
  '> /dev/sda',
  '> /dev/hda',
  'cat /dev/zero >',

  // Privilege escalation attempts
  'sudo su',
  'sudo -i',
  'sudo /bin/bash',
  'sudo /bin/sh',
];

export const BLOCKED_PATTERNS = [
  // Pipe to shell patterns
  /curl\s+.*\|\s*(ba)?sh/i,
  /wget\s+.*\|\s*(ba)?sh/i,
  /fetch\s+.*\|\s*(ba)?sh/i,

  // Eval patterns
  /eval\s*\(/i,
  /eval\s+`/,

  // Exec patterns
  /exec\s*\(/i,
  /child_process\.exec/i,

  // Base64 encoded commands (potential obfuscation)
  /echo\s+['"][A-Za-z0-9+/]{50,}={0,2}['"]\s*\|/i,

  // Dangerous redirects
  />\s*\/dev\/sda/i,
  />\s*\/dev\/hda/i,
  />\s*\/dev\/null/i,

  // CLAWDBOT-STYLE DANGEROUS PATTERNS (https://github.com/aspect-ai/clawdbot)
  // Command substitution attacks
  /\$\([^)]+\)/,  // $(command) substitution
  /`[^`]+`/,  // Backtick command substitution

  // Redirection to system files
  />\s*\//,  // Direct to root
  />\s*\/etc\//,  // To /etc directory
  /&\s*>\s*[\w\/]+/,  // Redirect operators

  // Chained dangerous commands (with || or && after destructive)
  /rm\s+-rf\s+\/\s*(\|\||&&)/,
  /dd\s+.*(\|\||&&)/,
  /mkfs\s+.*(\|\||&&)/,

  // Subshell execution
  /\(\s*sudo\s+.*\)/,  // (sudo rm -rf /)

  // Null byte injection
  /\x00/,

  // Path traversal in commands
  /\.\.\/.*\;|\;\.\.\//,  // ../; or ;..

  // Multiple commands chained
  /;\s*rm\s+/,  // ;rm
  /;\s*mkfs\s+/,  // ;mkfs

  // File descriptor manipulation
  /\d*>\&?\d*/,  // >&1, 2>&1, etc.

  // Environment variable injection
  /\$\{[^\}]+\}/,  // ${VAR} expansion
];

// ============================================================================
// Safety Guard Class
// ============================================================================

export class SafetyGuard extends EventEmitter {
  constructor(options = {}) {
    super();

    this.config = {
      ...SAFETY_CONFIG,
      ...options,
    };

    this.dryRun = options.dryRun || false;
    this.confirmationRequired = options.confirmationRequired !== false;
    this.allowedPaths = options.allowedPaths || [process.cwd()];
    this.blockedCommands = new Set([
      ...BLOCKED_COMMANDS,
      ...(options.blockedCommands || []),
    ]);
    this.blockedPatterns = [
      ...BLOCKED_PATTERNS,
      ...(options.blockedPatterns || []),
    ];

    // Command allowlist (Clawdbot-style)
    this.commandAllowlist = new Set([
      ...DEFAULT_ALLOWED_COMMANDS,
      ...(options.allowedCommands || []),
    ]);
    this.strictAllowlist = options.strictAllowlist || false; // If true, only allow listed commands

    // Track pending confirmations
    this.pendingConfirmations = new Map();

    // Operation audit log
    this.auditLog = [];

    // Load exec-approvals.json if provided
    if (options.execApprovalsPath) {
      this.loadExecApprovals(options.execApprovalsPath);
    }
  }

  /**
   * Load exec-approvals.json allowlist
   */
  loadExecApprovals(filePath) {
    try {
      const fs = require('fs');
      if (fs.existsSync(filePath)) {
        const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        if (data.allowedCommands) {
          data.allowedCommands.forEach((cmd) => this.commandAllowlist.add(cmd));
        }
        if (data.blockedCommands) {
          data.blockedCommands.forEach((cmd) => this.blockedCommands.add(cmd));
        }
        this.emit('approvals:loaded', { path: filePath, count: this.commandAllowlist.size });
      }
    } catch (error) {
      this.emit('approvals:error', { path: filePath, error: error.message });
    }
  }

  /**
   * Check if an action is safe to execute
   */
  async check(action) {
    const checkId = this.generateCheckId();

    this.emit('check:started', { checkId, action });

    const result = {
      checkId,
      allowed: true,
      dryRun: this.dryRun,
      requiresConfirmation: false,
      warnings: [],
      errors: [],
    };

    try {
      // Check action type specific constraints
      switch (action.type) {
        case 'file_read':
          await this.checkFileRead(action, result);
          break;
        case 'file_write':
          await this.checkFileWrite(action, result);
          break;
        case 'file_delete':
          await this.checkFileDelete(action, result);
          break;
        case 'shell':
        case 'exec':
          await this.checkShellCommand(action, result);
          break;
        case 'web_fetch':
          await this.checkWebFetch(action, result);
          break;
        default:
          // Generic check for unknown action types
          await this.checkGeneric(action, result);
      }

      // Determine if confirmation is required
      if (this.confirmationRequired && result.warnings.length > 0) {
        result.requiresConfirmation = true;
      }

      // In dry-run mode, don't allow actual execution
      if (this.dryRun) {
        result.dryRun = true;
        result.warnings.push('Running in dry-run mode');
      }
    } catch (error) {
      result.allowed = false;
      result.errors.push(error.message);
    }

    // Final allow decision
    result.allowed = result.errors.length === 0 && !result.requiresConfirmation;

    // Log the check
    this.logAudit(checkId, action, result);

    this.emit('check:completed', { checkId, result });

    return result;
  }

  /**
   * Check file read operation
   */
  async checkFileRead(action, result) {
    const { path: filePath } = action.params || {};

    if (!filePath) {
      result.errors.push('File path is required');
      return;
    }

    // Check path is allowed
    const pathCheck = this.validatePath(filePath);
    if (!pathCheck.valid) {
      result.errors.push(pathCheck.reason);
      return;
    }

    // Check file size (would need to stat the file)
    // This is a preliminary check

    // Check for protected paths
    if (this.isProtectedPath(filePath)) {
      result.errors.push(`Access to protected path denied: ${filePath}`);
      return;
    }
  }

  /**
   * Check file write operation
   */
  async checkFileWrite(action, result) {
    const { path: filePath, content } = action.params || {};

    if (!filePath) {
      result.errors.push('File path is required');
      return;
    }

    // Check path is allowed
    const pathCheck = this.validatePath(filePath);
    if (!pathCheck.valid) {
      result.errors.push(pathCheck.reason);
      return;
    }

    // Check extension
    const ext = path.extname(filePath).toLowerCase();
    if (this.config.BLOCKED_EXTENSIONS.includes(ext)) {
      result.errors.push(`Writing to ${ext} files is not allowed`);
      return;
    }

    // Check content size
    if (content && content.length > this.config.MAX_OUTPUT_SIZE) {
      result.warnings.push(`Large file write: ${content.length} bytes`);
    }

    // File write is potentially destructive
    result.warnings.push('File write operation - will overwrite if exists');
    result.requiresConfirmation = true;
  }

  /**
   * Check file delete operation
   */
  async checkFileDelete(action, result) {
    const { path: filePath } = action.params || {};

    if (!filePath) {
      result.errors.push('File path is required');
      return;
    }

    // Check path is allowed
    const pathCheck = this.validatePath(filePath);
    if (!pathCheck.valid) {
      result.errors.push(pathCheck.reason);
      return;
    }

    // Check for protected paths
    if (this.isProtectedPath(filePath)) {
      result.errors.push(`Cannot delete protected path: ${filePath}`);
      return;
    }

    // Deletion is always destructive
    result.warnings.push('DESTRUCTIVE: File will be permanently deleted');
    result.requiresConfirmation = true;
  }

  /**
   * Check shell command
   */
  async checkShellCommand(action, result) {
    const { command } = action.params || {};

    if (!command) {
      result.errors.push('Command is required');
      return;
    }

    // Check against blocked commands
    const normalizedCmd = command.toLowerCase().trim();

    for (const blocked of this.blockedCommands) {
      if (normalizedCmd.includes(blocked.toLowerCase())) {
        result.errors.push(`Command contains blocked pattern: ${blocked}`);
        return;
      }
    }

    // Check against blocked patterns (Clawdbot-style dangerous patterns)
    for (const pattern of this.blockedPatterns) {
      if (pattern.test(command)) {
        result.errors.push(`Command matches blocked pattern: ${pattern}`);
        return;
      }
    }

    // Check allowlist if strict mode is enabled
    if (this.strictAllowlist) {
      const baseCommand = normalizedCmd.split(' ')[0];
      const isAllowed = Array.from(this.commandAllowlist).some((allowed) => {
        const allowedBase = allowed.toLowerCase().split(' ')[0];
        return baseCommand === allowedBase;
      });

      if (!isAllowed) {
        result.errors.push(`Command not in allowlist: ${baseCommand}`);
        return;
      }
    }

    // Shell commands are inherently risky
    result.warnings.push('Shell command execution');
    result.requiresConfirmation = true;
  }

  /**
   * Check web fetch operation
   */
  async checkWebFetch(action, result) {
    const { url, method = 'GET' } = action.params || {};

    if (!url) {
      result.errors.push('URL is required');
      return;
    }

    // Only allow safe methods
    const safeMethods = ['GET', 'HEAD', 'OPTIONS'];
    if (!safeMethods.includes(method.toUpperCase())) {
      result.errors.push(`HTTP method ${method} is not allowed`);
      return;
    }

    // Check for internal/private IPs
    try {
      const urlObj = new URL(url);
      if (this.isInternalHost(urlObj.hostname)) {
        result.warnings.push('Fetching from internal/private IP range');
      }
    } catch {
      result.errors.push('Invalid URL');
      return;
    }
  }

  /**
   * Generic check for unknown action types
   */
  async checkGeneric(action, result) {
    // Check if action type contains risky keywords
    const riskyKeywords = ['delete', 'remove', 'drop', 'exec', 'eval'];
    const actionType = action.type.toLowerCase();

    for (const keyword of riskyKeywords) {
      if (actionType.includes(keyword)) {
        result.warnings.push(`Action type '${action.type}' may be risky`);
        result.requiresConfirmation = true;
        break;
      }
    }
  }

  /**
   * Validate a file path
   */
  validatePath(filePath) {
    // Resolve to absolute path
    const resolved = path.resolve(filePath);

    // Check if within allowed paths
    const isAllowed = this.allowedPaths.some((allowed) => {
      const resolvedAllowed = path.resolve(allowed);
      return (
        resolved.startsWith(resolvedAllowed) || resolved === resolvedAllowed
      );
    });

    if (!isAllowed) {
      return {
        valid: false,
        reason: `Path '${filePath}' is outside allowed directories: ${this.allowedPaths.join(', ')}`,
      };
    }

    // Check for path traversal
    if (filePath.includes('..')) {
      return {
        valid: false,
        reason: 'Path traversal detected',
      };
    }

    return { valid: true, resolved };
  }

  /**
   * Check if path is protected
   */
  isProtectedPath(filePath) {
    const resolved = path.resolve(filePath);

    return this.config.PROTECTED_PATHS.some((protected) => {
      const resolvedProtected = path.resolve(protected);
      return (
        resolved.startsWith(resolvedProtected) || resolved === resolvedProtected
      );
    });
  }

  /**
   * Check if hostname is internal/private
   */
  isInternalHost(hostname) {
    // Check for localhost
    if (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '::1'
    ) {
      return true;
    }

    // Check for private IP ranges
    const privateRanges = [
      /^10\./,
      /^172\.(1[6-9]|2[0-9]|3[01])\./,
      /^192\.168\./,
      /^127\./,
    ];

    return privateRanges.some((range) => range.test(hostname));
  }

  /**
   * Request user confirmation
   */
  async requestConfirmation(action, warnings) {
    const confirmationId = this.generateCheckId();

    const request = {
      id: confirmationId,
      action,
      warnings,
      timestamp: new Date(),
      status: 'pending',
    };

    this.pendingConfirmations.set(confirmationId, request);

    this.emit('confirmation:required', {
      confirmationId,
      action,
      warnings,
    });

    return confirmationId;
  }

  /**
   * Confirm a pending action
   */
  confirm(confirmationId) {
    const request = this.pendingConfirmations.get(confirmationId);
    if (!request) {
      return { success: false, error: 'Confirmation not found' };
    }

    request.status = 'confirmed';
    request.confirmedAt = new Date();

    this.pendingConfirmations.delete(confirmationId);

    this.emit('confirmation:confirmed', { confirmationId, request });

    return { success: true, request };
  }

  /**
   * Deny a pending action
   */
  deny(confirmationId, reason = '') {
    const request = this.pendingConfirmations.get(confirmationId);
    if (!request) {
      return { success: false, error: 'Confirmation not found' };
    }

    request.status = 'denied';
    request.deniedAt = new Date();
    request.denyReason = reason;

    this.pendingConfirmations.delete(confirmationId);

    this.emit('confirmation:denied', { confirmationId, request, reason });

    return { success: true, request };
  }

  /**
   * Enable dry-run mode
   */
  enableDryRun() {
    this.dryRun = true;
    this.emit('mode:changed', { dryRun: true });
  }

  /**
   * Disable dry-run mode
   */
  disableDryRun() {
    this.dryRun = false;
    this.emit('mode:changed', { dryRun: false });
  }

  /**
   * Add an allowed path
   */
  addAllowedPath(filePath) {
    const resolved = path.resolve(filePath);
    if (!this.allowedPaths.includes(resolved)) {
      this.allowedPaths.push(resolved);
      this.emit('path:added', { path: resolved });
    }
  }

  /**
   * Remove an allowed path
   */
  removeAllowedPath(filePath) {
    const resolved = path.resolve(filePath);
    const index = this.allowedPaths.indexOf(resolved);
    if (index > -1) {
      this.allowedPaths.splice(index, 1);
      this.emit('path:removed', { path: resolved });
    }
  }

  /**
   * Generate a unique check ID
   */
  generateCheckId() {
    return `check-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Log an audit entry
   */
  logAudit(checkId, action, result) {
    const entry = {
      id: checkId,
      timestamp: new Date(),
      action: {
        type: action.type,
        description: action.description,
      },
      result: {
        allowed: result.allowed,
        dryRun: result.dryRun,
        warnings: result.warnings,
        errors: result.errors,
      },
    };

    this.auditLog.push(entry);

    // Trim audit log if needed
    if (this.auditLog.length > 1000) {
      this.auditLog = this.auditLog.slice(-1000);
    }
  }

  /**
   * Get audit log
   */
  getAuditLog(options = {}) {
    let log = [...this.auditLog];

    if (options.since) {
      log = log.filter((e) => e.timestamp >= options.since);
    }

    if (options.actionType) {
      log = log.filter((e) => e.action.type === options.actionType);
    }

    if (options.limit) {
      log = log.slice(-options.limit);
    }

    return log;
  }

  /**
   * Get safety statistics
   */
  getStats() {
    const total = this.auditLog.length;
    const allowed = this.auditLog.filter((e) => e.result.allowed).length;
    const denied = this.auditLog.filter((e) => !e.result.allowed).length;
    const withWarnings = this.auditLog.filter(
      (e) => e.result.warnings.length > 0,
    ).length;

    return {
      total,
      allowed,
      denied,
      withWarnings,
      pendingConfirmations: this.pendingConfirmations.size,
      dryRun: this.dryRun,
      allowedPaths: this.allowedPaths.length,
      blockedCommands: this.blockedCommands.size,
    };
  }

  /**
   * Create a dry-run preview of an action
   */
  createDryRunPreview(action) {
    const preview = {
      type: action.type,
      description: action.description,
      wouldExecute: true,
      params: action.params,
      preview: null,
    };

    switch (action.type) {
      case 'file_write':
        preview.preview = {
          operation: 'write',
          path: action.params.path,
          size: action.params.content?.length || 0,
          encoding: action.params.encoding || 'utf-8',
        };
        break;
      case 'file_delete':
        preview.preview = {
          operation: 'delete',
          path: action.params.path,
        };
        break;
      case 'shell':
        preview.preview = {
          operation: 'execute',
          command: action.params.command,
          cwd: action.params.cwd || process.cwd(),
        };
        break;
      default:
        preview.preview = {
          operation: action.type,
          params: action.params,
        };
    }

    return preview;
  }
}

// ============================================================================
// Factory Function
// ============================================================================

export function createSafetyGuard(options = {}) {
  return new SafetyGuard(options);
}

// ============================================================================
// Default Export
// ============================================================================

export default SafetyGuard;
