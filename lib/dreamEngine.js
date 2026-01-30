// Dream Engine - Background dream processing for self-improvement
import { EventEmitter } from 'events';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { v4 as uuidv4 } from 'uuid';
import { getConfig } from './configManager.js';

const EVOLUTION_DIR = path.join(os.homedir(), '.static-rebel', 'evolution');
const DREAMS_DIR = path.join(EVOLUTION_DIR, 'dreams');
const SESSIONS_DIR = path.join(DREAMS_DIR, 'sessions');
const INSIGHTS_FILE = path.join(DREAMS_DIR, 'insights.jsonl');

/**
 * @typedef {'replay'|'nightmare'|'possibility'|'integration'} DreamType
 */

/**
 * @typedef {Object} Dream
 * @property {string} id - Unique dream ID
 * @property {DreamType} type - Type of dream
 * @property {string} [sourceMemoryId] - Memory that triggered this dream
 * @property {Object} sourceContext - Context from source
 * @property {string} insight - Key insight from the dream
 * @property {string} [improvedResponse] - Better response (for replay dreams)
 * @property {number} significance - 0-1 significance score
 * @property {Object} [suggestedMutation] - Potential genome mutation
 */

/**
 * @typedef {Object} DreamSession
 * @property {string} id - Session ID
 * @property {string} startedAt - ISO timestamp
 * @property {string} [endedAt] - ISO timestamp
 * @property {'scheduled'|'idle'|'manual'} trigger - What triggered the session
 * @property {number} memoriesProcessed - Count of memories processed
 * @property {Dream[]} dreams - Dreams generated
 * @property {Object} synthesis - Synthesized insights
 * @property {'running'|'completed'|'failed'} status
 */

// Dream type weights for selection
const DREAM_TYPE_WEIGHTS = {
  replay: 0.4,      // Re-process real interactions
  nightmare: 0.25,  // Focus on failures
  possibility: 0.2, // Imagine scenarios
  integration: 0.15,// Connect learnings
};

class DreamEngine extends EventEmitter {
  constructor(options = {}) {
    super();

    const evolutionConfig = getConfig('evolution', {});

    this.options = {
      enabled: options.enabled !== undefined ? options.enabled : (evolutionConfig.enabled !== false),
      dreamDuration: this._parseDuration(options.dreamDuration || evolutionConfig.dreamDuration || '30m'),
      maxMemoriesPerSession: options.maxMemoriesPerSession || 50,
      minInsightSignificance: options.minInsightSignificance || 0.3,
      ...options,
    };

    this.currentSession = null;
    this.isRunning = false;

    // Dependencies (injected)
    this.vectorMemory = null;
    this.reflectionEngine = null;
    this.feedbackManager = null;
    this.sessionMemory = null;

    this._ensureDirectories();
  }

  /**
   * Parse duration string to milliseconds
   * @private
   */
  _parseDuration(duration) {
    if (typeof duration === 'number') return duration;

    const match = duration.match(/^(\d+)(s|m|h)$/);
    if (!match) return 30 * 60 * 1000; // Default 30 min

    const value = parseInt(match[1], 10);
    const unit = match[2];

    switch (unit) {
      case 's': return value * 1000;
      case 'm': return value * 60 * 1000;
      case 'h': return value * 60 * 60 * 1000;
      default: return 30 * 60 * 1000;
    }
  }

  /**
   * Ensure storage directories exist
   * @private
   */
  _ensureDirectories() {
    try {
      for (const dir of [DREAMS_DIR, SESSIONS_DIR]) {
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
      }
    } catch (e) {
      console.error('[DreamEngine] Failed to create directories:', e.message);
    }
  }

  /**
   * Inject dependencies
   * @param {Object} deps - Dependencies
   */
  setDependencies(deps) {
    this.vectorMemory = deps.vectorMemory;
    this.reflectionEngine = deps.reflectionEngine;
    this.feedbackManager = deps.feedbackManager;
    this.sessionMemory = deps.sessionMemory;
  }

  /**
   * Start a dream session
   * @param {Object} options - Session options
   * @returns {Promise<DreamSession>}
   */
  async startDreamSession(options = {}) {
    if (this.isRunning) {
      console.log('[DreamEngine] Session already running');
      return this.currentSession;
    }

    if (!this.options.enabled) {
      console.log('[DreamEngine] Disabled by configuration');
      return null;
    }

    this.isRunning = true;

    this.currentSession = {
      id: uuidv4(),
      startedAt: new Date().toISOString(),
      endedAt: null,
      trigger: options.trigger || 'manual',
      memoriesProcessed: 0,
      dreams: [],
      synthesis: null,
      status: 'running',
    };

    this.emit('dream:session-started', { session: this.currentSession });
    console.log(`[DreamEngine] Dream session started (${this.currentSession.trigger})`);

    try {
      // Select memories to process
      const memories = await this.selectMemoriesForProcessing(options);
      console.log(`[DreamEngine] Selected ${memories.length} memories for processing`);

      // Process memories into dreams
      const startTime = Date.now();
      const maxDuration = this.options.dreamDuration;

      for (const memory of memories) {
        // Check time limit
        if (Date.now() - startTime > maxDuration) {
          console.log('[DreamEngine] Duration limit reached');
          break;
        }

        const dreamType = this._selectDreamType(memory);
        let dream = null;

        switch (dreamType) {
          case 'replay':
            dream = await this.replayDream(memory);
            break;
          case 'nightmare':
            dream = await this.nightmareAnalysis(memory);
            break;
          case 'possibility':
            dream = await this.possibilityDream(memory);
            break;
          case 'integration':
            dream = await this.integrationDream(memory);
            break;
        }

        if (dream && dream.significance >= this.options.minInsightSignificance) {
          this.currentSession.dreams.push(dream);
        }

        this.currentSession.memoriesProcessed++;
      }

      // Synthesize session
      this.currentSession.synthesis = this.synthesizeDreamSession();
      this.currentSession.endedAt = new Date().toISOString();
      this.currentSession.status = 'completed';

      // Persist session
      await this._persistSession(this.currentSession);

      // Persist significant insights
      for (const dream of this.currentSession.dreams) {
        if (dream.significance >= 0.5) {
          await this._persistInsight(dream);
        }
      }

      this.emit('dream:session-completed', { session: this.currentSession });
      console.log(`[DreamEngine] Session completed: ${this.currentSession.dreams.length} dreams, ${this.currentSession.memoriesProcessed} memories processed`);

      return this.currentSession;

    } catch (e) {
      console.error('[DreamEngine] Session failed:', e.message);
      this.currentSession.status = 'failed';
      this.currentSession.error = e.message;
      this.emit('dream:session-failed', { session: this.currentSession, error: e });
      return this.currentSession;

    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Select memories for processing
   * @param {Object} options - Selection options
   * @returns {Promise<Object[]>}
   */
  async selectMemoriesForProcessing(options = {}) {
    const memories = [];

    // Get recent interactions from session memory
    if (this.sessionMemory) {
      const interactions = this.sessionMemory.interactions || [];
      for (const interaction of interactions.slice(-20)) {
        memories.push({
          type: 'interaction',
          content: interaction,
          timestamp: interaction.timestamp,
          feedback: interaction.feedback,
        });
      }
    }

    // Get memories from vector memory
    if (this.vectorMemory) {
      try {
        // Search for meaningful memories
        const searchResults = await this.vectorMemory.searchMemories('important learning experience', {
          limit: 20,
          minScore: 0.3,
        });

        for (const result of searchResults) {
          memories.push({
            type: 'vector',
            content: result.content,
            metadata: result.metadata,
            score: result.score,
          });
        }
      } catch (e) {
        console.error('[DreamEngine] Failed to search vector memory:', e.message);
      }
    }

    // Get error memories from reflection engine
    if (this.reflectionEngine?.errorMemory) {
      for (const [key, error] of this.reflectionEngine.errorMemory) {
        if (error.count > 1 || !error.resolved) {
          memories.push({
            type: 'error',
            content: error,
            isRecurring: error.count > 2,
          });
        }
      }
    }

    // Get low-rated responses from feedback manager
    if (this.feedbackManager) {
      try {
        const feedbackLog = this.feedbackManager.getFeedbackLog?.() || [];
        const negativeFeedback = feedbackLog
          .filter(f => f.rating === '👎' || f.rating === 'negative')
          .slice(-10);

        for (const feedback of negativeFeedback) {
          memories.push({
            type: 'negative_feedback',
            content: feedback,
            reason: feedback.reason,
          });
        }
      } catch (e) {
        console.error('[DreamEngine] Failed to get feedback:', e.message);
      }
    }

    // Prioritize: errors > negative feedback > interactions > vector memories
    const prioritized = memories.sort((a, b) => {
      const priority = { error: 4, negative_feedback: 3, interaction: 2, vector: 1 };
      return (priority[b.type] || 0) - (priority[a.type] || 0);
    });

    return prioritized.slice(0, this.options.maxMemoriesPerSession);
  }

  /**
   * Select dream type based on memory
   * @private
   */
  _selectDreamType(memory) {
    // Nightmare for errors and negative feedback
    if (memory.type === 'error' || memory.type === 'negative_feedback') {
      return 'nightmare';
    }

    // Replay for interactions
    if (memory.type === 'interaction') {
      return Math.random() < 0.7 ? 'replay' : 'possibility';
    }

    // Integration for vector memories
    if (memory.type === 'vector') {
      return Math.random() < 0.6 ? 'integration' : 'replay';
    }

    // Random weighted selection
    const rand = Math.random();
    let cumulative = 0;
    for (const [type, weight] of Object.entries(DREAM_TYPE_WEIGHTS)) {
      cumulative += weight;
      if (rand <= cumulative) return type;
    }

    return 'replay';
  }

  /**
   * Replay dream - Generate better response for past interaction
   * @param {Object} memory
   * @returns {Promise<Dream>}
   */
  async replayDream(memory) {
    const dream = {
      id: uuidv4(),
      type: 'replay',
      sourceMemoryId: memory.id,
      sourceContext: {
        type: memory.type,
        userInput: memory.content?.user || memory.content?.input,
        originalResponse: memory.content?.assistant || memory.content?.response,
        feedback: memory.feedback || memory.content?.feedback,
      },
      insight: '',
      improvedResponse: null,
      significance: 0,
      suggestedMutation: null,
    };

    // Analyze what could be improved
    const original = dream.sourceContext.originalResponse || '';
    const feedback = dream.sourceContext.feedback;

    // Generate insight based on feedback
    if (feedback === '👎') {
      dream.insight = 'Response received negative feedback - analyze for improvements';
      dream.significance = 0.7;

      // Suggest potential improvements
      if (original.length > 500) {
        dream.suggestedMutation = {
          type: 'trait_adjustment',
          target: 'traits.verbosity',
          rationale: 'Long response received negative feedback',
          proposedChange: -0.1,
          confidence: 0.5,
        };
      }
    } else if (feedback === '👍') {
      dream.insight = 'Successful response pattern identified';
      dream.significance = 0.4;
    } else {
      dream.insight = 'Neutral interaction - potential optimization possible';
      dream.significance = 0.3;
    }

    return dream;
  }

  /**
   * Nightmare analysis - Deep dive on failures
   * @param {Object} memory
   * @returns {Promise<Dream>}
   */
  async nightmareAnalysis(memory) {
    const dream = {
      id: uuidv4(),
      type: 'nightmare',
      sourceMemoryId: memory.id,
      sourceContext: {
        type: memory.type,
        content: memory.content,
        isRecurring: memory.isRecurring,
      },
      insight: '',
      significance: 0,
      suggestedMutation: null,
      rootCauses: [],
      preventionStrategies: [],
    };

    if (memory.type === 'error') {
      const error = memory.content;
      dream.insight = `Recurring error pattern: ${error.message || 'Unknown error'}`;
      dream.significance = memory.isRecurring ? 0.9 : 0.6;

      dream.rootCauses = [
        'Incomplete context understanding',
        'Missing domain knowledge',
        'Incorrect assumption',
      ];

      dream.preventionStrategies = [
        'Add clarifying questions for ambiguous inputs',
        'Research the topic more thoroughly',
        'Lower confidence threshold for uncertain responses',
      ];

      if (memory.isRecurring) {
        dream.suggestedMutation = {
          type: 'trait_adjustment',
          target: 'traits.confidenceThreshold',
          rationale: 'Recurring errors suggest over-confidence',
          proposedChange: 0.1,
          confidence: 0.7,
        };
      }
    }

    if (memory.type === 'negative_feedback') {
      dream.insight = `User dissatisfaction: ${memory.reason || 'No reason provided'}`;
      dream.significance = 0.7;

      dream.rootCauses = [
        'Response did not match user expectations',
        'Missing key information',
        'Tone mismatch',
      ];

      dream.preventionStrategies = [
        'Verify understanding before responding',
        'Offer alternative approaches',
        'Match user communication style',
      ];
    }

    return dream;
  }

  /**
   * Possibility dream - Imagine scenarios that haven't happened
   * @param {Object} memory
   * @returns {Promise<Dream>}
   */
  async possibilityDream(memory) {
    const dream = {
      id: uuidv4(),
      type: 'possibility',
      sourceMemoryId: memory.id,
      sourceContext: {
        type: memory.type,
        baseScenario: memory.content,
      },
      insight: '',
      significance: 0,
      hypotheticalScenarios: [],
      preparations: [],
    };

    // Generate hypothetical variations
    const baseContext = memory.content?.user || memory.content?.input || '';

    dream.hypotheticalScenarios = [
      {
        scenario: 'User asks follow-up requiring deeper technical knowledge',
        preparation: 'Build knowledge graphs for common topic progressions',
      },
      {
        scenario: 'User becomes frustrated with response',
        preparation: 'Have fallback simplification strategies ready',
      },
      {
        scenario: 'User needs code in different language/framework',
        preparation: 'Study cross-framework patterns',
      },
    ];

    dream.insight = 'Prepared contingency strategies for scenario variations';
    dream.significance = 0.4;

    dream.preparations = dream.hypotheticalScenarios.map(s => s.preparation);

    return dream;
  }

  /**
   * Integration dream - Connect disparate learnings
   * @param {Object} memory
   * @returns {Promise<Dream>}
   */
  async integrationDream(memory) {
    const dream = {
      id: uuidv4(),
      type: 'integration',
      sourceMemoryId: memory.id,
      sourceContext: {
        type: memory.type,
        content: memory.content,
        relatedConcepts: [],
      },
      insight: '',
      significance: 0,
      connections: [],
      synthesizedKnowledge: null,
    };

    // Extract concepts from memory
    const content = typeof memory.content === 'string'
      ? memory.content
      : JSON.stringify(memory.content);

    const concepts = this._extractConcepts(content);
    dream.sourceContext.relatedConcepts = concepts;

    // Look for connections in other memories
    if (this.vectorMemory && concepts.length > 0) {
      try {
        for (const concept of concepts.slice(0, 3)) {
          const related = await this.vectorMemory.searchMemories(concept, {
            limit: 3,
            minScore: 0.4,
          });

          if (related.length > 0) {
            dream.connections.push({
              concept,
              relatedMemories: related.map(r => ({
                content: r.content.slice(0, 100),
                score: r.score,
              })),
            });
          }
        }
      } catch (e) {
        console.error('[DreamEngine] Failed to find connections:', e.message);
      }
    }

    if (dream.connections.length > 0) {
      dream.insight = `Found ${dream.connections.length} knowledge connections across memories`;
      dream.significance = 0.5 + (dream.connections.length * 0.1);

      dream.synthesizedKnowledge = {
        centralConcepts: concepts.slice(0, 5),
        connectionCount: dream.connections.length,
        potentialPatterns: 'Cross-domain knowledge integration identified',
      };
    } else {
      dream.insight = 'Isolated memory - potential new knowledge area';
      dream.significance = 0.3;
    }

    return dream;
  }

  /**
   * Extract concepts from text
   * @private
   */
  _extractConcepts(text) {
    // Simple concept extraction - extract significant words/phrases
    const words = text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 4);

    // Count occurrences
    const counts = new Map();
    for (const word of words) {
      if (!/^(about|would|could|should|their|there|these|those|which|where|because|through|before|after|other|being|between)$/.test(word)) {
        counts.set(word, (counts.get(word) || 0) + 1);
      }
    }

    // Return top concepts
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([word]) => word);
  }

  /**
   * Synthesize insights from dream session
   * @returns {Object}
   */
  synthesizeDreamSession() {
    if (!this.currentSession || this.currentSession.dreams.length === 0) {
      return {
        keyInsights: [],
        patternsDiscovered: [],
        mutationCandidates: [],
      };
    }

    const dreams = this.currentSession.dreams;

    // Aggregate insights by significance
    const keyInsights = dreams
      .filter(d => d.significance >= 0.5)
      .map(d => ({
        insight: d.insight,
        significance: d.significance,
        type: d.type,
      }))
      .sort((a, b) => b.significance - a.significance)
      .slice(0, 10);

    // Discover patterns across dreams
    const typeCounts = { replay: 0, nightmare: 0, possibility: 0, integration: 0 };
    for (const dream of dreams) {
      typeCounts[dream.type]++;
    }

    const patternsDiscovered = [];

    if (typeCounts.nightmare > 3) {
      patternsDiscovered.push({
        pattern: 'High error frequency',
        frequency: typeCounts.nightmare,
        suggestion: 'Review error handling and confidence calibration',
      });
    }

    if (typeCounts.integration > 2) {
      patternsDiscovered.push({
        pattern: 'Knowledge integration opportunities',
        frequency: typeCounts.integration,
        suggestion: 'Build cross-domain knowledge graphs',
      });
    }

    // Collect mutation candidates
    const mutationCandidates = dreams
      .filter(d => d.suggestedMutation)
      .map(d => ({
        ...d.suggestedMutation,
        dreamId: d.id,
        dreamType: d.type,
        significance: d.significance,
      }))
      .sort((a, b) => b.significance - a.significance);

    return {
      keyInsights,
      patternsDiscovered,
      mutationCandidates,
      summary: {
        totalDreams: dreams.length,
        byType: typeCounts,
        averageSignificance: dreams.reduce((s, d) => s + d.significance, 0) / dreams.length,
        highSignificanceCount: dreams.filter(d => d.significance >= 0.7).length,
      },
    };
  }

  /**
   * Generate human-readable dream report
   * @returns {string}
   */
  generateDreamReport() {
    if (!this.currentSession) {
      return 'No dream session available.';
    }

    const session = this.currentSession;
    const synthesis = session.synthesis || this.synthesizeDreamSession();

    const lines = [];

    lines.push('# Dream Session Report');
    lines.push(`**Session ID:** ${session.id}`);
    lines.push(`**Started:** ${session.startedAt}`);
    lines.push(`**Trigger:** ${session.trigger}`);
    lines.push(`**Status:** ${session.status}`);
    lines.push('');

    lines.push('## Summary');
    lines.push(`- Memories processed: ${session.memoriesProcessed}`);
    lines.push(`- Dreams generated: ${session.dreams.length}`);
    if (synthesis.summary) {
      lines.push(`- Average significance: ${(synthesis.summary.averageSignificance * 100).toFixed(1)}%`);
      lines.push(`- High significance dreams: ${synthesis.summary.highSignificanceCount}`);
    }
    lines.push('');

    if (synthesis.keyInsights.length > 0) {
      lines.push('## Key Insights');
      for (const insight of synthesis.keyInsights) {
        lines.push(`- [${insight.type}] ${insight.insight} (${(insight.significance * 100).toFixed(0)}%)`);
      }
      lines.push('');
    }

    if (synthesis.patternsDiscovered.length > 0) {
      lines.push('## Patterns Discovered');
      for (const pattern of synthesis.patternsDiscovered) {
        lines.push(`- **${pattern.pattern}** (frequency: ${pattern.frequency})`);
        lines.push(`  Suggestion: ${pattern.suggestion}`);
      }
      lines.push('');
    }

    if (synthesis.mutationCandidates.length > 0) {
      lines.push('## Mutation Candidates');
      for (const mutation of synthesis.mutationCandidates) {
        lines.push(`- **${mutation.target}**: ${mutation.rationale}`);
        lines.push(`  Change: ${mutation.proposedChange > 0 ? '+' : ''}${mutation.proposedChange} (confidence: ${(mutation.confidence * 100).toFixed(0)}%)`);
      }
      lines.push('');
    }

    return lines.join('\n');
  }

  /**
   * Persist session to disk
   * @private
   */
  async _persistSession(session) {
    try {
      const filename = `${session.id}.json`;
      const filePath = path.join(SESSIONS_DIR, filename);
      fs.writeFileSync(filePath, JSON.stringify(session, null, 2), 'utf-8');
      return true;
    } catch (e) {
      console.error('[DreamEngine] Failed to persist session:', e.message);
      return false;
    }
  }

  /**
   * Persist insight to consolidated insights file
   * @private
   */
  async _persistInsight(dream) {
    try {
      const insight = {
        dreamId: dream.id,
        type: dream.type,
        insight: dream.insight,
        significance: dream.significance,
        suggestedMutation: dream.suggestedMutation,
        timestamp: new Date().toISOString(),
      };

      const line = JSON.stringify(insight) + '\n';
      fs.appendFileSync(INSIGHTS_FILE, line, 'utf-8');
      return true;
    } catch (e) {
      console.error('[DreamEngine] Failed to persist insight:', e.message);
      return false;
    }
  }

  /**
   * Get recent dream sessions
   * @param {number} [limit=10]
   * @returns {DreamSession[]}
   */
  getRecentSessions(limit = 10) {
    try {
      const files = fs.readdirSync(SESSIONS_DIR)
        .filter(f => f.endsWith('.json'))
        .sort()
        .reverse()
        .slice(0, limit);

      return files.map(f => {
        try {
          const content = fs.readFileSync(path.join(SESSIONS_DIR, f), 'utf-8');
          return JSON.parse(content);
        } catch {
          return null;
        }
      }).filter(Boolean);
    } catch {
      return [];
    }
  }

  /**
   * Get consolidated insights
   * @param {number} [limit=50]
   * @returns {Object[]}
   */
  getInsights(limit = 50) {
    try {
      if (!fs.existsSync(INSIGHTS_FILE)) {
        return [];
      }

      const content = fs.readFileSync(INSIGHTS_FILE, 'utf-8');
      const lines = content.split('\n').filter(l => l.trim());

      return lines
        .slice(-limit)
        .map(line => {
          try {
            return JSON.parse(line);
          } catch {
            return null;
          }
        })
        .filter(Boolean)
        .reverse();
    } catch (e) {
      console.error('[DreamEngine] Failed to read insights:', e.message);
      return [];
    }
  }

  /**
   * Get dream engine status
   * @returns {Object}
   */
  getStatus() {
    return {
      enabled: this.options.enabled,
      isRunning: this.isRunning,
      currentSession: this.currentSession ? {
        id: this.currentSession.id,
        status: this.currentSession.status,
        dreamsCount: this.currentSession.dreams.length,
        memoriesProcessed: this.currentSession.memoriesProcessed,
      } : null,
      recentSessionsCount: this.getRecentSessions(5).length,
      totalInsights: this.getInsights(1000).length,
    };
  }
}

// Singleton instance
let instance = null;

/**
 * Get the dream engine instance
 * @param {Object} [options]
 * @returns {DreamEngine}
 */
export function getDreamEngine(options = {}) {
  if (!instance) {
    instance = new DreamEngine(options);
  }
  return instance;
}

export { DreamEngine, DREAMS_DIR, SESSIONS_DIR };
export default getDreamEngine;
