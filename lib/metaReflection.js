// Meta Reflection - Reflect on the reflection process itself
import { EventEmitter } from 'events';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { v4 as uuidv4 } from 'uuid';
import { getConfig } from './configManager.js';

const EVOLUTION_DIR = path.join(os.homedir(), '.static-rebel', 'evolution');
const META_DIR = path.join(EVOLUTION_DIR, 'meta');
const REFLECTIONS_FILE = path.join(META_DIR, 'reflections.jsonl');
const TUNING_FILE = path.join(META_DIR, 'tuning-history.jsonl');

/**
 * @typedef {Object} MetaReflection
 * @property {string} id - Unique ID
 * @property {string} timestamp - ISO timestamp
 * @property {string} period - Period analyzed (e.g., '7d', '30d')
 * @property {Object} evolutionMetrics - Metrics about the evolution system
 * @property {Object} biasAnalysis - Detected biases
 * @property {Object} effectivenessAnalysis - How well evolution is working
 * @property {string[]} recommendations - Suggested adjustments
 * @property {Object} [tuningActions] - Actions taken based on reflection
 */

class MetaReflection extends EventEmitter {
  constructor(options = {}) {
    super();

    const evolutionConfig = getConfig('evolution', {});

    this.options = {
      enabled: options.enabled !== undefined ? options.enabled : (evolutionConfig.enabled !== false),
      reflectionInterval: this._parseDuration(options.reflectionInterval || evolutionConfig.metaReflectionInterval || '7d'),
      minDataPoints: options.minDataPoints || 10,
      ...options,
    };

    // Dependencies (injected)
    this.genomeManager = null;
    this.dreamEngine = null;
    this.cognitiveJournal = null;
    this.curiosityEngine = null;
    this.feedbackManager = null;

    this._ensureDirectories();
  }

  /**
   * Parse duration string to milliseconds
   * @private
   */
  _parseDuration(duration) {
    if (typeof duration === 'number') return duration;

    const match = duration.match(/^(\d+)(h|d|w)$/);
    if (!match) return 7 * 24 * 60 * 60 * 1000; // Default 7 days

    const value = parseInt(match[1], 10);
    const unit = match[2];

    switch (unit) {
      case 'h': return value * 60 * 60 * 1000;
      case 'd': return value * 24 * 60 * 60 * 1000;
      case 'w': return value * 7 * 24 * 60 * 60 * 1000;
      default: return 7 * 24 * 60 * 60 * 1000;
    }
  }

  /**
   * Ensure storage directories exist
   * @private
   */
  _ensureDirectories() {
    try {
      if (!fs.existsSync(META_DIR)) {
        fs.mkdirSync(META_DIR, { recursive: true });
      }
    } catch (e) {
      console.error('[MetaReflection] Failed to create directories:', e.message);
    }
  }

  /**
   * Inject dependencies
   * @param {Object} deps
   */
  setDependencies(deps) {
    this.genomeManager = deps.genomeManager;
    this.dreamEngine = deps.dreamEngine;
    this.cognitiveJournal = deps.cognitiveJournal;
    this.curiosityEngine = deps.curiosityEngine;
    this.feedbackManager = deps.feedbackManager;
  }

  /**
   * Perform meta-reflection on the evolution system
   * @param {string} [period='7d'] - Period to analyze
   * @returns {Promise<MetaReflection>}
   */
  async reflect(period = '7d') {
    console.log(`[MetaReflection] Starting reflection for period: ${period}`);

    const reflection = {
      id: uuidv4(),
      timestamp: new Date().toISOString(),
      period,
      evolutionMetrics: {},
      biasAnalysis: {},
      effectivenessAnalysis: {},
      recommendations: [],
      tuningActions: null,
    };

    // Gather evolution metrics
    reflection.evolutionMetrics = await this._gatherEvolutionMetrics(period);

    // Analyze for biases
    reflection.biasAnalysis = await this._analyzeBiases(reflection.evolutionMetrics);

    // Analyze effectiveness
    reflection.effectivenessAnalysis = await this._analyzeEffectiveness(reflection.evolutionMetrics);

    // Generate recommendations
    reflection.recommendations = this._generateRecommendations(
      reflection.biasAnalysis,
      reflection.effectivenessAnalysis
    );

    // Persist reflection
    await this._persistReflection(reflection);

    this.emit('meta:reflection-completed', { reflection });
    console.log(`[MetaReflection] Completed with ${reflection.recommendations.length} recommendations`);

    return reflection;
  }

  /**
   * Gather metrics about evolution system performance
   * @private
   */
  async _gatherEvolutionMetrics(period) {
    const metrics = {
      genome: {},
      dreams: {},
      journal: {},
      curiosity: {},
      feedback: {},
    };

    const periodMs = this._parseDuration(period);
    const startTime = Date.now() - periodMs;

    // Genome metrics
    if (this.genomeManager) {
      const auditLog = this.genomeManager.getAuditLog(100) || [];
      const recentAudit = auditLog.filter(e =>
        new Date(e.timestamp).getTime() > startTime
      );

      metrics.genome = {
        generation: this.genomeManager.activeGenome?.generation || 0,
        mutationsApplied: recentAudit.filter(e => e.type === 'mutation_applied').length,
        rollbacks: recentAudit.filter(e => e.type === 'rollback').length,
        resets: recentAudit.filter(e => e.type === 'reset').length,
        traitChanges: recentAudit.filter(e => e.type === 'trait_change').length,
        behaviorChanges: recentAudit.filter(e => e.type === 'behavior_change').length,
      };
    }

    // Dream metrics
    if (this.dreamEngine) {
      const sessions = this.dreamEngine.getRecentSessions(50) || [];
      const recentSessions = sessions.filter(s =>
        new Date(s.startedAt).getTime() > startTime
      );

      metrics.dreams = {
        sessionsCount: recentSessions.length,
        totalDreams: recentSessions.reduce((sum, s) => sum + (s.dreams?.length || 0), 0),
        averageInsightSignificance: this._calculateAverageSignificance(recentSessions),
        dreamTypeDistribution: this._calculateDreamTypeDistribution(recentSessions),
        completedSessions: recentSessions.filter(s => s.status === 'completed').length,
        failedSessions: recentSessions.filter(s => s.status === 'failed').length,
      };
    }

    // Journal metrics
    if (this.cognitiveJournal) {
      const startDate = new Date(startTime).toISOString().split('T')[0];
      const entries = this.cognitiveJournal.getEntries(startDate) || [];

      metrics.journal = {
        entriesCount: entries.length,
        averageUserSignals: this._calculateAverageSignals(entries),
        categoryDistribution: this._calculateCategoryDistribution(entries),
        knowledgeGapsIdentified: this._countUniqueKnowledgeGaps(entries),
        growthOpportunitiesFound: this._countGrowthOpportunities(entries),
      };
    }

    // Curiosity metrics
    if (this.curiosityEngine) {
      const queue = this.curiosityEngine.getQueue() || [];
      const completed = this.curiosityEngine.getCompleted(100) || [];
      const recentCompleted = completed.filter(c =>
        new Date(c.completedAt).getTime() > startTime
      );

      metrics.curiosity = {
        queueSize: queue.length,
        pendingCount: queue.filter(c => c.status === 'pending').length,
        studyingCount: queue.filter(c => c.status === 'studying').length,
        completedInPeriod: recentCompleted.length,
        averageCompletionTime: this._calculateAverageCompletionTime(recentCompleted),
        topSources: this._calculateTopSources(queue),
      };
    }

    // Feedback metrics
    if (this.feedbackManager) {
      try {
        const analytics = this.feedbackManager.getAnalytics?.() || {};
        metrics.feedback = {
          positiveRatio: analytics.positiveRatio || 0,
          totalFeedback: analytics.total || 0,
          recentTrend: analytics.trend || 'stable',
        };
      } catch {
        metrics.feedback = { error: 'Unable to fetch feedback metrics' };
      }
    }

    return metrics;
  }

  /**
   * Analyze for biases in the evolution system
   * @private
   */
  async _analyzeBiases(metrics) {
    const biases = {
      recencyBias: null,
      knowledgeDecay: null,
      overCorrection: null,
      feedbackBias: null,
    };

    // Detect recency bias - are we over-indexing on recent data?
    biases.recencyBias = this.detectRecencyBias(metrics);

    // Detect knowledge decay - are we forgetting old lessons?
    biases.knowledgeDecay = this.detectKnowledgeDecay(metrics);

    // Detect over-correction - are mutations too aggressive?
    biases.overCorrection = this._detectOverCorrection(metrics);

    // Detect feedback bias - are we only learning from explicit feedback?
    biases.feedbackBias = this._detectFeedbackBias(metrics);

    return biases;
  }

  /**
   * Detect if system is over-indexing on recent data
   * @param {Object} metrics
   * @returns {Object}
   */
  detectRecencyBias(metrics) {
    const result = {
      detected: false,
      severity: 0,
      evidence: [],
    };

    // Check if dream sessions focus too much on recent memories
    if (metrics.dreams?.dreamTypeDistribution) {
      const replayWeight = metrics.dreams.dreamTypeDistribution.replay || 0;
      const integrationWeight = metrics.dreams.dreamTypeDistribution.integration || 0;

      // If replay dominates and integration is low, there might be recency bias
      if (replayWeight > 0.6 && integrationWeight < 0.1) {
        result.detected = true;
        result.severity = 0.6;
        result.evidence.push('Dreams heavily favor replay over integration');
      }
    }

    // Check curiosity queue for recency patterns
    if (metrics.curiosity?.topSources) {
      const recentSources = ['knowledge_gap', 'user_interest'];
      const historicalSources = ['dream_insight', 'nightmare_analysis'];

      const recentWeight = recentSources.reduce((sum, s) =>
        sum + (metrics.curiosity.topSources[s] || 0), 0
      );
      const historicalWeight = historicalSources.reduce((sum, s) =>
        sum + (metrics.curiosity.topSources[s] || 0), 0
      );

      if (recentWeight > historicalWeight * 3) {
        result.detected = true;
        result.severity = Math.max(result.severity, 0.5);
        result.evidence.push('Curiosity queue dominated by recent observations');
      }
    }

    return result;
  }

  /**
   * Detect if old lessons are being forgotten
   * @param {Object} metrics
   * @returns {Object}
   */
  detectKnowledgeDecay(metrics) {
    const result = {
      detected: false,
      severity: 0,
      evidence: [],
    };

    // Check for repeated knowledge gaps
    if (metrics.journal?.knowledgeGapsIdentified > 20) {
      result.detected = true;
      result.severity = 0.4;
      result.evidence.push(`High number of knowledge gaps (${metrics.journal.knowledgeGapsIdentified}) may indicate decay`);
    }

    // Check if same errors recur after being addressed
    if (metrics.genome?.rollbacks > 2) {
      result.detected = true;
      result.severity = Math.max(result.severity, 0.6);
      result.evidence.push('Multiple rollbacks suggest lessons not being retained');
    }

    // Check curiosity completion rate
    if (metrics.curiosity) {
      const totalCompleted = metrics.curiosity.completedInPeriod || 0;
      const queueSize = metrics.curiosity.queueSize || 1;
      const completionRate = totalCompleted / Math.max(queueSize, 1);

      if (completionRate < 0.1 && queueSize > 20) {
        result.detected = true;
        result.severity = Math.max(result.severity, 0.5);
        result.evidence.push('Low curiosity completion rate suggests incomplete learning');
      }
    }

    return result;
  }

  /**
   * Detect if mutations are too aggressive
   * @private
   */
  _detectOverCorrection(metrics) {
    const result = {
      detected: false,
      severity: 0,
      evidence: [],
    };

    if (metrics.genome) {
      const { mutationsApplied, rollbacks, resets } = metrics.genome;

      // If many rollbacks relative to mutations
      if (mutationsApplied > 0 && rollbacks / mutationsApplied > 0.3) {
        result.detected = true;
        result.severity = 0.7;
        result.evidence.push(`High rollback rate (${((rollbacks / mutationsApplied) * 100).toFixed(0)}%)`);
      }

      // If any resets occurred
      if (resets > 0) {
        result.detected = true;
        result.severity = Math.max(result.severity, 0.5);
        result.evidence.push(`${resets} reset(s) to base genome required`);
      }
    }

    return result;
  }

  /**
   * Detect if learning only from explicit feedback
   * @private
   */
  _detectFeedbackBias(metrics) {
    const result = {
      detected: false,
      severity: 0,
      evidence: [],
    };

    // Check if journal detects signals vs explicit feedback
    if (metrics.journal?.averageUserSignals) {
      const signals = metrics.journal.averageUserSignals;
      const signalStrength = Object.values(signals).reduce((s, v) => s + v, 0);

      if (signalStrength < 0.5 && metrics.feedback?.totalFeedback < 5) {
        result.detected = true;
        result.severity = 0.4;
        result.evidence.push('Low signal detection and minimal explicit feedback');
      }
    }

    // Check dream nightmare frequency
    if (metrics.dreams?.dreamTypeDistribution) {
      const nightmareRatio = metrics.dreams.dreamTypeDistribution.nightmare || 0;
      if (nightmareRatio < 0.1 && metrics.feedback?.positiveRatio < 0.7) {
        result.detected = true;
        result.severity = Math.max(result.severity, 0.5);
        result.evidence.push('Few nightmare dreams despite mixed feedback');
      }
    }

    return result;
  }

  /**
   * Analyze overall effectiveness
   * @private
   */
  async _analyzeEffectiveness(metrics) {
    const effectiveness = {
      overall: 0,
      components: {},
      improvements: [],
      concerns: [],
    };

    // Score each component
    const scores = [];

    // Genome evolution effectiveness
    if (metrics.genome) {
      const { mutationsApplied, rollbacks } = metrics.genome;
      const genomeScore = mutationsApplied > 0
        ? Math.max(0, 1 - (rollbacks / mutationsApplied))
        : 0.5;
      effectiveness.components.genome = genomeScore;
      scores.push(genomeScore);

      if (genomeScore > 0.7) {
        effectiveness.improvements.push('Stable genome evolution with low rollback rate');
      } else if (genomeScore < 0.4) {
        effectiveness.concerns.push('High rollback rate suggests unstable mutations');
      }
    }

    // Dream effectiveness
    if (metrics.dreams) {
      const { completedSessions, failedSessions, averageInsightSignificance } = metrics.dreams;
      const total = (completedSessions || 0) + (failedSessions || 0);
      const dreamScore = total > 0
        ? ((completedSessions / total) * 0.5) + ((averageInsightSignificance || 0) * 0.5)
        : 0.5;
      effectiveness.components.dreams = dreamScore;
      scores.push(dreamScore);

      if (dreamScore > 0.7) {
        effectiveness.improvements.push('Dreams generating valuable insights');
      } else if (dreamScore < 0.4) {
        effectiveness.concerns.push('Dream sessions not producing actionable insights');
      }
    }

    // Journal effectiveness
    if (metrics.journal) {
      const signalAvg = metrics.journal.averageUserSignals || {};
      const satisfactionTrend = (signalAvg.satisfaction || 0) - (signalAvg.frustration || 0);
      const journalScore = 0.5 + (satisfactionTrend * 0.5);
      effectiveness.components.journal = Math.max(0, Math.min(1, journalScore));
      scores.push(effectiveness.components.journal);

      if (signalAvg.satisfaction > 0.6) {
        effectiveness.improvements.push('User satisfaction signals trending positive');
      }
      if (signalAvg.frustration > 0.5) {
        effectiveness.concerns.push('Elevated user frustration detected');
      }
    }

    // Curiosity effectiveness
    if (metrics.curiosity) {
      const { completedInPeriod, queueSize } = metrics.curiosity;
      const curiosityScore = queueSize > 0
        ? Math.min(1, completedInPeriod / Math.max(queueSize, 1) * 2)
        : 0.5;
      effectiveness.components.curiosity = curiosityScore;
      scores.push(curiosityScore);

      if (completedInPeriod > 5) {
        effectiveness.improvements.push(`Completed ${completedInPeriod} curiosity studies`);
      }
      if (queueSize > 30) {
        effectiveness.concerns.push('Large curiosity queue may need prioritization');
      }
    }

    // Calculate overall score
    effectiveness.overall = scores.length > 0
      ? scores.reduce((s, v) => s + v, 0) / scores.length
      : 0.5;

    return effectiveness;
  }

  /**
   * Generate recommendations based on analysis
   * @private
   */
  _generateRecommendations(biasAnalysis, effectivenessAnalysis) {
    const recommendations = [];

    // Address detected biases
    if (biasAnalysis.recencyBias?.detected) {
      recommendations.push({
        area: 'recency_bias',
        priority: 'high',
        action: 'Increase integration dream frequency to connect older knowledge',
        rationale: biasAnalysis.recencyBias.evidence.join('; '),
      });
    }

    if (biasAnalysis.knowledgeDecay?.detected) {
      recommendations.push({
        area: 'knowledge_decay',
        priority: 'high',
        action: 'Schedule periodic knowledge review sessions',
        rationale: biasAnalysis.knowledgeDecay.evidence.join('; '),
      });
    }

    if (biasAnalysis.overCorrection?.detected) {
      recommendations.push({
        area: 'mutation_rate',
        priority: 'high',
        action: 'Reduce mutation rate and increase testing threshold',
        rationale: biasAnalysis.overCorrection.evidence.join('; '),
      });
    }

    if (biasAnalysis.feedbackBias?.detected) {
      recommendations.push({
        area: 'feedback_sources',
        priority: 'medium',
        action: 'Enhance implicit signal detection in journal analysis',
        rationale: biasAnalysis.feedbackBias.evidence.join('; '),
      });
    }

    // Address effectiveness concerns
    for (const concern of effectivenessAnalysis.concerns || []) {
      recommendations.push({
        area: 'effectiveness',
        priority: 'medium',
        action: `Investigate: ${concern}`,
        rationale: 'Identified as effectiveness concern',
      });
    }

    // If overall effectiveness is low
    if (effectivenessAnalysis.overall < 0.4) {
      recommendations.push({
        area: 'system_review',
        priority: 'critical',
        action: 'Comprehensive review of evolution system parameters needed',
        rationale: `Overall effectiveness score: ${(effectivenessAnalysis.overall * 100).toFixed(0)}%`,
      });
    }

    return recommendations;
  }

  /**
   * Tune evolution engine based on insights
   * @param {MetaReflection} reflection
   * @returns {Promise<Object>}
   */
  async tuneEvolutionEngine(reflection) {
    const tuningActions = {
      timestamp: new Date().toISOString(),
      reflectionId: reflection.id,
      actions: [],
    };

    if (!this.genomeManager) {
      return tuningActions;
    }

    const currentConfig = getConfig('evolution', {});

    // Apply recommendations
    for (const rec of reflection.recommendations) {
      switch (rec.area) {
        case 'mutation_rate':
          if (rec.priority === 'high') {
            const newRate = Math.max(0.05, (currentConfig.mutationRate || 0.1) * 0.7);
            tuningActions.actions.push({
              type: 'config_change',
              target: 'evolution.mutationRate',
              oldValue: currentConfig.mutationRate,
              newValue: newRate,
            });
          }
          break;

        case 'recency_bias':
          // Adjust dream type weights - would require dream engine modification
          tuningActions.actions.push({
            type: 'recommendation',
            target: 'dream_engine',
            recommendation: 'Increase integration dream weight',
          });
          break;

        case 'knowledge_decay':
          tuningActions.actions.push({
            type: 'recommendation',
            target: 'curiosity_engine',
            recommendation: 'Add periodic review topics to queue',
          });
          break;
      }
    }

    // Log tuning history
    await this._logTuning(tuningActions);

    reflection.tuningActions = tuningActions;

    return tuningActions;
  }

  // Helper methods for metrics calculation

  _calculateAverageSignificance(sessions) {
    let total = 0;
    let count = 0;

    for (const session of sessions) {
      for (const dream of session.dreams || []) {
        total += dream.significance || 0;
        count++;
      }
    }

    return count > 0 ? total / count : 0;
  }

  _calculateDreamTypeDistribution(sessions) {
    const counts = { replay: 0, nightmare: 0, possibility: 0, integration: 0 };
    let total = 0;

    for (const session of sessions) {
      for (const dream of session.dreams || []) {
        if (counts[dream.type] !== undefined) {
          counts[dream.type]++;
          total++;
        }
      }
    }

    if (total === 0) return counts;

    return Object.fromEntries(
      Object.entries(counts).map(([k, v]) => [k, v / total])
    );
  }

  _calculateAverageSignals(entries) {
    const totals = { frustration: 0, satisfaction: 0, confusion: 0, impatience: 0, engagement: 0 };
    let count = 0;

    for (const entry of entries) {
      if (entry.userSignals) {
        for (const key of Object.keys(totals)) {
          totals[key] += entry.userSignals[key] || 0;
        }
        count++;
      }
    }

    if (count === 0) return totals;

    return Object.fromEntries(
      Object.entries(totals).map(([k, v]) => [k, v / count])
    );
  }

  _calculateCategoryDistribution(entries) {
    const counts = {};
    for (const entry of entries) {
      counts[entry.category] = (counts[entry.category] || 0) + 1;
    }
    return counts;
  }

  _countUniqueKnowledgeGaps(entries) {
    const gaps = new Set();
    for (const entry of entries) {
      for (const gap of entry.knowledgeGaps || []) {
        gaps.add(gap.toLowerCase());
      }
    }
    return gaps.size;
  }

  _countGrowthOpportunities(entries) {
    let count = 0;
    for (const entry of entries) {
      count += (entry.growthOpportunities || []).length;
    }
    return count;
  }

  _calculateAverageCompletionTime(completed) {
    if (completed.length === 0) return 0;

    let totalTime = 0;
    let count = 0;

    for (const c of completed) {
      if (c.createdAt && c.completedAt) {
        const start = new Date(c.createdAt).getTime();
        const end = new Date(c.completedAt).getTime();
        totalTime += end - start;
        count++;
      }
    }

    return count > 0 ? totalTime / count : 0;
  }

  _calculateTopSources(queue) {
    const counts = {};
    for (const c of queue) {
      counts[c.source] = (counts[c.source] || 0) + 1;
    }
    return counts;
  }

  /**
   * Persist reflection to disk
   * @private
   */
  async _persistReflection(reflection) {
    try {
      const line = JSON.stringify(reflection) + '\n';
      fs.appendFileSync(REFLECTIONS_FILE, line, 'utf-8');
    } catch (e) {
      console.error('[MetaReflection] Failed to persist reflection:', e.message);
    }
  }

  /**
   * Log tuning action
   * @private
   */
  async _logTuning(tuningActions) {
    try {
      const line = JSON.stringify(tuningActions) + '\n';
      fs.appendFileSync(TUNING_FILE, line, 'utf-8');
    } catch (e) {
      console.error('[MetaReflection] Failed to log tuning:', e.message);
    }
  }

  /**
   * Get recent meta-reflections
   * @param {number} [limit=10]
   * @returns {MetaReflection[]}
   */
  getReflections(limit = 10) {
    try {
      if (!fs.existsSync(REFLECTIONS_FILE)) {
        return [];
      }

      const content = fs.readFileSync(REFLECTIONS_FILE, 'utf-8');
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
      console.error('[MetaReflection] Failed to read reflections:', e.message);
      return [];
    }
  }

  /**
   * Get status
   * @returns {Object}
   */
  getStatus() {
    const reflections = this.getReflections(5);

    return {
      enabled: this.options.enabled,
      reflectionInterval: this.options.reflectionInterval,
      lastReflection: reflections[0]?.timestamp || null,
      totalReflections: this.getReflections(1000).length,
      recentRecommendations: reflections[0]?.recommendations?.length || 0,
    };
  }
}

// Singleton instance
let instance = null;

/**
 * Get the meta-reflection instance
 * @param {Object} [options]
 * @returns {MetaReflection}
 */
export function getMetaReflection(options = {}) {
  if (!instance) {
    instance = new MetaReflection(options);
  }
  return instance;
}

export { MetaReflection, META_DIR };
export default getMetaReflection;
