/**
 * Executor Agent - Specialized agent for tool and command execution
 *
 * Responsibilities:
 * - Execute shell commands
 * - Perform file operations
 * - Run code
 * - Manage execution context
 *
 * @module agents/specialized/executor
 */

import agentRegistry, { AGENT_TYPES, MESSAGE_TYPES } from '../../lib/agentRegistry.js';
import { execute as executeShell, validateCommand, previewCommand } from '../../lib/shellIntegration.js';
import fs from 'fs/promises';
import path from 'path';

/**
 * Create and register the executor agent
 * @returns {Object} Agent instance
 */
export function createExecutorAgent() {
  const agent = agentRegistry.registerAgent({
    name: 'ExecutorAgent',
    type: AGENT_TYPES.EXECUTOR,
    capabilities: [
      'execute_shell',
      'execute_command',
      'read_file',
      'write_file',
      'delete_file',
      'create_directory',
      'run_code',
      'execute_tool',
    ],
    handler: handleMessage,
  });

  return agent;
}

/**
 * Handle incoming messages
 * @param {Object} message - Agent message
 * @returns {Promise<Object>}
 */
async function handleMessage(message) {
  const { type, payload } = message;

  switch (type) {
    case MESSAGE_TYPES.TASK_ASSIGN:
      return handleTask(payload);

    case MESSAGE_TYPES.QUERY:
      return handleQuery(payload);

    default:
      return { status: 'ignored', reason: 'Unknown message type' };
  }
}

/**
 * Handle task assignment
 * @param {Object} payload - Task payload
 * @returns {Promise<Object>}
 */
async function handleTask(payload) {
  const { taskId, type, data } = payload;

  try {
    agentRegistry.updateTask(taskId, 'running');

    let result;

    switch (type) {
      case 'execute_shell':
        result = await executeShellTask(data);
        break;

      case 'read_file':
        result = await readFileTask(data);
        break;

      case 'write_file':
        result = await writeFileTask(data);
        break;

      case 'delete_file':
        result = await deleteFileTask(data);
        break;

      case 'create_directory':
        result = await createDirectoryTask(data);
        break;

      case 'run_code':
        result = await runCodeTask(data);
        break;

      case 'execute_tool':
        result = await executeToolTask(data);
        break;

      default:
        throw new Error(`Unknown task type: ${type}`);
    }

    agentRegistry.completeTask(taskId, result);
    return result;

  } catch (error) {
    agentRegistry.failTask(taskId, error.message);
    throw error;
  }
}

/**
 * Handle queries
 * @param {Object} payload - Query payload
 * @returns {Promise<Object>}
 */
async function handleQuery(payload) {
  const { type, data } = payload;

  switch (type) {
    case 'validate_command':
      return validateCommand(data.command);

    case 'preview_command':
      return previewCommand(data.command, { cwd: data.cwd });

    case 'file_exists':
      return fileExists(data.path);

    case 'list_directory':
      return listDirectory(data.path);

    default:
      return { error: 'Unknown query type' };
  }
}

// ============================================================================
// Task Implementations
// ============================================================================

/**
 * Execute shell command task
 * @param {Object} data - Task data
 * @returns {Promise<Object>}
 */
async function executeShellTask(data) {
  const { command, cwd, env, timeout, dryRun } = data;

  // Validate command
  const validation = validateCommand(command);
  if (!validation.valid) {
    return {
      success: false,
      error: 'Command validation failed',
      validation,
    };
  }

  // Execute command
  const result = await executeShell(command, {
    cwd,
    env,
    timeout,
    dryRun,
  });

  return {
    success: result.success,
    exitCode: result.exitCode,
    stdout: result.stdout,
    stderr: result.stderr,
    duration: result.duration,
    command: result.command,
  };
}

/**
 * Read file task
 * @param {Object} data - Task data
 * @returns {Promise<Object>}
 */
async function readFileTask(data) {
  const { path: filePath, encoding = 'utf-8', maxSize } = data;

  try {
    // Check file stats
    const stats = await fs.stat(filePath);

    if (maxSize && stats.size > maxSize) {
      return {
        success: false,
        error: `File too large: ${stats.size} bytes (max: ${maxSize})`,
        size: stats.size,
      };
    }

    const content = await fs.readFile(filePath, encoding);

    return {
      success: true,
      path: filePath,
      content,
      size: stats.size,
      encoding,
    };

  } catch (error) {
    return {
      success: false,
      error: error.message,
      path: filePath,
    };
  }
}

/**
 * Write file task
 * @param {Object} data - Task data
 * @returns {Promise<Object>}
 */
async function writeFileTask(data) {
  const { path: filePath, content, encoding = 'utf-8', backup = true } = data;

  try {
    // Ensure directory exists
    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });

    // Create backup if file exists and backup is requested
    if (backup) {
      try {
        await fs.access(filePath);
        const backupPath = `${filePath}.backup-${Date.now()}`;
        await fs.copyFile(filePath, backupPath);
      } catch {
        // File doesn't exist, no backup needed
      }
    }

    // Write file
    await fs.writeFile(filePath, content, encoding);

    return {
      success: true,
      path: filePath,
      size: Buffer.byteLength(content, encoding),
      encoding,
    };

  } catch (error) {
    return {
      success: false,
      error: error.message,
      path: filePath,
    };
  }
}

/**
 * Delete file task
 * @param {Object} data - Task data
 * @returns {Promise<Object>}
 */
async function deleteFileTask(data) {
  const { path: filePath, backup = true } = data;

  try {
    // Create backup before deletion
    if (backup) {
      try {
        await fs.access(filePath);
        const backupPath = `${filePath}.deleted-${Date.now()}`;
        await fs.rename(filePath, backupPath);

        return {
          success: true,
          path: filePath,
          backupPath,
          message: 'File moved to backup',
        };
      } catch {
        // File doesn't exist
        return {
          success: false,
          error: 'File not found',
          path: filePath,
        };
      }
    }

    // Direct deletion
    await fs.unlink(filePath);

    return {
      success: true,
      path: filePath,
      message: 'File deleted',
    };

  } catch (error) {
    return {
      success: false,
      error: error.message,
      path: filePath,
    };
  }
}

/**
 * Create directory task
 * @param {Object} data - Task data
 * @returns {Promise<Object>}
 */
async function createDirectoryTask(data) {
  const { path: dirPath, recursive = true } = data;

  try {
    await fs.mkdir(dirPath, { recursive });

    return {
      success: true,
      path: dirPath,
      recursive,
    };

  } catch (error) {
    return {
      success: false,
      error: error.message,
      path: dirPath,
    };
  }
}

/**
 * Run code task
 * @param {Object} data - Task data
 * @returns {Promise<Object>}
 */
async function runCodeTask(data) {
  const { code, language, timeout = 30000 } = data;

  switch (language) {
    case 'javascript':
    case 'js':
      return runJavaScript(code, timeout);

    case 'python':
    case 'py':
      return runPython(code, timeout);

    case 'bash':
    case 'shell':
      return runBash(code, timeout);

    default:
      return {
        success: false,
        error: `Unsupported language: ${language}`,
      };
  }
}

/**
 * Execute tool task
 * @param {Object} data - Task data
 * @returns {Promise<Object>}
 */
async function executeToolTask(data) {
  const { toolName, params } = data;

  // This would integrate with the tool registry
  // For now, return a placeholder
  return {
    success: true,
    tool: toolName,
    params,
    result: `Tool ${toolName} executed (placeholder)`,
  };
}

// ============================================================================
// Code Execution
// ============================================================================

/**
 * Run JavaScript code
 * @param {string} code - JavaScript code
 * @param {number} timeout - Timeout in ms
 * @returns {Promise<Object>}
 */
async function runJavaScript(code, timeout) {
  const { spawn } = await import('child_process');

  return new Promise((resolve) => {
    const child = spawn('node', ['-e', code], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let killed = false;

    const timeoutId = setTimeout(() => {
      killed = true;
      child.kill('SIGTERM');
    }, timeout);

    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('close', (exitCode) => {
      clearTimeout(timeoutId);

      resolve({
        success: exitCode === 0 && !killed,
        exitCode: killed ? -1 : exitCode,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        killed,
        language: 'javascript',
      });
    });

    child.on('error', (error) => {
      clearTimeout(timeoutId);

      resolve({
        success: false,
        error: error.message,
        language: 'javascript',
      });
    });
  });
}

/**
 * Run Python code
 * @param {string} code - Python code
 * @param {number} timeout - Timeout in ms
 * @returns {Promise<Object>}
 */
async function runPython(code, timeout) {
  const { spawn } = await import('child_process');

  return new Promise((resolve) => {
    const child = spawn('python3', ['-c', code], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let killed = false;

    const timeoutId = setTimeout(() => {
      killed = true;
      child.kill('SIGTERM');
    }, timeout);

    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('close', (exitCode) => {
      clearTimeout(timeoutId);

      resolve({
        success: exitCode === 0 && !killed,
        exitCode: killed ? -1 : exitCode,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        killed,
        language: 'python',
      });
    });

    child.on('error', (error) => {
      clearTimeout(timeoutId);

      resolve({
        success: false,
        error: error.message,
        language: 'python',
      });
    });
  });
}

/**
 * Run Bash code
 * @param {string} code - Bash code
 * @param {number} timeout - Timeout in ms
 * @returns {Promise<Object>}
 */
async function runBash(code, timeout) {
  const result = await executeShell(code, { timeout });

  return {
    success: result.success,
    exitCode: result.exitCode,
    stdout: result.stdout,
    stderr: result.stderr,
    language: 'bash',
  };
}

// ============================================================================
// Query Helpers
// ============================================================================

/**
 * Check if file exists
 * @param {string} filePath - File path
 * @returns {Promise<Object>}
 */
async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return { exists: true, path: filePath };
  } catch {
    return { exists: false, path: filePath };
  }
}

/**
 * List directory contents
 * @param {string} dirPath - Directory path
 * @returns {Promise<Object>}
 */
async function listDirectory(dirPath) {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });

    return {
      success: true,
      path: dirPath,
      entries: entries.map(entry => ({
        name: entry.name,
        type: entry.isDirectory() ? 'directory' : 'file',
      })),
    };

  } catch (error) {
    return {
      success: false,
      error: error.message,
      path: dirPath,
    };
  }
}

// ============================================================================
// Export
// ============================================================================

export default {
  createExecutorAgent,
};
