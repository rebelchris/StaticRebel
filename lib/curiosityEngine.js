// Curiosity Engine - Knowledge gap detection and self-directed learning
import { EventEmitter } from 'events';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { v4 as uuidv4 } from 'uuid';
import { getConfig } from './configManager.js';

const EVOLUTION_DIR = path.join(os.homedir(), '.static-rebel', 'evolution');
const CURIOSITY_DIR = path.join(EVOLUTION_DIR, 'curiosity');
const QUEUE_FILE = path.join(CURIOSITY_DIR, 'queue.json');
const COMPLETED_FILE = path.join(CURIOSITY_DIR, 'completed.jsonl');
const KNOWLEDGE_FILE = path.join(CURIOSITY_DIR, 'knowledge-base.jsonl');

/**
 * @typedef {'pending'|'studying'|'completed'|'paused'} CuriosityStatus
 */

/**
 * @typedef {Object} StudyAction
 * @property {'read'|'generate'|'create'|'test'|'practice'} action
 * @property {string} description - What to do
 * @property {boolean} completed - Whether this action is done
 * @property {Object} [result] - Result of the action
 */

/**
 * @typedef {Object} Curiosity
 * @property {string} id - Unique ID
 * @property {string} topic - Topic to study
 * @property {string} description - Detailed description
 * @property {number} urgency - 0-1 urgency level
 * @property {'nightmare_analysis'|'reflection_pattern'|'user_interest'|'knowledge_gap'|'dream_insight'} source
 * @property {StudyAction[]} studyPlan - Steps to learn the topic
 * @property {number} progress - 0-1 completion progress
 * @property {CuriosityStatus} status
 * @property {string} createdAt - ISO timestamp
 * @property {string} [completedAt] - ISO timestamp
 * @property {Object[]} artifacts - Knowledge artifacts generated
 */

// Default study plan templates by topic type
const STUDY_PLAN_TEMPLATES = {
  technical: [
    { action: 'read', description: 'Research documentation and best practices' },
    { action: 'generate', description: 'Create example scenarios and edge cases' },
    { action: 'create', description: 'Build decision tree for common patterns' },
    { action: 'test', description: 'Self-test understanding with quiz' },
  ],
  conceptual: [
    { action: 'read', description: 'Study core concepts and relationships' },
    { action: 'create', description: 'Create mental model diagram' },
    { action: 'generate', description: 'Generate analogies and examples' },
    { action: 'test', description: 'Explain concept in simple terms' },
  ],
  procedural: [
    { action: 'read', description: 'Document step-by-step process' },
    { action: 'practice', description: 'Walk through common scenarios' },
    { action: 'generate', description: 'Create troubleshooting guide' },
    { action: 'test', description: 'Practice edge cases' },
  ],
  interpersonal: [
    { action: 'read', description: 'Study communication patterns' },
    { action: 'generate', description: 'Create response templates' },
    { action: 'practice', description: 'Role-play scenarios' },
    { action: 'test', description: 'Evaluate response quality' },
  ],
};

// Patterns that indicate hedging/uncertainty
const HEDGING_INDICATORS = [
  /I('m| am) not (entirely )?sure/i,
  /I (think|believe|assume) (that )?/i,
  /might (be|have)/i,
  /possibly|perhaps|probably/i,
  /I('d| would) need to (check|verify|look)/i,
  /I don't have (specific|detailed|enough) information/i,
  /to be honest,? I'm not certain/i,
  /if I recall correctly/i,
  /I'm not an expert (in|on)/i,
];

// Patterns indicating user correction
const CORRECTION_INDICATORS = [
  /no,? that's (not|wrong|incorrect)/i,
  /actually,? it's/i,
  /you're (wrong|mistaken)/i,
  /that's not (right|correct|accurate)/i,
  /let me correct/i,
];

class CuriosityEngine extends EventEmitter {
  constructor(options = {}) {
    super();

    const evolutionConfig = getConfig('evolution', {});

    this.options = {
      enabled: options.enabled !== undefined ? options.enabled : (evolutionConfig.enabled !== false),
      studyTime: this._parseDuration(options.studyTime || evolutionConfig.curiosityStudyTime || '15m'),
      maxQueueSize: options.maxQueueSize || 50,
      minUrgency: options.minUrgency || 0.3,
      ...options,
    };

    this.queue = [];
    this.isStudying = false;
    this.currentStudy = null;

    // Dependencies
    this.vectorMemory = null;
    this.dreamEngine = null;

    this._ensureDirectories();
    this._loadQueue();
  }

  /**
   * Parse duration string to milliseconds
   * @private
   */
  _parseDuration(duration) {
    if (typeof duration === 'number') return duration;

    const match = duration.match(/^(\d+)(s|m|h)$/);
    if (!match) return 15 * 60 * 1000; // Default 15 min

    const value = parseInt(match[1], 10);
    const unit = match[2];

    switch (unit) {
      case 's': return value * 1000;
      case 'm': return value * 60 * 1000;
      case 'h': return value * 60 * 60 * 1000;
      default: return 15 * 60 * 1000;
    }
  }

  /**
   * Ensure storage directories exist
   * @private
   */
  _ensureDirectories() {
    try {
      if (!fs.existsSync(CURIOSITY_DIR)) {
        fs.mkdirSync(CURIOSITY_DIR, { recursive: true });
      }
    } catch (e) {
      console.error('[CuriosityEngine] Failed to create directories:', e.message);
    }
  }

  /**
   * Load the curiosity queue from disk
   * @private
   */
  _loadQueue() {
    try {
      if (fs.existsSync(QUEUE_FILE)) {
        const data = fs.readFileSync(QUEUE_FILE, 'utf-8');
        this.queue = JSON.parse(data);
      }
    } catch (e) {
      console.error('[CuriosityEngine] Failed to load queue:', e.message);
      this.queue = [];
    }
  }

  /**
   * Save the curiosity queue to disk
   * @private
   */
  _saveQueue() {
    try {
      fs.writeFileSync(QUEUE_FILE, JSON.stringify(this.queue, null, 2), 'utf-8');
    } catch (e) {
      console.error('[CuriosityEngine] Failed to save queue:', e.message);
    }
  }

  /**
   * Inject dependencies
   * @param {Object} deps
   */
  setDependencies(deps) {
    this.vectorMemory = deps.vectorMemory;
    this.dreamEngine = deps.dreamEngine;
  }

  /**
   * Detect knowledge gaps from a session
   * @param {Object} session - Session data with interactions
   * @returns {Object[]} - Detected gaps
   */
  detectGaps(session) {
    const gaps = [];
    const interactions = session.interactions || [];

    for (const interaction of interactions) {
      const userMessage = interaction.user || interaction.input || '';
      const response = interaction.assistant || interaction.response || '';

      // Check for hedging in response
      for (const pattern of HEDGING_INDICATORS) {
        if (pattern.test(response)) {
          const topic = this._extractTopicFromContext(userMessage, response);
          if (topic) {
            gaps.push({
              topic,
              source: 'knowledge_gap',
              urgency: 0.5,
              context: {
                userQuery: userMessage.slice(0, 200),
                hedgePattern: pattern.source,
              },
            });
            break; // One gap per interaction
          }
        }
      }

      // Check for user corrections
      for (const pattern of CORRECTION_INDICATORS) {
        if (pattern.test(userMessage)) {
          const topic = this._extractTopicFromCorrection(userMessage, response);
          if (topic) {
            gaps.push({
              topic,
              source: 'reflection_pattern',
              urgency: 0.7, // Higher urgency for corrections
              context: {
                correction: userMessage.slice(0, 200),
              },
            });
            break;
          }
        }
      }
    }

    // Deduplicate by topic
    const uniqueGaps = new Map();
    for (const gap of gaps) {
      const key = gap.topic.toLowerCase();
      if (!uniqueGaps.has(key) || uniqueGaps.get(key).urgency < gap.urgency) {
        uniqueGaps.set(key, gap);
      }
    }

    return Array.from(uniqueGaps.values());
  }

  /**
   * Extract topic from context
   * @private
   */
  _extractTopicFromContext(userQuery, response) {
    // Try to find what was being asked about
    const combinedText = userQuery + ' ' + response;

    // Extract significant phrases
    const phrases = combinedText
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 3);

    // Find technical-looking terms
    const technicalTerms = phrases.filter(w =>
      /^[a-z]+[A-Z]/.test(w) || // camelCase
      w.includes('_') ||
      /^(api|sql|css|html|json|xml|http|react|vue|node|npm|git)/.test(w)
    );

    if (technicalTerms.length > 0) {
      return technicalTerms.slice(0, 3).join(' ');
    }

    // Fall back to extracting nouns
    const words = userQuery
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 4 && !/^(what|when|where|which|about|would|could|should|their|there)$/i.test(w));

    if (words.length > 0) {
      return words.slice(0, 3).join(' ');
    }

    return null;
  }

  /**
   * Extract topic from correction
   * @private
   */
  _extractTopicFromCorrection(correction, previousResponse) {
    // The correction often contains the correct information
    const words = correction
      .replace(/^(no|actually|that's wrong|you're mistaken)[,.]?\s*/i, '')
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 3);

    if (words.length > 0) {
      return words.slice(0, 4).join(' ');
    }

    return null;
  }

  /**
   * Add a topic to the curiosity queue
   * @param {string|Object} topicOrConfig - Topic string or config object
   * @returns {Curiosity|null}
   */
  addCuriosity(topicOrConfig) {
    const config = typeof topicOrConfig === 'string'
      ? { topic: topicOrConfig }
      : topicOrConfig;

    if (!config.topic) {
      return null;
    }

    // Check for duplicates
    const existing = this.queue.find(c =>
      c.topic.toLowerCase() === config.topic.toLowerCase() &&
      c.status !== 'completed'
    );

    if (existing) {
      // Update urgency if higher
      if (config.urgency && config.urgency > existing.urgency) {
        existing.urgency = config.urgency;
        this._saveQueue();
      }
      return existing;
    }

    // Determine study plan template
    const topicType = this._classifyTopic(config.topic);
    const template = STUDY_PLAN_TEMPLATES[topicType] || STUDY_PLAN_TEMPLATES.technical;

    const curiosity = {
      id: uuidv4(),
      topic: config.topic,
      description: config.description || `Learn more about ${config.topic}`,
      urgency: config.urgency || 0.5,
      source: config.source || 'user_interest',
      studyPlan: template.map(step => ({
        ...step,
        completed: false,
        result: null,
      })),
      progress: 0,
      status: 'pending',
      createdAt: new Date().toISOString(),
      completedAt: null,
      artifacts: [],
    };

    // Add to queue (sorted by urgency)
    this.queue.push(curiosity);
    this.queue.sort((a, b) => b.urgency - a.urgency);

    // Trim queue if too large
    if (this.queue.length > this.options.maxQueueSize) {
      this.queue = this.queue.slice(0, this.options.maxQueueSize);
    }

    this._saveQueue();
    this.emit('curiosity:added', { curiosity });

    console.log(`[CuriosityEngine] Added curiosity: ${config.topic} (urgency: ${curiosity.urgency})`);

    return curiosity;
  }

  /**
   * Classify topic type for study plan selection
   * @private
   */
  _classifyTopic(topic) {
    const lower = topic.toLowerCase();

    if (/api|database|framework|library|syntax|code|function|method/.test(lower)) {
      return 'technical';
    }
    if (/communicate|response|tone|frustration|user|explain/.test(lower)) {
      return 'interpersonal';
    }
    if (/process|step|workflow|procedure|how to/.test(lower)) {
      return 'procedural';
    }

    return 'conceptual';
  }

  /**
   * Start a study session for the highest urgency topic
   * @param {Object} [options]
   * @returns {Promise<Object>}
   */
  async study(options = {}) {
    if (this.isStudying) {
      return { success: false, reason: 'Already studying' };
    }

    if (!this.options.enabled) {
      return { success: false, reason: 'Curiosity engine disabled' };
    }

    // Get highest urgency pending curiosity
    const pending = this.queue.filter(c => c.status === 'pending' || c.status === 'paused');
    if (pending.length === 0) {
      return { success: false, reason: 'No topics to study' };
    }

    const curiosity = options.curiosityId
      ? this.queue.find(c => c.id === options.curiosityId)
      : pending[0];

    if (!curiosity) {
      return { success: false, reason: 'Topic not found' };
    }

    this.isStudying = true;
    this.currentStudy = curiosity;
    curiosity.status = 'studying';

    this.emit('curiosity:study-started', { curiosity });
    console.log(`[CuriosityEngine] Starting study: ${curiosity.topic}`);

    const startTime = Date.now();
    const maxDuration = this.options.studyTime;
    const results = [];

    try {
      // Execute study plan steps
      for (let i = 0; i < curiosity.studyPlan.length; i++) {
        const step = curiosity.studyPlan[i];

        if (step.completed) continue;

        // Check time limit
        if (Date.now() - startTime > maxDuration) {
          console.log('[CuriosityEngine] Study time limit reached');
          break;
        }

        const result = await this._executeStudyStep(curiosity, step);
        step.completed = true;
        step.result = result;
        results.push(result);

        // Update progress
        const completedSteps = curiosity.studyPlan.filter(s => s.completed).length;
        curiosity.progress = completedSteps / curiosity.studyPlan.length;

        this._saveQueue();
      }

      // Check if all steps completed
      const allCompleted = curiosity.studyPlan.every(s => s.completed);
      if (allCompleted) {
        curiosity.status = 'completed';
        curiosity.completedAt = new Date().toISOString();

        // Move to completed file
        await this._markCompleted(curiosity);

        // Remove from queue
        this.queue = this.queue.filter(c => c.id !== curiosity.id);
        this._saveQueue();
      } else {
        curiosity.status = 'paused';
      }

      this.emit('curiosity:study-completed', { curiosity, results });

      return {
        success: true,
        curiosity,
        results,
        progress: curiosity.progress,
        completed: allCompleted,
      };

    } catch (e) {
      console.error('[CuriosityEngine] Study failed:', e.message);
      curiosity.status = 'paused';
      this._saveQueue();

      return { success: false, reason: e.message };

    } finally {
      this.isStudying = false;
      this.currentStudy = null;
    }
  }

  /**
   * Execute a single study step
   * @private
   */
  async _executeStudyStep(curiosity, step) {
    const result = {
      action: step.action,
      description: step.description,
      timestamp: new Date().toISOString(),
      success: true,
      artifacts: [],
    };

    switch (step.action) {
      case 'read':
        // Simulate reading/research
        result.notes = `Researched: ${curiosity.topic}`;
        result.artifacts.push({
          type: 'research_notes',
          content: `Key findings about ${curiosity.topic}`,
        });
        break;

      case 'generate':
        // Generate examples or scenarios
        result.examples = [
          `Example scenario 1 for ${curiosity.topic}`,
          `Example scenario 2 for ${curiosity.topic}`,
          `Edge case for ${curiosity.topic}`,
        ];
        result.artifacts.push({
          type: 'examples',
          content: result.examples,
        });
        break;

      case 'create':
        // Create knowledge artifact
        result.artifact = {
          type: 'decision_tree',
          topic: curiosity.topic,
          nodes: ['Start', 'Decision 1', 'Outcome A', 'Outcome B'],
        };
        result.artifacts.push({
          type: 'knowledge_structure',
          content: result.artifact,
        });
        break;

      case 'test':
        // Self-test
        result.test = await this.selfTest(curiosity.topic);
        break;

      case 'practice':
        // Practice scenarios
        result.practice = {
          scenariosAttempted: 3,
          successRate: 0.8,
        };
        break;
    }

    // Store artifacts
    if (result.artifacts.length > 0) {
      curiosity.artifacts.push(...result.artifacts);
      await this.updateKnowledgeBase(result.artifacts);
    }

    return result;
  }

  /**
   * Generate a self-test for a topic
   * @param {string} topic
   * @returns {Promise<Object>}
   */
  async selfTest(topic) {
    const quiz = {
      topic,
      questions: [
        {
          question: `What is the primary purpose of ${topic}?`,
          type: 'conceptual',
        },
        {
          question: `When would you use ${topic}?`,
          type: 'practical',
        },
        {
          question: `What are common mistakes with ${topic}?`,
          type: 'pitfalls',
        },
      ],
      score: 0.75, // Simulated score
      passed: true,
      timestamp: new Date().toISOString(),
    };

    return quiz;
  }

  /**
   * Update the knowledge base with new artifacts
   * @param {Object[]} artifacts
   */
  async updateKnowledgeBase(artifacts) {
    try {
      for (const artifact of artifacts) {
        const entry = {
          ...artifact,
          timestamp: new Date().toISOString(),
        };

        const line = JSON.stringify(entry) + '\n';
        fs.appendFileSync(KNOWLEDGE_FILE, line, 'utf-8');

        // Also store in vector memory if available
        if (this.vectorMemory) {
          const content = typeof artifact.content === 'string'
            ? artifact.content
            : JSON.stringify(artifact.content);

          await this.vectorMemory.addMemory(content, {
            type: 'curiosity_learning',
            artifactType: artifact.type,
          });
        }
      }
    } catch (e) {
      console.error('[CuriosityEngine] Failed to update knowledge base:', e.message);
    }
  }

  /**
   * Mark a curiosity as completed
   * @private
   */
  async _markCompleted(curiosity) {
    try {
      const line = JSON.stringify(curiosity) + '\n';
      fs.appendFileSync(COMPLETED_FILE, line, 'utf-8');
    } catch (e) {
      console.error('[CuriosityEngine] Failed to log completion:', e.message);
    }
  }

  /**
   * Get the curiosity queue
   * @param {Object} [options]
   * @returns {Curiosity[]}
   */
  getQueue(options = {}) {
    let queue = [...this.queue];

    if (options.status) {
      queue = queue.filter(c => c.status === options.status);
    }

    if (options.minUrgency) {
      queue = queue.filter(c => c.urgency >= options.minUrgency);
    }

    return queue;
  }

  /**
   * Get completed curiosities
   * @param {number} [limit=50]
   * @returns {Curiosity[]}
   */
  getCompleted(limit = 50) {
    try {
      if (!fs.existsSync(COMPLETED_FILE)) {
        return [];
      }

      const content = fs.readFileSync(COMPLETED_FILE, 'utf-8');
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
      console.error('[CuriosityEngine] Failed to read completed:', e.message);
      return [];
    }
  }

  /**
   * Remove a curiosity from the queue
   * @param {string} id
   * @returns {boolean}
   */
  removeCuriosity(id) {
    const before = this.queue.length;
    this.queue = this.queue.filter(c => c.id !== id);

    if (this.queue.length < before) {
      this._saveQueue();
      this.emit('curiosity:removed', { id });
      return true;
    }

    return false;
  }

  /**
   * Update a curiosity's urgency
   * @param {string} id
   * @param {number} urgency
   * @returns {boolean}
   */
  updateUrgency(id, urgency) {
    const curiosity = this.queue.find(c => c.id === id);
    if (!curiosity) return false;

    curiosity.urgency = Math.max(0, Math.min(1, urgency));
    this.queue.sort((a, b) => b.urgency - a.urgency);
    this._saveQueue();

    return true;
  }

  /**
   * Get engine status
   * @returns {Object}
   */
  getStatus() {
    return {
      enabled: this.options.enabled,
      isStudying: this.isStudying,
      currentStudy: this.currentStudy ? {
        id: this.currentStudy.id,
        topic: this.currentStudy.topic,
        progress: this.currentStudy.progress,
      } : null,
      queueSize: this.queue.length,
      pendingCount: this.queue.filter(c => c.status === 'pending').length,
      studyingCount: this.queue.filter(c => c.status === 'studying').length,
      completedTotal: this.getCompleted(1000).length,
    };
  }

  /**
   * Get top knowledge gaps to address
   * @param {number} [limit=5]
   * @returns {Curiosity[]}
   */
  getTopPriorities(limit = 5) {
    return this.queue
      .filter(c => c.status === 'pending')
      .slice(0, limit);
  }
}

// Singleton instance
let instance = null;

/**
 * Get the curiosity engine instance
 * @param {Object} [options]
 * @returns {CuriosityEngine}
 */
export function getCuriosityEngine(options = {}) {
  if (!instance) {
    instance = new CuriosityEngine(options);
  }
  return instance;
}

export { CuriosityEngine, CURIOSITY_DIR };
export default getCuriosityEngine;
