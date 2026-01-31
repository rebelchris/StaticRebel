/**
 * Skill Chaining - Connect skills to trigger follow-up actions
 * 
 * Defines rules for when completing one skill should prompt another:
 * - After exercise → check mood
 * - Low mood → suggest walk or water
 * - Goal completed → celebration message
 * - Morning routine → chain multiple skills
 */

import fs from 'fs/promises';
import path from 'path';

/**
 * Default chain rules (can be customized by user)
 */
const DEFAULT_CHAINS = [
  {
    id: 'exercise-mood',
    trigger: { skill: 'exercise', event: 'logged' },
    action: { type: 'prompt', skill: 'mood', message: '💪 Nice workout! How are you feeling?' }
  },
  {
    id: 'low-mood-suggest',
    trigger: { skill: 'mood', event: 'logged', condition: { field: 'score', op: '<=', value: 4 } },
    action: { type: 'suggest', skills: ['exercise', 'water'], message: '💙 Sorry to hear that. Sometimes a walk or some water helps.' }
  },
  {
    id: 'high-mood-celebrate',
    trigger: { skill: 'mood', event: 'logged', condition: { field: 'score', op: '>=', value: 9 } },
    action: { type: 'message', message: '🎉 Amazing! What a great day!' }
  },
  {
    id: 'water-goal-complete',
    trigger: { skill: 'water', event: 'goal_reached' },
    action: { type: 'celebrate', message: '💧 Daily water goal smashed! 🎯' }
  },
  {
    id: 'streak-milestone',
    trigger: { event: 'streak_milestone' },
    action: { type: 'celebrate', template: '🔥 {streak}-day {skill} streak! Keep it up!' }
  },
  {
    id: 'exercise-water-reminder',
    trigger: { skill: 'exercise', event: 'logged' },
    action: { type: 'remind', skill: 'water', delay: 30, message: '🏃 Don\'t forget to rehydrate after your workout!' }
  }
];

/**
 * ChainEngine - manages skill chains and triggers
 */
export class ChainEngine {
  constructor(skillManager, goalTracker, dataDir) {
    this.sm = skillManager;
    this.goals = goalTracker;
    this.dataDir = dataDir;
    this.chainsFile = path.join(dataDir, '_chains.json');
    this.chains = [];
    this.pendingReminders = [];
    this.handlers = new Map();
  }

  async init() {
    try {
      const content = await fs.readFile(this.chainsFile, 'utf-8');
      const data = JSON.parse(content);
      this.chains = data.chains || DEFAULT_CHAINS;
      this.pendingReminders = data.reminders || [];
    } catch {
      this.chains = [...DEFAULT_CHAINS];
      this.pendingReminders = [];
    }
    return this;
  }

  async save() {
    const data = { 
      chains: this.chains, 
      reminders: this.pendingReminders,
      savedAt: Date.now()
    };
    const tempPath = `${this.chainsFile}.tmp`;
    await fs.writeFile(tempPath, JSON.stringify(data, null, 2));
    await fs.rename(tempPath, this.chainsFile);
  }

  // ============== CHAIN MANAGEMENT ==============

  /**
   * Add a custom chain rule
   */
  async addChain(chain) {
    const id = chain.id || `chain-${Date.now()}`;
    const newChain = { ...chain, id, createdAt: Date.now() };
    this.chains.push(newChain);
    await this.save();
    return newChain;
  }

  /**
   * Remove a chain rule
   */
  async removeChain(chainId) {
    this.chains = this.chains.filter(c => c.id !== chainId);
    await this.save();
  }

  /**
   * Get all chains for a skill
   */
  getChainsForSkill(skillId) {
    return this.chains.filter(c => c.trigger.skill === skillId);
  }

  /**
   * List all chains
   */
  listChains() {
    return this.chains.map(c => ({
      id: c.id,
      trigger: `${c.trigger.skill || '*'}:${c.trigger.event}`,
      action: c.action.type,
      message: c.action.message?.slice(0, 50)
    }));
  }

  // ============== EVENT PROCESSING ==============

  /**
   * Process an event and return triggered actions
   * @param {string} event - Event type (logged, goal_reached, streak_milestone)
   * @param {string} skillId - The skill that triggered the event
   * @param {object} data - Event data (entry, streak count, etc)
   * @returns {array} Array of actions to take
   */
  async processEvent(event, skillId, data = {}) {
    const actions = [];

    for (const chain of this.chains) {
      if (!this.matchesTrigger(chain.trigger, event, skillId, data)) {
        continue;
      }

      const action = this.buildAction(chain.action, skillId, data);
      if (action) {
        actions.push(action);
      }
    }

    return actions;
  }

  /**
   * Check if a trigger matches the current event
   */
  matchesTrigger(trigger, event, skillId, data) {
    // Check event type
    if (trigger.event !== event) return false;

    // Check skill (if specified)
    if (trigger.skill && trigger.skill !== skillId) return false;

    // Check conditions
    if (trigger.condition) {
      const { field, op, value } = trigger.condition;
      const actual = data[field] ?? data.entry?.[field];
      
      if (actual === undefined) return false;

      switch (op) {
        case '==': case '=': if (actual != value) return false; break;
        case '!=': if (actual == value) return false; break;
        case '>': if (actual <= value) return false; break;
        case '>=': if (actual < value) return false; break;
        case '<': if (actual >= value) return false; break;
        case '<=': if (actual > value) return false; break;
        default: return false;
      }
    }

    return true;
  }

  /**
   * Build the action response
   */
  buildAction(actionDef, skillId, data) {
    const action = {
      type: actionDef.type,
      skill: actionDef.skill || skillId,
      message: actionDef.message || actionDef.template
    };

    // Template substitution
    if (action.message) {
      action.message = action.message
        .replace('{skill}', this.sm.skills.get(skillId)?.name || skillId)
        .replace('{streak}', data.streak || data.current || '')
        .replace('{value}', data.entry?.value || data.value || '')
        .replace('{score}', data.entry?.score || data.score || '');
    }

    // Handle delayed reminders
    if (actionDef.delay) {
      action.delayed = true;
      action.delayMinutes = actionDef.delay;
      action.triggerAt = Date.now() + actionDef.delay * 60 * 1000;
    }

    // Include suggested skills for suggest type
    if (actionDef.skills) {
      action.suggestedSkills = actionDef.skills;
    }

    return action;
  }

  // ============== DELAYED REMINDERS ==============

  /**
   * Schedule a delayed reminder
   */
  async scheduleReminder(action) {
    const reminder = {
      id: `reminder-${Date.now()}`,
      ...action,
      scheduledAt: Date.now()
    };
    this.pendingReminders.push(reminder);
    await this.save();
    return reminder;
  }

  /**
   * Get due reminders
   */
  getDueReminders() {
    const now = Date.now();
    return this.pendingReminders.filter(r => r.triggerAt <= now);
  }

  /**
   * Clear a reminder (after it's been delivered)
   */
  async clearReminder(reminderId) {
    this.pendingReminders = this.pendingReminders.filter(r => r.id !== reminderId);
    await this.save();
  }

  /**
   * Clear all due reminders and return them
   */
  async popDueReminders() {
    const due = this.getDueReminders();
    if (due.length > 0) {
      this.pendingReminders = this.pendingReminders.filter(r => r.triggerAt > Date.now());
      await this.save();
    }
    return due;
  }

  // ============== CONVENIENCE METHODS ==============

  /**
   * Process a skill entry and get any triggered messages
   * This is the main integration point for the companion
   */
  async onEntryLogged(skillId, entry) {
    const actions = await this.processEvent('logged', skillId, { entry });
    
    // Check for goal completion
    if (this.goals) {
      const goal = this.goals.getGoal(skillId);
      if (goal?.daily) {
        const todayEntries = await this.sm.getEntries(skillId, { 
          date: new Date().toISOString().split('T')[0] 
        });
        const total = todayEntries.reduce((sum, e) => sum + (parseFloat(e.value) || 0), 0);
        
        if (total >= goal.daily) {
          const goalActions = await this.processEvent('goal_reached', skillId, { total, goal });
          actions.push(...goalActions);
        }
      }
    }

    // Handle delayed actions
    const immediate = [];
    for (const action of actions) {
      if (action.delayed) {
        await this.scheduleReminder(action);
      } else {
        immediate.push(action);
      }
    }

    return immediate;
  }

  /**
   * Process a streak milestone
   */
  async onStreakMilestone(skillId, streak) {
    return this.processEvent('streak_milestone', skillId, { streak, current: streak });
  }

  /**
   * Get messages from triggered actions
   */
  getMessages(actions) {
    return actions
      .filter(a => a.message)
      .map(a => a.message);
  }

  /**
   * Get suggested skills from actions
   */
  getSuggestions(actions) {
    const suggestions = [];
    for (const action of actions) {
      if (action.type === 'prompt' && action.skill) {
        suggestions.push({ skill: action.skill, prompt: action.message });
      }
      if (action.suggestedSkills) {
        for (const s of action.suggestedSkills) {
          suggestions.push({ skill: s });
        }
      }
    }
    return suggestions;
  }
}

export default ChainEngine;
