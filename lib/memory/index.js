/**
 * Conversation Memory Module
 *
 * Stores chat summaries, extracts entities, and learns user habits.
 *
 * Usage:
 *   import { summarize, extractEntities, learn, getContext } from './lib/memory/index.js';
 */

export {
  // Core functions
  summarize,
  extractEntities,
  learn,
  recordUsage,
  getContext,
  formatContextForPrompt,
  // Utilities
  getMemoryStats,
  searchMemory,
  clearMemory,
  exportMemory,
  importMemory,
  // Internal
  loadStore,
  saveStore,
  MEMORY_CONFIG,
} from './conversation.js';
