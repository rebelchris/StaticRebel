/**
 * Agent Registry - Multi-agent collaboration framework
 *
 * Features:
 * - Register specialized agents
 * - Agent discovery and capability matching
 * - Message routing between agents
 * - Agent lifecycle management
 *
 * @module agentRegistry
 */

import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';

// ============================================================================
// Types & Interfaces
// ============================================================================

/**
 * @typedef {Object} Agent
 * @property {string} id - Agent ID
 * @property {string} name - Agent name
 * @property {string} type - Agent type
 * @property {string[]} capabilities - Agent capabilities
 * @property {Function} handler - Message handler
 * @property {string} status - Agent status
 * @property {Date} registeredAt - Registration timestamp
 * @property {Date} lastActiveAt - Last activity timestamp
 */

/**
 * @typedef {Object} AgentMessage
 * @property {string} id - Message ID
 * @property {string} from - Sender agent ID
 * @property {string} to - Recipient agent ID (or 'broadcast')
 * @property {string} type - Message type
 * @property {Object} payload - Message payload
 * @property {Date} timestamp - Message timestamp
 * @property {string} [correlationId] - Correlation ID for request/response
 */

/**
 * @typedef {Object} AgentTask
 * @property {string} id - Task ID
 * @property {string} type - Task type
 * @property {Object} data - Task data
 * @property {string} assignedTo - Assigned agent ID
 * @property {string} status - Task status
 * @property {Date} createdAt - Creation timestamp
 * @property {Date} [startedAt] - Start timestamp
 * @property {Date} [completedAt] - Completion timestamp
 * @property {Object} [result] - Task result
 */

// Message types
export const MESSAGE_TYPES = {
  TASK_ASSIGN: 'TASK_ASSIGN',
  TASK_COMPLETE: 'TASK_COMPLETE',
  TASK_FAILED: 'TASK_FAILED',
  QUERY: 'QUERY',
  RESPONSE: 'RESPONSE',
  BROADCAST: 'BROADCAST',
  ERROR: 'ERROR',
  STATUS: 'STATUS',
  COORDINATE: 'COORDINATE',
};

// Agent types
export const AGENT_TYPES = {
  PARSER: 'parser',
  PLANNER: 'planner',
  EXECUTOR: 'executor',
  VERIFIER: 'verifier',
  SEARCHER: 'searcher',
  COORDINATOR: 'coordinator',
  CUSTOM: 'custom',
};

// ============================================================================
// Agent Registry Class
// ============================================================================

class AgentRegistry extends EventEmitter {
  constructor() {
    super();
    this.agents = new Map();
    this.messageQueue = [];
    this.tasks = new Map();
    this.messageHandlers = new Map();

    // Start message processing
    this.processingInterval = setInterval(() => this.processMessages(), 100);
  }

  /**
   * Register an agent
   * @param {Object} agentConfig - Agent configuration
   * @returns {Agent}
   */
  registerAgent(agentConfig) {
    const agent = {
      id: agentConfig.id || uuidv4(),
      name: agentConfig.name,
      type: agentConfig.type || AGENT_TYPES.CUSTOM,
      capabilities: agentConfig.capabilities || [],
      handler: agentConfig.handler,
      status: 'idle',
      registeredAt: new Date(),
      lastActiveAt: new Date(),
    };

    this.agents.set(agent.id, agent);
    this.emit('agent:registered', agent);

    return agent;
  }

  /**
   * Unregister an agent
   * @param {string} agentId - Agent ID
   * @returns {boolean}
   */
  unregisterAgent(agentId) {
    const agent = this.agents.get(agentId);
    if (!agent) return false;

    this.agents.delete(agentId);
    this.emit('agent:unregistered', agent);
    return true;
  }

  /**
   * Get an agent by ID
   * @param {string} agentId - Agent ID
   * @returns {Agent|null}
   */
  getAgent(agentId) {
    return this.agents.get(agentId) || null;
  }

  /**
   * Find agents by capability
   * @param {string} capability - Capability to search for
   * @returns {Agent[]}
   */
  findAgentsByCapability(capability) {
    return Array.from(this.agents.values()).filter(agent =>
      agent.capabilities.includes(capability)
    );
  }

  /**
   * Find agents by type
   * @param {string} type - Agent type
   * @returns {Agent[]}
   */
  findAgentsByType(type) {
    return Array.from(this.agents.values()).filter(agent =>
      agent.type === type
    );
  }

  /**
   * Get all registered agents
   * @returns {Agent[]}
   */
  getAllAgents() {
    return Array.from(this.agents.values());
  }

  /**
   * Update agent status
   * @param {string} agentId - Agent ID
   * @param {string} status - New status
   */
  updateAgentStatus(agentId, status) {
    const agent = this.agents.get(agentId);
    if (agent) {
      agent.status = status;
      agent.lastActiveAt = new Date();
      this.emit('agent:status', { agentId, status });
    }
  }

  // ============================================================================
  // Message Handling
  // ============================================================================

  /**
   * Send a message to an agent
   * @param {string} from - Sender agent ID
   * @param {string} to - Recipient agent ID
   * @param {string} type - Message type
   * @param {Object} payload - Message payload
   * @param {Object} options - Additional options
   * @returns {AgentMessage}
   */
  sendMessage(from, to, type, payload, options = {}) {
    const message = {
      id: uuidv4(),
      from,
      to,
      type,
      payload,
      timestamp: new Date(),
      correlationId: options.correlationId,
    };

    this.messageQueue.push(message);
    this.emit('message:sent', message);

    return message;
  }

  /**
   * Broadcast a message to all agents
   * @param {string} from - Sender agent ID
   * @param {string} type - Message type
   * @param {Object} payload - Message payload
   * @param {Function} filter - Filter function for recipients
   * @returns {AgentMessage}
   */
  broadcast(from, type, payload, filter = null) {
    const message = {
      id: uuidv4(),
      from,
      to: 'broadcast',
      type,
      payload,
      timestamp: new Date(),
    };

    for (const [agentId, agent] of this.agents) {
      if (agentId !== from && (!filter || filter(agent))) {
        const directMessage = { ...message, to: agentId };
        this.messageQueue.push(directMessage);
      }
    }

    this.emit('message:broadcast', message);
    return message;
  }

  /**
   * Process queued messages
   */
  async processMessages() {
    if (this.messageQueue.length === 0) return;

    const message = this.messageQueue.shift();
    const recipient = this.agents.get(message.to);

    if (!recipient) {
      this.emit('message:failed', { message, error: 'Recipient not found' });
      return;
    }

    try {
      this.updateAgentStatus(recipient.id, 'busy');
      const result = await recipient.handler(message);
      this.updateAgentStatus(recipient.id, 'idle');

      this.emit('message:processed', { message, result });

      // Send response if query
      if (message.type === MESSAGE_TYPES.QUERY && result) {
        this.sendMessage(
          recipient.id,
          message.from,
          MESSAGE_TYPES.RESPONSE,
          result,
          { correlationId: message.id }
        );
      }
    } catch (error) {
      this.updateAgentStatus(recipient.id, 'error');
      this.emit('message:failed', { message, error: error.message });

      // Send error response
      this.sendMessage(
        recipient.id,
        message.from,
        MESSAGE_TYPES.ERROR,
        { error: error.message, originalMessage: message.id },
        { correlationId: message.id }
      );
    }
  }

  /**
   * Register a message handler for a specific message type
   * @param {string} type - Message type
   * @param {Function} handler - Handler function
   */
  registerMessageHandler(type, handler) {
    if (!this.messageHandlers.has(type)) {
      this.messageHandlers.set(type, []);
    }
    this.messageHandlers.get(type).push(handler);
  }

  // ============================================================================
  // Task Management
  // ============================================================================

  /**
   * Create and assign a task
   * @param {string} type - Task type
   * @param {Object} data - Task data
   * @param {string} assignTo - Agent ID to assign to
   * @returns {AgentTask}
   */
  createTask(type, data, assignTo) {
    const task = {
      id: uuidv4(),
      type,
      data,
      assignedTo: assignTo,
      status: 'pending',
      createdAt: new Date(),
    };

    this.tasks.set(task.id, task);

    // Send task assignment message
    this.sendMessage('system', assignTo, MESSAGE_TYPES.TASK_ASSIGN, {
      taskId: task.id,
      type,
      data,
    });

    this.emit('task:created', task);
    return task;
  }

  /**
   * Get task by ID
   * @param {string} taskId - Task ID
   * @returns {AgentTask|null}
   */
  getTask(taskId) {
    return this.tasks.get(taskId) || null;
  }

  /**
   * Update task status
   * @param {string} taskId - Task ID
   * @param {string} status - New status
   * @param {Object} result - Task result (if completed)
   */
  updateTask(taskId, status, result = null) {
    const task = this.tasks.get(taskId);
    if (!task) return;

    task.status = status;

    if (status === 'running' && !task.startedAt) {
      task.startedAt = new Date();
    }

    if (status === 'completed' || status === 'failed') {
      task.completedAt = new Date();
      task.result = result;
    }

    this.emit('task:updated', task);
  }

  /**
   * Complete a task
   * @param {string} taskId - Task ID
   * @param {Object} result - Task result
   */
  completeTask(taskId, result) {
    this.updateTask(taskId, 'completed', result);

    const task = this.tasks.get(taskId);
    if (task) {
      this.sendMessage(task.assignedTo, 'system', MESSAGE_TYPES.TASK_COMPLETE, {
        taskId,
        result,
      });
    }
  }

  /**
   * Fail a task
   * @param {string} taskId - Task ID
   * @param {string} error - Error message
   */
  failTask(taskId, error) {
    this.updateTask(taskId, 'failed', { error });

    const task = this.tasks.get(taskId);
    if (task) {
      this.sendMessage(task.assignedTo, 'system', MESSAGE_TYPES.TASK_FAILED, {
        taskId,
        error,
      });
    }
  }

  /**
   * Get tasks by status
   * @param {string} status - Task status
   * @returns {AgentTask[]}
   */
  getTasksByStatus(status) {
    return Array.from(this.tasks.values()).filter(task => task.status === status);
  }

  /**
   * Get tasks assigned to an agent
   * @param {string} agentId - Agent ID
   * @returns {AgentTask[]}
   */
  getAgentTasks(agentId) {
    return Array.from(this.tasks.values()).filter(task => task.assignedTo === agentId);
  }

  // ============================================================================
  // Coordination
  // ============================================================================

  /**
   * Coordinate multiple agents for a complex task
   * @param {Object} task - Complex task definition
   * @returns {Promise<Object>}
   */
  async coordinate(task) {
    const coordinatorId = uuidv4();
    const subtasks = [];

    // Create subtasks for each required capability
    for (const step of task.steps) {
      const capableAgents = this.findAgentsByCapability(step.capability);

      if (capableAgents.length === 0) {
        throw new Error(`No agent found with capability: ${step.capability}`);
      }

      // Assign to first available agent
      const agent = capableAgents.find(a => a.status === 'idle') || capableAgents[0];
      const subtask = this.createTask(step.type, step.data, agent.id);
      subtasks.push(subtask);
    }

    // Wait for all subtasks to complete
    const results = await Promise.all(
      subtasks.map(subtask =>
        new Promise((resolve, reject) => {
          const checkInterval = setInterval(() => {
            const updated = this.getTask(subtask.id);

            if (updated.status === 'completed') {
              clearInterval(checkInterval);
              resolve(updated.result);
            } else if (updated.status === 'failed') {
              clearInterval(checkInterval);
              reject(new Error(updated.result?.error || 'Task failed'));
            }
          }, 100);
        })
      )
    );

    return {
      coordinatorId,
      results,
      subtasks: subtasks.map(t => t.id),
    };
  }

  /**
   * Shutdown the registry
   */
  shutdown() {
    clearInterval(this.processingInterval);
    this.agents.clear();
    this.tasks.clear();
    this.messageQueue = [];
    this.emit('registry:shutdown');
  }
}

// ============================================================================
// Singleton Export
// ============================================================================

const registry = new AgentRegistry();

export default registry;

// Named exports
export {
  AgentRegistry,
  MESSAGE_TYPES,
  AGENT_TYPES,
};
