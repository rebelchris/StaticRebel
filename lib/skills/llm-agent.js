/**
 * LLM-Driven Skill Agent
 * 
 * The LLM handles all skill interactions naturally:
 * - Understands any phrasing ("stayed hydrated" → water skill)
 * - Natural conversation for creating skills
 * - Context-aware responses ("the usual" → remembers patterns)
 * - Uses tools to actually store/query data
 */

/**
 * Tool definitions for the LLM
 */
export const SKILL_TOOLS = [
  {
    name: 'log_entry',
    description: 'Log an entry to a skill. Use when user reports doing/consuming/feeling something.',
    parameters: {
      type: 'object',
      properties: {
        skill_id: { 
          type: 'string', 
          description: 'The skill to log to (e.g., "water", "mood", "exercise")' 
        },
        data: { 
          type: 'object', 
          description: 'Entry data. Common fields: value (number), score (1-10), duration (minutes), note (text), type (activity type)',
          properties: {
            value: { type: 'number', description: 'Numeric value (ml, steps, etc.)' },
            score: { type: 'number', description: 'Score for scale-type skills (1-10)' },
            duration: { type: 'number', description: 'Duration in minutes' },
            note: { type: 'string', description: 'Optional note or description' },
            type: { type: 'string', description: 'Activity type (run, walk, gym, etc.)' },
            content: { type: 'string', description: 'Text content for text-type skills' }
          }
        }
      },
      required: ['skill_id', 'data']
    }
  },
  {
    name: 'query_entries',
    description: 'Query past entries from a skill. Use for history, summaries, or checking progress.',
    parameters: {
      type: 'object',
      properties: {
        skill_id: { type: 'string', description: 'The skill to query' },
        period: { 
          type: 'string', 
          enum: ['today', 'yesterday', 'week', 'month', 'all'],
          description: 'Time period to query'
        },
        limit: { type: 'number', description: 'Max entries to return (default 10)' }
      },
      required: ['skill_id']
    }
  },
  {
    name: 'get_stats',
    description: 'Get statistics for a skill (sum, average, streak, goal progress).',
    parameters: {
      type: 'object',
      properties: {
        skill_id: { type: 'string', description: 'The skill to get stats for' },
        period: { 
          type: 'string',
          enum: ['today', 'week', 'month', 'all'],
          description: 'Time period for stats'
        }
      },
      required: ['skill_id']
    }
  },
  {
    name: 'create_skill',
    description: 'Create a new skill for tracking something. Use when user wants to track something new.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Human-readable skill name' },
        description: { type: 'string', description: 'What this skill tracks' },
        data_type: { 
          type: 'string',
          enum: ['number', 'counter', 'scale', 'duration', 'text', 'activity'],
          description: 'Type of data: number (quantities), counter (occurrences), scale (1-10), duration (time), text (notes), activity (with details)'
        },
        unit: { type: 'string', description: 'Unit of measurement (ml, cups, minutes, etc.)' },
        daily_goal: { type: 'number', description: 'Optional daily goal' }
      },
      required: ['name', 'data_type']
    }
  },
  {
    name: 'set_goal',
    description: 'Set or update a daily/weekly goal for a skill.',
    parameters: {
      type: 'object',
      properties: {
        skill_id: { type: 'string', description: 'The skill to set goal for' },
        daily: { type: 'number', description: 'Daily goal amount' },
        weekly: { type: 'number', description: 'Weekly goal amount' },
        unit: { type: 'string', description: 'Goal unit (ml, cups, minutes, etc.)' }
      },
      required: ['skill_id']
    }
  },
  {
    name: 'list_skills',
    description: 'List all available skills the user can track.',
    parameters: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'get_insights',
    description: 'Get insights and patterns for a skill (correlations, trends, suggestions).',
    parameters: {
      type: 'object',
      properties: {
        skill_id: { type: 'string', description: 'The skill to analyze' }
      },
      required: ['skill_id']
    }
  },
  {
    name: 'get_nudge',
    description: 'Get a contextual reminder or suggestion based on user patterns.',
    parameters: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'ask_user',
    description: 'Ask the user a clarifying question when you need more information. Use this instead of guessing. Examples: What type of exercise? How many minutes? What scale (1-10)?',
    parameters: {
      type: 'object',
      properties: {
        question: { 
          type: 'string', 
          description: 'The question to ask the user. Be specific and conversational.' 
        },
        context: { 
          type: 'string', 
          description: 'Brief context about why you\'re asking (helps you remember when they respond)' 
        },
        options: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional: Quick reply options the user can choose from'
        }
      },
      required: ['question']
    }
  }
];

/**
 * Generate system prompt for the skill agent
 */
export function generateSystemPrompt(skills, context = {}) {
  const skillList = skills.map(s => 
    `- **${s.name}** (${s.id}): ${s.description || 'Track ' + s.name.toLowerCase()}`
  ).join('\n');

  const goalInfo = context.goals ? 
    Object.entries(context.goals)
      .map(([id, g]) => `- ${id}: ${g.daily || g.weekly}${g.unit || ''} per ${g.daily ? 'day' : 'week'}`)
      .join('\n') : 'No goals set';

  return `You are a personal tracking companion. You help users track habits, activities, and metrics through natural conversation.

## Available Skills
${skillList || 'No skills yet - help the user create their first one!'}

## Current Goals
${goalInfo}

## Your Capabilities
- Log entries to any skill from natural language ("had 2 glasses of water", "feeling great today, 8/10", "ran for 30 minutes")
- Query history and show progress ("how much water today?", "mood this week")
- Create new skills when users want to track something new
- Provide insights and patterns ("do I exercise more on weekdays?")
- Give contextual nudges and encouragement

## Guidelines
- Be conversational and encouraging, not robotic
- Infer the skill from context (e.g., "stayed hydrated" → water)
- Remember user patterns (if they usually log 250ml, "had a glass" = 250ml)
- **USE ask_user TOOL when you need clarification** - don't guess! Ask about:
  - Ambiguous activities ("exercised" → what type? how long?)
  - Missing values ("drank water" → how much?)
  - New skills ("track my X" → what data type? any goal?)
- Celebrate streaks and goal completions!
- If no matching skill exists, use ask_user to confirm before creating

## Response Style
- Keep responses concise but warm
- Use emoji sparingly for celebration/feedback
- Show progress visually when relevant (e.g., "████████░░ 80% of daily goal")

## Context
${context.recentActivity ? `Recent activity:\n${context.recentActivity}` : 'No recent activity.'}
${context.streaks ? `Active streaks:\n${context.streaks}` : ''}
${context.time ? `Current time: ${context.time}` : ''}
`;
}

/**
 * SkillAgent - LLM-driven skill interactions
 */
export class SkillAgent {
  constructor(options = {}) {
    this.sm = options.skillManager;
    this.goals = options.goalTracker;
    this.insights = options.insightsEngine;
    this.nudges = options.nudgeEngine;
    this.memory = options.memory; // SkillMemory for persistence
    
    // LLM provider function: (messages, tools) => response
    this.llmProvider = options.llmProvider;
    
    // Conversation history per chat (also persisted via memory if available)
    this.conversations = new Map();
    this.maxHistory = options.maxHistory || 20;
    
    // Pending questions - tracks when we're waiting for user answers
    // Map of chatId -> { question, context, originalMessage, options }
    this.pendingQuestions = new Map();
  }

  /**
   * Initialize with persistent memory
   */
  async init() {
    if (this.memory) {
      // Load conversations from persistent memory
      for (const [chatId, conv] of Object.entries(this.memory.memory.conversations || {})) {
        this.conversations.set(chatId, conv.messages || []);
      }
    }
    return this;
  }

  /**
   * Get or create conversation history
   */
  getConversation(chatId) {
    if (!this.conversations.has(chatId)) {
      this.conversations.set(chatId, []);
    }
    return this.conversations.get(chatId);
  }

  /**
   * Add message to conversation history
   */
  async addToHistory(chatId, role, content) {
    const conv = this.getConversation(chatId);
    conv.push({ role, content, timestamp: Date.now() });
    
    // Trim old messages
    if (conv.length > this.maxHistory) {
      conv.splice(0, conv.length - this.maxHistory);
    }

    // Persist to memory if available
    if (this.memory) {
      await this.memory.saveConversation(chatId, conv, this.maxHistory);
    }
  }

  /**
   * Build context for the system prompt
   */
  async buildContext() {
    const context = {
      time: new Date().toLocaleString()
    };

    // Get recent activity
    const recentEntries = [];
    for (const [skillId] of this.sm.skills) {
      const entries = await this.sm.getEntries(skillId, { limit: 3 });
      if (entries.length > 0) {
        recentEntries.push(`${skillId}: ${entries.length} recent entries`);
      }
    }
    if (recentEntries.length) {
      context.recentActivity = recentEntries.join(', ');
    }

    // Get goals
    if (this.goals) {
      const goals = {};
      for (const [skillId] of this.sm.skills) {
        const goal = this.goals.getGoal(skillId);
        if (goal) goals[skillId] = goal;
      }
      if (Object.keys(goals).length) context.goals = goals;
    }

    return context;
  }

  /**
   * Execute a tool call
   */
  async executeTool(name, params) {
    switch (name) {
      case 'log_entry':
        return this.toolLogEntry(params);
      case 'query_entries':
        return this.toolQueryEntries(params);
      case 'get_stats':
        return this.toolGetStats(params);
      case 'create_skill':
        return this.toolCreateSkill(params);
      case 'set_goal':
        return this.toolSetGoal(params);
      case 'list_skills':
        return this.toolListSkills();
      case 'get_insights':
        return this.toolGetInsights(params);
      case 'get_nudge':
        return this.toolGetNudge();
      case 'ask_user':
        return this.toolAskUser(params);
      default:
        return { error: `Unknown tool: ${name}` };
    }
  }
  
  /**
   * Ask user tool - returns special response that pauses conversation
   */
  toolAskUser({ question, context, options }) {
    return {
      __askUser: true,
      question,
      context: context || '',
      options: options || []
    };
  }
  
  /**
   * Check if there's a pending question for this chat
   */
  hasPendingQuestion(chatId) {
    return this.pendingQuestions.has(chatId);
  }
  
  /**
   * Get pending question for this chat
   */
  getPendingQuestion(chatId) {
    return this.pendingQuestions.get(chatId);
  }
  
  /**
   * Clear pending question
   */
  clearPendingQuestion(chatId) {
    this.pendingQuestions.delete(chatId);
  }
  
  /**
   * Set pending question
   */
  setPendingQuestion(chatId, data) {
    this.pendingQuestions.set(chatId, {
      ...data,
      timestamp: Date.now()
    });
  }

  // ============== TOOL IMPLEMENTATIONS ==============

  async toolLogEntry({ skill_id, data }) {
    if (!this.sm.skills.has(skill_id)) {
      return { error: `Skill "${skill_id}" not found. Available: ${[...this.sm.skills.keys()].join(', ')}` };
    }

    const entry = await this.sm.addEntry(skill_id, data);
    
    // Check goal progress
    let goalProgress = null;
    if (this.goals) {
      const goal = this.goals.getGoal(skill_id);
      if (goal?.daily) {
        const todayEntries = await this.sm.getEntries(skill_id, { 
          date: new Date().toISOString().split('T')[0] 
        });
        const total = todayEntries.reduce((sum, e) => sum + (parseFloat(e.value) || 1), 0);
        goalProgress = {
          current: total,
          goal: goal.daily,
          percent: Math.round((total / goal.daily) * 100),
          met: total >= goal.daily
        };
      }
    }

    // Check streak
    let streak = null;
    if (this.goals) {
      const allEntries = await this.sm.getEntries(skill_id);
      streak = this.goals.calculateStreak(allEntries);
    }

    return { 
      success: true, 
      entry,
      goalProgress,
      streak: streak?.current || 0
    };
  }

  async toolQueryEntries({ skill_id, period = 'today', limit = 10 }) {
    if (!this.sm.skills.has(skill_id)) {
      return { error: `Skill "${skill_id}" not found` };
    }

    const options = { limit };
    const now = new Date();

    switch (period) {
      case 'today':
        options.date = now.toISOString().split('T')[0];
        break;
      case 'yesterday':
        const yesterday = new Date(now);
        yesterday.setDate(yesterday.getDate() - 1);
        options.date = yesterday.toISOString().split('T')[0];
        break;
      case 'week':
        const weekAgo = new Date(now);
        weekAgo.setDate(weekAgo.getDate() - 7);
        options.since = weekAgo.toISOString().split('T')[0];
        break;
      case 'month':
        const monthAgo = new Date(now);
        monthAgo.setMonth(monthAgo.getMonth() - 1);
        options.since = monthAgo.toISOString().split('T')[0];
        break;
    }

    const entries = await this.sm.getEntries(skill_id, options);
    return { entries, count: entries.length, period };
  }

  async toolGetStats({ skill_id, period = 'today' }) {
    if (!this.sm.skills.has(skill_id)) {
      return { error: `Skill "${skill_id}" not found` };
    }

    const skill = this.sm.skills.get(skill_id);
    const queryResult = await this.toolQueryEntries({ skill_id, period, limit: 1000 });
    const entries = queryResult.entries || [];

    // Calculate stats
    const values = entries.map(e => parseFloat(e.value) || parseFloat(e.score) || 1).filter(v => !isNaN(v));
    
    const stats = {
      period,
      count: entries.length,
      sum: values.reduce((a, b) => a + b, 0),
      avg: values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0
    };

    // Add goal progress
    if (this.goals) {
      const goal = this.goals.getGoal(skill_id);
      if (goal) {
        stats.goal = goal;
        stats.goalProgress = Math.round((stats.sum / (goal.daily || goal.weekly)) * 100);
      }

      // Add streak
      const allEntries = await this.sm.getEntries(skill_id);
      stats.streak = this.goals.calculateStreak(allEntries);
    }

    return stats;
  }

  async toolCreateSkill({ name, description, data_type, unit, daily_goal }) {
    const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    
    if (this.sm.skills.has(id)) {
      return { error: `Skill "${name}" already exists` };
    }

    const skill = await this.sm.createSkill(name, {
      description: description || `Track ${name.toLowerCase()}`,
      triggers: [name.toLowerCase(), id],
      dataSchema: this.getSchemaForType(data_type, unit)
    });

    if (daily_goal && this.goals) {
      await this.goals.setGoal(id, { daily: daily_goal, unit: unit || '' });
    }

    return { success: true, skill: { id, name, data_type }, goal: daily_goal };
  }

  getSchemaForType(type, unit) {
    const schemas = {
      number: { type: 'numeric', unit: unit || '', fields: ['value', 'note'] },
      counter: { type: 'counter', unit: unit || 'count', fields: ['count', 'note'] },
      scale: { type: 'scale', range: [1, 10], fields: ['score', 'note'] },
      duration: { type: 'duration', unit: 'minutes', fields: ['duration', 'activity'] },
      text: { type: 'text', fields: ['content', 'tags'] },
      activity: { type: 'activity', fields: ['type', 'duration', 'details'] }
    };
    return schemas[type] || schemas.number;
  }

  async toolSetGoal({ skill_id, daily, weekly, unit }) {
    if (!this.sm.skills.has(skill_id)) {
      return { error: `Skill "${skill_id}" not found` };
    }
    if (!this.goals) {
      return { error: 'Goal tracking not available' };
    }

    await this.goals.setGoal(skill_id, { daily, weekly, unit });
    return { success: true, skill_id, goal: { daily, weekly, unit } };
  }

  async toolListSkills() {
    const skills = [];
    for (const [id, skill] of this.sm.skills) {
      const stats = await this.sm.getStats(id);
      skills.push({
        id,
        name: skill.name,
        description: skill.description,
        entries: stats.count,
        hasGoal: this.goals ? !!this.goals.getGoal(id) : false
      });
    }
    return { skills };
  }

  async toolGetInsights({ skill_id }) {
    if (!this.insights) {
      return { error: 'Insights not available' };
    }

    const messages = await this.insights.getInsightMessages(skill_id);
    const dayPatterns = await this.insights.dayOfWeekPattern(skill_id);
    const consistency = await this.insights.consistencyScore(skill_id);

    return { messages, dayPatterns: dayPatterns.patterns, consistency };
  }

  async toolGetNudge() {
    if (!this.nudges) {
      return { message: null };
    }

    const nudge = await this.nudges.getContextualNudge();
    return nudge || { message: null };
  }

  // ============== MAIN INTERFACE ==============

  /**
   * Process a user message
   * @param {string} chatId - Chat/user identifier
   * @param {string} message - User message
   * @returns {Promise<{ response: string, toolCalls?: array, askingUser?: object }>}
   */
  async processMessage(chatId, message) {
    if (!this.llmProvider) {
      throw new Error('No LLM provider configured');
    }

    // Check if this is an answer to a pending question
    const pending = this.getPendingQuestion(chatId);
    let effectiveMessage = message;
    
    if (pending) {
      // Inject context so the LLM knows this is an answer
      effectiveMessage = `[Answering your question: "${pending.question}"]\nUser's answer: ${message}`;
      
      // Add context from the pending question
      if (pending.context) {
        effectiveMessage += `\n[Context: ${pending.context}]`;
      }
      
      // Clear the pending question
      this.clearPendingQuestion(chatId);
    }

    // Build context and system prompt
    const context = await this.buildContext();
    const skills = [...this.sm.skills.values()];
    const systemPrompt = generateSystemPrompt(skills, context);

    // Get conversation history
    const history = this.getConversation(chatId);
    
    // Add user message to history
    await this.addToHistory(chatId, 'user', effectiveMessage);

    // Build messages array
    const messages = [
      { role: 'system', content: systemPrompt },
      ...history.map(h => ({ role: h.role, content: h.content }))
    ];

    // Call LLM with tools
    const response = await this.llmProvider(messages, SKILL_TOOLS);

    // Process tool calls if any
    const toolResults = [];
    let askUserResult = null;
    
    if (response.toolCalls && response.toolCalls.length > 0) {
      for (const call of response.toolCalls) {
        const result = await this.executeTool(call.name, call.arguments);
        
        // Special handling for ask_user tool
        if (result.__askUser) {
          askUserResult = result;
          // Store the pending question
          this.setPendingQuestion(chatId, {
            question: result.question,
            context: result.context,
            options: result.options,
            originalMessage: message
          });
          // Don't add to regular tool results
          continue;
        }
        
        toolResults.push({ tool: call.name, result });
      }

      // If ask_user was called, return immediately with the question
      if (askUserResult) {
        const questionResponse = this.formatAskUserResponse(askUserResult);
        await this.addToHistory(chatId, 'assistant', questionResponse);
        
        return { 
          response: questionResponse,
          askingUser: askUserResult,
          toolCalls: toolResults.length > 0 ? toolResults : undefined
        };
      }

      // If there were tool calls, call LLM again with results
      if (toolResults.length > 0) {
        messages.push({ role: 'assistant', content: response.content, toolCalls: response.toolCalls });
        messages.push({ role: 'tool', content: JSON.stringify(toolResults) });
        
        const finalResponse = await this.llmProvider(messages, SKILL_TOOLS);
        await this.addToHistory(chatId, 'assistant', finalResponse.content);
        
        return { 
          response: finalResponse.content, 
          toolCalls: toolResults 
        };
      }
    }

    // No tool calls - just return the response
    await this.addToHistory(chatId, 'assistant', response.content);
    return { response: response.content };
  }
  
  /**
   * Format the ask_user response for display
   */
  formatAskUserResponse(askUserResult) {
    let response = askUserResult.question;
    
    // Add quick reply options if provided
    if (askUserResult.options && askUserResult.options.length > 0) {
      response += '\n\n';
      askUserResult.options.forEach((opt, i) => {
        response += `• ${opt}\n`;
      });
    }
    
    return response;
  }

  /**
   * Clear conversation history for a chat
   */
  clearHistory(chatId) {
    this.conversations.delete(chatId);
  }
}

export default SkillAgent;
