/**
 * Intent Definitions
 * Declarative, configurable intent patterns
 */

export const INTENT_DEFINITIONS = {
  TRACK: {
    name: 'TRACK',
    description: 'Logging/recording metrics with a number',
    patterns: {
      verbs: ['drank', 'walked', 'ate', 'slept', 'read', 'had', 'eaten', 'consumed', 'logged', 'recorded', 'exercised', 'meditated', 'worked', 'walkd'],
      units: {
        liquids: ['glass', 'cup', 'bottle', 'ml', 'liter', 'ounce'],
        distance: ['step', 'mile', 'km'],
        time: ['hour', 'min', 'minute', 'second'],
        pages: ['page', 'chapter'],
        food: ['serving', 'portion'],
        exercise: ['rep', 'set']
      },
      skills: ['water', 'coffee', 'tea', 'sleep', 'steps', 'reading', 'meditation', 'exercise', 'pushup', 'food', 'mood', 'weight']
    },
    requiresNumber: true
  },
  CREATE_PROJECT: {
    name: 'CREATE_PROJECT',
    description: 'Building/making/creating code',
    patterns: {
      keywords: ['make', 'build', 'create', 'generate', 'code', 'develop', 'scaffold'],
      targets: ['app', 'website', 'web-app', 'api', 'bot', 'cli', 'tool', 'calculator', 'todo', 'list', 'portfolio', 'blog', 'game', 'weather-app', 'weather-widget', 'rest-api', 'discord-bot'],
      techStack: ['react', 'node', 'javascript', 'js', 'html', 'css', 'python', 'express', 'discord.js', 'vue', 'svelte', 'typescript', 'next']
    }
  },
  WEB_SEARCH: {
    name: 'WEB_SEARCH',
    description: 'Finding current/realtime information',
    patterns: {
      keywords: ['trending', 'news', 'weather', 'stock', 'latest', 'what\'s', 'what is', 'happening', 'current', 'today', 'right now'],
      questions: ['what', 'who', 'where', 'when', 'why', 'how']
    }
  },
  COMMAND: {
    name: 'COMMAND',
    description: 'System operations',
    patterns: {
      keywords: ['^list', '^show', '^display', '^get', '^help', '^stats', '^skills', '^entries', '^delete', '^remove', '^update', '^export', '^import'],
      maxLength: 50
    }
  },
  CHAT: {
    name: 'CHAT',
    description: 'Casual conversation',
    patterns: {
      greetings: ['^hi', '^hello', '^hey', '^morning', '^afternoon', '^evening'],
      responses: ['thanks', 'thank', 'cheers', 'wassup', 'sup', 'goodnight', 'good night'],
      conversational: ['how are', 'how\'s', 'whats up', 'what\'s up']
    }
  }
};

export const DEFAULT_SKILL_TAXONOMY = {
  hydration: {
    aliases: ['water', 'drinking', 'fluids'],
    defaultUnit: 'glasses',
    supportedUnits: ['glasses', 'cups', 'bottles', 'ml', 'liters']
  },
  caffeine: {
    aliases: ['coffee', 'tea', 'caffeine', 'espresso'],
    defaultUnit: 'cups',
    supportedUnits: ['cups', 'shots', 'ml']
  },
  activity: {
    aliases: ['steps', 'walking', 'walk', 'step'],
    defaultUnit: 'steps',
    supportedUnits: ['steps', 'miles', 'km']
  },
  sleep: {
    aliases: ['sleep', 'sleeping', 'rest'],
    defaultUnit: 'hours',
    supportedUnits: ['hours', 'minutes']
  },
  reading: {
    aliases: ['reading', 'books', 'pages'],
    defaultUnit: 'pages',
    supportedUnits: ['pages', 'chapters', 'books']
  },
  meditation: {
    aliases: ['meditation', 'meditating', 'mindfulness'],
    defaultUnit: 'minutes',
    supportedUnits: ['minutes', 'hours', 'sessions']
  },
  exercise: {
    aliases: ['exercise', 'workout', 'pushup', 'pushups', 'fitness', 'training'],
    defaultUnit: 'reps',
    supportedUnits: ['reps', 'sets', 'minutes', 'hours']
  },
  nutrition: {
    aliases: ['food', 'ate', 'eating', 'meals', 'calories'],
    defaultUnit: 'servings',
    supportedUnits: ['servings', 'calories', 'grams']
  },
  mood: {
    aliases: ['mood', 'feeling', 'emotion', 'happy', 'sad'],
    defaultUnit: 'scale',
    supportedUnits: ['scale', '1-10']
  },
  expenses: {
    aliases: ['expenses', 'spent', 'spending', 'money', 'cost'],
    defaultUnit: 'dollars',
    supportedUnits: ['dollars', 'dollars', 'eur', 'gbp']
  }
};

export function getIntentDefinitions() {
  return INTENT_DEFINITIONS;
}

export function getSkillTaxonomy() {
  return DEFAULT_SKILL_TAXONOMY;
}

export function matchPattern(text, patterns) {
  if (Array.isArray(patterns)) {
    return patterns.some(p => new RegExp(p, 'i').test(text));
  }
  if (typeof patterns === 'object') {
    return Object.values(patterns).some(val => {
      if (Array.isArray(val)) {
        return val.some(v => new RegExp(v, 'i').test(text));
      }
      if (typeof val === 'object') {
        return Object.values(val).some(v => 
          Array.isArray(v) ? v.some(x => new RegExp(x, 'i').test(text)) : new RegExp(v, 'i').test(text)
        );
      }
      return new RegExp(val, 'i').test(text);
    });
  }
  return new RegExp(patterns, 'i').test(text);
}

export default {
  INTENT_DEFINITIONS,
  DEFAULT_SKILL_TAXONOMY,
  getIntentDefinitions,
  getSkillTaxonomy,
  matchPattern
};
