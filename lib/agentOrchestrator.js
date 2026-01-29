/**
 * Agent Orchestrator - Modular agent system with clear responsibilities
 * Implements: Orchestrator → Decision Maker, Conversational Engine → Language, Action Handler → Tasks
 */

import { EventEmitter } from 'events';
import { getActivePersona, buildSystemPrompt } from './personaManager.js';
import { getSessionMemory } from './sessionMemory.js';
import { logFeedback, getFeedbackAnalytics } from './feedbackManager.js';
import { handleChat } from './chatHandler.js';
import { chatCompletion, getDefaultModel } from './modelRegistry.js';

// ============================================================================
// Agent Types
// ============================================================================

const AGENT_TYPES = {
  ORCHESTRATOR: 'orchestrator',
  CONVERSATIONAL: 'conversational',
  ACTION: 'action',
  MEMORY: 'memory',
  ANALYTICS: 'analytics',
};

// ============================================================================
// Base Agent Class
// ============================================================================

class BaseAgent extends EventEmitter {
  constructor(name, type) {
    super();
    this.name = name;
    this.type = type;
    this.state = 'idle';
    this.metrics = {
      requestsHandled: 0,
      averageResponseTime: 0,
      errors: 0,
    };
  }

  async process(input, context = {}) {
    throw new Error('Process method must be implemented');
  }

  updateMetrics(duration, error = false) {
    this.metrics.requestsHandled++;
    if (error) {
      this.metrics.errors++;
    }
    // Update rolling average
    const current = this.metrics.averageResponseTime;
    this.metrics.averageResponseTime =
      (current * (this.metrics.requestsHandled - 1) + duration) /
      this.metrics.requestsHandled;
  }

  getMetrics() {
    return { ...this.metrics, name: this.name, type: this.type };
  }
}

// ============================================================================
// Orchestrator Agent - Decision Maker
// ============================================================================

class OrchestratorAgent extends BaseAgent {
  constructor() {
    super('Orchestrator', AGENT_TYPES.ORCHESTRATOR);
    this.agents = new Map();
    this.routingTable = new Map();
  }

  registerAgent(agent) {
    this.agents.set(agent.name, agent);
    this.emit('agent:registered', { name: agent.name, type: agent.type });
  }

  async process(input, context = {}) {
    const startTime = Date.now();
    this.state = 'processing';

    try {
      // Determine which agent should handle this
      const routingDecision = await this.routeRequest(input, context);

      // Get the appropriate agent
      const agent = this.agents.get(routingDecision.agent);
      if (!agent) {
        throw new Error(`Agent ${routingDecision.agent} not found`);
      }

      // Process with selected agent
      const result = await agent.process(input, {
        ...context,
        routingReason: routingDecision.reason,
      });

      const duration = Date.now() - startTime;
      this.updateMetrics(duration);
      this.state = 'idle';

      return {
        success: true,
        agent: routingDecision.agent,
        result,
        metadata: {
          duration,
          routingReason: routingDecision.reason,
        },
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      this.updateMetrics(duration, true);
      this.state = 'error';

      return {
        success: false,
        error: error.message,
        metadata: { duration },
      };
    }
  }

  async routeRequest(input, context) {
    const lower = input.toLowerCase();

    // Quick pattern-based routing
    if (/^(chat|talk|hello|hi|hey)/i.test(lower)) {
      return { agent: 'conversational', reason: 'Direct chat request' };
    }

    if (/^(run|execute|command|shell|terminal)/i.test(lower)) {
      return { agent: 'action', reason: 'Action/command request' };
    }

    if (/^(remember|memory|recall|what did)/i.test(lower)) {
      return { agent: 'memory', reason: 'Memory-related request' };
    }

    if (/^(stats|analytics|feedback|how many)/i.test(lower)) {
      return { agent: 'analytics', reason: 'Analytics request' };
    }

    // Default to conversational for general queries
    return { agent: 'conversational', reason: 'Default routing' };
  }

  getAllMetrics() {
    const metrics = {
      orchestrator: this.getMetrics(),
      agents: {},
    };

    for (const [name, agent] of this.agents) {
      metrics.agents[name] = agent.getMetrics();
    }

    return metrics;
  }
}

// ============================================================================
// Conversational Agent - Language Responses
// ============================================================================

class ConversationalAgent extends BaseAgent {
  constructor() {
    super('Conversational', AGENT_TYPES.CONVERSATIONAL);
    this.sessionMemory = getSessionMemory();
  }

  async process(input, context = {}) {
    const startTime = Date.now();
    this.state = 'processing';

    try {
      // Build enhanced context with session memory
      const sessionContext = this.sessionMemory.getContextForPrompt(5);
      const persona = getActivePersona();

      // Use existing chat handler but with enhanced context
      const result = await handleChat(input, {
        source: 'conversational-agent',
        context: {
          ...context,
          sessionContext,
          persona,
        },
      });

      // Store in session memory
      this.sessionMemory.addInteraction(input, result.content, {
        intent: result.type,
        action: result.action,
      });

      const duration = Date.now() - startTime;
      this.updateMetrics(duration);
      this.state = 'idle';

      return {
        success: true,
        response: result.content,
        type: result.type,
        metadata: {
          duration,
          usedContext: !!sessionContext,
        },
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      this.updateMetrics(duration, true);
      this.state = 'error';

      return {
        success: false,
        error: error.message,
      };
    }
  }
}

// ============================================================================
// Action Agent - Task Handler
// ============================================================================

class ActionAgent extends BaseAgent {
  constructor() {
    super('Action', AGENT_TYPES.ACTION);
    this.actionHistory = [];
  }

  async process(input, context = {}) {
    const startTime = Date.now();
    this.state = 'processing';

    try {
      // Parse action from input
      const action = this.parseAction(input);

      // Execute action
      const result = await this.executeAction(action, context);

      // Log to history
      this.actionHistory.push({
        input,
        action,
        result,
        timestamp: new Date().toISOString(),
      });

      const duration = Date.now() - startTime;
      this.updateMetrics(duration);
      this.state = 'idle';

      return {
        success: true,
        action,
        result,
        metadata: { duration },
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      this.updateMetrics(duration, true);
      this.state = 'error';

      return {
        success: false,
        error: error.message,
      };
    }
  }

  parseAction(input) {
    const lower = input.toLowerCase();

    if (/^run\s+(.+)/i.test(lower)) {
      const match = input.match(/^run\s+(.+)/i);
      return { type: 'shell', command: match[1] };
    }

    if (/^create\s+file\s+(.+)/i.test(lower)) {
      const match = input.match(/^create\s+file\s+(.+)/i);
      return { type: 'file_create', path: match[1] };
    }

    return { type: 'unknown', raw: input };
  }

  async executeAction(action, context) {
    // Placeholder - actual implementation would execute the action
    return {
      executed: true,
      action,
      message: `Action ${action.type} would be executed here`,
    };
  }
}

// ============================================================================
// Memory Agent - Memory Operations
// ============================================================================

class MemoryAgent extends BaseAgent {
  constructor() {
    super('Memory', AGENT_TYPES.MEMORY);
  }

  async process(input, context = {}) {
    const startTime = Date.now();
    this.state = 'processing';

    try {
      // Determine memory operation
      const operation = this.parseMemoryOperation(input);

      let result;
      switch (operation.type) {
        case 'recall':
          result = await this.recallMemory(operation.query);
          break;
        case 'store':
          result = await this.storeMemory(operation.content);
          break;
        case 'search':
          result = await this.searchMemory(operation.query);
          break;
        default:
          result = { message: 'Unknown memory operation' };
      }

      const duration = Date.now() - startTime;
      this.updateMetrics(duration);
      this.state = 'idle';

      return {
        success: true,
        operation,
        result,
        metadata: { duration },
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      this.updateMetrics(duration, true);
      this.state = 'error';

      return {
        success: false,
        error: error.message,
      };
    }
  }

  parseMemoryOperation(input) {
    const lower = input.toLowerCase();

    if (/what did we (talk about|discuss)/i.test(lower)) {
      return { type: 'recall', query: 'recent' };
    }

    if (/remember (that|this)/i.test(lower)) {
      return { type: 'store', content: input };
    }

    if (/search (my )?memory/i.test(lower)) {
      return { type: 'search', query: input };
    }

    return { type: 'unknown' };
  }

  async recallMemory(query) {
    // Placeholder - would integrate with memoryManager
    return { recalled: true, query };
  }

  async storeMemory(content) {
    // Placeholder - would integrate with memoryManager
    return { stored: true, content: content.substring(0, 100) };
  }

  async searchMemory(query) {
    // Placeholder - would integrate with vectorMemory
    return { searched: true, query, results: [] };
  }
}

// ============================================================================
// Analytics Agent - Metrics and Feedback
// ============================================================================

class AnalyticsAgent extends BaseAgent {
  constructor() {
    super('Analytics', AGENT_TYPES.ANALYTICS);
  }

  async process(input, context = {}) {
    const startTime = Date.now();
    this.state = 'processing';

    try {
      const query = this.parseAnalyticsQuery(input);
      let result;

      switch (query.type) {
        case 'feedback_stats':
          result = getFeedbackAnalytics();
          break;
        case 'session_stats':
          result = this.getSessionStats();
          break;
        case 'improvements':
          result = this.getImprovementSuggestions();
          break;
        default:
          result = { message: 'Unknown analytics query' };
      }

      const duration = Date.now() - startTime;
      this.updateMetrics(duration);
      this.state = 'idle';

      return {
        success: true,
        query,
        result,
        metadata: { duration },
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      this.updateMetrics(duration, true);
      this.state = 'error';

      return {
        success: false,
        error: error.message,
      };
    }
  }

  parseAnalyticsQuery(input) {
    const lower = input.toLowerCase();

    if (/feedback|ratings|thumbs/i.test(lower)) {
      return { type: 'feedback_stats' };
    }

    if (/session|interaction|stats/i.test(lower)) {
      return { type: 'session_stats' };
    }

    if (/improve|suggestion|better/i.test(lower)) {
      return { type: 'improvements' };
    }

    return { type: 'unknown' };
  }

  getSessionStats() {
    const sessionMemory = getSessionMemory();
    return sessionMemory.getStats();
  }

  getImprovementSuggestions() {
    // Placeholder - would integrate with feedbackManager
    return { suggestions: [] };
  }
}

// ============================================================================
// Agent Orchestrator Factory
// ============================================================================

let orchestratorInstance = null;

export function createAgentOrchestrator() {
  if (orchestratorInstance) {
    return orchestratorInstance;
  }

  const orchestrator = new OrchestratorAgent();

  // Register all agents
  orchestrator.registerAgent(new ConversationalAgent());
  orchestrator.registerAgent(new ActionAgent());
  orchestrator.registerAgent(new MemoryAgent());
  orchestrator.registerAgent(new AnalyticsAgent());

  orchestratorInstance = orchestrator;
  return orchestrator;
}

export function getAgentOrchestrator() {
  if (!orchestratorInstance) {
    return createAgentOrchestrator();
  }
  return orchestratorInstance;
}

export function resetAgentOrchestrator() {
  orchestratorInstance = null;
  return createAgentOrchestrator();
}

// ============================================================================
// Exports
// ============================================================================

export {
  OrchestratorAgent,
  ConversationalAgent,
  ActionAgent,
  MemoryAgent,
  AnalyticsAgent,
  AGENT_TYPES,
  BaseAgent,
};
