/**
 * Enhanced Assistant - Next-level autonomous assistant for StaticRebel
 *
 * Integrates:
 * - Agent Loop (Observe-Think-Act-Reflect-Store)
 * - Memory System
 * - Tool Registry
 * - Autonomy Levels
 * - Goal Planning
 * - Reflection Engine
 * - Safety Guardrails
 * - Plugin System
 *
 * With improved UX showing thinking/planning/acting phases
 */

import { EventEmitter } from 'events';
import { AgentLoop } from './agentLoop.js';
import { ToolRegistry } from './toolRegistry.js';
import { AutonomyManager } from './autonomyManager.js';
import { GoalPlanner } from './goalPlanner.js';
import { ReflectionEngine } from './reflectionEngine.js';
import { SafetyGuard } from './safetyGuard.js';
import { PluginManager } from './pluginManager.js';
import { createMemoryManager } from './memoryManager.js';

// ============================================================================
// Enhanced Assistant Class
// ============================================================================

export class EnhancedAssistant extends EventEmitter {
  constructor(options = {}) {
    super();

    this.options = {
      autonomyLevel: options.autonomyLevel || 1,
      dryRun: options.dryRun || false,
      enableReflection: options.enableReflection !== false,
      enableMemory: options.enableMemory !== false,
      showPhases: options.showPhases !== false,
      ...options,
    };

    // Initialize components
    this.initComponents();

    // Session state
    this.currentSession = null;
    this.isProcessing = false;
    this.messageHistory = [];
  }

  /**
   * Initialize all components
   */
  initComponents() {
    // Safety Guard (first, for protection)
    this.safetyGuard = new SafetyGuard({
      dryRun: this.options.dryRun,
      confirmationRequired: this.options.autonomyLevel < 2,
    });

    // Autonomy Manager
    this.autonomyManager = new AutonomyManager({
      level: this.options.autonomyLevel,
    });

    // Tool Registry
    this.toolRegistry = new ToolRegistry();

    // Goal Planner
    this.goalPlanner = new GoalPlanner();

    // Reflection Engine
    this.reflectionEngine = new ReflectionEngine({
      enablePatternRecognition: true,
    });

    // Plugin Manager
    this.pluginManager = new PluginManager({
      autoLoad: true,
    });

    // Memory Manager (if enabled)
    if (this.options.enableMemory) {
      this.memoryManager = createMemoryManager();
    }

    // Agent Loop
    this.agentLoop = new AgentLoop({
      autonomyLevel: this.options.autonomyLevel,
      dryRun: this.options.dryRun,
      enableReflection: this.options.enableReflection,
      enableMemory: this.options.enableMemory,
      maxIterations: this.getMaxIterations(),
    });

    // Register tools with agent loop
    this.registerToolsWithAgent();

    // Setup event handlers
    this.setupEventHandlers();
  }

  /**
   * Get max iterations based on autonomy level
   */
  getMaxIterations() {
    const level = this.autonomyManager.getLevel();
    return level.maxIterations || 1;
  }

  /**
   * Register tools with the agent loop
   */
  registerToolsWithAgent() {
    // Register all tools from tool registry
    for (const tool of this.toolRegistry.list()) {
      this.agentLoop.registerTool({
        name: tool.name,
        description: tool.description,
        handler: async (params) => {
          return this.toolRegistry.execute(tool.name, params, {
            dryRun: this.options.dryRun,
          });
        },
        autonomyLevel: tool.autonomyLevel,
        requiresConfirmation: tool.requiresConfirmation,
      });
    }
  }

  /**
   * Setup event handlers for components
   */
  setupEventHandlers() {
    // Agent Loop events
    this.agentLoop.on('phase:observe', () => {
      this.emitPhase('observing', 'Gathering context and memories...');
    });

    this.agentLoop.on('phase:think', (data) => {
      this.emitPhase('thinking', 'Analyzing and planning...');
      if (data.thought) {
        this.emit('thought', { reasoning: data.thought.reasoning });
      }
    });

    this.agentLoop.on('phase:act', () => {
      this.emitPhase('acting', 'Executing actions...');
    });

    this.agentLoop.on('phase:reflect', () => {
      this.emitPhase('reflecting', 'Evaluating results...');
    });

    this.agentLoop.on('action:needs_confirmation', (data) => {
      this.emit('confirmation:required', {
        action: data.action,
        message: this.formatConfirmationRequest(data.action),
      });
    });

    this.agentLoop.on('action:completed', (data) => {
      this.emit('action:result', {
        action: data.action,
        result: data.result,
      });
    });

    // Safety Guard events
    this.safetyGuard.on('check:completed', (data) => {
      if (data.result.warnings.length > 0) {
        this.emit('safety:warnings', { warnings: data.result.warnings });
      }
    });

    this.safetyGuard.on('confirmation:required', (data) => {
      this.emit('safety:confirmation', {
        checkId: data.checkId,
        action: data.action,
        warnings: data.warnings,
      });
    });
  }

  /**
   * Emit a phase change event
   */
  emitPhase(phase, message) {
    if (this.options.showPhases) {
      this.emit('phase', { phase, message, timestamp: new Date() });
    }
  }

  /**
   * Process a user message
   */
  async processMessage(message, options = {}) {
    if (this.isProcessing) {
      throw new Error('Already processing a message');
    }

    this.isProcessing = true;
    this.currentSession = {
      id: `session-${Date.now()}`,
      startedAt: new Date(),
      message,
    };

    this.emit('session:started', this.currentSession);

    try {
      // Add to history
      this.messageHistory.push({
        role: 'user',
        content: message,
        timestamp: new Date(),
      });

      // Check if this is a goal-setting message
      if (this.isGoalMessage(message)) {
        return await this.handleGoalMessage(message, options);
      }

      // Run the agent loop
      const result = await this.agentLoop.start(message, {
        goal: options.goal,
        context: {
          history: this.messageHistory.slice(-10),
          sessionId: this.currentSession.id,
        },
      });

      // Add response to history
      this.messageHistory.push({
        role: 'assistant',
        content: this.formatResponse(result),
        timestamp: new Date(),
      });

      this.emit('session:completed', {
        session: this.currentSession,
        result,
      });

      return result;
    } catch (error) {
      this.emit('session:error', {
        session: this.currentSession,
        error,
      });
      throw error;
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Check if message is setting a goal
   */
  isGoalMessage(message) {
    const goalKeywords = [
      'goal:',
      'task:',
      'objective:',
      'i want to',
      'i need to',
      'help me',
      'create a plan',
      'plan to',
    ];

    const lower = message.toLowerCase();
    return goalKeywords.some((kw) => lower.includes(kw));
  }

  /**
   * Handle a goal-setting message
   */
  async handleGoalMessage(message, options) {
    // Extract goal from message
    const goalDescription = message
      .replace(/^(goal:|task:|objective:)/i, '')
      .trim();

    // Create goal
    const goal = this.goalPlanner.createGoal({
      description: goalDescription,
      type: options.goalType || 'short',
      priority: options.priority || 5,
      successCriteria: options.successCriteria || [],
    });

    this.emit('goal:created', { goal });

    // Activate and start executing
    this.goalPlanner.activateGoal(goal.id);

    // Execute plan steps
    const results = [];
    let step;

    while ((step = this.goalPlanner.getNextStep(goal.planId))) {
      this.emitPhase('acting', `Executing: ${step.description}`);

      try {
        const result = await this.goalPlanner.executeNextStep(
          goal.planId,
          async (step) => this.executeStep(step),
        );

        results.push(result);

        if (result.done) break;
      } catch (error) {
        this.emit('step:error', { step, error });

        // Check if we should stop
        if (this.goalPlanner.shouldStop(goal.planId)) {
          break;
        }
      }
    }

    return {
      goal,
      results,
      completed: goal.status === 'completed',
    };
  }

  /**
   * Execute a plan step
   */
  async executeStep(step) {
    switch (step.type) {
      case 'action':
        return this.executeActionStep(step);
      case 'decision':
        return this.executeDecisionStep(step);
      case 'subgoal':
        return this.executeSubgoalStep(step);
      default:
        return { success: true, message: 'Step skipped' };
    }
  }

  /**
   * Execute an action step
   */
  async executeActionStep(step) {
    // Map step to tool execution
    const toolName = this.inferToolFromStep(step);

    if (!toolName) {
      return { success: true, message: 'No tool needed' };
    }

    // Check safety
    const safetyCheck = await this.safetyGuard.check({
      type: toolName,
      params: step.params,
    });

    if (!safetyCheck.allowed) {
      if (safetyCheck.requiresConfirmation) {
        this.emit('confirmation:required', {
          step,
          warnings: safetyCheck.warnings,
        });

        // Wait for confirmation (in real implementation)
        return { success: false, waitingForConfirmation: true };
      }

      throw new Error(`Safety check failed: ${safetyCheck.errors.join(', ')}`);
    }

    // Execute tool
    return this.toolRegistry.execute(toolName, step.params);
  }

  /**
   * Execute a decision step
   */
  async executeDecisionStep(step) {
    // Evaluate success criteria
    const criteria = step.params?.criteria || [];
    const met = criteria.every((c) => {
      // Check if criterion is met
      return true; // Simplified
    });

    return {
      success: met,
      criteriaMet: met,
      criteria,
    };
  }

  /**
   * Execute a subgoal step
   */
  async executeSubgoalStep(step) {
    // Create subgoal
    const subgoal = this.goalPlanner.createGoal({
      description: step.description,
      type: 'short',
      parentId: step.goalId,
    });

    this.goalPlanner.activateGoal(subgoal.id);

    return {
      success: true,
      subgoalId: subgoal.id,
    };
  }

  /**
   * Infer which tool to use for a step
   */
  inferToolFromStep(step) {
    const desc = step.description.toLowerCase();

    if (desc.includes('read') || desc.includes('get')) {
      return 'file_read';
    }
    if (desc.includes('write') || desc.includes('save')) {
      return 'file_write';
    }
    if (desc.includes('search') || desc.includes('find')) {
      return 'search';
    }
    if (desc.includes('execute') || desc.includes('run')) {
      return 'shell';
    }
    if (desc.includes('fetch') || desc.includes('download')) {
      return 'web_fetch';
    }

    return null;
  }

  /**
   * Confirm a pending action
   */
  async confirmAction(actionId, confirmed) {
    return this.agentLoop.confirmAction(actionId, confirmed);
  }

  /**
   * Set autonomy level
   */
  setAutonomyLevel(level) {
    this.autonomyManager.setLevel(level);
    this.agentLoop.config.autonomyLevel = level;
    this.agentLoop.config.maxIterations = this.getMaxIterations();

    this.emit('autonomy:changed', { level });
  }

  /**
   * Get current status
   */
  getStatus() {
    return {
      autonomyLevel: this.autonomyManager.getLevel(),
      isProcessing: this.isProcessing,
      currentSession: this.currentSession,
      goals: this.goalPlanner.getStats(),
      tools: this.toolRegistry.list().length,
      plugins: this.pluginManager.getStats(),
      reflections: this.reflectionEngine.reflections.length,
      errors: this.reflectionEngine.getErrorStats(),
    };
  }

  /**
   * Format response for display
   */
  formatResponse(result) {
    const parts = [];

    if (result.goal) {
      parts.push(`Goal: ${result.goal.description}`);
      parts.push(`Status: ${result.goal.status}`);
    }

    if (result.actions && result.actions.length > 0) {
      parts.push(`\nActions taken:`);
      for (const action of result.actions) {
        const status =
          action.status === 'completed'
            ? '✓'
            : action.status === 'failed'
              ? '✗'
              : '○';
        parts.push(`  ${status} ${action.description || action.type}`);
      }
    }

    return parts.join('\n');
  }

  /**
   * Format confirmation request
   */
  formatConfirmationRequest(action) {
    return {
      type: 'confirmation',
      action: {
        type: action.type,
        description: action.description,
      },
      message: `Allow ${action.type}?`,
      options: [
        { id: 'yes', label: 'Yes, allow this time' },
        { id: 'always', label: 'Always allow' },
        { id: 'no', label: 'No, skip this action' },
      ],
    };
  }

  /**
   * Enable dry-run mode
   */
  enableDryRun() {
    this.options.dryRun = true;
    this.agentLoop.config.dryRun = true;
    this.safetyGuard.enableDryRun();
    this.emit('mode:changed', { dryRun: true });
  }

  /**
   * Disable dry-run mode
   */
  disableDryRun() {
    this.options.dryRun = false;
    this.agentLoop.config.dryRun = false;
    this.safetyGuard.disableDryRun();
    this.emit('mode:changed', { dryRun: false });
  }

  /**
   * Get message history
   */
  getHistory() {
    return [...this.messageHistory];
  }

  /**
   * Clear message history
   */
  clearHistory() {
    this.messageHistory = [];
    this.emit('history:cleared');
  }

  /**
   * Stop current processing
   */
  stop() {
    if (this.agentLoop) {
      this.agentLoop.stop();
    }
    this.isProcessing = false;
    this.emit('stopped');
  }

  /**
   * Reset the assistant
   */
  reset() {
    this.stop();
    this.agentLoop.reset();
    this.goalPlanner = new GoalPlanner();
    this.clearHistory();
    this.emit('reset');
  }

  /**
   * Export session data
   */
  export() {
    return {
      goals: this.goalPlanner.export(),
      reflections: this.reflectionEngine.export(),
      history: this.messageHistory,
      exportedAt: new Date(),
    };
  }
}

// ============================================================================
// Factory Function
// ============================================================================

export function createEnhancedAssistant(options = {}) {
  return new EnhancedAssistant(options);
}

// ============================================================================
// CLI Interface
// ============================================================================

export async function runCLI() {
  const assistant = createEnhancedAssistant({
    showPhases: true,
    autonomyLevel: 1,
  });

  // Setup event handlers for CLI
  assistant.on('phase', ({ phase, message }) => {
    console.log(`\n[${phase.toUpperCase()}] ${message}`);
  });

  assistant.on('confirmation:required', ({ action, message }) => {
    console.log(`\n[CONFIRMATION REQUIRED]`);
    console.log(`Action: ${action.type}`);
    console.log(`Description: ${action.description}`);
  });

  assistant.on('action:result', ({ action, result }) => {
    if (result.error) {
      console.log(`\n[ERROR] ${result.error}`);
    } else {
      console.log(`\n[RESULT] ${JSON.stringify(result, null, 2)}`);
    }
  });

  // Process command line argument or interactive
  const message = process.argv[2];

  if (message) {
    const result = await assistant.processMessage(message);
    console.log('\n[RESPONSE]');
    console.log(assistant.formatResponse(result));
    process.exit(0);
  } else {
    console.log('StaticRebel Enhanced Assistant');
    console.log('Usage: node enhancedAssistant.js "your message here"');
    console.log('\nAutonomy Levels:');
    console.log('  0 - Chat only');
    console.log('  1 - Assisted (default)');
    console.log('  2 - Semi-autonomous');
    console.log('  3 - Fully autonomous');
  }
}

// Run CLI if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runCLI().catch(console.error);
}

// ============================================================================
// Default Export
// ============================================================================

export default EnhancedAssistant;
