/**
 * Agent Loop - Core autonomous agent architecture for StaticRebel
 *
 * Implements the OODA loop (Observe-Orient-Decide-Act) + Reflection + Memory
 *
 * Phases:
 * 1. OBSERVE - Gather input, environment state, and relevant memories
 * 2. THINK - Reason, plan, and decide on actions
 * 3. ACT - Execute tools/actions
 * 4. REFLECT - Evaluate results and learn
 * 5. STORE - Update memories with learnings
 */

import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';

// ============================================================================
// Types & Interfaces
// ============================================================================

/**
 * @typedef {Object} AgentState
 * @property {string} id - Unique session ID
 * @property {string} phase - Current phase of the loop
 * @property {Goal|null} currentGoal - Active goal being pursued
 * @property {Observation} observation - Current observation
 * @property {Thought} thought - Current reasoning
 * @property {Action[]} actions - Planned/executed actions
 * @property {Reflection|null} reflection - Post-action reflection
 * @property {number} iteration - Loop iteration count
 * @property {Date} startedAt - Session start time
 * @property {Date} lastActiveAt - Last activity timestamp
 */

/**
 * @typedef {Object} Goal
 * @property {string} id - Unique goal ID
 * @property {string} description - Human-readable goal description
 * @property {string} type - 'short' | 'long' | 'ephemeral'
 * @property {number} priority - 1-10 priority level
 * @property {string[]} successCriteria - Criteria for goal completion
 * @property {Date} createdAt - Creation timestamp
 * @property {Date|null} completedAt - Completion timestamp
 * @property {string} status - 'pending' | 'active' | 'completed' | 'failed' | 'blocked'
 * @property {Object} metadata - Additional goal metadata
 */

/**
 * @typedef {Object} Observation
 * @property {string} userInput - Raw user input
 * @property {Object} environment - Environment state (files, system, etc.)
 * @property {Object[]} relevantMemories - Retrieved relevant memories
 * @property {Object} context - Additional context (previous actions, etc.)
 * @property {Date} timestamp - When observation was made
 */

/**
 * @typedef {Object} Thought
 * @property {string} reasoning - Step-by-step reasoning
 * @property {string} plan - High-level plan
 * @property {string[]} steps - Concrete steps to execute
 * @property {number} confidence - 0-1 confidence in the plan
 * @property {string[]} assumptions - Assumptions being made
 * @property {string[]} risks - Identified risks
 * @property {Date} timestamp - When thought was formed
 */

/**
 * @typedef {Object} Action
 * @property {string} id - Unique action ID
 * @property {string} type - Action type (tool name)
 * @property {string} description - Human-readable description
 * @property {Object} params - Action parameters
 * @property {string} status - 'pending' | 'executing' | 'completed' | 'failed'
 * @property {Object|null} result - Action result
 * @property {Date} createdAt - Creation timestamp
 * @property {Date|null} executedAt - Execution timestamp
 * @property {number} autonomyLevel - Required autonomy level (0-3)
 */

/**
 * @typedef {Object} Reflection
 * @property {boolean} goalProgressed - Did this move toward the goal?
 * @property {string} outcome - 'success' | 'partial' | 'failure'
 * @property {string} analysis - Analysis of what happened
 * @property {string[]} lessons - Lessons learned
 * @property {string[]} improvements - Suggested improvements
 * @property {number} confidenceDelta - Change in confidence
 * @property {Date} timestamp - When reflection occurred
 */

// ============================================================================
// Agent Loop Class
// ============================================================================

export class AgentLoop extends EventEmitter {
  constructor(options = {}) {
    super();

    this.config = {
      maxIterations: options.maxIterations || 10,
      autonomyLevel: options.autonomyLevel || 1, // Default: Assisted
      enableReflection: options.enableReflection !== false,
      enableMemory: options.enableMemory !== false,
      dryRun: options.dryRun || false,
      ...options,
    };

    this.state = this.createInitialState();
    this.tools = new Map();
    this.memory = options.memory || null;
    this.planner = options.planner || null;
    this.safetyGuard = options.safetyGuard || null;

    this.isRunning = false;
    this.shouldStop = false;
  }

  /**
   * Create initial agent state
   */
  createInitialState() {
    return {
      id: uuidv4(),
      phase: 'idle',
      currentGoal: null,
      observation: null,
      thought: null,
      actions: [],
      reflection: null,
      iteration: 0,
      startedAt: new Date(),
      lastActiveAt: new Date(),
      history: [],
    };
  }

  /**
   * Register a tool for the agent to use
   */
  registerTool(tool) {
    if (!tool.name || !tool.handler) {
      throw new Error('Tool must have name and handler');
    }

    this.tools.set(tool.name, {
      name: tool.name,
      description: tool.description || '',
      inputSchema: tool.inputSchema || {},
      safetyConstraints: tool.safetyConstraints || [],
      requiresConfirmation: tool.requiresConfirmation || false,
      dryRunSupported: tool.dryRunSupported !== false,
      handler: tool.handler,
      autonomyLevel: tool.autonomyLevel || 0,
    });

    this.emit('tool:registered', { name: tool.name });
  }

  /**
   * Start the agent loop with a user input
   */
  async start(userInput, options = {}) {
    if (this.isRunning) {
      throw new Error('Agent loop is already running');
    }

    this.isRunning = true;
    this.shouldStop = false;

    // Create or update goal
    if (options.goal) {
      this.state.currentGoal = this.createGoal(options.goal);
    } else {
      this.state.currentGoal = this.createGoal({
        description: userInput,
        type: 'ephemeral',
        priority: 5,
      });
    }

    this.emit('loop:started', {
      sessionId: this.state.id,
      goal: this.state.currentGoal,
    });

    try {
      while (
        this.state.iteration < this.config.maxIterations &&
        !this.shouldStop
      ) {
        const result = await this.iterate(userInput);

        if (result.complete) {
          break;
        }

        // Update input for next iteration based on results
        userInput = result.nextInput || userInput;
      }

      return this.createResult();
    } catch (error) {
      this.emit('loop:error', { error, state: this.state });
      throw error;
    } finally {
      this.isRunning = false;
      this.emit('loop:ended', { state: this.state });
    }
  }

  /**
   * Execute one iteration of the agent loop
   */
  async iterate(userInput) {
    this.state.iteration++;
    this.state.lastActiveAt = new Date();

    this.emit('iteration:started', {
      iteration: this.state.iteration,
      phase: 'observe',
    });

    // === PHASE 1: OBSERVE ===
    this.state.phase = 'observe';
    this.state.observation = await this.observe(userInput);
    this.emit('phase:observe', { observation: this.state.observation });

    // === PHASE 2: THINK ===
    this.state.phase = 'think';
    this.state.thought = await this.think(this.state.observation);
    this.emit('phase:think', { thought: this.state.thought });

    // Check if we should stop (low confidence, goal achieved, etc.)
    if (this.shouldStopThinking(this.state.thought)) {
      return { complete: true, reason: 'thinking_complete' };
    }

    // === PHASE 3: ACT ===
    this.state.phase = 'act';
    const actionResults = await this.act(this.state.thought);
    this.emit('phase:act', { actions: this.state.actions });

    // === PHASE 4: REFLECT ===
    if (this.config.enableReflection) {
      this.state.phase = 'reflect';
      this.state.reflection = await this.reflect(actionResults);
      this.emit('phase:reflect', { reflection: this.state.reflection });
    }

    // === PHASE 5: STORE ===
    if (this.config.enableMemory) {
      this.state.phase = 'store';
      await this.store();
      this.emit('phase:store', {});
    }

    // Archive this iteration
    this.state.history.push({
      iteration: this.state.iteration,
      observation: this.state.observation,
      thought: this.state.thought,
      actions: [...this.state.actions],
      reflection: this.state.reflection,
    });

    this.emit('iteration:completed', {
      iteration: this.state.iteration,
      state: this.state,
    });

    return {
      complete: this.isGoalComplete(),
      nextInput: this.generateNextInput(),
    };
  }

  /**
   * OBSERVE: Gather input, environment state, and relevant memories
   */
  async observe(userInput) {
    const observation = {
      userInput,
      environment: await this.gatherEnvironmentState(),
      relevantMemories: [],
      context: {
        previousActions: this.state.actions.slice(-5),
        iteration: this.state.iteration,
        goal: this.state.currentGoal,
      },
      timestamp: new Date(),
    };

    // Retrieve relevant memories if memory system is available
    if (this.memory && this.config.enableMemory) {
      observation.relevantMemories = await this.memory.retrieveRelevant(
        userInput,
        { limit: 5 },
      );
    }

    return observation;
  }

  /**
   * Gather current environment state
   */
  async gatherEnvironmentState() {
    // This can be extended to gather more context
    return {
      cwd: process.cwd(),
      nodeVersion: process.version,
      platform: process.platform,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * THINK: Reason, plan, and decide on actions
   */
  async think(observation) {
    // In a full implementation, this would use an LLM to reason
    // For now, we provide a structured thinking framework

    const thought = {
      reasoning: '',
      plan: '',
      steps: [],
      confidence: 0.5,
      assumptions: [],
      risks: [],
      timestamp: new Date(),
    };

    // If we have a planner, use it
    if (this.planner) {
      const plan = await this.planner.createPlan(
        this.state.currentGoal,
        observation,
      );
      thought.plan = plan.description;
      thought.steps = plan.steps;
      thought.confidence = plan.confidence;
    } else {
      // Simple default thinking
      thought.reasoning = `Processing user input: ${observation.userInput}`;
      thought.plan = 'Respond to user query';
      thought.steps = ['analyze_input', 'formulate_response'];
    }

    // Determine which tools to use
    const requiredTools = this.determineTools(thought, observation);
    thought.requiredTools = requiredTools;

    return thought;
  }

  /**
   * Determine which tools are needed based on thought and observation
   */
  determineTools(thought, observation) {
    const tools = [];

    // Simple heuristic-based tool selection
    // In production, this would use an LLM or classifier
    const input = observation.userInput.toLowerCase();

    for (const [name, tool] of this.tools) {
      // Check if tool keywords match input
      const keywords = tool.description.toLowerCase().split(' ');
      const matches = keywords.some((kw) => input.includes(kw));

      if (matches) {
        tools.push(name);
      }
    }

    return tools;
  }

  /**
   * Check if thinking indicates we should stop
   */
  shouldStopThinking(thought) {
    // Stop if confidence is too low
    if (thought.confidence < 0.3) {
      return true;
    }

    // Stop if no steps needed
    if (!thought.steps || thought.steps.length === 0) {
      return true;
    }

    return false;
  }

  /**
   * ACT: Execute planned actions
   */
  async act(thought) {
    const results = [];

    // Create actions from thought steps
    for (const step of thought.steps) {
      const action = await this.createAction(step, thought);

      // Check autonomy level
      if (!this.canExecute(action)) {
        action.status = 'pending_confirmation';
        this.state.actions.push(action);
        this.emit('action:needs_confirmation', { action });
        continue;
      }

      // Execute the action
      const result = await this.executeAction(action);
      results.push(result);

      // Check if we should stop
      if (this.shouldStop) {
        break;
      }
    }

    return results;
  }

  /**
   * Create an action from a step
   */
  async createAction(step, thought) {
    const action = {
      id: uuidv4(),
      type: 'unknown',
      description: typeof step === 'string' ? step : step.description,
      params: typeof step === 'object' ? step.params : {},
      status: 'pending',
      result: null,
      createdAt: new Date(),
      executedAt: null,
      autonomyLevel: 0,
    };

    // Determine action type and parameters
    const tool = this.inferToolFromStep(step);
    if (tool) {
      action.type = tool.name;
      action.autonomyLevel = tool.autonomyLevel;
    }

    return action;
  }

  /**
   * Infer which tool to use from a step description
   */
  inferToolFromStep(step) {
    const description = typeof step === 'string' ? step : step.description;
    const lowerDesc = description.toLowerCase();

    // Simple keyword matching
    for (const [name, tool] of this.tools) {
      if (lowerDesc.includes(tool.name.toLowerCase())) {
        return tool;
      }
    }

    return null;
  }

  /**
   * Check if we can execute an action based on autonomy level
   */
  canExecute(action) {
    // Level 0: Chat only - no actions
    if (this.config.autonomyLevel === 0) {
      return false;
    }

    // Level 1: Assisted - confirm all actions
    if (this.config.autonomyLevel === 1) {
      return false;
    }

    // Level 2: Semi-autonomous - auto-execute safe actions
    if (this.config.autonomyLevel === 2) {
      return action.autonomyLevel <= 1;
    }

    // Level 3: Autonomous - execute all actions
    if (this.config.autonomyLevel === 3) {
      return true;
    }

    return false;
  }

  /**
   * Execute a single action
   */
  async executeAction(action) {
    action.status = 'executing';
    this.emit('action:executing', { action });

    try {
      // Check safety constraints
      if (this.safetyGuard) {
        const safetyCheck = await this.safetyGuard.check(action);
        if (!safetyCheck.allowed) {
          throw new Error(`Safety check failed: ${safetyCheck.reason}`);
        }
      }

      // Dry run mode
      if (this.config.dryRun && action.type !== 'respond') {
        action.result = {
          dryRun: true,
          message: `Would execute: ${action.description}`,
        };
        action.status = 'completed';
        this.emit('action:completed', { action });
        return action.result;
      }

      // Get the tool and execute
      const tool = this.tools.get(action.type);
      if (!tool) {
        throw new Error(`Unknown tool: ${action.type}`);
      }

      const result = await tool.handler(action.params);

      action.result = result;
      action.status = 'completed';
      action.executedAt = new Date();

      this.emit('action:completed', { action, result });

      return result;
    } catch (error) {
      action.status = 'failed';
      action.result = { error: error.message };
      action.executedAt = new Date();

      this.emit('action:failed', { action, error });

      throw error;
    }
  }

  /**
   * REFLECT: Evaluate results and learn
   */
  async reflect(actionResults) {
    const reflection = {
      goalProgressed: false,
      outcome: 'partial',
      analysis: '',
      lessons: [],
      improvements: [],
      confidenceDelta: 0,
      timestamp: new Date(),
    };

    // Analyze action results
    const completed = actionResults.filter((r) => r && !r.error).length;
    const failed = actionResults.filter((r) => r && r.error).length;

    if (failed === 0 && completed > 0) {
      reflection.outcome = 'success';
      reflection.goalProgressed = true;
      reflection.confidenceDelta = 0.1;
    } else if (failed > 0 && completed === 0) {
      reflection.outcome = 'failure';
      reflection.confidenceDelta = -0.2;
    }

    reflection.analysis = `Completed ${completed} actions, ${failed} failed`;

    // Generate lessons
    if (failed > 0) {
      reflection.lessons.push(
        'Some actions failed - consider alternative approaches',
      );
    }

    if (this.state.thought.confidence < 0.7) {
      reflection.lessons.push(
        'Low confidence in plan - gather more information',
      );
    }

    return reflection;
  }

  /**
   * STORE: Update memories with learnings
   */
  async store() {
    if (!this.memory) {
      return;
    }

    // Store the iteration in memory
    const memoryEntry = {
      type: 'agent_iteration',
      sessionId: this.state.id,
      iteration: this.state.iteration,
      goal: this.state.currentGoal,
      thought: this.state.thought,
      reflection: this.state.reflection,
      timestamp: new Date(),
    };

    await this.memory.store(memoryEntry);

    // Store lessons learned if reflection exists
    if (this.state.reflection && this.state.reflection.lessons.length > 0) {
      for (const lesson of this.state.reflection.lessons) {
        await this.memory.store({
          type: 'lesson',
          content: lesson,
          context: this.state.currentGoal?.description,
          timestamp: new Date(),
        });
      }
    }
  }

  /**
   * Check if the goal is complete
   */
  isGoalComplete() {
    if (!this.state.currentGoal) {
      return true;
    }

    if (this.state.currentGoal.status === 'completed') {
      return true;
    }

    // Check if all actions completed successfully
    const pendingActions = this.state.actions.filter(
      (a) => a.status === 'pending' || a.status === 'executing',
    );

    if (pendingActions.length === 0 && this.state.actions.length > 0) {
      // All actions completed
      const failedActions = this.state.actions.filter(
        (a) => a.status === 'failed',
      );
      if (failedActions.length === 0) {
        this.state.currentGoal.status = 'completed';
        this.state.currentGoal.completedAt = new Date();
        return true;
      }
    }

    return false;
  }

  /**
   * Generate input for next iteration
   */
  generateNextInput() {
    // Summarize results for next iteration
    const lastAction = this.state.actions[this.state.actions.length - 1];
    if (lastAction && lastAction.result) {
      return `Previous action result: ${JSON.stringify(lastAction.result)}`;
    }
    return null;
  }

  /**
   * Create a goal object
   */
  createGoal(options) {
    return {
      id: uuidv4(),
      description: options.description,
      type: options.type || 'ephemeral',
      priority: options.priority || 5,
      successCriteria: options.successCriteria || [],
      createdAt: new Date(),
      completedAt: null,
      status: 'active',
      metadata: options.metadata || {},
    };
  }

  /**
   * Create the final result
   */
  createResult() {
    return {
      success: this.state.currentGoal?.status === 'completed',
      state: this.state,
      actions: this.state.actions,
      iterations: this.state.iteration,
      goal: this.state.currentGoal,
    };
  }

  /**
   * Stop the agent loop
   */
  stop() {
    this.shouldStop = true;
    this.emit('loop:stopping', { state: this.state });
  }

  /**
   * Confirm a pending action (for autonomy level 1)
   */
  async confirmAction(actionId, confirmed) {
    const action = this.state.actions.find((a) => a.id === actionId);
    if (!action) {
      throw new Error(`Action not found: ${actionId}`);
    }

    if (action.status !== 'pending_confirmation') {
      throw new Error(`Action is not pending confirmation: ${action.status}`);
    }

    if (confirmed) {
      await this.executeAction(action);
    } else {
      action.status = 'cancelled';
      this.emit('action:cancelled', { action });
    }
  }

  /**
   * Get current state
   */
  getState() {
    return { ...this.state };
  }

  /**
   * Reset the agent loop
   */
  reset() {
    this.state = this.createInitialState();
    this.isRunning = false;
    this.shouldStop = false;
    this.emit('loop:reset');
  }
}

// ============================================================================
// Factory Function
// ============================================================================

export function createAgentLoop(options = {}) {
  return new AgentLoop(options);
}

// ============================================================================
// Default Export
// ============================================================================

export default AgentLoop;
