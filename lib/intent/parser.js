/**
 * Agentic Intent Parser v2
 * Configurable, extensible intent parsing with LLM fallback
 */

import { chatCompletion } from '../modelRegistry.js';
import { INTENT_DEFINITIONS, matchPattern, DEFAULT_SKILL_TAXONOMY } from './intent-definitions.js';
import { EntityExtractor, getEntityExtractor } from './entity-extractor.js';

export const ACTION_TYPES = {
  TRACK: 'TRACK',
  CREATE_PROJECT: 'CREATE_PROJECT',
  WEB_SEARCH: 'WEB_SEARCH',
  COMMAND: 'COMMAND',
  CHAT: 'CHAT',
  UNKNOWN: 'UNKNOWN'
};

export class AgenticIntentResult {
  constructor() {
    this.action = ACTION_TYPES.UNKNOWN;
    this.confidence = 0;
    this.entities = {};
    this.projectSpec = null;
    this.webSearchQuery = null;
    this.rawInput = '';
    this.debug = {};
  }
}

export class AgenticIntentParser {
  constructor(options = {}) {
    this.model = options.model;
    this.useLLM = options.useLLM !== false;
    this.useCache = options.useCache !== false;
    this.entityExtractor = getEntityExtractor({ model: this.model, useLLM: this.useLLM });
    this.cache = new Map();
    this.definitions = INTENT_DEFINITIONS;
  }

  async parse(input, options = {}) {
    const cacheKey = input.toLowerCase().trim();
    if (this.useCache && this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    const result = new AgenticIntentResult();
    result.rawInput = input;

    const intent = await this.classify(input);
    result.action = intent.action;
    result.confidence = intent.confidence;
    result.debug = intent;

    if (result.action === ACTION_TYPES.TRACK) {
      result.entities = await this.entityExtractor.extractTrackingEntities(input);
    } else if (result.action === ACTION_TYPES.CREATE_PROJECT) {
      result.projectSpec = await this.entityExtractor.extractProjectSpec(input);
    } else if (result.action === ACTION_TYPES.WEB_SEARCH) {
      result.webSearchQuery = this.extractQuery(input);
    }

    if (this.useCache) {
      this.cache.set(cacheKey, result);
    }

    return result;
  }

  async classify(input) {
    const lower = input.toLowerCase().trim();
    if (!lower) return { action: ACTION_TYPES.UNKNOWN, confidence: 0.9, source: 'empty' };

    const results = [];

    for (const [name, def] of Object.entries(this.definitions)) {
      const match = this.matchIntent(lower, def);
      if (match) {
        results.push({ action: this.mapAction(name), confidence: match.confidence, source: 'pattern' });
      }
    }

    if (results.length > 0) {
      results.sort((a, b) => b.confidence - a.confidence);
      return results[0];
    }

    if (this.useLLM) {
      return await this.llmClassify(input);
    }

    return { action: ACTION_TYPES.CHAT, confidence: 0.3, source: 'fallback' };
  }

  matchIntent(text, definition) {
    if (!definition.patterns) return null;

    let score = 0;
    const patterns = definition.patterns;

    if (patterns.keywords) {
      const hasKeyword = patterns.keywords.some(kw => {
        if (kw.startsWith('^')) {
          return new RegExp(kw, 'i').test(text);
        }
        return text.includes(kw.toLowerCase());
      });
      if (hasKeyword) score += 0.3;
    }

    if (patterns.verbs && patterns.verbs.some(v => new RegExp(`\\b${v}\\b`, 'i').test(text))) {
      score += 0.2;
    }

    if (patterns.greetings && patterns.greetings.some(g => new RegExp(g, 'i').test(text))) {
      score += 0.3;
    }

    if (patterns.responses && patterns.responses.some(r => new RegExp(`^${r}\\b`, 'i').test(text))) {
      score += 0.3;
    }

    if (patterns.conversational && patterns.conversational.some(c => text.includes(c))) {
      score += 0.4;
    }

    if (patterns.targets && patterns.targets.some(t => text.includes(t.toLowerCase()))) {
      score += 0.2;
    }

    if (patterns.techStack && patterns.techStack.some(t => text.includes(t.toLowerCase()))) {
      score += 0.1;
    }

    if (definition.requiresNumber && /\d+/.test(text)) {
      score += 0.2;
    }

    return score > 0 ? { confidence: Math.min(0.4 + score * 0.3, 0.95) } : null;
  }

  mapAction(name) {
    const map = {
      'TRACK': ACTION_TYPES.TRACK,
      'CREATE_PROJECT': ACTION_TYPES.CREATE_PROJECT,
      'WEB_SEARCH': ACTION_TYPES.WEB_SEARCH,
      'COMMAND': ACTION_TYPES.COMMAND,
      'CHAT': ACTION_TYPES.CHAT
    };
    return map[name] || ACTION_TYPES.UNKNOWN;
  }

  async llmClassify(input) {
    const prompt = `Classify: "${input}"

Options: TRACK, WEB_SEARCH, CREATE_PROJECT, COMMAND, CHAT

Reply: {"intent":"X","confidence":0.9}`;

    try {
      const response = await chatCompletion(this.model || 'ollama/llama3.2', [
        { role: 'system', content: 'Reply with valid JSON only.' },
        { role: 'user', content: prompt }
      ], { temperature: 0.0, maxTokens: 50 });

      const match = response.message.match(/"intent"\s*:\s*"([^"]+)"/i);
      const confMatch = response.message.match(/"confidence"\s*:\s*([\d.]+)/);

      const map = {
        'track': ACTION_TYPES.TRACK,
        'web_search': ACTION_TYPES.WEB_SEARCH,
        'create_project': ACTION_TYPES.CREATE_PROJECT,
        'command': ACTION_TYPES.COMMAND,
        'chat': ACTION_TYPES.CHAT
      };

      const action = map[match?.[1]?.toLowerCase()] || ACTION_TYPES.CHAT;
      return { action, confidence: confMatch ? parseFloat(confMatch[1]) : 0.6, source: 'llm' };
    } catch (error) {
      return { action: ACTION_TYPES.CHAT, confidence: 0.3, source: 'llm-error' };
    }
  }

  extractQuery(input) {
    return input.replace(/^(what's|what is|search|find|show|get|what|who|where|when|why|how)\b/gi, '').trim();
  }

  addIntentDefinition(name, definition) {
    this.definitions[name] = definition;
  }

  updateSkillTaxonomy(taxonomy) {
    this.definitions.TRACK.patterns.skills = Object.keys(taxonomy);
  }

  clearCache() {
    this.cache.clear();
    this.entityExtractor.clearCache();
  }

  getStats() {
    return {
      cacheSize: this.cache.size,
      definitions: Object.keys(this.definitions),
      llmEnabled: this.useLLM
    };
  }
}

export function createParser(options = {}) {
  return new AgenticIntentParser(options);
}

export async function getAgenticIntentParser(options = {}) {
  return new AgenticIntentParser(options);
}

export default AgenticIntentParser;
