/**
 * Natural Language Parser for Skills
 * 
 * Distinguishes between:
 * - QUERIES: "how much water did I drink?", "show my steps"
 * - LOGGING: "drank 500ml", "did 20 pushups"
 */

// ============== INTENT DETECTION ==============

const QUERY_PATTERNS = [
  /^how (much|many|is|are|was)/i,
  /^what('s| is| are| was| were)/i,
  /^show (me |my )?/i,
  /^check (my )?/i,
  /^(did|have) I /i,
  /\?$/,  // ends with question mark
  /^my .+ (today|this week|yesterday)/i,
  /status|progress|total|summary/i,
];

const LOG_PATTERNS = [
  /^(drank|had|ate|did|walked|ran|logged|tracked|slept|took)/i,
  /^I (drank|had|ate|did|walked|ran|just|logged)/i,
  /^just (drank|had|ate|did|walked|ran)/i,
  /^\d+\s*(ml|l|cups?|glasses?|steps?|km|k|min|hours?|reps?)/i,  // starts with number+unit
];

/**
 * Detect if the input is a query (asking for info) vs logging (recording data)
 */
export function detectIntent(text) {
  const lower = text.toLowerCase().trim();
  
  // Check query patterns first (questions take priority)
  for (const pattern of QUERY_PATTERNS) {
    if (pattern.test(lower)) {
      return 'query';
    }
  }
  
  // Check log patterns
  for (const pattern of LOG_PATTERNS) {
    if (pattern.test(lower)) {
      return 'log';
    }
  }
  
  // Default: if it has numbers with units, probably logging
  if (/\d+\s*(ml|l|cups?|glasses?|steps?|km|k|min|hours?|reps?)\b/i.test(lower)) {
    return 'log';
  }
  
  return 'unknown';
}

// ============== NUMBER EXTRACTION ==============

const NUMBER_WORDS = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5,
  six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, fifteen: 15, twenty: 20, thirty: 30,
  forty: 40, fifty: 50, hundred: 100, half: 0.5
};

const UNIT_INFO = {
  // Volume
  ml: { multiplier: 1, category: 'volume' },
  l: { multiplier: 1000, category: 'volume' },
  liter: { multiplier: 1000, category: 'volume' },
  liters: { multiplier: 1000, category: 'volume' },
  litre: { multiplier: 1000, category: 'volume' },
  cup: { multiplier: 1, category: 'cups' },
  cups: { multiplier: 1, category: 'cups' },
  glass: { multiplier: 1, category: 'glasses' },
  glasses: { multiplier: 1, category: 'glasses' },
  bottle: { multiplier: 1, category: 'bottles' },
  bottles: { multiplier: 1, category: 'bottles' },
  // Distance
  k: { multiplier: 1, category: 'distance' },
  km: { multiplier: 1, category: 'distance' },
  mi: { multiplier: 1.60934, category: 'distance' },
  mile: { multiplier: 1.60934, category: 'distance' },
  miles: { multiplier: 1.60934, category: 'distance' },
  // Time
  min: { multiplier: 1, category: 'time' },
  mins: { multiplier: 1, category: 'time' },
  minute: { multiplier: 1, category: 'time' },
  minutes: { multiplier: 1, category: 'time' },
  hr: { multiplier: 60, category: 'time' },
  hour: { multiplier: 60, category: 'time' },
  hours: { multiplier: 60, category: 'time' },
  h: { multiplier: 60, category: 'time' },
  sec: { multiplier: 1/60, category: 'time' },
  secs: { multiplier: 1/60, category: 'time' },
  // Count
  step: { multiplier: 1, category: 'steps' },
  steps: { multiplier: 1, category: 'steps' },
  rep: { multiplier: 1, category: 'reps' },
  reps: { multiplier: 1, category: 'reps' },
};

export function extractNumbers(text) {
  const results = [];
  const lower = text.toLowerCase();

  // Pattern: number + optional unit
  const numPattern = /(\d+(?:\.\d+)?)\s*(k|km|mi|miles?|min(?:ute)?s?|hrs?|hours?|h|secs?|seconds?|ml|l(?:iter)?s?|cups?|glass(?:es)?|bottles?|steps?|reps?)?/gi;
  
  let match;
  while ((match = numPattern.exec(lower)) !== null) {
    const value = parseFloat(match[1]);
    const unit = match[2]?.toLowerCase() || null;
    const unitInfo = unit ? UNIT_INFO[unit] : null;
    
    results.push({
      raw: match[0],
      value,
      unit,
      category: unitInfo?.category || null,
      multiplier: unitInfo?.multiplier || 1,
      normalized: value * (unitInfo?.multiplier || 1)
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

// ============== SKILL EXTRACTION ==============

// Map of skill keywords to skill IDs
const SKILL_KEYWORDS = {
  // Water
  water: 'water',
  drank: 'water',
  drink: 'water',
  hydration: 'water',
  hydrate: 'water',
  
  // Coffee
  coffee: 'coffee',
  espresso: 'coffee',
  cappuccino: 'coffee',
  latte: 'coffee',
  americano: 'coffee',
  caffeine: 'coffee',
  
  // Steps
  steps: 'steps',
  step: 'steps',
  
  // Exercise (generic)
  exercise: 'exercise',
  workout: 'exercise',
  gym: 'exercise',
  
  // Specific exercises -> their own skills
  pushup: 'pushups',
  pushups: 'pushups',
  'push-up': 'pushups',
  'push-ups': 'pushups',
  'push up': 'pushups',
  'push ups': 'pushups',
  
  squat: 'squats',
  squats: 'squats',
  
  plank: 'plank',
  planks: 'plank',
  
  situp: 'situps',
  situps: 'situps',
  'sit-up': 'situps',
  'sit-ups': 'situps',
  
  burpee: 'burpees',
  burpees: 'burpees',
  
  // Cardio
  run: 'running',
  ran: 'running',
  running: 'running',
  jog: 'running',
  jogging: 'running',
  
  walk: 'walking',
  walked: 'walking',
  walking: 'walking',
  hike: 'walking',
  hiked: 'walking',
  
  bike: 'cycling',
  biked: 'cycling',
  cycling: 'cycling',
  cycle: 'cycling',
  
  swim: 'swimming',
  swam: 'swimming',
  swimming: 'swimming',
  
  // Mood
  mood: 'mood',
  feeling: 'mood',
  feel: 'mood',
  
  // Sleep
  sleep: 'sleep',
  slept: 'sleep',
};

// Default configurations for auto-created skills
const SKILL_DEFAULTS = {
  water: { unit: 'ml', goal: 2000, icon: '💧' },
  coffee: { unit: 'cups', goal: 3, icon: '☕' },
  steps: { unit: 'steps', goal: 10000, icon: '🚶' },
  pushups: { unit: 'reps', goal: 50, icon: '💪' },
  squats: { unit: 'reps', goal: 50, icon: '🦵' },
  situps: { unit: 'reps', goal: 50, icon: '🏋️' },
  burpees: { unit: 'reps', goal: 20, icon: '🔥' },
  plank: { unit: 'seconds', goal: 120, icon: '🧘' },
  running: { unit: 'km', goal: 5, icon: '🏃' },
  walking: { unit: 'km', goal: 3, icon: '🚶' },
  cycling: { unit: 'km', goal: 10, icon: '🚴' },
  swimming: { unit: 'meters', goal: 500, icon: '🏊' },
  mood: { unit: 'score', goal: null, icon: '😊' },
  sleep: { unit: 'hours', goal: 8, icon: '😴' },
  exercise: { unit: 'minutes', goal: 30, icon: '🏋️' },
};

/**
 * Extract skill from text
 */
export function extractSkill(text) {
  const lower = text.toLowerCase();
  
  // Check each keyword
  for (const [keyword, skillId] of Object.entries(SKILL_KEYWORDS)) {
    // Use word boundary to avoid partial matches
    const pattern = new RegExp(`\\b${keyword.replace(/[- ]/g, '[- ]?')}s?\\b`, 'i');
    if (pattern.test(lower)) {
      return {
        id: skillId,
        keyword,
        defaults: SKILL_DEFAULTS[skillId] || { unit: 'count', goal: null, icon: '📊' }
      };
    }
  }
  
  return null;
}

// ============== MOOD PARSING ==============

const MOOD_WORDS = {
  terrible: 1, awful: 1, horrible: 2,
  bad: 3, rough: 3, down: 3, sad: 3, low: 3,
  meh: 4, okay: 5, ok: 5, alright: 5, fine: 5,
  good: 6, nice: 7, great: 8, happy: 8,
  amazing: 9, fantastic: 9, excellent: 9, wonderful: 9, awesome: 10
};

export function extractMood(text) {
  const lower = text.toLowerCase();
  
  for (const [word, score] of Object.entries(MOOD_WORDS)) {
    if (lower.includes(word)) {
      return { score, word };
    }
  }
  
  return null;
}

// ============== MAIN PARSING ==============

/**
 * Parse input for logging
 */
export function parseForLogging(text) {
  const numbers = extractNumbers(text);
  const skill = extractSkill(text);
  
  if (!skill) {
    return null;
  }
  
  const entry = { value: 1 }; // default
  
  // Handle specific skill types
  switch (skill.id) {
    case 'water':
      // Look for ml/L or cups/glasses
      const volNum = numbers.find(n => n.category === 'volume');
      const cupNum = numbers.find(n => n.category === 'cups' || n.category === 'glasses' || n.category === 'bottles');
      
      if (volNum) {
        entry.value = volNum.normalized;
      } else if (cupNum) {
        // Convert cups/glasses to ml
        const mlPerUnit = cupNum.category === 'bottles' ? 500 : 250;
        entry.value = cupNum.value * mlPerUnit;
      } else if (numbers.length > 0) {
        // Bare number: assume ml if > 10, else cups
        const n = numbers[0].value;
        entry.value = n > 10 ? n : n * 250;
      } else {
        entry.value = 250; // default glass
      }
      break;
      
    case 'coffee':
      entry.value = numbers.length > 0 ? numbers[0].value : 1;
      break;
      
    case 'steps':
      const stepsNum = numbers.find(n => n.category === 'steps');
      const distNum = numbers.find(n => n.category === 'distance');
      
      if (stepsNum) {
        entry.value = stepsNum.value;
      } else if (distNum) {
        // Convert km to steps (approx 1300 steps/km)
        entry.value = Math.round(distNum.normalized * 1300);
      } else if (numbers.length > 0) {
        entry.value = numbers[0].value;
      }
      break;
      
    case 'pushups':
    case 'squats':
    case 'situps':
    case 'burpees':
      entry.value = numbers.length > 0 ? numbers[0].value : 10;
      break;
      
    case 'plank':
      // Plank is usually in seconds
      const timeNum = numbers.find(n => n.category === 'time');
      if (timeNum) {
        entry.value = timeNum.unit?.startsWith('min') ? timeNum.value * 60 : timeNum.value;
      } else if (numbers.length > 0) {
        entry.value = numbers[0].value;
      } else {
        entry.value = 30;
      }
      break;
      
    case 'running':
    case 'walking':
    case 'cycling':
      const dist = numbers.find(n => n.category === 'distance');
      const time = numbers.find(n => n.category === 'time');
      
      if (dist) {
        entry.value = dist.normalized;
        entry.unit = 'km';
      } else if (time) {
        entry.value = time.normalized;
        entry.unit = 'minutes';
      } else if (numbers.length > 0) {
        // Assume km if < 50, else minutes
        const n = numbers[0].value;
        entry.value = n;
        entry.unit = n < 50 ? 'km' : 'minutes';
      }
      break;
      
    case 'swimming':
      const swimDist = numbers.find(n => n.category === 'distance');
      if (swimDist) {
        entry.value = swimDist.normalized * 1000; // km to meters
      } else if (numbers.length > 0) {
        entry.value = numbers[0].value;
      }
      break;
      
    case 'mood':
      const mood = extractMood(text);
      const moodNum = numbers.find(n => n.value >= 1 && n.value <= 10 && !n.unit);
      
      if (moodNum) {
        entry.value = moodNum.value;
      } else if (mood) {
        entry.value = mood.score;
        entry.note = mood.word;
      }
      break;
      
    case 'sleep':
      const sleepTime = numbers.find(n => n.category === 'time');
      if (sleepTime) {
        entry.value = sleepTime.unit?.startsWith('h') ? sleepTime.value : sleepTime.value / 60;
      } else if (numbers.length > 0) {
        entry.value = numbers[0].value;
      }
      break;
      
    default:
      // Generic: just use first number
      entry.value = numbers.length > 0 ? numbers[0].value : 1;
  }
  
  return {
    skillId: skill.id,
    skillDefaults: skill.defaults,
    entry,
    raw: text
  };
}

/**
 * Parse input for querying
 */
export function parseForQuery(text) {
  const skill = extractSkill(text);
  
  // Detect time range
  const lower = text.toLowerCase();
  let period = 'today';
  
  if (lower.includes('yesterday')) period = 'yesterday';
  else if (lower.includes('this week') || lower.includes('week')) period = 'week';
  else if (lower.includes('this month') || lower.includes('month')) period = 'month';
  else if (lower.includes('all time') || lower.includes('total') || lower.includes('ever')) period = 'all';
  
  return {
    skillId: skill?.id || null,
    skillDefaults: skill?.defaults || null,
    period,
    raw: text
  };
}

/**
 * Main parse function - determines intent and parses accordingly
 */
export function parseInput(text) {
  const intent = detectIntent(text);
  
  if (intent === 'query') {
    return {
      intent: 'query',
      ...parseForQuery(text)
    };
  }
  
  if (intent === 'log') {
    const parsed = parseForLogging(text);
    if (parsed) {
      return {
        intent: 'log',
        ...parsed
      };
    }
  }
  
  // Try logging anyway if we can extract a skill
  const parsed = parseForLogging(text);
  if (parsed) {
    return {
      intent: 'log',
      ...parsed
    };
  }
  
  return {
    intent: 'unknown',
    raw: text
  };
}

/**
 * Check if text looks like it could be skill-related
 */
export function isSkillRelated(text) {
  const skill = extractSkill(text);
  return skill !== null || detectIntent(text) !== 'unknown';
}

// Legacy exports for compatibility
export const isTrackingIntent = (text) => detectIntent(text) === 'log';
export const parseWithSuggestions = (text) => {
  const result = parseInput(text);
  return {
    success: result.intent !== 'unknown',
    ...result
  };
};

export default { 
  parseInput, 
  parseForLogging, 
  parseForQuery, 
  detectIntent, 
  extractNumbers, 
  extractSkill,
  isSkillRelated,
  isTrackingIntent,
  parseWithSuggestions,
  SKILL_DEFAULTS
};
