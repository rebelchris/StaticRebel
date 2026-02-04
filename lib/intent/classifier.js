/**
 * LLM-based Intent Classifier
 * Classifies user input into: coding, shell, memory, general
 * Returns: { intent, entities, confidence, reasoning }
 */

import { getDefaultModel, chatCompletion } from '../modelRegistry.js';

export const INTENT_TYPES = {
  CODING: 'coding',
  SHELL: 'shell',
  MEMORY: 'memory',
  GENERAL: 'general'
};

// Fallback pattern matching when LLM fails
const FALLBACK_PATTERNS = {
  [INTENT_TYPES.CODING]: [
    /\b(write|create|build|implement|code|debug|fix|refactor|review|develop|program)\b.*\b(code|function|class|script|module|component|api|bug|error)\b/i,
    /\b(code|function|class|script|module|component)\b/i,
    /\b(javascript|typescript|python|java|rust|go|ruby|php|c\+\+|css|html)\b/i,
    /\b(npm|yarn|pip|cargo|gem|composer)\b/i,
    /\b(debug|refactor|review|lint|test)\b/i,
  ],
  [INTENT_TYPES.SHELL]: [
    /\b(run|execute|shell|terminal|bash|command|cmd)\b/i,
    /\b(ls|cd|mkdir|rm|cp|mv|cat|grep|find|chmod|chown)\b/i,
    /\b(git|docker|kubectl|npm|yarn|pip|curl|wget)\b/i,
    /\b(install|uninstall|start|stop|restart|deploy)\b/i,
    /^(sudo|sh|bash)\s/i,
  ],
  [INTENT_TYPES.MEMORY]: [
    /\b(remember|recall|memory|memories|memorize|forget)\b/i,
    /\bwhat (did|do) (we|you|i) (talk|discuss|cover|say)\b/i,
    /\b(save|store|keep|note) (this|that|it)\b/i,
    /\b(long.?term|short.?term) memory\b/i,
    /\b(memory stats|show memories|my memories)\b/i,
    /\b(curate|summarize) (my )?memories\b/i,
  ],
};

/**
 * Classify intent using LLM
 * @param {string} input - User input text
 * @param {Object} options - Classification options
 * @returns {Promise<{intent: string, entities: Object, confidence: number, reasoning: string}>}
 */
export async function classifyIntent(input, options = {}) {
  const { model = getDefaultModel(), context = {} } = options;

  try {
    const result = await llmClassify(input, model, context);
    return result;
  } catch (error) {
    console.error('[IntentClassifier] LLM classification failed:', error.message);
    return fallbackClassify(input);
  }
}

/**
 * LLM-based classification
 */
async function llmClassify(input, model, context) {
  const systemPrompt = `You are an intent classifier. Classify user input into exactly one category.

Categories:
- coding: Writing, debugging, reviewing code, programming tasks, file operations on code
- shell: Running terminal commands, bash operations, git, docker, system administration
- memory: Storing/recalling information, remembering conversations, note-taking
- general: Everything else - questions, chat, greetings, tasks not fitting above

Output ONLY valid JSON:
{"intent":"<category>","entities":{"key":"value"},"confidence":0.95,"reasoning":"<brief explanation>"}

Entity extraction:
- coding: {language, operation, target}
- shell: {command, args, target}
- memory: {operation, query, timeframe}
- general: {topic, question_type}`;

  const userPrompt = `Classify: "${input}"${context.recentMessages ? `\n\nRecent context: ${context.recentMessages.slice(-3).join(' | ')}` : ''}`;

  const response = await chatCompletion(model, [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt }
  ]);

  const content = response?.message || '';
  if (!content) {
    throw new Error('Empty LLM response');
  }

  return parseResponse(content, input);
}

/**
 * Parse LLM response with robust error handling
 */
function parseResponse(content, originalInput) {
  try {
    // Extract JSON from response
    let sanitized = content
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
      .replace(/```json\s*/g, '')
      .replace(/```\s*/g, '');

    const jsonMatch = sanitized.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      sanitized = jsonMatch[0];
    }

    // Fix common JSON issues
    sanitized = sanitized
      .replace(/,(\s*[}\]])/g, '$1')
      .replace(/'/g, '"');

    const parsed = JSON.parse(sanitized);

    // Validate intent
    const validIntents = Object.values(INTENT_TYPES);
    const intent = (parsed.intent || '').toLowerCase();

    if (!validIntents.includes(intent)) {
      return fallbackClassify(originalInput);
    }

    return {
      intent: intent,
      entities: parsed.entities || {},
      confidence: Math.min(1, Math.max(0, parsed.confidence || 0.5)),
      reasoning: parsed.reasoning || 'LLM classification'
    };
  } catch (e) {
    // Try regex extraction as last resort
    const intentMatch = content.match(/"intent"\s*:\s*"([^"]+)"/i);
    const confMatch = content.match(/"confidence"\s*:\s*([\d.]+)/);

    if (intentMatch) {
      const intent = intentMatch[1].toLowerCase();
      if (Object.values(INTENT_TYPES).includes(intent)) {
        return {
          intent,
          entities: {},
          confidence: confMatch ? parseFloat(confMatch[1]) : 0.6,
          reasoning: 'Recovered from parse error'
        };
      }
    }

    return fallbackClassify(originalInput);
  }
}

/**
 * Pattern-based fallback classification
 */
export function fallbackClassify(input) {
  const lower = input.toLowerCase();

  for (const [intent, patterns] of Object.entries(FALLBACK_PATTERNS)) {
    for (const pattern of patterns) {
      if (pattern.test(lower)) {
        return {
          intent,
          entities: extractEntities(input, intent),
          confidence: 0.7,
          reasoning: `Pattern match: ${pattern.source.substring(0, 30)}...`
        };
      }
    }
  }

  return {
    intent: INTENT_TYPES.GENERAL,
    entities: extractEntities(input, INTENT_TYPES.GENERAL),
    confidence: 0.5,
    reasoning: 'No pattern matched, defaulting to general'
  };
}

/**
 * Extract entities based on intent type
 */
function extractEntities(input, intent) {
  const lower = input.toLowerCase();
  const entities = {};

  switch (intent) {
    case INTENT_TYPES.CODING: {
      // Language detection
      const languages = ['javascript', 'typescript', 'python', 'java', 'rust', 'go', 'ruby', 'php', 'c++', 'css', 'html'];
      const foundLang = languages.find(l => lower.includes(l));
      if (foundLang) entities.language = foundLang;

      // Operation detection
      const ops = ['write', 'create', 'debug', 'fix', 'refactor', 'review', 'test'];
      const foundOp = ops.find(o => lower.includes(o));
      if (foundOp) entities.operation = foundOp;

      // Target extraction
      const targetMatch = input.match(/(?:function|class|module|component|file)\s+["`']?(\w+)["`']?/i);
      if (targetMatch) entities.target = targetMatch[1];
      break;
    }

    case INTENT_TYPES.SHELL: {
      // Command extraction
      const cmdMatch = input.match(/\b(git|docker|npm|yarn|pip|kubectl|curl|wget|ls|cd|mkdir|rm|mv|cp)\b/i);
      if (cmdMatch) entities.command = cmdMatch[1].toLowerCase();

      // Args extraction
      const argsMatch = input.match(/(?:run|execute)\s+(.+)/i);
      if (argsMatch) entities.args = argsMatch[1];
      break;
    }

    case INTENT_TYPES.MEMORY: {
      // Operation detection
      if (/remember|save|store|note/i.test(lower)) entities.operation = 'store';
      else if (/recall|what did|show|get/i.test(lower)) entities.operation = 'recall';
      else if (/curate|summarize/i.test(lower)) entities.operation = 'curate';

      // Timeframe
      if (/today/i.test(lower)) entities.timeframe = 'today';
      else if (/yesterday/i.test(lower)) entities.timeframe = 'yesterday';
      else if (/this week/i.test(lower)) entities.timeframe = 'week';
      break;
    }

    case INTENT_TYPES.GENERAL: {
      // Question type
      if (input.includes('?') || /^(how|what|where|when|why|who|which)/i.test(lower)) {
        entities.question_type = 'question';
      } else if (/^(hi|hello|hey|good morning|good evening)/i.test(lower)) {
        entities.question_type = 'greeting';
      }

      // Topic extraction (first noun phrase approximation)
      const topicMatch = input.match(/(?:about|regarding|for)\s+(.+?)(?:\?|$)/i);
      if (topicMatch) entities.topic = topicMatch[1].trim();
      break;
    }
  }

  return entities;
}

/**
 * Quick intent check without full LLM call (for fast path)
 */
export function quickClassify(input) {
  return fallbackClassify(input);
}

/**
 * Check if input matches a specific intent (pattern-based)
 */
export function matchesIntent(input, intent) {
  const patterns = FALLBACK_PATTERNS[intent];
  if (!patterns) return false;
  const lower = input.toLowerCase();
  return patterns.some(p => p.test(lower));
}

export default {
  classifyIntent,
  fallbackClassify,
  quickClassify,
  matchesIntent,
  INTENT_TYPES
};
