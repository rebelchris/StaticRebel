/**
 * LLM Entity Extractor
 * Uses LLM for complex entity extraction, regex for simple cases
 */

import { getOptimizedClient } from '../llm/client.js';
import { DEFAULT_SKILL_TAXONOMY } from './intent-definitions.js';

let client = null;

function getClient() {
  if (!client) {
    client = getOptimizedClient({ useCache: true, cacheTtl: 60000 });
  }
  return client;
}

export class EntityExtractor {
  constructor(options = {}) {
    this.model = options.model;
    this.useLLM = options.useLLM !== false;
    this.cache = new Map();
  }

  async extractTrackingEntities(input) {
    const cacheKey = `track:${input.toLowerCase()}`;
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    const simpleResult = this.simpleExtract(input);
    
    if (!this.useLLM || !this.needsLLM(simpleResult)) {
      this.cache.set(cacheKey, simpleResult);
      return simpleResult;
    }

    const llmResult = await this.llmExtract(input);
    const merged = this.mergeResults(simpleResult, llmResult);
    this.cache.set(cacheKey, merged);
    return merged;
  }

  needsLLM(result) {
    return !result.skill || result.skill === 'activity' || !result.unit || result.unit === 'count';
  }

  simpleExtract(input) {
    const numberMatch = input.match(/(\d+)/);
    const value = numberMatch ? parseInt(numberMatch[1]) : 1;

    const lower = input.toLowerCase();
    let skill = 'activity';

    for (const [skillName, config] of Object.entries(DEFAULT_SKILL_TAXONOMY)) {
      if (config.aliases?.some(alias => lower.includes(alias))) {
        skill = skillName;
        break;
      }
    }

    let unit = 'count';
    for (const [category, units] of Object.entries({
      liquids: ['glass', 'cup', 'bottle', 'ml', 'liter'],
      distance: ['step', 'mile', 'km'],
      time: ['hour', 'min', 'minute'],
      pages: ['page', 'chapter'],
      exercise: ['rep', 'set']
    })) {
      if (units.some(u => lower.includes(u))) {
        unit = units[0];
        break;
      }
    }

    return { skill, value, unit, source: 'regex' };
  }

  async llmExtract(input) {
    const prompt = `Extract from: "${input}"

Return JSON: {"skill":"water|steps|sleep|coffee|reading|meditation|exercise|food|mood","value":2,"unit":"glasses|ml|steps|hours|cups|pages|minutes|reps|servings"}`;

    try {
      const response = await getClient().chatCompletion(this.model || 'ollama/llama3.2', [
        { role: 'system', content: 'Reply with valid JSON only.' },
        { role: 'user', content: prompt }
      ], { temperature: 0.0, maxTokens: 60 });

      const match = response.message.match(/\{[\s\S]*\}/);
      if (match) {
        const parsed = JSON.parse(match[0]);
        return {
          skill: parsed.skill || 'activity',
          value: parsed.value || 1,
          unit: parsed.unit || 'count',
          source: 'llm'
        };
      }
    } catch (error) {
      console.error('Entity extraction error:', error.message);
    }
    return { skill: 'activity', value: 1, unit: 'count', source: 'llm' };
  }

  mergeResults(simple, llm) {
    return {
      skill: simple.skill !== 'activity' ? simple.skill : (llm.skill || 'activity'),
      value: simple.value || llm.value || 1,
      unit: simple.unit !== 'count' ? simple.unit : (llm.unit || 'count'),
      source: llm.source === 'llm' && simple.source === 'regex' ? 'llm-fallback' : simple.source
    };
  }

  async extractProjectSpec(input) {
    const cacheKey = `project:${input.toLowerCase()}`;
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    const simpleResult = this.simpleProjectExtract(input);

    if (!this.useLLM) {
      this.cache.set(cacheKey, simpleResult);
      return simpleResult;
    }

    const llmResult = await this.llmProjectExtract(input);
    const merged = { ...simpleResult, tech: [...new Set([...simpleResult.tech, ...llmResult.tech])] };
    this.cache.set(cacheKey, merged);
    return merged;
  }

  simpleProjectExtract(input) {
    const lower = input.toLowerCase();

    const name = lower
      .replace(/(make|build|create|generate|a|an|the|in|with|for|me|please|i want|to)\b/gi, '')
      .replace(/[^a-z0-9 ]/g, '')
      .trim()
      .split(/\s+/)
      .filter(w => w.length > 1)
      .slice(0, 3)
      .join('-') || 'project';

    const tech = [];
    const techStack = ['react', 'node', 'javascript', 'js', 'html', 'css', 'python', 'express', 'discord.js', 'vue', 'svelte', 'typescript', 'next', 'astro', 'vite'];
    techStack.forEach(t => {
      if (lower.includes(t)) tech.push(t);
    });

    let type = 'web-app';
    if (lower.includes('api') || lower.includes('backend')) type = 'api';
    else if (lower.includes('bot')) type = 'bot';
    else if (lower.includes('cli') || lower.includes('tool')) type = 'cli-tool';

    return { name, type, tech: tech.length ? tech : ['javascript'], source: 'regex' };
  }

  async llmProjectExtract(input) {
    const prompt = `Extract from: "${input}"

Return JSON: {"name":"my-app","type":"web-app|api|bot|cli-tool","tech":["react","node"]}`;

    try {
      const response = await getClient().chatCompletion(this.model || 'ollama/llama3.2', [
        { role: 'system', content: 'Reply with valid JSON only.' },
        { role: 'user', content: prompt }
      ], { temperature: 0.0, maxTokens: 60 });

      const match = response.message.match(/\{[\s\S]*\}/);
      if (match) {
        const parsed = JSON.parse(match[0]);
        return {
          name: parsed.name || 'project',
          type: parsed.type || 'web-app',
          tech: parsed.tech || ['javascript'],
          source: 'llm'
        };
      }
    } catch (error) {
      console.error('Project extraction error:', error.message);
    }
    return { name: 'project', type: 'web-app', tech: ['javascript'], source: 'llm' };
  }

  clearCache() {
    this.cache.clear();
  }
}

let extractorInstance = null;

export function getEntityExtractor(options = {}) {
  if (!extractorInstance || options.fresh) {
    extractorInstance = new EntityExtractor(options);
  }
  return extractorInstance;
}

export default EntityExtractor;
