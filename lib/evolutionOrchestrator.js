// Evolution Orchestrator - Coordinates all evolution components
import { EventEmitter } from 'events';
import { getConfig } from './configManager.js';
import { getIdleDetector, startIdleMonitoring, stopIdleMonitoring } from './idleDetector.js';
import { getCognitiveJournal } from './cognitiveJournal.js';
import { getGenomeManager, initGenomeManager } from './genomeManager.js';
import { getDreamEngine } from './dreamEngine.js';
import { getCuriosityEngine } from './curiosityEngine.js';
import { getMetaReflection } from './metaReflection.js';

/**
 * @typedef {Object} EvolutionStats
 * @property {number} totalEvolutionCycles - Total evolution cycles run
 * @property {number} dreamSessionsRun - Total dream sessions
 * @property {number} mutationsApplied - Total mutations applied
 * @property {number} rollbacks - Total rollbacks performed
 * @property {string} lastEvolutionTime - Last evolution timestamp
 * @property {string} lastDreamTime - Last dream session timestamp
 */

class EvolutionOrchestrator extends EventEmitter {
  constructor(options = {}) {
    super();

    const evolutionConfig = getConfig('evolution', {});

    this.options = {
      enabled: options.enabled !== undefined ? options.enabled : (evolutionConfig.enabled !== false),
      schedule: options.schedule || evolutionConfig.schedule || '0 3 * * *', // 3 AM daily
      dreamDuration: options.dreamDuration || evolutionConfig.dreamDuration || '30m',
      idleThreshold: options.idleThreshold || evolutionConfig.idleThreshold || 300000,
      dreamOnIdle: options.dreamOnIdle !== undefined ? options.dreamOnIdle : (evolutionConfig.dreamOnIdle !== false),
      metaReflectionInterval: options.metaReflectionInterval || evolutionConfig.metaReflectionInterval || '7d',
      ...options,
    };

    // Components
    this.idleDetector = null;
    this.cognitiveJournal = null;
    this.genomeManager = null;
    this.dreamEngine = null;
    this.curiosityEngine = null;
    this.metaReflection = null;

    // External dependencies (injected)
    this.cronScheduler = null;
    this.workerManager = null;
    this.vectorMemory = null;
    this.reflectionEngine = null;
    this.feedbackManager = null;
    this.sessionMemory = null;

    // State
    this.isRunning = false;
    this.isEvolutionInProgress = false;
    this.scheduledJobId = null;
    this.metaReflectionJobId = null;

    // Stats
    this.stats = {
      totalEvolutionCycles: 0,
      dreamSessionsRun: 0,
      mutationsApplied: 0,
      rollbacks: 0,
      lastEvolutionTime: null,
      lastDreamTime: null,
      lastMetaReflectionTime: null,
    };
  }

  /**
   * Initialize all evolution components
   */
  async initialize() {
    console.log('[EvolutionOrchestrator] Initializing evolution system...');

    // Initialize components
    this.idleDetector = getIdleDetector({
      idleThreshold: this.options.idleThreshold,
    });

    this.cognitiveJournal = getCognitiveJournal();
    this.genomeManager = await initGenomeManager();
    this.dreamEngine = getDreamEngine();
    this.curiosityEngine = getCuriosityEngine();
    this.metaReflection = getMetaReflection();

    // Wire up dependencies between components
    this._wireDependencies();

    // Set up event listeners
    this._setupEventListeners();

    console.log('[EvolutionOrchestrator] Initialization complete');
  }

  /**
   * Wire up dependencies between components
   * @private
   */
  _wireDependencies() {
    // Dream engine needs access to memory systems
    this.dreamEngine.setDependencies({
      vectorMemory: this.vectorMemory,
      reflectionEngine: this.reflectionEngine,
      feedbackManager: this.feedbackManager,
      sessionMemory: this.sessionMemory,
    });

    // Curiosity engine needs dream engine and vector memory
    this.curiosityEngine.setDependencies({
      vectorMemory: this.vectorMemory,
      dreamEngine: this.dreamEngine,
    });

    // Meta-reflection needs all components
    this.metaReflection.setDependencies({
      genomeManager: this.genomeManager,
      dreamEngine: this.dreamEngine,
      cognitiveJournal: this.cognitiveJournal,
      curiosityEngine: this.curiosityEngine,
      feedbackManager: this.feedbackManager,
    });
  }

  /**
   * Set external dependencies
   * @param {Object} deps
   */
  setDependencies(deps) {
    this.cronScheduler = deps.cronScheduler;
    this.workerManager = deps.workerManager;
    this.vectorMemory = deps.vectorMemory;
    this.reflectionEngine = deps.reflectionEngine;
    this.feedbackManager = deps.feedbackManager;
    this.sessionMemory = deps.sessionMemory;

    // Re-wire internal dependencies
    this._wireDependencies();
  }

  /**
   * Set up event listeners
   * @private
   */
  _setupEventListeners() {
    // Listen for idle events
    this.idleDetector.on('idle:start', (data) => {
      console.log(`[EvolutionOrchestrator] User went idle at ${data.timestamp}`);
      this.emit('evolution:idle-started', data);
    });

    this.idleDetector.on('idle:end', (data) => {
      console.log('[EvolutionOrchestrator] User returned from idle');
      this.emit('evolution:idle-ended', data);
    });

    this.idleDetector.on('idle:dream-eligible', async (data) => {
      console.log('[EvolutionOrchestrator] Dream-eligible idle detected');
      if (this.options.dreamOnIdle) {
        await this.onIdleStart(data);
      }
    });

    // Listen for genome events
    this.genomeManager.on('genome:evolved', (data) => {
      this.stats.mutationsApplied += data.mutations?.length || 0;
      this.emit('evolution:genome-evolved', data);
    });

    this.genomeManager.on('genome:rollback', (data) => {
      this.stats.rollbacks++;
      this.emit('evolution:genome-rollback', data);
    });

    // Listen for dream events
    this.dreamEngine.on('dream:session-completed', (data) => {
      this.stats.dreamSessionsRun++;
      this.stats.lastDreamTime = new Date().toISOString();
      this.emit('evolution:dream-completed', data);
    });

    // Listen for journal events
    this.cognitiveJournal.on('journal:entry-written', (data) => {
      this.emit('evolution:journal-entry', data);

      // Extract and queue knowledge gaps as curiosities
      const entry = data.entry;
      if (entry.knowledgeGaps?.length > 0) {
        for (const gap of entry.knowledgeGaps.slice(0, 3)) {
          this.curiosityEngine.addCuriosity({
            topic: gap,
            source: 'knowledge_gap',
            urgency: 0.5,
          });
        }
      }
    });
  }

  /**
   * Start the evolution system
   */
  async start() {
    if (this.isRunning) {
      console.log('[EvolutionOrchestrator] Already running');
      return;
    }

    if (!this.options.enabled) {
      console.log('[EvolutionOrchestrator] Evolution system is disabled');
      return;
    }

    console.log('[EvolutionOrchestrator] Starting evolution system...');

    // Initialize if not already done
    if (!this.genomeManager) {
      await this.initialize();
    }

    // Start idle monitoring
    startIdleMonitoring();

    // Schedule evolution cycles
    this.scheduleEvolution(this.options.schedule);

    // Schedule meta-reflection
    this.scheduleMetaReflection(this.options.metaReflectionInterval);

    this.isRunning = true;
    this.emit('evolution:started');

    console.log('[EvolutionOrchestrator] Evolution system started');
    console.log(`  - Scheduled evolution: ${this.options.schedule}`);
    console.log(`  - Dream on idle: ${this.options.dreamOnIdle}`);
    console.log(`  - Meta-reflection: ${this.options.metaReflectionInterval}`);
  }

  /**
   * Stop the evolution system
   */
  stop() {
    if (!this.isRunning) {
      return;
    }

    console.log('[EvolutionOrchestrator] Stopping evolution system...');

    // Stop idle monitoring
    stopIdleMonitoring();

    // Cancel scheduled jobs
    if (this.cronScheduler && this.scheduledJobId) {
      this.cronScheduler.cancelJob?.(this.scheduledJobId);
    }

    this.isRunning = false;
    this.emit('evolution:stopped');

    console.log('[EvolutionOrchestrator] Evolution system stopped');
  }

  /**
   * Schedule periodic evolution cycles
   * @param {string} cronExpr - Cron expression
   */
  scheduleEvolution(cronExpr) {
    if (!this.cronScheduler) {
      console.log('[EvolutionOrchestrator] No cron scheduler available');
      return;
    }

    try {
      this.scheduledJobId = this.cronScheduler.scheduleJob?.({
        name: 'evolution-cycle',
        schedule: { expr: cronExpr },
        payload: { type: 'evolution' },
        callback: async () => {
          await this.runEvolutionCycle();
        },
      });

      console.log(`[EvolutionOrchestrator] Evolution scheduled: ${cronExpr}`);
    } catch (e) {
      console.error('[EvolutionOrchestrator] Failed to schedule evolution:', e.message);
    }
  }

  /**
   * Schedule periodic meta-reflection
   * @param {string} interval - Interval string (e.g., '7d')
   */
  scheduleMetaReflection(interval) {
    // Convert interval to approximate cron expression
    // '7d' -> weekly, '1d' -> daily, etc.
    let cronExpr = '0 4 * * 0'; // Default: 4 AM on Sundays

    if (interval.endsWith('d')) {
      const days = parseInt(interval, 10);
      if (days === 1) {
        cronExpr = '0 4 * * *'; // Daily at 4 AM
      } else if (days <= 7) {
        cronExpr = '0 4 * * 0'; // Weekly
      } else {
        cronExpr = '0 4 1 * *'; // Monthly
      }
    }

    if (!this.cronScheduler) {
      return;
    }

    try {
      this.metaReflectionJobId = this.cronScheduler.scheduleJob?.({
        name: 'meta-reflection',
        schedule: { expr: cronExpr },
        payload: { type: 'meta-reflection' },
        callback: async () => {
          await this.runMetaReflection();
        },
      });

      console.log(`[EvolutionOrchestrator] Meta-reflection scheduled: ${cronExpr}`);
    } catch (e) {
      console.error('[EvolutionOrchestrator] Failed to schedule meta-reflection:', e.message);
    }
  }

  /**
   * Handle idle start - trigger dream session
   * @param {Object} data - Idle event data
   */
  async onIdleStart(data) {
    if (this.isEvolutionInProgress) {
      console.log('[EvolutionOrchestrator] Evolution already in progress, skipping idle dream');
      return;
    }

    console.log('[EvolutionOrchestrator] Starting idle-triggered dream session');

    await this.triggerDreamSession({ trigger: 'idle' });
  }

  /**
   * Trigger a dream session
   * @param {Object} [options]
   * @returns {Promise<Object>}
   */
  async triggerDreamSession(options = {}) {
    if (this.dreamEngine.isRunning) {
      return { success: false, reason: 'Dream session already running' };
    }

    console.log(`[EvolutionOrchestrator] Triggering dream session (${options.trigger || 'manual'})`);

    const session = await this.dreamEngine.startDreamSession({
      trigger: options.trigger || 'manual',
      ...options,
    });

    if (session && session.status === 'completed') {
      // Process dream insights
      await this._processDreamInsights(session);
    }

    return { success: true, session };
  }

  /**
   * Process insights from a dream session
   * @private
   */
  async _processDreamInsights(session) {
    const synthesis = session.synthesis;

    if (!synthesis) return;

    // Add mutation candidates from dreams
    if (synthesis.mutationCandidates?.length > 0 && this.genomeManager) {
      console.log(`[EvolutionOrchestrator] Processing ${synthesis.mutationCandidates.length} mutation candidates from dreams`);

      // The genome manager will evaluate these during the next evolution cycle
      // For now, store them for later
      this.genomeManager.pendingMutations = this.genomeManager.pendingMutations || [];
      this.genomeManager.pendingMutations.push(...synthesis.mutationCandidates);
    }

    // Add curiosities from patterns discovered
    if (synthesis.patternsDiscovered?.length > 0) {
      for (const pattern of synthesis.patternsDiscovered) {
        if (pattern.suggestion) {
          this.curiosityEngine.addCuriosity({
            topic: pattern.pattern,
            description: pattern.suggestion,
            source: 'dream_insight',
            urgency: 0.6,
          });
        }
      }
    }
  }

  /**
   * Run a full evolution cycle
   * @returns {Promise<Object>}
   */
  async runEvolutionCycle() {
    if (this.isEvolutionInProgress) {
      return { success: false, reason: 'Evolution cycle already in progress' };
    }

    this.isEvolutionInProgress = true;
    console.log('[EvolutionOrchestrator] Starting evolution cycle...');

    const cycleResult = {
      startTime: new Date().toISOString(),
      endTime: null,
      steps: [],
      success: true,
    };

    try {
      // Step 1: Write journal entry for current session
      console.log('[EvolutionOrchestrator] Step 1: Writing journal entry...');
      const journalEntry = await this.cognitiveJournal.writeEntry();
      cycleResult.steps.push({
        step: 'journal',
        success: !!journalEntry,
        entryId: journalEntry?.id,
      });

      // Step 2: Run dream session
      console.log('[EvolutionOrchestrator] Step 2: Running dream session...');
      const dreamResult = await this.triggerDreamSession({ trigger: 'scheduled' });
      cycleResult.steps.push({
        step: 'dream',
        success: dreamResult.success,
        sessionId: dreamResult.session?.id,
        dreamsCount: dreamResult.session?.dreams?.length || 0,
      });

      // Step 3: Gather insights for evolution
      console.log('[EvolutionOrchestrator] Step 3: Gathering insights...');
      const insights = this._gatherInsights(journalEntry, dreamResult.session);

      // Step 4: Run genome evolution
      console.log('[EvolutionOrchestrator] Step 4: Running genome evolution...');
      const evolutionResult = await this.genomeManager.evolve(insights);
      cycleResult.steps.push({
        step: 'evolution',
        success: evolutionResult.evolved,
        newGeneration: evolutionResult.newGeneration,
        mutationsApplied: evolutionResult.mutationsApplied,
      });

      // Step 5: Run curiosity study session (if time permits)
      console.log('[EvolutionOrchestrator] Step 5: Running curiosity study...');
      const studyResult = await this.curiosityEngine.study();
      cycleResult.steps.push({
        step: 'curiosity',
        success: studyResult.success,
        topic: studyResult.curiosity?.topic,
        progress: studyResult.progress,
      });

      // Update stats
      this.stats.totalEvolutionCycles++;
      this.stats.lastEvolutionTime = new Date().toISOString();

      cycleResult.endTime = new Date().toISOString();
      this.emit('evolution:cycle-completed', { result: cycleResult });

      console.log('[EvolutionOrchestrator] Evolution cycle completed');
      return { success: true, result: cycleResult };

    } catch (e) {
      console.error('[EvolutionOrchestrator] Evolution cycle failed:', e.message);
      cycleResult.success = false;
      cycleResult.error = e.message;
      this.emit('evolution:cycle-failed', { error: e, result: cycleResult });
      return { success: false, error: e.message, result: cycleResult };

    } finally {
      this.isEvolutionInProgress = false;
    }
  }

  /**
   * Gather insights from journal and dreams
   * @private
   */
  _gatherInsights(journalEntry, dreamSession) {
    const insights = {
      userSignals: null,
      feedbackPatterns: null,
      dreamInsights: [],
    };

    // From journal entry
    if (journalEntry) {
      insights.userSignals = journalEntry.userSignals;
    }

    // From feedback manager
    if (this.feedbackManager) {
      try {
        const analytics = this.feedbackManager.getAnalytics?.() || {};
        insights.feedbackPatterns = {
          positiveRatio: analytics.positiveRatio || 0.5,
          commonNegativeReasons: analytics.commonNegativeReasons || [],
        };
      } catch {
        // Ignore feedback errors
      }
    }

    // From dream session
    if (dreamSession?.synthesis?.mutationCandidates) {
      insights.dreamInsights = dreamSession.synthesis.mutationCandidates.map(mc => ({
        suggestedMutation: {
          type: mc.type || 'trait_adjustment',
          target: mc.target,
          rationale: mc.rationale,
          proposedValue: mc.proposedValue,
          confidence: mc.confidence || 0.5,
        },
      }));
    }

    return insights;
  }

  /**
   * Run meta-reflection
   * @returns {Promise<Object>}
   */
  async runMetaReflection() {
    console.log('[EvolutionOrchestrator] Running meta-reflection...');

    const reflection = await this.metaReflection.reflect('7d');

    // Apply tuning if recommendations exist
    if (reflection.recommendations.length > 0) {
      const tuning = await this.metaReflection.tuneEvolutionEngine(reflection);
      console.log(`[EvolutionOrchestrator] Applied ${tuning.actions.length} tuning actions`);
    }

    this.stats.lastMetaReflectionTime = new Date().toISOString();
    this.emit('evolution:meta-reflection-completed', { reflection });

    return { success: true, reflection };
  }

  /**
   * Trigger a manual evolution cycle
   * @returns {Promise<Object>}
   */
  async triggerEvolution() {
    return this.runEvolutionCycle();
  }

  /**
   * Record user activity (for session memory integration)
   * @param {Object} interaction
   */
  recordInteraction(interaction) {
    // Add to cognitive journal session
    this.cognitiveJournal.addInteraction(interaction);

    // Record activity for idle detection
    this.idleDetector.recordActivity();

    // Record satisfaction for genome auto-rollback
    if (interaction.feedback === '👍') {
      this.genomeManager?.recordSatisfaction(1);
    } else if (interaction.feedback === '👎') {
      this.genomeManager?.recordSatisfaction(0);
    }
  }

  /**
   * Get evolution system status
   * @returns {Object}
   */
  getStatus() {
    return {
      running: this.isRunning,
      enabled: this.options.enabled,
      evolutionInProgress: this.isEvolutionInProgress,
      components: {
        idleDetector: this.idleDetector?.getStats(),
        genome: this.genomeManager?.getStatus(),
        dreams: this.dreamEngine?.getStatus(),
        curiosity: this.curiosityEngine?.getStatus(),
        metaReflection: this.metaReflection?.getStatus(),
      },
      stats: this.stats,
      schedule: {
        evolution: this.options.schedule,
        metaReflection: this.options.metaReflectionInterval,
      },
    };
  }

  /**
   * Get evolution statistics
   * @returns {EvolutionStats}
   */
  getEvolutionStats() {
    return { ...this.stats };
  }

  /**
   * Get system prompt modifiers from current genome
   * @returns {Object}
   */
  getSystemPromptModifiers() {
    if (!this.genomeManager) {
      return { prefix: '', suffix: '' };
    }
    return this.genomeManager.buildSystemPromptModifiers();
  }

  /**
   * Get current trait values
   * @returns {Object|null}
   */
  getTraits() {
    return this.genomeManager?.activeGenome?.traits || null;
  }

  /**
   * Get current behaviors
   * @returns {Object|null}
   */
  getBehaviors() {
    return this.genomeManager?.activeGenome?.behaviors || null;
  }

  /**
   * Manual genome reset (CLI command)
   */
  async resetGenome() {
    if (!this.genomeManager) {
      return { success: false, reason: 'Genome manager not initialized' };
    }

    const result = this.genomeManager.reset();
    return { success: result };
  }

  /**
   * Manual genome rollback (CLI command)
   * @param {number} generation
   */
  async rollbackGenome(generation) {
    if (!this.genomeManager) {
      return { success: false, reason: 'Genome manager not initialized' };
    }

    const result = this.genomeManager.rollback(generation);
    return { success: result };
  }

  /**
   * Pause evolution (CLI command)
   */
  pauseEvolution() {
    this.options.enabled = false;
    this.stop();
    return { success: true };
  }

  /**
   * Resume evolution (CLI command)
   */
  async resumeEvolution() {
    this.options.enabled = true;
    await this.start();
    return { success: true };
  }
}

// Singleton instance
let instance = null;

/**
 * Get the evolution orchestrator instance
 * @param {Object} [options]
 * @returns {EvolutionOrchestrator}
 */
export function getEvolutionOrchestrator(options = {}) {
  if (!instance) {
    instance = new EvolutionOrchestrator(options);
  }
  return instance;
}

/**
 * Initialize and start the evolution system
 * @param {Object} [options]
 * @returns {Promise<EvolutionOrchestrator>}
 */
export async function initEvolutionSystem(options = {}) {
  const orchestrator = getEvolutionOrchestrator(options);
  await orchestrator.initialize();
  return orchestrator;
}

export { EvolutionOrchestrator };
export default getEvolutionOrchestrator;
