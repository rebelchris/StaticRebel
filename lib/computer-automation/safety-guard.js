/**
 * Computer Automation Safety Guard
 *
 * Safety constraints for computer automation actions:
 * - Path validation and protection
 * - Dangerous command detection
 * - Confirmation requirements
 * - Audit logging
 */

import { EventEmitter } from 'events';
import path from 'path';
import os from 'os';
import fs from 'fs/promises';

const PROTECTED_PATHS = [
  '/etc',
  '/proc',
  '/sys',
  '/dev',
  '/boot',
  '/root',
  '/var/log',
  path.join(os.homedir(), '.ssh'),
  path.join(os.homedir(), '.gnupg'),
  path.join(os.homedir(), '.aws'),
  path.join(os.homedir(), '.config'),
];

const BLOCKED_KEYWORDS = [
  'rm -rf /',
  'rm -rf /*',
  'mkfs',
  'dd if=/dev/zero',
  ':(){ :|:& };:',
  'fork bomb',
];

const DANGEROUS_PATTERNS = [
  /\$\([^)]+\)/,
  /`[^`]+`/,
  />\s*\//,
  />\s*\/etc\//,
  /;\s*rm\s+/,
  /;\s*mkfs\s+/,
  /eval\s*\(/i,
];

export class SafetyGuard extends EventEmitter {
  constructor(options = {}) {
    super();

    this.allowedPaths = options.allowedPaths || [process.cwd(), os.homedir()];
    this.protectedPaths = new Set([...PROTECTED_PATHS, ...(options.protectedPaths || [])]);
    this.confirmationRequired = options.confirmationRequired !== false;
    this.dryRun = options.dryRun || false;
    this.blockedKeywords = new Set([...BLOCKED_KEYWORDS, ...(options.blockedKeywords || [])]);
    this.blockedPatterns = [...DANGEROUS_PATTERNS, ...(options.blockedPatterns || [])];
    this.auditLog = [];
    this.pendingConfirmations = new Map();
  }

  async check(action) {
    const checkId = `check-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const result = {
      checkId,
      allowed: true,
      warnings: [],
      errors: [],
      requiresConfirmation: false,
    };

    try {
      switch (action.type) {
        case 'applescript':
          this.checkAppleScript(action.script, result);
          break;

        case 'file_read':
          await this.checkFilePath(action.path, 'read', result);
          break;

        case 'file_write':
        case 'file_delete':
        case 'file_move':
        case 'file_copy':
          await this.checkFilePath(action.path || action.source, action.type.split('_')[1] || 'write', result);
          if (result.allowed) {
            result.requiresConfirmation = this.confirmationRequired;
          }
          break;

        case 'launch_app':
        case 'quit_app':
        case 'switch_app':
          this.checkApplication(action.bundleId || action.name, result);
          break;

        case 'clipboard_write':
          this.checkClipboard(action.content, result);
          break;

        case 'clipboard_read':
          if (!this.confirmationRequired) break;
          result.warnings.push('Reading clipboard content');
          result.requiresConfirmation = true;
          break;
      }

      result.allowed = result.errors.length === 0;
    } catch (error) {
      result.allowed = false;
      result.errors.push(error.message);
    }

    this.logAudit(checkId, action, result);

    return result;
  }

  checkAppleScript(script, result) {
    if (!script || typeof script !== 'string') {
      result.errors.push('Invalid script');
      return;
    }

    const lowerScript = script.toLowerCase();

    for (const keyword of this.blockedKeywords) {
      if (lowerScript.includes(keyword.toLowerCase())) {
        result.errors.push(`Script contains blocked keyword: ${keyword}`);
        return;
      }
    }

    for (const pattern of this.blockedPatterns) {
      if (pattern.test(script)) {
        result.errors.push(`Script matches dangerous pattern: ${pattern}`);
        return;
      }
    }

    const dangerousCommands = [
      'rm -rf',
      'mkfs',
      'dd',
      'chmod 777',
      'chown',
      'fork',
    ];

    for (const cmd of dangerousCommands) {
      if (lowerScript.includes(cmd)) {
        result.warnings.push(`Script contains potentially dangerous command: ${cmd}`);
        result.requiresConfirmation = this.confirmationRequired;
      }
    }

    if (lowerScript.includes('do shell script') || lowerScript.includes('bash') || lowerScript.includes('sh')) {
      result.warnings.push('Script executes shell commands');
      result.requiresConfirmation = this.confirmationRequired;
    }
  }

  async checkFilePath(filePath, operation, result) {
    if (!filePath) {
      result.errors.push('File path is required');
      return;
    }

    const resolved = path.resolve(filePath);

    for (const protectedPath of this.protectedPaths) {
      const resolvedProtected = path.resolve(protectedPath);
      if (resolved.startsWith(resolvedProtected)) {
        result.errors.push(`Path is protected: ${filePath}`);
        return;
      }
    }

    let isAllowed = false;
    for (const allowedPath of this.allowedPaths) {
      const resolvedAllowed = path.resolve(allowedPath);
      if (resolved.startsWith(resolvedAllowed) || resolved === resolvedAllowed) {
        isAllowed = true;
        break;
      }
    }

    if (!isAllowed) {
      result.errors.push(`Path outside allowed directories: ${filePath}`);
      return;
    }

    if (filePath.includes('..')) {
      result.warnings.push('Path contains traversal attempts');
    }

    if (operation === 'delete' || operation === 'move') {
      try {
        const stats = await fs.stat(resolved);
        if (stats.isDirectory()) {
          result.warnings.push(`Deleting/moving directory: ${filePath}`);
        } else {
          result.warnings.push(`Deleting/moving file: ${filePath}`);
        }
        result.requiresConfirmation = this.confirmationRequired;
      } catch {
        result.errors.push(`Path does not exist: ${filePath}`);
      }
    }
  }

  checkApplication(appName, result) {
    if (!appName || typeof appName !== 'string') {
      result.errors.push('Application name/bundle ID is required');
      return;
    }

    const systemApps = [
      'Finder',
      'SystemUIServer',
      'Dock',
      'MenuExtraserver',
      'WindowServer',
      'loginwindow',
      'launchd',
    ];

    if (systemApps.some(sys => appName.toLowerCase().includes(sys.toLowerCase()))) {
      result.warnings.push(`Attempting to control system application: ${appName}`);
      result.requiresConfirmation = this.confirmationRequired;
    }
  }

  checkClipboard(content, result) {
    if (!content || typeof content !== 'string') {
      result.errors.push('Invalid clipboard content');
      return;
    }

    if (content.length > 100000) {
      result.warnings.push('Large clipboard content');
    }

    if (this.blockedKeywords.some(kw => content.toLowerCase().includes(kw.toLowerCase()))) {
      result.errors.push('Clipboard contains blocked content');
      return;
    }
  }

  async requestConfirmation(action, warnings) {
    const confirmationId = `confirm-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    this.pendingConfirmations.set(confirmationId, {
      id: confirmationId,
      action,
      warnings,
      timestamp: new Date(),
      status: 'pending',
    });

    this.emit('confirmation:required', { confirmationId, action, warnings });

    return confirmationId;
  }

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

  enableDryRun() {
    this.dryRun = true;
    this.emit('mode:changed', { dryRun: true });
  }

  disableDryRun() {
    this.dryRun = false;
    this.emit('mode:changed', { dryRun: false });
  }

  addAllowedPath(filePath) {
    const resolved = path.resolve(filePath);
    if (!this.allowedPaths.includes(resolved)) {
      this.allowedPaths.push(resolved);
      this.emit('path:added', { path: resolved });
    }
  }

  removeAllowedPath(filePath) {
    const resolved = path.resolve(filePath);
    const index = this.allowedPaths.indexOf(resolved);
    if (index > -1) {
      this.allowedPaths.splice(index, 1);
      this.emit('path:removed', { path: resolved });
    }
  }

  logAudit(checkId, action, result) {
    this.auditLog.push({
      id: checkId,
      timestamp: new Date(),
      action: { type: action.type },
      result: {
        allowed: result.allowed,
        warnings: result.warnings,
        errors: result.errors,
      },
    });

    if (this.auditLog.length > 500) {
      this.auditLog = this.auditLog.slice(-500);
    }
  }

  getAuditLog(options = {}) {
    let log = [...this.auditLog];

    if (options.since) {
      log = log.filter(e => e.timestamp >= options.since);
    }

    if (options.actionType) {
      log = log.filter(e => e.action.type === options.actionType);
    }

    if (options.limit) {
      log = log.slice(-options.limit);
    }

    return log;
  }

  getStats() {
    return {
      totalChecks: this.auditLog.length,
      allowed: this.auditLog.filter(e => e.result.allowed).length,
      denied: this.auditLog.filter(e => !e.result.allowed).length,
      withWarnings: this.auditLog.filter(e => e.result.warnings.length > 0).length,
      pendingConfirmations: this.pendingConfirmations.size,
      dryRun: this.dryRun,
      allowedPaths: this.allowedPaths.length,
    };
  }
}

export function createSafetyGuard(options = {}) {
  return new SafetyGuard(options);
}

export default SafetyGuard;
