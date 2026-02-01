/**
 * Conversation Checkpoints - Save and restore conversation state
 * 
 * Features:
 * - Save conversation state at named checkpoints
 * - List available checkpoints for a conversation
 * - Restore to a previous checkpoint (truncate history after that point)
 * - Auto-checkpoints before major actions
 * - Checkpoint metadata (timestamp, description, message count)
 * - Cleanup old checkpoints with configurable retention
 * 
 * Integration with existing conversation/history management:
 * - Works with SessionMemory class from sessionMemory.js
 * - Integrates with conversationalEngine.js
 */

import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { EventEmitter } from 'events';

// ============================================================================
// Configuration
// ============================================================================

const CONFIG = {
  // Default retention: 7 days for manual checkpoints, 1 day for auto checkpoints
  retention: {
    manual: 7 * 24 * 60 * 60 * 1000, // 7 days in milliseconds
    auto: 24 * 60 * 60 * 1000,       // 1 day in milliseconds
  },
  // Auto-checkpoint triggers
  autoCheckpoint: {
    enabled: true,
    triggers: [
      'file_delete',
      'git_reset',
      'db_drop',
      'system_restart',
      'major_config_change',
      'bulk_operation'
    ]
  },
  // Storage location
  storageDir: path.join(os.homedir(), '.static-rebel', 'checkpoints'),
  // Maximum checkpoints per conversation
  maxCheckpoints: 50,
};

// ============================================================================
// Checkpoint Manager Class
// ============================================================================

export class ConversationCheckpoints extends EventEmitter {
  constructor(options = {}) {
    super();
    this.sessionId = options.sessionId || 'default';
    this.storageDir = options.storageDir || CONFIG.storageDir;
    this.maxCheckpoints = options.maxCheckpoints || CONFIG.maxCheckpoints;
    this.autoCheckpointEnabled = options.autoCheckpoint !== false;
    
    this.ensureStorageDirectory();
  }

  /**
   * Ensure storage directory exists
   */
  async ensureStorageDirectory() {
    try {
      await fs.mkdir(this.storageDir, { recursive: true });
    } catch (error) {
      console.error(`Could not create checkpoint directory: ${error.message}`);
      throw error;
    }
  }

  /**
   * Generate checkpoint filename
   */
  getCheckpointPath(checkpointId) {
    const sessionDir = path.join(this.storageDir, this.sessionId);
    return path.join(sessionDir, `${checkpointId}.json`);
  }

  /**
   * Generate session directory path
   */
  getSessionDir() {
    return path.join(this.storageDir, this.sessionId);
  }

  /**
   * Save checkpoint with conversation state
   */
  async saveCheckpoint(name, options = {}) {
    const { sessionMemory, description = '', isAuto = false } = options;
    
    if (!sessionMemory) {
      throw new Error('sessionMemory is required to save checkpoint');
    }

    const checkpointId = `checkpoint_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const checkpoint = {
      id: checkpointId,
      name,
      description,
      timestamp: new Date().toISOString(),
      isAuto,
      metadata: {
        messageCount: sessionMemory.interactions.length,
        sessionDuration: sessionMemory.getSessionDuration(),
        sessionStart: sessionMemory.metadata.sessionStart,
        totalInteractions: sessionMemory.metadata.totalInteractions,
      },
      // Store the conversation state
      conversationState: {
        interactions: sessionMemory.interactions,
        sessionMetadata: sessionMemory.metadata,
        sessionSummary: sessionMemory.getSummary(),
      }
    };

    // Ensure session directory exists
    const sessionDir = this.getSessionDir();
    await fs.mkdir(sessionDir, { recursive: true });

    // Save checkpoint to file
    const checkpointPath = this.getCheckpointPath(checkpointId);
    await fs.writeFile(checkpointPath, JSON.stringify(checkpoint, null, 2));

    // Cleanup old checkpoints if needed
    await this.cleanupOldCheckpoints();

    this.emit('checkpoint:saved', {
      id: checkpointId,
      name,
      messageCount: checkpoint.metadata.messageCount,
      isAuto
    });

    return checkpointId;
  }

  /**
   * List available checkpoints for the current conversation
   */
  async listCheckpoints() {
    try {
      const sessionDir = this.getSessionDir();
      const files = await fs.readdir(sessionDir);
      
      const checkpoints = [];
      
      for (const file of files) {
        if (file.endsWith('.json')) {
          try {
            const filePath = path.join(sessionDir, file);
            const content = await fs.readFile(filePath, 'utf-8');
            const checkpoint = JSON.parse(content);
            
            // Return summary info only
            checkpoints.push({
              id: checkpoint.id,
              name: checkpoint.name,
              description: checkpoint.description,
              timestamp: checkpoint.timestamp,
              isAuto: checkpoint.isAuto,
              messageCount: checkpoint.metadata.messageCount,
              sessionDuration: checkpoint.metadata.sessionDuration,
            });
          } catch (error) {
            console.warn(`Could not parse checkpoint file ${file}: ${error.message}`);
          }
        }
      }

      // Sort by timestamp (newest first)
      checkpoints.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      
      return checkpoints;
    } catch (error) {
      if (error.code === 'ENOENT') {
        return []; // No checkpoints directory exists yet
      }
      throw error;
    }
  }

  /**
   * Load a specific checkpoint
   */
  async loadCheckpoint(checkpointId) {
    const checkpointPath = this.getCheckpointPath(checkpointId);
    
    try {
      const content = await fs.readFile(checkpointPath, 'utf-8');
      return JSON.parse(content);
    } catch (error) {
      if (error.code === 'ENOENT') {
        throw new Error(`Checkpoint '${checkpointId}' not found`);
      }
      throw error;
    }
  }

  /**
   * Restore conversation to a previous checkpoint
   */
  async restoreCheckpoint(checkpointId, sessionMemory) {
    if (!sessionMemory) {
      throw new Error('sessionMemory is required to restore checkpoint');
    }

    const checkpoint = await this.loadCheckpoint(checkpointId);
    
    // Clear current session memory
    sessionMemory.clear();
    
    // Restore conversation state from checkpoint
    const state = checkpoint.conversationState;
    sessionMemory.interactions = [...state.interactions];
    sessionMemory.metadata = { ...state.sessionMetadata };
    
    // Update session start time to maintain continuity
    sessionMemory.metadata.sessionStart = checkpoint.metadata.sessionStart;
    sessionMemory.metadata.totalInteractions = checkpoint.metadata.totalInteractions;

    this.emit('checkpoint:restored', {
      id: checkpointId,
      name: checkpoint.name,
      messageCount: checkpoint.metadata.messageCount,
      restoredAt: new Date().toISOString()
    });

    return {
      checkpoint: {
        id: checkpoint.id,
        name: checkpoint.name,
        timestamp: checkpoint.timestamp,
        messageCount: checkpoint.metadata.messageCount,
      },
      restoredState: {
        messageCount: sessionMemory.interactions.length,
        sessionDuration: sessionMemory.getSessionDuration(),
      }
    };
  }

  /**
   * Delete a checkpoint
   */
  async deleteCheckpoint(checkpointId) {
    const checkpointPath = this.getCheckpointPath(checkpointId);
    
    try {
      await fs.unlink(checkpointPath);
      
      this.emit('checkpoint:deleted', { id: checkpointId });
      
      return true;
    } catch (error) {
      if (error.code === 'ENOENT') {
        return false; // Already deleted
      }
      throw error;
    }
  }

  /**
   * Create auto-checkpoint before major actions
   */
  async createAutoCheckpoint(action, sessionMemory) {
    if (!this.autoCheckpointEnabled) {
      return null;
    }

    if (!CONFIG.autoCheckpoint.triggers.includes(action)) {
      return null;
    }

    const name = `auto_${action}`;
    const description = `Automatic checkpoint before ${action}`;
    
    return await this.saveCheckpoint(name, {
      sessionMemory,
      description,
      isAuto: true
    });
  }

  /**
   * Cleanup old checkpoints based on retention policy
   */
  async cleanupOldCheckpoints() {
    try {
      const checkpoints = await this.listCheckpoints();
      const now = Date.now();
      const toDelete = [];

      for (const checkpoint of checkpoints) {
        const age = now - new Date(checkpoint.timestamp).getTime();
        const maxAge = checkpoint.isAuto ? 
          CONFIG.retention.auto : 
          CONFIG.retention.manual;

        if (age > maxAge) {
          toDelete.push(checkpoint.id);
        }
      }

      // Also enforce maximum checkpoint limit
      if (checkpoints.length > this.maxCheckpoints) {
        const excess = checkpoints
          .slice(this.maxCheckpoints)
          .map(cp => cp.id);
        toDelete.push(...excess);
      }

      // Delete old checkpoints
      for (const checkpointId of toDelete) {
        await this.deleteCheckpoint(checkpointId);
      }

      if (toDelete.length > 0) {
        this.emit('checkpoints:cleanup', { 
          deletedCount: toDelete.length,
          deletedIds: toDelete 
        });
      }

    } catch (error) {
      console.warn(`Checkpoint cleanup error: ${error.message}`);
    }
  }

  /**
   * Get checkpoint statistics
   */
  async getStats() {
    const checkpoints = await this.listCheckpoints();
    
    const stats = {
      total: checkpoints.length,
      manual: checkpoints.filter(cp => !cp.isAuto).length,
      auto: checkpoints.filter(cp => cp.isAuto).length,
      oldest: checkpoints.length > 0 ? 
        checkpoints[checkpoints.length - 1].timestamp : null,
      newest: checkpoints.length > 0 ? 
        checkpoints[0].timestamp : null,
      storageDir: this.storageDir,
      sessionId: this.sessionId,
    };

    return stats;
  }

  /**
   * Export all checkpoints for backup
   */
  async exportCheckpoints() {
    const checkpoints = await this.listCheckpoints();
    const exported = [];

    for (const checkpoint of checkpoints) {
      const full = await this.loadCheckpoint(checkpoint.id);
      exported.push(full);
    }

    return {
      sessionId: this.sessionId,
      exportedAt: new Date().toISOString(),
      checkpoints: exported
    };
  }

  /**
   * Import checkpoints from backup
   */
  async importCheckpoints(exportData) {
    const imported = [];
    
    for (const checkpoint of exportData.checkpoints) {
      try {
        const checkpointPath = this.getCheckpointPath(checkpoint.id);
        const sessionDir = this.getSessionDir();
        
        await fs.mkdir(sessionDir, { recursive: true });
        await fs.writeFile(checkpointPath, JSON.stringify(checkpoint, null, 2));
        
        imported.push(checkpoint.id);
      } catch (error) {
        console.warn(`Failed to import checkpoint ${checkpoint.id}: ${error.message}`);
      }
    }

    this.emit('checkpoints:imported', { 
      importedCount: imported.length,
      importedIds: imported 
    });

    return imported;
  }
}

// ============================================================================
// Convenience Functions for Integration
// ============================================================================

// Global checkpoint manager instance
let globalCheckpointManager = null;

/**
 * Get or create global checkpoint manager
 */
export function getCheckpointManager(sessionId = 'default') {
  if (!globalCheckpointManager || globalCheckpointManager.sessionId !== sessionId) {
    globalCheckpointManager = new ConversationCheckpoints({ sessionId });
  }
  return globalCheckpointManager;
}

/**
 * Save checkpoint - convenience function
 */
export async function saveCheckpoint(name, sessionMemory, description = '') {
  const manager = getCheckpointManager(sessionMemory.sessionId || 'default');
  return await manager.saveCheckpoint(name, { sessionMemory, description });
}

/**
 * Restore checkpoint - convenience function
 */
export async function restoreCheckpoint(checkpointId, sessionMemory) {
  const manager = getCheckpointManager(sessionMemory.sessionId || 'default');
  return await manager.restoreCheckpoint(checkpointId, sessionMemory);
}

/**
 * List checkpoints - convenience function
 */
export async function listCheckpoints(sessionId = 'default') {
  const manager = getCheckpointManager(sessionId);
  return await manager.listCheckpoints();
}

/**
 * Auto checkpoint - convenience function
 */
export async function autoCheckpoint(action, sessionMemory) {
  const manager = getCheckpointManager(sessionMemory.sessionId || 'default');
  return await manager.createAutoCheckpoint(action, sessionMemory);
}

/**
 * Create checkpoint before major operation
 */
export function withCheckpoint(name, description = '') {
  return function(target, propertyName, descriptor) {
    const method = descriptor.value;
    
    descriptor.value = async function(...args) {
      // Try to find sessionMemory in the context
      const sessionMemory = this.sessionMemory || 
                           args.find(arg => arg && typeof arg.addInteraction === 'function');
      
      if (sessionMemory) {
        await saveCheckpoint(name, sessionMemory, description);
      }
      
      return method.apply(this, args);
    };
    
    return descriptor;
  };
}

// ============================================================================
// Export
// ============================================================================

export default {
  ConversationCheckpoints,
  getCheckpointManager,
  saveCheckpoint,
  restoreCheckpoint,
  listCheckpoints,
  autoCheckpoint,
  withCheckpoint,
  CONFIG,
};