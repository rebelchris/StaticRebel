/**
 * Skill Teaching - Conversational flow for creating new skills
 * 
 * Guides users through creating custom skills via natural conversation:
 * 1. Detect intent to create skill
 * 2. Ask for name
 * 3. Ask for data type
 * 4. Ask for triggers
 * 5. Optionally set goals
 * 6. Create the skill
 */

import fs from 'fs/promises';
import path from 'path';

/**
 * Teaching session states
 */
const STATES = {
  IDLE: 'idle',
  AWAITING_NAME: 'awaiting_name',
  AWAITING_TYPE: 'awaiting_type',
  AWAITING_TRIGGERS: 'awaiting_triggers',
  AWAITING_GOAL: 'awaiting_goal',
  CONFIRMING: 'confirming'
};

/**
 * Data type templates
 */
const DATA_TYPES = {
  number: {
    label: 'Numbers',
    description: 'Track quantities (water ml, steps, pages read)',
    schema: { type: 'numeric', fields: ['value', 'note'] },
    examples: ['500ml water', '30 pages', '5000 steps']
  },
  counter: {
    label: 'Counter',
    description: 'Count occurrences (cups of coffee, snacks)',
    schema: { type: 'counter', fields: ['count', 'note'] },
    examples: ['had 2 coffees', '3 snacks today']
  },
  scale: {
    label: 'Scale (1-10)',
    description: 'Rate something (mood, energy, pain)',
    schema: { type: 'scale', range: [1, 10], fields: ['score', 'note'] },
    examples: ['energy 7', 'pain level 3']
  },
  duration: {
    label: 'Duration',
    description: 'Track time spent (exercise, focus, sleep)',
    schema: { type: 'duration', unit: 'minutes', fields: ['duration', 'activity', 'note'] },
    examples: ['30 minutes reading', '1 hour gym']
  },
  text: {
    label: 'Text/Notes',
    description: 'Free-form entries (journal, ideas, gratitude)',
    schema: { type: 'text', fields: ['content', 'tags'] },
    examples: ['grateful for sunny weather', 'idea: new app concept']
  },
  activity: {
    label: 'Activity',
    description: 'Log activities with details (workouts, meals)',
    schema: { type: 'activity', fields: ['type', 'details', 'note'] },
    examples: ['ran 5k', 'ate salad for lunch']
  }
};

/**
 * Phrases that indicate user wants to create a skill
 */
const TEACH_TRIGGERS = [
  'teach you', 'learn to track', 'track my', 'new skill',
  'create skill', 'add skill', 'can you track', 'start tracking',
  'want to track', 'help me track', 'teach to track'
];

/**
 * SkillTeacher - manages conversational skill creation
 */
export class SkillTeacher {
  constructor(skillManager, goalTracker) {
    this.sm = skillManager;
    this.goals = goalTracker;
    this.sessions = new Map(); // chatId -> session state
  }

  /**
   * Check if a message is trying to teach a new skill
   */
  isTeachingTrigger(message) {
    const lower = message.toLowerCase();
    return TEACH_TRIGGERS.some(t => lower.includes(t));
  }

  /**
   * Extract potential skill name from initial message
   */
  extractSkillHint(message) {
    const lower = message.toLowerCase();
    
    // Patterns like "track my X" or "teach you to track X"
    const patterns = [
      /track(?:ing)?\s+(?:my\s+)?(\w+(?:\s+\w+)?)/i,
      /teach.*?track\s+(?:my\s+)?(\w+(?:\s+\w+)?)/i,
      /new skill[:\s]+(\w+(?:\s+\w+)?)/i,
      /learn\s+(?:to\s+)?(\w+(?:\s+\w+)?)/i
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
   * Get or create a teaching session
   */
  getSession(chatId) {
    if (!this.sessions.has(chatId)) {
      this.sessions.set(chatId, {
        state: STATES.IDLE,
        draft: {},
        startedAt: null
      });
    }
    return this.sessions.get(chatId);
  }

  /**
   * Clear a teaching session
   */
  clearSession(chatId) {
    this.sessions.delete(chatId);
  }

  /**
   * Process a message in the teaching flow
   * Returns { response, done, skill? }
   */
  async processMessage(chatId, message) {
    const session = this.getSession(chatId);
    const lower = message.toLowerCase();

    // Cancel command
    if (lower === 'cancel' || lower === 'nevermind' || lower === 'stop') {
      this.clearSession(chatId);
      return { response: 'No problem! Skill creation cancelled.', done: true };
    }

    // State machine
    switch (session.state) {
      case STATES.IDLE:
        return this.handleIdle(chatId, message, session);
      
      case STATES.AWAITING_NAME:
        return this.handleName(chatId, message, session);
      
      case STATES.AWAITING_TYPE:
        return this.handleType(chatId, message, session);
      
      case STATES.AWAITING_TRIGGERS:
        return this.handleTriggers(chatId, message, session);
      
      case STATES.AWAITING_GOAL:
        return this.handleGoal(chatId, message, session);
      
      case STATES.CONFIRMING:
        return this.handleConfirm(chatId, message, session);
      
      default:
        this.clearSession(chatId);
        return { response: 'Something went wrong. Let\'s start over.', done: true };
    }
  }

  /**
   * Handle idle state - start teaching flow
   */
  handleIdle(chatId, message, session) {
    if (!this.isTeachingTrigger(message)) {
      return { response: null, done: true }; // Not a teaching request
    }

    session.startedAt = Date.now();
    session.draft = {};

    // Try to extract skill hint from message
    const hint = this.extractSkillHint(message);
    
    if (hint) {
      session.draft.nameHint = hint;
      session.state = STATES.AWAITING_NAME;
      return {
        response: `📚 Let's create a skill to track "${hint}"!\n\nWhat should I call this skill? (or just say "yes" to use "${hint}")`,
        done: false
      };
    }

    session.state = STATES.AWAITING_NAME;
    return {
      response: '📚 Let\'s create a new skill!\n\nWhat would you like to track? Give me a name for this skill.',
      done: false
    };
  }

  /**
   * Handle skill name input
   */
  handleName(chatId, message, session) {
    const lower = message.toLowerCase().trim();
    
    // Accept hint with "yes"
    if ((lower === 'yes' || lower === 'yeah' || lower === 'sure') && session.draft.nameHint) {
      session.draft.name = session.draft.nameHint;
    } else {
      session.draft.name = message.trim();
    }

    // Validate name
    if (session.draft.name.length < 2) {
      return {
        response: 'That name is too short. What would you like to call this skill?',
        done: false
      };
    }

    // Check if skill already exists
    const id = session.draft.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    if (this.sm.skills.has(id)) {
      return {
        response: `A skill called "${session.draft.name}" already exists. Choose a different name?`,
        done: false
      };
    }

    session.draft.id = id;
    session.state = STATES.AWAITING_TYPE;

    // Show data type options
    const typeOptions = Object.entries(DATA_TYPES)
      .map(([key, t], i) => `${i + 1}. **${t.label}** - ${t.description}`)
      .join('\n');

    return {
      response: `Great! "${session.draft.name}" it is.\n\nWhat kind of data will you track?\n\n${typeOptions}\n\n(Reply with number or type name)`,
      done: false
    };
  }

  /**
   * Handle data type selection
   */
  handleType(chatId, message, session) {
    const lower = message.toLowerCase().trim();
    const typeKeys = Object.keys(DATA_TYPES);
    
    let selectedType = null;

    // Check for number input (1-6)
    const num = parseInt(lower);
    if (num >= 1 && num <= typeKeys.length) {
      selectedType = typeKeys[num - 1];
    }

    // Check for type name
    if (!selectedType) {
      for (const key of typeKeys) {
        if (lower.includes(key) || lower.includes(DATA_TYPES[key].label.toLowerCase())) {
          selectedType = key;
          break;
        }
      }
    }

    // Fuzzy match common words
    if (!selectedType) {
      if (lower.includes('number') || lower.includes('amount') || lower.includes('quantity')) {
        selectedType = 'number';
      } else if (lower.includes('count') || lower.includes('how many')) {
        selectedType = 'counter';
      } else if (lower.includes('rate') || lower.includes('score') || lower.includes('1-10')) {
        selectedType = 'scale';
      } else if (lower.includes('time') || lower.includes('minute') || lower.includes('hour')) {
        selectedType = 'duration';
      } else if (lower.includes('text') || lower.includes('note') || lower.includes('write')) {
        selectedType = 'text';
      } else if (lower.includes('activity') || lower.includes('what i did')) {
        selectedType = 'activity';
      }
    }

    if (!selectedType) {
      return {
        response: 'I didn\'t catch that. Please pick a number (1-6) or type like "numbers" or "scale".',
        done: false
      };
    }

    session.draft.dataType = selectedType;
    session.draft.schema = DATA_TYPES[selectedType].schema;
    session.state = STATES.AWAITING_TRIGGERS;

    const examples = DATA_TYPES[selectedType].examples.join(', ');

    return {
      response: `Got it - ${DATA_TYPES[selectedType].label}!\n\nWhat words should trigger this skill? List a few keywords separated by commas.\n\nExample: "${session.draft.name.toLowerCase()}, ${session.draft.name.toLowerCase().slice(0, 4)}"`,
      done: false
    };
  }

  /**
   * Handle trigger words input
   */
  handleTriggers(chatId, message, session) {
    // Parse comma or space separated triggers
    const triggers = message
      .split(/[,\s]+/)
      .map(t => t.trim().toLowerCase())
      .filter(t => t.length >= 2);

    if (triggers.length === 0) {
      return {
        response: 'Please provide at least one trigger word (2+ characters).',
        done: false
      };
    }

    session.draft.triggers = triggers;
    
    // For numeric types, ask about goals
    if (['number', 'counter', 'duration', 'scale'].includes(session.draft.dataType)) {
      session.state = STATES.AWAITING_GOAL;
      
      const unit = session.draft.dataType === 'duration' ? 'minutes' : 
                   session.draft.dataType === 'scale' ? 'check-ins' : 'units';
      
      return {
        response: `Triggers set: ${triggers.join(', ')}\n\nWould you like to set a daily goal? (e.g., "2000" or "8 hours" or "no")`,
        done: false
      };
    }

    // Skip to confirmation for non-numeric types
    session.state = STATES.CONFIRMING;
    return this.showConfirmation(session);
  }

  /**
   * Handle goal setting
   */
  handleGoal(chatId, message, session) {
    const lower = message.toLowerCase().trim();

    if (lower === 'no' || lower === 'skip' || lower === 'none') {
      session.draft.goal = null;
    } else {
      // Extract number from input
      const match = message.match(/(\d+(?:\.\d+)?)/);
      if (match) {
        session.draft.goal = parseFloat(match[1]);
        
        // Try to extract unit
        const unitMatch = message.match(/(\d+(?:\.\d+)?)\s*(\w+)?/);
        if (unitMatch && unitMatch[2]) {
          session.draft.goalUnit = unitMatch[2];
        }
      }
    }

    session.state = STATES.CONFIRMING;
    return this.showConfirmation(session);
  }

  /**
   * Show confirmation summary
   */
  showConfirmation(session) {
    const { name, dataType, triggers, goal, goalUnit } = session.draft;
    
    let summary = `✨ Here's your new skill:\n\n`;
    summary += `**Name:** ${name}\n`;
    summary += `**Type:** ${DATA_TYPES[dataType].label}\n`;
    summary += `**Triggers:** ${triggers.join(', ')}\n`;
    
    if (goal) {
      summary += `**Daily Goal:** ${goal}${goalUnit ? ' ' + goalUnit : ''}\n`;
    }

    summary += `\nExamples of what you can say:\n`;
    summary += DATA_TYPES[dataType].examples
      .map(e => `• "${e.replace(/\w+/, triggers[0])}"`)
      .slice(0, 2)
      .join('\n');

    summary += `\n\nCreate this skill? (yes/no)`;

    return { response: summary, done: false };
  }

  /**
   * Handle confirmation
   */
  async handleConfirm(chatId, message, session) {
    const lower = message.toLowerCase().trim();

    if (lower === 'no' || lower === 'cancel') {
      this.clearSession(chatId);
      return { response: 'No problem! Skill creation cancelled.', done: true };
    }

    if (lower !== 'yes' && lower !== 'yeah' && lower !== 'yep' && lower !== 'sure' && lower !== 'create') {
      return { response: 'Please say "yes" to create the skill or "no" to cancel.', done: false };
    }

    // Create the skill!
    try {
      const skill = await this.createSkill(session.draft);
      
      // Set goal if specified
      if (session.draft.goal && this.goals) {
        await this.goals.setGoal(session.draft.id, {
          daily: session.draft.goal,
          unit: session.draft.goalUnit || ''
        });
      }

      this.clearSession(chatId);

      return {
        response: `🎉 Done! "${session.draft.name}" is ready to use.\n\nTry it out: "${session.draft.triggers[0]} ..."`,
        done: true,
        skill: skill
      };
    } catch (error) {
      this.clearSession(chatId);
      return {
        response: `❌ Failed to create skill: ${error.message}`,
        done: true
      };
    }
  }

  /**
   * Create the skill file
   */
  async createSkill(draft) {
    const { id, name, dataType, triggers, schema, goal, goalUnit } = draft;

    const content = `# ${name}

${DATA_TYPES[dataType].description}

## Triggers
${triggers.map(t => `- ${t}`).join('\n')}

## Data Schema
\`\`\`json
${JSON.stringify(schema, null, 2)}
\`\`\`

## Actions
- log: Record an entry
- history: Show recent entries
- today: Show today's entries
- summary: Get statistics

## Examples
${DATA_TYPES[dataType].examples.map(e => `- "${e}"`).join('\n')}

---
*Created via conversation on ${new Date().toISOString().split('T')[0]}*
`;

    const filepath = path.join(this.sm.skillsDir, `${id}.md`);
    await fs.writeFile(filepath, content);
    return this.sm.loadSkill(`${id}.md`);
  }

  /**
   * Check if we're in an active teaching session
   */
  isTeaching(chatId) {
    const session = this.sessions.get(chatId);
    return session && session.state !== STATES.IDLE;
  }

  /**
   * Get current session state (for UI hints)
   */
  getSessionState(chatId) {
    const session = this.sessions.get(chatId);
    if (!session || session.state === STATES.IDLE) return null;
    
    return {
      state: session.state,
      draft: session.draft,
      startedAt: session.startedAt
    };
  }
}

export default SkillTeacher;
