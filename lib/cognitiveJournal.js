// Cognitive Journal - First-person narrative journaling with emotional analysis
import { EventEmitter } from 'events';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { v4 as uuidv4 } from 'uuid';
import { getConfig } from './configManager.js';

const EVOLUTION_DIR = path.join(os.homedir(), '.static-rebel', 'evolution');
const JOURNAL_DIR = path.join(EVOLUTION_DIR, 'journal', 'entries');

/**
 * @typedef {Object} UserSignals
 * @property {number} frustration - 0-1 frustration level detected
 * @property {number} satisfaction - 0-1 satisfaction level detected
 * @property {number} impatience - 0-1 impatience level detected
 * @property {number} confusion - 0-1 confusion level detected
 * @property {number} engagement - 0-1 engagement level detected
 */

/**
 * @typedef {Object} GrowthOpportunity
 * @property {string} topic - Topic area for improvement
 * @property {number} urgency - 0-1 urgency level
 * @property {string[]} suggestedActions - Suggested improvement actions
 * @property {string} source - Where this opportunity was detected
 */

/**
 * @typedef {Object} JournalEntry
 * @property {string} id - Unique entry ID
 * @property {string} sessionId - Session this entry belongs to
 * @property {string} timestamp - ISO timestamp
 * @property {string} narrative - First-person narrative of the session
 * @property {'frustration'|'success'|'confusion'|'insight'|'routine'|'learning'} category
 * @property {UserSignals} userSignals - Detected user emotional signals
 * @property {string[]} knowledgeGaps - Topics where knowledge was lacking
 * @property {GrowthOpportunity[]} growthOpportunities - Identified improvement areas
 * @property {Object} metadata - Additional metadata
 */

// Patterns for detecting user emotional signals
const FRUSTRATION_PATTERNS = [
  /why (doesn't|won't|can't|isn't)/i,
  /still (not|doesn't|won't|broken)/i,
  /this (doesn't|isn't) work/i,
  /frustrated/i,
  /annoying/i,
  /ugh/i,
  /again\?/i,
  /still wrong/i,
  /no,? that's not/i,
  /I already (said|told|mentioned)/i,
];

const SATISFACTION_PATTERNS = [
  /thank(s| you)/i,
  /perfect/i,
  /great/i,
  /awesome/i,
  /exactly (what I|right)/i,
  /that('s| is) (it|right|correct)/i,
  /works?\s*(great|perfectly|now)/i,
  /nice/i,
  /love it/i,
];

const CONFUSION_PATTERNS = [
  /what do you mean/i,
  /I don't understand/i,
  /confused/i,
  /huh\??/i,
  /can you (explain|clarify)/i,
  /not sure (what|how|why)/i,
  /lost/i,
  /\?\s*\?/,
];

const IMPATIENCE_PATTERNS = [
  /just (tell|show|give) me/i,
  /hurry/i,
  /quickly/i,
  /faster/i,
  /skip (the|to)/i,
  /tldr/i,
  /get to the point/i,
  /too (long|verbose|much)/i,
];

// Patterns indicating knowledge gaps in AI responses
const HEDGING_PATTERNS = [
  /I('m| am) not (entirely )?sure/i,
  /I (think|believe|assume)/i,
  /might (be|have)/i,
  /possibly/i,
  /perhaps/i,
  /I('d| would) need to (check|verify)/i,
  /I don't have (specific|detailed) information/i,
];

class CognitiveJournal extends EventEmitter {
  constructor(options = {}) {
    super();

    this.options = {
      enabled: options.enabled !== undefined ? options.enabled : true,
      autoWriteThreshold: options.autoWriteThreshold || 5, // Min interactions to journal
      ...options,
    };

    this.currentSession = {
      id: uuidv4(),
      startTime: new Date().toISOString(),
      interactions: [],
      reflections: [],
    };

    this._ensureDirectories();
  }

  /**
   * Ensure storage directories exist
   * @private
   */
  _ensureDirectories() {
    try {
      if (!fs.existsSync(JOURNAL_DIR)) {
        fs.mkdirSync(JOURNAL_DIR, { recursive: true });
      }
    } catch (e) {
      console.error('[CognitiveJournal] Failed to create directories:', e.message);
    }
  }

  /**
   * Add an interaction to the current session
   * @param {Object} interaction - The interaction to add
   */
  addInteraction(interaction) {
    this.currentSession.interactions.push({
      ...interaction,
      timestamp: interaction.timestamp || new Date().toISOString(),
    });
  }

  /**
   * Add a reflection from the reflection engine
   * @param {Object} reflection - The reflection object
   */
  addReflection(reflection) {
    this.currentSession.reflections.push(reflection);
  }

  /**
   * Detect user emotional signals from session interactions
   * @param {Object[]} interactions - Array of interactions
   * @returns {UserSignals}
   */
  detectUserSignals(interactions) {
    const signals = {
      frustration: 0,
      satisfaction: 0,
      impatience: 0,
      confusion: 0,
      engagement: 0,
    };

    if (!interactions || interactions.length === 0) {
      return signals;
    }

    let frustrationCount = 0;
    let satisfactionCount = 0;
    let confusionCount = 0;
    let impatienceCount = 0;

    for (const interaction of interactions) {
      const userMessage = interaction.user || interaction.input || '';

      // Check for frustration
      if (FRUSTRATION_PATTERNS.some(p => p.test(userMessage))) {
        frustrationCount++;
      }

      // Check for satisfaction
      if (SATISFACTION_PATTERNS.some(p => p.test(userMessage))) {
        satisfactionCount++;
      }

      // Check for confusion
      if (CONFUSION_PATTERNS.some(p => p.test(userMessage))) {
        confusionCount++;
      }

      // Check for impatience
      if (IMPATIENCE_PATTERNS.some(p => p.test(userMessage))) {
        impatienceCount++;
      }
    }

    const total = interactions.length;

    // Calculate normalized signals (0-1)
    signals.frustration = Math.min(frustrationCount / Math.max(total * 0.3, 1), 1);
    signals.satisfaction = Math.min(satisfactionCount / Math.max(total * 0.3, 1), 1);
    signals.confusion = Math.min(confusionCount / Math.max(total * 0.3, 1), 1);
    signals.impatience = Math.min(impatienceCount / Math.max(total * 0.3, 1), 1);

    // Engagement is based on interaction count and response times
    signals.engagement = Math.min(total / 10, 1);

    return signals;
  }

  /**
   * Extract knowledge gaps from interactions
   * @param {Object[]} interactions - Array of interactions
   * @returns {string[]}
   */
  extractKnowledgeGaps(interactions) {
    const gaps = new Set();

    for (const interaction of interactions) {
      const response = interaction.assistant || interaction.response || '';

      // Check for hedging in responses
      for (const pattern of HEDGING_PATTERNS) {
        if (pattern.test(response)) {
          // Try to extract the topic being hedged about
          const lines = response.split('\n');
          for (const line of lines) {
            if (pattern.test(line)) {
              // Extract a simplified topic from the context
              const topic = this._extractTopicFromHedge(line, interaction.user || interaction.input);
              if (topic) {
                gaps.add(topic);
              }
            }
          }
        }
      }

      // Check for corrections from user
      if (interaction.feedback === '👎' || /no,? that's (not|wrong)/i.test(interaction.user || '')) {
        const topic = this._extractTopicFromCorrection(interaction);
        if (topic) {
          gaps.add(topic);
        }
      }
    }

    return Array.from(gaps);
  }

  /**
   * Extract topic from a hedging statement
   * @private
   */
  _extractTopicFromHedge(hedgeLine, userQuery) {
    // Try to find the subject of the hedge
    const aboutMatch = hedgeLine.match(/about\s+(.+?)[\.,]/i);
    if (aboutMatch) {
      return aboutMatch[1].trim().slice(0, 50);
    }

    // Fall back to extracting from user query
    if (userQuery) {
      const words = userQuery.split(/\s+/).filter(w => w.length > 4);
      if (words.length > 0) {
        return words.slice(0, 3).join(' ');
      }
    }

    return null;
  }

  /**
   * Extract topic from a correction
   * @private
   */
  _extractTopicFromCorrection(interaction) {
    const userMessage = interaction.user || interaction.input || '';
    const words = userMessage.split(/\s+/).filter(w =>
      w.length > 3 && !/^(no|that|not|wrong|this|the|and|but)$/i.test(w)
    );
    if (words.length > 0) {
      return words.slice(0, 4).join(' ');
    }
    return null;
  }

  /**
   * Extract growth opportunities from a journal entry
   * @param {JournalEntry} entry - The journal entry
   * @returns {GrowthOpportunity[]}
   */
  extractGrowthOpportunities(entry) {
    const opportunities = [];

    // From knowledge gaps
    for (const gap of entry.knowledgeGaps || []) {
      opportunities.push({
        topic: gap,
        urgency: 0.5,
        suggestedActions: [
          `Research ${gap} in depth`,
          'Create examples to practice',
          'Build decision tree for common cases',
        ],
        source: 'knowledge_gap',
      });
    }

    // From high frustration
    if (entry.userSignals?.frustration > 0.6) {
      opportunities.push({
        topic: 'Response clarity and accuracy',
        urgency: 0.8,
        suggestedActions: [
          'Review response patterns that caused frustration',
          'Develop clearer explanation templates',
          'Add verification steps before responding',
        ],
        source: 'user_frustration',
      });
    }

    // From high confusion
    if (entry.userSignals?.confusion > 0.5) {
      opportunities.push({
        topic: 'Explanation clarity',
        urgency: 0.7,
        suggestedActions: [
          'Simplify technical explanations',
          'Add more examples',
          'Break down complex topics into steps',
        ],
        source: 'user_confusion',
      });
    }

    // From impatience
    if (entry.userSignals?.impatience > 0.5) {
      opportunities.push({
        topic: 'Response conciseness',
        urgency: 0.6,
        suggestedActions: [
          'Reduce verbosity',
          'Lead with the answer',
          'Offer detailed explanation optionally',
        ],
        source: 'user_impatience',
      });
    }

    return opportunities;
  }

  /**
   * Generate a first-person narrative of the session
   * @param {Object} session - Session data
   * @param {UserSignals} signals - Detected user signals
   * @returns {string}
   */
  generateNarrative(session, signals) {
    const interactions = session.interactions || [];
    const interactionCount = interactions.length;

    if (interactionCount === 0) {
      return 'Today was quiet. No interactions to reflect upon.';
    }

    const parts = [];

    // Opening
    const date = new Date().toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
    });
    parts.push(`${date}:`);

    // Summarize the session
    if (interactionCount === 1) {
      parts.push('Had a brief exchange today.');
    } else if (interactionCount < 5) {
      parts.push(`Had a short session with ${interactionCount} interactions.`);
    } else if (interactionCount < 15) {
      parts.push(`Engaged in a productive session with ${interactionCount} interactions.`);
    } else {
      parts.push(`Had an extensive session with ${interactionCount} interactions.`);
    }

    // Emotional assessment
    if (signals.satisfaction > 0.6) {
      parts.push('The user seemed pleased with my responses.');
    } else if (signals.frustration > 0.6) {
      parts.push('I sensed frustration - perhaps my responses weren\'t hitting the mark.');
    } else if (signals.confusion > 0.5) {
      parts.push('There were moments of confusion that I should address in future interactions.');
    }

    if (signals.impatience > 0.5) {
      parts.push('I noticed signs of impatience - I should be more concise.');
    }

    // Topics discussed
    const topics = this._extractTopics(interactions);
    if (topics.length > 0) {
      parts.push(`We discussed: ${topics.slice(0, 5).join(', ')}.`);
    }

    // Reflections from the session
    const reflections = session.reflections || [];
    if (reflections.length > 0) {
      const insights = reflections.filter(r => r.type === 'insight' || r.type === 'success');
      const errors = reflections.filter(r => r.type === 'error' || r.type === 'failure');

      if (insights.length > 0) {
        parts.push(`Had ${insights.length} moment${insights.length > 1 ? 's' : ''} of insight.`);
      }
      if (errors.length > 0) {
        parts.push(`Encountered ${errors.length} challenge${errors.length > 1 ? 's' : ''} to learn from.`);
      }
    }

    // Closing reflection
    if (signals.satisfaction > signals.frustration) {
      parts.push('Overall, I feel this was a productive interaction.');
    } else if (signals.frustration > signals.satisfaction) {
      parts.push('I should reflect on how to improve for next time.');
    } else {
      parts.push('A routine session with room for growth.');
    }

    return parts.join(' ');
  }

  /**
   * Extract main topics from interactions
   * @private
   */
  _extractTopics(interactions) {
    const topicCounts = new Map();

    for (const interaction of interactions) {
      const text = (interaction.user || interaction.input || '').toLowerCase();

      // Extract potential topics (nouns and technical terms)
      const words = text
        .replace(/[^\w\s]/g, ' ')
        .split(/\s+/)
        .filter(w => w.length > 4 && !/^(about|would|could|should|their|there|these|those|which|where|what|when|have|been|will|with|from|this|that|your|they|them)$/i.test(w));

      for (const word of words) {
        topicCounts.set(word, (topicCounts.get(word) || 0) + 1);
      }
    }

    // Sort by frequency and return top topics
    return Array.from(topicCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([topic]) => topic);
  }

  /**
   * Determine the category of the session
   * @param {UserSignals} signals
   * @param {Object[]} reflections
   * @returns {'frustration'|'success'|'confusion'|'insight'|'routine'|'learning'}
   */
  determineCategory(signals, reflections) {
    const hasInsights = reflections.some(r => r.type === 'insight');
    const hasErrors = reflections.some(r => r.type === 'error' || r.type === 'failure');

    if (signals.frustration > 0.7) return 'frustration';
    if (signals.satisfaction > 0.7) return 'success';
    if (signals.confusion > 0.6) return 'confusion';
    if (hasInsights) return 'insight';
    if (hasErrors) return 'learning';
    return 'routine';
  }

  /**
   * Write a journal entry for the current or provided session
   * @param {Object} [session] - Session to journal (defaults to current)
   * @returns {JournalEntry|null}
   */
  async writeEntry(session = null) {
    const sessionData = session || this.currentSession;

    if (!sessionData.interactions || sessionData.interactions.length === 0) {
      return null;
    }

    const signals = this.detectUserSignals(sessionData.interactions);
    const knowledgeGaps = this.extractKnowledgeGaps(sessionData.interactions);
    const narrative = this.generateNarrative(sessionData, signals);
    const category = this.determineCategory(signals, sessionData.reflections || []);

    const entry = {
      id: uuidv4(),
      sessionId: sessionData.id,
      timestamp: new Date().toISOString(),
      narrative,
      category,
      userSignals: signals,
      knowledgeGaps,
      growthOpportunities: [],
      metadata: {
        interactionCount: sessionData.interactions.length,
        reflectionCount: (sessionData.reflections || []).length,
        sessionDurationMs: sessionData.startTime ?
          Date.now() - new Date(sessionData.startTime).getTime() : 0,
      },
    };

    // Extract growth opportunities
    entry.growthOpportunities = this.extractGrowthOpportunities(entry);

    // Persist the entry
    await this._persistEntry(entry);

    this.emit('journal:entry-written', { entry });

    return entry;
  }

  /**
   * Persist a journal entry to disk
   * @private
   */
  async _persistEntry(entry) {
    try {
      const date = entry.timestamp.split('T')[0]; // YYYY-MM-DD
      const filePath = path.join(JOURNAL_DIR, `${date}.jsonl`);

      const line = JSON.stringify(entry) + '\n';
      fs.appendFileSync(filePath, line, 'utf-8');

      return true;
    } catch (e) {
      console.error('[CognitiveJournal] Failed to persist entry:', e.message);
      return false;
    }
  }

  /**
   * Get journal entries for a date range
   * @param {string} [startDate] - ISO date string (YYYY-MM-DD)
   * @param {string} [endDate] - ISO date string (YYYY-MM-DD)
   * @returns {JournalEntry[]}
   */
  getEntries(startDate = null, endDate = null) {
    const entries = [];

    try {
      const files = fs.readdirSync(JOURNAL_DIR)
        .filter(f => f.endsWith('.jsonl'))
        .sort();

      for (const file of files) {
        const fileDate = file.replace('.jsonl', '');

        // Check date range
        if (startDate && fileDate < startDate) continue;
        if (endDate && fileDate > endDate) continue;

        const filePath = path.join(JOURNAL_DIR, file);
        const content = fs.readFileSync(filePath, 'utf-8');
        const lines = content.split('\n').filter(l => l.trim());

        for (const line of lines) {
          try {
            entries.push(JSON.parse(line));
          } catch {
            // Skip malformed entries
          }
        }
      }
    } catch (e) {
      console.error('[CognitiveJournal] Failed to read entries:', e.message);
    }

    return entries;
  }

  /**
   * Get aggregated growth opportunities from recent entries
   * @param {number} [days=7] - Number of days to look back
   * @returns {GrowthOpportunity[]}
   */
  getGrowthOpportunities(days = 7) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    const startDateStr = startDate.toISOString().split('T')[0];

    const entries = this.getEntries(startDateStr);
    const opportunityMap = new Map();

    for (const entry of entries) {
      for (const opp of entry.growthOpportunities || []) {
        const key = opp.topic.toLowerCase();
        if (opportunityMap.has(key)) {
          const existing = opportunityMap.get(key);
          existing.urgency = Math.max(existing.urgency, opp.urgency);
          existing.count = (existing.count || 1) + 1;
        } else {
          opportunityMap.set(key, { ...opp, count: 1 });
        }
      }
    }

    // Sort by urgency * frequency
    return Array.from(opportunityMap.values())
      .sort((a, b) => (b.urgency * b.count) - (a.urgency * a.count));
  }

  /**
   * Get summary statistics for journal entries
   * @param {number} [days=30] - Number of days to analyze
   * @returns {Object}
   */
  getSummary(days = 30) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    const startDateStr = startDate.toISOString().split('T')[0];

    const entries = this.getEntries(startDateStr);

    const summary = {
      totalEntries: entries.length,
      categoryBreakdown: {},
      averageSignals: {
        frustration: 0,
        satisfaction: 0,
        confusion: 0,
        impatience: 0,
        engagement: 0,
      },
      topKnowledgeGaps: [],
      topGrowthOpportunities: [],
    };

    if (entries.length === 0) {
      return summary;
    }

    // Category breakdown
    for (const entry of entries) {
      summary.categoryBreakdown[entry.category] =
        (summary.categoryBreakdown[entry.category] || 0) + 1;
    }

    // Average signals
    for (const entry of entries) {
      if (entry.userSignals) {
        for (const key of Object.keys(summary.averageSignals)) {
          summary.averageSignals[key] += entry.userSignals[key] || 0;
        }
      }
    }
    for (const key of Object.keys(summary.averageSignals)) {
      summary.averageSignals[key] /= entries.length;
    }

    // Top knowledge gaps
    const gapCounts = new Map();
    for (const entry of entries) {
      for (const gap of entry.knowledgeGaps || []) {
        gapCounts.set(gap, (gapCounts.get(gap) || 0) + 1);
      }
    }
    summary.topKnowledgeGaps = Array.from(gapCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([gap, count]) => ({ gap, count }));

    // Top growth opportunities
    summary.topGrowthOpportunities = this.getGrowthOpportunities(days).slice(0, 10);

    return summary;
  }

  /**
   * Start a new session
   */
  startNewSession() {
    this.currentSession = {
      id: uuidv4(),
      startTime: new Date().toISOString(),
      interactions: [],
      reflections: [],
    };
  }

  /**
   * Get the current session data
   * @returns {Object}
   */
  getCurrentSession() {
    return this.currentSession;
  }
}

// Singleton instance
let instance = null;

/**
 * Get the cognitive journal instance
 * @param {Object} [options]
 * @returns {CognitiveJournal}
 */
export function getCognitiveJournal(options = {}) {
  if (!instance) {
    instance = new CognitiveJournal(options);
  }
  return instance;
}

export { CognitiveJournal, JOURNAL_DIR };
export default getCognitiveJournal;
