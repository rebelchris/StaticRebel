/**
 * Conversation Memory Layer
 *
 * Stores chat summaries, extracts entities, and learns user habits over time.
 * Data persisted to lib/memory/store.json
 *
 * Usage:
 *   import { summarize, extractEntities, learn, getContext } from './lib/memory/conversation.js';
 *
 *   // After a conversation
 *   await summarize(messages);
 *
 *   // Extract entities from text
 *   const entities = await extractEntities('Meeting with John about Project Alpha');
 *
 *   // Learn from user behavior
 *   await learn('prefers_dark_mode', true);
 *
 *   // Get context for LLM calls
 *   const context = await getContext();
 */

import { chatCompletion, getModelForTask } from '../modelRegistry.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ============================================================================
// Configuration
// ============================================================================

const CONFIG = {
  DEBUG: process.env.DEBUG_MEMORY === 'true',
  STORE_PATH: path.join(__dirname, 'store.json'),
  MAX_SUMMARIES: 100,
  MAX_ENTITIES_PER_TYPE: 500,
  MAX_HABITS: 200,
  SUMMARY_MAX_TOKENS: 150,
  CONTEXT_WINDOW_DAYS: 30,
};

// ============================================================================
// Store Schema
// ============================================================================

/**
 * @typedef {Object} MemoryStore
 * @property {Array} summaries - Chat summaries
 * @property {Object} entities - Extracted entities by type
 * @property {Object} habits - Learned user habits
 * @property {Object} preferences - User preferences
 * @property {Object} patterns - Recurring patterns
 * @property {Object} metadata - Store metadata
 */

const DEFAULT_STORE = {
  summaries: [],
  entities: {
    people: [],      // { name, context, lastSeen, mentions }
    projects: [],    // { name, description, status, lastMentioned }
    topics: [],      // { name, frequency, lastDiscussed }
    locations: [],   // { name, type, mentions }
    dates: [],       // { date, event, context }
  },
  habits: {
    timePatterns: {},    // When user typically works
    topicFrequency: {},  // What they ask about most
    preferredFormats: {},// How they like responses
    commandUsage: {},    // Which commands they use
  },
  preferences: {
    communication: {},   // Tone, verbosity, etc.
    technical: {},       // Languages, tools, etc.
    general: {},         // Other preferences
  },
  patterns: {
    recurring: [],       // Recurring tasks/topics
    workflows: [],       // Common multi-step patterns
  },
  metadata: {
    version: 1,
    createdAt: new Date().toISOString(),
    lastUpdated: new Date().toISOString(),
    totalInteractions: 0,
  },
};

// ============================================================================
// Store Operations
// ============================================================================

let storeCache = null;

/**
 * Load store from disk
 */
async function loadStore() {
  if (storeCache) return storeCache;

  try {
    const content = await fs.readFile(CONFIG.STORE_PATH, 'utf-8');
    storeCache = JSON.parse(content);

    // Migrate if needed
    if (!storeCache.metadata) {
      storeCache = { ...DEFAULT_STORE, ...storeCache };
    }

    return storeCache;
  } catch (error) {
    if (error.code === 'ENOENT') {
      // Create new store
      storeCache = { ...DEFAULT_STORE };
      await saveStore();
      return storeCache;
    }
    throw error;
  }
}

/**
 * Save store to disk
 */
async function saveStore() {
  if (!storeCache) return;

  storeCache.metadata.lastUpdated = new Date().toISOString();

  await fs.writeFile(
    CONFIG.STORE_PATH,
    JSON.stringify(storeCache, null, 2)
  );
}

/**
 * Ensure store is loaded
 */
async function ensureStore() {
  if (!storeCache) {
    await loadStore();
  }
  return storeCache;
}

// ============================================================================
// Summarization
// ============================================================================

/**
 * Summarize a conversation or set of messages
 *
 * @param {Array|string} messages - Messages to summarize
 * @param {Object} options - Options
 * @returns {Promise<Object>} Summary object
 */
export async function summarize(messages, options = {}) {
  const {
    maxTokens = CONFIG.SUMMARY_MAX_TOKENS,
    includeEntities = true,
  } = options;

  const store = await ensureStore();

  // Normalize messages to text
  let text;
  if (typeof messages === 'string') {
    text = messages;
  } else if (Array.isArray(messages)) {
    text = messages
      .map(m => `${m.role || 'user'}: ${m.content}`)
      .join('\n');
  } else {
    text = String(messages);
  }

  // Use LLM to generate summary
  const model = getModelForTask?.('summarization') || 'ollama/llama3.2';

  const systemPrompt = `You are a conversation summarizer. Create a brief, factual summary.
Focus on:
- Key decisions made
- Tasks discussed or assigned
- Important information shared
- Action items

Output JSON: { "summary": "...", "keyPoints": ["..."], "actionItems": ["..."] }`;

  try {
    const response = await chatCompletion(model, [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `Summarize this conversation (max ${maxTokens} tokens):\n\n${text}` },
    ], { format: 'json' });

    const content = typeof response === 'string' ? response : response.content;

    let summaryData;
    try {
      const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, content];
      summaryData = JSON.parse(jsonMatch[1] || content);
    } catch {
      summaryData = {
        summary: content.slice(0, maxTokens * 4),
        keyPoints: [],
        actionItems: [],
      };
    }

    // Store summary
    const summaryEntry = {
      id: `sum_${Date.now()}`,
      timestamp: new Date().toISOString(),
      summary: summaryData.summary,
      keyPoints: summaryData.keyPoints || [],
      actionItems: summaryData.actionItems || [],
      messageCount: Array.isArray(messages) ? messages.length : 1,
    };

    store.summaries.unshift(summaryEntry);

    // Trim old summaries
    if (store.summaries.length > CONFIG.MAX_SUMMARIES) {
      store.summaries = store.summaries.slice(0, CONFIG.MAX_SUMMARIES);
    }

    store.metadata.totalInteractions++;
    await saveStore();

    // Also extract entities if requested
    if (includeEntities) {
      await extractEntities(text);
    }

    if (CONFIG.DEBUG) {
      console.log(`[Memory] Summarized conversation: ${summaryData.summary.slice(0, 50)}...`);
    }

    return summaryEntry;
  } catch (error) {
    console.error('[Memory] Summarization failed:', error.message);
    return {
      id: `sum_${Date.now()}`,
      timestamp: new Date().toISOString(),
      summary: 'Failed to summarize',
      error: error.message,
    };
  }
}

// ============================================================================
// Entity Extraction
// ============================================================================

/**
 * Extract entities from text (people, projects, topics, etc.)
 *
 * @param {string} text - Text to extract from
 * @returns {Promise<Object>} Extracted entities
 */
export async function extractEntities(text) {
  const store = await ensureStore();

  const model = getModelForTask?.('extraction') || 'ollama/llama3.2';

  const systemPrompt = `You are an entity extraction system. Extract named entities from text.

Output JSON:
{
  "people": [{ "name": "...", "context": "..." }],
  "projects": [{ "name": "...", "description": "..." }],
  "topics": ["..."],
  "locations": ["..."],
  "dates": [{ "date": "...", "event": "..." }]
}

Only include entities that are clearly mentioned. Be precise.`;

  try {
    const response = await chatCompletion(model, [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `Extract entities from:\n\n${text}` },
    ], { format: 'json' });

    const content = typeof response === 'string' ? response : response.content;

    let entities;
    try {
      const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, content];
      entities = JSON.parse(jsonMatch[1] || content);
    } catch {
      return store.entities;
    }

    const now = new Date().toISOString();

    // Merge people
    if (entities.people) {
      for (const person of entities.people) {
        const existing = store.entities.people.find(
          p => p.name.toLowerCase() === person.name.toLowerCase()
        );
        if (existing) {
          existing.mentions = (existing.mentions || 1) + 1;
          existing.lastSeen = now;
          if (person.context) {
            existing.context = person.context;
          }
        } else {
          store.entities.people.push({
            name: person.name,
            context: person.context || '',
            lastSeen: now,
            mentions: 1,
          });
        }
      }
      // Trim
      if (store.entities.people.length > CONFIG.MAX_ENTITIES_PER_TYPE) {
        store.entities.people = store.entities.people
          .sort((a, b) => b.mentions - a.mentions)
          .slice(0, CONFIG.MAX_ENTITIES_PER_TYPE);
      }
    }

    // Merge projects
    if (entities.projects) {
      for (const project of entities.projects) {
        const existing = store.entities.projects.find(
          p => p.name.toLowerCase() === project.name.toLowerCase()
        );
        if (existing) {
          existing.lastMentioned = now;
          if (project.description) {
            existing.description = project.description;
          }
        } else {
          store.entities.projects.push({
            name: project.name,
            description: project.description || '',
            status: 'active',
            lastMentioned: now,
          });
        }
      }
      if (store.entities.projects.length > CONFIG.MAX_ENTITIES_PER_TYPE) {
        store.entities.projects = store.entities.projects.slice(0, CONFIG.MAX_ENTITIES_PER_TYPE);
      }
    }

    // Merge topics
    if (entities.topics) {
      for (const topic of entities.topics) {
        const topicName = typeof topic === 'string' ? topic : topic.name;
        const existing = store.entities.topics.find(
          t => t.name.toLowerCase() === topicName.toLowerCase()
        );
        if (existing) {
          existing.frequency = (existing.frequency || 1) + 1;
          existing.lastDiscussed = now;
        } else {
          store.entities.topics.push({
            name: topicName,
            frequency: 1,
            lastDiscussed: now,
          });
        }
      }
      if (store.entities.topics.length > CONFIG.MAX_ENTITIES_PER_TYPE) {
        store.entities.topics = store.entities.topics
          .sort((a, b) => b.frequency - a.frequency)
          .slice(0, CONFIG.MAX_ENTITIES_PER_TYPE);
      }
    }

    // Merge locations
    if (entities.locations) {
      for (const location of entities.locations) {
        const locName = typeof location === 'string' ? location : location.name;
        if (!store.entities.locations.find(l => l.name.toLowerCase() === locName.toLowerCase())) {
          store.entities.locations.push({
            name: locName,
            type: 'unknown',
            mentions: 1,
          });
        }
      }
    }

    // Merge dates/events
    if (entities.dates) {
      for (const dateInfo of entities.dates) {
        store.entities.dates.push({
          date: dateInfo.date,
          event: dateInfo.event || '',
          context: text.slice(0, 100),
          recordedAt: now,
        });
      }
      // Keep recent dates only
      store.entities.dates = store.entities.dates.slice(-CONFIG.MAX_ENTITIES_PER_TYPE);
    }

    await saveStore();

    if (CONFIG.DEBUG) {
      console.log(`[Memory] Extracted entities:`, Object.keys(entities).filter(k => entities[k]?.length));
    }

    return entities;
  } catch (error) {
    console.error('[Memory] Entity extraction failed:', error.message);
    return {};
  }
}

// ============================================================================
// Learning
// ============================================================================

/**
 * Learn a user habit or preference
 *
 * @param {string} key - What to learn (e.g., 'prefers_concise', 'works_late')
 * @param {any} value - The learned value
 * @param {string} [category] - Category: 'habit', 'preference', 'pattern'
 */
export async function learn(key, value, category = 'preference') {
  const store = await ensureStore();
  const now = new Date().toISOString();

  switch (category) {
    case 'habit':
      store.habits[key] = {
        value,
        learnedAt: now,
        occurrences: (store.habits[key]?.occurrences || 0) + 1,
      };
      break;

    case 'pattern':
      if (!store.patterns.recurring.find(p => p.key === key)) {
        store.patterns.recurring.push({
          key,
          value,
          firstSeen: now,
          lastSeen: now,
          occurrences: 1,
        });
      } else {
        const pattern = store.patterns.recurring.find(p => p.key === key);
        pattern.lastSeen = now;
        pattern.occurrences++;
        pattern.value = value;
      }
      break;

    case 'preference':
    default:
      // Categorize preference
      if (key.includes('tone') || key.includes('verbos') || key.includes('format')) {
        store.preferences.communication[key] = value;
      } else if (key.includes('lang') || key.includes('tool') || key.includes('tech')) {
        store.preferences.technical[key] = value;
      } else {
        store.preferences.general[key] = value;
      }
      break;
  }

  await saveStore();

  if (CONFIG.DEBUG) {
    console.log(`[Memory] Learned ${category}: ${key} = ${JSON.stringify(value)}`);
  }
}

/**
 * Record command/action usage for habit learning
 */
export async function recordUsage(action, metadata = {}) {
  const store = await ensureStore();

  const hour = new Date().getHours();
  const day = new Date().toLocaleDateString('en-US', { weekday: 'long' });

  // Track time patterns
  if (!store.habits.timePatterns[day]) {
    store.habits.timePatterns[day] = {};
  }
  store.habits.timePatterns[day][hour] = (store.habits.timePatterns[day][hour] || 0) + 1;

  // Track command usage
  if (!store.habits.commandUsage[action]) {
    store.habits.commandUsage[action] = { count: 0, lastUsed: null };
  }
  store.habits.commandUsage[action].count++;
  store.habits.commandUsage[action].lastUsed = new Date().toISOString();

  // Track topic frequency from metadata
  if (metadata.topic) {
    store.habits.topicFrequency[metadata.topic] =
      (store.habits.topicFrequency[metadata.topic] || 0) + 1;
  }

  await saveStore();
}

// ============================================================================
// Context Retrieval
// ============================================================================

/**
 * Get relevant context for LLM calls
 *
 * @param {Object} options - Options for context retrieval
 * @returns {Promise<Object>} Context object
 */
export async function getContext(options = {}) {
  const {
    includeRecent = true,
    includePeople = true,
    includeProjects = true,
    includePreferences = true,
    maxSummaries = 5,
    maxPeople = 10,
    maxProjects = 5,
  } = options;

  const store = await ensureStore();
  const context = {};

  // Recent summaries
  if (includeRecent && store.summaries.length > 0) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - CONFIG.CONTEXT_WINDOW_DAYS);

    context.recentContext = store.summaries
      .filter(s => new Date(s.timestamp) > cutoff)
      .slice(0, maxSummaries)
      .map(s => s.summary)
      .join('\n');
  }

  // Known people
  if (includePeople && store.entities.people.length > 0) {
    context.knownPeople = store.entities.people
      .sort((a, b) => (b.mentions || 0) - (a.mentions || 0))
      .slice(0, maxPeople)
      .map(p => `${p.name}${p.context ? ` (${p.context})` : ''}`)
      .join(', ');
  }

  // Active projects
  if (includeProjects && store.entities.projects.length > 0) {
    context.activeProjects = store.entities.projects
      .filter(p => p.status !== 'completed')
      .slice(0, maxProjects)
      .map(p => `${p.name}: ${p.description || 'No description'}`)
      .join('\n');
  }

  // User preferences
  if (includePreferences) {
    const allPrefs = {
      ...store.preferences.communication,
      ...store.preferences.technical,
      ...store.preferences.general,
    };
    if (Object.keys(allPrefs).length > 0) {
      context.preferences = allPrefs;
    }
  }

  // Frequent topics
  const topTopics = Object.entries(store.habits.topicFrequency || {})
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([topic]) => topic);
  if (topTopics.length > 0) {
    context.frequentTopics = topTopics;
  }

  return context;
}

/**
 * Format context for injection into LLM system prompt
 */
export async function formatContextForPrompt(options = {}) {
  const context = await getContext(options);
  const parts = [];

  if (context.recentContext) {
    parts.push(`Recent conversation context:\n${context.recentContext}`);
  }

  if (context.knownPeople) {
    parts.push(`Known people: ${context.knownPeople}`);
  }

  if (context.activeProjects) {
    parts.push(`Active projects:\n${context.activeProjects}`);
  }

  if (context.preferences && Object.keys(context.preferences).length > 0) {
    parts.push(`User preferences: ${JSON.stringify(context.preferences)}`);
  }

  if (context.frequentTopics?.length > 0) {
    parts.push(`Frequently discussed topics: ${context.frequentTopics.join(', ')}`);
  }

  return parts.length > 0 ? parts.join('\n\n') : '';
}

// ============================================================================
// Utilities
// ============================================================================

/**
 * Get memory statistics
 */
export async function getMemoryStats() {
  const store = await ensureStore();

  return {
    summaries: store.summaries.length,
    people: store.entities.people.length,
    projects: store.entities.projects.length,
    topics: store.entities.topics.length,
    totalInteractions: store.metadata.totalInteractions,
    lastUpdated: store.metadata.lastUpdated,
    preferencesCount: Object.keys(store.preferences.general).length +
      Object.keys(store.preferences.technical).length +
      Object.keys(store.preferences.communication).length,
  };
}

/**
 * Search memory for relevant information
 */
export async function searchMemory(query) {
  const store = await ensureStore();
  const queryLower = query.toLowerCase();
  const results = [];

  // Search summaries
  for (const summary of store.summaries) {
    if (summary.summary.toLowerCase().includes(queryLower)) {
      results.push({
        type: 'summary',
        content: summary.summary,
        timestamp: summary.timestamp,
      });
    }
  }

  // Search people
  for (const person of store.entities.people) {
    if (person.name.toLowerCase().includes(queryLower) ||
        (person.context && person.context.toLowerCase().includes(queryLower))) {
      results.push({
        type: 'person',
        content: `${person.name}: ${person.context || 'No context'}`,
        mentions: person.mentions,
      });
    }
  }

  // Search projects
  for (const project of store.entities.projects) {
    if (project.name.toLowerCase().includes(queryLower) ||
        (project.description && project.description.toLowerCase().includes(queryLower))) {
      results.push({
        type: 'project',
        content: `${project.name}: ${project.description || 'No description'}`,
      });
    }
  }

  return results;
}

/**
 * Clear all memory (use with caution)
 */
export async function clearMemory() {
  storeCache = { ...DEFAULT_STORE };
  await saveStore();
  return { success: true, message: 'Memory cleared' };
}

/**
 * Export memory for backup
 */
export async function exportMemory() {
  const store = await ensureStore();
  return JSON.stringify(store, null, 2);
}

/**
 * Import memory from backup
 */
export async function importMemory(jsonData) {
  try {
    const data = typeof jsonData === 'string' ? JSON.parse(jsonData) : jsonData;
    storeCache = { ...DEFAULT_STORE, ...data };
    await saveStore();
    return { success: true, message: 'Memory imported' };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// ============================================================================
// Exports
// ============================================================================

export {
  loadStore,
  saveStore,
  CONFIG as MEMORY_CONFIG,
};
