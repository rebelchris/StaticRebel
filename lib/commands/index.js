/**
 * Commands Module
 * 
 * Declarative command registry and definitions.
 * 
 * @module lib/commands
 */

export * from './registry.js';
export * from './definitions.js';

export { default as registry } from './registry.js';
export { default as definitions } from './definitions.js';

// Auto-initialize commands when module is imported
import { initCommandDefinitions } from './definitions.js';

let initialized = false;

/**
 * Initialize the command system
 * Safe to call multiple times
 */
export function initCommands() {
  if (!initialized) {
    initCommandDefinitions();
    initialized = true;
  }
}
