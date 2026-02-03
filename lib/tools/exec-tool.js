/**
 * Exec Tool - Safe shell command execution for StaticRebel
 * 
 * Provides controlled shell command execution with:
 * - Timeout handling
 * - Working directory support
 * - Output capture (stdout/stderr)
 * - Basic command allowlisting
 */

import { spawn } from 'child_process';
import path from 'path';

// ============================================================================
// Command Safety
// ============================================================================

// Commands that are always blocked (dangerous)
const BLOCKED_COMMANDS = [
  /^rm\s+-rf\s+[\/~]/,      // rm -rf on root or home
  /^rm\s+.*--no-preserve-root/,
  /^mkfs/,                   // Filesystem formatting
  /^dd\s+/,                  // Raw disk operations
  /^:\(\)\{/,                // Fork bomb
  />\s*\/dev\/sd/,           // Write to raw disk
  /^shutdown/,
  /^reboot/,
  /^halt/,
  /^poweroff/,
  /^init\s+/,
  /^systemctl\s+(stop|disable|mask)\s+(ssh|network|systemd)/i,
  /curl.*\|\s*(ba)?sh/,      // Pipe curl to shell
  /wget.*\|\s*(ba)?sh/,
];

// Commands that require confirmation (potentially destructive)
const WARN_COMMANDS = [
  /^rm\s/,           // Any rm command
  /^git\s+push\s+-f/, // Force push
  /^git\s+reset\s+--hard/,
  /^npm\s+publish/,
  /^yarn\s+publish/,
  /^chmod\s+777/,
  /^chown/,
  /DROP\s+TABLE/i,
  /TRUNCATE/i,
  /DELETE\s+FROM/i,
];

/**
 * Check if a command is safe to execute
 * @param {string} command - Command to check
 * @returns {{ safe: boolean, blocked?: boolean, warning?: string }}
 */
function checkCommandSafety(command) {
  // Check blocked commands
  for (const pattern of BLOCKED_COMMANDS) {
    if (pattern.test(command)) {
      return {
        safe: false,
        blocked: true,
        warning: `Command blocked for safety: matches pattern ${pattern}`
      };
    }
  }
  
  // Check warning commands
  for (const pattern of WARN_COMMANDS) {
    if (pattern.test(command)) {
      return {
        safe: true,
        blocked: false,
        warning: `Potentially destructive command: ${command.slice(0, 50)}`
      };
    }
  }
  
  return { safe: true, blocked: false };
}

// ============================================================================
// Exec Tool Definition
// ============================================================================

export const execTool = {
  name: 'exec',
  description: 'Execute a shell command. Returns stdout, stderr, and exit code.',
  schema: {
    command: 'string',   // Shell command to execute (required)
    cwd: 'string?',      // Working directory (optional)
    timeout: 'number?'   // Timeout in ms (default: 30000)
  },
  handler: async (params, context = {}) => {
    const { command, cwd, timeout = 30000 } = params;
    const baseDir = context.projectRoot || context.cwd || process.cwd();
    
    // Validate command safety
    const safety = checkCommandSafety(command);
    if (safety.blocked) {
      throw new Error(safety.warning);
    }
    
    // Resolve working directory
    let workDir = baseDir;
    if (cwd) {
      workDir = path.resolve(baseDir, cwd);
      // Ensure it's within the project
      if (!workDir.startsWith(path.resolve(baseDir))) {
        throw new Error(`Working directory must be within project: ${cwd}`);
      }
    }
    
    return new Promise((resolve, reject) => {
      const isWindows = process.platform === 'win32';
      const shell = isWindows ? 'cmd' : '/bin/sh';
      const shellFlag = isWindows ? '/c' : '-c';
      
      const child = spawn(shell, [shellFlag, command], {
        cwd: workDir,
        env: {
          ...process.env,
          // Limit some environment variables for safety
          TERM: 'dumb',
          NO_COLOR: '1'
        },
        stdio: ['pipe', 'pipe', 'pipe']
      });
      
      let stdout = '';
      let stderr = '';
      let killed = false;
      
      // Set up timeout
      const timeoutId = setTimeout(() => {
        killed = true;
        child.kill('SIGTERM');
        // Force kill after 5 seconds if still running
        setTimeout(() => {
          if (!child.killed) {
            child.kill('SIGKILL');
          }
        }, 5000);
      }, timeout);
      
      child.stdout.on('data', (data) => {
        stdout += data.toString();
        // Limit output size (1MB)
        if (stdout.length > 1024 * 1024) {
          stdout = stdout.slice(0, 1024 * 1024) + '\n... [output truncated]';
          child.kill('SIGTERM');
        }
      });
      
      child.stderr.on('data', (data) => {
        stderr += data.toString();
        // Limit output size (1MB)
        if (stderr.length > 1024 * 1024) {
          stderr = stderr.slice(0, 1024 * 1024) + '\n... [output truncated]';
        }
      });
      
      child.on('close', (code) => {
        clearTimeout(timeoutId);
        
        resolve({
          command,
          cwd: workDir,
          stdout: stdout.trim(),
          stderr: stderr.trim(),
          exitCode: code || 0,
          killed,
          timedOut: killed,
          duration: null, // Could track this
          warning: safety.warning || null
        });
      });
      
      child.on('error', (error) => {
        clearTimeout(timeoutId);
        reject(new Error(`Command execution failed: ${error.message}`));
      });
    });
  },
  rateLimit: {
    requests: 10,
    window: '1m'
  },
  metadata: {
    category: 'system',
    safe: false,  // Can modify system state
    requiresConfirmation: false  // Some commands might need confirmation
  }
};

// ============================================================================
// Register Exec Tool
// ============================================================================

/**
 * Register the exec tool with a registry
 * @param {ToolRegistry} registry - The tool registry to register with
 */
export function registerExecTool(registry) {
  if (!registry.has(execTool.name)) {
    registry.register(execTool.name, execTool);
    console.log(`⚡ Registered exec tool`);
  } else {
    console.log(`⚠️ Tool "exec" already registered, skipping`);
  }
}

export default execTool;
