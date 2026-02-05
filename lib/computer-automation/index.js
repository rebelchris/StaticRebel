/**
 * Computer Automation Module - Main Entry Point
 *
 * Provides comprehensive macOS automation capabilities:
 * - AppleScript execution
 * - Application control (launch, quit, switch)
 * - File operations with safety checks
 * - Clipboard management
 * - System control
 *
 * @module computer-automation
 */

import { EventEmitter } from 'events';
import path from 'path';
import os from 'os';

import { AppleScriptExecutor, createAppleScriptExecutor } from './apple-script.js';
import { AppController, createAppController } from './application-control.js';
import { FileAutomation, createFileAutomation } from './file-operations.js';
import { ClipboardManager, createClipboardManager } from './clipboard.js';
import { SafetyGuard, createSafetyGuard } from './safety-guard.js';

export const COMPUTER_AUTOMATION_VERSION = '1.0.0';

const DEFAULT_CONFIG = {
  safetyLevel: 'medium',
  allowedPaths: [process.cwd(), os.homedir()],
  protectedPaths: [
    '/etc', '/proc', '/sys', '/dev', '/boot',
    path.join(os.homedir(), '.ssh'),
    path.join(os.homedir(), '.gnupg'),
  ],
  requireConfirmation: true,
  dryRun: false,
  timeout: 30000,
};

export class ComputerAutomation extends EventEmitter {
  constructor(options = {}) {
    super();

    this.config = { ...DEFAULT_CONFIG, ...options };

    this.safety = createSafetyGuard({
      allowedPaths: this.config.allowedPaths,
      protectedPaths: this.config.protectedPaths,
      confirmationRequired: this.config.requireConfirmation,
      dryRun: this.config.dryRun,
    });

    this.appleScript = createAppleScriptExecutor({
      safety: this.safety,
      timeout: this.config.timeout,
    });

    this.apps = createAppController({
      safety: this.safety,
      timeout: this.config.timeout,
    });

    this.files = createFileAutomation({
      safety: this.safety,
      allowedPaths: this.config.allowedPaths,
    });

    this.clipboard = createClipboardManager({
      safety: this.safety,
    });

    this.actionHistory = [];

    this.setupEventForwarding();
  }

  setupEventForwarding() {
    this.safety.on('confirmation:required', (data) => {
      this.emit('confirmation:required', data);
    });

    this.safety.on('action:executed', (data) => {
      this.actionHistory.push(data);
      this.emit('action:executed', data);
    });
  }

  async executeAction(action) {
    const startTime = Date.now();

    try {
      const result = await this.safety.check(action);

      if (!result.allowed) {
        throw new Error(`Action not allowed: ${result.errors.join(', ')}`);
      }

      if (result.requiresConfirmation) {
        const confirmationId = await this.safety.requestConfirmation(
          action,
          result.warnings
        );
        return { status: 'pending_confirmation', confirmationId };
      }

      const executionResult = await this.runAction(action);

      this.safety.logAudit(`action-${Date.now()}`, action, {
        allowed: true,
        warnings: result.warnings,
        errors: [],
      });

      this.emit('action:executed', {
        action,
        result: executionResult,
        duration: Date.now() - startTime,
      });

      return { status: 'success', result: executionResult };
    } catch (error) {
      this.emit('action:failed', { action, error: error.message });

      return { status: 'error', error: error.message };
    }
  }

  async runAction(action) {
    switch (action.type) {
      case 'applescript':
        return this.appleScript.execute(action.script, action.options);

      case 'launch_app':
        return this.apps.launch(action.bundleId || action.name);

      case 'quit_app':
        return this.apps.quit(action.bundleId || action.name);

      case 'switch_app':
        return this.apps.switchTo(action.bundleId || action.name);

      case 'get_running_apps':
        return this.apps.getRunningApplications();

      case 'file_read':
        return this.files.read(action.path);

      case 'file_write':
        return this.files.write(action.path, action.content, action.options);

      case 'file_delete':
        return this.files.delete(action.path);

      case 'file_move':
        return this.files.move(action.source, action.destination);

      case 'file_copy':
        return this.files.copy(action.source, action.destination);

      case 'list_directory':
        return this.files.list(action.path);

      case 'create_directory':
        return this.files.createDirectory(action.path);

      case 'clipboard_read':
        return this.clipboard.read();

      case 'clipboard_write':
        return this.clipboard.write(action.content, action.type);

      case 'clipboard_clear':
        return this.clipboard.clear();

      case 'system_volume':
        return this.appleScript.execute(`set volume ${action.value}`);

      case 'system_brightness':
        return this.appleScript.execute(
          `set brightness level ${action.level}`
        );

      default:
        throw new Error(`Unknown action type: ${action.type}`);
    }
  }

  setSafetyLevel(level) {
    const levels = { low: 0, medium: 1, high: 2 };
    const current = levels[this.config.safetyLevel] || 1;
    const target = levels[level] || 1;

    if (target > current) {
      this.config.safetyLevel = level;
      this.safety.confirmationRequired = true;
    }

    this.emit('safety:level_changed', { level });
  }

  enableDryRun() {
    this.safety.enableDryRun();
  }

  disableDryRun() {
    this.safety.disableDryRun();
  }

  addAllowedPath(path) {
    this.safety.addAllowedPath(path);
    this.config.allowedPaths.push(path);
  }

  removeAllowedPath(path) {
    this.safety.removeAllowedPath(path);
    this.config.allowedPaths = this.config.allowedPaths.filter(
      (p) => p !== path
    );
  }

  getHistory(limit = 50) {
    return this.actionHistory.slice(-limit);
  }

  clearHistory() {
    this.actionHistory = [];
  }

  getStatus() {
    return {
      version: COMPUTER_AUTOMATION_VERSION,
      safetyLevel: this.config.safetyLevel,
      dryRun: this.safety.dryRun,
      allowedPaths: this.config.allowedPaths,
      actionsExecuted: this.actionHistory.length,
      pendingConfirmations: this.safety.pendingConfirmations.size,
    };
  }
}

export function createComputerAutomation(options = {}) {
  return new ComputerAutomation(options);
}

export {
  AppleScriptExecutor,
  createAppleScriptExecutor,
  AppController,
  createAppController,
  FileAutomation,
  createFileAutomation,
  ClipboardManager,
  createClipboardManager,
};

export default ComputerAutomation;
