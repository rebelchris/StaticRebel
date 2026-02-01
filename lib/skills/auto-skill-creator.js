/**
 * Auto-Skill Creator - Intelligent skill creation from tracking attempts
 * 
 * When a user says "I drank 2 glasses of water" but no water skill exists,
 * this module detects the tracking attempt, notices no matching skill exists,
 * and either auto-creates the skill or asks for confirmation.
 */

import { parseInput, extractSkill, extractNumbers, SKILL_DEFAULTS } from './nlp-parser.js';
import { getSkillManager } from './skill-manager.js';

/**
 * Configuration for auto-skill creation
 */
const AUTO_SKILL_CONFIG = {
  // Whether to auto-create skills without asking (can be overridden per user)
  AUTO_CREATE_SKILLS: process.env.AUTO_CREATE_SKILLS === 'true' || false,
  
  // Minimum confidence threshold for auto-creation
  CONFIDENCE_THRESHOLD: 0.7,
  
  // Whether to be verbose in dashboard/API contexts
  VERBOSE_LOGGING: process.env.NODE_ENV !== 'production',
};

/**
 * Enhanced skill type inference patterns
 */
const ENHANCED_PATTERNS = {
  // Activity-based patterns
  'water': { 
    patterns: ['drank', 'drink', 'water', 'hydrat', 'glass', 'bottle', 'cup'], 
    type: 'number', 
    unit: 'ml', 
    goal: 2000,
    icon: '💧',
    examples: ['drank 2 glasses of water', 'had 500ml water', 'water: 3 cups']
  },
  'coffee': { 
    patterns: ['coffee', 'espresso', 'cappuccino', 'latte', 'caffeine'], 
    type: 'number', 
    unit: 'cups', 
    goal: 3,
    goalType: 'max',
    icon: '☕',
    examples: ['had coffee', 'drank 2 cups of coffee', 'espresso']
  },
  'pushups': { 
    patterns: ['pushup', 'push-up', 'press-up'], 
    type: 'number', 
    unit: 'reps', 
    goal: 50,
    icon: '💪',
    examples: ['did 30 pushups', '20 push-ups', 'pushups: 15']
  },
  'steps': { 
    patterns: ['step', 'walked', 'walk'], 
    type: 'number', 
    unit: 'steps', 
    goal: 10000,
    icon: '🚶',
    examples: ['walked 5000 steps', '8k steps', 'steps today: 12000']
  },
  'sleep': { 
    patterns: ['sleep', 'slept', 'sleeping', 'rest'], 
    type: 'duration', 
    unit: 'hours', 
    goal: 8,
    icon: '😴',
    examples: ['slept 7 hours', 'got 8h sleep', 'sleep: 6.5 hours']
  },
  'mood': { 
    patterns: ['feeling', 'mood', 'emotion', 'happy', 'sad', 'stressed', 'feel', 'today'], 
    type: 'scale', 
    unit: 'score', 
    goal: null,
    range: [1, 10],
    icon: '😊',
    examples: ['feeling happy today', 'mood: 8', 'feeling stressed (3)']
  },
  'expenses': { 
    patterns: ['spent', 'expense', 'cost', 'paid', 'bought', '$', 'dollar', 'money'], 
    type: 'number', 
    unit: 'USD', 
    goal: null,
    icon: '💰',
    examples: ['spent $50 on groceries', 'cost: $25', 'paid $100']
  },
  'reading': { 
    patterns: ['read', 'reading', 'page', 'book', 'chapter'], 
    type: 'number', 
    unit: 'pages', 
    goal: 30,
    icon: '📚',
    examples: ['read 20 pages', 'reading: 1 chapter', 'book progress: 50 pages']
  },
  'meditation': { 
    patterns: ['meditat', 'mindful', 'breathe', 'zen'], 
    type: 'duration', 
    unit: 'minutes', 
    goal: 15,
    icon: '🧘',
    examples: ['meditated 10 minutes', '15 min meditation', 'mindfulness: 5m']
  },
  'exercise': { 
    patterns: ['workout', 'exercise', 'gym', 'training', 'fitness'], 
    type: 'duration', 
    unit: 'minutes', 
    goal: 30,
    icon: '🏋️',
    examples: ['workout 45 minutes', 'gym session: 1 hour', 'exercised 20min']
  },
  'calories': { 
    patterns: ['calorie', 'cal', 'kcal'], 
    type: 'number', 
    unit: 'cal', 
    goal: 2000,
    icon: '🔥',
    examples: ['ate 500 calories', '1200 cal today', 'burned 300 calories']
  }
};

/**
 * Auto-Skill Creator main class
 */
export class AutoSkillCreator {
  constructor(options = {}) {
    this.config = { ...AUTO_SKILL_CONFIG, ...options };
    this.skillManager = null;
    this.pendingConfirmations = new Map(); // chatId -> pending creation data
  }

  async init() {
    this.skillManager = await getSkillManager();
  }

  /**
   * Detect if input is a tracking attempt for non-existent skill
   * @param {string} input - User input 
   * @returns {Object|null} Detection result
   */
  detectTrackingAttempt(input) {
    // Parse the input using existing NLP parser
    const parsed = parseInput(input);
    
    // Accept both 'log' intents and 'query' intents for mood tracking
    // (queries like "my mood is 6" should be treated as logging attempts)
    const isTrackingAttempt = parsed.intent === 'log' || 
      (parsed.intent === 'query' && parsed.skillId && input.match(/\d+/));
    
    if (!isTrackingAttempt && parsed.intent !== 'unknown') {
      return null;
    }

    // Check if there's already a matching skill
    const existingSkill = this.findSimilarSkill(input);
    
    if (existingSkill) {
      return {
        hasExistingSkill: true,
        existingSkill,
        parsed
      };
    }

    // Use existing parsed data if available and valid
    if (parsed.intent === 'log' && parsed.skillId && parsed.entry) {
      // The nlp-parser already correctly parsed this - use its data
      const skillDefaults = parsed.skillDefaults || {};
      const skillInference = {
        skillType: parsed.skillId,
        name: skillDefaults.name || parsed.skillName,
        description: `Track ${parsed.skillName?.toLowerCase() || parsed.skillId}`,
        type: this.inferTypeFromUnit(skillDefaults.unit),
        unit: skillDefaults.unit || 'units',
        goal: skillDefaults.goal,
        icon: skillDefaults.icon || '📊',
        triggers: [parsed.skillId, ...(parsed.skillName ? [parsed.skillName.toLowerCase()] : [])],
        examples: [`${parsed.skillId} [amount]`, `logged ${parsed.skillId}`],
        confidence: 0.85, // High confidence for nlp-parser results
        extractedValue: {
          value: parsed.entry.value || 1,
          unit: skillDefaults.unit || 'units',
          note: parsed.entry.note
        }
      };
      
      return {
        hasExistingSkill: false,
        parsed,
        skillInference,
        confidence: skillInference.confidence,
        shouldAutoCreate: this.config.AUTO_CREATE_SKILLS
      };
    }

    // Handle queries that look like logging attempts (e.g., "my mood is 6")
    if (parsed.intent === 'query' && parsed.skillId && input.match(/\d+/)) {
      const numbers = extractNumbers(input);
      if (numbers.length > 0) {
        const skillDefaults = parsed.skillDefaults || {};
        const skillInference = {
          skillType: parsed.skillId,
          name: skillDefaults.name || parsed.skillName,
          description: `Track ${parsed.skillName?.toLowerCase() || parsed.skillId}`,
          type: this.inferTypeFromUnit(skillDefaults.unit),
          unit: skillDefaults.unit || 'score',
          goal: skillDefaults.goal,
          icon: skillDefaults.icon || '😊',
          triggers: [parsed.skillId, ...(parsed.skillName ? [parsed.skillName.toLowerCase()] : [])],
          examples: [`${parsed.skillId} [amount]`, `my ${parsed.skillId} is [number]`],
          confidence: 0.8,
          extractedValue: {
            value: numbers[0].value,
            unit: skillDefaults.unit || 'score'
          }
        };
        
        return {
          hasExistingSkill: false,
          parsed,
          skillInference,
          confidence: skillInference.confidence,
          shouldAutoCreate: this.config.AUTO_CREATE_SKILLS
        };
      }
    }

    // No existing skill and no good parsed data - try custom inference
    const skillInference = this.inferSkillFromInput(input, parsed);
    
    if (!skillInference || skillInference.confidence < this.config.CONFIDENCE_THRESHOLD) {
      return null;
    }

    return {
      hasExistingSkill: false,
      parsed,
      skillInference,
      confidence: skillInference.confidence,
      shouldAutoCreate: this.config.AUTO_CREATE_SKILLS && skillInference.confidence >= 0.8
    };
  }

  /**
   * Find similar existing skills to avoid duplicates
   * @param {string} input - User input
   * @returns {Object|null} Similar skill if found
   */
  findSimilarSkill(input) {
    const allSkills = this.skillManager.getAllSkills();
    const inputLower = input.toLowerCase();

    // Check for exact trigger matches first
    for (const skill of allSkills) {
      for (const trigger of skill.triggers || []) {
        if (inputLower.includes(trigger.toLowerCase())) {
          return {
            skill,
            matchType: 'trigger',
            trigger
          };
        }
      }
    }

    // Check for name matches
    for (const skill of allSkills) {
      if (inputLower.includes(skill.name.toLowerCase()) || 
          inputLower.includes(skill.id.toLowerCase())) {
        return {
          skill,
          matchType: 'name'
        };
      }
    }

    // Check for semantic similarity (water vs hydration, etc.)
    const semanticMatches = {
      'water': ['hydration', 'hydrate', 'drink', 'fluid'],
      'exercise': ['workout', 'fitness', 'gym', 'training'],
      'sleep': ['rest', 'nap', 'sleeping'],
      'mood': ['feeling', 'emotion', 'mental'],
      'food': ['meal', 'nutrition', 'eating', 'calories'],
      'steps': ['walking', 'walk', 'movement']
    };

    for (const skill of allSkills) {
      for (const [canonical, aliases] of Object.entries(semanticMatches)) {
        if (skill.name.toLowerCase().includes(canonical)) {
          for (const alias of aliases) {
            if (inputLower.includes(alias)) {
              return {
                skill,
                matchType: 'semantic',
                canonical,
                alias
              };
            }
          }
        }
      }
    }

    return null;
  }

  /**
   * Infer what skill should be created from the input
   * @param {string} input - User input
   * @param {Object} parsed - Parsed tracking data
   * @returns {Object|null} Skill inference result
   */
  inferSkillFromInput(input, parsed) {
    const inputLower = input.toLowerCase();
    const numbers = extractNumbers(input);

    let bestMatch = null;
    let bestScore = 0;

    // Special pattern detection for specific cases
    const specialPatterns = {
      mood: [
        /mood.*is.*(\d+)/i,
        /feeling.*(happy|sad|good|bad|great|terrible|okay|fine)/i,
        /my mood/i,
        /(feel|feeling)/i,
        /(\d+)\/10/i,
        /(\d+) out of 10/i
      ],
      expenses: [
        /spent.*\$(\d+)/i,
        /paid.*\$(\d+)/i,
        /cost.*\$(\d+)/i,
        /\$(\d+)/i,
        /spent.*(\d+)/i,
        /bought.*\$(\d+)/i
      ]
    };

    // Check special patterns first
    for (const [skillType, patterns] of Object.entries(specialPatterns)) {
      for (const pattern of patterns) {
        if (pattern.test(inputLower)) {
          bestScore = 2.0; // High confidence for explicit patterns
          bestMatch = {
            skillType,
            config: ENHANCED_PATTERNS[skillType],
            matchedPattern: pattern.source,
            score: 2.0
          };
          break;
        }
      }
      if (bestMatch && bestMatch.score >= 2.0) break;
    }

    // If no special pattern matched, check enhanced patterns
    if (bestScore < 2.0) {
      for (const [skillType, config] of Object.entries(ENHANCED_PATTERNS)) {
        let score = 0;
        let matchedPattern = null;

        // Check if any patterns match
        for (const pattern of config.patterns) {
          if (inputLower.includes(pattern.toLowerCase())) {
            score += 1;
            matchedPattern = pattern;
            break;
          }
        }

        // Boost score based on numbers and units
        if (score > 0) {
          // Check if units match expected type
          for (const num of numbers) {
            if (num.unit && this.unitsMatch(num.unit, config.unit)) {
              score += 0.5;
            }
            if (num.category && this.categoriesMatch(num.category, config.type)) {
              score += 0.3;
            }
          }

          // Special boosting for clear indicators
          if (skillType === 'water' && /glass|cup|bottle|ml|liter/.test(inputLower)) {
            score += 0.5;
          }
          if (skillType === 'steps' && /\d+k\s*step|\d+\s*step/.test(inputLower)) {
            score += 0.5;
          }
          if (skillType === 'mood' && /feeling|mood|\d+\/10/.test(inputLower)) {
            score += 0.5;
          }
          if (skillType === 'expenses' && /\$|dollar|money|spent|paid|cost/.test(inputLower)) {
            score += 0.5;
          }
        }

        if (score > bestScore) {
          bestScore = score;
          bestMatch = {
            skillType,
            config,
            matchedPattern,
            score
          };
        }
      }
    }

    if (!bestMatch || bestScore < 0.3) {
      // Try to infer from parsed data
      return this.inferFromParsedData(input, parsed);
    }

    // Extract value and unit from input
    const extractedValue = this.extractValueForSkill(input, bestMatch.config, numbers);

    return {
      skillType: bestMatch.skillType,
      name: this.generateSkillName(bestMatch.skillType, bestMatch.config),
      description: `Track ${bestMatch.skillType} ${bestMatch.config.unit ? 'in ' + bestMatch.config.unit : ''}`,
      type: bestMatch.config.type,
      unit: bestMatch.config.unit,
      goal: bestMatch.config.goal,
      goalType: bestMatch.config.goalType || 'min',
      icon: bestMatch.config.icon,
      triggers: this.generateTriggers(bestMatch.skillType, bestMatch.config),
      examples: bestMatch.config.examples,
      confidence: Math.min(Math.max(bestScore * 0.4, 0.6), 0.95), // Normalize to 0.6-0.95
      extractedValue,
      matchedPattern: bestMatch.matchedPattern
    };
  }

  /**
   * Generate a user-friendly skill name
   */
  generateSkillName(skillType, config) {
    const names = {
      'water': 'Water Intake',
      'coffee': 'Coffee',
      'pushups': 'Push-ups', 
      'steps': 'Daily Steps',
      'sleep': 'Sleep',
      'mood': 'Daily Mood',
      'expenses': 'Expenses',
      'reading': 'Reading',
      'meditation': 'Meditation',
      'exercise': 'Exercise',
      'calories': 'Calories'
    };

    return names[skillType] || skillType.charAt(0).toUpperCase() + skillType.slice(1);
  }

  /**
   * Generate appropriate triggers for the skill
   */
  generateTriggers(skillType, config) {
    const base = [skillType];
    
    // Add common variations
    if (skillType === 'water') {
      base.push('drank', 'drink', 'hydration', 'glass', 'bottle');
    } else if (skillType === 'pushups') {
      base.push('pushup', 'push-up', 'push up');
    } else if (skillType === 'steps') {
      base.push('walked', 'walk', 'step');
    } else if (skillType === 'sleep') {
      base.push('slept', 'sleeping');
    } else if (skillType === 'mood') {
      base.push('feeling', 'feel');
    }

    return base;
  }

  /**
   * Infer skill type from unit
   */
  inferTypeFromUnit(unit) {
    if (!unit) return 'number';
    
    const unitTypeMap = {
      'ml': 'number',
      'hours': 'duration', 
      'minutes': 'duration',
      'score': 'scale',
      'USD': 'number',
      'pages': 'number',
      'steps': 'number',
      'reps': 'number',
      'cal': 'number',
      'calories': 'number'
    };
    
    return unitTypeMap[unit] || 'number';
  }

  /**
   * Check if units are compatible
   */
  unitsMatch(inputUnit, expectedUnit) {
    const unitGroups = {
      volume: ['ml', 'l', 'cup', 'glass', 'bottle', 'oz', 'liter'],
      time: ['min', 'hour', 'h', 'minute', 'hr'],
      distance: ['km', 'k', 'mile', 'meter', 'm'],
      count: ['rep', 'step', 'page', 'cal', 'calorie']
    };

    for (const group of Object.values(unitGroups)) {
      if (group.includes(inputUnit) && group.includes(expectedUnit)) {
        return true;
      }
    }

    return inputUnit === expectedUnit;
  }

  /**
   * Check if categories match skill type
   */
  categoriesMatch(inputCategory, skillType) {
    const categoryMap = {
      'volume': ['number'],
      'container': ['number'], 
      'time': ['duration'],
      'distance': ['number'],
      'steps': ['number'],
      'reps': ['number'],
      'calories': ['number']
    };

    return categoryMap[inputCategory]?.includes(skillType);
  }

  /**
   * Extract the value that would be logged to this skill
   */
  extractValueForSkill(input, config, numbers) {
    if (!numbers || numbers.length === 0) {
      return { value: 1, unit: config.unit };
    }

    // Find the most appropriate number
    let bestNum = numbers[0];

    // Look for numbers with matching units/categories
    for (const num of numbers) {
      if (num.unit && this.unitsMatch(num.unit, config.unit)) {
        bestNum = num;
        break;
      }
      if (num.category && this.categoriesMatch(num.category, config.type)) {
        bestNum = num;
      }
    }

    let value = bestNum.value; // Start with raw value

    // Handle specific conversions based on skill type and units
    if (config.unit === 'ml') {
      if (bestNum.unit && ['cup', 'glass', 'cups', 'glasses'].includes(bestNum.unit)) {
        value = bestNum.value * 250; // Convert cups/glasses to ml
      } else if (bestNum.unit && ['bottle', 'bottles'].includes(bestNum.unit)) {
        value = bestNum.value * 500; // Convert bottles to ml
      } else if (bestNum.unit && ['l', 'liter', 'liters', 'litre', 'litres'].includes(bestNum.unit)) {
        value = bestNum.value * 1000; // Convert liters to ml
      } else if (bestNum.category === 'volume' && bestNum.normalized) {
        value = bestNum.normalized;
      } else if (!bestNum.unit && bestNum.value > 10) {
        // Bare number > 10 probably already in ml
        value = bestNum.value;
      } else if (!bestNum.unit && bestNum.value <= 10) {
        // Bare number <= 10 probably glasses
        value = bestNum.value * 250;
      }
    } else if (config.unit === 'hours') {
      if (bestNum.unit && ['min', 'mins', 'minute', 'minutes'].includes(bestNum.unit)) {
        value = bestNum.value / 60; // Convert minutes to hours
      } else if (bestNum.category === 'time' && bestNum.normalized) {
        value = bestNum.normalized / 60; // Convert minutes to hours
      } else {
        // Assume raw number is already in hours for sleep
        value = bestNum.value;
      }
    } else if (config.unit === 'minutes') {
      if (bestNum.unit && ['hr', 'hour', 'hours', 'h'].includes(bestNum.unit)) {
        value = bestNum.value * 60; // Convert hours to minutes
      } else if (bestNum.category === 'time' && bestNum.normalized) {
        value = bestNum.normalized;
      } else {
        // Assume raw number is already in minutes
        value = bestNum.value;
      }
    } else if (config.unit === 'USD') {
      // Handle money extraction
      const moneyMatch = input.match(/\$(\d+(?:\.\d{2})?)/);
      if (moneyMatch) {
        value = parseFloat(moneyMatch[1]);
      } else if (bestNum.value) {
        value = bestNum.value;
      }
    } else if (config.unit === 'score' && config.type === 'scale') {
      // Handle mood/scale extraction
      const moodScoreMatch = input.match(/mood.*is.*(\d+)|(\d+)\/10|(\d+) out of 10/i);
      if (moodScoreMatch) {
        value = parseInt(moodScoreMatch[1] || moodScoreMatch[2] || moodScoreMatch[3]);
      } else if (bestNum.value >= 1 && bestNum.value <= 10) {
        value = bestNum.value;
      } else {
        // Try to infer mood from emotion words
        const emotionMap = {
          'terrible': 1, 'awful': 1, 'horrible': 1,
          'bad': 3, 'sad': 3, 'down': 3,
          'okay': 5, 'fine': 5, 'alright': 5,
          'good': 7, 'well': 7,
          'happy': 8, 'great': 8,
          'amazing': 9, 'fantastic': 9, 'excellent': 9,
          'perfect': 10, 'ecstatic': 10
        };
        
        const inputLower = input.toLowerCase();
        for (const [emotion, score] of Object.entries(emotionMap)) {
          if (inputLower.includes(emotion)) {
            value = score;
            break;
          }
        }
        
        if (!value) {
          value = 5; // Default neutral mood
        }
      }
    } else {
      // For other units, use normalized value if available, otherwise raw value
      value = bestNum.normalized || bestNum.value;
    }

    return {
      value: Math.round(value * 100) / 100, // Round to 2 decimal places
      unit: config.unit,
      originalUnit: bestNum.unit,
      originalValue: bestNum.value
    };
  }

  /**
   * Infer skill from parsed data when patterns don't match
   */
  inferFromParsedData(input, parsed) {
    // Fallback inference based on common patterns
    const numbers = extractNumbers(input);
    
    if (numbers.length === 0) {
      return null;
    }

    const firstNum = numbers[0];
    
    // Simple heuristics
    if (firstNum.unit === 'ml' || firstNum.category === 'volume') {
      return this.createCustomSkillInference('liquid', 'number', 'ml', 'Water/Liquid', '💧');
    }
    
    if (firstNum.unit === 'steps' || firstNum.category === 'steps') {
      return this.createCustomSkillInference('steps', 'number', 'steps', 'Steps', '🚶');
    }
    
    if (firstNum.unit === 'minutes' || firstNum.category === 'time') {
      return this.createCustomSkillInference('activity', 'duration', 'minutes', 'Activity', '⏱️');
    }
    
    if (firstNum.unit === 'reps' || firstNum.category === 'reps') {
      return this.createCustomSkillInference('exercise', 'number', 'reps', 'Exercise', '💪');
    }
    
    // Generic number tracking
    return this.createCustomSkillInference('custom', 'number', 'units', 'Custom Tracker', '📊');
  }

  /**
   * Create a basic skill inference for unknown patterns
   */
  createCustomSkillInference(skillType, type, unit, name, icon) {
    return {
      skillType,
      name,
      description: `Track ${name.toLowerCase()}`,
      type,
      unit,
      goal: null,
      icon,
      triggers: [skillType],
      examples: [`${skillType} 1`, `logged ${skillType}: 5`],
      confidence: 0.6,
      extractedValue: { value: 1, unit }
    };
  }

  /**
   * Create a skill and immediately log the entry
   * @param {Object} skillInference - Inferred skill data
   * @param {string} originalInput - Original user input
   * @returns {Object} Creation and logging result
   */
  async createSkillAndLog(skillInference, originalInput) {
    try {
      // Create the skill
      const skillData = {
        name: skillInference.name,
        description: skillInference.description,
        dataType: skillInference.type,
        unit: skillInference.unit,
        dailyGoal: skillInference.goal,
        goalType: skillInference.goalType,
        icon: skillInference.icon,
        triggers: skillInference.triggers
      };

      const createdSkill = await this.skillManager.createSkill(skillInference.name, skillData);
      
      if (!createdSkill) {
        throw new Error('Failed to create skill');
      }

      // Log the initial entry
      let logEntry = {
        value: skillInference.extractedValue?.value || 1,
        source: 'auto-created',
        note: `Auto-logged from: "${originalInput}"`
      };

      // Add unit information if available
      if (skillInference.extractedValue?.originalUnit) {
        logEntry.originalUnit = skillInference.extractedValue.originalUnit;
        logEntry.originalValue = skillInference.extractedValue.originalValue;
      }

      const logResult = await this.skillManager.addEntry(createdSkill.id, logEntry);

      return {
        success: true,
        skill: createdSkill,
        logEntry: logResult,
        message: this.generateSuccessMessage(createdSkill, skillInference.extractedValue, originalInput)
      };

    } catch (error) {
      console.error('[AutoSkillCreator] Failed to create skill and log:', error);
      return {
        success: false,
        error: error.message,
        message: `Failed to create ${skillInference.name} skill: ${error.message}`
      };
    }
  }

  /**
   * Generate a success message for skill creation and logging
   */
  generateSuccessMessage(skill, extractedValue, originalInput) {
    const value = extractedValue?.value || 1;
    const unit = extractedValue?.unit || skill.unit || '';
    const goalText = skill.dailyGoal ? ` (goal: ${skill.dailyGoal}${unit}/day)` : '';
    
    return `✅ Created **${skill.name}** skill and logged: ${value}${unit ? ' ' + unit : ''}\n\n` +
           `${skill.icon} I detected you wanted to track ${skill.name.toLowerCase()}${goalText}\n\n` +
           `**Next time just say:** "${skill.triggers[0]} [amount]"`;
  }

  /**
   * Generate a confirmation message for skill creation
   */
  generateConfirmationMessage(skillInference, extractedValue, originalInput) {
    const value = extractedValue?.value || 1;
    const unit = extractedValue?.unit || '';
    const goalText = skillInference.goal ? ` (suggested goal: ${skillInference.goal}${unit}/day)` : '';
    
    return `🤔 I don't have a **${skillInference.name}** skill yet.\n\n` +
           `I detected you wanted to log: ${value}${unit ? ' ' + unit : ''}${goalText}\n\n` +
           `**Want me to create this skill?** (say "yes" or "no")`;
  }

  /**
   * Handle pending confirmations for skill creation
   * @param {string} chatId - Chat session ID
   * @param {string} response - User response to confirmation
   * @returns {Object} Result of confirmation handling
   */
  async handleConfirmation(chatId, response) {
    const pending = this.pendingConfirmations.get(chatId);
    if (!pending) {
      return { success: false, message: 'No pending skill creation found.' };
    }

    const responseLower = response.toLowerCase().trim();
    
    if (['yes', 'y', 'yeah', 'yep', 'sure', 'ok', 'okay', 'create it'].includes(responseLower)) {
      // Create the skill
      const result = await this.createSkillAndLog(pending.skillInference, pending.originalInput);
      this.pendingConfirmations.delete(chatId);
      return result;
    } else if (['no', 'n', 'nope', 'cancel', 'nevermind'].includes(responseLower)) {
      // Cancel creation
      this.pendingConfirmations.delete(chatId);
      return {
        success: false,
        message: 'Skill creation cancelled. You can create skills manually with: "create a tracker for [activity]"'
      };
    } else {
      // Invalid response
      return {
        success: false,
        message: 'Please say "yes" to create the skill or "no" to cancel.',
        needsClarification: true
      };
    }
  }

  /**
   * Store pending confirmation for later handling
   */
  storePendingConfirmation(chatId, skillInference, originalInput) {
    this.pendingConfirmations.set(chatId, {
      skillInference,
      originalInput,
      timestamp: Date.now()
    });
    
    // Clean up old confirmations (older than 5 minutes)
    const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
    for (const [id, data] of this.pendingConfirmations) {
      if (data.timestamp < fiveMinutesAgo) {
        this.pendingConfirmations.delete(id);
      }
    }
  }

  /**
   * Check if there's a pending confirmation for this chat
   */
  hasPendingConfirmation(chatId) {
    return this.pendingConfirmations.has(chatId);
  }

  /**
   * Main entry point - handle tracking input with auto-skill creation
   * @param {string} input - User input
   * @param {string} chatId - Chat session ID (for confirmations)
   * @returns {Object} Handling result
   */
  async handleTrackingWithAutoCreation(input, chatId = 'default') {
    if (!this.skillManager) {
      await this.init();
    }

    // Check if this is a response to a pending confirmation
    if (this.hasPendingConfirmation(chatId)) {
      return await this.handleConfirmation(chatId, input);
    }

    // Detect if this is a tracking attempt
    const detection = this.detectTrackingAttempt(input);
    
    if (!detection) {
      return { success: false, isTrackingAttempt: false };
    }

    // If there's an existing skill, use it
    if (detection.hasExistingSkill) {
      return {
        success: true,
        useExistingSkill: true,
        skill: detection.existingSkill.skill,
        matchType: detection.existingSkill.matchType,
        parsed: detection.parsed
      };
    }

    // No existing skill - decide whether to auto-create or ask
    if (detection.shouldAutoCreate) {
      // Auto-create without asking
      const result = await this.createSkillAndLog(detection.skillInference, input);
      return {
        ...result,
        autoCreated: true,
        confidence: detection.confidence
      };
    } else {
      // Ask for confirmation
      this.storePendingConfirmation(chatId, detection.skillInference, input);
      
      return {
        success: false,
        needsConfirmation: true,
        message: this.generateConfirmationMessage(
          detection.skillInference, 
          detection.skillInference.extractedValue, 
          input
        ),
        skillInference: detection.skillInference
      };
    }
  }

  /**
   * Update configuration (e.g., auto-create setting)
   */
  updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
  }

  /**
   * Get current configuration
   */
  getConfig() {
    return { ...this.config };
  }
}

// Export singleton instance
let defaultCreator = null;

export async function getAutoSkillCreator(options = {}) {
  if (!defaultCreator) {
    defaultCreator = new AutoSkillCreator(options);
    await defaultCreator.init();
  }
  return defaultCreator;
}

export default AutoSkillCreator;