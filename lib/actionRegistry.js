import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { watch } from 'fs';
import os from 'os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Action registry storage
const actionRegistry = new Map();

// File watcher state
let fileWatcher = null;
let watcherDebounceTimer = null;
const DEBOUNCE_DELAY = 1000; // 1 second

/**
 * Initialize the action registry
 * Loads all actions from builtin and user directories
 */
export async function initActionRegistry() {
  console.log('[ActionRegistry] Initializing...');

  try {
    // Clear existing registry
    actionRegistry.clear();

    // Load actions in order
    await loadBuiltinActions();
    await loadUserActions();
    await syncSkillsToActions();

    // Start file watcher for hot-reload
    startFileWatcher();

    console.log(`[ActionRegistry] Loaded ${actionRegistry.size} actions`);
    return true;

  } catch (error) {
    console.error('[ActionRegistry] Initialization failed:', error);
    return false;
  }
}

/**
 * Load built-in actions from actions/ directory
 */
async function loadBuiltinActions() {
  const actionsDir = path.join(__dirname, '../actions');

  try {
    await fs.access(actionsDir);
  } catch (error) {
    console.log('[ActionRegistry] No actions directory found, creating...');
    await fs.mkdir(actionsDir, { recursive: true });
    return;
  }

  // Scan all subdirectories (simple, medium, complex)
  const categories = await fs.readdir(actionsDir, { withFileTypes: true });

  for (const category of categories) {
    if (!category.isDirectory() || category.name.startsWith('_')) {
      continue;
    }

    const categoryPath = path.join(actionsDir, category.name);
    const files = await fs.readdir(categoryPath);

    for (const file of files) {
      if (file.endsWith('.js') && !file.startsWith('_')) {
        await loadActionFile(path.join(categoryPath, file), 'builtin');
      }
    }
  }
}

/**
 * Load user-custom actions from ~/.static-rebel/actions/
 */
async function loadUserActions() {
  const userActionsDir = path.join(os.homedir(), '.static-rebel', 'actions');

  try {
    await fs.access(userActionsDir);
  } catch (error) {
    // User actions directory doesn't exist yet, create it
    await fs.mkdir(userActionsDir, { recursive: true });
    console.log(`[ActionRegistry] Created user actions directory: ${userActionsDir}`);
    return;
  }

  const files = await fs.readdir(userActionsDir);

  for (const file of files) {
    if (file.endsWith('.js') && !file.startsWith('_')) {
      await loadActionFile(path.join(userActionsDir, file), 'user');
    }
  }
}

/**
 * Load a single action file
 * @param {string} filePath - Path to action file
 * @param {string} source - Source type (builtin, user, skill)
 */
async function loadActionFile(filePath, source) {
  try {
    // Dynamic import with cache busting for hot-reload
    const moduleUrl = `file://${filePath}?update=${Date.now()}`;
    const module = await import(moduleUrl);

    const action = module.default;

    if (!action || !action.name || !action.handler) {
      console.error(`[ActionRegistry] Invalid action file: ${filePath}`);
      return;
    }

    // Add metadata
    action.source = source;
    action.filePath = filePath;
    action.loadedAt = new Date().toISOString();

    // Set defaults
    action.enabled = action.enabled ?? true;
    action.version = action.version || '1.0.0';
    action.category = action.category || 'general';
    action.intentExamples = action.intentExamples || [];
    action.parameters = action.parameters || {};
    action.dependencies = action.dependencies || [];

    // Register action
    registerAction(action);

    console.log(`[ActionRegistry] Loaded ${source} action: ${action.name}`);

  } catch (error) {
    console.error(`[ActionRegistry] Failed to load ${filePath}:`, error.message);
  }
}

/**
 * Register an action in the registry
 * @param {Object} action - Action object
 */
export function registerAction(action) {
  if (!action.name) {
    throw new Error('Action must have a name');
  }

  if (!action.handler || typeof action.handler !== 'function') {
    throw new Error('Action must have a handler function');
  }

  // Check for name conflicts
  if (actionRegistry.has(action.name)) {
    const existing = actionRegistry.get(action.name);
    console.warn(`[ActionRegistry] Overwriting action: ${action.name} (was ${existing.source}, now ${action.source})`);
  }

  actionRegistry.set(action.name, action);
}

/**
 * Execute an action
 * @param {string} actionName - Name of action to execute
 * @param {string} input - User input
 * @param {Object} context - Execution context
 * @returns {Promise<Object>} Result object
 */
export async function executeAction(actionName, input, context) {
  const action = actionRegistry.get(actionName);

  if (!action) {
    return {
      success: false,
      error: `Action not found: ${actionName}`
    };
  }

  if (!action.enabled) {
    return {
      success: false,
      error: `Action disabled: ${actionName}`
    };
  }

  try {
    console.log(`[ActionRegistry] Executing action: ${actionName}`);

    const startTime = Date.now();
    const result = await action.handler(input, context, {});
    const duration = Date.now() - startTime;

    console.log(`[ActionRegistry] Action ${actionName} completed in ${duration}ms`);

    return {
      success: true,
      result,
      duration,
      actionName
    };

  } catch (error) {
    console.error(`[ActionRegistry] Action ${actionName} failed:`, error);

    return {
      success: false,
      error: error.message,
      stack: error.stack,
      actionName
    };
  }
}

/**
 * Get all registered actions
 * @returns {Array} Array of all actions
 */
export function getAllActions() {
  return Array.from(actionRegistry.values());
}

/**
 * Get a single action by name
 * @param {string} actionName - Name of action
 * @returns {Object|null} Action object or null
 */
export function getAction(actionName) {
  return actionRegistry.get(actionName) || null;
}

/**
 * Get action registry statistics
 * @returns {Object} Statistics object
 */
export function getActionStats() {
  const actions = getAllActions();

  const stats = {
    total: actions.length,
    bySource: {},
    byCategory: {},
    enabled: 0,
    disabled: 0
  };

  for (const action of actions) {
    // Count by source
    stats.bySource[action.source] = (stats.bySource[action.source] || 0) + 1;

    // Count by category
    stats.byCategory[action.category] = (stats.byCategory[action.category] || 0) + 1;

    // Count enabled/disabled
    if (action.enabled) {
      stats.enabled++;
    } else {
      stats.disabled++;
    }
  }

  return stats;
}

/**
 * Sync skills to action registry
 * Auto-registers all loaded skills as actions
 */
async function syncSkillsToActions() {
  try {
    const { listSkills } = await import('./skillsManager.js');
    const skills = listSkills();

    for (const skill of skills) {
      if (skill.loaded) {
        registerAction({
          name: `skill:${skill.name}`,
          displayName: skill.description || skill.name,
          description: skill.description || `Skill: ${skill.name}`,
          category: 'skill',
          version: '1.0.0',
          intentExamples: skill.triggers?.map(t => t.trigger) || [],

          async handler(input, context, params) {
            // Execute skill trigger
            const match = skill.triggers?.find(t =>
              input.toLowerCase().includes(t.trigger.toLowerCase())
            );

            if (match) {
              return match.response
                .replace(/{{user}}/g, context.user?.name || 'User')
                .replace(/{{time}}/g, new Date().toLocaleTimeString());
            }

            return `Skill ${skill.name} executed.`;
          },

          source: 'skill',
          enabled: true,
          createdAt: new Date().toISOString()
        });

        console.log(`[ActionRegistry] Registered skill as action: ${skill.name}`);
      }
    }

  } catch (error) {
    console.log('[ActionRegistry] Skills not available or error syncing:', error.message);
  }
}

/**
 * Start file watcher for hot-reload
 */
function startFileWatcher() {
  if (fileWatcher) {
    return; // Already watching
  }

  const actionsDir = path.join(__dirname, '../actions');
  const userActionsDir = path.join(os.homedir(), '.static-rebel', 'actions');

  try {
    fileWatcher = watch(actionsDir, { recursive: true }, (eventType, filename) => {
      if (!filename || !filename.endsWith('.js')) {
        return;
      }

      // Debounce reloads
      clearTimeout(watcherDebounceTimer);
      watcherDebounceTimer = setTimeout(async () => {
        console.log(`[ActionRegistry] File changed: ${filename}, reloading...`);
        await initActionRegistry();
      }, DEBOUNCE_DELAY);
    });

    console.log('[ActionRegistry] File watcher started for builtin actions');

    // Also watch user actions directory
    try {
      watch(userActionsDir, { recursive: true }, (eventType, filename) => {
        if (!filename || !filename.endsWith('.js')) {
          return;
        }

        clearTimeout(watcherDebounceTimer);
        watcherDebounceTimer = setTimeout(async () => {
          console.log(`[ActionRegistry] User action changed: ${filename}, reloading...`);
          await initActionRegistry();
        }, DEBOUNCE_DELAY);
      });

      console.log('[ActionRegistry] File watcher started for user actions');
    } catch (error) {
      // User actions directory might not exist yet
      console.log('[ActionRegistry] User actions directory not watched (may not exist yet)');
    }

  } catch (error) {
    console.error('[ActionRegistry] Failed to start file watcher:', error.message);
  }
}

/**
 * Stop file watcher
 */
export function stopFileWatcher() {
  if (fileWatcher) {
    fileWatcher.close();
    fileWatcher = null;
    console.log('[ActionRegistry] File watcher stopped');
  }
}
