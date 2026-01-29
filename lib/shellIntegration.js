/**
 * Shell Integration - Enhanced shell command execution with safety features
 *
 * Features:
 * - Dry-run mode with preview
 * - Command simulation and validation
 * - Environment variable management
 * - Working directory context tracking
 * - Comprehensive logging
 *
 * @module shellIntegration
 */

import { spawn } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import os from 'os';
import fs from 'fs/promises';

// ============================================================================
// Configuration
// ============================================================================

const DEFAULT_TIMEOUT = 30000; // 30 seconds
const MAX_OUTPUT_SIZE = 1024 * 1024; // 1MB

// Blocked commands and patterns
const BLOCKED_COMMANDS = [
  'rm -rf /',
  'rm -rf /*',
  'rm -rf ~',
  'rm -rf ~/*',
  'mkfs',
  'dd if=/dev/zero',
  'dd if=/dev/random',
  'dd if=/dev/urandom',
  ':(){ :|:& };:', // Fork bomb
  'while true',
  'chmod 777 /',
  'chmod -R 777 /',
  '> /dev/sda',
  '> /dev/hda',
  'sudo su',
  'sudo -i',
  'sudo /bin/bash',
  'sudo /bin/sh',
];

const BLOCKED_PATTERNS = [
  /curl\s+.*\|\s*(ba)?sh/i,
  /wget\s+.*\|\s*(ba)?sh/i,
  /eval\s*\(/i,
  /child_process\.exec/i,
  />\s*\/dev\/sda/i,
  />\s*\/dev\/hda/i,
];

// ============================================================================
// Types & Interfaces
// ============================================================================

/**
 * @typedef {Object} ShellResult
 * @property {boolean} success - Whether command succeeded
 * @property {string} stdout - Standard output
 * @property {string} stderr - Standard error
 * @property {number} exitCode - Exit code
 * @property {number} duration - Execution duration in ms
 * @property {Date} timestamp - Execution timestamp
 * @property {string} command - Executed command
 * @property {string} cwd - Working directory
 */

/**
 * @typedef {Object} ValidationResult
 * @property {boolean} valid - Whether command is valid
 * @property {string[]} warnings - Warning messages
 * @property {string[]} errors - Error messages
 * @property {string} riskLevel - 'low', 'medium', 'high', 'critical'
 */

/**
 * @typedef {Object} SimulationResult
 * @property {boolean} wouldExecute - Whether command would execute
 * @property {string[]} affectedFiles - Files that would be affected
 * @property {string[]} sideEffects - Predicted side effects
 * @property {string} explanation - Human-readable explanation
 */

// ============================================================================
// Command Validation
// ============================================================================

/**
 * Validate a shell command for safety
 * @param {string} command - Command to validate
 * @returns {ValidationResult}
 */
export function validateCommand(command) {
  const result = {
    valid: true,
    warnings: [],
    errors: [],
    riskLevel: 'low',
  };

  if (!command || typeof command !== 'string') {
    result.valid = false;
    result.errors.push('Command must be a non-empty string');
    result.riskLevel = 'critical';
    return result;
  }

  const normalizedCmd = command.toLowerCase().trim();

  // Check blocked commands
  for (const blocked of BLOCKED_COMMANDS) {
    if (normalizedCmd.includes(blocked.toLowerCase())) {
      result.valid = false;
      result.errors.push(`Command contains blocked pattern: ${blocked}`);
      result.riskLevel = 'critical';
      return result;
    }
  }

  // Check blocked patterns
  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(command)) {
      result.valid = false;
      result.errors.push(`Command matches dangerous pattern: ${pattern}`);
      result.riskLevel = 'critical';
      return result;
    }
  }

  // Risk assessment
  const riskIndicators = [
    { pattern: /\brm\b/, level: 'high', warning: 'File deletion command detected' },
    { pattern: /\bdd\b/, level: 'high', warning: 'Disk operation command detected' },
    { pattern: /\bchmod\b/, level: 'medium', warning: 'Permission modification detected' },
    { pattern: /\bchown\b/, level: 'medium', warning: 'Ownership modification detected' },
    { pattern: /\bsudo\b/, level: 'high', warning: 'Elevated privileges requested' },
    { pattern: />\s*\//, level: 'high', warning: 'Output redirection to system path' },
    { pattern: /\|\s*sh/, level: 'high', warning: 'Piping to shell detected' },
    { pattern: /curl.*-o\s*\//, level: 'medium', warning: 'Downloading to system path' },
    { pattern: /npm.*-g/, level: 'low', warning: 'Global npm operation' },
    { pattern: /git.*push/, level: 'low', warning: 'Git push operation' },
    { pattern: /git.*force/, level: 'medium', warning: 'Force git operation detected' },
  ];

  for (const indicator of riskIndicators) {
    if (indicator.pattern.test(normalizedCmd)) {
      result.warnings.push(indicator.warning);
      if (getRiskLevelValue(indicator.level) > getRiskLevelValue(result.riskLevel)) {
        result.riskLevel = indicator.level;
      }
    }
  }

  return result;
}

/**
 * Get numeric risk level value
 * @param {string} level - Risk level string
 * @returns {number}
 */
function getRiskLevelValue(level) {
  const values = { low: 0, medium: 1, high: 2, critical: 3 };
  return values[level] || 0;
}

// ============================================================================
// Command Simulation
// ============================================================================

/**
 * Simulate a command execution (dry-run)
 * @param {string} command - Command to simulate
 * @param {Object} options - Simulation options
 * @returns {Promise<SimulationResult>}
 */
export async function simulateCommand(command, options = {}) {
  const result = {
    wouldExecute: true,
    affectedFiles: [],
    sideEffects: [],
    explanation: '',
  };

  const normalizedCmd = command.toLowerCase().trim();
  const cwd = options.cwd || process.cwd();

  // Parse command to predict effects
  const parts = normalizedCmd.split(/\s+/);
  const baseCmd = parts[0];

  switch (baseCmd) {
    case 'rm':
    case 'del':
      result.explanation = 'This command would delete files/directories';
      result.sideEffects.push('Files will be permanently removed');
      // Try to identify affected files
      for (let i = 1; i < parts.length; i++) {
        if (!parts[i].startsWith('-')) {
          result.affectedFiles.push(path.resolve(cwd, parts[i]));
        }
      }
      break;

    case 'mv':
    case 'move':
      result.explanation = 'This command would move/rename files';
      result.sideEffects.push('Files will be relocated');
      if (parts.length >= 3) {
        result.affectedFiles.push(path.resolve(cwd, parts[parts.length - 2]));
        result.affectedFiles.push(path.resolve(cwd, parts[parts.length - 1]));
      }
      break;

    case 'cp':
    case 'copy':
      result.explanation = 'This command would copy files';
      result.sideEffects.push('New files will be created');
      break;

    case 'mkdir':
      result.explanation = 'This command would create directories';
      result.sideEffects.push('New directories will be created');
      break;

    case 'npm':
    case 'yarn':
    case 'pnpm':
      if (normalizedCmd.includes('install') || normalizedCmd.includes('add')) {
        result.explanation = 'This command would install packages';
        result.sideEffects.push('node_modules will be modified');
        result.sideEffects.push('package files may be updated');
      } else if (normalizedCmd.includes('uninstall') || normalizedCmd.includes('remove')) {
        result.explanation = 'This command would remove packages';
        result.sideEffects.push('Packages will be removed from node_modules');
      }
      break;

    case 'git':
      if (normalizedCmd.includes('commit')) {
        result.explanation = 'This command would create a git commit';
        result.sideEffects.push('Changes will be committed to repository');
      } else if (normalizedCmd.includes('push')) {
        result.explanation = 'This command would push to remote';
        result.sideEffects.push('Local commits will be pushed to remote');
      } else if (normalizedCmd.includes('checkout')) {
        result.explanation = 'This command would switch branches';
        result.sideEffects.push('Working directory may change');
      } else if (normalizedCmd.includes('reset') || normalizedCmd.includes('revert')) {
        result.explanation = 'This command would modify git history';
        result.sideEffects.push('Changes may be lost');
        result.wouldExecute = false; // Require explicit confirmation
      }
      break;

    case 'docker':
      result.explanation = 'This command would interact with Docker';
      result.sideEffects.push('Containers/images may be modified');
      break;

    default:
      result.explanation = `This command would execute: ${baseCmd}`;
  }

  return result;
}

/**
 * Generate command preview
 * @param {string} command - Command to preview
 * @param {Object} options - Preview options
 * @returns {Promise<string>}
 */
export async function previewCommand(command, options = {}) {
  const validation = validateCommand(command);
  const simulation = await simulateCommand(command, options);

  let preview = `Command: ${command}\n`;
  preview += `Working Directory: ${options.cwd || process.cwd()}\n\n`;

  if (!validation.valid) {
    preview += `❌ VALIDATION FAILED\n`;
    preview += validation.errors.map(e => `  - ${e}`).join('\n');
    return preview;
  }

  preview += `✅ Validation: Passed (${validation.riskLevel} risk)\n\n`;
  preview += `Simulation: ${simulation.explanation}\n`;

  if (simulation.affectedFiles.length > 0) {
    preview += `\nAffected Files:\n`;
    preview += simulation.affectedFiles.map(f => `  - ${f}`).join('\n');
  }

  if (simulation.sideEffects.length > 0) {
    preview += `\nSide Effects:\n`;
    preview += simulation.sideEffects.map(e => `  - ${e}`).join('\n');
  }

  if (validation.warnings.length > 0) {
    preview += `\nWarnings:\n`;
    preview += validation.warnings.map(w => `  ⚠️  ${w}`).join('\n');
  }

  return preview;
}

// ============================================================================
// Command Execution
// ============================================================================

/**
 * Execute a shell command
 * @param {string} command - Command to execute
 * @param {Object} options - Execution options
 * @returns {Promise<ShellResult>}
 */
export async function execute(command, options = {}) {
  const startTime = Date.now();
  const cwd = options.cwd || process.cwd();

  // Validate command
  const validation = validateCommand(command);
  if (!validation.valid) {
    return {
      success: false,
      stdout: '',
      stderr: validation.errors.join('\n'),
      exitCode: -1,
      duration: 0,
      timestamp: new Date(),
      command,
      cwd,
    };
  }

  // Dry-run mode
  if (options.dryRun) {
    const preview = await previewCommand(command, options);
    return {
      success: true,
      stdout: preview,
      stderr: '',
      exitCode: 0,
      duration: 0,
      timestamp: new Date(),
      command: `[DRY-RUN] ${command}`,
      cwd,
    };
  }

  // Check if confirmation is required
  if (options.requireConfirmation && validation.riskLevel !== 'low') {
    const simulation = await simulateCommand(command, options);
    if (!simulation.wouldExecute) {
      return {
        success: false,
        stdout: '',
        stderr: 'Command requires explicit confirmation due to risk level',
        exitCode: -1,
        duration: 0,
        timestamp: new Date(),
        command,
        cwd,
      };
    }
  }

  return new Promise((resolve) => {
    const isWindows = process.platform === 'win32';
    const shell = isWindows ? 'cmd' : 'sh';
    const flag = isWindows ? '/c' : '-c';

    const child = spawn(shell, [flag, command], {
      cwd,
      env: { ...process.env, ...options.env },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let killed = false;

    // Timeout handling
    const timeout = setTimeout(() => {
      killed = true;
      child.kill('SIGTERM');
      setTimeout(() => {
        if (!child.killed) {
          child.kill('SIGKILL');
        }
      }, 5000);
    }, options.timeout || DEFAULT_TIMEOUT);

    // Collect stdout
    child.stdout.on('data', (data) => {
      stdout += data.toString();
      if (stdout.length > MAX_OUTPUT_SIZE) {
        child.stdout.pause();
        stdout += '\n... (output truncated)';
      }
    });

    // Collect stderr
    child.stderr.on('data', (data) => {
      stderr += data.toString();
      if (stderr.length > MAX_OUTPUT_SIZE) {
        child.stderr.pause();
        stderr += '\n... (output truncated)';
      }
    });

    // Handle completion
    child.on('close', (exitCode) => {
      clearTimeout(timeout);

      resolve({
        success: exitCode === 0 && !killed,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        exitCode: killed ? -1 : exitCode,
        duration: Date.now() - startTime,
        timestamp: new Date(),
        command,
        cwd,
      });
    });

    // Handle errors
    child.on('error', (error) => {
      clearTimeout(timeout);

      resolve({
        success: false,
        stdout: stdout.trim(),
        stderr: error.message,
        exitCode: -1,
        duration: Date.now() - startTime,
        timestamp: new Date(),
        command,
        cwd,
      });
    });

    // Write stdin if provided
    if (options.stdin) {
      child.stdin.write(options.stdin);
      child.stdin.end();
    }
  });
}

/**
 * Execute multiple commands in sequence
 * @param {string[]} commands - Commands to execute
 * @param {Object} options - Execution options
 * @returns {Promise<ShellResult[]>}
 */
export async function executeBatch(commands, options = {}) {
  const results = [];

  for (const command of commands) {
    const result = await execute(command, options);
    results.push(result);

    // Stop on first failure if stopOnError is true
    if (!result.success && options.stopOnError) {
      break;
    }
  }

  return results;
}

// ============================================================================
// Environment Management
// ============================================================================

/**
 * Get current environment variables
 * @returns {Object}
 */
export function getEnvironment() {
  return { ...process.env };
}

/**
 * Set environment variables
 * @param {Object} vars - Variables to set
 * @param {boolean} persist - Whether to persist across sessions
 */
export function setEnvironment(vars, persist = false) {
  Object.assign(process.env, vars);

  if (persist) {
    // Note: Actual persistence would require writing to shell config
    console.log('[ShellIntegration] Note: Persistent environment changes require shell configuration updates');
  }
}

/**
 * Get shell configuration
 * @returns {Object}
 */
export function getShellConfig() {
  const shell = process.env.SHELL || (process.platform === 'win32' ? 'cmd' : 'sh');
  const shellName = path.basename(shell);

  return {
    shell,
    name: shellName,
    platform: process.platform,
    isWindows: process.platform === 'win32',
    home: os.homedir(),
    cwd: process.cwd(),
  };
}

// ============================================================================
// Command History & Logging
// ============================================================================

const commandHistory = [];
const MAX_HISTORY_SIZE = 100;

/**
 * Log a command execution
 * @param {ShellResult} result - Execution result
 */
function logCommand(result) {
  commandHistory.push({
    command: result.command,
    cwd: result.cwd,
    success: result.success,
    timestamp: result.timestamp,
    duration: result.duration,
  });

  // Trim history
  if (commandHistory.length > MAX_HISTORY_SIZE) {
    commandHistory.shift();
  }
}

/**
 * Get command history
 * @param {number} limit - Maximum number of entries
 * @returns {Array<Object>}
 */
export function getCommandHistory(limit = 20) {
  return commandHistory.slice(-limit);
}

/**
 * Clear command history
 */
export function clearCommandHistory() {
  commandHistory.length = 0;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Check if a command exists
 * @param {string} command - Command to check
 * @returns {Promise<boolean>}
 */
export async function commandExists(command) {
  const checkCmd = process.platform === 'win32'
    ? `where ${command}`
    : `which ${command}`;

  const result = await execute(checkCmd, { timeout: 5000 });
  return result.success;
}

/**
 * Get command help/usage
 * @param {string} command - Command to get help for
 * @returns {Promise<string>}
 */
export async function getCommandHelp(command) {
  const result = await execute(`${command} --help`, { timeout: 5000 });
  return result.success ? result.stdout : result.stderr;
}

/**
 * Quote a string for shell safety
 * @param {string} str - String to quote
 * @returns {string}
 */
export function shellQuote(str) {
  if (process.platform === 'win32') {
    // Windows quoting
    if (/[\s&|<>^"]/.test(str)) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  } else {
    // Unix quoting
    if (/[^\w@%+=:,./-]/.test(str)) {
      return `'${str.replace(/'/g, "'\"'\"'")}'`;
    }
    return str;
  }
}

// ============================================================================
// Export Default
// ============================================================================

export default {
  validateCommand,
  simulateCommand,
  previewCommand,
  execute,
  executeBatch,
  getEnvironment,
  setEnvironment,
  getShellConfig,
  getCommandHistory,
  clearCommandHistory,
  commandExists,
  getCommandHelp,
  shellQuote,
};
