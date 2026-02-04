/**
 * Intent Classification Module
 * Exports LLM-based intent classification with pattern fallback
 */

export {
  classifyIntent,
  fallbackClassify,
  quickClassify,
  matchesIntent,
  INTENT_TYPES
} from './classifier.js';
