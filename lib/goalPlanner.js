/**
 * Goal Planner - Planning and goal management for StaticRebel
 *
 * Features:
 * - Goal objects with success criteria
 * - Plan decomposition into steps
 * - Re-planning when blocked
 * - Confidence tracking
 */

import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';

// ============================================================================
// Types & Interfaces
// ============================================================================

/**
 * @typedef {Object} Goal
 * @property {string} id - Unique goal ID
 * @property {string} description - Human-readable goal description
 * @property {string} type - 'short' | 'long' | 'ephemeral' | 'recurring'
 * @property {number} priority - 1-10 priority level
 * @property {string[]} successCriteria - Criteria for goal completion
 * @property {Date} createdAt - Creation timestamp
 * @property {Date|null} deadline - Optional deadline
 * @property {Date|null} completedAt - Completion timestamp
 * @property {string} status - 'pending' | 'active' | 'completed' | 'failed' | 'blocked' | 'cancelled'
 * @property {number} progress - 0-100 progress percentage
 * @property {Object} metadata - Additional goal metadata
 * @property {string|null} parentId - Parent goal ID for sub-goals
 * @property {string[]} dependencies - IDs of goals that must complete first
 */

/**
 * @typedef {Object} Plan
 * @property {string} id - Unique plan ID
 * @property {string} goalId - Associated goal ID
 * @property {string} description - Plan description
 * @property {Step[]} steps - Plan steps
 * @property {number} confidence - 0-1 confidence in plan success
 * @property {Date} createdAt - Creation timestamp
 * @property {Date|null} updatedAt - Last update timestamp
 * @property {string} status - 'draft' | 'active' | 'completed' | 'failed' | 'abandoned'
 */

/**
 * @typedef {Object} Step
 * @property {string} id - Unique step ID
 * @property {string} description - Step description
 * @property {string} type - 'action' | 'decision' | 'wait' | 'subgoal'
 * @property {string} status - 'pending' | 'active' | 'completed' | 'failed' | 'skipped'
 * @property {number} order - Step order in plan
 * @property {Object} params - Step parameters
 * @property {string|null} result - Step result
 * @property {Date|null} startedAt - When step started
 * @property {Date|null} completedAt - When step completed
 * @property {number} estimatedDuration - Estimated duration in minutes
 * @property {string[]} dependencies - Step IDs that must complete first
 */

// ============================================================================
// Goal Planner Class
// ============================================================================

export class GoalPlanner extends EventEmitter {
  constructor(options = {}) {
    super();

    this.goals = new Map();
    this.plans = new Map();
    this.activeGoal = null;
    this.confidenceThreshold = options.confidenceThreshold || 0.3;
    this.maxReplans = options.maxReplans || 3;
    this.replanCount = new Map(); // Track replans per goal

    // Load persisted goals if storage provided
    if (options.storage) {
      this.storage = options.storage;
      this.loadPersistedGoals();
    }
  }

  /**
   * Create a new goal
   */
  createGoal(options) {
    const goal = {
      id: uuidv4(),
      description: options.description,
      type: options.type || 'short',
      priority: options.priority || 5,
      successCriteria: options.successCriteria || [],
      createdAt: new Date(),
      deadline: options.deadline || null,
      completedAt: null,
      status: 'pending',
      progress: 0,
      metadata: options.metadata || {},
      parentId: options.parentId || null,
      dependencies: options.dependencies || [],
      tags: options.tags || [],
    };

    this.goals.set(goal.id, goal);

    this.emit('goal:created', { goal });

    // Persist if storage available
    this.persistGoals();

    return goal;
  }

  /**
   * Create a plan for a goal
   */
  createPlan(goalId, options = {}) {
    const goal = this.goals.get(goalId);
    if (!goal) {
      throw new Error(`Goal not found: ${goalId}`);
    }

    const plan = {
      id: uuidv4(),
      goalId,
      description: options.description || `Plan for: ${goal.description}`,
      steps: [],
      confidence: options.confidence || 0.5,
      createdAt: new Date(),
      updatedAt: null,
      status: 'draft',
    };

    // Generate steps based on goal type and context
    plan.steps = this.generateSteps(goal, options.context);

    this.plans.set(plan.id, plan);

    // Link plan to goal
    goal.planId = plan.id;

    this.emit('plan:created', { plan, goal });

    return plan;
  }

  /**
   * Generate steps for a plan
   */
  generateSteps(goal, context = {}) {
    const steps = [];

    // Simple step generation based on goal type
    // In production, this would use an LLM to generate intelligent steps

    if (goal.type === 'short' || goal.type === 'ephemeral') {
      steps.push(
        {
          id: uuidv4(),
          description: 'Analyze goal and gather context',
          type: 'action',
          status: 'pending',
          order: 1,
          params: {},
          dependencies: [],
        },
        {
          id: uuidv4(),
          description: 'Execute primary action',
          type: 'action',
          status: 'pending',
          order: 2,
          params: {},
          dependencies: [],
        },
        {
          id: uuidv4(),
          description: 'Verify success criteria',
          type: 'decision',
          status: 'pending',
          order: 3,
          params: { criteria: goal.successCriteria },
          dependencies: [],
        },
      );
    } else if (goal.type === 'long') {
      // Long-term goals have more complex planning
      steps.push(
        {
          id: uuidv4(),
          description: 'Break down goal into milestones',
          type: 'action',
          status: 'pending',
          order: 1,
          params: {},
          dependencies: [],
        },
        {
          id: uuidv4(),
          description: 'Identify dependencies and blockers',
          type: 'action',
          status: 'pending',
          order: 2,
          params: {},
          dependencies: [],
        },
        {
          id: uuidv4(),
          description: 'Execute milestone 1',
          type: 'subgoal',
          status: 'pending',
          order: 3,
          params: {},
          dependencies: [],
        },
        {
          id: uuidv4(),
          description: 'Review progress and adjust plan',
          type: 'decision',
          status: 'pending',
          order: 4,
          params: {},
          dependencies: [],
        },
      );
    }

    return steps;
  }

  /**
   * Activate a goal (start working on it)
   */
  activateGoal(goalId) {
    const goal = this.goals.get(goalId);
    if (!goal) {
      throw new Error(`Goal not found: ${goalId}`);
    }

    // Check dependencies
    for (const depId of goal.dependencies) {
      const dep = this.goals.get(depId);
      if (!dep || dep.status !== 'completed') {
        goal.status = 'blocked';
        goal.blockedReason = `Waiting for dependency: ${depId}`;
        this.emit('goal:blocked', { goal, dependency: dep });
        return goal;
      }
    }

    goal.status = 'active';
    this.activeGoal = goal;

    // Create or activate plan
    if (!goal.planId) {
      this.createPlan(goalId);
    }

    const plan = this.plans.get(goal.planId);
    if (plan) {
      plan.status = 'active';
    }

    this.emit('goal:activated', { goal, plan });

    return goal;
  }

  /**
   * Get the next step to execute
   */
  getNextStep(planId) {
    const plan = this.plans.get(planId);
    if (!plan) {
      throw new Error(`Plan not found: ${planId}`);
    }

    // Find first pending step with satisfied dependencies
    for (const step of plan.steps) {
      if (step.status !== 'pending') continue;

      const depsSatisfied = step.dependencies.every((depId) => {
        const dep = plan.steps.find((s) => s.id === depId);
        return dep && dep.status === 'completed';
      });

      if (depsSatisfied) {
        return step;
      }
    }

    return null; // No pending steps
  }

  /**
   * Execute the next step in a plan
   */
  async executeNextStep(planId, executor) {
    const step = this.getNextStep(planId);
    if (!step) {
      return { done: true, message: 'No more steps' };
    }

    step.status = 'active';
    step.startedAt = new Date();

    this.emit('step:started', { step, planId });

    try {
      const result = await executor(step);

      step.status = 'completed';
      step.completedAt = new Date();
      step.result = result;

      this.emit('step:completed', { step, result });

      // Update goal progress
      await this.updateProgress(planId);

      return { done: false, step, result };
    } catch (error) {
      step.status = 'failed';
      step.completedAt = new Date();
      step.result = { error: error.message };

      this.emit('step:failed', { step, error });

      // Trigger replanning if needed
      await this.handleStepFailure(planId, step, error);

      throw error;
    }
  }

  /**
   * Handle step failure - decide whether to replan
   */
  async handleStepFailure(planId, step, error) {
    const plan = this.plans.get(planId);
    const goal = this.goals.get(plan.goalId);

    const replanKey = goal.id;
    const currentReplans = this.replanCount.get(replanKey) || 0;

    if (currentReplans >= this.maxReplans) {
      goal.status = 'failed';
      goal.failureReason = `Max replans exceeded. Last error: ${error.message}`;
      this.emit('goal:failed', { goal, error });
      return;
    }

    // Try to replan
    this.replanCount.set(replanKey, currentReplans + 1);

    this.emit('plan:replanning', {
      plan,
      step,
      error,
      attempt: currentReplans + 1,
    });

    // Create alternative steps
    const alternativeSteps = this.generateAlternativeSteps(step, error);

    if (alternativeSteps.length > 0) {
      // Insert alternative steps after current step
      const stepIndex = plan.steps.findIndex((s) => s.id === step.id);
      plan.steps.splice(stepIndex + 1, 0, ...alternativeSteps);
      plan.updatedAt = new Date();

      this.emit('plan:replanned', { plan, newSteps: alternativeSteps });
    } else {
      // No alternatives, mark goal as blocked
      goal.status = 'blocked';
      goal.blockedReason = `Step failed with no alternatives: ${error.message}`;
      this.emit('goal:blocked', { goal, step, error });
    }
  }

  /**
   * Generate alternative steps when a step fails
   */
  generateAlternativeSteps(failedStep, error) {
    const alternatives = [];

    // Simple alternative generation
    // In production, use LLM to suggest alternatives

    alternatives.push({
      id: uuidv4(),
      description: `Retry: ${failedStep.description}`,
      type: failedStep.type,
      status: 'pending',
      order: failedStep.order + 0.1,
      params: { ...failedStep.params, retry: true },
      dependencies: [],
    });

    alternatives.push({
      id: uuidv4(),
      description: `Alternative approach for: ${failedStep.description}`,
      type: 'action',
      status: 'pending',
      order: failedStep.order + 0.2,
      params: { alternative: true, originalError: error.message },
      dependencies: [alternatives[0].id],
    });

    return alternatives;
  }

  /**
   * Update goal progress based on completed steps
   */
  async updateProgress(planId) {
    const plan = this.plans.get(planId);
    if (!plan) return;

    const goal = this.goals.get(plan.goalId);
    if (!goal) return;

    const totalSteps = plan.steps.length;
    const completedSteps = plan.steps.filter(
      (s) => s.status === 'completed',
    ).length;

    goal.progress = Math.round((completedSteps / totalSteps) * 100);

    // Check if all steps completed
    if (completedSteps === totalSteps) {
      await this.completeGoal(goal.id);
    }

    this.emit('goal:progress', { goal, progress: goal.progress });

    this.persistGoals();
  }

  /**
   * Mark a goal as complete
   */
  async completeGoal(goalId) {
    const goal = this.goals.get(goalId);
    if (!goal) {
      throw new Error(`Goal not found: ${goalId}`);
    }

    goal.status = 'completed';
    goal.completedAt = new Date();
    goal.progress = 100;

    // Mark plan as complete
    if (goal.planId) {
      const plan = this.plans.get(goal.planId);
      if (plan) {
        plan.status = 'completed';
      }
    }

    this.emit('goal:completed', { goal });

    // Activate next goal if there are pending dependencies
    this.activateReadyGoals();

    this.persistGoals();

    return goal;
  }

  /**
   * Activate goals whose dependencies are now satisfied
   */
  activateReadyGoals() {
    for (const goal of this.goals.values()) {
      if (goal.status !== 'pending') continue;

      const depsSatisfied = goal.dependencies.every((depId) => {
        const dep = this.goals.get(depId);
        return dep && dep.status === 'completed';
      });

      if (depsSatisfied) {
        this.activateGoal(goal.id);
      }
    }
  }

  /**
   * Check if confidence has dropped below threshold
   */
  shouldStop(planId) {
    const plan = this.plans.get(planId);
    if (!plan) return true;

    if (plan.confidence < this.confidenceThreshold) {
      this.emit('plan:low_confidence', { plan, confidence: plan.confidence });
      return true;
    }

    return false;
  }

  /**
   * Update plan confidence
   */
  updateConfidence(planId, delta) {
    const plan = this.plans.get(planId);
    if (!plan) return;

    plan.confidence = Math.max(0, Math.min(1, plan.confidence + delta));
    plan.updatedAt = new Date();

    this.emit('plan:confidence_updated', { plan, confidence: plan.confidence });
  }

  /**
   * Get active goal
   */
  getActiveGoal() {
    return this.activeGoal;
  }

  /**
   * Get goal by ID
   */
  getGoal(goalId) {
    return this.goals.get(goalId);
  }

  /**
   * Get plan by ID
   */
  getPlan(planId) {
    return this.plans.get(planId);
  }

  /**
   * List all goals
   */
  listGoals(filter = {}) {
    let goals = Array.from(this.goals.values());

    if (filter.status) {
      goals = goals.filter((g) => g.status === filter.status);
    }

    if (filter.type) {
      goals = goals.filter((g) => g.type === filter.type);
    }

    if (filter.priority) {
      goals = goals.filter((g) => g.priority >= filter.priority);
    }

    // Sort by priority and creation date
    goals.sort((a, b) => {
      if (b.priority !== a.priority) {
        return b.priority - a.priority;
      }
      return b.createdAt - a.createdAt;
    });

    return goals;
  }

  /**
   * Cancel a goal
   */
  cancelGoal(goalId, reason) {
    const goal = this.goals.get(goalId);
    if (!goal) {
      throw new Error(`Goal not found: ${goalId}`);
    }

    goal.status = 'cancelled';
    goal.cancelledAt = new Date();
    goal.cancellationReason = reason;

    // Cancel plan if exists
    if (goal.planId) {
      const plan = this.plans.get(goal.planId);
      if (plan) {
        plan.status = 'abandoned';
      }
    }

    this.emit('goal:cancelled', { goal, reason });

    this.persistGoals();

    return goal;
  }

  /**
   * Persist goals to storage
   */
  async persistGoals() {
    if (!this.storage) return;

    try {
      const data = {
        goals: Array.from(this.goals.entries()),
        plans: Array.from(this.plans.entries()),
        updatedAt: new Date(),
      };

      await this.storage.set('goals', data);
    } catch (error) {
      this.emit('error', { type: 'persist', error });
    }
  }

  /**
   * Load persisted goals from storage
   */
  async loadPersistedGoals() {
    if (!this.storage) return;

    try {
      const data = await this.storage.get('goals');
      if (data) {
        this.goals = new Map(data.goals || []);
        this.plans = new Map(data.plans || []);

        this.emit('goals:loaded', {
          goalCount: this.goals.size,
          planCount: this.plans.size,
        });
      }
    } catch (error) {
      this.emit('error', { type: 'load', error });
    }
  }

  /**
   * Get goal statistics
   */
  getStats() {
    const goals = Array.from(this.goals.values());

    return {
      total: goals.length,
      byStatus: {
        pending: goals.filter((g) => g.status === 'pending').length,
        active: goals.filter((g) => g.status === 'active').length,
        completed: goals.filter((g) => g.status === 'completed').length,
        failed: goals.filter((g) => g.status === 'failed').length,
        blocked: goals.filter((g) => g.status === 'blocked').length,
        cancelled: goals.filter((g) => g.status === 'cancelled').length,
      },
      byType: {
        short: goals.filter((g) => g.type === 'short').length,
        long: goals.filter((g) => g.type === 'long').length,
        ephemeral: goals.filter((g) => g.type === 'ephemeral').length,
        recurring: goals.filter((g) => g.type === 'recurring').length,
      },
      activeGoal: this.activeGoal?.id || null,
      totalPlans: this.plans.size,
    };
  }

  /**
   * Export goals and plans
   */
  export() {
    return {
      goals: Array.from(this.goals.values()),
      plans: Array.from(this.plans.values()),
      exportedAt: new Date(),
    };
  }

  /**
   * Import goals and plans
   */
  import(data) {
    if (data.goals) {
      for (const goal of data.goals) {
        this.goals.set(goal.id, goal);
      }
    }

    if (data.plans) {
      for (const plan of data.plans) {
        this.plans.set(plan.id, plan);
      }
    }

    this.emit('goals:imported', {
      goals: data.goals?.length || 0,
      plans: data.plans?.length || 0,
    });

    this.persistGoals();
  }
}

// ============================================================================
// Factory Function
// ============================================================================

export function createGoalPlanner(options = {}) {
  return new GoalPlanner(options);
}

// ============================================================================
// Default Export
// ============================================================================

export default GoalPlanner;
