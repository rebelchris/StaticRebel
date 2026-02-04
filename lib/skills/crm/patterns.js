/**
 * CRM Pattern Detection
 * Regex patterns for detecting contact mentions and interactions in natural language
 */

// Common name patterns - matches capitalized words that look like names
const NAME_PATTERN = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/;

// Interaction verbs - past and present tense
const INTERACTION_VERBS = {
  met: { type: 'meeting', past: true },
  meet: { type: 'meeting', past: false },
  meeting: { type: 'meeting', past: false },
  'met with': { type: 'meeting', past: true },
  'had coffee': { type: 'coffee', past: true },
  'grabbed coffee': { type: 'coffee', past: true },
  'having coffee': { type: 'coffee', past: false },
  'had lunch': { type: 'lunch', past: true },
  'had dinner': { type: 'dinner', past: true },
  'grabbed lunch': { type: 'lunch', past: true },
  chatted: { type: 'chat', past: true },
  'chatted with': { type: 'chat', past: true },
  'had a chat': { type: 'chat', past: true },
  'had a call': { type: 'call', past: true },
  called: { type: 'call', past: true },
  'spoke with': { type: 'call', past: true },
  'spoke to': { type: 'call', past: true },
  'talked to': { type: 'call', past: true },
  'talked with': { type: 'call', past: true },
  emailed: { type: 'email', past: true },
  messaged: { type: 'message', past: true },
  texted: { type: 'text', past: true },
  'caught up': { type: 'catchup', past: true },
  'catching up': { type: 'catchup', past: false },
  'hung out': { type: 'hangout', past: true },
  'hanging out': { type: 'hangout', past: false },
  interviewed: { type: 'interview', past: true },
  'had a 1:1': { type: 'one_on_one', past: true },
  'had a 1-1': { type: 'one_on_one', past: true },
  'had a one-on-one': { type: 'one_on_one', past: true },
  'had a meeting': { type: 'meeting', past: true },
  'ran into': { type: 'encounter', past: true },
  'bumped into': { type: 'encounter', past: true },
  'saw': { type: 'encounter', past: true },
  'video called': { type: 'video_call', past: true },
  'zoomed with': { type: 'video_call', past: true },
};

// Time indicators for parsing when the interaction happened
const TIME_PATTERNS = {
  today: 0,
  yesterday: -1,
  'this morning': 0,
  'this afternoon': 0,
  'this evening': 0,
  'last night': -1,
  'earlier today': 0,
  'earlier': 0,
  'just now': 0,
  'a moment ago': 0,
  'last week': -7,
  'this week': 0,
  'on monday': null, // Will need special handling
  'on tuesday': null,
  'on wednesday': null,
  'on thursday': null,
  'on friday': null,
  'on saturday': null,
  'on sunday': null,
};

// Words that indicate we should NOT auto-capture (planning, hypothetical)
const NEGATIVE_INDICATORS = [
  /\bshould (i )?(meet|call|email|text|chat)/i,
  /\bwill (meet|call|email|text|chat)/i,
  /\bwant to (meet|call|email|text|chat)/i,
  /\bplanning to (meet|call|email|text|chat)/i,
  /\bgoing to (meet|call|email|text|chat)/i,
  /\bneed to (meet|call|email|text|chat)/i,
  /\bhave to (meet|call|email|text|chat)/i,
  /\bwhen (should|can|will) (i |we )?(meet|call|email|text|chat)/i,
  /\bcan you (remind|help|schedule)/i,
  /\bremind me to/i,
  /\bschedule (a |an )?(meeting|call|chat)/i,
];

// Common non-person words that might be capitalized
const EXCLUDED_NAMES = new Set([
  'I', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday',
  'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August',
  'September', 'October', 'November', 'December',
  'Today', 'Yesterday', 'Tomorrow', 'Morning', 'Afternoon', 'Evening', 'Night',
  'Google', 'Slack', 'Zoom', 'Teams', 'Discord', 'Email', 'LinkedIn',
  'CEO', 'CTO', 'CFO', 'VP', 'PM', 'EM', 'TL', 'IC',
  'This', 'That', 'The', 'We', 'They', 'He', 'She', 'It',
  'About', 'Before', 'After', 'During', 'While', 'For', 'To', 'At', 'On',
]);

// Words that should stop name matching (lowercase checked)
const NAME_STOP_WORDS = new Set([
  'today', 'yesterday', 'tomorrow', 'this', 'that', 'the',
  'about', 'regarding', 'for', 'to', 'at', 'on', 'in', 'from',
  'morning', 'afternoon', 'evening', 'night',
  'earlier', 'later', 'week', 'month', 'ago',
]);

/**
 * Clean extracted name by removing stop words
 * @param {string} name - Raw extracted name
 * @returns {string} - Cleaned name
 */
function cleanExtractedName(name) {
  if (!name) return '';

  // Split into words and filter out stop words
  const words = name.trim().split(/\s+/);
  const cleanedWords = [];

  for (const word of words) {
    const lower = word.toLowerCase();
    if (NAME_STOP_WORDS.has(lower) || EXCLUDED_NAMES.has(word)) {
      break; // Stop at first non-name word
    }
    cleanedWords.push(word);
  }

  return cleanedWords.join(' ');
}

/**
 * Build interaction detection patterns
 * These match phrases like "I met with Sarah yesterday" or "had coffee with John"
 */
function buildInteractionPatterns() {
  const patterns = [];

  for (const [phrase, meta] of Object.entries(INTERACTION_VERBS)) {
    // Pattern: "I [verb] [with] Name [anything after]"
    // We capture generously and clean up the name later
    const verbEscaped = phrase.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');

    // Pattern with "with"
    patterns.push({
      regex: new RegExp(
        `(?:i\\s+)?${verbEscaped}(?:\\s+with)?\\s+([A-Z][a-z]+(?:\\s+[A-Z][a-z]+)?(?:\\s+[a-z]+)*)`,
        'i'
      ),
      type: meta.type,
      past: meta.past,
    });

    // Pattern without "with" for some verbs
    if (!phrase.includes('with')) {
      patterns.push({
        regex: new RegExp(
          `(?:i\\s+)?${verbEscaped}\\s+([A-Z][a-z]+(?:\\s+[A-Z][a-z]+)?(?:\\s+[a-z]+)*)`,
          'i'
        ),
        type: meta.type,
        past: meta.past,
      });
    }
  }

  return patterns;
}

const INTERACTION_PATTERNS = buildInteractionPatterns();

/**
 * Detect if input contains a contact interaction mention
 * @param {string} input - User input text
 * @returns {object|null} - Detected interaction info or null
 */
export function detectContactInteraction(input) {
  // Check for negative indicators first
  for (const pattern of NEGATIVE_INDICATORS) {
    if (pattern.test(input)) {
      return null;
    }
  }

  // Try each interaction pattern
  for (const { regex, type, past } of INTERACTION_PATTERNS) {
    const match = input.match(regex);
    if (match && match[1]) {
      // Clean the extracted name to remove stop words
      const rawName = match[1].trim();
      const name = cleanExtractedName(rawName);

      // Skip if no valid name remains or if it's an excluded word
      if (!name || EXCLUDED_NAMES.has(name) || EXCLUDED_NAMES.has(name.split(' ')[0])) {
        continue;
      }

      // Extract time reference
      const timeRef = extractTimeReference(input);

      return {
        name,
        type,
        past,
        timeRef,
        originalInput: input,
        confidence: calculateConfidence(input, name, type),
      };
    }
  }

  return null;
}

/**
 * Extract time reference from input
 * @param {string} input - User input
 * @returns {object} - Time reference info
 */
export function extractTimeReference(input) {
  const lower = input.toLowerCase();

  for (const [phrase, daysAgo] of Object.entries(TIME_PATTERNS)) {
    if (lower.includes(phrase)) {
      const date = new Date();
      if (daysAgo !== null) {
        date.setDate(date.getDate() + daysAgo);
      } else {
        // Handle day names
        const dayMatch = phrase.match(/on (monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i);
        if (dayMatch) {
          const targetDay = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
            .indexOf(dayMatch[1].toLowerCase());
          const currentDay = date.getDay();
          let diff = targetDay - currentDay;
          if (diff > 0) diff -= 7; // Assume past week
          date.setDate(date.getDate() + diff);
        }
      }

      return {
        phrase,
        date: date.toISOString().split('T')[0],
        timestamp: date.toISOString(),
      };
    }
  }

  // Default to today
  return {
    phrase: 'today',
    date: new Date().toISOString().split('T')[0],
    timestamp: new Date().toISOString(),
  };
}

/**
 * Calculate confidence score for the detection
 * @param {string} input - Original input
 * @param {string} name - Detected name
 * @param {string} type - Interaction type
 * @returns {number} - Confidence score 0-1
 */
export function calculateConfidence(input, name, type) {
  let confidence = 0.6; // Base confidence

  // Higher confidence if "I" is present
  if (/\bi\s+/i.test(input)) {
    confidence += 0.1;
  }

  // Higher confidence for explicit time references
  const lower = input.toLowerCase();
  for (const phrase of Object.keys(TIME_PATTERNS)) {
    if (lower.includes(phrase)) {
      confidence += 0.15;
      break;
    }
  }

  // Higher confidence for longer names (first + last)
  if (name.includes(' ')) {
    confidence += 0.1;
  }

  // Higher confidence for common interaction types
  if (['meeting', 'call', 'chat', 'coffee', 'lunch'].includes(type)) {
    confidence += 0.05;
  }

  return Math.min(confidence, 1.0);
}

/**
 * Extract notes/context from the input beyond the interaction itself
 * @param {string} input - User input
 * @param {string} name - Contact name
 * @returns {string} - Additional notes/context
 */
export function extractNotes(input, name) {
  // Look for "about" clauses
  const aboutMatch = input.match(/about\s+(.+?)(?:\.|$)/i);
  if (aboutMatch) {
    return aboutMatch[1].trim();
  }

  // Look for "regarding" clauses
  const regardingMatch = input.match(/regarding\s+(.+?)(?:\.|$)/i);
  if (regardingMatch) {
    return regardingMatch[1].trim();
  }

  // Look for "to discuss" clauses
  const discussMatch = input.match(/to discuss\s+(.+?)(?:\.|$)/i);
  if (discussMatch) {
    return discussMatch[1].trim();
  }

  // Return the full input as context if no specific notes found
  return input;
}

/**
 * Check if input is asking about CRM/contacts (not an interaction mention)
 * @param {string} input - User input
 * @returns {boolean}
 */
export function isExplicitCRMQuery(input) {
  const queryPatterns = [
    /^(show|list|get|display) (my )?(contacts|interactions|reminders)/i,
    /^(search|find) (contacts?|person|people)/i,
    /who (have i|did i) (met|talked|spoken|chatted)/i,
    /^crm/i,
    /^contacts?$/i,
    /recent interactions/i,
    /^show me .+ interactions/i,
    /^when did i (last )?(meet|talk|speak|chat)/i,
  ];

  return queryPatterns.some(p => p.test(input));
}

/**
 * Detect follow-up intent (user wants to schedule follow-up)
 * @param {string} input - User input
 * @returns {object|null}
 */
export function detectFollowUpIntent(input) {
  const followUpPatterns = [
    /follow ?up with ([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i,
    /remind me to (contact|reach out to|follow up with) ([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i,
    /need to (follow up|catch up|reconnect) with ([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i,
  ];

  for (const pattern of followUpPatterns) {
    const match = input.match(pattern);
    if (match) {
      const name = match[1] || match[2];
      if (!EXCLUDED_NAMES.has(name)) {
        return { name, intent: 'follow_up' };
      }
    }
  }

  return null;
}

export default {
  detectContactInteraction,
  extractTimeReference,
  extractNotes,
  isExplicitCRMQuery,
  detectFollowUpIntent,
  calculateConfidence,
  EXCLUDED_NAMES,
  INTERACTION_VERBS,
  TIME_PATTERNS,
};
