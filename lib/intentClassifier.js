import { chatCompletion, getDefaultModel } from './modelRegistry.js';

// Classification cache with 5-minute TTL
const classificationCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Confidence thresholds
const CONFIDENCE_THRESHOLDS = {
  HIGH: 0.8, // Execute immediately
  MEDIUM: 0.6, // Execute with confirmation
  LOW: 0.6, // Below this: fallback to chat
};

/**
 * Classifies user intent using LLM
 * @param {string} input - User input text
 * @param {Array} availableActions - Array of action objects
 * @returns {Promise<Object>} Classification result
 */
export async function classifyIntent(input, availableActions) {
  // Check cache first
  const cacheKey = `${input}:${availableActions.length}`;
  const cached = classificationCache.get(cacheKey);

  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    console.log('[IntentClassifier] Using cached classification');
    return cached.result;
  }

  try {
    // Build action list for LLM
    const actionsList = availableActions
      .filter((a) => a.enabled)
      .map((a) => {
        const examples = a.intentExamples?.slice(0, 3).join(', ') || '';
        return `- ${a.name}: ${a.description}${examples ? ` (e.g., "${examples}")` : ''}`;
      })
      .join('\n');

    // Build classification prompt
    const prompt = `Analyze this user input and determine which action(s) to execute:

User input: "${input}"

Available actions:
${actionsList}

Rules:
1. Match user intent to the most relevant action(s)
2. Assign confidence score 0.0-1.0 based on match quality
3. Extract any parameters from the input
4. Set multiIntent=true if multiple actions are needed
5. Set fallbackToChat=true if no action matches well

Respond with ONLY valid JSON (no markdown, no explanation):
{
  "intents": [{"actionName": "action-name", "confidence": 0.95, "parameters": {}}],
  "fallbackToChat": false,
  "multiIntent": false
}`;

    const model = getDefaultModel();

    // Call LLM with low temperature for consistency
    const response = await chatCompletion(
      model,
      [
        {
          role: 'system',
          content:
            'You are an intent classifier. Output only valid JSON. No markdown formatting.',
        },
        { role: 'user', content: prompt },
      ],
      { temperature: 0.3 },
    );

    // Parse JSON response
    const result = parseClassificationResponse(response);

    // Cache the result
    classificationCache.set(cacheKey, {
      result,
      timestamp: Date.now(),
    });

    // Clean up old cache entries
    cleanupCache();

    return result;
  } catch (error) {
    console.error('[IntentClassifier] Classification failed:', error.message);

    // Fallback to chat on error
    return {
      intents: [],
      fallbackToChat: true,
      multiIntent: false,
      error: error.message,
    };
  }
}

/**
 * Parse LLM response and extract JSON
 * @param {string} response - LLM response text
 * @returns {Object} Parsed classification result
 */
function parseClassificationResponse(response) {
  try {
    // Handle non-string responses (e.g., if response is already an object)
    if (typeof response !== 'string') {
      if (response && typeof response === 'object') {
        // If it's already an object with message property (from modelRegistry)
        if (response.message && typeof response.message === 'string') {
          response = response.message;
        } else {
          // Validate structure directly
          if (!response.intents || !Array.isArray(response.intents)) {
            throw new Error(
              'Invalid response structure: missing intents array',
            );
          }
          return {
            intents: response.intents,
            fallbackToChat: response.fallbackToChat || false,
            multiIntent: response.multiIntent || false,
          };
        }
      } else {
        throw new Error('Response is not a string or object');
      }
    }

    // Remove markdown code blocks if present
    let cleaned = response.trim();
    cleaned = cleaned.replace(/^```json?\s*/i, '').replace(/\s*```$/, '');

    // Try direct JSON parse
    const parsed = JSON.parse(cleaned);

    // Validate structure
    if (!parsed.intents || !Array.isArray(parsed.intents)) {
      throw new Error('Invalid response structure: missing intents array');
    }

    // Ensure all required fields exist with defaults
    return {
      intents: parsed.intents.map((intent) => ({
        actionName: intent.actionName || '',
        confidence: Math.max(0, Math.min(1, intent.confidence || 0)),
        parameters: intent.parameters || {},
      })),
      fallbackToChat: parsed.fallbackToChat ?? false,
      multiIntent: parsed.multiIntent ?? false,
    };
  } catch (error) {
    console.error('[IntentClassifier] JSON parse failed:', error.message);

    // Attempt regex extraction as fallback
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          intents: parsed.intents || [],
          fallbackToChat: parsed.fallbackToChat ?? true,
          multiIntent: parsed.multiIntent ?? false,
        };
      } catch (e) {
        // Fallback failed
      }
    }

    // Complete fallback
    return {
      intents: [],
      fallbackToChat: true,
      multiIntent: false,
    };
  }
}

/**
 * Clean up expired cache entries
 */
function cleanupCache() {
  const now = Date.now();
  for (const [key, value] of classificationCache.entries()) {
    if (now - value.timestamp > CACHE_TTL) {
      classificationCache.delete(key);
    }
  }
}

/**
 * Log classification for future analysis
 * @param {string} input - User input
 * @param {Object} result - Classification result
 * @param {Object} userFeedback - Optional user feedback
 */
export function logClassification(input, result, userFeedback = null) {
  // TODO: Implement logging to file for future analysis/fine-tuning
  const logEntry = {
    timestamp: new Date().toISOString(),
    input,
    result,
    userFeedback,
  };

  // For now, just console log in debug mode
  if (process.env.DEBUG === 'true') {
    console.log('[IntentClassifier] Log:', JSON.stringify(logEntry, null, 2));
  }
}

/**
 * Get classification statistics
 */
export function getClassifierStats() {
  return {
    cacheSize: classificationCache.size,
    cacheTTL: CACHE_TTL,
    thresholds: CONFIDENCE_THRESHOLDS,
  };
}
