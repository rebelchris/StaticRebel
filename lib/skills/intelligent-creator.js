/**
 * Intelligent Skill Creator
 * 
 * Research apps/services and automatically create replacement skills.
 * Handles requests like "I'm using getdex now, can you create a skill to replace it?"
 * 
 * Features:
 * - Web search to research what apps/services do
 * - Extract key features and create matching skills
 * - Support for habit trackers, fitness apps, mood trackers, etc.
 * - Data import from CSV/JSON exports
 * - Integration with existing skill teaching system
 */

import fs from 'fs/promises';
import path from 'path';
import { SkillTeacher } from './teaching.js';

/**
 * App type patterns and their corresponding skill templates
 */
const APP_TYPES = {
  habit: {
    patterns: ['habit', 'streak', 'daily', 'routine', 'goal', 'tracking', 'check-in'],
    description: 'Habit and routine tracking',
    skillTypes: ['counter', 'number', 'activity'],
    commonMetrics: ['streak_days', 'completion_rate', 'total_count'],
    defaultGoals: { daily: 1, weekly: 7 },
    examples: ['water intake', 'exercise', 'meditation', 'reading']
  },
  
  fitness: {
    patterns: ['fitness', 'workout', 'exercise', 'calories', 'steps', 'weight', 'gym', 'running', 'cycling'],
    description: 'Fitness and health tracking',
    skillTypes: ['number', 'duration', 'activity'],
    commonMetrics: ['calories', 'steps', 'weight', 'distance', 'duration'],
    defaultGoals: { daily: 10000, weekly: 5 },
    examples: ['steps', 'calories burned', 'workout duration', 'weight']
  },
  
  mood: {
    patterns: ['mood', 'emotion', 'feeling', 'mental', 'wellbeing', 'diary', 'journal'],
    description: 'Mood and mental health tracking',
    skillTypes: ['scale', 'text', 'activity'],
    commonMetrics: ['mood_score', 'energy_level', 'stress_level'],
    defaultGoals: { daily: 1 },
    examples: ['mood', 'energy level', 'stress level', 'gratitude']
  },
  
  time: {
    patterns: ['time', 'hours', 'minutes', 'productivity', 'focus', 'work', 'study'],
    description: 'Time and productivity tracking',
    skillTypes: ['duration', 'activity'],
    commonMetrics: ['hours_worked', 'focus_sessions', 'productivity_score'],
    defaultGoals: { daily: 8, weekly: 40 },
    examples: ['work hours', 'focus time', 'break time', 'study sessions']
  },
  
  finance: {
    patterns: ['money', 'expense', 'budget', 'spending', 'income', 'finance', 'cost', 'price'],
    description: 'Financial tracking',
    skillTypes: ['number', 'activity'],
    commonMetrics: ['amount', 'category', 'balance'],
    defaultGoals: { daily: 50, weekly: 500, monthly: 2000 },
    examples: ['expenses', 'income', 'savings', 'budget categories']
  },
  
  health: {
    patterns: ['health', 'symptom', 'medication', 'sleep', 'blood', 'pressure', 'heart'],
    description: 'Health and medical tracking',
    skillTypes: ['number', 'scale', 'text', 'activity'],
    commonMetrics: ['measurement', 'dosage', 'severity', 'duration'],
    defaultGoals: { daily: 1 },
    examples: ['sleep hours', 'medication', 'symptoms', 'vital signs']
  },
  
  custom: {
    patterns: ['track', 'log', 'record', 'monitor', 'measure'],
    description: 'Custom tracking',
    skillTypes: ['number', 'counter', 'text', 'scale', 'duration', 'activity'],
    commonMetrics: ['value', 'count', 'score', 'amount'],
    defaultGoals: { daily: 1 },
    examples: ['custom metric', 'personal goal', 'unique measurement']
  }
};

/**
 * Common data export formats and parsers
 */
const EXPORT_FORMATS = {
  csv: {
    extensions: ['.csv'],
    parse: parseCsvData
  },
  json: {
    extensions: ['.json'],
    parse: parseJsonData
  },
  xml: {
    extensions: ['.xml'],
    parse: parseXmlData
  }
};

/**
 * IntelligentCreator - AI-powered skill creation based on app research
 */
export class IntelligentCreator {
  constructor(skillManager, skillTeacher, options = {}) {
    this.sm = skillManager;
    this.teacher = skillTeacher;
    this.webSearchTool = options.webSearchTool; // Function to search web
    this.sessions = new Map(); // chatId -> research session
  }

  /**
   * Check if a message is requesting app replacement
   */
  isReplacementRequest(message) {
    const lower = message.toLowerCase();
    const patterns = [
      /(?:replace|substitute|alternative to|instead of|similar to)\s+(.+)/i,
      /i(?:'m|\s+am)?\s+using\s+(\w+).*?(?:replace|alternative|skill)/i,
      /can you create.*?(?:replace|alternative to|instead of)\s+(.+)/i,
      /(?:migrate from|switch from)\s+(\w+)/i,
      /create.*?skill.*?(?:like|similar to)\s+(.+)/i
    ];
    
    return patterns.some(pattern => pattern.test(message));
  }

  /**
   * Extract app name from replacement request
   */
  extractAppName(message) {
    const lower = message.toLowerCase();
    const patterns = [
      /(?:replace|substitute|alternative to|instead of|similar to)\s+(\w+)/i,
      /i(?:'m|\s+am)?\s+using\s+(\w+)/i,
      /can you create.*?(?:replace|alternative to|instead of)\s+(\w+)/i,
      /(?:migrate from|switch from)\s+(\w+)/i,
      /create.*?skill.*?(?:like|similar to)\s+(\w+)/i
    ];
    
    for (const pattern of patterns) {
      const match = message.match(pattern);
      if (match) {
        return match[1].trim();
      }
    }
    
    return null;
  }

  /**
   * Research an app using web search
   */
  async researchApp(appName) {
    if (!this.webSearchTool) {
      throw new Error('Web search tool not available');
    }

    try {
      // Search for the app
      const searchQuery = `${appName} app features what does it do track`;
      const results = await this.webSearchTool(searchQuery);
      
      if (!results || results.length === 0) {
        return null;
      }

      // Extract information from search results
      const appInfo = {
        name: appName,
        description: '',
        type: 'custom',
        features: [],
        metrics: [],
        categories: []
      };

      // Analyze search results to determine app type and features
      const allText = results.map(r => `${r.title} ${r.snippet}`).join(' ').toLowerCase();
      
      // Determine app type based on keywords
      for (const [type, config] of Object.entries(APP_TYPES)) {
        const score = config.patterns.reduce((acc, pattern) => {
          const regex = new RegExp(pattern, 'gi');
          const matches = allText.match(regex) || [];
          return acc + matches.length;
        }, 0);
        
        if (score > 0 && (appInfo.type === 'custom' || score > appInfo.typeScore)) {
          appInfo.type = type;
          appInfo.typeScore = score;
        }
      }

      // Extract description from first result
      appInfo.description = results[0]?.snippet || `${appName} tracking app`;

      // Extract features and metrics based on app type
      const typeConfig = APP_TYPES[appInfo.type];
      appInfo.features = typeConfig.examples;
      appInfo.metrics = typeConfig.commonMetrics;
      appInfo.skillTypes = typeConfig.skillTypes;
      appInfo.defaultGoals = typeConfig.defaultGoals;

      // Look for specific features in the text
      const featurePatterns = {
        streaks: /streak|consecutive|chain/gi,
        reminders: /reminder|notification|alert/gi,
        goals: /goal|target|objective/gi,
        analytics: /analytics|stats|report|chart/gi,
        social: /share|friend|community|social/gi,
        export: /export|backup|data/gi
      };

      for (const [feature, pattern] of Object.entries(featurePatterns)) {
        if (pattern.test(allText)) {
          appInfo.features.push(feature);
        }
      }

      return appInfo;
    } catch (error) {
      console.error(`Research failed for ${appName}:`, error.message);
      return null;
    }
  }

  /**
   * Generate skill suggestions based on app research
   */
  generateSkillSuggestions(appInfo) {
    if (!appInfo) {
      return [];
    }

    const typeConfig = APP_TYPES[appInfo.type];
    const suggestions = [];

    // For each potential skill type, create a suggestion
    for (const skillType of typeConfig.skillTypes) {
      const suggestion = {
        name: `${appInfo.name} ${skillType}`,
        type: skillType,
        description: `Track ${appInfo.description} using ${skillType} data`,
        triggers: [appInfo.name.toLowerCase(), skillType],
        examples: this.generateExamples(appInfo.name, skillType, typeConfig),
        goals: typeConfig.defaultGoals
      };

      suggestions.push(suggestion);
    }

    // Add specific suggestions based on app type
    switch (appInfo.type) {
      case 'habit':
        suggestions.push({
          name: `${appInfo.name} streak`,
          type: 'counter',
          description: `Track daily streak for ${appInfo.name}`,
          triggers: ['streak', appInfo.name.toLowerCase()],
          examples: [`${appInfo.name.toLowerCase()} done`, `completed ${appInfo.name.toLowerCase()}`],
          goals: { daily: 1 }
        });
        break;
        
      case 'fitness':
        if (!suggestions.some(s => s.type === 'number')) {
          suggestions.push({
            name: `${appInfo.name} metrics`,
            type: 'number',
            description: `Track numeric fitness metrics from ${appInfo.name}`,
            triggers: ['steps', 'calories', 'weight', appInfo.name.toLowerCase()],
            examples: ['10000 steps', '500 calories', 'weight 70kg'],
            goals: { daily: 1 }
          });
        }
        break;
        
      case 'mood':
        suggestions.push({
          name: `${appInfo.name} mood`,
          type: 'scale',
          description: `Track mood on a scale of 1-10`,
          triggers: ['mood', 'feeling', appInfo.name.toLowerCase()],
          examples: ['mood 8', 'feeling 6'],
          goals: { daily: 1 }
        });
        break;
    }

    return suggestions.slice(0, 3); // Limit to top 3 suggestions
  }

  /**
   * Generate examples for a skill type
   */
  generateExamples(appName, skillType, typeConfig) {
    const name = appName.toLowerCase();
    
    switch (skillType) {
      case 'number':
        return [`${name} 100`, `logged ${name}: 50`, `${name} amount 25`];
      case 'counter':
        return [`${name} done`, `completed ${name}`, `${name} +1`];
      case 'scale':
        return [`${name} 7`, `${name} level 8`, `${name} score 6`];
      case 'duration':
        return [`${name} 30 minutes`, `${name} 1 hour`, `spent 45m on ${name}`];
      case 'text':
        return [`${name} notes: feeling great`, `${name}: productive day`, `${name} update`];
      case 'activity':
        return [`did ${name}`, `${name} session completed`, `${name} workout`];
      default:
        return [`${name} entry`, `logged ${name}`, `${name} update`];
    }
  }

  /**
   * Start an intelligent replacement conversation
   */
  async startReplacement(chatId, appName) {
    try {
      // Research the app
      const appInfo = await this.researchApp(appName);
      
      if (!appInfo) {
        return {
          response: `I couldn't find information about "${appName}". Could you tell me what kind of app it is? (habit tracker, fitness app, mood tracker, etc.)`,
          needsInput: true
        };
      }

      // Generate skill suggestions
      const suggestions = this.generateSkillSuggestions(appInfo);
      
      // Store session
      this.sessions.set(chatId, {
        appName,
        appInfo,
        suggestions,
        state: 'awaiting_selection',
        startedAt: Date.now()
      });

      // Build response
      let response = `🔍 I researched "${appName}" and found it's a ${APP_TYPES[appInfo.type].description} app.\n\n`;
      response += `I can create these skills to replace it:\n\n`;
      
      suggestions.forEach((suggestion, i) => {
        response += `${i + 1}. **${suggestion.name}** (${suggestion.type})\n`;
        response += `   ${suggestion.description}\n`;
        response += `   Examples: ${suggestion.examples.slice(0, 2).join(', ')}\n\n`;
      });

      response += `Which skills would you like me to create? (say "all", pick numbers like "1,3", or "cancel")`;

      // Ask clarifying questions based on app type
      if (appInfo.type === 'habit') {
        response += `\n\n💡 What specific habits do you track with ${appName}? I can create individual skills for each.`;
      } else if (appInfo.type === 'fitness') {
        response += `\n\n💡 What metrics do you track? (steps, calories, workouts, weight, etc.)`;
      } else if (appInfo.type === 'mood') {
        response += `\n\n💡 What aspects of your mood/wellbeing do you track?`;
      }

      return { response, needsInput: true };
      
    } catch (error) {
      return {
        response: `❌ Failed to research "${appName}": ${error.message}. Could you tell me what it does?`,
        needsInput: true
      };
    }
  }

  /**
   * Process user response in replacement conversation
   */
  async processReplacementResponse(chatId, message) {
    const session = this.sessions.get(chatId);
    if (!session) {
      return { response: 'No active replacement session found.', done: true };
    }

    const lower = message.toLowerCase().trim();

    // Cancel
    if (lower === 'cancel' || lower === 'nevermind' || lower === 'stop') {
      this.sessions.delete(chatId);
      return { response: 'Replacement cancelled.', done: true };
    }

    switch (session.state) {
      case 'awaiting_selection':
        return this.handleSkillSelection(chatId, message, session);
      
      case 'awaiting_details':
        return this.handleSkillDetails(chatId, message, session);
      
      case 'awaiting_import':
        return this.handleDataImport(chatId, message, session);
      
      default:
        this.sessions.delete(chatId);
        return { response: 'Session expired. Please start over.', done: true };
    }
  }

  /**
   * Handle skill selection
   */
  async handleSkillSelection(chatId, message, session) {
    const lower = message.toLowerCase().trim();
    let selectedIndices = [];

    if (lower === 'all' || lower === 'yes' || lower === 'create all') {
      selectedIndices = session.suggestions.map((_, i) => i);
    } else {
      // Parse numbers like "1,3" or "1 2 3"
      const numbers = message.match(/\d+/g);
      if (numbers) {
        selectedIndices = numbers
          .map(n => parseInt(n) - 1)
          .filter(i => i >= 0 && i < session.suggestions.length);
      }
    }

    if (selectedIndices.length === 0) {
      return {
        response: 'Please select which skills to create (numbers like "1,2" or say "all"):',
        needsInput: true
      };
    }

    session.selectedSkills = selectedIndices.map(i => session.suggestions[i]);
    
    // For habit and custom types, ask for more details
    if (session.appInfo.type === 'habit' || session.appInfo.type === 'custom') {
      session.state = 'awaiting_details';
      return {
        response: `Great! Now tell me what specific things you want to track. For example:\n"I track water intake, exercise, and reading"\n\nThis helps me create more targeted skills with better triggers and examples.`,
        needsInput: true
      };
    }

    // Create skills directly for well-defined types
    return this.createSelectedSkills(chatId, session);
  }

  /**
   * Handle specific skill details
   */
  async handleSkillDetails(chatId, message, session) {
    // Parse specific items from the message
    const items = message
      .split(/[,\n&]/)
      .map(item => item.trim())
      .filter(item => item.length > 2);

    if (items.length === 0) {
      return {
        response: 'Please tell me what specific things you want to track, separated by commas.',
        needsInput: true
      };
    }

    // Create individual skills for each item
    session.specificItems = items;
    return this.createSpecificSkills(chatId, session);
  }

  /**
   * Create skills for specific items
   */
  async createSpecificSkills(chatId, session) {
    const createdSkills = [];
    const { appInfo, specificItems } = session;

    try {
      for (const item of specificItems) {
        const skillType = this.determineSkillType(item, appInfo.type);
        const skill = await this.createSkillFromItem(item, skillType, appInfo);
        
        if (skill) {
          createdSkills.push(skill);
        }
      }

      // Offer data import
      session.state = 'awaiting_import';
      session.createdSkills = createdSkills;

      let response = `🎉 Created ${createdSkills.length} skills:\n\n`;
      createdSkills.forEach(skill => {
        response += `• **${skill.name}** (${skill.triggers.join(', ')})\n`;
      });

      response += `\n📊 Do you have data to import from ${session.appName}? If you can export your data (CSV, JSON), I can import it! (say "yes" or "no")`;

      return { response, needsInput: true };

    } catch (error) {
      this.sessions.delete(chatId);
      return {
        response: `❌ Failed to create skills: ${error.message}`,
        done: true
      };
    }
  }

  /**
   * Create selected skills
   */
  async createSelectedSkills(chatId, session) {
    const createdSkills = [];
    
    try {
      for (const suggestion of session.selectedSkills) {
        const skill = await this.createSkillFromSuggestion(suggestion, session.appInfo);
        if (skill) {
          createdSkills.push(skill);
        }
      }

      session.createdSkills = createdSkills;
      session.state = 'awaiting_import';

      let response = `🎉 Created ${createdSkills.length} skills:\n\n`;
      createdSkills.forEach(skill => {
        response += `• **${skill.name}** - Try: "${skill.triggers[0]} ..."\n`;
      });

      response += `\n📊 Do you have data to import from ${session.appName}? (say "yes" or "no")`;

      return { response, needsInput: true };

    } catch (error) {
      this.sessions.delete(chatId);
      return {
        response: `❌ Failed to create skills: ${error.message}`,
        done: true
      };
    }
  }

  /**
   * Handle data import question
   */
  async handleDataImport(chatId, message, session) {
    const lower = message.toLowerCase().trim();

    if (lower === 'no' || lower === 'skip' || lower === 'nope') {
      this.sessions.delete(chatId);
      return {
        response: `✅ All done! Your ${session.appName} replacement skills are ready to use.\n\nTip: Try saying something like "${session.createdSkills[0]?.triggers[0] || 'track'} ..." to start logging data.`,
        done: true
      };
    }

    if (lower === 'yes' || lower === 'yeah' || lower === 'sure') {
      this.sessions.delete(chatId);
      return {
        response: `📁 Great! To import your data:\n\n1. Export your data from ${session.appName} (usually in Settings → Export/Backup)\n2. Upload the file here\n3. I'll automatically parse and import it to your new skills\n\nSupported formats: CSV, JSON, XML\n\nJust drag and drop the file when you have it!`,
        done: true
      };
    }

    return {
      response: 'Please say "yes" to set up data import or "no" to finish.',
      needsInput: true
    };
  }

  /**
   * Create a skill from a suggestion
   */
  async createSkillFromSuggestion(suggestion, appInfo) {
    const skillData = {
      name: suggestion.name,
      description: suggestion.description,
      triggers: suggestion.triggers,
      dataType: suggestion.type,
      schema: this.getSchemaForType(suggestion.type),
      goal: suggestion.goals?.daily,
      goalUnit: this.getUnitForType(suggestion.type, appInfo.type)
    };

    return this.sm.createSkill(skillData.name, skillData);
  }

  /**
   * Create a skill from a specific item
   */
  async createSkillFromItem(item, skillType, appInfo) {
    const name = item;
    const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const triggers = [name.toLowerCase(), id];

    // Add common variations
    if (name.includes(' ')) {
      triggers.push(name.split(' ')[0].toLowerCase());
    }

    const skillData = {
      name,
      description: `Track ${name.toLowerCase()} (migrated from ${appInfo.name})`,
      triggers,
      dataType: skillType,
      schema: this.getSchemaForType(skillType),
      goal: this.getDefaultGoal(skillType, appInfo.type),
      goalUnit: this.getUnitForType(skillType, appInfo.type)
    };

    return this.sm.createSkill(skillData.name, skillData);
  }

  /**
   * Determine appropriate skill type for an item
   */
  determineSkillType(item, appType) {
    const lower = item.toLowerCase();
    
    // Specific patterns
    if (/water|drink|cup|glass|bottle|ml|oz|liter/.test(lower)) return 'number';
    if (/exercise|workout|gym|run|walk|minute|hour|time/.test(lower)) return 'duration';
    if (/mood|feeling|energy|stress|level|rate|score/.test(lower)) return 'scale';
    if (/read|page|book|chapter|study/.test(lower)) return 'number';
    if (/journal|note|thought|idea|gratitude/.test(lower)) return 'text';
    if (/habit|daily|routine|done|complete/.test(lower)) return 'counter';
    
    // Default by app type
    const typeDefaults = {
      habit: 'counter',
      fitness: 'number',
      mood: 'scale',
      time: 'duration',
      finance: 'number',
      health: 'scale',
      custom: 'number'
    };

    return typeDefaults[appType] || 'number';
  }

  /**
   * Get schema for skill type
   */
  getSchemaForType(type) {
    const schemas = {
      number: { type: 'numeric', fields: ['value', 'note'] },
      counter: { type: 'counter', fields: ['count', 'note'] },
      scale: { type: 'scale', range: [1, 10], fields: ['score', 'note'] },
      duration: { type: 'duration', unit: 'minutes', fields: ['duration', 'activity', 'note'] },
      text: { type: 'text', fields: ['content', 'tags'] },
      activity: { type: 'activity', fields: ['type', 'details', 'note'] }
    };

    return schemas[type] || schemas.number;
  }

  /**
   * Get appropriate unit for skill type and app type
   */
  getUnitForType(skillType, appType) {
    if (skillType === 'duration') return 'minutes';
    if (skillType === 'scale') return 'points';
    if (skillType === 'counter') return 'times';
    
    const appUnits = {
      fitness: 'units',
      finance: 'USD',
      health: 'units',
      habit: 'times'
    };

    return appUnits[appType] || 'units';
  }

  /**
   * Get default goal for skill type and app type
   */
  getDefaultGoal(skillType, appType) {
    const goals = {
      habit: { counter: 1, number: 1, scale: 1, duration: 30, text: 1, activity: 1 },
      fitness: { counter: 1, number: 10000, scale: 8, duration: 60, text: 1, activity: 1 },
      mood: { counter: 1, number: 3, scale: 7, duration: 10, text: 1, activity: 1 },
      time: { counter: 1, number: 8, scale: 8, duration: 480, text: 1, activity: 1 },
      finance: { counter: 1, number: 100, scale: 8, duration: 60, text: 1, activity: 1 },
      health: { counter: 1, number: 1, scale: 8, duration: 30, text: 1, activity: 1 }
    };

    return goals[appType]?.[skillType] || 1;
  }

  /**
   * Import data from exported file
   */
  async importData(skillId, filePath, format = 'auto') {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      
      // Auto-detect format if not specified
      if (format === 'auto') {
        const ext = path.extname(filePath).toLowerCase();
        format = ext === '.csv' ? 'csv' : ext === '.json' ? 'json' : 'csv';
      }

      const parser = EXPORT_FORMATS[format]?.parse;
      if (!parser) {
        throw new Error(`Unsupported format: ${format}`);
      }

      const entries = await parser(content);
      
      // Import entries to skill
      let importCount = 0;
      for (const entry of entries) {
        await this.sm.addEntry(skillId, entry);
        importCount++;
      }

      return {
        success: true,
        imported: importCount,
        total: entries.length
      };

    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Check if currently in a replacement session
   */
  isInSession(chatId) {
    return this.sessions.has(chatId);
  }

  /**
   * Get session state for UI
   */
  getSessionState(chatId) {
    const session = this.sessions.get(chatId);
    return session ? {
      appName: session.appName,
      state: session.state,
      startedAt: session.startedAt
    } : null;
  }

  /**
   * Clear/cancel a session
   */
  clearSession(chatId) {
    this.sessions.delete(chatId);
  }
}

/**
 * CSV parser for data import
 */
async function parseCsvData(content) {
  const lines = content.split('\n').filter(line => line.trim());
  if (lines.length < 2) return [];

  const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
  const entries = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map(v => v.trim());
    const entry = {};

    // Map common column names
    headers.forEach((header, index) => {
      const value = values[index];
      if (!value) return;

      switch (header) {
        case 'date':
        case 'timestamp':
        case 'time':
          entry.date = new Date(value).toISOString().split('T')[0];
          entry.timestamp = new Date(value).getTime();
          break;
        case 'value':
        case 'amount':
        case 'count':
        case 'score':
        case 'rating':
          entry.value = parseFloat(value) || 0;
          break;
        case 'note':
        case 'notes':
        case 'comment':
        case 'description':
          entry.note = value;
          break;
        case 'type':
        case 'category':
          entry.type = value;
          break;
        default:
          entry[header] = value;
      }
    });

    if (Object.keys(entry).length > 0) {
      entries.push(entry);
    }
  }

  return entries;
}

/**
 * JSON parser for data import
 */
async function parseJsonData(content) {
  const data = JSON.parse(content);
  
  if (Array.isArray(data)) {
    return data.map(item => normalizeEntry(item));
  }
  
  // Handle nested structures
  if (data.entries) return data.entries.map(item => normalizeEntry(item));
  if (data.data) return data.data.map(item => normalizeEntry(item));
  if (data.logs) return data.logs.map(item => normalizeEntry(item));
  
  return [normalizeEntry(data)];
}

/**
 * XML parser for data import (basic)
 */
async function parseXmlData(content) {
  // Simple XML parsing - would need proper XML parser for complex structures
  const entries = [];
  const entryRegex = /<entry[^>]*>(.*?)<\/entry>/gs;
  let match;

  while ((match = entryRegex.exec(content)) !== null) {
    const entryXml = match[1];
    const entry = {};

    // Extract common fields
    const fieldRegex = /<(\w+)>([^<]+)<\/\1>/g;
    let fieldMatch;
    
    while ((fieldMatch = fieldRegex.exec(entryXml)) !== null) {
      const [, key, value] = fieldMatch;
      entry[key.toLowerCase()] = value;
    }

    if (Object.keys(entry).length > 0) {
      entries.push(normalizeEntry(entry));
    }
  }

  return entries;
}

/**
 * Normalize entry format for import
 */
function normalizeEntry(item) {
  const entry = {};

  // Handle timestamp/date
  if (item.timestamp) {
    entry.timestamp = new Date(item.timestamp).getTime();
    entry.date = new Date(item.timestamp).toISOString().split('T')[0];
  } else if (item.date) {
    entry.date = new Date(item.date).toISOString().split('T')[0];
    entry.timestamp = new Date(item.date).getTime();
  } else {
    const now = new Date();
    entry.date = now.toISOString().split('T')[0];
    entry.timestamp = now.getTime();
  }

  // Handle value/amount/score
  if (item.value !== undefined) entry.value = parseFloat(item.value) || 0;
  else if (item.amount !== undefined) entry.value = parseFloat(item.amount) || 0;
  else if (item.count !== undefined) entry.value = parseFloat(item.count) || 0;
  else if (item.score !== undefined) entry.value = parseFloat(item.score) || 0;

  // Handle note/comment
  if (item.note) entry.note = item.note;
  else if (item.notes) entry.note = item.notes;
  else if (item.comment) entry.note = item.comment;
  else if (item.description) entry.note = item.description;

  // Handle type/category
  if (item.type) entry.type = item.type;
  else if (item.category) entry.type = item.category;

  return entry;
}

export default IntelligentCreator;