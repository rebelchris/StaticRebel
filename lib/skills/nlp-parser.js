/**
 * Natural Language Parser for Skills
 * 
 * Parses natural sentences into structured skill entries.
 * "ran 5k in 28 minutes" → { skill: 'exercise', type: 'run', distance: 5, duration: 28 }
 * "drank 500ml water" → { skill: 'water', value: 500 }
 */

// ============== NUMBER EXTRACTION ==============

const NUMBER_WORDS = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5,
  six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, fifteen: 15, twenty: 20, thirty: 30,
  forty: 40, fifty: 50, hundred: 100, half: 0.5
};

const UNIT_MULTIPLIERS = {
  k: 1000, K: 1000,
  m: 1, M: 1000000,
  ml: 1, ML: 1, l: 1000, L: 1000, liter: 1000, liters: 1000, litre: 1000,
  km: 1, mi: 1.60934, mile: 1.60934, miles: 1.60934,
  min: 1, mins: 1, minute: 1, minutes: 1,
  hr: 60, hour: 60, hours: 60, h: 60,
  sec: 1/60, secs: 1/60, second: 1/60, seconds: 1/60,
  cup: 250, cups: 250, glass: 250, glasses: 250, bottle: 500, bottles: 500,
  step: 1, steps: 1
};

/**
 * Extract numbers with optional units from text
 */
export function extractNumbers(text) {
  const results = [];
  const lower = text.toLowerCase();

  // Pattern: number + optional unit
  const numPattern = /(\d+(?:\.\d+)?)\s*(k|km|mi|miles?|min(?:ute)?s?|hrs?|hours?|secs?|seconds?|ml|l(?:iter)?s?|cups?|glass(?:es)?|bottles?|steps?)?/gi;
  
  let match;
  while ((match = numPattern.exec(lower)) !== null) {
    const value = parseFloat(match[1]);
    const unit = match[2]?.toLowerCase() || null;
    const multiplier = unit ? (UNIT_MULTIPLIERS[unit] || 1) : 1;
    
    results.push({
      raw: match[0],
      value,
      unit,
      multiplier,
      normalized: value * multiplier
    });
  }

  // Word numbers
  for (const [word, num] of Object.entries(NUMBER_WORDS)) {
    const wordPattern = new RegExp(`\\b${word}\\b`, 'i');
    if (wordPattern.test(lower)) {
      results.push({ raw: word, value: num, unit: null, normalized: num });
    }
  }

  return results;
}

// ============== TIME EXTRACTION ==============

const TIME_PATTERNS = {
  today: () => new Date(),
  yesterday: () => { const d = new Date(); d.setDate(d.getDate() - 1); return d; },
  'this morning': () => new Date(),
  'this afternoon': () => new Date(),
  'this evening': () => new Date(),
  'last night': () => { const d = new Date(); d.setDate(d.getDate() - 1); return d; },
};

export function extractTime(text) {
  const lower = text.toLowerCase();
  
  for (const [pattern, fn] of Object.entries(TIME_PATTERNS)) {
    if (lower.includes(pattern)) {
      return { expression: pattern, date: fn() };
    }
  }
  
  return null;
}

// ============== SKILL-SPECIFIC PARSERS ==============

const SKILL_PARSERS = {
  water: {
    triggers: ['water', 'drank', 'drink', 'hydrat', 'glass of', 'bottle of'],
    unit: 'ml',
    parse(text, numbers) {
      const entry = { value: 250 }; // default glass
      
      // Look for ml/L amounts
      const mlNum = numbers.find(n => n.unit && ['ml', 'l', 'liter', 'liters', 'litre'].includes(n.unit));
      if (mlNum) {
        entry.value = mlNum.normalized;
      } else {
        // Look for glass/bottle/cup
        const containerNum = numbers.find(n => n.unit && ['cup', 'cups', 'glass', 'glasses', 'bottle', 'bottles'].includes(n.unit));
        if (containerNum) {
          entry.value = containerNum.normalized;
        } else if (numbers.length > 0) {
          // Bare number - assume ml if > 10, glasses if <= 10
          const n = numbers[0].value;
          entry.value = n > 10 ? n : n * 250;
        }
      }
      
      return entry;
    }
  },

  coffee: {
    triggers: ['coffee', 'espresso', 'cappuccino', 'latte', 'caffeine', 'americano'],
    unit: 'cups',
    parse(text, numbers) {
      const entry = { value: 1 }; // default 1 cup
      
      if (text.toLowerCase().includes('double')) {
        entry.value = 2;
      } else if (numbers.length > 0) {
        entry.value = numbers[0].value;
      }
      
      return entry;
    }
  },

  mood: {
    triggers: ['mood', 'feeling', 'feel ', 'emotion', 'day was', 'doing '],
    unit: 'score',
    moods: {
      terrible: 1, awful: 1, horrible: 2,
      bad: 3, rough: 3, down: 3, sad: 3, low: 3,
      meh: 4, okay: 5, ok: 5, alright: 5, fine: 5,
      good: 6, nice: 7, great: 8, happy: 8,
      amazing: 9, fantastic: 9, excellent: 9, wonderful: 9, awesome: 10
    },
    parse(text, numbers) {
      const lower = text.toLowerCase();
      const entry = {};

      // Look for explicit score (1-10)
      const score = numbers.find(n => n.value >= 1 && n.value <= 10 && !n.unit);
      if (score) {
        entry.value = score.value;
      } else {
        // Try mood words
        for (const [word, value] of Object.entries(this.moods)) {
          if (lower.includes(word)) {
            entry.value = value;
            break;
          }
        }
      }

      // Extract note
      const noteMatch = text.match(/[-–—:]\s*(.+)$/);
      if (noteMatch) {
        entry.note = noteMatch[1].trim();
      }

      return entry;
    }
  },

  exercise: {
    triggers: ['exercise', 'workout', 'ran ', 'run ', 'walk', 'gym', 'swim', 'bike', 'cycl', 'jog', 'hike', 'yoga', 'lift', 'pushup', 'squat', 'plank'],
    unit: 'minutes',
    types: {
      ran: 'run', run: 'run', running: 'run', jog: 'run', jogging: 'run',
      walk: 'walk', walked: 'walk', walking: 'walk', hike: 'walk', hiked: 'walk',
      gym: 'gym', weights: 'gym', lift: 'gym', lifting: 'gym',
      swim: 'swim', swam: 'swim', swimming: 'swim',
      bike: 'bike', biked: 'bike', cycl: 'bike', cycling: 'bike',
      yoga: 'yoga',
      pushup: 'pushups', 'push-up': 'pushups', 'push up': 'pushups',
      squat: 'squats', plank: 'plank',
      workout: 'workout', exercise: 'workout'
    },
    parse(text, numbers) {
      const lower = text.toLowerCase();
      const entry = { type: 'workout' };

      // Detect type
      for (const [trigger, type] of Object.entries(this.types)) {
        if (lower.includes(trigger)) {
          entry.type = type;
          break;
        }
      }

      // Distance (k/km/mi)
      const dist = numbers.find(n => n.unit && ['k', 'km', 'mi', 'mile', 'miles'].includes(n.unit));
      if (dist) {
        entry.distance = dist.unit === 'k' ? dist.value : dist.normalized;
        entry.distanceUnit = 'km';
      }

      // Duration
      const dur = numbers.find(n => n.unit && ['min', 'mins', 'minute', 'minutes', 'hr', 'hour', 'hours', 'h'].includes(n.unit));
      if (dur) {
        entry.value = dur.normalized; // normalized to minutes
      }

      // Steps
      const steps = numbers.find(n => n.unit && ['step', 'steps'].includes(n.unit));
      if (steps) {
        entry.steps = steps.value;
      }

      // Reps (for exercises like pushups)
      if (['pushups', 'squats', 'plank'].includes(entry.type) && numbers.length > 0) {
        entry.value = numbers[0].value;
        entry.unit = entry.type === 'plank' ? 'seconds' : 'reps';
      }

      // Bare number for run/walk = km
      if (!entry.distance && !entry.value && numbers.length > 0 && ['run', 'walk'].includes(entry.type)) {
        const n = numbers[0].value;
        if (n < 50) {
          entry.distance = n;
          entry.distanceUnit = 'km';
        }
      }

      return entry;
    }
  },

  steps: {
    triggers: ['steps', 'walked'],
    unit: 'steps',
    parse(text, numbers) {
      const entry = { value: 0 };
      
      const stepsNum = numbers.find(n => n.unit === 'steps' || n.unit === 'step');
      if (stepsNum) {
        entry.value = stepsNum.value;
      } else if (numbers.length > 0) {
        // Check for km (assume 1300 steps per km)
        const kmNum = numbers.find(n => n.unit && ['k', 'km'].includes(n.unit));
        if (kmNum) {
          entry.value = Math.round(kmNum.value * 1300);
        } else {
          entry.value = numbers[0].value;
        }
      }
      
      return entry;
    }
  },

  sleep: {
    triggers: ['sleep', 'slept', 'bed', 'woke'],
    unit: 'hours',
    parse(text, numbers) {
      const entry = {};
      
      const hourNum = numbers.find(n => n.unit && ['hr', 'hour', 'hours', 'h'].includes(n.unit));
      if (hourNum) {
        entry.value = hourNum.value;
      } else if (numbers.length > 0) {
        entry.value = numbers[0].value;
      }
      
      return entry;
    }
  }
};

// ============== MAIN PARSER ==============

/**
 * Parse a natural language input into a structured skill entry
 */
export function parseInput(text) {
  const lower = text.toLowerCase();
  const numbers = extractNumbers(text);
  const time = extractTime(text);

  // Find matching skill parser
  for (const [skillId, parser] of Object.entries(SKILL_PARSERS)) {
    const matches = parser.triggers.some(t => lower.includes(t));
    if (matches) {
      const entry = parser.parse(text, numbers);
      return {
        skill: skillId,
        confidence: 0.8,
        unit: parser.unit,
        entry: {
          ...entry,
          ...(time && { date: time.date.toISOString().split('T')[0] })
        },
        raw: text
      };
    }
  }

  // No skill matched - try to detect intent
  return detectNewSkill(text, numbers);
}

/**
 * Try to detect if user wants to create/track a new skill
 */
function detectNewSkill(text, numbers) {
  const lower = text.toLowerCase();
  
  // "track X", "log X", "record X" patterns
  const createPatterns = [
    /(?:track|log|record|add|create)\s+(?:my\s+)?(\w+)/i,
    /(\w+)\s+(?:tracker|tracking)/i,
    /did\s+(\d+)\s+(\w+)/i,  // "did 50 pushups"
    /had\s+(\d+)\s+(\w+)/i,  // "had 2 beers"
    /ate\s+(\d+)\s+(\w+)/i,  // "ate 3 cookies"
  ];
  
  for (const pattern of createPatterns) {
    const match = text.match(pattern);
    if (match) {
      const skillName = match[2] || match[1];
      const amount = match[1] && !isNaN(parseInt(match[1])) ? parseInt(match[1]) : (numbers[0]?.value || 1);
      
      return {
        skill: null,
        suggestedSkill: skillName.toLowerCase(),
        confidence: 0.6,
        entry: { value: amount },
        raw: text,
        createNew: true
      };
    }
  }

  return null;
}

/**
 * Parse and provide suggestions
 */
export function parseWithSuggestions(text) {
  const result = parseInput(text);
  
  if (!result) {
    return {
      success: false,
      message: "I'm not sure what skill this is for. Try: 'drank 500ml water', 'walked 5k steps', or 'mood: great'"
    };
  }

  if (result.createNew) {
    return {
      success: true,
      ...result,
      suggestions: [`Create new skill '${result.suggestedSkill}'?`]
    };
  }

  const suggestions = [];

  if (result.skill === 'water' && !result.entry.value) {
    suggestions.push("How much water? (e.g., '500ml' or '2 glasses')");
  }
  if (result.skill === 'mood' && !result.entry.value) {
    suggestions.push("What's your mood? (1-10, or words like 'good', 'meh', 'great')");
  }
  if (result.skill === 'exercise' && !result.entry.value && !result.entry.distance) {
    suggestions.push("Duration or distance? (e.g., '30 min' or '5k')");
  }

  return {
    success: true,
    ...result,
    suggestions
  };
}

/**
 * Check if text looks like tracking intent
 */
export function isTrackingIntent(text) {
  const lower = text.toLowerCase();
  
  // Common tracking patterns
  const patterns = [
    /^(drank|had|ate|did|walked|ran|logged|tracked|slept)/i,
    /\d+\s*(ml|l|cups?|glasses?|steps?|km|k|min|hours?|reps?)/i,
    /mood|feeling|exercise|water|coffee|sleep/i,
  ];
  
  return patterns.some(p => p.test(lower));
}

export default { parseInput, parseWithSuggestions, extractNumbers, extractTime, isTrackingIntent };
