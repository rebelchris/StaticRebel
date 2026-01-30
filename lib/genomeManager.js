// Genome Manager - Self-modifying configuration with traits, behaviors, and safety bounds
import { EventEmitter } from 'events';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { v4 as uuidv4 } from 'uuid';
import { getConfig } from './configManager.js';

const EVOLUTION_DIR = path.join(os.homedir(), '.static-rebel', 'evolution');
const GENOME_DIR = path.join(EVOLUTION_DIR, 'genome');
const ACTIVE_GENOME_FILE = path.join(GENOME_DIR, 'active.json');
const BASE_GENOME_FILE = path.join(GENOME_DIR, 'base.json');
const HISTORY_DIR = path.join(GENOME_DIR, 'history');
const AUDIT_LOG_FILE = path.join(GENOME_DIR, 'audit-log.jsonl');

/**
 * @typedef {Object} Trait
 * @property {number} value - Current value (0-1)
 * @property {number} min - Minimum allowed value
 * @property {number} max - Maximum allowed value
 */

/**
 * @typedef {Object} Mutation
 * @property {string} id - Unique mutation ID
 * @property {'trait_adjustment'|'behavior_change'|'prompt_modifier'} type
 * @property {string} target - Dot-notation path (e.g., 'traits.verbosity')
 * @property {*} currentValue - Current value before mutation
 * @property {*} proposedValue - Proposed new value
 * @property {string} rationale - Why this mutation was suggested
 * @property {'dream'|'journal'|'feedback'|'curiosity'|'meta'} source
 * @property {number} confidence - 0-1 confidence in the mutation
 * @property {'pending'|'testing'|'approved'|'applied'|'rejected'} status
 * @property {Object} [testResults] - Results from synthetic testing
 */

/**
 * @typedef {Object} Genome
 * @property {string} version - Semantic version
 * @property {number} generation - Incremental generation counter
 * @property {string} createdAt - ISO timestamp
 * @property {string} lastModifiedAt - ISO timestamp
 * @property {Object} traits - Personality traits with values 0-1
 * @property {Object} traitBounds - Min/max bounds for each trait
 * @property {Object} behaviors - Response behaviors for different scenarios
 * @property {Object} promptModifiers - System prompt modifications
 * @property {string[]} appliedMutations - IDs of mutations that created this genome
 */

// Default genome structure
const DEFAULT_GENOME = {
  version: '1.0.0',
  generation: 1,
  createdAt: new Date().toISOString(),
  lastModifiedAt: new Date().toISOString(),
  traits: {
    verbosity: 0.5,              // Response length preference
    confidenceThreshold: 0.7,    // When to express certainty
    apologyTendency: 0.3,        // Frequency of apologies
    humorFrequency: 0.2,         // Use of humor
    speculationWillingness: 0.5, // Willingness to speculate
    technicalDepth: 0.6,         // Default technical detail level
    formality: 0.5,              // Formal vs casual tone
    proactivity: 0.5,            // Offering unsolicited suggestions
    empathy: 0.6,                // Emotional acknowledgment
    directness: 0.6,             // Getting to the point
  },
  traitBounds: {
    verbosity: { min: 0.1, max: 0.9 },
    confidenceThreshold: { min: 0.3, max: 0.95 },
    apologyTendency: { min: 0.0, max: 0.6 },
    humorFrequency: { min: 0.0, max: 0.5 },
    speculationWillingness: { min: 0.1, max: 0.8 },
    technicalDepth: { min: 0.2, max: 0.9 },
    formality: { min: 0.1, max: 0.9 },
    proactivity: { min: 0.1, max: 0.8 },
    empathy: { min: 0.2, max: 0.9 },
    directness: { min: 0.2, max: 0.9 },
  },
  behaviors: {
    onCorrection: 'acknowledge_brief_and_fix',
    onConfusion: 'ask_clarifying_question',
    onFrustrationDetected: 'simplify_and_offer_alternative',
    onSuccessDetected: 'brief_acknowledgment',
    onUncertainty: 'express_uncertainty_then_proceed',
    onComplexQuery: 'break_down_then_solve',
    onSimpleQuery: 'direct_answer',
    onFollowUp: 'reference_context_briefly',
  },
  promptModifiers: {
    systemPrefix: '',
    systemSuffix: '',
    codeGenerationPrefix: '',
    codeGenerationSuffix: '',
    explanationStyle: 'balanced',
  },
  appliedMutations: [],
};

// Behavior options for each scenario
const BEHAVIOR_OPTIONS = {
  onCorrection: [
    'acknowledge_brief_and_fix',
    'apologize_and_fix',
    'analyze_mistake_then_fix',
    'fix_silently',
  ],
  onConfusion: [
    'ask_clarifying_question',
    'offer_multiple_interpretations',
    'make_best_guess',
    'request_more_context',
  ],
  onFrustrationDetected: [
    'simplify_and_offer_alternative',
    'acknowledge_and_restart',
    'offer_step_by_step',
    'ask_what_went_wrong',
  ],
  onSuccessDetected: [
    'brief_acknowledgment',
    'positive_reinforcement',
    'offer_next_steps',
    'silent_continue',
  ],
  onUncertainty: [
    'express_uncertainty_then_proceed',
    'list_caveats_first',
    'ask_for_verification',
    'proceed_confidently',
  ],
  onComplexQuery: [
    'break_down_then_solve',
    'overview_then_details',
    'solve_then_explain',
    'ask_which_aspect_first',
  ],
  onSimpleQuery: [
    'direct_answer',
    'answer_with_context',
    'answer_with_example',
  ],
  onFollowUp: [
    'reference_context_briefly',
    'assume_context',
    'ask_for_context',
  ],
};

class GenomeManager extends EventEmitter {
  constructor(options = {}) {
    super();

    const evolutionConfig = getConfig('evolution', {});

    this.options = {
      maxMutationsPerCycle: options.maxMutationsPerCycle || evolutionConfig.maxMutationsPerCycle || 3,
      traitChangeLimit: options.traitChangeLimit || evolutionConfig.traitChangeLimit || 0.2,
      autoRollbackThreshold: options.autoRollbackThreshold || evolutionConfig.autoRollbackThreshold || 0.2,
      ...options,
    };

    this.activeGenome = null;
    this.baseGenome = null;
    this.pendingMutations = [];
    this.satisfactionHistory = [];

    this._ensureDirectories();
  }

  /**
   * Ensure storage directories exist
   * @private
   */
  _ensureDirectories() {
    try {
      for (const dir of [GENOME_DIR, HISTORY_DIR]) {
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
      }
    } catch (e) {
      console.error('[GenomeManager] Failed to create directories:', e.message);
    }
  }

  /**
   * Initialize the genome system
   */
  async initialize() {
    // Load or create base genome
    this.baseGenome = this.loadBase();
    if (!this.baseGenome) {
      this.baseGenome = { ...DEFAULT_GENOME };
      this._saveGenome(BASE_GENOME_FILE, this.baseGenome);
    }

    // Load or create active genome
    this.activeGenome = this.loadActive();
    if (!this.activeGenome) {
      this.activeGenome = { ...this.baseGenome };
      this._saveGenome(ACTIVE_GENOME_FILE, this.activeGenome);
    }

    console.log('[GenomeManager] Initialized - Generation:', this.activeGenome.generation);
  }

  /**
   * Load the active genome
   * @returns {Genome|null}
   */
  loadActive() {
    try {
      if (fs.existsSync(ACTIVE_GENOME_FILE)) {
        const data = fs.readFileSync(ACTIVE_GENOME_FILE, 'utf-8');
        return JSON.parse(data);
      }
    } catch (e) {
      console.error('[GenomeManager] Failed to load active genome:', e.message);
    }
    return null;
  }

  /**
   * Load the base genome (safety fallback)
   * @returns {Genome|null}
   */
  loadBase() {
    try {
      if (fs.existsSync(BASE_GENOME_FILE)) {
        const data = fs.readFileSync(BASE_GENOME_FILE, 'utf-8');
        return JSON.parse(data);
      }
    } catch (e) {
      console.error('[GenomeManager] Failed to load base genome:', e.message);
    }
    return null;
  }

  /**
   * Save a genome to disk
   * @private
   */
  _saveGenome(filePath, genome) {
    try {
      fs.writeFileSync(filePath, JSON.stringify(genome, null, 2), 'utf-8');
      return true;
    } catch (e) {
      console.error('[GenomeManager] Failed to save genome:', e.message);
      return false;
    }
  }

  /**
   * Save the active genome with history backup
   * @param {Genome} genome
   */
  save(genome) {
    // Backup current genome to history
    if (this.activeGenome) {
      const historyFile = path.join(
        HISTORY_DIR,
        `generation-${this.activeGenome.generation}.json`
      );
      this._saveGenome(historyFile, this.activeGenome);
    }

    // Update metadata
    genome.lastModifiedAt = new Date().toISOString();

    // Save new active genome
    this._saveGenome(ACTIVE_GENOME_FILE, genome);
    this.activeGenome = genome;

    this.emit('genome:saved', { genome });
  }

  /**
   * Get a trait value
   * @param {string} name - Trait name
   * @returns {number|null}
   */
  getTrait(name) {
    if (!this.activeGenome || !this.activeGenome.traits) {
      return null;
    }
    return this.activeGenome.traits[name] ?? null;
  }

  /**
   * Set a trait value with bounds checking
   * @param {string} name - Trait name
   * @param {number} value - New value
   * @param {string} [reason] - Reason for change
   * @returns {boolean} - Success
   */
  setTrait(name, value, reason = 'manual') {
    if (!this.activeGenome || !this.activeGenome.traits) {
      return false;
    }

    const bounds = this.activeGenome.traitBounds[name];
    if (!bounds) {
      console.error(`[GenomeManager] Unknown trait: ${name}`);
      return false;
    }

    // Enforce bounds
    const clampedValue = Math.max(bounds.min, Math.min(bounds.max, value));
    const oldValue = this.activeGenome.traits[name];

    // Check change limit
    const change = Math.abs(clampedValue - oldValue);
    if (change > this.options.traitChangeLimit) {
      console.warn(`[GenomeManager] Trait change exceeds limit: ${change} > ${this.options.traitChangeLimit}`);
      // Apply partial change up to limit
      const direction = clampedValue > oldValue ? 1 : -1;
      this.activeGenome.traits[name] = oldValue + (direction * this.options.traitChangeLimit);
    } else {
      this.activeGenome.traits[name] = clampedValue;
    }

    // Audit log
    this._logAudit({
      type: 'trait_change',
      target: `traits.${name}`,
      oldValue,
      newValue: this.activeGenome.traits[name],
      reason,
      timestamp: new Date().toISOString(),
    });

    this.save(this.activeGenome);
    this.emit('genome:trait-changed', { name, oldValue, newValue: this.activeGenome.traits[name] });

    return true;
  }

  /**
   * Get a behavior setting
   * @param {string} scenario - Behavior scenario
   * @returns {string|null}
   */
  getBehavior(scenario) {
    if (!this.activeGenome || !this.activeGenome.behaviors) {
      return null;
    }
    return this.activeGenome.behaviors[scenario] ?? null;
  }

  /**
   * Set a behavior setting
   * @param {string} scenario - Behavior scenario
   * @param {string} behavior - New behavior
   * @param {string} [reason] - Reason for change
   * @returns {boolean}
   */
  setBehavior(scenario, behavior, reason = 'manual') {
    if (!this.activeGenome || !this.activeGenome.behaviors) {
      return false;
    }

    const validOptions = BEHAVIOR_OPTIONS[scenario];
    if (!validOptions) {
      console.error(`[GenomeManager] Unknown behavior scenario: ${scenario}`);
      return false;
    }

    if (!validOptions.includes(behavior)) {
      console.error(`[GenomeManager] Invalid behavior for ${scenario}: ${behavior}`);
      return false;
    }

    const oldValue = this.activeGenome.behaviors[scenario];
    this.activeGenome.behaviors[scenario] = behavior;

    // Audit log
    this._logAudit({
      type: 'behavior_change',
      target: `behaviors.${scenario}`,
      oldValue,
      newValue: behavior,
      reason,
      timestamp: new Date().toISOString(),
    });

    this.save(this.activeGenome);
    this.emit('genome:behavior-changed', { scenario, oldValue, newValue: behavior });

    return true;
  }

  /**
   * Rollback to a previous generation
   * @param {number} generation - Target generation
   * @returns {boolean}
   */
  rollback(generation) {
    const historyFile = path.join(HISTORY_DIR, `generation-${generation}.json`);

    try {
      if (!fs.existsSync(historyFile)) {
        console.error(`[GenomeManager] Generation ${generation} not found`);
        return false;
      }

      const oldGenome = JSON.parse(fs.readFileSync(historyFile, 'utf-8'));

      // Audit log
      this._logAudit({
        type: 'rollback',
        fromGeneration: this.activeGenome?.generation,
        toGeneration: generation,
        reason: 'manual_rollback',
        timestamp: new Date().toISOString(),
      });

      // Create new generation based on old genome
      const newGenome = {
        ...oldGenome,
        generation: (this.activeGenome?.generation || 0) + 1,
        lastModifiedAt: new Date().toISOString(),
        appliedMutations: [`rollback_to_${generation}`],
      };

      this.save(newGenome);
      this.emit('genome:rollback', { fromGeneration: this.activeGenome?.generation, toGeneration: generation });

      return true;
    } catch (e) {
      console.error('[GenomeManager] Rollback failed:', e.message);
      return false;
    }
  }

  /**
   * Reset to base genome
   * @returns {boolean}
   */
  reset() {
    if (!this.baseGenome) {
      console.error('[GenomeManager] No base genome available');
      return false;
    }

    // Audit log
    this._logAudit({
      type: 'reset',
      fromGeneration: this.activeGenome?.generation,
      reason: 'reset_to_base',
      timestamp: new Date().toISOString(),
    });

    const newGenome = {
      ...this.baseGenome,
      generation: (this.activeGenome?.generation || 0) + 1,
      lastModifiedAt: new Date().toISOString(),
      appliedMutations: ['reset_to_base'],
    };

    this.save(newGenome);
    this.emit('genome:reset', { generation: newGenome.generation });

    return true;
  }

  /**
   * Build system prompt modifiers based on current genome
   * @returns {Object}
   */
  buildSystemPromptModifiers() {
    if (!this.activeGenome) {
      return { prefix: '', suffix: '' };
    }

    const { traits, behaviors, promptModifiers } = this.activeGenome;
    const parts = [];

    // Build prefix based on traits
    if (traits.verbosity < 0.3) {
      parts.push('Be concise and brief in responses.');
    } else if (traits.verbosity > 0.7) {
      parts.push('Provide detailed, thorough responses.');
    }

    if (traits.directness > 0.7) {
      parts.push('Lead with the direct answer before explanation.');
    }

    if (traits.formality > 0.7) {
      parts.push('Maintain a professional, formal tone.');
    } else if (traits.formality < 0.3) {
      parts.push('Use a casual, conversational tone.');
    }

    if (traits.humorFrequency > 0.4) {
      parts.push('Feel free to include light humor when appropriate.');
    }

    if (traits.empathy > 0.7) {
      parts.push('Acknowledge user emotions and frustrations.');
    }

    if (traits.apologyTendency < 0.2) {
      parts.push('Avoid excessive apologies.');
    }

    // Add behavior-specific instructions
    const behaviorInstructions = {
      onCorrection: {
        'acknowledge_brief_and_fix': 'When corrected, briefly acknowledge and provide the fix.',
        'apologize_and_fix': 'When corrected, apologize and provide the fix.',
        'fix_silently': 'When corrected, just provide the corrected information.',
      },
      onFrustrationDetected: {
        'simplify_and_offer_alternative': 'If user seems frustrated, simplify your approach.',
        'acknowledge_and_restart': 'If user seems frustrated, acknowledge and offer to start fresh.',
      },
    };

    for (const [scenario, behavior] of Object.entries(behaviors)) {
      const instruction = behaviorInstructions[scenario]?.[behavior];
      if (instruction) {
        parts.push(instruction);
      }
    }

    // Combine with custom modifiers
    const prefix = [promptModifiers.systemPrefix, ...parts].filter(Boolean).join(' ');
    const suffix = promptModifiers.systemSuffix || '';

    return { prefix, suffix };
  }

  /**
   * Generate mutation candidates from insights
   * @param {Object} insights - Insights from dream/journal/feedback
   * @returns {Mutation[]}
   */
  generateMutations(insights) {
    const mutations = [];

    // From user signal patterns
    if (insights.userSignals) {
      const { frustration, impatience, confusion } = insights.userSignals;

      if (impatience > 0.6 && this.getTrait('verbosity') > 0.4) {
        mutations.push({
          id: uuidv4(),
          type: 'trait_adjustment',
          target: 'traits.verbosity',
          currentValue: this.getTrait('verbosity'),
          proposedValue: Math.max(0.3, this.getTrait('verbosity') - 0.15),
          rationale: 'User shows impatience - reduce verbosity',
          source: 'journal',
          confidence: 0.7,
          status: 'pending',
        });
      }

      if (frustration > 0.6) {
        mutations.push({
          id: uuidv4(),
          type: 'behavior_change',
          target: 'behaviors.onFrustrationDetected',
          currentValue: this.getBehavior('onFrustrationDetected'),
          proposedValue: 'simplify_and_offer_alternative',
          rationale: 'High frustration detected - improve frustration handling',
          source: 'journal',
          confidence: 0.8,
          status: 'pending',
        });
      }

      if (confusion > 0.5 && this.getTrait('technicalDepth') > 0.6) {
        mutations.push({
          id: uuidv4(),
          type: 'trait_adjustment',
          target: 'traits.technicalDepth',
          currentValue: this.getTrait('technicalDepth'),
          proposedValue: Math.max(0.4, this.getTrait('technicalDepth') - 0.1),
          rationale: 'User confusion suggests simpler explanations needed',
          source: 'journal',
          confidence: 0.6,
          status: 'pending',
        });
      }
    }

    // From feedback patterns
    if (insights.feedbackPatterns) {
      const { positiveRatio, commonNegativeReasons } = insights.feedbackPatterns;

      if (positiveRatio < 0.6 && commonNegativeReasons?.includes('too_verbose')) {
        mutations.push({
          id: uuidv4(),
          type: 'trait_adjustment',
          target: 'traits.verbosity',
          currentValue: this.getTrait('verbosity'),
          proposedValue: Math.max(0.2, this.getTrait('verbosity') - 0.2),
          rationale: 'Feedback indicates responses too verbose',
          source: 'feedback',
          confidence: 0.85,
          status: 'pending',
        });
      }
    }

    // From dream insights
    if (insights.dreamInsights) {
      for (const insight of insights.dreamInsights) {
        if (insight.suggestedMutation) {
          mutations.push({
            ...insight.suggestedMutation,
            id: uuidv4(),
            source: 'dream',
            status: 'pending',
          });
        }
      }
    }

    // Limit mutations per cycle
    return mutations.slice(0, this.options.maxMutationsPerCycle);
  }

  /**
   * Test mutations against synthetic scenarios
   * @param {Mutation[]} mutations
   * @returns {Promise<Mutation[]>} - Mutations with test results
   */
  async testMutations(mutations) {
    // Synthetic testing - simulate how changes would affect responses
    const testedMutations = [];

    for (const mutation of mutations) {
      const testResult = {
        passed: true,
        improvement: 0,
        scenarios: [],
      };

      // For trait changes, verify bounds
      if (mutation.type === 'trait_adjustment') {
        const bounds = this.activeGenome.traitBounds[mutation.target.split('.')[1]];
        if (bounds) {
          if (mutation.proposedValue < bounds.min || mutation.proposedValue > bounds.max) {
            testResult.passed = false;
            testResult.reason = 'Proposed value outside bounds';
          } else {
            // Estimate improvement based on source confidence
            testResult.improvement = mutation.confidence * 0.2;
          }
        }
      }

      // For behavior changes, validate option exists
      if (mutation.type === 'behavior_change') {
        const scenario = mutation.target.split('.')[1];
        const validOptions = BEHAVIOR_OPTIONS[scenario];
        if (!validOptions?.includes(mutation.proposedValue)) {
          testResult.passed = false;
          testResult.reason = 'Invalid behavior option';
        } else {
          testResult.improvement = mutation.confidence * 0.15;
        }
      }

      testedMutations.push({
        ...mutation,
        testResults: testResult,
        status: testResult.passed ? 'approved' : 'rejected',
      });
    }

    return testedMutations;
  }

  /**
   * Apply approved mutations to the genome
   * @param {Mutation[]} mutations - Pre-tested mutations
   * @returns {Genome} - New genome
   */
  applyMutations(mutations) {
    const approvedMutations = mutations.filter(m => m.status === 'approved');

    if (approvedMutations.length === 0) {
      return this.activeGenome;
    }

    // Create new genome
    const newGenome = JSON.parse(JSON.stringify(this.activeGenome));
    newGenome.generation += 1;
    newGenome.lastModifiedAt = new Date().toISOString();
    newGenome.appliedMutations = approvedMutations.map(m => m.id);

    for (const mutation of approvedMutations) {
      const pathParts = mutation.target.split('.');
      let target = newGenome;

      // Navigate to parent
      for (let i = 0; i < pathParts.length - 1; i++) {
        target = target[pathParts[i]];
      }

      // Apply change
      const key = pathParts[pathParts.length - 1];
      target[key] = mutation.proposedValue;

      // Update mutation status
      mutation.status = 'applied';

      // Audit log
      this._logAudit({
        type: 'mutation_applied',
        mutationId: mutation.id,
        target: mutation.target,
        oldValue: mutation.currentValue,
        newValue: mutation.proposedValue,
        rationale: mutation.rationale,
        source: mutation.source,
        generation: newGenome.generation,
        timestamp: new Date().toISOString(),
      });
    }

    this.save(newGenome);
    this.emit('genome:evolved', {
      generation: newGenome.generation,
      mutations: approvedMutations,
    });

    return newGenome;
  }

  /**
   * Run a full evolution cycle
   * @param {Object} insights - Combined insights from all sources
   * @returns {Object} - Evolution results
   */
  async evolve(insights) {
    console.log('[GenomeManager] Starting evolution cycle...');

    // Generate mutations
    const mutations = this.generateMutations(insights);
    console.log(`[GenomeManager] Generated ${mutations.length} mutation candidates`);

    if (mutations.length === 0) {
      return { evolved: false, reason: 'No mutations generated' };
    }

    // Test mutations
    const testedMutations = await this.testMutations(mutations);
    const approvedCount = testedMutations.filter(m => m.status === 'approved').length;
    console.log(`[GenomeManager] ${approvedCount}/${mutations.length} mutations approved`);

    if (approvedCount === 0) {
      return { evolved: false, reason: 'No mutations passed testing' };
    }

    // Apply mutations
    const newGenome = this.applyMutations(testedMutations);

    return {
      evolved: true,
      previousGeneration: this.activeGenome.generation - 1,
      newGeneration: newGenome.generation,
      mutationsApplied: approvedCount,
      mutations: testedMutations,
    };
  }

  /**
   * Record satisfaction for auto-rollback detection
   * @param {number} satisfaction - 0-1 satisfaction score
   */
  recordSatisfaction(satisfaction) {
    this.satisfactionHistory.push({
      satisfaction,
      generation: this.activeGenome?.generation,
      timestamp: Date.now(),
    });

    // Keep last 100 entries
    if (this.satisfactionHistory.length > 100) {
      this.satisfactionHistory.shift();
    }

    // Check for auto-rollback
    this._checkAutoRollback();
  }

  /**
   * Check if auto-rollback should trigger
   * @private
   */
  _checkAutoRollback() {
    const threeDaysAgo = Date.now() - (3 * 24 * 60 * 60 * 1000);
    const recentHistory = this.satisfactionHistory.filter(h => h.timestamp > threeDaysAgo);

    if (recentHistory.length < 10) return; // Not enough data

    const currentGen = this.activeGenome?.generation;
    const currentGenHistory = recentHistory.filter(h => h.generation === currentGen);
    const previousGenHistory = recentHistory.filter(h => h.generation === currentGen - 1);

    if (currentGenHistory.length < 5 || previousGenHistory.length < 5) return;

    const currentAvg = currentGenHistory.reduce((s, h) => s + h.satisfaction, 0) / currentGenHistory.length;
    const previousAvg = previousGenHistory.reduce((s, h) => s + h.satisfaction, 0) / previousGenHistory.length;

    const drop = previousAvg - currentAvg;

    if (drop > this.options.autoRollbackThreshold) {
      console.warn(`[GenomeManager] Satisfaction dropped ${(drop * 100).toFixed(1)}% - triggering auto-rollback`);
      this.rollback(currentGen - 1);
    }
  }

  /**
   * Log to audit file
   * @private
   */
  _logAudit(entry) {
    try {
      const line = JSON.stringify(entry) + '\n';
      fs.appendFileSync(AUDIT_LOG_FILE, line, 'utf-8');
    } catch (e) {
      console.error('[GenomeManager] Failed to write audit log:', e.message);
    }
  }

  /**
   * Get the audit log
   * @param {number} [limit=100] - Max entries to return
   * @returns {Object[]}
   */
  getAuditLog(limit = 100) {
    try {
      if (!fs.existsSync(AUDIT_LOG_FILE)) {
        return [];
      }

      const content = fs.readFileSync(AUDIT_LOG_FILE, 'utf-8');
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
        .filter(Boolean);
    } catch (e) {
      console.error('[GenomeManager] Failed to read audit log:', e.message);
      return [];
    }
  }

  /**
   * Get available generations for rollback
   * @returns {number[]}
   */
  getAvailableGenerations() {
    try {
      const files = fs.readdirSync(HISTORY_DIR);
      return files
        .filter(f => f.startsWith('generation-') && f.endsWith('.json'))
        .map(f => parseInt(f.replace('generation-', '').replace('.json', ''), 10))
        .sort((a, b) => b - a);
    } catch {
      return [];
    }
  }

  /**
   * Get genome status summary
   * @returns {Object}
   */
  getStatus() {
    return {
      initialized: !!this.activeGenome,
      generation: this.activeGenome?.generation,
      version: this.activeGenome?.version,
      lastModified: this.activeGenome?.lastModifiedAt,
      traits: this.activeGenome?.traits,
      behaviors: this.activeGenome?.behaviors,
      availableGenerations: this.getAvailableGenerations(),
      pendingMutations: this.pendingMutations.length,
    };
  }
}

// Singleton instance
let instance = null;

/**
 * Get the genome manager instance
 * @param {Object} [options]
 * @returns {GenomeManager}
 */
export function getGenomeManager(options = {}) {
  if (!instance) {
    instance = new GenomeManager(options);
  }
  return instance;
}

/**
 * Initialize the genome system
 */
export async function initGenomeManager() {
  const manager = getGenomeManager();
  await manager.initialize();
  return manager;
}

export {
  GenomeManager,
  DEFAULT_GENOME,
  BEHAVIOR_OPTIONS,
  GENOME_DIR,
};
export default getGenomeManager;
