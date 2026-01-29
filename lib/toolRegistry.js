/**
 * Tool Registry - Standardized tool interface for StaticRebel
 *
 * Provides:
 * - Standard tool schema
 * - Safety constraints
 * - Dry-run mode
 * - Tool discovery and registration
 */

import { EventEmitter } from 'events';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import os from 'os';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ============================================================================
// Tool Schema Definition
// ============================================================================

/**
 * Standard tool schema
 * @typedef {Object} ToolSchema
 * @property {string} name - Unique tool identifier
 * @property {string} description - Human-readable description
 * @property {string} version - Tool version (semver)
 * @property {Object} inputSchema - JSON Schema for inputs
 * @property {Object} outputSchema - JSON Schema for outputs
 * @property {string[]} tags - Tool categorization tags
 * @property {number} autonomyLevel - Required autonomy level (0-3)
 * @property {SafetyConstraint[]} safetyConstraints - Safety rules
 * @property {boolean} dryRunSupported - Whether dry-run is supported
 * @property {boolean} requiresConfirmation - Whether user confirmation is needed
 * @property {Function} handler - The tool implementation
 */

/**
 * Safety constraint definition
 * @typedef {Object} SafetyConstraint
 * @property {string} type - 'readonly' | 'destructive' | 'network' | 'filesystem' | 'shell'
 * @property {string} description - Human-readable description
 * @property {Function} check - Function to validate constraint
 */

// ============================================================================
// Built-in Tools
// ============================================================================

/**
 * File Read Tool - Read file contents
 */
export const fileReadTool = {
  name: 'file_read',
  description: 'Read contents of a file',
  version: '1.0.0',
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'File path to read' },
      encoding: { type: 'string', default: 'utf-8' },
      maxSize: {
        type: 'number',
        default: 1000000,
        description: 'Max bytes to read',
      },
    },
    required: ['path'],
  },
  outputSchema: {
    type: 'object',
    properties: {
      content: { type: 'string' },
      size: { type: 'number' },
      encoding: { type: 'string' },
    },
  },
  tags: ['filesystem', 'readonly'],
  autonomyLevel: 0, // Safe to execute automatically
  dryRunSupported: true,
  requiresConfirmation: false,
  safetyConstraints: [
    {
      type: 'readonly',
      description: 'Tool only reads, never modifies',
      check: () => true,
    },
    {
      type: 'filesystem',
      description: 'Validate path is within allowed directories',
      check: (params) => validatePath(params.path),
    },
  ],
  handler: async (params) => {
    const { path: filePath, encoding = 'utf-8', maxSize = 1000000 } = params;

    // Validate path
    const validation = validatePath(filePath);
    if (!validation.valid) {
      throw new Error(`Path validation failed: ${validation.reason}`);
    }

    try {
      const stats = await fs.stat(filePath);

      if (stats.size > maxSize) {
        throw new Error(
          `File too large: ${stats.size} bytes (max: ${maxSize})`,
        );
      }

      const content = await fs.readFile(filePath, encoding);

      return {
        content,
        size: stats.size,
        encoding,
        path: filePath,
      };
    } catch (error) {
      throw new Error(`Failed to read file: ${error.message}`);
    }
  },
};

/**
 * File Write Tool - Write content to a file
 */
export const fileWriteTool = {
  name: 'file_write',
  description: 'Write content to a file (creates or overwrites)',
  version: '1.0.0',
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'File path to write' },
      content: { type: 'string', description: 'Content to write' },
      encoding: { type: 'string', default: 'utf-8' },
      backup: {
        type: 'boolean',
        default: true,
        description: 'Create backup if file exists',
      },
    },
    required: ['path', 'content'],
  },
  outputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string' },
      size: { type: 'number' },
      backupPath: { type: 'string' },
    },
  },
  tags: ['filesystem', 'destructive'],
  autonomyLevel: 2, // Requires semi-autonomous level
  dryRunSupported: true,
  requiresConfirmation: true,
  safetyConstraints: [
    {
      type: 'destructive',
      description: 'Tool modifies filesystem',
      check: () => true,
    },
    {
      type: 'filesystem',
      description: 'Validate path is within allowed directories',
      check: (params) => validatePath(params.path),
    },
  ],
  handler: async (params) => {
    const {
      path: filePath,
      content,
      encoding = 'utf-8',
      backup = true,
    } = params;

    // Validate path
    const validation = validatePath(filePath);
    if (!validation.valid) {
      throw new Error(`Path validation failed: ${validation.reason}`);
    }

    let backupPath = null;

    try {
      // Check if file exists and create backup
      try {
        await fs.access(filePath);
        if (backup) {
          backupPath = `${filePath}.backup.${Date.now()}`;
          await fs.copyFile(filePath, backupPath);
        }
      } catch {
        // File doesn't exist, no backup needed
      }

      // Ensure directory exists
      const dir = path.dirname(filePath);
      await fs.mkdir(dir, { recursive: true });

      // Write file
      await fs.writeFile(filePath, content, encoding);

      const stats = await fs.stat(filePath);

      return {
        path: filePath,
        size: stats.size,
        backupPath,
        encoding,
      };
    } catch (error) {
      throw new Error(`Failed to write file: ${error.message}`);
    }
  },
};

/**
 * Shell Command Tool - Execute shell commands (sandboxed)
 */
export const shellTool = {
  name: 'shell',
  description: 'Execute a shell command',
  version: '1.0.0',
  inputSchema: {
    type: 'object',
    properties: {
      command: { type: 'string', description: 'Command to execute' },
      cwd: { type: 'string', description: 'Working directory' },
      timeout: { type: 'number', default: 30000, description: 'Timeout in ms' },
      env: { type: 'object', description: 'Environment variables' },
    },
    required: ['command'],
  },
  outputSchema: {
    type: 'object',
    properties: {
      stdout: { type: 'string' },
      stderr: { type: 'string' },
      exitCode: { type: 'number' },
      duration: { type: 'number' },
    },
  },
  tags: ['shell', 'system'],
  autonomyLevel: 2, // Requires semi-autonomous level
  dryRunSupported: true,
  requiresConfirmation: true,
  safetyConstraints: [
    {
      type: 'shell',
      description: 'Command must not be in blocked list',
      check: (params) => validateShellCommand(params.command),
    },
  ],
  handler: async (params) => {
    const { spawn } = await import('child_process');
    const { command, cwd, timeout = 30000, env = {} } = params;

    // Validate command
    const validation = validateShellCommand(command);
    if (!validation.valid) {
      throw new Error(`Command validation failed: ${validation.reason}`);
    }

    return new Promise((resolve, reject) => {
      const startTime = Date.now();

      // Use shell execution
      const isWindows = process.platform === 'win32';
      const shell = isWindows ? 'cmd' : 'sh';
      const flag = isWindows ? '/c' : '-c';

      const child = spawn(shell, [flag, command], {
        cwd: cwd || process.cwd(),
        env: { ...process.env, ...env },
        timeout,
      });

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('close', (exitCode) => {
        const duration = Date.now() - startTime;

        resolve({
          stdout: stdout.trim(),
          stderr: stderr.trim(),
          exitCode: exitCode || 0,
          duration,
        });
      });

      child.on('error', (error) => {
        reject(new Error(`Command execution failed: ${error.message}`));
      });

      // Handle timeout
      setTimeout(() => {
        child.kill();
        reject(new Error(`Command timed out after ${timeout}ms`));
      }, timeout);
    });
  },
};

/**
 * Web Fetch Tool - Fetch content from URLs
 */
export const webFetchTool = {
  name: 'web_fetch',
  description: 'Fetch content from a URL (read-only)',
  version: '1.0.0',
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'URL to fetch' },
      method: { type: 'string', default: 'GET', enum: ['GET', 'HEAD'] },
      headers: { type: 'object' },
      timeout: { type: 'number', default: 30000 },
    },
    required: ['url'],
  },
  outputSchema: {
    type: 'object',
    properties: {
      status: { type: 'number' },
      headers: { type: 'object' },
      body: { type: 'string' },
      url: { type: 'string' },
    },
  },
  tags: ['network', 'readonly', 'web'],
  autonomyLevel: 1, // Requires assisted level
  dryRunSupported: true,
  requiresConfirmation: false,
  safetyConstraints: [
    {
      type: 'network',
      description: 'Only allow safe HTTP methods',
      check: (params) => {
        const safeMethods = ['GET', 'HEAD'];
        return safeMethods.includes(params.method?.toUpperCase() || 'GET');
      },
    },
    {
      type: 'readonly',
      description: 'Tool only reads, never modifies remote resources',
      check: () => true,
    },
  ],
  handler: async (params) => {
    const { url, method = 'GET', headers = {}, timeout = 30000 } = params;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      const response = await fetch(url, {
        method: method.toUpperCase(),
        headers: {
          'User-Agent': 'StaticRebel-Agent/1.0',
          ...headers,
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const body = await response.text();

      return {
        status: response.status,
        headers: Object.fromEntries(response.headers.entries()),
        body,
        url: response.url,
      };
    } catch (error) {
      throw new Error(`Fetch failed: ${error.message}`);
    }
  },
};

/**
 * Search Tool - Search local repository or documentation
 */
export const searchTool = {
  name: 'search',
  description: 'Search for patterns in files or documentation',
  version: '1.0.0',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Search query or pattern' },
      path: { type: 'string', description: 'Path to search in' },
      type: {
        type: 'string',
        enum: ['text', 'regex', 'glob'],
        default: 'text',
      },
      maxResults: { type: 'number', default: 50 },
    },
    required: ['query'],
  },
  outputSchema: {
    type: 'object',
    properties: {
      results: { type: 'array' },
      total: { type: 'number' },
      duration: { type: 'number' },
    },
  },
  tags: ['search', 'filesystem', 'readonly'],
  autonomyLevel: 0,
  dryRunSupported: true,
  requiresConfirmation: false,
  safetyConstraints: [
    {
      type: 'readonly',
      description: 'Tool only reads, never modifies',
      check: () => true,
    },
  ],
  handler: async (params) => {
    const {
      query,
      path: searchPath = '.',
      type = 'text',
      maxResults = 50,
    } = params;

    const startTime = Date.now();
    const results = [];

    try {
      // Simple recursive search implementation
      await searchDirectory(searchPath, query, type, results, maxResults);

      return {
        results: results.slice(0, maxResults),
        total: results.length,
        duration: Date.now() - startTime,
      };
    } catch (error) {
      throw new Error(`Search failed: ${error.message}`);
    }
  },
};

/**
 * Task Planner Tool - Break down goals into steps
 */
export const taskPlannerTool = {
  name: 'task_planner',
  description: 'Create a plan to achieve a goal',
  version: '1.0.0',
  inputSchema: {
    type: 'object',
    properties: {
      goal: { type: 'string', description: 'Goal to achieve' },
      context: { type: 'object', description: 'Additional context' },
      maxSteps: { type: 'number', default: 10 },
    },
    required: ['goal'],
  },
  outputSchema: {
    type: 'object',
    properties: {
      plan: { type: 'object' },
      steps: { type: 'array' },
      confidence: { type: 'number' },
    },
  },
  tags: ['planning', 'reasoning'],
  autonomyLevel: 0,
  dryRunSupported: true,
  requiresConfirmation: false,
  safetyConstraints: [],
  handler: async (params) => {
    const { goal, context = {}, maxSteps = 10 } = params;

    // Simple planning logic - in production, use LLM
    const steps = [
      { id: 1, description: 'Analyze goal and context', type: 'think' },
      { id: 2, description: 'Gather necessary information', type: 'observe' },
      { id: 3, description: `Execute plan for: ${goal}`, type: 'act' },
    ];

    return {
      plan: {
        description: `Plan to achieve: ${goal}`,
        estimatedSteps: Math.min(steps.length, maxSteps),
      },
      steps: steps.slice(0, maxSteps),
      confidence: 0.7,
      context,
    };
  },
};

// ============================================================================
// Safety & Validation
// ============================================================================

// Blocked shell commands/patterns
const BLOCKED_COMMANDS = [
  'rm -rf /',
  'rm -rf /*',
  'mkfs',
  'dd if=/dev/zero',
  ':(){ :|:& };:', // Fork bomb
  'eval',
  'exec',
  '> /dev/sda',
  'curl.*|.*sh', // curl pipe to shell
  'wget.*|.*sh',
];

// Allowed directories for file operations
const ALLOWED_DIRS = [
  process.cwd(),
  path.join(os.homedir(), '.static-rebel'),
  path.join(os.homedir(), 'projects'),
  path.join(os.homedir(), 'workspace'),
  path.join(os.homedir(), 'www'),
  '/tmp',
];

/**
 * Validate a file path is within allowed directories
 */
function validatePath(inputPath) {
  try {
    const resolved = path.resolve(inputPath);

    // Check if path is within allowed directories
    const isAllowed = ALLOWED_DIRS.some((dir) => {
      const resolvedDir = path.resolve(dir);
      return resolved.startsWith(resolvedDir) || resolved === resolvedDir;
    });

    if (!isAllowed) {
      return {
        valid: false,
        reason: `Path ${resolved} is outside allowed directories`,
      };
    }

    return { valid: true, resolved };
  } catch (error) {
    return { valid: false, reason: `Invalid path: ${error.message}` };
  }
}

/**
 * Validate a shell command is safe
 */
function validateShellCommand(command) {
  const lowerCommand = command.toLowerCase();

  for (const blocked of BLOCKED_COMMANDS) {
    const pattern = new RegExp(blocked.replace(/\*/g, '.*'), 'i');
    if (pattern.test(lowerCommand)) {
      return {
        valid: false,
        reason: `Command contains blocked pattern: ${blocked}`,
      };
    }
  }

  return { valid: true };
}

/**
 * Recursively search a directory
 */
async function searchDirectory(dir, query, type, results, maxResults) {
  if (results.length >= maxResults) return;

  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      if (results.length >= maxResults) break;

      const fullPath = path.join(dir, entry.name);

      if (
        entry.isDirectory() &&
        !entry.name.startsWith('.') &&
        !entry.name.startsWith('node_modules')
      ) {
        await searchDirectory(fullPath, query, type, results, maxResults);
      } else if (entry.isFile()) {
        try {
          const content = await fs.readFile(fullPath, 'utf-8');
          let matches = false;

          if (type === 'text') {
            matches = content.toLowerCase().includes(query.toLowerCase());
          } else if (type === 'regex') {
            const regex = new RegExp(query, 'i');
            matches = regex.test(content);
          }

          if (matches) {
            results.push({
              path: fullPath,
              preview: content.substring(0, 200),
            });
          }
        } catch {
          // Skip files that can't be read
        }
      }
    }
  } catch {
    // Skip directories that can't be read
  }
}

// ============================================================================
// Tool Registry Class
// ============================================================================

export class ToolRegistry extends EventEmitter {
  constructor() {
    super();
    this.tools = new Map();
    this.registerBuiltins();
  }

  /**
   * Register built-in tools
   */
  registerBuiltins() {
    this.register(fileReadTool);
    this.register(fileWriteTool);
    this.register(shellTool);
    this.register(webFetchTool);
    this.register(searchTool);
    this.register(taskPlannerTool);
  }

  /**
   * Register a tool
   */
  register(tool) {
    // Validate tool schema
    if (!tool.name || !tool.handler) {
      throw new Error('Tool must have name and handler');
    }

    if (!tool.inputSchema) {
      throw new Error('Tool must have inputSchema');
    }

    this.tools.set(tool.name, tool);
    this.emit('tool:registered', { name: tool.name });
  }

  /**
   * Unregister a tool
   */
  unregister(name) {
    const existed = this.tools.delete(name);
    if (existed) {
      this.emit('tool:unregistered', { name });
    }
    return existed;
  }

  /**
   * Get a tool by name
   */
  get(name) {
    return this.tools.get(name);
  }

  /**
   * Check if a tool exists
   */
  has(name) {
    return this.tools.has(name);
  }

  /**
   * List all registered tools
   */
  list() {
    return Array.from(this.tools.values()).map((tool) => ({
      name: tool.name,
      description: tool.description,
      version: tool.version,
      tags: tool.tags,
      autonomyLevel: tool.autonomyLevel,
      requiresConfirmation: tool.requiresConfirmation,
    }));
  }

  /**
   * Find tools by tag
   */
  findByTag(tag) {
    return Array.from(this.tools.values()).filter((tool) =>
      tool.tags?.includes(tag),
    );
  }

  /**
   * Execute a tool
   */
  async execute(name, params, options = {}) {
    const tool = this.tools.get(name);

    if (!tool) {
      throw new Error(`Tool not found: ${name}`);
    }

    // Check safety constraints
    if (tool.safetyConstraints) {
      for (const constraint of tool.safetyConstraints) {
        const check = await constraint.check(params);
        if (!check.valid && check.valid !== undefined) {
          throw new Error(
            `Safety constraint failed: ${constraint.description}`,
          );
        }
      }
    }

    // Dry run mode
    if (options.dryRun && tool.dryRunSupported) {
      return {
        dryRun: true,
        tool: name,
        params,
        wouldExecute: true,
      };
    }

    // Execute the tool
    this.emit('tool:executing', { name, params });

    try {
      const result = await tool.handler(params);
      this.emit('tool:completed', { name, result });
      return result;
    } catch (error) {
      this.emit('tool:failed', { name, error });
      throw error;
    }
  }

  /**
   * Validate tool parameters against schema
   */
  validateParams(name, params) {
    const tool = this.tools.get(name);

    if (!tool) {
      return { valid: false, errors: [`Tool not found: ${name}`] };
    }

    const errors = [];
    const schema = tool.inputSchema;

    // Check required fields
    if (schema.required) {
      for (const field of schema.required) {
        if (!(field in params)) {
          errors.push(`Missing required field: ${field}`);
        }
      }
    }

    // Type checking (basic)
    if (schema.properties) {
      for (const [key, value] of Object.entries(params)) {
        const propSchema = schema.properties[key];
        if (propSchema && propSchema.type) {
          const actualType = Array.isArray(value) ? 'array' : typeof value;
          if (
            actualType !== propSchema.type &&
            !(propSchema.type === 'integer' && actualType === 'number')
          ) {
            errors.push(
              `Field ${key} should be ${propSchema.type}, got ${actualType}`,
            );
          }
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Get tools available at a given autonomy level
   */
  getToolsForAutonomyLevel(level) {
    return Array.from(this.tools.values()).filter(
      (tool) => tool.autonomyLevel <= level,
    );
  }
}

// ============================================================================
// Factory & Default Export
// ============================================================================

export function createToolRegistry() {
  return new ToolRegistry();
}

export default ToolRegistry;
