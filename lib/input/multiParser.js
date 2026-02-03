/**
 * Multi-Stage Parser
 * 
 * A pipeline approach to input parsing:
 * 1. NORMALIZE: Clean and normalize input
 * 2. QUICK_MATCH: Fast code-based pattern matching (commands, shortcuts)
 * 3. ENTITY_EXTRACT: Extract known entities (dates, numbers, durations)
 * 4. FUZZY_RESOLVE: Resolve typos and ambiguous references
 * 5. LLM_CONTEXT: Use LLM only for complex intent/context understanding
 * 
 * Philosophy: Let code handle what code does well (pattern matching, 
 * entity extraction), use LLM only where human-like understanding is needed.
 * 
 * @module lib/input/multiParser
 */

import { fuzzyMatch, fuzzyMatchCommand, detectTypo, typoAwareSimilarity } from './fuzzy.js';
import { getDefaultModel, chatCompletion } from '../modelRegistry.js';

/**
 * Parsing pipeline stages
 */
export const PARSE_STAGES = {
  NORMALIZE: 'normalize',
  QUICK_MATCH: 'quick_match',
  ENTITY_EXTRACT: 'entity_extract',
  FUZZY_RESOLVE: 'fuzzy_resolve',
  LLM_CONTEXT: 'llm_context',
};

/**
 * Entity types that can be extracted
 */
export const ENTITY_TYPES = {
  NUMBER: 'number',
  DURATION: 'duration',
  DATE: 'date',
  TIME: 'time',
  EMAIL: 'email',
  URL: 'url',
  MENTION: 'mention',
  HASHTAG: 'hashtag',
  CURRENCY: 'currency',
  PERCENTAGE: 'percentage',
  SKILL_NAME: 'skill_name',
  COMMAND: 'command',
};

/**
 * Parse result from the multi-stage parser
 */
export class MultiParseResult {
  constructor(input) {
    this.originalInput = input;
    this.normalizedInput = input;
    this.stages = [];
    this.entities = [];
    this.command = null;
    this.intent = null;
    this.confidence = 0;
    this.suggestions = [];
    this.needsLLM = false;
    this.llmContext = null;
    this.processingTimeMs = 0;
  }

  addStage(stage, result, timeMs) {
    this.stages.push({ stage, result, timeMs, timestamp: Date.now() });
  }

  toJSON() {
    return {
      originalInput: this.originalInput,
      normalizedInput: this.normalizedInput,
      stages: this.stages,
      entities: this.entities,
      command: this.command,
      intent: this.intent,
      confidence: this.confidence,
      suggestions: this.suggestions,
      needsLLM: this.needsLLM,
      llmContext: this.llmContext,
      processingTimeMs: this.processingTimeMs,
    };
  }
}

/**
 * Entity extraction patterns
 */
const ENTITY_PATTERNS = {
  // Numbers with optional units
  number: /\b(\d+(?:\.\d+)?)\s*(ml|l|liters?|oz|cups?|glasses?|kg|g|lbs?|pounds?|hrs?|hours?|mins?|minutes?|secs?|seconds?|days?|weeks?|months?|years?|km|mi|miles?|meters?|m|ft|feet|inches?|in|cal|calories?|kcal|steps?|reps?|sets?)?\b/gi,
  
  // Duration patterns: "2 hours", "30min", "1h30m"
  duration: /\b(\d+)\s*(h|hr|hrs|hour|hours|m|min|mins|minute|minutes|s|sec|secs|second|seconds|d|day|days|w|wk|wks|week|weeks)\b|\b(\d+)[hH](\d+)?[mM]?\b/gi,
  
  // Date patterns
  date: /\b(today|tomorrow|yesterday|next\s+(?:mon|tue|wed|thu|fri|sat|sun)\w*|last\s+(?:mon|tue|wed|thu|fri|sat|sun)\w*|\d{1,2}[-\/]\d{1,2}(?:[-\/]\d{2,4})?|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\s+\d{1,2}(?:st|nd|rd|th)?(?:\s*,?\s*\d{4})?)\b/gi,
  
  // Time patterns
  time: /\b(\d{1,2}:\d{2}(?::\d{2})?(?:\s*[ap]m)?|\d{1,2}\s*[ap]m|noon|midnight|morning|afternoon|evening|night)\b/gi,
  
  // Email
  email: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
  
  // URL
  url: /https?:\/\/[^\s<>\"{}|\\^`\[\]]+/gi,
  
  // @mentions
  mention: /@[\w-]+/g,
  
  // #hashtags
  hashtag: /#[\w-]+/g,
  
  // Currency
  currency: /\$\d+(?:\.\d{2})?|\d+(?:\.\d{2})?\s*(?:dollars?|usd|eur|euros?|gbp|pounds?)/gi,
  
  // Percentage
  percentage: /\b\d+(?:\.\d+)?%/g,
};

/**
 * Common input normalizations
 */
const NORMALIZATIONS = [
  // Normalize whitespace
  { pattern: /\s+/g, replacement: ' ' },
  // Normalize quotes
  { pattern: /[""]/g, replacement: '"' },
  { pattern: /['']/g, replacement: "'" },
  // Normalize dashes
  { pattern: /[–—]/g, replacement: '-' },
  // Trim
  { pattern: /^\s+|\s+$/g, replacement: '' },
];

/**
 * Common abbreviation expansions
 */
const ABBREVIATIONS = {
  'tmrw': 'tomorrow',
  'yday': 'yesterday',
  'tmr': 'tomorrow',
  'pls': 'please',
  'plz': 'please',
  'thx': 'thanks',
  'ty': 'thank you',
  'u': 'you',
  'ur': 'your',
  'r': 'are',
  'b4': 'before',
  'bc': 'because',
  'w/': 'with',
  'w/o': 'without',
  'btw': 'by the way',
  'min': 'minute',
  'mins': 'minutes',
  'hr': 'hour',
  'hrs': 'hours',
  'sec': 'second',
  'secs': 'seconds',
};

/**
 * Multi-Stage Parser
 */
export class MultiParser {
  constructor(options = {}) {
    this.commandRegistry = options.commandRegistry || new Map();
    this.skillNames = options.skillNames || [];
    this.model = options.model || null;
    this.enableLLM = options.enableLLM !== false;
    this.llmThreshold = options.llmThreshold || 0.6; // Below this confidence, use LLM
  }

  /**
   * Update the parser's known commands
   */
  setCommandRegistry(registry) {
    this.commandRegistry = registry;
  }

  /**
   * Update the parser's known skill names
   */
  setSkillNames(names) {
    this.skillNames = names;
  }

  /**
   * Main parse method - runs the full pipeline
   * @param {string} input - User input
   * @param {Object} context - Additional context (history, user, etc.)
   * @returns {Promise<MultiParseResult>}
   */
  async parse(input, context = {}) {
    const startTime = Date.now();
    const result = new MultiParseResult(input);

    // Stage 1: Normalize
    const normalized = this.normalize(input);
    result.normalizedInput = normalized;
    result.addStage(PARSE_STAGES.NORMALIZE, { normalized }, Date.now() - startTime);

    // Stage 2: Quick Match (commands, patterns)
    const quickMatch = this.quickMatch(normalized);
    result.addStage(PARSE_STAGES.QUICK_MATCH, quickMatch, Date.now() - startTime);
    
    if (quickMatch.command) {
      result.command = quickMatch.command;
      result.confidence = quickMatch.confidence;
      if (quickMatch.confidence >= 0.9) {
        // High confidence - skip to entity extraction, no LLM needed
        result.needsLLM = false;
      }
    }

    // Stage 3: Entity Extraction
    const entities = this.extractEntities(normalized);
    result.entities = entities;
    result.addStage(PARSE_STAGES.ENTITY_EXTRACT, { entities }, Date.now() - startTime);

    // Stage 4: Fuzzy Resolution
    const fuzzyResult = this.fuzzyResolve(normalized, context);
    result.addStage(PARSE_STAGES.FUZZY_RESOLVE, fuzzyResult, Date.now() - startTime);
    
    if (fuzzyResult.suggestions.length > 0) {
      result.suggestions = fuzzyResult.suggestions;
    }
    
    if (fuzzyResult.resolvedCommand && !result.command) {
      result.command = fuzzyResult.resolvedCommand;
      result.confidence = fuzzyResult.confidence;
    }

    // Stage 5: LLM Context (only if needed)
    if (this.enableLLM && (result.confidence < this.llmThreshold || !result.command)) {
      result.needsLLM = true;
      const llmResult = await this.llmContext(normalized, result, context);
      result.llmContext = llmResult;
      result.addStage(PARSE_STAGES.LLM_CONTEXT, llmResult, Date.now() - startTime);
      
      if (llmResult.intent) {
        result.intent = llmResult.intent;
        result.confidence = Math.max(result.confidence, llmResult.confidence || 0);
      }
    }

    result.processingTimeMs = Date.now() - startTime;
    return result;
  }

  /**
   * Stage 1: Normalize input
   */
  normalize(input) {
    if (!input) return '';
    
    let normalized = input;
    
    // Apply normalizations
    for (const { pattern, replacement } of NORMALIZATIONS) {
      normalized = normalized.replace(pattern, replacement);
    }
    
    // Expand abbreviations (word boundaries)
    for (const [abbrev, expansion] of Object.entries(ABBREVIATIONS)) {
      const pattern = new RegExp(`\\b${abbrev}\\b`, 'gi');
      normalized = normalized.replace(pattern, expansion);
    }
    
    return normalized;
  }

  /**
   * Stage 2: Quick pattern matching
   */
  quickMatch(input) {
    const result = {
      command: null,
      confidence: 0,
      matchType: null,
    };

    // Check for slash commands
    const slashMatch = input.match(/^\/(\w+)(?:\s+(.*))?$/);
    if (slashMatch) {
      const [, cmdName, args] = slashMatch;
      
      // Exact match first
      if (this.commandRegistry.has(cmdName)) {
        result.command = {
          key: cmdName,
          definition: this.commandRegistry.get(cmdName),
          args: args?.trim() || '',
        };
        result.confidence = 1.0;
        result.matchType = 'exact_slash';
        return result;
      }
      
      // Fuzzy match for typos in slash commands
      const fuzzyCmd = fuzzyMatchCommand(cmdName, this.commandRegistry);
      if (fuzzyCmd) {
        result.command = {
          key: fuzzyCmd.command.key,
          definition: fuzzyCmd.command,
          args: args?.trim() || '',
          originalInput: cmdName,
          correctedTo: fuzzyCmd.matchedAlias,
        };
        result.confidence = fuzzyCmd.similarity;
        result.matchType = fuzzyCmd.wasExact ? 'exact_alias' : 'fuzzy_slash';
        return result;
      }
    }

    // Check for intent patterns in command definitions
    for (const [key, cmd] of this.commandRegistry) {
      if (cmd.patterns) {
        for (const pattern of cmd.patterns) {
          if (pattern.test(input)) {
            result.command = {
              key,
              definition: cmd,
              args: input,
            };
            result.confidence = 0.85;
            result.matchType = 'pattern_match';
            return result;
          }
        }
      }
      
      // Check intentExamples with fuzzy matching
      if (cmd.intentExamples) {
        for (const example of cmd.intentExamples) {
          const sim = typoAwareSimilarity(input.toLowerCase(), example.toLowerCase());
          if (sim > 0.8 && sim > result.confidence) {
            result.command = {
              key,
              definition: cmd,
              args: input,
            };
            result.confidence = sim;
            result.matchType = 'intent_example';
          }
        }
      }
    }

    return result;
  }

  /**
   * Stage 3: Extract entities from input
   */
  extractEntities(input) {
    const entities = [];

    for (const [type, pattern] of Object.entries(ENTITY_PATTERNS)) {
      // Reset regex state
      pattern.lastIndex = 0;
      
      let match;
      while ((match = pattern.exec(input)) !== null) {
        entities.push({
          type,
          value: match[0],
          groups: match.slice(1).filter(Boolean),
          start: match.index,
          end: match.index + match[0].length,
        });
      }
    }

    // Sort by position
    entities.sort((a, b) => a.start - b.start);

    // Parse duration entities into milliseconds
    for (const entity of entities) {
      if (entity.type === 'duration') {
        entity.milliseconds = this.parseDuration(entity.value);
      }
    }

    return entities;
  }

  /**
   * Parse duration string to milliseconds
   */
  parseDuration(durationStr) {
    const units = {
      s: 1000, sec: 1000, secs: 1000, second: 1000, seconds: 1000,
      m: 60000, min: 60000, mins: 60000, minute: 60000, minutes: 60000,
      h: 3600000, hr: 3600000, hrs: 3600000, hour: 3600000, hours: 3600000,
      d: 86400000, day: 86400000, days: 86400000,
      w: 604800000, wk: 604800000, wks: 604800000, week: 604800000, weeks: 604800000,
    };

    let totalMs = 0;
    
    // Match "2h30m" style
    const compoundMatch = durationStr.match(/(\d+)[hH](\d+)?[mM]?/);
    if (compoundMatch) {
      totalMs += parseInt(compoundMatch[1]) * 3600000;
      if (compoundMatch[2]) {
        totalMs += parseInt(compoundMatch[2]) * 60000;
      }
      return totalMs;
    }

    // Match "30 minutes" style
    const simpleMatch = durationStr.match(/(\d+)\s*([a-z]+)/i);
    if (simpleMatch) {
      const num = parseInt(simpleMatch[1]);
      const unit = simpleMatch[2].toLowerCase();
      if (units[unit]) {
        return num * units[unit];
      }
    }

    return 0;
  }

  /**
   * Stage 4: Fuzzy resolution of ambiguous terms
   */
  fuzzyResolve(input, context = {}) {
    const result = {
      suggestions: [],
      resolvedCommand: null,
      confidence: 0,
    };

    // Check if input looks like a typo'd skill name
    if (this.skillNames.length > 0) {
      const typoCheck = detectTypo(input, this.skillNames);
      if (typoCheck.isTypo) {
        result.suggestions.push({
          type: 'skill_typo',
          original: input,
          suggested: typoCheck.bestMatch,
          confidence: typoCheck.similarity,
          message: `Did you mean "${typoCheck.bestMatch}"?`,
        });
      }
    }

    // Extract words and check each for potential typos in command registry
    const words = input.split(/\s+/);
    const commandNames = Array.from(this.commandRegistry.keys());
    
    for (const word of words) {
      if (word.startsWith('/')) continue; // Already handled
      
      const typoCheck = detectTypo(word, commandNames);
      if (typoCheck.isTypo && typoCheck.similarity > 0.7) {
        result.suggestions.push({
          type: 'command_typo',
          original: word,
          suggested: typoCheck.bestMatch,
          confidence: typoCheck.similarity,
          message: `Did you mean "/${typoCheck.bestMatch}"?`,
        });
        
        // Set as resolved command if no other command found
        if (!result.resolvedCommand && typoCheck.similarity > result.confidence) {
          const cmd = this.commandRegistry.get(typoCheck.bestMatch);
          if (cmd) {
            result.resolvedCommand = {
              key: typoCheck.bestMatch,
              definition: cmd,
              args: input.replace(word, typoCheck.bestMatch),
              wasCorrected: true,
            };
            result.confidence = typoCheck.similarity * 0.9; // Slight penalty for correction
          }
        }
      }
    }

    return result;
  }

  /**
   * Stage 5: LLM context understanding (only for complex cases)
   */
  async llmContext(input, parseResult, context = {}) {
    if (!this.model && !getDefaultModel) {
      return { error: 'No LLM model available' };
    }

    const model = this.model || getDefaultModel();
    
    // Build a focused prompt - we're not asking LLM to do everything,
    // just to understand context and intent when code-based parsing wasn't enough
    const prompt = `Analyze this user input and determine the intent. The input has already been processed for commands and entities.

User input: "${input}"

Already extracted:
- Entities: ${JSON.stringify(parseResult.entities.map(e => ({ type: e.type, value: e.value })))}
- Possible command: ${parseResult.command?.key || 'none detected'}
- Confidence so far: ${(parseResult.confidence * 100).toFixed(0)}%

Context:
- Known skills: ${this.skillNames.slice(0, 10).join(', ')}${this.skillNames.length > 10 ? '...' : ''}
- Recent history: ${context.recentMessages?.slice(0, 3).map(m => m.content?.substring(0, 50)).join(' | ') || 'none'}

What is the user trying to do? Respond with JSON only:
{
  "intent": "track|query|command|conversation|unclear",
  "intentDetails": "brief description",
  "confidence": 0.0-1.0,
  "suggestedAction": "what the system should do",
  "missingInfo": ["any info needed from user"] or null
}`;

    try {
      const response = await chatCompletion(
        model,
        [
          { role: 'system', content: 'You are an intent analyzer. Output only valid JSON.' },
          { role: 'user', content: prompt },
        ],
        { temperature: 0.3, max_tokens: 200 }
      );

      // Parse JSON response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      
      return { error: 'Could not parse LLM response', raw: response };
    } catch (error) {
      return { error: error.message };
    }
  }
}

/**
 * Create a pre-configured parser instance
 */
export function createParser(options = {}) {
  return new MultiParser(options);
}

export default {
  MultiParser,
  MultiParseResult,
  createParser,
  PARSE_STAGES,
  ENTITY_TYPES,
};
