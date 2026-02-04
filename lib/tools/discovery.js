/**
 * Dynamic Tool Discovery System
 *
 * Auto-discovers tools/skills from lib/skills/, lib/input/, lib/planning/
 * Uses LLM to match task intent to available tools
 * Returns ranked tool suggestions with confidence scores
 */

import { EventEmitter } from 'events';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getDefaultModel, chatCompletion } from '../modelRegistry.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ============================================================================
// Configuration
// ============================================================================

const CONFIG = {
  DEBUG: process.env.DEBUG_DISCOVERY === 'true',
  CACHE_TTL_MS: 5 * 60 * 1000, // 5 minutes
  MIN_CONFIDENCE: 0.3,
  MAX_SUGGESTIONS: 5,
  DISCOVERY_PATHS: {
    skills: path.resolve(__dirname, '../skills'),
    input: path.resolve(__dirname, '../input'),
    planning: path.resolve(__dirname, '../planning'),
  },
};

// ============================================================================
// Tool Capability Schema
// ============================================================================

/**
 * @typedef {Object} ToolCapability
 * @property {string} name - Tool identifier
 * @property {string} description - Human-readable description
 * @property {string} category - Tool category (skill, input, planning, builtin)
 * @property {Object} inputSchema - Expected input parameters
 * @property {Object} outputSchema - Expected output structure
 * @property {string[]} intentExamples - Example phrases that trigger this tool
 * @property {string[]} keywords - Keywords for matching
 * @property {string} source - Where the tool was discovered from
 * @property {Function} [handler] - Tool execution function (if available)
 */

// ============================================================================
// Tool Discovery Engine
// ============================================================================

class ToolDiscovery extends EventEmitter {
  constructor() {
    super();
    this.capabilities = new Map();
    this.discoveryCache = null;
    this.cacheTimestamp = 0;
    this.initialized = false;
  }

  /**
   * Initialize the discovery system by scanning all tool sources
   * @returns {Promise<void>}
   */
  async initialize() {
    if (this.initialized && !this.isCacheExpired()) {
      return;
    }

    if (CONFIG.DEBUG) {
      console.log('[Discovery] Initializing tool discovery...');
    }

    try {
      // Clear existing capabilities
      this.capabilities.clear();

      // Discover from each source in parallel
      await Promise.all([
        this.discoverSkillsCapabilities(),
        this.discoverInputCapabilities(),
        this.discoverPlanningCapabilities(),
        this.discoverBuiltinCapabilities(),
      ]);

      this.cacheTimestamp = Date.now();
      this.initialized = true;

      this.emit('discovery:complete', {
        count: this.capabilities.size,
        categories: this.getCategoryCounts(),
      });

      if (CONFIG.DEBUG) {
        console.log(`[Discovery] Discovered ${this.capabilities.size} tool capabilities`);
      }
    } catch (error) {
      console.error('[Discovery] Initialization failed:', error.message);
      throw error;
    }
  }

  /**
   * Check if cache has expired
   * @returns {boolean}
   */
  isCacheExpired() {
    return Date.now() - this.cacheTimestamp > CONFIG.CACHE_TTL_MS;
  }

  /**
   * Discover capabilities from lib/skills/
   */
  async discoverSkillsCapabilities() {
    try {
      const { getSkillManager } = await import('../skills/skill-manager.js');
      const skillManager = await getSkillManager();
      const skills = skillManager.getAllSkills();

      for (const skill of skills) {
        this.registerCapability({
          name: `skill:${skill.id}`,
          description: skill.description || `Skill: ${skill.name}`,
          category: 'skill',
          inputSchema: {
            value: 'number|string?',
            note: 'string?',
            context: 'object?',
          },
          outputSchema: {
            success: 'boolean',
            logged: 'object?',
            message: 'string',
          },
          intentExamples: skill.triggers || [],
          keywords: this.extractKeywords(skill),
          source: 'skills',
          metadata: {
            skillId: skill.id,
            unit: skill.unit,
            dailyGoal: skill.dailyGoal,
            icon: skill.icon,
          },
        });
      }

      // Add skill management capabilities
      this.registerCapability({
        name: 'skill:create',
        description: 'Create a new skill for tracking habits, goals, or data',
        category: 'skill',
        inputSchema: {
          name: 'string',
          description: 'string',
          unit: 'string?',
          dailyGoal: 'number?',
        },
        outputSchema: {
          success: 'boolean',
          skillId: 'string',
          message: 'string',
        },
        intentExamples: [
          'create a skill',
          'new skill',
          'add a tracker',
          'track something new',
        ],
        keywords: ['create', 'new', 'skill', 'tracker', 'track'],
        source: 'skills',
      });

      this.registerCapability({
        name: 'skill:list',
        description: 'List all available skills and trackers',
        category: 'skill',
        inputSchema: {},
        outputSchema: {
          skills: 'array',
          count: 'number',
        },
        intentExamples: [
          'list skills',
          'show my skills',
          'what skills do I have',
          'available trackers',
        ],
        keywords: ['list', 'show', 'skills', 'trackers', 'available'],
        source: 'skills',
      });
    } catch (error) {
      if (CONFIG.DEBUG) {
        console.warn('[Discovery] Skills discovery failed:', error.message);
      }
    }
  }

  /**
   * Discover capabilities from lib/input/
   */
  async discoverInputCapabilities() {
    try {
      // Redaction capability
      this.registerCapability({
        name: 'input:redact',
        description: 'Redact sensitive data like emails, IPs, API keys from text',
        category: 'input',
        inputSchema: {
          text: 'string',
          patterns: 'string[]?',
        },
        outputSchema: {
          redacted: 'string',
          matches: 'array',
        },
        intentExamples: [
          'redact sensitive data',
          'hide personal info',
          'mask credentials',
          'remove emails from text',
        ],
        keywords: ['redact', 'hide', 'mask', 'sensitive', 'privacy', 'credentials'],
        source: 'input',
      });

      // Fuzzy matching capability
      this.registerCapability({
        name: 'input:fuzzy',
        description: 'Fuzzy match commands and skills with typo tolerance',
        category: 'input',
        inputSchema: {
          input: 'string',
          candidates: 'string[]',
          threshold: 'number?',
        },
        outputSchema: {
          match: 'string?',
          confidence: 'number',
          alternatives: 'array',
        },
        intentExamples: [
          'did you mean',
          'fuzzy match',
          'find similar command',
        ],
        keywords: ['fuzzy', 'match', 'similar', 'typo', 'correct'],
        source: 'input',
      });

      // Multi-stage parsing capability
      this.registerCapability({
        name: 'input:parse',
        description: 'Multi-stage parsing with LLM and code-based analysis',
        category: 'input',
        inputSchema: {
          text: 'string',
          context: 'object?',
        },
        outputSchema: {
          intent: 'string',
          entities: 'object',
          confidence: 'number',
        },
        intentExamples: [
          'parse this input',
          'understand my request',
          'extract intent',
        ],
        keywords: ['parse', 'understand', 'extract', 'intent', 'analyze'],
        source: 'input',
      });

      // Momentum tracking capability
      this.registerCapability({
        name: 'input:momentum',
        description: 'Track conversation patterns and predict next actions',
        category: 'input',
        inputSchema: {
          history: 'array',
        },
        outputSchema: {
          predictions: 'array',
          patterns: 'object',
        },
        intentExamples: [
          'predict next action',
          'what should I do next',
          'conversation patterns',
        ],
        keywords: ['predict', 'pattern', 'next', 'momentum', 'suggest'],
        source: 'input',
      });
    } catch (error) {
      if (CONFIG.DEBUG) {
        console.warn('[Discovery] Input discovery failed:', error.message);
      }
    }
  }

  /**
   * Discover capabilities from lib/planning/
   */
  async discoverPlanningCapabilities() {
    try {
      // Plan creation capability
      this.registerCapability({
        name: 'planning:create',
        description: 'Create a multi-step plan for complex tasks',
        category: 'planning',
        inputSchema: {
          task: 'string',
          context: 'object?',
        },
        outputSchema: {
          planId: 'string',
          steps: 'array',
          estimatedSteps: 'number',
        },
        intentExamples: [
          'create a plan',
          'plan this task',
          'break down this project',
          'help me plan',
          'step by step',
        ],
        keywords: ['plan', 'steps', 'breakdown', 'project', 'organize', 'task'],
        source: 'planning',
      });

      // Plan execution capability
      this.registerCapability({
        name: 'planning:execute',
        description: 'Execute a plan step by step with checkpoints',
        category: 'planning',
        inputSchema: {
          planId: 'string',
          autoExecute: 'boolean?',
        },
        outputSchema: {
          status: 'string',
          currentStep: 'number',
          completed: 'boolean',
        },
        intentExamples: [
          'execute plan',
          'run the plan',
          'start the task',
          'continue plan',
        ],
        keywords: ['execute', 'run', 'start', 'continue', 'plan'],
        source: 'planning',
      });

      // Plan status capability
      this.registerCapability({
        name: 'planning:status',
        description: 'Check status of active plans',
        category: 'planning',
        inputSchema: {
          planId: 'string?',
        },
        outputSchema: {
          plans: 'array',
          activePlan: 'object?',
        },
        intentExamples: [
          'plan status',
          'how is my plan going',
          'show active plans',
          'what plans are running',
        ],
        keywords: ['status', 'progress', 'plans', 'active', 'running'],
        source: 'planning',
      });
    } catch (error) {
      if (CONFIG.DEBUG) {
        console.warn('[Discovery] Planning discovery failed:', error.message);
      }
    }
  }

  /**
   * Discover built-in tool capabilities from the registry
   */
  async discoverBuiltinCapabilities() {
    try {
      const { getToolRegistry } = await import('./registry.js');
      const registry = getToolRegistry();
      const tools = registry.list();

      for (const tool of tools) {
        // Skip if already registered from another source
        if (this.capabilities.has(`builtin:${tool.name}`)) {
          continue;
        }

        this.registerCapability({
          name: `builtin:${tool.name}`,
          description: tool.description || `Built-in tool: ${tool.name}`,
          category: 'builtin',
          inputSchema: tool.schema || {},
          outputSchema: {
            success: 'boolean',
            result: 'any',
          },
          intentExamples: this.generateIntentExamples(tool.name, tool.description),
          keywords: this.extractKeywordsFromDescription(tool.description || tool.name),
          source: 'registry',
          metadata: {
            hasRateLimit: tool.hasRateLimit,
          },
        });
      }
    } catch (error) {
      if (CONFIG.DEBUG) {
        console.warn('[Discovery] Builtin discovery failed:', error.message);
      }
    }
  }

  /**
   * Register a tool capability
   * @param {ToolCapability} capability
   */
  registerCapability(capability) {
    if (!capability.name) {
      throw new Error('Capability must have a name');
    }

    this.capabilities.set(capability.name, {
      ...capability,
      registeredAt: Date.now(),
    });

    this.emit('capability:registered', { name: capability.name });
  }

  /**
   * Get all registered capabilities
   * @returns {ToolCapability[]}
   */
  getAllCapabilities() {
    return Array.from(this.capabilities.values());
  }

  /**
   * Get capabilities by category
   * @param {string} category
   * @returns {ToolCapability[]}
   */
  getCapabilitiesByCategory(category) {
    return this.getAllCapabilities().filter(cap => cap.category === category);
  }

  /**
   * Get category counts
   * @returns {Object}
   */
  getCategoryCounts() {
    const counts = {};
    for (const cap of this.capabilities.values()) {
      counts[cap.category] = (counts[cap.category] || 0) + 1;
    }
    return counts;
  }

  /**
   * Match task intent to available tools using LLM
   * @param {string} input - User input/task description
   * @param {Object} options - Matching options
   * @returns {Promise<ToolSuggestion[]>}
   */
  async matchIntent(input, options = {}) {
    if (!this.initialized) {
      await this.initialize();
    }

    const {
      maxSuggestions = CONFIG.MAX_SUGGESTIONS,
      minConfidence = CONFIG.MIN_CONFIDENCE,
      context = {},
    } = options;

    // First, try keyword-based matching for speed
    const keywordMatches = this.matchByKeywords(input);

    // Then use LLM for semantic understanding
    const llmMatches = await this.matchWithLLM(input, context);

    // Combine and deduplicate results
    const combined = this.combineResults(keywordMatches, llmMatches);

    // Filter by confidence and limit
    return combined
      .filter(match => match.confidence >= minConfidence)
      .slice(0, maxSuggestions);
  }

  /**
   * Fast keyword-based matching
   * @param {string} input
   * @returns {ToolSuggestion[]}
   */
  matchByKeywords(input) {
    const lowerInput = input.toLowerCase();
    const words = lowerInput.split(/\s+/);
    const matches = [];

    for (const [name, capability] of this.capabilities) {
      let score = 0;
      const matchedKeywords = [];

      // Check keywords
      for (const keyword of capability.keywords || []) {
        if (lowerInput.includes(keyword.toLowerCase())) {
          score += 0.3;
          matchedKeywords.push(keyword);
        }
      }

      // Check intent examples
      for (const example of capability.intentExamples || []) {
        const similarity = this.calculateSimilarity(lowerInput, example.toLowerCase());
        if (similarity > 0.6) {
          score += similarity * 0.5;
        }
      }

      // Boost for exact category mention
      if (lowerInput.includes(capability.category)) {
        score += 0.1;
      }

      if (score > 0) {
        matches.push({
          tool: name,
          capability,
          confidence: Math.min(score, 1.0),
          matchType: 'keyword',
          matchedKeywords,
          reasoning: `Matched keywords: ${matchedKeywords.join(', ')}`,
        });
      }
    }

    return matches.sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * LLM-based semantic matching
   * @param {string} input
   * @param {Object} context
   * @returns {Promise<ToolSuggestion[]>}
   */
  async matchWithLLM(input, context = {}) {
    try {
      const model = getDefaultModel();
      const capabilities = this.getAllCapabilities();

      // Build capability descriptions for LLM
      const capabilityDescriptions = capabilities
        .slice(0, 30) // Limit to avoid token overflow
        .map(cap => ({
          name: cap.name,
          description: cap.description,
          category: cap.category,
          examples: (cap.intentExamples || []).slice(0, 3),
        }));

      const prompt = `You are a tool selector. Given a user's task, select the most appropriate tools.

User Task: "${input}"

Available Tools:
${JSON.stringify(capabilityDescriptions, null, 2)}

Respond with ONLY valid JSON:
{
  "suggestions": [
    {
      "tool": "tool_name",
      "confidence": 0.0-1.0,
      "reasoning": "brief explanation why this tool is suitable"
    }
  ]
}

Rules:
- Return up to 5 suggestions ordered by relevance
- Only include tools with confidence >= 0.3
- Consider the task context and requirements
- "build" tasks typically need planning tools
- Tracking tasks need skill tools
- Questions may need chat or search tools`;

      const response = await chatCompletion(model, [
        {
          role: 'system',
          content: 'You are a precise tool selector. Output only valid JSON.',
        },
        { role: 'user', content: prompt },
      ]);

      const content = response?.message || '';

      // Parse response
      let result;
      try {
        result = JSON.parse(content);
      } catch {
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          result = JSON.parse(jsonMatch[0]);
        } else {
          return [];
        }
      }

      // Map LLM suggestions to capabilities
      return (result.suggestions || []).map(suggestion => {
        const capability = this.capabilities.get(suggestion.tool);
        return {
          tool: suggestion.tool,
          capability,
          confidence: suggestion.confidence,
          matchType: 'llm',
          reasoning: suggestion.reasoning,
        };
      }).filter(s => s.capability);

    } catch (error) {
      if (CONFIG.DEBUG) {
        console.error('[Discovery] LLM matching failed:', error.message);
      }
      return [];
    }
  }

  /**
   * Combine keyword and LLM results
   * @param {ToolSuggestion[]} keywordMatches
   * @param {ToolSuggestion[]} llmMatches
   * @returns {ToolSuggestion[]}
   */
  combineResults(keywordMatches, llmMatches) {
    const combined = new Map();

    // Add keyword matches
    for (const match of keywordMatches) {
      combined.set(match.tool, {
        ...match,
        sources: ['keyword'],
      });
    }

    // Merge LLM matches
    for (const match of llmMatches) {
      if (combined.has(match.tool)) {
        const existing = combined.get(match.tool);
        combined.set(match.tool, {
          ...existing,
          confidence: Math.max(existing.confidence, match.confidence) + 0.1, // Boost for multiple sources
          sources: [...existing.sources, 'llm'],
          reasoning: match.reasoning || existing.reasoning,
        });
      } else {
        combined.set(match.tool, {
          ...match,
          sources: ['llm'],
        });
      }
    }

    return Array.from(combined.values())
      .map(match => ({
        ...match,
        confidence: Math.min(match.confidence, 1.0),
      }))
      .sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Calculate string similarity (simple Jaccard)
   * @param {string} a
   * @param {string} b
   * @returns {number}
   */
  calculateSimilarity(a, b) {
    const setA = new Set(a.split(/\s+/));
    const setB = new Set(b.split(/\s+/));
    const intersection = new Set([...setA].filter(x => setB.has(x)));
    const union = new Set([...setA, ...setB]);
    return intersection.size / union.size;
  }

  /**
   * Extract keywords from skill
   * @param {Object} skill
   * @returns {string[]}
   */
  extractKeywords(skill) {
    const keywords = [];

    if (skill.name) {
      keywords.push(skill.name.toLowerCase());
    }
    if (skill.id) {
      keywords.push(skill.id.toLowerCase());
    }
    if (skill.triggers) {
      keywords.push(...skill.triggers.map(t => t.toLowerCase()));
    }
    if (skill.unit) {
      keywords.push(skill.unit.toLowerCase());
    }

    return [...new Set(keywords)];
  }

  /**
   * Extract keywords from description
   * @param {string} description
   * @returns {string[]}
   */
  extractKeywordsFromDescription(description) {
    if (!description) return [];

    // Remove common words and extract meaningful terms
    const stopWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'is', 'are', 'was', 'were', 'be', 'been', 'being']);

    return description
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 2 && !stopWords.has(word));
  }

  /**
   * Generate intent examples from tool name and description
   * @param {string} name
   * @param {string} description
   * @returns {string[]}
   */
  generateIntentExamples(name, description) {
    const examples = [];
    const cleanName = name.replace(/_/g, ' ');

    examples.push(cleanName);
    examples.push(`use ${cleanName}`);
    examples.push(`run ${cleanName}`);

    if (description) {
      // Extract first sentence as example
      const firstSentence = description.split('.')[0];
      if (firstSentence.length < 50) {
        examples.push(firstSentence.toLowerCase());
      }
    }

    return examples;
  }

  /**
   * Refresh the discovery cache
   * @returns {Promise<void>}
   */
  async refresh() {
    this.initialized = false;
    await this.initialize();
  }

  /**
   * Get discovery statistics
   * @returns {Object}
   */
  getStats() {
    return {
      totalCapabilities: this.capabilities.size,
      categories: this.getCategoryCounts(),
      cacheAge: Date.now() - this.cacheTimestamp,
      cacheExpired: this.isCacheExpired(),
      initialized: this.initialized,
    };
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let discoveryInstance = null;

/**
 * Get the singleton discovery instance
 * @returns {ToolDiscovery}
 */
export function getToolDiscovery() {
  if (!discoveryInstance) {
    discoveryInstance = new ToolDiscovery();
  }
  return discoveryInstance;
}

/**
 * Initialize and get tool discovery
 * @returns {Promise<ToolDiscovery>}
 */
export async function initializeDiscovery() {
  const discovery = getToolDiscovery();
  await discovery.initialize();
  return discovery;
}

/**
 * Discover tools matching an intent
 * @param {string} input - Task or intent description
 * @param {Object} options - Discovery options
 * @returns {Promise<ToolSuggestion[]>}
 */
export async function discover(input, options = {}) {
  const discovery = getToolDiscovery();
  return await discovery.matchIntent(input, options);
}

/**
 * Get all tools/capabilities
 * @returns {Promise<ToolCapability[]>}
 */
export async function getTools() {
  const discovery = getToolDiscovery();
  if (!discovery.initialized) {
    await discovery.initialize();
  }
  return discovery.getAllCapabilities();
}

/**
 * Get capabilities by category
 * @param {string} category
 * @returns {Promise<ToolCapability[]>}
 */
export async function getToolCapabilities(category = null) {
  const discovery = getToolDiscovery();
  if (!discovery.initialized) {
    await discovery.initialize();
  }

  if (category) {
    return discovery.getCapabilitiesByCategory(category);
  }
  return discovery.getAllCapabilities();
}

// ============================================================================
// Exports
// ============================================================================

export { ToolDiscovery, CONFIG as DISCOVERY_CONFIG };
export default getToolDiscovery;
