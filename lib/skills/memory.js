/**
 * Persistent Memory for Skills
 * 
 * Stores conversation history, user preferences, and learned patterns
 * so the companion remembers across chat sessions.
 */

import fs from 'fs/promises';
import path from 'path';

/**
 * SkillMemory - persistent memory across sessions
 */
export class SkillMemory {
  constructor(dataDir) {
    this.dataDir = dataDir;
    this.memoryFile = path.join(dataDir, '_memory.json');
    this.memory = null;
  }

  async init() {
    try {
      const content = await fs.readFile(this.memoryFile, 'utf-8');
      this.memory = JSON.parse(content);
    } catch {
      this.memory = {
        conversations: {},      // chatId -> recent messages
        userPreferences: {},    // learned preferences (usual amounts, etc.)
        skillAliases: {},       // custom aliases ("h2o" -> "water")
        lastActivity: {},       // last activity per skill
        summaries: {},          // periodic summaries for context
        createdAt: Date.now()
      };
    }
    return this;
  }

  async save() {
    const tempPath = `${this.memoryFile}.tmp`;
    await fs.writeFile(tempPath, JSON.stringify(this.memory, null, 2));
    await fs.rename(tempPath, this.memoryFile);
  }

  // ============== CONVERSATION MEMORY ==============

  /**
   * Save recent conversation for a chat
   */
  async saveConversation(chatId, messages, maxMessages = 20) {
    this.memory.conversations[chatId] = {
      messages: messages.slice(-maxMessages),
      updatedAt: Date.now()
    };
    await this.save();
  }

  /**
   * Load conversation history for a chat
   */
  getConversation(chatId) {
    return this.memory.conversations[chatId]?.messages || [];
  }

  /**
   * Clear old conversations (older than X days)
   */
  async pruneConversations(maxAgeDays = 7) {
    const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;
    let pruned = 0;

    for (const [chatId, conv] of Object.entries(this.memory.conversations)) {
      if (conv.updatedAt < cutoff) {
        delete this.memory.conversations[chatId];
        pruned++;
      }
    }

    if (pruned > 0) await this.save();
    return pruned;
  }

  // ============== USER PREFERENCES ==============

  /**
   * Learn a user preference
   */
  async learnPreference(key, value, chatId = 'default') {
    if (!this.memory.userPreferences[chatId]) {
      this.memory.userPreferences[chatId] = {};
    }
    this.memory.userPreferences[chatId][key] = {
      value,
      learnedAt: Date.now()
    };
    await this.save();
  }

  /**
   * Get a user preference
   */
  getPreference(key, chatId = 'default') {
    return this.memory.userPreferences[chatId]?.[key]?.value;
  }

  /**
   * Get all preferences for a user
   */
  getPreferences(chatId = 'default') {
    const prefs = this.memory.userPreferences[chatId] || {};
    const result = {};
    for (const [key, data] of Object.entries(prefs)) {
      result[key] = data.value;
    }
    return result;
  }

  // ============== SKILL ALIASES ==============

  /**
   * Add a skill alias (e.g., "h2o" -> "water")
   */
  async addAlias(alias, skillId) {
    this.memory.skillAliases[alias.toLowerCase()] = skillId;
    await this.save();
  }

  /**
   * Resolve an alias to skill ID
   */
  resolveAlias(text) {
    return this.memory.skillAliases[text.toLowerCase()] || null;
  }

  /**
   * Get all aliases
   */
  getAliases() {
    return { ...this.memory.skillAliases };
  }

  // ============== ACTIVITY TRACKING ==============

  /**
   * Record last activity for a skill
   */
  async recordActivity(skillId, entry) {
    this.memory.lastActivity[skillId] = {
      entry,
      timestamp: Date.now()
    };
    await this.save();
  }

  /**
   * Get last activity for a skill
   */
  getLastActivity(skillId) {
    return this.memory.lastActivity[skillId];
  }

  /**
   * Get all recent activity
   */
  getRecentActivity() {
    const activity = [];
    for (const [skillId, data] of Object.entries(this.memory.lastActivity)) {
      activity.push({
        skillId,
        ...data
      });
    }
    return activity.sort((a, b) => b.timestamp - a.timestamp);
  }

  // ============== CONTEXT SUMMARIES ==============

  /**
   * Store a periodic summary for context
   */
  async storeSummary(period, summary) {
    this.memory.summaries[period] = {
      text: summary,
      createdAt: Date.now()
    };
    await this.save();
  }

  /**
   * Get the latest summary
   */
  getLatestSummary() {
    const periods = Object.entries(this.memory.summaries);
    if (periods.length === 0) return null;
    
    return periods
      .sort((a, b) => b[1].createdAt - a[1].createdAt)[0][1];
  }

  // ============== CONTEXT GENERATION ==============

  /**
   * Generate a context string for the LLM
   */
  async generateContext(chatId, skillManager) {
    const parts = [];

    // Recent activity
    const recentActivity = this.getRecentActivity().slice(0, 5);
    if (recentActivity.length > 0) {
      parts.push('Recent activity:');
      for (const act of recentActivity) {
        const ago = this.timeAgo(act.timestamp);
        const value = act.entry.value || act.entry.score || act.entry.content?.slice(0, 30);
        parts.push(`- ${act.skillId}: ${value} (${ago})`);
      }
    }

    // User preferences
    const prefs = this.getPreferences(chatId);
    if (Object.keys(prefs).length > 0) {
      parts.push('\nUser preferences:');
      for (const [key, value] of Object.entries(prefs)) {
        parts.push(`- ${key}: ${value}`);
      }
    }

    // Previous conversation summary
    const summary = this.getLatestSummary();
    if (summary) {
      parts.push(`\nPrevious context: ${summary.text}`);
    }

    return parts.join('\n');
  }

  /**
   * Helper: time ago string
   */
  timeAgo(timestamp) {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    
    if (seconds < 60) return 'just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
  }

  // ============== FULL STATE ==============

  /**
   * Export full memory state
   */
  export() {
    return { ...this.memory };
  }

  /**
   * Import memory state
   */
  async import(data) {
    this.memory = { ...this.memory, ...data };
    await this.save();
  }
}

export default SkillMemory;
