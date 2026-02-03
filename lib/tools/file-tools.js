/**
 * File Tools - OpenClaw-style file operations for StaticRebel
 * 
 * Provides read, write, edit, and list tools for working with files
 * in a project context. Inspired by OpenClaw's coding assistant tools.
 */

import { promises as fs } from 'fs';
import path from 'path';
import { glob } from 'glob';

// ============================================================================
// Security: Working Directory Boundaries
// ============================================================================

/**
 * Resolve and validate a path is within allowed boundaries
 * @param {string} filePath - Path to validate
 * @param {string} baseDir - Base directory (cwd or project root)
 * @returns {string} Resolved absolute path
 * @throws {Error} If path is outside allowed boundaries
 */
function validatePath(filePath, baseDir = process.cwd()) {
  const resolved = path.resolve(baseDir, filePath);
  const resolvedBase = path.resolve(baseDir);
  
  // Ensure the path is within the base directory
  if (!resolved.startsWith(resolvedBase)) {
    throw new Error(`Access denied: Path "${filePath}" is outside the project directory`);
  }
  
  // Block access to sensitive directories
  const sensitivePatterns = [
    /node_modules/,
    /\.git/,
    /\.env$/,
    /\.env\./,
    /secret/i,
    /credential/i,
    /password/i,
    /\.ssh/,
    /\.aws/,
  ];
  
  for (const pattern of sensitivePatterns) {
    if (pattern.test(resolved)) {
      throw new Error(`Access denied: Cannot access sensitive path "${filePath}"`);
    }
  }
  
  return resolved;
}

// ============================================================================
// Read Tool - Read file contents
// ============================================================================

export const readTool = {
  name: 'read',
  description: 'Read contents of a file. Supports offset/limit for large files.',
  schema: {
    path: 'string',      // File path (required)
    offset: 'number?',   // Start line (1-indexed, optional)
    limit: 'number?'     // Max lines to read (optional)
  },
  handler: async (params, context = {}) => {
    const { path: filePath, offset, limit } = params;
    const baseDir = context.projectRoot || context.cwd || process.cwd();
    
    try {
      const resolvedPath = validatePath(filePath, baseDir);
      const stats = await fs.stat(resolvedPath);
      
      if (stats.isDirectory()) {
        throw new Error(`"${filePath}" is a directory, not a file`);
      }
      
      // Read file content
      const content = await fs.readFile(resolvedPath, 'utf-8');
      const lines = content.split('\n');
      
      // Apply offset/limit if specified
      let resultLines = lines;
      let appliedOffset = 1;
      let appliedLimit = lines.length;
      
      if (offset && offset > 1) {
        appliedOffset = Math.min(offset, lines.length);
        resultLines = lines.slice(appliedOffset - 1);
      }
      
      if (limit && limit > 0) {
        appliedLimit = Math.min(limit, resultLines.length);
        resultLines = resultLines.slice(0, appliedLimit);
      }
      
      // Truncate if too large (50KB or 2000 lines)
      const MAX_CHARS = 50 * 1024;
      const MAX_LINES = 2000;
      let truncated = false;
      
      if (resultLines.length > MAX_LINES) {
        resultLines = resultLines.slice(0, MAX_LINES);
        truncated = true;
      }
      
      let resultContent = resultLines.join('\n');
      if (resultContent.length > MAX_CHARS) {
        resultContent = resultContent.slice(0, MAX_CHARS);
        truncated = true;
      }
      
      return {
        path: filePath,
        content: resultContent,
        totalLines: lines.length,
        startLine: appliedOffset,
        endLine: appliedOffset + resultLines.length - 1,
        truncated,
        size: stats.size,
        modified: stats.mtime.toISOString()
      };
    } catch (error) {
      if (error.code === 'ENOENT') {
        throw new Error(`File not found: ${filePath}`);
      }
      throw error;
    }
  },
  metadata: {
    category: 'filesystem',
    safe: true
  }
};

// ============================================================================
// Write Tool - Create or overwrite a file
// ============================================================================

export const writeTool = {
  name: 'write',
  description: 'Write content to a file. Creates the file and parent directories if needed.',
  schema: {
    path: 'string',      // File path (required)
    content: 'string'    // Content to write (required)
  },
  handler: async (params, context = {}) => {
    const { path: filePath, content } = params;
    const baseDir = context.projectRoot || context.cwd || process.cwd();
    
    try {
      const resolvedPath = validatePath(filePath, baseDir);
      
      // Ensure parent directory exists
      const dir = path.dirname(resolvedPath);
      await fs.mkdir(dir, { recursive: true });
      
      // Check if file exists (for reporting)
      let existed = false;
      try {
        await fs.access(resolvedPath);
        existed = true;
      } catch {
        // File doesn't exist
      }
      
      // Write the file
      await fs.writeFile(resolvedPath, content, 'utf-8');
      const stats = await fs.stat(resolvedPath);
      
      return {
        path: filePath,
        created: !existed,
        overwritten: existed,
        size: stats.size,
        lines: content.split('\n').length
      };
    } catch (error) {
      throw new Error(`Failed to write file "${filePath}": ${error.message}`);
    }
  },
  metadata: {
    category: 'filesystem',
    safe: false,  // Modifies files
    rateLimit: { requests: 30, window: '1m' }
  }
};

// ============================================================================
// Edit Tool - Precise text replacement
// ============================================================================

export const editTool = {
  name: 'edit',
  description: 'Edit a file by replacing exact text. The oldText must match exactly (including whitespace).',
  schema: {
    path: 'string',      // File path (required)
    oldText: 'string',   // Exact text to find and replace (required)
    newText: 'string'    // New text to replace with (required)
  },
  handler: async (params, context = {}) => {
    const { path: filePath, oldText, newText } = params;
    const baseDir = context.projectRoot || context.cwd || process.cwd();
    
    try {
      const resolvedPath = validatePath(filePath, baseDir);
      
      // Read current content
      const content = await fs.readFile(resolvedPath, 'utf-8');
      
      // Find the exact text
      const index = content.indexOf(oldText);
      if (index === -1) {
        // Try to provide helpful info about what was found
        const lines = content.split('\n');
        const preview = lines.slice(0, 10).join('\n');
        throw new Error(
          `Could not find the exact text to replace in "${filePath}".\n` +
          `Searched for (${oldText.length} chars):\n${oldText.slice(0, 200)}${oldText.length > 200 ? '...' : ''}\n\n` +
          `File starts with:\n${preview}`
        );
      }
      
      // Check for multiple occurrences
      const occurrences = content.split(oldText).length - 1;
      if (occurrences > 1) {
        throw new Error(
          `Found ${occurrences} occurrences of the text in "${filePath}". ` +
          `Edit requires a unique match. Include more surrounding context to make it unique.`
        );
      }
      
      // Perform the replacement
      const newContent = content.slice(0, index) + newText + content.slice(index + oldText.length);
      
      // Write back
      await fs.writeFile(resolvedPath, newContent, 'utf-8');
      const stats = await fs.stat(resolvedPath);
      
      return {
        path: filePath,
        replaced: true,
        oldTextLength: oldText.length,
        newTextLength: newText.length,
        sizeDelta: newText.length - oldText.length,
        newSize: stats.size
      };
    } catch (error) {
      if (error.code === 'ENOENT') {
        throw new Error(`File not found: ${filePath}`);
      }
      throw error;
    }
  },
  metadata: {
    category: 'filesystem',
    safe: false,  // Modifies files
    rateLimit: { requests: 30, window: '1m' }
  }
};

// ============================================================================
// List Tool - List directory contents
// ============================================================================

export const listTool = {
  name: 'list',
  description: 'List files in a directory. Supports glob patterns.',
  schema: {
    path: 'string?',     // Directory path (default: cwd)
    pattern: 'string?'   // Glob pattern (optional, e.g., "**/*.js")
  },
  handler: async (params, context = {}) => {
    const { path: dirPath = '.', pattern } = params;
    const baseDir = context.projectRoot || context.cwd || process.cwd();
    
    try {
      const resolvedPath = validatePath(dirPath, baseDir);
      const stats = await fs.stat(resolvedPath);
      
      if (!stats.isDirectory()) {
        throw new Error(`"${dirPath}" is not a directory`);
      }
      
      let files;
      
      if (pattern) {
        // Use glob pattern
        const globPattern = path.join(resolvedPath, pattern);
        files = await glob(globPattern, {
          ignore: ['**/node_modules/**', '**/.git/**'],
          nodir: false
        });
        
        // Make paths relative to the requested directory
        files = files.map(f => path.relative(resolvedPath, f));
      } else {
        // Simple directory listing
        const entries = await fs.readdir(resolvedPath, { withFileTypes: true });
        files = entries.map(entry => ({
          name: entry.name,
          type: entry.isDirectory() ? 'directory' : 'file',
          path: path.join(dirPath, entry.name)
        }));
      }
      
      // Sort: directories first, then alphabetically
      if (Array.isArray(files) && files.length > 0 && typeof files[0] === 'object') {
        files.sort((a, b) => {
          if (a.type !== b.type) {
            return a.type === 'directory' ? -1 : 1;
          }
          return a.name.localeCompare(b.name);
        });
      } else if (Array.isArray(files)) {
        files.sort();
      }
      
      return {
        path: dirPath,
        pattern: pattern || null,
        count: files.length,
        files
      };
    } catch (error) {
      if (error.code === 'ENOENT') {
        throw new Error(`Directory not found: ${dirPath}`);
      }
      throw error;
    }
  },
  metadata: {
    category: 'filesystem',
    safe: true
  }
};

// ============================================================================
// Register All File Tools
// ============================================================================

/**
 * Register all file tools with a registry
 * @param {ToolRegistry} registry - The tool registry to register with
 */
export function registerFileTools(registry) {
  const tools = [readTool, writeTool, editTool, listTool];
  
  for (const tool of tools) {
    if (!registry.has(tool.name)) {
      registry.register(tool.name, tool);
    } else {
      console.log(`⚠️ Tool "${tool.name}" already registered, skipping`);
    }
  }
  
  console.log(`📁 Registered ${tools.length} file tools: ${tools.map(t => t.name).join(', ')}`);
}

export default {
  readTool,
  writeTool,
  editTool,
  listTool,
  registerFileTools
};
