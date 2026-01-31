/**
 * Skill Templates - Pre-built skill packs for common use cases
 * 
 * Templates provide curated sets of skills with:
 * - Skill definitions
 * - Default goals
 * - Chain rules
 * - Suggested workflows
 */

import fs from 'fs/promises';
import path from 'path';

/**
 * Built-in template packs
 */
export const TEMPLATE_PACKS = {
  // ============== FITNESS PACK ==============
  fitness: {
    id: 'fitness',
    name: '💪 Fitness Pack',
    description: 'Track workouts, nutrition, and body metrics',
    skills: [
      {
        id: 'workout',
        name: 'Workout Log',
        description: 'Track gym sessions, runs, and training',
        triggers: ['workout', 'gym', 'training', 'lift', 'exercise'],
        dataSchema: { type: 'activity', fields: ['type', 'duration', 'exercises', 'notes'] }
      },
      {
        id: 'cardio',
        name: 'Cardio',
        description: 'Track runs, walks, cycling, swimming',
        triggers: ['run', 'walk', 'bike', 'swim', 'cardio', 'jog'],
        dataSchema: { type: 'activity', fields: ['type', 'distance', 'duration', 'pace'] }
      },
      {
        id: 'calories',
        name: 'Calories',
        description: 'Track daily calorie intake',
        triggers: ['calories', 'ate', 'food', 'meal'],
        dataSchema: { type: 'numeric', unit: 'kcal', dailyGoal: 2000 }
      },
      {
        id: 'weight',
        name: 'Weight',
        description: 'Track body weight',
        triggers: ['weight', 'weighed', 'scale'],
        dataSchema: { type: 'numeric', unit: 'kg', frequency: 'weekly' }
      }
    ],
    goals: [
      { skill: 'workout', weekly: 4, unit: 'sessions' },
      { skill: 'cardio', weekly: 3, unit: 'sessions' }
    ],
    chains: [
      { trigger: { skill: 'workout', event: 'logged' }, action: { type: 'prompt', skill: 'calories', message: '💪 Great workout! Log your post-workout meal?' } },
      { trigger: { skill: 'cardio', event: 'logged' }, action: { type: 'message', message: '🏃 Nice! Remember to stretch and hydrate!' } }
    ]
  },

  // ============== WELLNESS PACK ==============
  wellness: {
    id: 'wellness',
    name: '🧘 Wellness Pack',
    description: 'Mental health, mindfulness, and self-care',
    skills: [
      {
        id: 'mood',
        name: 'Mood',
        description: 'Track daily emotional state',
        triggers: ['mood', 'feeling', 'feel', 'emotions'],
        dataSchema: { type: 'scale', range: [1, 10], fields: ['score', 'note'] }
      },
      {
        id: 'gratitude',
        name: 'Gratitude',
        description: 'Daily gratitude journaling',
        triggers: ['grateful', 'gratitude', 'thankful', 'appreciate'],
        dataSchema: { type: 'text', fields: ['content'], dailyGoal: 3 }
      },
      {
        id: 'meditation',
        name: 'Meditation',
        description: 'Track mindfulness sessions',
        triggers: ['meditate', 'meditation', 'mindful', 'breathe'],
        dataSchema: { type: 'activity', fields: ['duration', 'type'] }
      },
      {
        id: 'sleep',
        name: 'Sleep',
        description: 'Track sleep duration and quality',
        triggers: ['sleep', 'slept', 'woke', 'rest'],
        dataSchema: { type: 'numeric', unit: 'hours', dailyGoal: 8 }
      },
      {
        id: 'journal',
        name: 'Journal',
        description: 'Free-form journaling',
        triggers: ['journal', 'diary', 'write', 'reflect'],
        dataSchema: { type: 'text', fields: ['content', 'tags'] }
      }
    ],
    goals: [
      { skill: 'gratitude', daily: 3, unit: 'things' },
      { skill: 'meditation', daily: 10, unit: 'minutes' },
      { skill: 'sleep', daily: 8, unit: 'hours' }
    ],
    chains: [
      { trigger: { skill: 'meditation', event: 'logged' }, action: { type: 'prompt', skill: 'mood', message: '🧘 How do you feel after meditating?' } },
      { trigger: { skill: 'mood', event: 'logged', condition: { field: 'score', op: '<=', value: 4 } }, action: { type: 'suggest', skills: ['journal', 'meditation'], message: '💙 Writing or meditating might help process these feelings.' } }
    ]
  },

  // ============== PRODUCTIVITY PACK ==============
  productivity: {
    id: 'productivity',
    name: '🎯 Productivity Pack',
    description: 'Focus, tasks, and work habits',
    skills: [
      {
        id: 'focus',
        name: 'Focus Time',
        description: 'Track deep work sessions',
        triggers: ['focus', 'deep work', 'pomodoro', 'worked on'],
        dataSchema: { type: 'activity', fields: ['duration', 'task', 'distractions'] }
      },
      {
        id: 'tasks',
        name: 'Tasks',
        description: 'Track completed tasks',
        triggers: ['done', 'completed', 'finished', 'task'],
        dataSchema: { type: 'counter', fields: ['description', 'project'] }
      },
      {
        id: 'breaks',
        name: 'Breaks',
        description: 'Track rest breaks',
        triggers: ['break', 'rest', 'stepped away'],
        dataSchema: { type: 'activity', fields: ['duration', 'activity'] }
      },
      {
        id: 'energy',
        name: 'Energy',
        description: 'Track energy levels throughout the day',
        triggers: ['energy', 'tired', 'energized', 'exhausted'],
        dataSchema: { type: 'scale', range: [1, 10], fields: ['score', 'time_of_day'] }
      },
      {
        id: 'wins',
        name: 'Daily Wins',
        description: 'Celebrate small victories',
        triggers: ['win', 'achievement', 'proud', 'accomplished'],
        dataSchema: { type: 'text', fields: ['content'] }
      }
    ],
    goals: [
      { skill: 'focus', daily: 4, unit: 'hours' },
      { skill: 'tasks', daily: 3, unit: 'completed' },
      { skill: 'wins', daily: 1, unit: 'win' }
    ],
    chains: [
      { trigger: { skill: 'focus', event: 'logged' }, action: { type: 'prompt', skill: 'breaks', delay: 60, message: '⏰ Time for a break! Step away for a few minutes.' } },
      { trigger: { skill: 'tasks', event: 'goal_reached' }, action: { type: 'prompt', skill: 'wins', message: '🎉 Daily tasks done! What was your biggest win today?' } }
    ]
  },

  // ============== HYDRATION PACK ==============
  hydration: {
    id: 'hydration',
    name: '💧 Hydration Pack',
    description: 'Simple water and beverage tracking',
    skills: [
      {
        id: 'water',
        name: 'Water',
        description: 'Track water intake',
        triggers: ['water', 'drank', 'hydrate', 'glass'],
        dataSchema: { type: 'numeric', unit: 'ml', defaultAmount: 250, dailyGoal: 2000 }
      },
      {
        id: 'coffee',
        name: 'Coffee',
        description: 'Track caffeine intake',
        triggers: ['coffee', 'espresso', 'latte', 'caffeine'],
        dataSchema: { type: 'counter', unit: 'cups', dailyLimit: 4 }
      },
      {
        id: 'tea',
        name: 'Tea',
        description: 'Track tea consumption',
        triggers: ['tea', 'herbal', 'green tea'],
        dataSchema: { type: 'counter', unit: 'cups' }
      }
    ],
    goals: [
      { skill: 'water', daily: 2000, unit: 'ml' },
      { skill: 'coffee', daily: 3, unit: 'cups' }
    ],
    chains: [
      { trigger: { skill: 'coffee', event: 'logged' }, action: { type: 'remind', skill: 'water', delay: 30, message: '☕ Coffee logged! Remember to drink some water too.' } }
    ]
  },

  // ============== MINIMAL PACK ==============
  minimal: {
    id: 'minimal',
    name: '✨ Minimal Pack',
    description: 'Just the essentials - mood and notes',
    skills: [
      {
        id: 'mood',
        name: 'Mood',
        description: 'Quick daily mood check',
        triggers: ['mood', 'feeling', 'how am i'],
        dataSchema: { type: 'scale', range: [1, 10] }
      },
      {
        id: 'notes',
        name: 'Notes',
        description: 'Quick notes and thoughts',
        triggers: ['note', 'remember', 'thought'],
        dataSchema: { type: 'text' }
      }
    ],
    goals: [
      { skill: 'mood', daily: 1, unit: 'check-in' }
    ],
    chains: []
  }
};

/**
 * TemplateManager - install and manage skill packs
 */
export class TemplateManager {
  constructor(skillManager, goalTracker, chainEngine, skillsDir) {
    this.sm = skillManager;
    this.goals = goalTracker;
    this.chains = chainEngine;
    this.skillsDir = skillsDir;
  }

  /**
   * List available template packs
   */
  listPacks() {
    return Object.values(TEMPLATE_PACKS).map(p => ({
      id: p.id,
      name: p.name,
      description: p.description,
      skillCount: p.skills.length
    }));
  }

  /**
   * Get details of a specific pack
   */
  getPack(packId) {
    return TEMPLATE_PACKS[packId] || null;
  }

  /**
   * Install a template pack
   */
  async installPack(packId, options = {}) {
    const pack = TEMPLATE_PACKS[packId];
    if (!pack) {
      throw new Error(`Unknown pack: ${packId}`);
    }

    const installed = { skills: [], goals: [], chains: [] };

    // Install skills
    for (const skillDef of pack.skills) {
      if (options.skipExisting && this.sm.skills.has(skillDef.id)) {
        continue;
      }

      const content = this.generateSkillMarkdown(skillDef);
      const filepath = path.join(this.skillsDir, `${skillDef.id}.md`);
      await fs.writeFile(filepath, content);
      await this.sm.loadSkill(`${skillDef.id}.md`);
      installed.skills.push(skillDef.id);
    }

    // Set goals
    if (this.goals && pack.goals) {
      for (const goalDef of pack.goals) {
        await this.goals.setGoal(goalDef.skill, {
          daily: goalDef.daily,
          weekly: goalDef.weekly,
          unit: goalDef.unit
        });
        installed.goals.push(goalDef.skill);
      }
    }

    // Install chains
    if (this.chains && pack.chains) {
      for (const chainDef of pack.chains) {
        const chain = await this.chains.addChain({
          ...chainDef,
          id: `${packId}-${chainDef.trigger.skill}-${Date.now()}`
        });
        installed.chains.push(chain.id);
      }
    }

    return {
      pack: pack.name,
      installed
    };
  }

  /**
   * Generate skill markdown from definition
   */
  generateSkillMarkdown(def) {
    return `# ${def.name}

${def.description}

## Triggers
${def.triggers.map(t => `- ${t}`).join('\n')}

## Data Schema
\`\`\`json
${JSON.stringify(def.dataSchema, null, 2)}
\`\`\`

## Actions
- log: Record an entry
- history: Show recent entries
- summary: Get statistics

---
*Installed from template pack*
`;
  }

  /**
   * Preview what a pack would install
   */
  previewPack(packId) {
    const pack = TEMPLATE_PACKS[packId];
    if (!pack) return null;

    return {
      name: pack.name,
      description: pack.description,
      willInstall: {
        skills: pack.skills.map(s => ({ id: s.id, name: s.name })),
        goals: pack.goals || [],
        chains: (pack.chains || []).length
      }
    };
  }

  /**
   * Check which packs are installed
   */
  getInstalledPacks() {
    const installed = [];
    
    for (const [packId, pack] of Object.entries(TEMPLATE_PACKS)) {
      const skillsInstalled = pack.skills.filter(s => this.sm.skills.has(s.id)).length;
      if (skillsInstalled > 0) {
        installed.push({
          id: packId,
          name: pack.name,
          skillsInstalled,
          totalSkills: pack.skills.length,
          complete: skillsInstalled === pack.skills.length
        });
      }
    }
    
    return installed;
  }
}

export default TemplateManager;
