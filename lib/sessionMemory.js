/**
 * Session Memory Manager - Short-term conversation memory
 * Stores recent 5-8 interactions for context awareness
 */

import { EventEmitter } from 'events';

/**
 * Session memory store with circular buffer
 */
export class SessionMemory extends EventEmitter {
  constructor(maxSize = 8) {
    super();
    this.maxSize = maxSize;
    this.interactions = [];
    this.metadata = {
      sessionStart: new Date().toISOString(),
      lastInteraction: null,
      totalInteractions: 0,
    };
  }

  /**
   * Add an interaction to session memory
   */
  addInteraction(userInput, assistantResponse, metadata = {}) {
    const interaction = {
      id: `interaction-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date().toISOString(),
      user: userInput,
      assistant: assistantResponse,
      intent: metadata.intent || null,
      action: metadata.action || null,
      feedback: null, // Will store 👍/👎
      context: metadata.context || {},
    };

    this.interactions.push(interaction);

    // Keep only last N interactions
    if (this.interactions.length > this.maxSize) {
      this.interactions.shift();
    }

    this.metadata.lastInteraction = interaction.timestamp;
    this.metadata.totalInteractions++;

    this.emit('interaction:add', interaction);
    return interaction;
  }

  /**
   * Get recent interactions
   */
  getRecent(count = this.maxSize) {
    return this.interactions.slice(-count);
  }

  /**
   * Get formatted context for LLM prompts
   */
  getContextForPrompt(count = 5) {
    const recent = this.getRecent(count);

    if (recent.length === 0) {
      return '';
    }

    let context = '\n\n=== Recent Conversation ===\n';
    recent.forEach((interaction, index) => {
      context += `\n[${index + 1}] User: ${interaction.user}`;
      if (interaction.assistant) {
        const truncated =
          interaction.assistant.length > 200
            ? interaction.assistant.substring(0, 200) + '...'
            : interaction.assistant;
        context += `\n    Assistant: ${truncated}`;
      }
    });
    context += '\n\n=== End Context ===\n';

    return context;
  }

  /**
   * Get conversation summary
   */
  getSummary() {
    const intents = {};
    const topics = new Set();

    this.interactions.forEach((i) => {
      if (i.intent) {
        intents[i.intent] = (intents[i.intent] || 0) + 1;
      }
      if (i.context?.topic) {
        topics.add(i.context.topic);
      }
    });

    return {
      interactionCount: this.interactions.length,
      sessionDuration: this.getSessionDuration(),
      topIntents: Object.entries(intents)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3),
      topics: Array.from(topics),
    };
  }

  /**
   * Get session duration in minutes
   */
  getSessionDuration() {
    if (!this.metadata.sessionStart) return 0;
    const start = new Date(this.metadata.sessionStart);
    const end = this.metadata.lastInteraction
      ? new Date(this.metadata.lastInteraction)
      : new Date();
    return Math.round((end - start) / 60000);
  }

  /**
   * Add feedback to an interaction
   */
  addFeedback(interactionId, feedback) {
    const interaction = this.interactions.find((i) => i.id === interactionId);
    if (interaction) {
      interaction.feedback = feedback;
      interaction.feedbackTimestamp = new Date().toISOString();
      this.emit('feedback:add', { interactionId, feedback });
      return true;
    }
    return false;
  }

  /**
   * Add feedback to the most recent interaction
   */
  addFeedbackToLast(feedback) {
    if (this.interactions.length > 0) {
      const last = this.interactions[this.interactions.length - 1];
      return this.addFeedback(last.id, feedback);
    }
    return false;
  }

  /**
   * Check if user is asking about something mentioned earlier
   */
  findReferencedTopic(input) {
    const lower = input.toLowerCase();

    // Check for pronouns and references
    const referencePatterns = [
      /^(it|that|this|those|these)$/i,
      /what about (it|that|this)/i,
      /tell me more about (it|that|this)/i,
      /explain (it|that|this)/i,
    ];

    const hasReference = referencePatterns.some((p) => p.test(lower));

    if (hasReference && this.interactions.length > 0) {
      // Return the most recent non-ambiguous topic
      const last = this.interactions[this.interactions.length - 1];
      return {
        type: 'previous_topic',
        topic: last.context?.topic || last.intent,
        originalQuery: last.user,
      };
    }

    return null;
  }

  /**
   * Detect if user is continuing a previous thought
   */
  detectContinuation(input) {
    const lower = input.toLowerCase().trim();

    const continuationPatterns = [
      /^and /i,
      /^also /i,
      /^plus /i,
      /^additionally /i,
      /^moreover /i,
      /^then /i,
      /^next /i,
      /^after that /i,
      /^so /i,
      /^but /i,
      /^however /i,
      /^what about /i,
      /^how about /i,
      /^can you also /i,
      /^don't forget /i,
    ];

    const isContinuation = continuationPatterns.some((p) => p.test(lower));

    if (isContinuation && this.interactions.length > 0) {
      const last = this.interactions[this.interactions.length - 1];
      return {
        isContinuation: true,
        previousIntent: last.intent,
        previousAction: last.action,
        context: last.context,
      };
    }

    return { isContinuation: false };
  }

  /**
   * Clear session memory
   */
  clear() {
    this.interactions = [];
    this.metadata = {
      sessionStart: new Date().toISOString(),
      lastInteraction: null,
      totalInteractions: 0,
    };
    this.emit('memory:clear');
  }

  /**
   * Export session data for persistence
   */
  export() {
    return {
      interactions: this.interactions,
      metadata: this.metadata,
      summary: this.getSummary(),
    };
  }

  /**
   * Import session data
   */
  import(data) {
    if (data.interactions) {
      this.interactions = data.interactions.slice(-this.maxSize);
    }
    if (data.metadata) {
      this.metadata = { ...this.metadata, ...data.metadata };
    }
    this.emit('memory:import', data);
  }

  /**
   * Get stats for analytics
   */
  getStats() {
    const feedbackStats = this.interactions.reduce(
      (acc, i) => {
        if (i.feedback === '👍') acc.positive++;
        if (i.feedback === '👎') acc.negative++;
        return acc;
      },
      { positive: 0, negative: 0 },
    );

    return {
      ...this.metadata,
      currentSize: this.interactions.length,
      maxSize: this.maxSize,
      feedback: feedbackStats,
      summary: this.getSummary(),
    };
  }
}

// Global session memory instance
let globalSessionMemory = null;

/**
 * Get or create global session memory
 */
export function getSessionMemory() {
  if (!globalSessionMemory) {
    globalSessionMemory = new SessionMemory();
  }
  return globalSessionMemory;
}

/**
 * Reset global session memory
 */
export function resetSessionMemory() {
  globalSessionMemory = new SessionMemory();
  return globalSessionMemory;
}

/**
 * Create a new session memory instance (for testing/isolation)
 */
export function createSessionMemory(maxSize = 8) {
  return new SessionMemory(maxSize);
}
