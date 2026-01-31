/**
 * Smart Syncing with File Watchers
 * Automatic re-indexing when memories change externally
 * 
 * Features:
 * - File watchers on memory/*.md files
 * - Automatic re-indexing when memories change externally
 * - No special memory-write API needed - just write to files
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import { EventEmitter } from 'events';

const MEMORY_DIR = path.join(os.homedir(), '.static-rebel', 'memory');

/**
 * File Watcher Manager
 * Watches memory files and triggers re-indexing on changes
 */
export class FileWatcherManager extends EventEmitter {
  constructor(options = {}) {
    super();
    this.watchers = new Map();
    this.options = {
      debounceMs: options.debounceMs || 500,
      persistent: options.persistent !== false,
      recursive: options.recursive !== false,
      ...options,
    };
    this.debounceTimers = new Map();
    this.indexer = null; // Will be set to hybridMemorySearch instance
  }

  /**
   * Set the indexer to use for re-indexing
   */
  setIndexer(indexer) {
    this.indexer = indexer;
  }

  /**
   * Start watching a directory or file
   */
  watch(targetPath, options = {}) {
    const resolvedPath = path.resolve(targetPath);
    
    if (this.watchers.has(resolvedPath)) {
      return { success: false, error: 'Already watching this path' };
    }

    try {
      const watcher = fs.watch(resolvedPath, { 
        recursive: options.recursive ?? this.options.recursive 
      }, (eventType, filename) => {
        this.handleFileChange(eventType, resolvedPath, filename);
      });

      this.watchers.set(resolvedPath, {
        watcher,
        path: resolvedPath,
        options,
      });

      this.emit('watch:started', { path: resolvedPath });
      
      return { success: true, path: resolvedPath };
    } catch (error) {
      this.emit('watch:error', { path: resolvedPath, error: error.message });
      return { success: false, error: error.message };
    }
  }

  /**
   * Start watching memory directory
   */
  watchMemoryDirectory() {
    // Watch the main memory directory
    this.watch(MEMORY_DIR, { recursive: true });
    
    // Also watch daily subdirectory if it exists
    const dailyDir = path.join(MEMORY_DIR, 'daily');
    if (fs.existsSync(dailyDir)) {
      this.watch(dailyDir, { recursive: false });
    }

    return { watching: this.watchers.size };
  }

  /**
   * Handle file change events
   */
  handleFileChange(eventType, dirPath, filename) {
    if (!filename) return;

    const fullPath = path.join(dirPath, filename);
    
    // Only watch .md files for memory
    if (!filename.endsWith('.md')) return;

    // Debounce the change event
    if (this.debounceTimers.has(fullPath)) {
      clearTimeout(this.debounceTimers.get(fullPath));
    }

    this.debounceTimers.set(fullPath, setTimeout(() => {
      this.processFileChange(eventType, fullPath);
      this.debounceTimers.delete(fullPath);
    }, this.options.debounceMs));

    this.emit('file:changed', {
      eventType,
      path: fullPath,
      filename,
    });
  }

  /**
   * Process a file change - re-index if needed
   */
  async processFileChange(eventType, filePath) {
    try {
      // Check if file still exists
      const exists = fs.existsSync(filePath);
      
      if (!exists) {
        // File was deleted - remove from index
        if (this.indexer) {
          await this.indexer.search.delete(`file:${filePath}`);
          this.emit('file:deleted', { path: filePath });
        }
        return;
      }

      // File was created or modified - re-index
      const stats = fs.statSync(filePath);
      
      if (stats.isFile()) {
        if (this.indexer) {
          await this.indexer.reindexFile(filePath);
          this.emit('file:reindexed', { 
            path: filePath, 
            eventType,
            size: stats.size,
          });
        }
      }
    } catch (error) {
      this.emit('file:error', { 
        path: filePath, 
        error: error.message,
      });
    }
  }

  /**
   * Stop watching a specific path
   */
  unwatch(targetPath) {
    const resolvedPath = path.resolve(targetPath);
    const watcherInfo = this.watchers.get(resolvedPath);
    
    if (watcherInfo) {
      watcherInfo.watcher.close();
      this.watchers.delete(resolvedPath);
      this.emit('watch:stopped', { path: resolvedPath });
      return { success: true };
    }
    
    return { success: false, error: 'Not watching this path' };
  }

  /**
   * Stop all watchers
   */
  stopAll() {
    for (const [path, watcherInfo] of this.watchers) {
      watcherInfo.watcher.close();
      this.emit('watch:stopped', { path });
    }
    
    const count = this.watchers.size;
    this.watchers.clear();
    
    // Clear all debounce timers
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();
    
    return { stopped: count };
  }

  /**
   * Get status of all watchers
   */
  getStatus() {
    return {
      activeWatchers: this.watchers.size,
      watchedPaths: Array.from(this.watchers.keys()),
      pendingDebounces: this.debounceTimers.size,
      hasIndexer: !!this.indexer,
    };
  }

  /**
   * Force re-index all watched files
   */
  async reindexAll() {
    if (!this.indexer) {
      return { success: false, error: 'No indexer set' };
    }

    const results = [];
    
    for (const watchedPath of this.watchers.keys()) {
      try {
        const stats = fs.statSync(watchedPath);
        
        if (stats.isDirectory()) {
          // Re-index all .md files in directory
          const files = fs.readdirSync(watchedPath, { recursive: true });
          for (const file of files) {
            const filePath = path.join(watchedPath, file);
            if (file.endsWith('.md') && fs.statSync(filePath).isFile()) {
              await this.indexer.reindexFile(filePath);
              results.push({ path: filePath, status: 'reindexed' });
            }
          }
        } else if (watchedPath.endsWith('.md')) {
          await this.indexer.reindexFile(watchedPath);
          results.push({ path: watchedPath, status: 'reindexed' });
        }
      } catch (error) {
        results.push({ path: watchedPath, status: 'error', error: error.message });
      }
    }

    this.emit('reindex:completed', { results });
    return { success: true, results };
  }
}

/**
 * Memory File Sync
 * High-level API for memory file operations with auto-sync
 */
export class MemoryFileSync extends EventEmitter {
  constructor(indexer) {
    super();
    this.indexer = indexer;
    this.watcher = new FileWatcherManager();
    this.watcher.setIndexer(indexer);
    
    // Forward events
    this.watcher.on('file:reindexed', (data) => this.emit('sync:reindexed', data));
    this.watcher.on('file:deleted', (data) => this.emit('sync:deleted', data));
    this.watcher.on('file:error', (data) => this.emit('sync:error', data));
  }

  /**
   * Initialize and start watching
   */
  async initialize() {
    // Index all existing memory first
    const indexResult = await this.indexer.indexAllMemory();
    
    // Start watching for changes
    this.watcher.watchMemoryDirectory();
    
    return {
      initialized: true,
      indexed: indexResult.indexed,
      watchers: this.watcher.getStatus(),
    };
  }

  /**
   * Write to a memory file (triggers auto-reindex)
   */
  async writeMemoryFile(filename, content, options = {}) {
    const filePath = path.join(MEMORY_DIR, filename);
    
    // Ensure directory exists
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    // Write file
    fs.writeFileSync(filePath, content, 'utf-8');
    
    // Index the file
    await this.indexer.indexFile(filePath);
    
    this.emit('memory:written', { path: filePath, filename });
    
    return { success: true, path: filePath };
  }

  /**
   * Append to a memory file (triggers auto-reindex)
   */
  async appendMemoryFile(filename, content) {
    const filePath = path.join(MEMORY_DIR, filename);
    
    fs.appendFileSync(filePath, content, 'utf-8');
    
    // Re-index the file
    await this.indexer.reindexFile(filePath);
    
    this.emit('memory:appended', { path: filePath, filename });
    
    return { success: true, path: filePath };
  }

  /**
   * Delete a memory file
   */
  async deleteMemoryFile(filename) {
    const filePath = path.join(MEMORY_DIR, filename);
    
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      
      // Remove from index
      await this.indexer.search.delete(`file:${filePath}`);
      
      this.emit('memory:deleted', { path: filePath, filename });
      
      return { success: true };
    }
    
    return { success: false, error: 'File not found' };
  }

  /**
   * Read a memory file
   */
  readMemoryFile(filename) {
    const filePath = path.join(MEMORY_DIR, filename);
    
    if (fs.existsSync(filePath)) {
      return {
        success: true,
        content: fs.readFileSync(filePath, 'utf-8'),
        path: filePath,
      };
    }
    
    return { success: false, error: 'File not found' };
  }

  /**
   * Search memories
   */
  async search(query, options = {}) {
    return await this.indexer.search.search(query, options);
  }

  /**
   * Stop syncing
   */
  stop() {
    this.watcher.stopAll();
    return { stopped: true };
  }
}

// Factory functions
export function createFileWatcher(options = {}) {
  return new FileWatcherManager(options);
}

export function createMemoryFileSync(indexer) {
  return new MemoryFileSync(indexer);
}

// Default export
export default FileWatcherManager;
