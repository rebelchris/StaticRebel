/**
 * Natural Language Parser for Skills
 * 
 * Handles natural conversation patterns for habit tracking.
 * Designed to work for the majority of users with minimal friction.
 */

// ============== INTENT DETECTION ==============

const QUERY_PATTERNS = [
  /^how (much|many|is|are|was|have)/i,
  /^what('s| is| are| was| were| did)/i,
  /^show (me |my )?/i,
  /^check (my )?/i,
  /^(did|have) I /i,
  /\?$/,  // ends with question mark
  /^my .+ (today|this week|yesterday)/i,
  /status|progress|total|summary|stats/i,
  /^tell me (about )?my/i,
];

const LOG_PATTERNS = [
  /^(drank|had|ate|did|walked|ran|logged|tracked|slept|took|completed|finished)/i,
  /^I (drank|had|ate|did|walked|ran|just|logged|completed|finished)/i,
  /^just (drank|had|ate|did|walked|ran|finished|completed)/i,
  /^\d+\s*(ml|l|cups?|glasses?|steps?|km|k|min|hours?|reps?|sets?)/i,
  /^(another|one more|more)\s/i,
  /^add(ed)?\s/i,
  /^log(ged)?\s/i,
];

const COMMAND_PATTERNS = [
  { pattern: /^(undo|cancel|remove|delete)\s*(last|previous)?/i, command: 'undo' },
  { pattern: /^(my )?(skills|trackers|habits)$/i, command: 'list' },
  { pattern: /^help$/i, command: 'help' },
  { pattern: /^(hi|hello|hey)$/i, command: 'greet' },
  { pattern: /^(thanks|thank you|thx)/i, command: 'thanks' },
];

export function detectIntent(text) {
  const lower = text.toLowerCase().trim();
  
  // Check commands first
  for (const { pattern, command } of COMMAND_PATTERNS) {
    if (pattern.test(lower)) {
      return { type: 'command', command };
    }
  }
  
  // Check query patterns
  for (const pattern of QUERY_PATTERNS) {
    if (pattern.test(lower)) {
      return { type: 'query' };
    }
  }
  
  // Check log patterns
  for (const pattern of LOG_PATTERNS) {
    if (pattern.test(lower)) {
      return { type: 'log' };
    }
  }
  
  // If has numbers with units, probably logging
  if (/\d+\s*(ml|l|cups?|glasses?|steps?|km|k|min|hours?|reps?|sets?)\b/i.test(lower)) {
    return { type: 'log' };
  }
  
  // If contains a known skill word + number, probably logging
  if (/\d+/.test(lower) && extractSkill(lower)) {
    return { type: 'log' };
  }
  
  return { type: 'unknown' };
}

// ============== NUMBER EXTRACTION ==============

const NUMBER_WORDS = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5,
  six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15,
  sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
  twenty: 20, thirty: 30, forty: 40, fifty: 50,
  sixty: 60, seventy: 70, eighty: 80, ninety: 90,
  hundred: 100, half: 0.5, quarter: 0.25,
  a: 1, an: 1, some: 2, few: 3, couple: 2, several: 4
};

const UNIT_INFO = {
  // Volume
  ml: { multiplier: 1, category: 'volume', canonical: 'ml' },
  l: { multiplier: 1000, category: 'volume', canonical: 'ml' },
  liter: { multiplier: 1000, category: 'volume', canonical: 'ml' },
  liters: { multiplier: 1000, category: 'volume', canonical: 'ml' },
  litre: { multiplier: 1000, category: 'volume', canonical: 'ml' },
  litres: { multiplier: 1000, category: 'volume', canonical: 'ml' },
  oz: { multiplier: 29.5735, category: 'volume', canonical: 'ml' },
  ounce: { multiplier: 29.5735, category: 'volume', canonical: 'ml' },
  ounces: { multiplier: 29.5735, category: 'volume', canonical: 'ml' },
  
  // Containers (convert to volume)
  cup: { multiplier: 250, category: 'container', canonical: 'ml' },
  cups: { multiplier: 250, category: 'container', canonical: 'ml' },
  glass: { multiplier: 250, category: 'container', canonical: 'ml' },
  glasses: { multiplier: 250, category: 'container', canonical: 'ml' },
  bottle: { multiplier: 500, category: 'container', canonical: 'ml' },
  bottles: { multiplier: 500, category: 'container', canonical: 'ml' },
  mug: { multiplier: 350, category: 'container', canonical: 'ml' },
  mugs: { multiplier: 350, category: 'container', canonical: 'ml' },
  
  // Distance
  k: { multiplier: 1, category: 'distance', canonical: 'km' },
  km: { multiplier: 1, category: 'distance', canonical: 'km' },
  kilometer: { multiplier: 1, category: 'distance', canonical: 'km' },
  kilometers: { multiplier: 1, category: 'distance', canonical: 'km' },
  mi: { multiplier: 1.60934, category: 'distance', canonical: 'km' },
  mile: { multiplier: 1.60934, category: 'distance', canonical: 'km' },
  miles: { multiplier: 1.60934, category: 'distance', canonical: 'km' },
  m: { multiplier: 0.001, category: 'distance', canonical: 'km' },
  meter: { multiplier: 0.001, category: 'distance', canonical: 'km' },
  meters: { multiplier: 0.001, category: 'distance', canonical: 'km' },
  
  // Time
  min: { multiplier: 1, category: 'time', canonical: 'minutes' },
  mins: { multiplier: 1, category: 'time', canonical: 'minutes' },
  minute: { multiplier: 1, category: 'time', canonical: 'minutes' },
  minutes: { multiplier: 1, category: 'time', canonical: 'minutes' },
  hr: { multiplier: 60, category: 'time', canonical: 'minutes' },
  hour: { multiplier: 60, category: 'time', canonical: 'minutes' },
  hours: { multiplier: 60, category: 'time', canonical: 'minutes' },
  h: { multiplier: 60, category: 'time', canonical: 'minutes' },
  sec: { multiplier: 1, category: 'seconds', canonical: 'seconds' },
  secs: { multiplier: 1, category: 'seconds', canonical: 'seconds' },
  second: { multiplier: 1, category: 'seconds', canonical: 'seconds' },
  seconds: { multiplier: 1, category: 'seconds', canonical: 'seconds' },
  s: { multiplier: 1, category: 'seconds', canonical: 'seconds' },
  
  // Count
  step: { multiplier: 1, category: 'steps', canonical: 'steps' },
  steps: { multiplier: 1, category: 'steps', canonical: 'steps' },
  rep: { multiplier: 1, category: 'reps', canonical: 'reps' },
  reps: { multiplier: 1, category: 'reps', canonical: 'reps' },
  set: { multiplier: 1, category: 'sets', canonical: 'sets' },
  sets: { multiplier: 1, category: 'sets', canonical: 'sets' },
  cal: { multiplier: 1, category: 'calories', canonical: 'cal' },
  cals: { multiplier: 1, category: 'calories', canonical: 'cal' },
  calorie: { multiplier: 1, category: 'calories', canonical: 'cal' },
  calories: { multiplier: 1, category: 'calories', canonical: 'cal' },
  kcal: { multiplier: 1, category: 'calories', canonical: 'cal' },
  page: { multiplier: 1, category: 'pages', canonical: 'pages' },
  pages: { multiplier: 1, category: 'pages', canonical: 'pages' },
};

export function extractNumbers(text) {
  const results = [];
  const lower = text.toLowerCase();

  // Pattern: "X sets of Y" or "X x Y" (e.g., "3 sets of 10 pushups" = 30)
  const setsPattern = /(\d+)\s*(?:sets?\s*(?:of|x)|x)\s*(\d+)/gi;
  let setsMatch;
  while ((setsMatch = setsPattern.exec(lower)) !== null) {
    const sets = parseInt(setsMatch[1]);
    const reps = parseInt(setsMatch[2]);
    results.push({
      raw: setsMatch[0],
      value: sets * reps,
      sets,
      reps,
      unit: 'reps',
      category: 'computed',
      isComputed: true
    });
  }

  // Pattern: number + optional unit
  // Note: order matters - longer units before shorter (minutes before mi)
  const numPattern = /(\d+(?:\.\d+)?)\s*(minutes?|mins?|hours?|hrs?|seconds?|secs?|kilometers?|km|miles?|mi|steps?|reps?|sets?|calories?|cals?|kcal|pages?|glasses?|bottles?|cups?|mugs?|ounces?|oz|liters?|litres?|ml|l|k|h|s)?(?!\s*(?:sets?\s*of|x\s*\d))/gi;
  
  let match;
  while ((match = numPattern.exec(lower)) !== null) {
    const value = parseFloat(match[1]);
    const unit = match[2]?.toLowerCase() || null;
    const unitInfo = unit ? UNIT_INFO[unit] : null;
    
    // Skip if this was part of a sets calculation
    if (results.some(r => r.isComputed && r.raw.includes(match[0]))) continue;
    
    results.push({
      raw: match[0],
      value,
      unit,
      category: unitInfo?.category || null,
      multiplier: unitInfo?.multiplier || 1,
      normalized: value * (unitInfo?.multiplier || 1),
      canonical: unitInfo?.canonical || unit
    });
  }

  // Word numbers (but not if already got numeric results)
  if (results.length === 0) {
    for (const [word, num] of Object.entries(NUMBER_WORDS)) {
      const wordPattern = new RegExp(`\\b${word}\\b`, 'i');
      if (wordPattern.test(lower)) {
        results.push({ raw: word, value: num, unit: null, normalized: num });
        break; // Only take first word number
      }
    }
  }

  return results;
}

// ============== TIME EXTRACTION ==============

export function extractTimeContext(text) {
  const lower = text.toLowerCase();
  
  if (/yesterday|last night/i.test(lower)) {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return { date: d.toISOString().split('T')[0], label: 'yesterday' };
  }
  
  if (/this morning|earlier today|today/i.test(lower)) {
    return { date: new Date().toISOString().split('T')[0], label: 'today' };
  }
  
  if (/last week/i.test(lower)) {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return { date: d.toISOString().split('T')[0], label: 'last week' };
  }
  
  // Default to today
  return { date: new Date().toISOString().split('T')[0], label: 'today' };
}

// ============== SKILL EXTRACTION ==============

// Fuzzy matching for common typos
const SKILL_ALIASES = {
  // Water variations
  water: ['water', 'watr', 'h2o', 'hydration', 'hydrate'],
  
  // Coffee variations
  coffee: ['coffee', 'coffe', 'cofee', 'espresso', 'cappuccino', 'latte', 'americano', 'caffeine', 'cafe', 'java'],
  
  // Exercise - specific types get their own skills
  pushups: ['pushup', 'pushups', 'push-up', 'push-ups', 'push up', 'push ups', 'pressup', 'press-up', 'press up'],
  squats: ['squat', 'squats', 'squates'],
  situps: ['situp', 'situps', 'sit-up', 'sit-ups', 'sit up', 'sit ups', 'crunches', 'crunch'],
  burpees: ['burpee', 'burpees', 'burpy', 'burpies'],
  plank: ['plank', 'planks', 'planking'],
  pullups: ['pullup', 'pullups', 'pull-up', 'pull-ups', 'pull up', 'pull ups', 'chinup', 'chin-up', 'chin up'],
  lunges: ['lunge', 'lunges', 'lungeing'],
  jumprope: ['jumprope', 'jump rope', 'skipping', 'skip rope'],
  
  // Cardio
  running: ['run', 'ran', 'running', 'jog', 'jogging', 'jogged'],
  walking: ['walk', 'walked', 'walking', 'hike', 'hiked', 'hiking', 'stroll'],
  cycling: ['bike', 'biked', 'biking', 'cycle', 'cycled', 'cycling', 'bicycle'],
  swimming: ['swim', 'swam', 'swimming', 'swum'],
  
  // Steps
  steps: ['step', 'steps'],
  
  // Other
  mood: ['mood', 'feeling', 'feel', 'felt', 'emotion', 'vibe'],
  sleep: ['sleep', 'slept', 'sleeping', 'nap', 'napped', 'rest'],
  meditation: ['meditate', 'meditation', 'meditated', 'mindfulness', 'mindful'],
  reading: ['read', 'reading', 'book', 'books', 'pages'],
  water: ['water', 'drank', 'drink', 'hydrate', 'hydration'],
  
  // Generic exercise (fallback)
  exercise: ['exercise', 'exercised', 'workout', 'gym', 'training', 'trained'],
};

// Default configurations for skills
export const SKILL_DEFAULTS = {
  water: { unit: 'ml', goal: 2000, icon: '💧', name: 'Water' },
  coffee: { unit: 'cups', goal: 4, icon: '☕', name: 'Coffee', goalType: 'max' },
  steps: { unit: 'steps', goal: 10000, icon: '🚶', name: 'Steps' },
  pushups: { unit: 'reps', goal: 50, icon: '💪', name: 'Push-ups' },
  squats: { unit: 'reps', goal: 50, icon: '🦵', name: 'Squats' },
  situps: { unit: 'reps', goal: 50, icon: '🏋️', name: 'Sit-ups' },
  burpees: { unit: 'reps', goal: 20, icon: '🔥', name: 'Burpees' },
  plank: { unit: 'seconds', goal: 120, icon: '🧘', name: 'Plank' },
  pullups: { unit: 'reps', goal: 20, icon: '🏋️', name: 'Pull-ups' },
  lunges: { unit: 'reps', goal: 30, icon: '🦵', name: 'Lunges' },
  jumprope: { unit: 'reps', goal: 200, icon: '🪢', name: 'Jump Rope' },
  running: { unit: 'km', goal: 5, icon: '🏃', name: 'Running' },
  walking: { unit: 'km', goal: 3, icon: '🚶', name: 'Walking' },
  cycling: { unit: 'km', goal: 10, icon: '🚴', name: 'Cycling' },
  swimming: { unit: 'meters', goal: 500, icon: '🏊', name: 'Swimming' },
  mood: { unit: 'score', goal: null, icon: '😊', name: 'Mood' },
  sleep: { unit: 'hours', goal: 8, icon: '😴', name: 'Sleep' },
  meditation: { unit: 'minutes', goal: 15, icon: '🧘', name: 'Meditation' },
  reading: { unit: 'pages', goal: 30, icon: '📚', name: 'Reading' },
  exercise: { unit: 'minutes', goal: 30, icon: '🏋️', name: 'Exercise' },
};

export function extractSkill(text) {
  const lower = text.toLowerCase();
  
  // Priority skills - check these first (more specific)
  const prioritySkills = ['steps', 'pushups', 'squats', 'situps', 'burpees', 'pullups', 'lunges', 'plank'];
  
  for (const skillId of prioritySkills) {
    const aliases = SKILL_ALIASES[skillId];
    if (!aliases) continue;
    
    for (const alias of aliases) {
      const pattern = new RegExp(`\\b${alias}s?\\b`, 'i');
      if (pattern.test(lower)) {
        return {
          id: skillId,
          matchedAlias: alias,
          defaults: SKILL_DEFAULTS[skillId] || { unit: 'count', goal: null, icon: '📊', name: skillId }
        };
      }
    }
  }
  
  // Then check remaining skills
  for (const [skillId, aliases] of Object.entries(SKILL_ALIASES)) {
    if (prioritySkills.includes(skillId)) continue; // Already checked
    
    for (const alias of aliases) {
      // Handle multi-word aliases
      const pattern = alias.includes(' ') 
        ? new RegExp(alias.replace(/ /g, '\\s*'), 'i')
        : new RegExp(`\\b${alias}s?\\b`, 'i');
      
      if (pattern.test(lower)) {
        return {
          id: skillId,
          matchedAlias: alias,
          defaults: SKILL_DEFAULTS[skillId] || { unit: 'count', goal: null, icon: '📊', name: skillId }
        };
      }
    }
  }
  
  return null;
}

// ============== MOOD PARSING ==============

const MOOD_WORDS = {
  // 1-2: Very bad
  terrible: 1, awful: 1, horrible: 1, miserable: 1, dreadful: 1,
  // 3: Bad
  bad: 3, rough: 3, down: 3, sad: 3, low: 3, poor: 3, upset: 3,
  // 4: Below average
  meh: 4, blah: 4, tired: 4, exhausted: 4, stressed: 4,
  // 5: Neutral
  okay: 5, ok: 5, alright: 5, fine: 5, neutral: 5, average: 5, so: 5,
  // 6: Above average
  decent: 6, 'not bad': 6, pretty: 6,
  // 7: Good
  good: 7, nice: 7, well: 7, positive: 7, content: 7,
  // 8: Great
  great: 8, happy: 8, wonderful: 8, lovely: 8, pleasant: 8,
  // 9: Excellent
  amazing: 9, fantastic: 9, excellent: 9, awesome: 9, brilliant: 9,
  // 10: Perfect
  perfect: 10, incredible: 10, outstanding: 10, best: 10, ecstatic: 10
};

export function extractMood(text) {
  const lower = text.toLowerCase();
  
  // Check for explicit score
  const scoreMatch = lower.match(/(\d+)\s*(?:\/\s*10|out of 10)?/);
  if (scoreMatch) {
    const score = parseInt(scoreMatch[1]);
    if (score >= 1 && score <= 10) {
      return { score, source: 'explicit' };
    }
  }
  
  // Check mood words
  for (const [word, score] of Object.entries(MOOD_WORDS)) {
    if (lower.includes(word)) {
      return { score, word, source: 'word' };
    }
  }
  
  return null;
}

// ============== MAIN PARSING ==============

export function parseForLogging(text) {
  const numbers = extractNumbers(text);
  const skill = extractSkill(text);
  const timeContext = extractTimeContext(text);
  
  if (!skill) {
    return null;
  }
  
  const entry = { 
    value: 1,
    date: timeContext.date
  };
  
  // Handle specific skill types
  switch (skill.id) {
    case 'water':
      // Look for volume or containers
      const volNum = numbers.find(n => n.category === 'volume' || n.category === 'container');
      if (volNum) {
        entry.value = Math.round(volNum.normalized);
      } else if (numbers.length > 0) {
        // Bare number: >10 = ml, else glasses
        const n = numbers[0].value;
        entry.value = n > 10 ? n : Math.round(n * 250);
      } else {
        entry.value = 250; // default glass
      }
      break;
      
    case 'coffee':
      entry.value = numbers.length > 0 ? numbers[0].value : 1;
      break;
      
    case 'steps':
      const stepsNum = numbers.find(n => n.category === 'steps');
      
      if (stepsNum) {
        entry.value = stepsNum.value;
      } else if (numbers.length > 0) {
        // Check if there's a "k" unit meaning thousands (not km)
        const kNum = numbers.find(n => n.unit === 'k' && /steps?/i.test(text));
        if (kNum) {
          entry.value = kNum.value * 1000; // 5k steps = 5000
        } else {
          entry.value = numbers[0].value;
        }
      }
      break;
      
    case 'pushups':
    case 'squats':
    case 'situps':
    case 'burpees':
    case 'pullups':
    case 'lunges':
    case 'jumprope':
      // Check for "sets of" pattern first
      const computedNum = numbers.find(n => n.isComputed);
      if (computedNum) {
        entry.value = computedNum.value;
        entry.sets = computedNum.sets;
        entry.reps = computedNum.reps;
      } else if (numbers.length > 0) {
        entry.value = numbers[0].value;
      } else {
        entry.value = 10; // reasonable default
      }
      break;
      
    case 'plank':
      const plankTimeMin = numbers.find(n => n.category === 'time');
      const plankTimeSec = numbers.find(n => n.category === 'seconds');
      
      if (plankTimeSec) {
        entry.value = plankTimeSec.normalized;
      } else if (plankTimeMin) {
        entry.value = plankTimeMin.normalized * 60; // convert minutes to seconds
      } else if (numbers.length > 0) {
        entry.value = numbers[0].value; // assume seconds
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
        entry.value = Math.round(dist.normalized * 100) / 100;
      } else if (time) {
        entry.value = time.normalized;
        entry.unit = 'minutes';
      } else if (numbers.length > 0) {
        const n = numbers[0].value;
        entry.value = n;
        // Guess: <60 probably km, else minutes
        if (n >= 60) entry.unit = 'minutes';
      }
      break;
      
    case 'swimming':
      const swimDist = numbers.find(n => n.category === 'distance');
      if (swimDist) {
        entry.value = Math.round(swimDist.normalized * 1000); // km to meters
      } else if (numbers.length > 0) {
        entry.value = numbers[0].value;
      }
      break;
      
    case 'mood':
      const mood = extractMood(text);
      if (mood) {
        entry.value = mood.score;
        if (mood.word) entry.note = mood.word;
      } else {
        entry.value = 5; // neutral default
      }
      break;
      
    case 'sleep':
      const sleepTime = numbers.find(n => n.category === 'time');
      if (sleepTime) {
        // Convert to hours
        entry.value = sleepTime.unit?.includes('h') ? sleepTime.value : sleepTime.normalized / 60;
      } else if (numbers.length > 0) {
        entry.value = numbers[0].value;
      }
      entry.value = Math.round(entry.value * 10) / 10; // 1 decimal
      break;
      
    case 'meditation':
      const medTime = numbers.find(n => n.category === 'time');
      if (medTime) {
        entry.value = medTime.normalized;
      } else if (numbers.length > 0) {
        entry.value = numbers[0].value;
      }
      break;
      
    case 'reading':
      const pageNum = numbers.find(n => n.category === 'pages');
      if (pageNum) {
        entry.value = pageNum.value;
      } else if (numbers.length > 0) {
        entry.value = numbers[0].value;
      }
      break;
      
    default:
      // Generic: use first number or computed
      const computed = numbers.find(n => n.isComputed);
      if (computed) {
        entry.value = computed.value;
      } else if (numbers.length > 0) {
        entry.value = numbers[0].normalized || numbers[0].value;
      }
  }
  
  return {
    skillId: skill.id,
    skillName: skill.defaults.name || skill.id,
    skillDefaults: skill.defaults,
    entry,
    raw: text,
    timeContext
  };
}

export function parseForQuery(text) {
  const skill = extractSkill(text);
  const lower = text.toLowerCase();
  
  // Detect time period
  let period = 'today';
  if (/yesterday/i.test(lower)) period = 'yesterday';
  else if (/this week|weekly/i.test(lower)) period = 'week';
  else if (/this month|monthly/i.test(lower)) period = 'month';
  else if (/all time|total|ever|overall/i.test(lower)) period = 'all';
  
  return {
    skillId: skill?.id || null,
    skillName: skill?.defaults?.name || skill?.id || null,
    skillDefaults: skill?.defaults || null,
    period,
    raw: text
  };
}

export function parseInput(text) {
  const intentResult = detectIntent(text);
  
  // Handle commands
  if (intentResult.type === 'command') {
    return {
      intent: 'command',
      command: intentResult.command,
      raw: text
    };
  }
  
  // Handle queries
  if (intentResult.type === 'query') {
    return {
      intent: 'query',
      ...parseForQuery(text)
    };
  }
  
  // Handle logging
  if (intentResult.type === 'log') {
    const parsed = parseForLogging(text);
    if (parsed) {
      return {
        intent: 'log',
        ...parsed
      };
    }
  }
  
  // Unknown - try to parse anyway
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

// ============== UTILITIES ==============

export function isSkillRelated(text) {
  const skill = extractSkill(text);
  return skill !== null || detectIntent(text).type !== 'unknown';
}

// Legacy exports
export const isTrackingIntent = (text) => detectIntent(text).type === 'log';
export const parseWithSuggestions = (text) => {
  const result = parseInput(text);
  return { success: result.intent !== 'unknown', ...result };
};

export default { 
  parseInput, 
  parseForLogging, 
  parseForQuery, 
  detectIntent, 
  extractNumbers, 
  extractSkill,
  extractMood,
  extractTimeContext,
  isSkillRelated,
  isTrackingIntent,
  parseWithSuggestions,
  SKILL_DEFAULTS,
  SKILL_ALIASES
};
