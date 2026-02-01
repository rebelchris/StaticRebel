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
  // CRM and Relationship Management
  crm: {
    patterns: ['crm', 'contact', 'relationship', 'network', 'client', 'customer', 'lead', 
              'sales', 'pipeline', 'follow-up', 'interaction', 'communication', 'linkedin',
              'email', 'calendar', 'reminder', 'meeting', 'call', 'professional', 'personal'],
    description: 'Customer Relationship Management and networking',
    skillTypes: ['contact', 'interaction', 'reminder', 'followup'],
    commonMetrics: ['contact_count', 'interaction_frequency', 'relationship_strength', 'follow_up_rate'],
    defaultGoals: { daily: 3, weekly: 15, monthly: 50 },
    examples: ['contacts', 'interactions', 'follow-ups', 'reminders', 'meetings', 'calls'],
    multiSkill: true,
    requiredSkills: [
      {
        name: 'contacts',
        type: 'contact',
        fields: ['name', 'company', 'role', 'email', 'phone', 'linkedin', 'notes', 'last_contact', 'relationship_strength'],
        description: 'Manage personal and professional contacts'
      },
      {
        name: 'interactions',
        type: 'interaction', 
        fields: ['contact_ref', 'type', 'date', 'notes', 'follow_up_date', 'outcome'],
        description: 'Track interactions and communications'
      },
      {
        name: 'reminders',
        type: 'reminder',
        fields: ['contact_ref', 'reminder_type', 'due_date', 'completed', 'priority'],
        description: 'Set follow-up reminders and tasks'
      }
    ]
  },

  // Notes and Knowledge Management  
  notes: {
    patterns: ['note', 'knowledge', 'bookmark', 'snippet', 'clip', 'save', 'research',
              'article', 'link', 'idea', 'thought', 'reference', 'documentation', 'wiki'],
    description: 'Notes and knowledge management',
    skillTypes: ['note', 'bookmark', 'snippet', 'reference'],
    commonMetrics: ['note_count', 'bookmark_count', 'tags_used', 'search_frequency'],
    defaultGoals: { daily: 5, weekly: 25, monthly: 100 },
    examples: ['notes', 'bookmarks', 'snippets', 'references', 'ideas'],
    multiSkill: true,
    requiredSkills: [
      {
        name: 'notes',
        type: 'note',
        fields: ['title', 'content', 'tags', 'source', 'date_created', 'category'],
        description: 'Capture and organize notes and ideas'
      },
      {
        name: 'bookmarks',
        type: 'bookmark', 
        fields: ['url', 'title', 'description', 'tags', 'category', 'date_added'],
        description: 'Save and categorize web bookmarks'
      },
      {
        name: 'snippets',
        type: 'snippet',
        fields: ['title', 'code', 'language', 'description', 'tags', 'usage'],
        description: 'Store code snippets and templates'
      }
    ]
  },

  // Project Management
  projects: {
    patterns: ['project', 'task', 'todo', 'milestone', 'deadline', 'goal', 'objective',
              'assignment', 'deliverable', 'progress', 'status', 'timeline', 'roadmap'],
    description: 'Project and task management',
    skillTypes: ['project', 'task', 'milestone', 'deadline'],
    commonMetrics: ['project_count', 'task_completion', 'milestone_reached', 'deadline_met'],
    defaultGoals: { daily: 5, weekly: 25, monthly: 100 },
    examples: ['projects', 'tasks', 'milestones', 'deadlines'],
    multiSkill: true,
    requiredSkills: [
      {
        name: 'projects',
        type: 'project',
        fields: ['name', 'description', 'status', 'priority', 'start_date', 'end_date', 'progress'],
        description: 'Manage projects and initiatives'
      },
      {
        name: 'tasks',
        type: 'task',
        fields: ['project_ref', 'title', 'description', 'status', 'priority', 'due_date', 'assigned_to'],
        description: 'Track tasks and assignments'
      },
      {
        name: 'milestones',
        type: 'milestone',
        fields: ['project_ref', 'title', 'description', 'target_date', 'achieved', 'notes'],
        description: 'Set and track project milestones'
      }
    ]
  },

  // Social Media and Engagement
  social: {
    patterns: ['social', 'connection', 'follower', 'engagement', 'post', 'share', 'like',
              'comment', 'message', 'dm', 'mention', 'hashtag', 'influence', 'reach'],
    description: 'Social media and engagement tracking',
    skillTypes: ['connection', 'post', 'engagement', 'message'],
    commonMetrics: ['connection_count', 'engagement_rate', 'post_frequency', 'reach'],
    defaultGoals: { daily: 10, weekly: 50, monthly: 200 },
    examples: ['connections', 'posts', 'engagements', 'messages'],
    multiSkill: true,
    requiredSkills: [
      {
        name: 'connections',
        type: 'connection',
        fields: ['name', 'platform', 'username', 'relationship', 'last_interaction', 'influence_score'],
        description: 'Track social media connections'
      },
      {
        name: 'posts',
        type: 'post',
        fields: ['platform', 'content', 'type', 'hashtags', 'engagement', 'reach'],
        description: 'Track social media posts and content'
      },
      {
        name: 'engagements',
        type: 'engagement',
        fields: ['platform', 'type', 'target_user', 'content', 'response', 'date'],
        description: 'Track social engagements and interactions'
      }
    ]
  },

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
 * Feature extraction patterns for parsing complex descriptions
 */
const FEATURE_PATTERNS = {
  // CRM and networking features
  'centralize contacts': { type: 'crm', feature: 'contacts', keywords: ['centralize', 'manage', 'organize', 'store'] },
  'track interactions': { type: 'crm', feature: 'interactions', keywords: ['track', 'log', 'record', 'communication'] },
  'follow-up reminders': { type: 'crm', feature: 'reminders', keywords: ['follow-up', 'reminder', 'alert', 'notify'] },
  'linkedin integration': { type: 'crm', feature: 'linkedin', keywords: ['linkedin', 'professional', 'network'] },
  'email tracking': { type: 'crm', feature: 'email', keywords: ['email', 'correspondence', 'message'] },
  'calendar sync': { type: 'crm', feature: 'calendar', keywords: ['calendar', 'schedule', 'appointment'] },
  'relationship strength': { type: 'crm', feature: 'relationships', keywords: ['relationship', 'strength', 'score', 'rating'] },
  'professional network': { type: 'crm', feature: 'network', keywords: ['professional', 'business', 'work'] },
  'personal network': { type: 'crm', feature: 'network', keywords: ['personal', 'friend', 'family'] },

  // Notes and knowledge features  
  'save bookmarks': { type: 'notes', feature: 'bookmarks', keywords: ['bookmark', 'save', 'link', 'url'] },
  'clip articles': { type: 'notes', feature: 'clips', keywords: ['clip', 'article', 'web', 'content'] },
  'code snippets': { type: 'notes', feature: 'snippets', keywords: ['code', 'snippet', 'template', 'script'] },
  'research notes': { type: 'notes', feature: 'research', keywords: ['research', 'study', 'investigation'] },
  'knowledge base': { type: 'notes', feature: 'knowledge', keywords: ['knowledge', 'base', 'wiki', 'documentation'] },

  // Project management features
  'manage tasks': { type: 'projects', feature: 'tasks', keywords: ['task', 'todo', 'assignment', 'work'] },
  'track milestones': { type: 'projects', feature: 'milestones', keywords: ['milestone', 'checkpoint', 'achievement'] },
  'set deadlines': { type: 'projects', feature: 'deadlines', keywords: ['deadline', 'due', 'target', 'timeline'] },
  'project progress': { type: 'projects', feature: 'progress', keywords: ['progress', 'status', 'completion'] },

  // Social features
  'track connections': { type: 'social', feature: 'connections', keywords: ['connection', 'follower', 'friend'] },
  'engagement metrics': { type: 'social', feature: 'engagement', keywords: ['engagement', 'like', 'comment', 'share'] },
  'post scheduling': { type: 'social', feature: 'posts', keywords: ['post', 'share', 'publish', 'content'] },
  'social analytics': { type: 'social', feature: 'analytics', keywords: ['analytics', 'metrics', 'stats', 'performance'] }
};

/**
 * Complex description parser patterns
 */
const DESCRIPTION_PATTERNS = {
  // Multi-feature patterns
  'and': /\s+and\s+/gi,
  'or': /\s+or\s+/gi, 
  ',': /\s*,\s*/g,
  'also': /\s+also\s+/gi,
  'plus': /\s+plus\s+/gi,

  // Action verbs that indicate features
  actions: [
    'manage', 'track', 'organize', 'centralize', 'store', 'save', 'collect',
    'monitor', 'log', 'record', 'capture', 'gather', 'maintain', 'sync',
    'schedule', 'remind', 'notify', 'alert', 'follow-up', 'connect',
    'analyze', 'measure', 'evaluate', 'assess', 'review', 'report'
  ],

  // Object nouns that indicate data types
  objects: [
    'contact', 'interaction', 'reminder', 'meeting', 'call', 'email', 'message',
    'note', 'bookmark', 'snippet', 'article', 'link', 'document', 'file',
    'task', 'project', 'milestone', 'deadline', 'goal', 'objective',
    'connection', 'follower', 'post', 'engagement', 'comment', 'like'
  ],

  // Relationship words
  relationships: [
    'personal', 'professional', 'business', 'work', 'client', 'customer',
    'friend', 'family', 'colleague', 'partner', 'vendor', 'supplier'
  ]
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
   * Check if a message is requesting app replacement or complex skill creation
   */
  isReplacementRequest(message) {
    const lower = message.toLowerCase();
    const patterns = [
      // App replacement patterns
      /(?:replace|substitute|alternative to|instead of|similar to)\s+(.+)/i,
      /i(?:'m|\s+am)?\s+using\s+(\w+).*?(?:replace|alternative|skill)/i,
      /can you create.*?(?:replace|alternative to|instead of)\s+(.+)/i,
      /(?:migrate from|switch from)\s+(\w+)/i,
      /create.*?skill.*?(?:like|similar to)\s+(.+)/i,
      
      // Complex skill creation patterns
      /create.*?skill.*?(?:that would|to)\s+(.+)/i,
      /(?:build|make|design).*?skill.*?(?:for|to)\s+(.+)/i,
      /(?:help|manage|track|organize).*?(?:personal|professional|business)\s+(.+)/i,
      /(?:crm|relationship|contact|network).*?(?:manager|management|tracking)/i,
      /centralize.*?(?:contacts|information|data)/i,
      /track.*?interactions/i,
      /follow-up.*?remind/i,
      /manage.*?(?:relationships|network|contacts)/i
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
   * Parse complex descriptions to extract features and determine app type
   */
  parseComplexDescription(description) {
    const lower = description.toLowerCase();
    const features = new Set();
    const appTypes = new Set();
    
    // Extract features using patterns
    for (const [featurePhrase, config] of Object.entries(FEATURE_PATTERNS)) {
      if (lower.includes(featurePhrase.toLowerCase()) || 
          config.keywords.some(keyword => lower.includes(keyword))) {
        features.add(config.feature);
        appTypes.add(config.type);
      }
    }

    // Split description by delimiters to find individual features
    const segments = lower.split(/\s*(?:and|,|or|\+|also|plus|-)\s*/)
      .map(s => s.trim())
      .filter(s => s.length > 3);

    for (const segment of segments) {
      // Check for action + object combinations
      for (const action of DESCRIPTION_PATTERNS.actions) {
        for (const object of DESCRIPTION_PATTERNS.objects) {
          if (segment.includes(action) && segment.includes(object)) {
            // Determine feature type based on object
            if (['contact', 'interaction', 'meeting', 'call', 'email'].includes(object)) {
              features.add(object + 's');
              appTypes.add('crm');
            } else if (['note', 'bookmark', 'snippet', 'article'].includes(object)) {
              features.add(object + 's');
              appTypes.add('notes');
            } else if (['task', 'project', 'milestone', 'deadline'].includes(object)) {
              features.add(object + 's'); 
              appTypes.add('projects');
            } else if (['connection', 'post', 'engagement', 'follower'].includes(object)) {
              features.add(object + 's');
              appTypes.add('social');
            }
          }
        }
      }

      // Check for specific CRM indicators
      if (['crm', 'relationship', 'network', 'professional', 'linkedin', 'follow-up'].some(term => segment.includes(term))) {
        appTypes.add('crm');
      }
    }

    // Default to custom if no specific type detected
    if (appTypes.size === 0) {
      appTypes.add('custom');
    }

    // Determine primary app type (prioritize complex types)
    let primaryType = 'custom';
    if (appTypes.has('crm')) primaryType = 'crm';
    else if (appTypes.has('notes')) primaryType = 'notes';
    else if (appTypes.has('projects')) primaryType = 'projects';
    else if (appTypes.has('social')) primaryType = 'social';
    else if (appTypes.size > 0) primaryType = Array.from(appTypes)[0];

    return {
      primaryType,
      appTypes: Array.from(appTypes),
      features: Array.from(features),
      isComplex: features.size > 2 || appTypes.size > 1,
      requiresMultipleSkills: APP_TYPES[primaryType]?.multiSkill || false
    };
  }

  /**
   * Research an app using web search
   */
  async researchApp(appName, complexDescription = null) {
    try {
      let appInfo = {
        name: appName,
        description: '',
        type: 'custom',
        features: [],
        metrics: [],
        categories: [],
        isComplex: false,
        requiresMultipleSkills: false
      };

      // If we have a complex description, parse it first
      if (complexDescription) {
        const parsed = this.parseComplexDescription(complexDescription);
        appInfo.type = parsed.primaryType;
        appInfo.features = parsed.features;
        appInfo.isComplex = parsed.isComplex;
        appInfo.requiresMultipleSkills = parsed.requiresMultipleSkills;
        appInfo.description = complexDescription;
      }

      // Use web search to enhance understanding if web tool is available
      if (this.webSearchTool) {
        try {
          const searchQuery = appName ? 
            `${appName} app features what does it do track` :
            `CRM relationship management contact tracking software features`;
          
          const results = await this.webSearchTool(searchQuery);
          
          if (results && results.length > 0) {
            // Analyze search results to determine app type and features
            const allText = results.map(r => `${r.title} ${r.snippet}`).join(' ').toLowerCase();
            
            // If no complex description provided, determine type from search results
            if (!complexDescription) {
              let bestType = 'custom';
              let bestScore = 0;
              
              for (const [type, config] of Object.entries(APP_TYPES)) {
                const score = config.patterns.reduce((acc, pattern) => {
                  const regex = new RegExp(pattern, 'gi');
                  const matches = allText.match(regex) || [];
                  return acc + matches.length;
                }, 0);
                
                if (score > bestScore) {
                  bestType = type;
                  bestScore = score;
                }
              }
              
              appInfo.type = bestType;
            }

            // Extract description from search results
            if (!appInfo.description || appInfo.description === complexDescription) {
              appInfo.description = results[0]?.snippet || `${appName} application`;
            }

            // Look for additional features in search results
            const featurePatterns = {
              streaks: /streak|consecutive|chain/gi,
              reminders: /reminder|notification|alert/gi,
              goals: /goal|target|objective/gi,
              analytics: /analytics|stats|report|chart/gi,
              social: /share|friend|community|social/gi,
              export: /export|backup|data/gi,
              contacts: /contact|address|book|directory/gi,
              interactions: /interaction|communication|log|history/gi,
              calendar: /calendar|schedule|appointment|meeting/gi,
              linkedin: /linkedin|professional|network/gi
            };

            for (const [feature, pattern] of Object.entries(featurePatterns)) {
              if (pattern.test(allText) && !appInfo.features.includes(feature)) {
                appInfo.features.push(feature);
              }
            }
          }
        } catch (searchError) {
          console.warn(`Web search failed for ${appName}:`, searchError.message);
          // Continue without search results
        }
      }

      // Ensure we have the basic type configuration
      const typeConfig = APP_TYPES[appInfo.type];
      if (typeConfig) {
        // Merge with type-specific features if not already set
        if (appInfo.features.length === 0) {
          appInfo.features = [...typeConfig.examples];
        }
        appInfo.metrics = typeConfig.commonMetrics;
        appInfo.skillTypes = typeConfig.skillTypes;
        appInfo.defaultGoals = typeConfig.defaultGoals;
        appInfo.requiresMultipleSkills = typeConfig.multiSkill || false;
      }

      return appInfo;
    } catch (error) {
      console.error(`Research failed for ${appName}:`, error.message);
      
      // Return a basic fallback for complex descriptions
      if (complexDescription) {
        const parsed = this.parseComplexDescription(complexDescription);
        return {
          name: appName || 'Custom App',
          description: complexDescription,
          type: parsed.primaryType,
          features: parsed.features,
          isComplex: parsed.isComplex,
          requiresMultipleSkills: parsed.requiresMultipleSkills,
          skillTypes: APP_TYPES[parsed.primaryType]?.skillTypes || ['custom'],
          metrics: APP_TYPES[parsed.primaryType]?.commonMetrics || ['value'],
          defaultGoals: APP_TYPES[parsed.primaryType]?.defaultGoals || { daily: 1 }
        };
      }
      
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

    // For multi-skill apps (like CRM), create all required skills
    if (appInfo.requiresMultipleSkills && typeConfig.requiredSkills) {
      for (const skillConfig of typeConfig.requiredSkills) {
        const suggestion = {
          name: skillConfig.name,
          type: skillConfig.type,
          description: skillConfig.description,
          triggers: [skillConfig.name, skillConfig.type],
          examples: this.generateExamplesForSkillType(skillConfig.name, skillConfig.type, skillConfig.fields),
          goals: typeConfig.defaultGoals,
          fields: skillConfig.fields,
          isMultiSkill: true,
          requiredFor: appInfo.type
        };

        suggestions.push(suggestion);
      }
      return suggestions;
    }

    // For single-skill apps, generate based on skill types
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

    return suggestions.slice(0, appInfo.requiresMultipleSkills ? 10 : 3);
  }

  /**
   * Generate examples for specific skill types with fields
   */
  generateExamplesForSkillType(skillName, skillType, fields) {
    switch (skillType) {
      case 'contact':
        return [
          'add contact John Smith at Acme Corp',
          'john.smith@acme.com works at Acme Corp as CTO',
          'contact: Jane Doe, Product Manager, jane@startup.io'
        ];
      
      case 'interaction':
        return [
          'called John Smith about project proposal',
          'email with Jane about meeting follow-up', 
          'meeting with Bob at coffee shop, discussed partnership'
        ];
        
      case 'reminder':
        return [
          'remind to follow up with John next week',
          'set reminder: call Jane about project status',
          'follow up with Bob about proposal in 3 days'
        ];

      case 'note':
        return [
          'note: interesting article about AI trends',
          'meeting notes from client discussion',
          'idea: new feature for mobile app'
        ];
        
      case 'bookmark':
        return [
          'bookmark: https://example.com - great design resource',
          'save article: AI developments in healthcare',
          'bookmark this tutorial for later'
        ];
        
      case 'snippet':
        return [
          'code snippet: React hook for API calls',
          'save this JavaScript function',
          'snippet: SQL query for analytics'
        ];

      case 'project':
        return [
          'new project: Website Redesign',
          'project: Mobile App v2.0, due Dec 31',
          'start project: Marketing Campaign Q1'
        ];
        
      case 'task':
        return [
          'task: Design homepage mockup, due Friday',
          'add task: Review code PR #123',
          'task for John: Update documentation'
        ];
        
      case 'milestone':
        return [
          'milestone: Beta launch completed',
          'reached milestone: 1000 users signed up',
          'milestone: First client onboarded'
        ];

      case 'connection':
        return [
          'new LinkedIn connection: John Smith',
          'Twitter follower: @janedoe',
          'connection: Bob from networking event'
        ];
        
      case 'post':
        return [
          'posted on LinkedIn: New blog article',
          'shared on Twitter: Product update',
          'Instagram post: Behind the scenes'
        ];
        
      case 'engagement':
        return [
          'liked John\'s post about AI trends',
          'commented on Jane\'s article',
          'shared Bob\'s startup announcement'
        ];

      default:
        return [`${skillName} entry`, `logged ${skillName}`, `${skillName} update`];
    }
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
  async startReplacement(chatId, appNameOrDescription, fullMessage = null) {
    try {
      let appName = appNameOrDescription;
      let complexDescription = null;

      // Check if this is a complex description rather than just an app name
      if (fullMessage && this.parseComplexDescription(fullMessage).isComplex) {
        complexDescription = fullMessage;
        appName = this.extractAppName(fullMessage) || 'Custom App';
      } else if (appNameOrDescription && appNameOrDescription.length > 20) {
        // If the "app name" is very long, treat it as a complex description
        complexDescription = appNameOrDescription;
        appName = 'Custom App';
      }

      // Research the app/description
      const appInfo = await this.researchApp(appName, complexDescription);
      
      if (!appInfo) {
        return {
          response: `I couldn't find information about "${appName}". Could you tell me what kind of app it is or describe what you want to track?\n\nFor example:\n- "It's a habit tracker for daily routines"\n- "I want to manage contacts and track interactions"\n- "It helps me organize notes and bookmarks"`,
          needsInput: true
        };
      }

      // Generate skill suggestions
      const suggestions = this.generateSkillSuggestions(appInfo);
      
      // Store session
      this.sessions.set(chatId, {
        appName: appInfo.name,
        appInfo,
        suggestions,
        state: 'awaiting_selection',
        startedAt: Date.now(),
        isComplex: appInfo.isComplex || appInfo.requiresMultipleSkills
      });

      // Build response based on complexity
      let response;
      
      if (appInfo.requiresMultipleSkills) {
        response = `🎯 I understand you want to ${complexDescription ? 'create a system to ' + complexDescription.replace('Create a skill that would ', '').replace('create a skill that would ', '') : 'replace ' + appInfo.name}.\n\n`;
        response += `This requires multiple interconnected skills:\n\n`;
        
        suggestions.forEach((suggestion, i) => {
          response += `${i + 1}. **${suggestion.name}** - ${suggestion.description}\n`;
          response += `   Example: ${suggestion.examples[0]}\n\n`;
        });

        response += `These skills work together to provide a complete solution. Should I create all of them? (say "yes", "no", or pick specific numbers like "1,2")`;
        
        if (appInfo.type === 'crm') {
          response += `\n\n💡 **How it works:**\n- Add contacts with company/role info\n- Log calls, emails, meetings\n- Set automatic follow-up reminders\n- Track relationship strength over time`;
        }
        
      } else {
        response = `🔍 I ${appName !== 'Custom App' ? `researched "${appName}" and found it's` : 'analyzed your request and it\'s'} a ${APP_TYPES[appInfo.type].description} solution.\n\n`;
        response += `I can create these skills:\n\n`;
        
        suggestions.forEach((suggestion, i) => {
          response += `${i + 1}. **${suggestion.name}** (${suggestion.type})\n`;
          response += `   ${suggestion.description}\n`;
          response += `   Examples: ${suggestion.examples.slice(0, 2).join(', ')}\n\n`;
        });

        response += `Which skills would you like me to create? (say "all", pick numbers like "1,3", or "cancel")`;

        // Ask clarifying questions based on app type
        if (appInfo.type === 'habit') {
          response += `\n\n💡 What specific habits do you want to track? I can create individual skills for each.`;
        } else if (appInfo.type === 'fitness') {
          response += `\n\n💡 What metrics do you track? (steps, calories, workouts, weight, etc.)`;
        } else if (appInfo.type === 'mood') {
          response += `\n\n💡 What aspects of your mood/wellbeing do you track?`;
        } else if (appInfo.type === 'notes') {
          response += `\n\n💡 What types of information do you want to organize? (articles, code, research, etc.)`;
        } else if (appInfo.type === 'projects') {
          response += `\n\n💡 What kind of projects do you manage? (work, personal, team, etc.)`;
        } else if (appInfo.type === 'social') {
          response += `\n\n💡 Which platforms do you focus on? (LinkedIn, Twitter, Instagram, etc.)`;
        }
      }

      return { response, needsInput: true };
      
    } catch (error) {
      return {
        response: `❌ Failed to process request: ${error.message}. Could you describe what you want to track or manage?\n\nTry something like:\n- "Track my daily habits"\n- "Manage contacts and relationships"\n- "Organize my notes and bookmarks"`,
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
      schema: this.getSchemaForType(suggestion.type, suggestion.fields),
      goal: suggestion.goals?.daily,
      goalUnit: this.getUnitForType(suggestion.type, appInfo.type)
    };

    // Add fields for complex skill types
    if (suggestion.fields && suggestion.fields.length > 0) {
      skillData.fields = suggestion.fields;
    }

    // Add additional metadata for multi-skill setups
    if (suggestion.isMultiSkill) {
      skillData.isMultiSkill = true;
      skillData.requiredFor = suggestion.requiredFor;
    }

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
  getSchemaForType(type, customFields = null) {
    // If custom fields are provided, use them
    if (customFields && customFields.length > 0) {
      return {
        type: type,
        fields: customFields
      };
    }

    const schemas = {
      // Basic types
      number: { type: 'numeric', fields: ['value', 'note'] },
      counter: { type: 'counter', fields: ['count', 'note'] },
      scale: { type: 'scale', range: [1, 10], fields: ['score', 'note'] },
      duration: { type: 'duration', unit: 'minutes', fields: ['duration', 'activity', 'note'] },
      text: { type: 'text', fields: ['content', 'tags'] },
      activity: { type: 'activity', fields: ['type', 'details', 'note'] },

      // CRM types
      contact: { 
        type: 'contact', 
        fields: ['name', 'company', 'role', 'email', 'phone', 'linkedin', 'notes', 'last_contact', 'relationship_strength'] 
      },
      interaction: { 
        type: 'interaction', 
        fields: ['contact_ref', 'type', 'date', 'notes', 'follow_up_date', 'outcome'] 
      },
      reminder: { 
        type: 'reminder', 
        fields: ['contact_ref', 'reminder_type', 'due_date', 'completed', 'priority'] 
      },
      followup: { 
        type: 'followup', 
        fields: ['contact_ref', 'action_type', 'scheduled_date', 'completed', 'notes'] 
      },

      // Notes types
      note: { 
        type: 'note', 
        fields: ['title', 'content', 'tags', 'source', 'date_created', 'category'] 
      },
      bookmark: { 
        type: 'bookmark', 
        fields: ['url', 'title', 'description', 'tags', 'category', 'date_added'] 
      },
      snippet: { 
        type: 'snippet', 
        fields: ['title', 'code', 'language', 'description', 'tags', 'usage'] 
      },
      reference: { 
        type: 'reference', 
        fields: ['title', 'source', 'type', 'content', 'tags', 'relevance'] 
      },

      // Project types
      project: { 
        type: 'project', 
        fields: ['name', 'description', 'status', 'priority', 'start_date', 'end_date', 'progress'] 
      },
      task: { 
        type: 'task', 
        fields: ['project_ref', 'title', 'description', 'status', 'priority', 'due_date', 'assigned_to'] 
      },
      milestone: { 
        type: 'milestone', 
        fields: ['project_ref', 'title', 'description', 'target_date', 'achieved', 'notes'] 
      },
      deadline: { 
        type: 'deadline', 
        fields: ['project_ref', 'title', 'due_date', 'priority', 'status', 'consequences'] 
      },

      // Social types
      connection: { 
        type: 'connection', 
        fields: ['name', 'platform', 'username', 'relationship', 'last_interaction', 'influence_score'] 
      },
      post: { 
        type: 'post', 
        fields: ['platform', 'content', 'type', 'hashtags', 'engagement', 'reach'] 
      },
      engagement: { 
        type: 'engagement', 
        fields: ['platform', 'type', 'target_user', 'content', 'response', 'date'] 
      },
      message: { 
        type: 'message', 
        fields: ['platform', 'recipient', 'content', 'type', 'response', 'status'] 
      }
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