/**
 * Unified Tool Registry for StaticRebel
 * 
 * Provides a single, centralized system for tool registration, validation,
 * rate limiting, and execution. Consolidates tools from assistant.js,
 * lib/toolRegistry.js, and skills into one unified interface.
 */

import { EventEmitter } from 'events';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ============================================================================
// Schema Validation System
// ============================================================================

/**
 * Validate parameters against a schema
 * @param {Object} schema - Schema definition
 * @param {Object} params - Parameters to validate
 * @returns {Object} { valid: boolean, errors: string[] }
 */
function validateSchema(schema, params) {
  const errors = [];
  
  if (!schema || !params) {
    return { valid: false, errors: ['Schema or parameters missing'] };
  }
  
  // Check required fields
  for (const [field, type] of Object.entries(schema)) {
    const isOptional = type.endsWith('?');
    const fieldType = isOptional ? type.slice(0, -1) : type;
    
    if (!isOptional && !(field in params)) {
      errors.push(`Missing required parameter: ${field}`);
      continue;
    }
    
    if (field in params) {
      const value = params[field];
      const actualType = Array.isArray(value) ? 'array' : typeof value;
      
      // Type checking
      if (fieldType === 'string' && actualType !== 'string') {
        errors.push(`Parameter '${field}' must be a string, got ${actualType}`);
      } else if (fieldType === 'number' && actualType !== 'number') {
        errors.push(`Parameter '${field}' must be a number, got ${actualType}`);
      } else if (fieldType === 'boolean' && actualType !== 'boolean') {
        errors.push(`Parameter '${field}' must be a boolean, got ${actualType}`);
      } else if (fieldType === 'object' && (actualType !== 'object' || Array.isArray(value))) {
        errors.push(`Parameter '${field}' must be an object, got ${actualType}`);
      } else if (fieldType === 'array' && !Array.isArray(value)) {
        errors.push(`Parameter '${field}' must be an array, got ${actualType}`);
      }
    }
  }
  
  return { valid: errors.length === 0, errors };
}

// ============================================================================
// Rate Limiting System
// ============================================================================

class RateLimiter {
  constructor() {
    this.limits = new Map(); // tool -> { requests: [], limit: number, window: number }
  }
  
  /**
   * Configure rate limit for a tool
   * @param {string} toolName - Tool name
   * @param {number} requests - Max requests
   * @param {string} window - Time window (e.g., '1m', '1h', '1d')
   */
  setLimit(toolName, requests, window) {
    const windowMs = this.parseWindow(window);
    this.limits.set(toolName, {
      requests: [],
      limit: requests,
      window: windowMs
    });
  }
  
  /**
   * Check if tool can be executed (rate limit)
   * @param {string} toolName - Tool name
   * @returns {boolean} Can execute
   */
  canExecute(toolName) {
    const limit = this.limits.get(toolName);
    if (!limit) return true; // No limit set
    
    const now = Date.now();
    
    // Clean old requests
    limit.requests = limit.requests.filter(time => now - time < limit.window);
    
    // Check if under limit
    return limit.requests.length < limit.limit;
  }
  
  /**
   * Record a request execution
   * @param {string} toolName - Tool name
   */
  recordRequest(toolName) {
    const limit = this.limits.get(toolName);
    if (limit) {
      limit.requests.push(Date.now());
    }
  }
  
  /**
   * Parse time window string to milliseconds
   * @param {string} window - Time window (e.g., '1m', '1h')
   * @returns {number} Milliseconds
   */
  parseWindow(window) {
    const match = window.match(/^(\d+)([smhd])$/);
    if (!match) return 60000; // Default 1 minute
    
    const value = parseInt(match[1]);
    const unit = match[2];
    
    switch (unit) {
      case 's': return value * 1000;
      case 'm': return value * 60 * 1000;
      case 'h': return value * 60 * 60 * 1000;
      case 'd': return value * 24 * 60 * 60 * 1000;
      default: return 60000;
    }
  }
}

// ============================================================================
// Core Tool Registry
// ============================================================================

export class ToolRegistry extends EventEmitter {
  constructor() {
    super();
    this.tools = new Map();
    this.rateLimiter = new RateLimiter();
    this.setupBuiltinTools();
  }
  
  /**
   * Register a tool with the registry
   * @param {string} name - Tool name
   * @param {Object} toolDef - Tool definition
   */
  register(name, toolDef) {
    if (!name || !toolDef) {
      throw new Error('Tool name and definition are required');
    }
    
    if (!toolDef.schema) {
      throw new Error(`Tool '${name}' must have a schema`);
    }
    
    if (!toolDef.handler || typeof toolDef.handler !== 'function') {
      throw new Error(`Tool '${name}' must have a handler function`);
    }
    
    // Set up rate limiting if specified
    if (toolDef.rateLimit) {
      this.rateLimiter.setLimit(
        name, 
        toolDef.rateLimit.requests, 
        toolDef.rateLimit.window
      );
    }
    
    this.tools.set(name, {
      name,
      schema: toolDef.schema,
      handler: toolDef.handler,
      description: toolDef.description || '',
      rateLimit: toolDef.rateLimit || null,
      metadata: toolDef.metadata || {}
    });
    
    this.emit('tool:registered', { name });
    console.log(`🔧 Registered tool: ${name}`);
  }
  
  /**
   * Unregister a tool
   * @param {string} name - Tool name
   */
  unregister(name) {
    const existed = this.tools.delete(name);
    if (existed) {
      this.emit('tool:unregistered', { name });
      console.log(`🔧 Unregistered tool: ${name}`);
    }
    return existed;
  }
  
  /**
   * Get tool definition
   * @param {string} name - Tool name
   * @returns {Object|null} Tool definition
   */
  get(name) {
    return this.tools.get(name) || null;
  }
  
  /**
   * Check if tool exists
   * @param {string} name - Tool name
   * @returns {boolean} Tool exists
   */
  has(name) {
    return this.tools.has(name);
  }
  
  /**
   * List all registered tools
   * @returns {Array} Tool list
   */
  list() {
    return Array.from(this.tools.values()).map(tool => ({
      name: tool.name,
      description: tool.description,
      schema: tool.schema,
      hasRateLimit: !!tool.rateLimit
    }));
  }
  
  /**
   * Execute a tool with parameters
   * @param {string} name - Tool name
   * @param {Object} params - Parameters
   * @param {Object} context - Execution context
   * @returns {Promise<Object>} Tool result
   */
  async execute(name, params = {}, context = {}) {
    const tool = this.tools.get(name);
    
    if (!tool) {
      throw new Error(`Tool not found: ${name}`);
    }
    
    // Validate parameters
    const validation = validateSchema(tool.schema, params);
    if (!validation.valid) {
      throw new Error(`Parameter validation failed: ${validation.errors.join(', ')}`);
    }
    
    // Check rate limit
    if (!this.rateLimiter.canExecute(name)) {
      throw new Error(`Rate limit exceeded for tool: ${name}`);
    }
    
    // Record the request
    this.rateLimiter.recordRequest(name);
    
    // Execute the tool
    this.emit('tool:executing', { name, params, context });
    
    try {
      const startTime = Date.now();
      const result = await tool.handler(params, context);
      const duration = Date.now() - startTime;
      
      this.emit('tool:completed', { name, result, duration });
      
      return {
        success: true,
        result,
        duration,
        tool: name
      };
    } catch (error) {
      this.emit('tool:error', { name, error, params });
      
      return {
        success: false,
        error: error.message,
        tool: name
      };
    }
  }
  
  /**
   * Discover tools by searching descriptions
   * @param {string} query - Search query
   * @returns {Array} Matching tools
   */
  discover(query) {
    const lowerQuery = query.toLowerCase();
    return Array.from(this.tools.values()).filter(tool => 
      tool.name.toLowerCase().includes(lowerQuery) ||
      tool.description.toLowerCase().includes(lowerQuery)
    );
  }
  
  // ============================================================================
  // Built-in Tool Setup
  // ============================================================================
  
  setupBuiltinTools() {
    this.registerWebSearchTool();
    this.registerLogSkillTool();
    this.registerFileReadTool();
    this.registerFileWriteTool();
    this.registerShellCommandTool();
  }
  
  /**
   * Register web search tool (migrated from assistant.js)
   */
  registerWebSearchTool() {
    this.register('web_search', {
      schema: {
        query: 'string',
        limit: 'number?'
      },
      handler: async (params) => {
        const { query, limit = 5 } = params;
        
        // Note: Currently disabled in original implementation
        console.log('🔍 Web search is temporarily disabled.');
        console.log('To enable, configure TAVILY_API_KEY or SEARXNG_URL in your .env file');
        
        return {
          query,
          results: [],
          source: 'disabled',
          message: 'Web search temporarily disabled - requires API configuration'
        };
      },
      description: 'Search the web for information',
      rateLimit: {
        requests: 10,
        window: '1m'
      }
    });
  }
  
  /**
   * Register skill logging tool
   */
  registerLogSkillTool() {
    this.register('log_skill', {
      schema: {
        skill_id: 'string',
        data: 'object'
      },
      handler: async (params, context) => {
        const { skill_id, data } = params;
        const timestamp = new Date().toISOString();
        
        // Create log entry
        const logEntry = {
          skill_id,
          data,
          timestamp,
          context: context.user || 'system'
        };
        
        // Log to file (simple implementation)
        try {
          const logPath = path.resolve(process.cwd(), 'data', 'skill-logs.json');
          
          // Ensure directory exists
          await fs.mkdir(path.dirname(logPath), { recursive: true });
          
          let logs = [];
          try {
            const existingLogs = await fs.readFile(logPath, 'utf-8');
            logs = JSON.parse(existingLogs);
          } catch {
            // File doesn't exist yet
          }
          
          logs.push(logEntry);
          
          // Keep only last 1000 entries
          if (logs.length > 1000) {
            logs = logs.slice(-1000);
          }
          
          await fs.writeFile(logPath, JSON.stringify(logs, null, 2));
          
          return {
            logged: true,
            entry: logEntry,
            total_entries: logs.length
          };
        } catch (error) {
          throw new Error(`Failed to log skill data: ${error.message}`);
        }
      },
      description: 'Log skill usage and data for analytics'
    });
  }
  
  /**
   * Register file read tool (migrated from lib/toolRegistry.js)
   */
  registerFileReadTool() {
    this.register('file_read', {
      schema: {
        path: 'string',
        encoding: 'string?'
      },
      handler: async (params) => {
        const { path: filePath, encoding = 'utf-8' } = params;
        
        try {
          const content = await fs.readFile(filePath, encoding);
          const stats = await fs.stat(filePath);
          
          return {
            content,
            size: stats.size,
            path: filePath,
            encoding
          };
        } catch (error) {
          throw new Error(`Failed to read file: ${error.message}`);
        }
      },
      description: 'Read contents of a file',
      rateLimit: {
        requests: 50,
        window: '1m'
      }
    });
  }
  
  /**
   * Register file write tool
   */
  registerFileWriteTool() {
    this.register('file_write', {
      schema: {
        path: 'string',
        content: 'string',
        encoding: 'string?'
      },
      handler: async (params) => {
        const { path: filePath, content, encoding = 'utf-8' } = params;
        
        try {
          // Ensure directory exists
          await fs.mkdir(path.dirname(filePath), { recursive: true });
          
          await fs.writeFile(filePath, content, encoding);
          const stats = await fs.stat(filePath);
          
          return {
            path: filePath,
            size: stats.size,
            encoding
          };
        } catch (error) {
          throw new Error(`Failed to write file: ${error.message}`);
        }
      },
      description: 'Write content to a file',
      rateLimit: {
        requests: 20,
        window: '1m'
      }
    });
  }
  
  /**
   * Register shell command tool
   */
  registerShellCommandTool() {
    this.register('shell_command', {
      schema: {
        command: 'string',
        cwd: 'string?',
        timeout: 'number?'
      },
      handler: async (params) => {
        const { command, cwd, timeout = 30000 } = params;
        const { spawn } = await import('child_process');
        
        return new Promise((resolve, reject) => {
          const isWindows = process.platform === 'win32';
          const shell = isWindows ? 'cmd' : 'sh';
          const flag = isWindows ? '/c' : '-c';
          
          const child = spawn(shell, [flag, command], {
            cwd: cwd || process.cwd(),
            timeout
          });
          
          let stdout = '';
          let stderr = '';
          
          child.stdout.on('data', (data) => {
            stdout += data.toString();
          });
          
          child.stderr.on('data', (data) => {
            stderr += data.toString();
          });
          
          child.on('close', (code) => {
            resolve({
              stdout: stdout.trim(),
              stderr: stderr.trim(),
              exitCode: code || 0,
              command
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
      description: 'Execute shell commands',
      rateLimit: {
        requests: 5,
        window: '1m'
      }
    });
  }
}

// ============================================================================
// Export Functions
// ============================================================================

/**
 * Create and return a new tool registry instance
 * @returns {ToolRegistry} New registry instance
 */
export function createToolRegistry() {
  return new ToolRegistry();
}

/**
 * Create a singleton tool registry instance
 */
let globalRegistry = null;

export function getToolRegistry() {
  if (!globalRegistry) {
    globalRegistry = new ToolRegistry();
  }
  return globalRegistry;
}

/**
 * Helper function to validate tool schemas
 * @param {Object} schema - Schema to validate
 * @param {Object} params - Parameters to validate
 * @returns {Object} Validation result
 */
export { validateSchema };

// Default export
export default ToolRegistry;