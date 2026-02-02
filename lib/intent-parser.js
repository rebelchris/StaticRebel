/**
 * Enhanced Intent Parser
 * Uses LLM for rich intent classification and skill detection
 *
 * Flow:
 * 1. Classify intent type (tracking, question, command, general_chat)
 * 2. For tracking: extract skill type and value
 * 3. Check if skill exists or suggest auto-creation
 * 4. Return structured result with debug info
 */

import { getDefaultModel, chatCompletion } from './modelRegistry.js';
import { getSkillManager } from './skills/skill-manager.js';
import { getAutoSkillCreator } from './skills/auto-skill-creator.js';
import {
  parseInput as nlpParseInput,
  extractSkill,
  extractNumbers,
  detectIntent as nlpDetectIntent,
  isTrackingIntent,
  SKILL_DEFAULTS
} from './skills/nlp-parser.js';

/**
 * Intent types that the parser can detect
 */
export const INTENT_TYPES = {
  TRACKING: 'TRACKING',      // "I had 2 glasses water", "logged 500ml water"
  QUESTION: 'QUESTION',      // "How big is the moon?", "What's my water today?"
  COMMAND: 'COMMAND',        // "list skills", "show my progress"
  GENERAL_CHAT: 'GENERAL_CHAT',   // "Hi", "Thanks", "How are you?"
  UNKNOWN: 'UNKNOWN'
};

/**
 * Main intent parsing result structure
 */
export class IntentParseResult {
  constructor() {
    this.intentType = INTENT_TYPES.UNKNOWN;
    this.confidence = 0;
    this.skill = null;        // { id, name, exists, ... }
    this.value = null;        // { amount, unit, note }
    this.action = null;       // For commands: action name
    this.rawInput = '';
    this.suggestedResponse = null;
    this.autoCreateSkill = null; // { suggestion, confidence } if skill should be created
    this.debug = {
      rawClassification: null,
      nlpAnalysis: null,
      skillCheck: null,
      processingSteps: []
    };
  }

  toJSON() {
    return {
      intentType: this.intentType,
      confidence: this.confidence,
      skill: this.skill,
      value: this.value,
      action: this.action,
      suggestedResponse: this.suggestedResponse,
      autoCreateSkill: this.autoCreateSkill,
      debug: this.debug
    };
  }
}

/**
 * Enhanced Intent Parser
 */
export class IntentParser {
  constructor(options = {}) {
    this.model = options.model || getDefaultModel();
    this.skillManager = null;
    this.autoSkillCreator = null;
    this.initialized = false;
  }

  async init() {
    if (this.initialized) return;
    try {
      this.skillManager = await getSkillManager();
      this.autoSkillCreator = await getAutoSkillCreator();
      this.initialized = true;
    } catch (error) {
      console.error('[IntentParser] Init failed:', error.message);
      // Continue without full initialization
    }
  }

  /**
   * Parse user input to extract intent
   * @param {string} input - User input
   * @param {Object} options - Parsing options
   * @returns {IntentParseResult} Parsed intent result
   */
  async parse(input, options = {}) {
    const startTime = Date.now();
    const result = new IntentParseResult();
    result.rawInput = input;

    // Step 1: Fast NLP analysis (pattern-based)
    const nlpResult = this.fastNLPAnalysis(input);
    result.debug.nlpAnalysis = nlpResult;
    result.debug.processingSteps.push({
      step: 'nlp_analysis',
      duration: Date.now() - startTime
    });

    // Step 2: LLM classification
    const llmResult = await this.classifyWithLLM(input, nlpResult);
    result.debug.rawClassification = llmResult;
    result.intentType = llmResult.intentType;
    result.confidence = llmResult.confidence;
    result.debug.processingSteps.push({
      step: 'llm_classification',
      duration: Date.now() - result.debug.processingSteps[result.debug.processingSteps.length - 1]._start
    });

    // Step 3: Handle based on intent type
    switch (result.intentType) {
      case INTENT_TYPES.TRACKING:
        await this.handleTracking(input, result, nlpResult, llmResult);
        break;
      case INTENT_TYPES.QUESTION:
        await this.handleQuestion(input, result, nlpResult, llmResult);
        break;
      case INTENT_TYPES.COMMAND:
        this.handleCommand(input, result, nlpResult, llmResult);
        break;
      case INTENT_TYPES.GENERAL_CHAT:
        result.suggestedResponse = llmResult.suggestedResponse;
        break;
    }

    const totalDuration = Date.now() - startTime;
    result.debug.totalDuration = totalDuration;
    result.debug.processingSteps.push({
      step: 'total',
      duration: totalDuration
    });

    return result;
  }

  /**
   * Fast NLP analysis before LLM classification
   */
  fastNLPAnalysis(input) {
    const lower = input.toLowerCase().trim();

    return {
      text: input,
      lower,
      nlpIntent: nlpDetectIntent(input),
      isTracking: isTrackingIntent(input),
      extractedSkill: extractSkill(input),
      extractedNumbers: extractNumbers(input),
      fullParse: nlpParseInput(input)
    };
  }

  /**
   * Classify intent using LLM
   */
  async classifyWithLLM(input, nlpResult) {
    try {
      // Pre-check for obvious question patterns (fast path)
      const lower = input.toLowerCase().trim();
      const isObviousQuestion =
        lower.includes('?') ||
        lower.startsWith('how ') ||
        lower.startsWith('what ') ||
        lower.startsWith('where ') ||
        lower.startsWith('when ') ||
        lower.startsWith('why ') ||
        lower.startsWith('which ') ||
        lower.startsWith("what's ") ||
        lower.startsWith("how's ") ||
        lower.startsWith("who's ");

      if (isObviousQuestion) {
        return {
          intentType: INTENT_TYPES.QUESTION,
          confidence: 0.95,
          reasoning: 'Input is a question (contains ? or starts with question word)',
          skillType: null,
          extractedValue: null
        };
      }

      // Pre-check for obvious general chat
      const generalChatPatterns = ['hi ', 'hello', 'hey', 'thanks', 'thank you', 'good morning', 'good afternoon', 'good evening'];
      const isGeneralChat = generalChatPatterns.some(p => lower === p || lower.startsWith(p + ' '));

      if (isGeneralChat) {
        return {
          intentType: INTENT_TYPES.GENERAL_CHAT,
          confidence: 0.95,
          reasoning: 'Input is casual greeting or thanks',
          skillType: null,
          extractedValue: null
        };
      }

      // Pre-check for obvious commands
      const commandPatterns = [
        /^list\s+/i,
        /^show\s+(my\s+)?(stats|progress|skills)/i,
        /^delete\s+/i,
        /^create\s+(a\s+)?skill/i,
        /^help\s*$/i
      ];
      const isCommand = commandPatterns.some(p => p.test(lower));

      if (isCommand) {
        return {
          intentType: INTENT_TYPES.COMMAND,
          confidence: 0.95,
          reasoning: 'Input is a command request',
          skillType: null,
          extractedValue: null
        };
      }

      // Now use LLM for more complex cases
      const prompt = this.buildClassificationPrompt(input, nlpResult);

      const response = await chatCompletion(this.model, [
        {
          role: 'system',
          content: 'You are an intent classifier. Output ONLY valid JSON - no markdown, no explanations, no additional text. Just the JSON object.'
        },
        { role: 'user', content: prompt }
      ]);

      const content = response?.message || '';
      if (!content) {
        return { intentType: INTENT_TYPES.GENERAL_CHAT, confidence: 0.5 };
      }

      // Parse JSON response with robust error handling
      let parsed;
      try {
        // Sanitize the response
        let sanitized = content
          .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')  // Remove control chars
          .replace(/\n/g, ' ');

        // Try to extract JSON from response
        const jsonMatch = sanitized.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          sanitized = jsonMatch[0];
        }

        // Fix common JSON issues
        sanitized = sanitized
          .replace(/,(\s*[}\]])/g, '$1')  // Remove trailing commas
          .replace(/([{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g, '"$2":')  // Quote keys
          .replace(/:\s*'([^']*)'/g, ': "$1"')  // Fix single quotes
          .replace(/:\s*([a-zA-Z][a-zA-Z0-9_]*)(?=\s*[,}])/g, ': "$1"');  // Quote string values

        parsed = JSON.parse(sanitized);
      } catch (e) {
        // Try one more aggressive fix - extract just the intentType
        const intentMatch = content.match(/"intentType"\s*:\s*"([^"]+)"/);
        const confMatch = content.match(/"confidence"\s*:\s*([\d.]+)/);
        const skillMatch = content.match(/"skillType"\s*:\s*"([^"]*)"/);

        if (intentMatch) {
          console.log('[IntentParser] Recovered from parse error, using regex extraction');
          return {
            intentType: intentMatch[1],
            confidence: confMatch ? parseFloat(confMatch[1]) : 0.5,
            skillType: skillMatch[1] || null,
            reasoning: 'Recovered from parse error',
            extractedValue: null
          };
        }

        // Log the raw response for debugging
        const preview = content.substring(0, 200).replace(/\n/g, ' ');
        console.error('[IntentParser] Failed to parse LLM response:', e.message, '- Preview:', preview);
        // Fallback based on NLP analysis
        return this.fallbackClassification(nlpResult);
      }

      // Validate the parsed result
      const validIntentTypes = ['TRACKING', 'QUESTION', 'COMMAND', 'GENERAL_CHAT', 'TRACKING', 'QUESTION', 'COMMAND', 'GENERAL_CHAT'];
      const intentType = parsed.i || parsed.intentType;

      if (!validIntentTypes.includes(intentType)) {
        return this.fallbackClassification(nlpResult);
      }

      return {
        intentType: intentType || INTENT_TYPES.GENERAL_CHAT,
        confidence: parsed.c || parsed.confidence || 0.5,
        suggestedResponse: null,
        extractedValue: parsed.v || parsed.extractedValue || null,
        skillType: parsed.s || parsed.skillType || null,
        reasoning: parsed.r || parsed.reasoning || ''
      };
    } catch (error) {
      console.error('[IntentParser] LLM classification failed:', error.message);
      // Fallback to NLP-based detection
      return this.fallbackClassification(nlpResult);
    }
  }

  /**
   * Build the classification prompt
   */
  buildClassificationPrompt(input, nlpResult) {
    const nlpIntent = nlpResult.nlpIntent?.type || 'unknown';
    const hasNumber = nlpResult.extractedNumbers?.length > 0;

    return `Intent for: "${input}"

NLP: ${nlpIntent} hasNumber: ${hasNumber}

Rules:
? or How/What/Where/When/Why/Which = QUESTION
Number + drank/ate/had/did/walked = TRACKING
list/show/delete = COMMAND
hi/thanks = GENERAL_CHAT

JSON:
{"i":"TRACKING","c":0.9,"r":"has number and action","s":"water","v":{"a":2,"u":"glasses"}}
{"i":"QUESTION","c":0.9,"r":"is a question"}
{"i":"COMMAND","c":0.9,"r":"is a command"}
{"i":"GENERAL_CHAT","c":0.9,"r":"is greeting"}`;
  }

  /**
   * Get list of known tracking skills
   */
  getKnownSkills() {
    const defaults = Object.keys(SKILL_DEFAULTS);
    if (this.skillManager) {
      try {
        const custom = this.skillManager.getAllSkills().map(s => s.id);
        return [...new Set([...defaults, ...custom])].join(', ');
      } catch (e) {
        return defaults.join(', ');
      }
    }
    return defaults.join(', ');
  }

  /**
   * Fallback classification when LLM fails
   */
  fallbackClassification(nlpResult) {
    if (nlpResult.isTracking) {
      return {
        intentType: INTENT_TYPES.TRACKING,
        confidence: 0.8,
        reasoning: 'Fallback: NLP detected tracking pattern',
        skillType: nlpResult.extractedSkill?.id || null
      };
    }

    return {
      intentType: INTENT_TYPES.GENERAL_CHAT,
      confidence: 0.5,
      reasoning: 'Fallback: Unable to classify, defaulting to chat'
    };
  }

  /**
   * Handle tracking intent
   */
  async handleTracking(input, result, nlpResult, llmResult) {
    // Extract skill and value
    let skillType = llmResult.skillType || nlpResult.extractedSkill?.id;

    // Infer from number categories if LLM didn't give one
    let inferredSkillType = null;
    if (nlpResult.extractedNumbers?.length > 0) {
      const firstNum = nlpResult.extractedNumbers[0];
      const category = firstNum?.category;

      // Map number categories to skill types
      const categoryToSkillMap = {
        'calories': 'calories',
        'volume': 'water',
        'container': 'water',
        'distance': 'steps',
        'steps': 'steps',
        'time': 'exercise',
        'reps': 'exercise',
        'pages': 'reading',
        'money': 'expenses'
      };

      inferredSkillType = categoryToSkillMap[category] || null;
    }

    // Validate and clean skill type from LLM
    const knownSkills = Object.keys(SKILL_DEFAULTS);
    const isValidSkill = knownSkills.includes(skillType?.toLowerCase());
    const nlpSkillId = nlpResult.fullParse?.skillId;

    // For calories, always use inferred (LLM often gets this wrong)
    if (inferredSkillType === 'calories' && nlpResult.extractedNumbers?.[0]?.category === 'calories') {
      skillType = 'calories';
    }
    // If NLP detected a skill, use it (it's reliable for known skills)
    else if (nlpSkillId) {
      skillType = nlpSkillId;
    }
    // If LLM gave valid skill type, use it
    else if (skillType && isValidSkill) {
      // Keep LLM's suggestion
    }
    // Otherwise use inferred from number category
    else {
      skillType = inferredSkillType || null;
    }

    const extractedValue = llmResult.extractedValue || this.extractValue(input, nlpResult);

    result.skill = {
      id: skillType,
      name: (skillType && SKILL_DEFAULTS[skillType]?.name) || skillType || 'custom',
      exists: false,
      confidence: 0
    };

    result.value = extractedValue;

    // Check if skill exists
    if (this.skillManager && skillType) {
      try {
        const allSkills = this.skillManager.getAllSkills();

        // Check for exact match
        const exactMatch = allSkills.find(s =>
          s.id === skillType ||
          s.name.toLowerCase() === skillType.toLowerCase()
        );

        // Check for trigger match
        const triggerMatch = allSkills.find(s =>
          (s.triggers || []).some(t => t.toLowerCase() === skillType.toLowerCase())
        );

        const existingSkill = exactMatch || triggerMatch;

        if (existingSkill) {
          result.skill.exists = true;
          result.skill.skill = existingSkill;
          result.skill.confidence = 0.95;
          result.debug.skillCheck = { found: true, skill: existingSkill.id };
        } else {
          result.skill.exists = false;
          result.skill.confidence = 0.7;
          result.debug.skillCheck = { found: false, skillType };

          // Check if we should auto-create this skill
          if (this.autoSkillCreator) {
            const detection = this.autoSkillCreator.detectTrackingAttempt(input);
            if (detection && detection.skillInference) {
              result.autoCreateSkill = {
                suggestion: detection.skillInference,
                confidence: detection.confidence,
                reason: 'Tracking detected but no matching skill exists'
              };
            }
          }
        }
      } catch (error) {
        console.error('[IntentParser] Skill check failed:', error.message);
        result.debug.skillCheck = { error: error.message };
      }
    }
  }

  /**
   * Handle question intent
   */
  async handleQuestion(input, result, nlpResult, llmResult) {
    // For questions, we don't need skill checking
    // The LLM can handle these directly or will fallback to chat
    result.suggestedResponse = llmResult.suggestedResponse;

    // Check if it's a skill-related question
    if (nlpResult.extractedSkill) {
      result.skill = {
        id: nlpResult.extractedSkill.id,
        name: nlpResult.extractedSkill.defaults?.name || nlpResult.extractedSkill.id,
        exists: true, // We'll check actual existence
        isQuery: true
      };

      // Verify skill exists
      if (this.skillManager) {
        try {
          const allSkills = this.skillManager.getAllSkills();
          const exists = allSkills.some(s =>
            s.id === result.skill.id ||
            (s.triggers || []).includes(result.skill.id)
          );
          result.skill.exists = exists;
        } catch (e) {
          result.skill.exists = false;
        }
      }
    }

    result.debug.skillCheck = result.skill ? { isQuery: true } : null;
  }

  /**
   * Handle command intent
   */
  handleCommand(input, result, nlpResult, llmResult) {
    // Extract command type from input
    const lower = input.toLowerCase().trim();

    const commandPatterns = [
      { pattern: /^(list|show|get)\s*(my\s*)?(skills|trackers|habits)/i, action: 'list_skills' },
      { pattern: /^(my\s*)?(stats?|progress|summary)/i, action: 'show_stats' },
      { pattern: /^(delete|remove|undo)\s*(last|previous)?/i, action: 'undo' },
      { pattern: /^help/i, action: 'help' },
      { pattern: /^(create|add|new)\s*skill/i, action: 'create_skill' },
      { pattern: /^today/i, action: 'today_summary' }
    ];

    for (const { pattern, action } of commandPatterns) {
      if (pattern.test(lower)) {
        result.action = action;
        break;
      }
    }

    if (!result.action) {
      result.action = 'unknown_command';
    }
  }

  /**
   * Extract value from tracking input
   */
  extractValue(input, nlpResult) {
    const numbers = nlpResult.extractedNumbers;
    const skill = nlpResult.extractedSkill;

    if (numbers.length === 0) {
      return { amount: 1, unit: 'count' };
    }

    // Find the most relevant number
    let bestNum = numbers[0];

    // Prefer numbers with matching units
    if (skill?.defaults?.unit) {
      const unitNum = numbers.find(n =>
        n.unit === skill.defaults.unit ||
        n.category === this.getCategoryForUnit(skill.defaults.unit)
      );
      if (unitNum) bestNum = unitNum;
    }

    return {
      amount: bestNum.value,
      unit: bestNum.unit || skill?.defaults?.unit || 'count',
      raw: bestNum.raw
    };
  }

  /**
   * Get category for unit
   */
  getCategoryForUnit(unit) {
    const unitCategoryMap = {
      'ml': 'volume',
      'cups': 'container',
      'glasses': 'container',
      'steps': 'steps',
      'reps': 'reps',
      'minutes': 'time',
      'hours': 'time',
      'pages': 'pages',
      'USD': 'money'
    };
    return unitCategoryMap[unit] || 'number';
  }

  /**
   * Quick check if input is a question (for fast path)
   */
  isQuestion(input) {
    const lower = input.toLowerCase().trim();
    return lower.startsWith('how') ||
           lower.startsWith('what') ||
           lower.startsWith('where') ||
           lower.startsWith('when') ||
           lower.startsWith('why') ||
           lower.startsWith('who') ||
           lower.startsWith('which') ||
           lower.includes('?');
  }

  /**
   * Quick check if input is tracking (for fast path)
   */
  isTracking(input) {
    return isTrackingIntent(input);
  }
}

// Singleton instance
let parserInstance = null;

export async function getIntentParser(options = {}) {
  if (!parserInstance) {
    parserInstance = new IntentParser(options);
    await parserInstance.init();
  }
  return parserInstance;
}

export default IntentParser;
