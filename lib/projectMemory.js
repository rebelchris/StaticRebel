/**
 * Project Memory - Cross-session project goal and preference persistence
 *
 * Features:
 * - Persist project goals across sessions
 * - Track active and completed tasks
 * - Store editor preferences and coding style
 * - Recall previous session context
 * - Project-specific memory storage
 *
 * @module projectMemory
 */

import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { v4 as uuidv4 } from 'uuid';

// ============================================================================
// Configuration
// ============================================================================

const CONFIG_DIR = path.join(os.homedir(), '.static-rebel');
const PROJECTS_DIR = path.join(CONFIG_DIR, 'projects');
const GLOBAL_MEMORY_FILE = path.join(CONFIG_DIR, 'global-memory.json');

// ============================================================================
// Types & Interfaces
// ============================================================================

/**
 * @typedef {Object} ProjectGoal
 * @property {string} id - Goal ID
 * @property {string} description - Goal description
 * @property {string} type - Goal type ('short', 'long', 'ephemeral')
 * @property {number} priority - Priority 1-10
 * @property {string[]} successCriteria - Criteria for completion
 * @property {string} status - 'pending', 'active', 'completed', 'failed', 'blocked'
 * @property {Date} createdAt - Creation timestamp
 * @property {Date} [completedAt] - Completion timestamp
 * @property {Object} metadata - Additional metadata
 */

/**
 * @typedef {Object} ProjectSession
 * @property {string} id - Session ID
 * @property {Date} startedAt - Session start
 * @property {Date} [endedAt] - Session end
 * @property {string[]} goalsWorkedOn - Goal IDs worked on
 * @property {Object} context - Session context
 */

/**
 * @typedef {Object} ProjectMemory
 * @property {string} projectPath - Project path
 * @property {string} projectName - Project name
 * @property {ProjectGoal[]} goals - Project goals
 * @property {ProjectSession[]} sessions - Past sessions
 * @property {Object} preferences - Project preferences
 * @property {Object} codingStyle - Coding style preferences
 * @property {Date} lastAccessed - Last access timestamp
 */

// ============================================================================
// Initialization
// ============================================================================

/**
 * Initialize project memory system
 */
export async function initProjectMemory() {
  await fs.mkdir(PROJECTS_DIR, { recursive: true });
  console.log('[ProjectMemory] Initialized');
}

/**
 * Get project memory file path
 * @param {string} projectPath - Project path
 * @returns {string}
 */
function getProjectMemoryPath(projectPath) {
  // Create a safe filename from the project path
  const safeName = projectPath
    .replace(/[/\\]/g, '_')
    .replace(/:/g, '');
  return path.join(PROJECTS_DIR, `${safeName}.json`);
}

// ============================================================================
// Project Memory Management
// ============================================================================

/**
 * Load project memory
 * @param {string} projectPath - Project path
 * @returns {Promise<ProjectMemory>}
 */
export async function loadProjectMemory(projectPath) {
  const memoryPath = getProjectMemoryPath(projectPath);

  try {
    const data = await fs.readFile(memoryPath, 'utf-8');
    const memory = JSON.parse(data);

    // Update last accessed
    memory.lastAccessed = new Date().toISOString();
    await saveProjectMemory(projectPath, memory);

    return memory;
  } catch {
    // Create new project memory
    const projectName = path.basename(projectPath);
    return {
      projectPath,
      projectName,
      goals: [],
      sessions: [],
      preferences: {},
      codingStyle: {},
      lastAccessed: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    };
  }
}

/**
 * Save project memory
 * @param {string} projectPath - Project path
 * @param {ProjectMemory} memory - Project memory
 */
export async function saveProjectMemory(projectPath, memory) {
  const memoryPath = getProjectMemoryPath(projectPath);
  await fs.writeFile(memoryPath, JSON.stringify(memory, null, 2));
}

/**
 * Get all tracked projects
 * @returns {Promise<Array<{path: string, name: string, lastAccessed: Date}>>}
 */
export async function listProjects() {
  try {
    const files = await fs.readdir(PROJECTS_DIR);
    const projects = [];

    for (const file of files) {
      if (file.endsWith('.json')) {
        try {
          const data = await fs.readFile(path.join(PROJECTS_DIR, file), 'utf-8');
          const memory = JSON.parse(data);
          projects.push({
            path: memory.projectPath,
            name: memory.projectName,
            lastAccessed: new Date(memory.lastAccessed),
          });
        } catch {
          // Skip invalid files
        }
      }
    }

    return projects.sort((a, b) => b.lastAccessed - a.lastAccessed);
  } catch {
    return [];
  }
}

// ============================================================================
// Goal Management
// ============================================================================

/**
 * Create a new goal
 * @param {string} projectPath - Project path
 * @param {Object} goalData - Goal data
 * @returns {Promise<ProjectGoal>}
 */
export async function createGoal(projectPath, goalData) {
  const memory = await loadProjectMemory(projectPath);

  const goal = {
    id: uuidv4(),
    description: goalData.description,
    type: goalData.type || 'short',
    priority: goalData.priority || 5,
    successCriteria: goalData.successCriteria || [],
    status: 'pending',
    createdAt: new Date().toISOString(),
    metadata: goalData.metadata || {},
  };

  memory.goals.push(goal);
  await saveProjectMemory(projectPath, memory);

  return goal;
}

/**
 * Get a goal by ID
 * @param {string} projectPath - Project path
 * @param {string} goalId - Goal ID
 * @returns {Promise<ProjectGoal|null>}
 */
export async function getGoal(projectPath, goalId) {
  const memory = await loadProjectMemory(projectPath);
  return memory.goals.find(g => g.id === goalId) || null;
}

/**
 * Update a goal
 * @param {string} projectPath - Project path
 * @param {string} goalId - Goal ID
 * @param {Object} updates - Updates to apply
 * @returns {Promise<ProjectGoal|null>}
 */
export async function updateGoal(projectPath, goalId, updates) {
  const memory = await loadProjectMemory(projectPath);
  const goalIndex = memory.goals.findIndex(g => g.id === goalId);

  if (goalIndex === -1) return null;

  memory.goals[goalIndex] = {
    ...memory.goals[goalIndex],
    ...updates,
    id: memory.goals[goalIndex].id, // Prevent ID change
  };

  await saveProjectMemory(projectPath, memory);
  return memory.goals[goalIndex];
}

/**
 * Activate a goal (set status to 'active')
 * @param {string} projectPath - Project path
 * @param {string} goalId - Goal ID
 * @returns {Promise<ProjectGoal|null>}
 */
export async function activateGoal(projectPath, goalId) {
  return updateGoal(projectPath, goalId, { status: 'active' });
}

/**
 * Complete a goal
 * @param {string} projectPath - Project path
 * @param {string} goalId - Goal ID
 * @param {Object} result - Completion result
 * @returns {Promise<ProjectGoal|null>}
 */
export async function completeGoal(projectPath, goalId, result = {}) {
  return updateGoal(projectPath, goalId, {
    status: 'completed',
    completedAt: new Date().toISOString(),
    metadata: {
      ...result,
    },
  });
}

/**
 * Get active goals
 * @param {string} projectPath - Project path
 * @returns {Promise<ProjectGoal[]>}
 */
export async function getActiveGoals(projectPath) {
  const memory = await loadProjectMemory(projectPath);
  return memory.goals.filter(g => g.status === 'active');
}

/**
 * Get pending goals
 * @param {string} projectPath - Project path
 * @returns {Promise<ProjectGoal[]>}
 */
export async function getPendingGoals(projectPath) {
  const memory = await loadProjectMemory(projectPath);
  return memory.goals.filter(g => g.status === 'pending');
}

/**
 * Get all goals
 * @param {string} projectPath - Project path
 * @param {Object} filters - Filters
 * @returns {Promise<ProjectGoal[]>}
 */
export async function getGoals(projectPath, filters = {}) {
  const memory = await loadProjectMemory(projectPath);
  let goals = memory.goals;

  if (filters.status) {
    goals = goals.filter(g => g.status === filters.status);
  }

  if (filters.type) {
    goals = goals.filter(g => g.type === filters.type);
  }

  if (filters.priority) {
    goals = goals.filter(g => g.priority >= filters.priority);
  }

  // Sort by priority (high first) then by creation date
  return goals.sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority;
    return new Date(a.createdAt) - new Date(b.createdAt);
  });
}

/**
 * Delete a goal
 * @param {string} projectPath - Project path
 * @param {string} goalId - Goal ID
 * @returns {Promise<boolean>}
 */
export async function deleteGoal(projectPath, goalId) {
  const memory = await loadProjectMemory(projectPath);
  const initialLength = memory.goals.length;
  memory.goals = memory.goals.filter(g => g.id !== goalId);

  if (memory.goals.length < initialLength) {
    await saveProjectMemory(projectPath, memory);
    return true;
  }

  return false;
}

// ============================================================================
// Session Management
// ============================================================================

/**
 * Start a new session
 * @param {string} projectPath - Project path
 * @param {Object} context - Initial context
 * @returns {Promise<ProjectSession>}
 */
export async function startSession(projectPath, context = {}) {
  const memory = await loadProjectMemory(projectPath);

  const session = {
    id: uuidv4(),
    startedAt: new Date().toISOString(),
    goalsWorkedOn: [],
    context,
  };

  memory.sessions.push(session);
  await saveProjectMemory(projectPath, memory);

  return session;
}

/**
 * End a session
 * @param {string} projectPath - Project path
 * @param {string} sessionId - Session ID
 * @param {Object} finalContext - Final context
 * @returns {Promise<ProjectSession|null>}
 */
export async function endSession(projectPath, sessionId, finalContext = {}) {
  const memory = await loadProjectMemory(projectPath);
  const session = memory.sessions.find(s => s.id === sessionId);

  if (!session) return null;

  session.endedAt = new Date().toISOString();
  session.context = {
    ...session.context,
    ...finalContext,
  };

  await saveProjectMemory(projectPath, memory);
  return session;
}

/**
 * Record work on a goal during a session
 * @param {string} projectPath - Project path
 * @param {string} sessionId - Session ID
 * @param {string} goalId - Goal ID
 */
export async function recordGoalWork(projectPath, sessionId, goalId) {
  const memory = await loadProjectMemory(projectPath);
  const session = memory.sessions.find(s => s.id === sessionId);

  if (session && !session.goalsWorkedOn.includes(goalId)) {
    session.goalsWorkedOn.push(goalId);
    await saveProjectMemory(projectPath, memory);
  }
}

/**
 * Get recent sessions
 * @param {string} projectPath - Project path
 * @param {number} limit - Maximum number of sessions
 * @returns {Promise<ProjectSession[]>}
 */
export async function getRecentSessions(projectPath, limit = 5) {
  const memory = await loadProjectMemory(projectPath);
  return memory.sessions
    .sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt))
    .slice(0, limit);
}

// ============================================================================
// Preferences & Coding Style
// ============================================================================

/**
 * Set a preference
 * @param {string} projectPath - Project path
 * @param {string} key - Preference key
 * @param {any} value - Preference value
 */
export async function setPreference(projectPath, key, value) {
  const memory = await loadProjectMemory(projectPath);
  memory.preferences[key] = value;
  await saveProjectMemory(projectPath, memory);
}

/**
 * Get a preference
 * @param {string} projectPath - Project path
 * @param {string} key - Preference key
 * @param {any} defaultValue - Default value
 * @returns {Promise<any>}
 */
export async function getPreference(projectPath, key, defaultValue = null) {
  const memory = await loadProjectMemory(projectPath);
  return memory.preferences[key] ?? defaultValue;
}

/**
 * Set coding style preference
 * @param {string} projectPath - Project path
 * @param {string} key - Style key
 * @param {any} value - Style value
 */
export async function setCodingStyle(projectPath, key, value) {
  const memory = await loadProjectMemory(projectPath);
  memory.codingStyle[key] = value;
  await saveProjectMemory(projectPath, memory);
}

/**
 * Get coding style
 * @param {string} projectPath - Project path
 * @returns {Promise<Object>}
 */
export async function getCodingStyle(projectPath) {
  const memory = await loadProjectMemory(projectPath);
  return memory.codingStyle;
}

/**
 * Infer coding style from existing code
 * @param {string} projectPath - Project path
 * @param {Object} analysis - Code analysis results
 */
export async function inferCodingStyle(projectPath, analysis) {
  const memory = await loadProjectMemory(projectPath);

  // Update style based on analysis
  if (analysis.indentation) {
    memory.codingStyle.indentation = analysis.indentation;
  }
  if (analysis.quotes) {
    memory.codingStyle.quotes = analysis.quotes;
  }
  if (analysis.semicolons !== undefined) {
    memory.codingStyle.semicolons = analysis.semicolons;
  }
  if (analysis.trailingCommas !== undefined) {
    memory.codingStyle.trailingCommas = analysis.trailingCommas;
  }
  if (analysis.maxLineLength) {
    memory.codingStyle.maxLineLength = analysis.maxLineLength;
  }

  await saveProjectMemory(projectPath, memory);
}

// ============================================================================
// Context & Recovery
// ============================================================================

/**
 * Get project context for AI
 * @param {string} projectPath - Project path
 * @returns {Promise<Object>}
 */
export async function getProjectContext(projectPath) {
  const memory = await loadProjectMemory(projectPath);
  const activeGoals = await getActiveGoals(projectPath);
  const recentSessions = await getRecentSessions(projectPath, 3);

  return {
    projectName: memory.projectName,
    activeGoals: activeGoals.map(g => ({
      id: g.id,
      description: g.description,
      priority: g.priority,
      progress: g.metadata?.progress || 0,
    })),
    recentWork: recentSessions.map(s => ({
      date: s.startedAt,
      goals: s.goalsWorkedOn.length,
      summary: s.context?.summary || 'Session in progress',
    })),
    preferences: memory.preferences,
    codingStyle: memory.codingStyle,
  };
}

/**
 * Get task to resume
 * @param {string} projectPath - Project path
 * @returns {Promise<Object|null>}
 */
export async function getResumableTask(projectPath) {
  const memory = await loadProjectMemory(projectPath);

  // Find incomplete sessions
  const incompleteSessions = memory.sessions.filter(s => !s.endedAt);
  if (incompleteSessions.length > 0) {
    const session = incompleteSessions[0];
    const goals = session.goalsWorkedOn.map(gid =>
      memory.goals.find(g => g.id === gid)
    ).filter(Boolean);

    return {
      sessionId: session.id,
      goals,
      context: session.context,
    };
  }

  // Find active goals
  const activeGoals = memory.goals.filter(g => g.status === 'active');
  if (activeGoals.length > 0) {
    return {
      sessionId: null,
      goals: activeGoals,
      context: {},
    };
  }

  return null;
}

/**
 * Archive completed goals
 * @param {string} projectPath - Project path
 * @param {number} olderThanDays - Archive goals completed before this many days
 */
export async function archiveOldGoals(projectPath, olderThanDays = 30) {
  const memory = await loadProjectMemory(projectPath);
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - olderThanDays);

  let archived = 0;
  for (const goal of memory.goals) {
    if (goal.status === 'completed' && goal.completedAt) {
      const completed = new Date(goal.completedAt);
      if (completed < cutoff) {
        goal.status = 'archived';
        archived++;
      }
    }
  }

  if (archived > 0) {
    await saveProjectMemory(projectPath, memory);
  }

  return archived;
}

// ============================================================================
// Global Memory
// ============================================================================

/**
 * Load global memory
 * @returns {Promise<Object>}
 */
async function loadGlobalMemory() {
  try {
    const data = await fs.readFile(GLOBAL_MEMORY_FILE, 'utf-8');
    return JSON.parse(data);
  } catch {
    return {
      preferences: {},
      recentProjects: [],
      createdAt: new Date().toISOString(),
    };
  }
}

/**
 * Save global memory
 * @param {Object} memory - Global memory
 */
async function saveGlobalMemory(memory) {
  await fs.writeFile(GLOBAL_MEMORY_FILE, JSON.stringify(memory, null, 2));
}

/**
 * Set global preference
 * @param {string} key - Preference key
 * @param {any} value - Preference value
 */
export async function setGlobalPreference(key, value) {
  const memory = await loadGlobalMemory();
  memory.preferences[key] = value;
  await saveGlobalMemory(memory);
}

/**
 * Get global preference
 * @param {string} key - Preference key
 * @param {any} defaultValue - Default value
 * @returns {Promise<any>}
 */
export async function getGlobalPreference(key, defaultValue = null) {
  const memory = await loadGlobalMemory();
  return memory.preferences[key] ?? defaultValue;
}

/**
 * Record project access
 * @param {string} projectPath - Project path
 */
export async function recordProjectAccess(projectPath) {
  const memory = await loadGlobalMemory();

  // Remove if exists
  memory.recentProjects = memory.recentProjects.filter(p => p.path !== projectPath);

  // Add to front
  memory.recentProjects.unshift({
    path: projectPath,
    name: path.basename(projectPath),
    lastAccessed: new Date().toISOString(),
  });

  // Keep only last 20
  memory.recentProjects = memory.recentProjects.slice(0, 20);

  await saveGlobalMemory(memory);
}

/**
 * Get recent projects
 * @param {number} limit - Maximum number of projects
 * @returns {Promise<Array<Object>>}
 */
export async function getRecentProjects(limit = 10) {
  const memory = await loadGlobalMemory();
  return memory.recentProjects.slice(0, limit);
}

// ============================================================================
// Export Default
// ============================================================================

export default {
  initProjectMemory,
  loadProjectMemory,
  saveProjectMemory,
  listProjects,
  createGoal,
  getGoal,
  updateGoal,
  activateGoal,
  completeGoal,
  getActiveGoals,
  getPendingGoals,
  getGoals,
  deleteGoal,
  startSession,
  endSession,
  recordGoalWork,
  getRecentSessions,
  setPreference,
  getPreference,
  setCodingStyle,
  getCodingStyle,
  inferCodingStyle,
  getProjectContext,
  getResumableTask,
  archiveOldGoals,
  setGlobalPreference,
  getGlobalPreference,
  recordProjectAccess,
  getRecentProjects,
};
