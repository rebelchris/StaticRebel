/**
 * File Automation
 *
 * Safe file operations with validation:
 * - Read/write/delete files
 * - Move/copy operations
 * - Directory listing and creation
 * - Safety checks and permissions
 */

import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import os from 'os';

const DEFAULT_OPTIONS = {
  encoding: 'utf-8',
  createParent: true,
  backup: false,
};

export class FileAutomation {
  constructor(options = {}) {
    this.safety = options.safety || null;
    this.allowedPaths = options.allowedPaths || [process.cwd(), os.homedir()];
    this.executionHistory = [];
  }

  async read(filePath, options = {}) {
    const executionId = `file-read-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const result = {
      executionId,
      success: false,
      path: null,
      content: null,
      size: 0,
      encoding: options.encoding || 'utf-8',
      error: '',
      timestamp: new Date(),
    };

    try {
      const resolved = path.resolve(filePath);

      if (this.safety) {
        const safetyCheck = await this.safety.check({
          type: 'file_read',
          path: filePath,
        });

        if (!safetyCheck.allowed) {
          throw new Error(`Safety check failed: ${safetyCheck.errors.join(', ')}`);
        }
      }

      const stats = await fs.stat(resolved);
      if (stats.size > 10 * 1024 * 1024) {
        result.warning = 'Large file - content may be truncated';
      }

      result.path = resolved;
      result.size = stats.size;

      if (options.stream) {
        result.content = fsSync.createReadStream(resolved, {
          encoding: options.encoding || 'utf-8',
        });
        result.success = true;
      } else {
        result.content = await fs.readFile(resolved, {
          encoding: options.encoding || 'utf-8',
        });
        result.success = true;
      }
    } catch (error) {
      result.error = error.message;
    }

    this.logExecution(result);

    return result;
  }

  async write(filePath, content, options = {}) {
    const executionId = `file-write-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const result = {
      executionId,
      success: false,
      path: null,
      bytesWritten: 0,
      error: '',
      timestamp: new Date(),
    };

    try {
      const resolved = path.resolve(filePath);
      const opts = { ...DEFAULT_OPTIONS, ...options };

      if (this.safety) {
        const safetyCheck = await this.safety.check({
          type: 'file_write',
          path: filePath,
        });

        if (!safetyCheck.allowed) {
          throw new Error(`Safety check failed: ${safetyCheck.errors.join(', ')}`);
        }

        if (safetyCheck.requiresConfirmation && !opts.skipConfirmation) {
          result.needsConfirmation = true;
          result.warnings = safetyCheck.warnings;
          this.logExecution(result);
          return result;
        }
      }

      if (opts.dryRun || (this.safety?.dryRun)) {
        result.success = true;
        result.dryRun = true;
        this.logExecution(result);
        return result;
      }

      if (opts.createParent) {
        const parentDir = path.dirname(resolved);
        await fs.mkdir(parentDir, { recursive: true });
      }

      if (opts.backup) {
        await this.createBackup(resolved);
      }

      const contentToWrite = typeof content === 'string' ? content : JSON.stringify(content, null, 2);

      result.path = resolved;
      result.bytesWritten = await fs.writeFile(resolved, contentToWrite, {
        encoding: opts.encoding || 'utf-8',
        flag: opts.append ? 'a' : 'w',
      });
      result.success = true;
    } catch (error) {
      result.error = error.message;
    }

    this.logExecution(result);

    return result;
  }

  async append(filePath, content, options = {}) {
    return this.write(filePath, content, { ...options, append: true });
  }

  async delete(filePath, options = {}) {
    const executionId = `file-delete-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const result = {
      executionId,
      success: false,
      path: null,
      error: '',
      timestamp: new Date(),
    };

    try {
      const resolved = path.resolve(filePath);

      if (this.safety) {
        const safetyCheck = await this.safety.check({
          type: 'file_delete',
          path: filePath,
        });

        if (!safetyCheck.allowed) {
          throw new Error(`Safety check failed: ${safetyCheck.errors.join(', ')}`);
        }

        if (safetyCheck.requiresConfirmation && !options.skipConfirmation) {
          result.needsConfirmation = true;
          result.warnings = safetyCheck.warnings;
          this.logExecution(result);
          return result;
        }
      }

      if (options.dryRun || (this.safety?.dryRun)) {
        result.success = true;
        result.output = `[DRY-RUN] Would delete ${resolved}`;
        result.dryRun = true;
        this.logExecution(result);
        return result;
      }

      if (options.moveToTrash) {
        await this.moveToTrash(resolved);
      } else {
        const stats = await fs.stat(resolved);
        if (stats.isDirectory()) {
          await fs.rm(resolved, { recursive: true, force: true });
        } else {
          await fs.unlink(resolved);
        }
      }

      result.path = resolved;
      result.success = true;
    } catch (error) {
      result.error = error.message;
    }

    this.logExecution(result);

    return result;
  }

  async move(sourcePath, destinationPath, options = {}) {
    const executionId = `file-move-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const result = {
      executionId,
      success: false,
      source: null,
      destination: null,
      error: '',
      timestamp: new Date(),
    };

    try {
      const resolvedSource = path.resolve(sourcePath);
      const resolvedDest = path.resolve(destinationPath);

      if (this.safety) {
        const safetyCheck = await this.safety.check({
          type: 'file_move',
          source: sourcePath,
          path: destinationPath,
        });

        if (!safetyCheck.allowed) {
          throw new Error(`Safety check failed: ${safetyCheck.errors.join(', ')}`);
        }

        if (safetyCheck.requiresConfirmation && !options.skipConfirmation) {
          result.needsConfirmation = true;
          result.warnings = safetyCheck.warnings;
          this.logExecution(result);
          return result;
        }
      }

      if (options.dryRun || (this.safety?.dryRun)) {
        result.success = true;
        result.source = resolvedSource;
        result.destination = resolvedDest;
        result.output = `[DRY-RUN] Would move ${resolvedSource} to ${resolvedDest}`;
        result.dryRun = true;
        this.logExecution(result);
        return result;
      }

      const parentDir = path.dirname(resolvedDest);
      await fs.mkdir(parentDir, { recursive: true });

      await fs.rename(resolvedSource, resolvedDest);

      result.source = resolvedSource;
      result.destination = resolvedDest;
      result.success = true;
    } catch (error) {
      if (error.code === 'EXDEV') {
        return this.copyMoveCrossDevice(sourcePath, destinationPath, options);
      }
      result.error = error.message;
    }

    this.logExecution(result);

    return result;
  }

  async copy(sourcePath, destinationPath, options = {}) {
    const executionId = `file-copy-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const result = {
      executionId,
      success: false,
      source: null,
      destination: null,
      bytesCopied: 0,
      error: '',
      timestamp: new Date(),
    };

    try {
      const resolvedSource = path.resolve(sourcePath);
      const resolvedDest = path.resolve(destinationPath);

      if (this.safety) {
        const safetyCheck = await this.safety.check({
          type: 'file_copy',
          source: sourcePath,
          path: destinationPath,
        });

        if (!safetyCheck.allowed) {
          throw new Error(`Safety check failed: ${safetyCheck.errors.join(', ')}`);
        }
      }

      if (options.dryRun || (this.safety?.dryRun)) {
        result.success = true;
        result.source = resolvedSource;
        result.destination = resolvedDest;
        result.output = `[DRY-RUN] Would copy ${resolvedSource} to ${resolvedDest}`;
        result.dryRun = true;
        this.logExecution(result);
        return result;
      }

      const parentDir = path.dirname(resolvedDest);
      await fs.mkdir(parentDir, { recursive: true });

      const stats = await fs.stat(resolvedSource);

      if (stats.isDirectory()) {
        await this.copyDirectory(resolvedSource, resolvedDest);
      } else {
        await fs.copyFile(resolvedSource, resolvedDest);
      }

      result.source = resolvedSource;
      result.destination = resolvedDest;
      result.success = true;
    } catch (error) {
      result.error = error.message;
    }

    this.logExecution(result);

    return result;
  }

  async copyDirectory(source, destination) {
    const entries = await fs.readdir(source, { withFileTypes: true });

    await fs.mkdir(destination, { recursive: true });

    for (const entry of entries) {
      const srcPath = path.join(source, entry.name);
      const destPath = path.join(destination, entry.name);

      if (entry.isDirectory()) {
        await this.copyDirectory(srcPath, destPath);
      } else {
        await fs.copyFile(srcPath, destPath);
      }
    }
  }

  async copyMoveCrossDevice(sourcePath, destinationPath, options = {}) {
    const result = await this.copy(sourcePath, destinationPath, options);

    if (result.success) {
      await this.delete(sourcePath);
    }

    return result;
  }

  async list(directoryPath, options = {}) {
    const executionId = `file-list-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const result = {
      executionId,
      success: false,
      path: null,
      entries: [],
      error: '',
      timestamp: new Date(),
    };

    try {
      const resolved = path.resolve(directoryPath);

      if (this.safety) {
        const safetyCheck = await this.safety.check({
          type: 'file_read',
          path: directoryPath,
        });

        if (!safetyCheck.allowed) {
          throw new Error(`Safety check failed: ${safetyCheck.errors.join(', ')}`);
        }
      }

      const entries = await fs.readdir(resolved, { withFileTypes: true });

      result.path = resolved;
      result.entries = entries.map((entry) => ({
        name: entry.name,
        path: path.join(resolved, entry.name),
        type: entry.isSymbolicLink()
          ? 'symlink'
          : entry.isDirectory()
          ? 'directory'
          : 'file',
        size: entry.isFile() ? null : undefined,
      }));

      if (options.includeSize) {
        for (const entry of result.entries) {
          if (entry.type === 'file') {
            const stats = await fs.stat(entry.path);
            entry.size = stats.size;
          }
        }
      }

      if (options.pattern) {
        const regex = new RegExp(options.pattern);
        result.entries = result.entries.filter((e) => regex.test(e.name));
      }

      result.success = true;
    } catch (error) {
      result.error = error.message;
    }

    this.logExecution(result);

    return result;
  }

  async createDirectory(directoryPath, options = {}) {
    const executionId = `file-mkdir-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const result = {
      executionId,
      success: false,
      path: null,
      error: '',
      timestamp: new Date(),
    };

    try {
      const resolved = path.resolve(directoryPath);

      if (this.safety) {
        const safetyCheck = await this.safety.check({
          type: 'file_write',
          path: directoryPath,
        });

        if (!safetyCheck.allowed) {
          throw new Error(`Safety check failed: ${safetyCheck.errors.join(', ')}`);
        }
      }

      await fs.mkdir(resolved, { recursive: options.recursive !== false });

      result.path = resolved;
      result.success = true;
    } catch (error) {
      result.error = error.message;
    }

    this.logExecution(result);

    return result;
  }

  async exists(filePath) {
    try {
      const resolved = path.resolve(filePath);
      await fs.access(resolved);
      return true;
    } catch {
      return false;
    }
  }

  async stat(filePath) {
    const executionId = `file-stat-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const result = {
      executionId,
      success: false,
      path: null,
      stats: null,
      error: '',
      timestamp: new Date(),
    };

    try {
      const resolved = path.resolve(filePath);
      result.stats = await fs.stat(resolved);
      result.path = resolved;
      result.success = true;
    } catch (error) {
      result.error = error.message;
    }

    return result;
  }

  async createBackup(filePath) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = `${filePath}.backup-${timestamp}`;
    await this.copy(filePath, backupPath);
    return backupPath;
  }

  async moveToTrash(filePath) {
    const trashPath = path.join(os.homedir(), '.Trash', path.basename(filePath));
    await this.move(filePath, trashPath);
  }

  async search(directoryPath, pattern, options = {}) {
    const executionId = `file-search-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const result = {
      executionId,
      success: false,
      path: null,
      pattern: null,
      matches: [],
      error: '',
      timestamp: new Date(),
    };

    try {
      const regex = typeof pattern === 'string' ? new RegExp(pattern) : pattern;

      result.path = path.resolve(directoryPath);
      result.pattern = pattern;

      const matches = [];

      await this.searchDirectory(directoryPath, regex, matches, {
        maxDepth: options.maxDepth,
        includeHidden: options.includeHidden,
      });

      result.matches = matches;
      result.success = true;
    } catch (error) {
      result.error = error.message;
    }

    this.logExecution(result);

    return result;
  }

  async searchDirectory(dir, regex, matches, options = {}) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const currentDepth = options.currentDepth || 0;
    const maxDepth = options.maxDepth || Infinity;

    if (currentDepth >= maxDepth) {
      return;
    }

    for (const entry of entries) {
      if (!options.includeHidden && entry.name.startsWith('.')) {
        continue;
      }

      const fullPath = path.join(dir, entry.name);

      if (regex.test(entry.name)) {
        matches.push({
          path: fullPath,
          name: entry.name,
          type: entry.isDirectory() ? 'directory' : 'file',
        });
      }

      if (entry.isDirectory()) {
        await this.searchDirectory(fullPath, regex, matches, {
          ...options,
          currentDepth: currentDepth + 1,
        });
      }
    }
  }

  logExecution(result) {
    this.executionHistory.push(result);
    if (this.executionHistory.length > 100) {
      this.executionHistory.shift();
    }
  }

  getHistory() {
    return [...this.executionHistory];
  }

  clearHistory() {
    this.executionHistory = [];
  }
}

export function createFileAutomation(options = {}) {
  return new FileAutomation(options);
}

export default FileAutomation;
