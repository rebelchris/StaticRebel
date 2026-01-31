/**
 * Natural Language Parser for Skills
 * 
 * Parses natural sentences into structured skill entries.
 * "ran 5k in 28 minutes" → { skill: 'exercise', type: 'run', distance: 5, duration: 28 }
 */

// ============== NUMBER EXTRACTION ==============

const NUMBER_WORDS = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5,
  six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, fifteen: 15, twenty: 20, thirty: 30,
  forty: 40, fifty: 50, hundred: 100
};

const UNIT_MULTIPLIERS = {
  k: 1000, K: 1000,          // 5k = 5000
  m: 1, M: 1000000,          // context-dependent
  ml: 1, ML: 1, l: 1000, L: 1000, liter: 1000, liters: 1000, litre: 1000,
  km: 1, mi: 1.60934, mile: 1.60934, miles: 1.60934,
  min: 1, mins: 1, minute: 1, minutes: 1,
  hr: 60, hour: 60, hours: 60, h: 60,
  sec: 1/60, secs: 1/60, second: 1/60, seconds: 1/60,
  cup: 1, cups: 1, glass: 1, glasses: 1,
  step: 1, steps: 1
};

/**
 * Extract numbers with optional units from text
 */
export function extractNumbers(text) {
  const results = [];
  const lower = text.toLowerCase();

  // Pattern: number + optional unit (5k, 30min, 2.5L, etc)
  const numPattern = /(\d+(?:\.\d+)?)\s*(k|km|mi|miles?|min(?:ute)?s?|hrs?|hours?|secs?|seconds?|ml|l(?:iter)?s?|cups?|glass(?:es)?|steps?)?/gi;
  
  let match;
  while ((match = numPattern.exec(lower)) !== null) {
    const value = parseFloat(match[1]);
    const unit = match[2]?.toLowerCase() || null;
    
    results.push({
      raw: match[0],
      value,
      unit,
      multiplier: unit ? (UNIT_MULTIPLIERS[unit] || 1) : 1,
      normalized: value * (unit ? (UNIT_MULTIPLIERS[unit] || 1) : 1)
    });
  }

  // Word numbers (one, two, etc)
  for (const [word, num] of Object.entries(NUMBER_WORDS)) {
    if (lower.includes(word)) {
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
    triggers: ['water', 'drank', 'drink', 'hydrat', 'glass', 'bottle'],
    parse(text, numbers) {
      const entry = { value: 250 }; // default glass
      
      // Look for ml/L amounts
      const mlNum = numbers.find(n => n.unit && ['ml', 'l', 'liter', 'liters'].includes(n.unit));
      if (mlNum) {
        entry.value = mlNum.unit?.startsWith('l') ? mlNum.value * 1000 : mlNum.value;
      } else if (numbers.length > 0) {
        // Bare number - assume ml if > 10, glasses if <= 10
        const n = numbers[0].value;
        entry.value = n > 10 ? n : n * 250;
      }
      
      // Check for glass/cup counts
      const glassNum = numbers.find(n => n.unit && ['cup', 'cups', 'glass', 'glasses'].includes(n.unit));
      if (glassNum) {
        entry.value = glassNum.value * 250;
      }

      return entry;
    }
  },

  mood: {
    triggers: ['mood', 'feeling', 'feel', 'emotion', 'day was', 'doing'],
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
        entry.score = score.value;
      } else {
        // Try to extract from mood words
        for (const [word, value] of Object.entries(this.moods)) {
          if (lower.includes(word)) {
            entry.score = value;
            break;
          }
        }
      }

      // Extract note (everything that's not the number)
      const noteMatch = text.match(/[-–—:]\s*(.+)$/);
      if (noteMatch) {
        entry.note = noteMatch[1].trim();
      }

      return entry;
    }
  },

  exercise: {
    triggers: ['exercise', 'workout', 'ran', 'run', 'walk', 'gym', 'swim', 'bike', 'cycl', 'jog', 'hike', 'yoga', 'lift'],
    types: {
      ran: 'run', run: 'run', running: 'run', jog: 'run', jogging: 'run',
      walk: 'walk', walked: 'walk', walking: 'walk', hike: 'walk', hiked: 'walk',
      gym: 'gym', weights: 'gym', lift: 'gym', lifting: 'gym',
      swim: 'swim', swam: 'swim', swimming: 'swim',
      bike: 'bike', biked: 'bike', cycl: 'bike', cycling: 'bike',
      yoga: 'yoga',
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

      // Duration (min/hr) - check this BEFORE distance to avoid false matches
      const dur = numbers.find(n => n.unit && ['min', 'mins', 'minute', 'minutes', 'hr', 'hour', 'hours', 'h'].includes(n.unit));
      if (dur) {
        entry.duration = dur.value * (dur.unit?.startsWith('h') ? 60 : 1); // convert to minutes
      }

      // Steps
      const steps = numbers.find(n => n.unit && ['step', 'steps'].includes(n.unit));
      if (steps) {
        entry.steps = steps.value;
      }

      // If just a bare number and it's run/walk, assume km
      if (!entry.distance && !entry.duration && numbers.length > 0 && ['run', 'walk'].includes(entry.type)) {
        const n = numbers[0].value;
        if (n < 50) {
          entry.distance = n;
          entry.distanceUnit = 'km';
        }
      }

      return entry;
    }
  },

  notes: {
    triggers: ['note', 'remember', 'remind', 'jot', 'save this', 'todo', 'thought'],
    parse(text) {
      // Extract content after trigger words
      const patterns = [
        /note:\s*(.+)/i,
        /remember(?:\s+to)?:\s*(.+)/i,
        /remember(?:\s+to)?\s+(.+)/i,
        /jot(?:\s+down)?:\s*(.+)/i,
        /todo:\s*(.+)/i,
        /thought:\s*(.+)/i
      ];

      for (const pattern of patterns) {
        const match = text.match(pattern);
        if (match) {
          return { content: match[1].trim() };
        }
      }

      return { content: text.trim() };
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
        entry: {
          ...entry,
          ...(time && { date: time.date.toISOString().split('T')[0] })
        },
        raw: text
      };
    }
  }

  // No skill matched - return null
  return null;
}

/**
 * Parse and suggest corrections/clarifications
 */
export function parseWithSuggestions(text) {
  const result = parseInput(text);
  
  if (!result) {
    return {
      success: false,
      message: "I'm not sure what skill this is for. Try mentioning: water, mood, exercise, or notes."
    };
  }

  const suggestions = [];

  // Skill-specific suggestions
  if (result.skill === 'water' && !result.entry.value) {
    suggestions.push("How much water? (e.g., '500ml' or '2 glasses')");
  }
  if (result.skill === 'mood' && !result.entry.score) {
    suggestions.push("What's your mood score? (1-10, or words like 'good', 'meh', 'great')");
  }
  if (result.skill === 'exercise' && !result.entry.duration && !result.entry.distance) {
    suggestions.push("Duration or distance? (e.g., '30 minutes' or '5k')");
  }

  return {
    success: true,
    ...result,
    suggestions
  };
}

export default { parseInput, parseWithSuggestions, extractNumbers, extractTime };
