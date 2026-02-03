/**
 * Input Processing Module
 * 
 * Unified input handling with:
 * - Sensitive data redaction
 * - Fuzzy matching (typo tolerance)
 * - Multi-stage parsing (LLM for context, code for orchestration)
 * - Conversation momentum (pattern learning & prediction)
 * 
 * @module lib/input
 */

export * from './redact.js';
export * from './fuzzy.js';
export * from './multiParser.js';
export * from './momentum.js';

// Re-export key classes and functions for convenience
import { redact, RedactionPatterns } from './redact.js';
import { fuzzyMatch, fuzzyMatchCommand, typoAwareSimilarity, detectTypo, suggestCorrections } from './fuzzy.js';
import { MultiParser, createParser, PARSE_STAGES, ENTITY_TYPES } from './multiParser.js';
import { MomentumTracker, createMomentumTracker, getMomentumTracker, ACTION_TYPES } from './momentum.js';

/**
 * Smart Input Processor
 * 
 * Combines all input processing capabilities into a single interface.
 * This is the main entry point for processing user input.
 */
export class SmartInputProcessor {
  constructor(options = {}) {
    this.parser = createParser(options.parser || {});
    this.momentum = options.momentum || getMomentumTracker();
    this.enableMomentum = options.enableMomentum !== false;
    this.enableRedaction = options.enableRedaction !== false;
    this.enableSuggestions = options.enableSuggestions !== false;
  }

  /**
   * Process user input through the full pipeline
   * @param {string} input - Raw user input
   * @param {Object} context - Additional context
   * @returns {Promise<ProcessedInput>}
   */
  async process(input, context = {}) {
    const startTime = Date.now();
    
    // Step 1: Redact sensitive data (if enabled)
    let processedInput = input;
    let redactions = [];
    
    if (this.enableRedaction) {
      const redactionResult = redact(input);
      processedInput = redactionResult.redacted;
      redactions = redactionResult.matches || [];
    }
    
    // Step 2: Multi-stage parsing
    const parseResult = await this.parser.parse(processedInput, context);
    
    // Step 3: Get momentum predictions (if enabled)
    let predictions = [];
    let suggestions = [];
    
    if (this.enableMomentum) {
      predictions = this.momentum.predict();
      if (this.enableSuggestions && predictions.length > 0) {
        suggestions = this.momentum.getSuggestions(context);
      }
    }
    
    // Step 4: Combine results
    const result = {
      original: input,
      processed: processedInput,
      redactions,
      parse: parseResult,
      predictions,
      suggestions,
      processingTimeMs: Date.now() - startTime,
    };
    
    return result;
  }

  /**
   * Record an action for momentum tracking
   */
  recordAction(action, context = {}) {
    if (this.enableMomentum) {
      return this.momentum.record(action, context);
    }
  }

  /**
   * Get current predictions
   */
  getPredictions() {
    if (this.enableMomentum) {
      return this.momentum.getSuggestions();
    }
    return [];
  }

  /**
   * Update command registry for fuzzy matching
   */
  setCommandRegistry(registry) {
    this.parser.setCommandRegistry(registry);
  }

  /**
   * Update known skill names for fuzzy matching
   */
  setSkillNames(names) {
    this.parser.setSkillNames(names);
  }

  /**
   * Get momentum insights
   */
  getMomentumInsights() {
    if (this.enableMomentum) {
      return this.momentum.getInsights();
    }
    return null;
  }
}

/**
 * Create a smart input processor
 */
export function createSmartInputProcessor(options = {}) {
  return new SmartInputProcessor(options);
}

// Default exports
export default {
  // Main processor
  SmartInputProcessor,
  createSmartInputProcessor,
  
  // Redaction
  redact,
  RedactionPatterns,
  
  // Fuzzy matching
  fuzzyMatch,
  fuzzyMatchCommand,
  typoAwareSimilarity,
  detectTypo,
  suggestCorrections,
  
  // Multi-parser
  MultiParser,
  createParser,
  PARSE_STAGES,
  ENTITY_TYPES,
  
  // Momentum
  MomentumTracker,
  createMomentumTracker,
  getMomentumTracker,
  ACTION_TYPES,
};
