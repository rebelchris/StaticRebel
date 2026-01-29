/**
 * Planner Agent - Specialized agent for task decomposition and planning
 *
 * Responsibilities:
 * - Break down complex tasks into steps
 * - Sequence steps optimally
 * - Allocate resources
 * - Handle replanning when blocked
 *
 * @module agents/specialized/planner
 */

import agentRegistry, { AGENT_TYPES, MESSAGE_TYPES } from '../../lib/agentRegistry.js';
import { getDefaultModel, chatCompletion } from '../../lib/modelRegistry.js';

/**
 * Create and register the planner agent
 * @returns {Object} Agent instance
 */
export function createPlannerAgent() {
  const agent = agentRegistry.registerAgent({
    name: 'PlannerAgent',
    type: AGENT_TYPES.PLANNER,
    capabilities: [
      'decompose_tasks',
      'create_plans',
      'sequence_steps',
      'allocate_resources',
      'replan',
      'estimate_complexity',
    ],
    handler: handleMessage,
  });

  return agent;
}

/**
 * Handle incoming messages
 * @param {Object} message - Agent message
 * @returns {Promise<Object>}
 */
async function handleMessage(message) {
  const { type, payload } = message;

  switch (type) {
    case MESSAGE_TYPES.TASK_ASSIGN:
      return handleTask(payload);

    case MESSAGE_TYPES.QUERY:
      return handleQuery(payload);

    case MESSAGE_TYPES.COORDINATE:
      return handleCoordinate(payload);

    default:
      return { status: 'ignored', reason: 'Unknown message type' };
  }
}

/**
 * Handle task assignment
 * @param {Object} payload - Task payload
 * @returns {Promise<Object>}
 */
async function handleTask(payload) {
  const { taskId, type, data } = payload;

  try {
    agentRegistry.updateTask(taskId, 'running');

    let result;

    switch (type) {
      case 'create_plan':
        result = await createPlan(data);
        break;

      case 'decompose_task':
        result = await decomposeTask(data);
        break;

      case 'sequence_steps':
        result = await sequenceSteps(data);
        break;

      case 'estimate_complexity':
        result = await estimateComplexity(data);
        break;

      case 'replan':
        result = await replan(data);
        break;

      default:
        throw new Error(`Unknown task type: ${type}`);
    }

    agentRegistry.completeTask(taskId, result);
    return result;

  } catch (error) {
    agentRegistry.failTask(taskId, error.message);
    throw error;
  }
}

/**
 * Handle queries
 * @param {Object} payload - Query payload
 * @returns {Promise<Object>}
 */
async function handleQuery(payload) {
  const { type, data } = payload;

  switch (type) {
    case 'get_plan_status':
      return getPlanStatus(data.planId);

    case 'get_next_step':
      return getNextStep(data.planId);

    default:
      return { error: 'Unknown query type' };
  }
}

/**
 * Handle coordination requests
 * @param {Object} payload - Coordination payload
 * @returns {Promise<Object>}
 */
async function handleCoordinate(payload) {
  const { task, availableAgents } = payload;

  return coordinateTask(task, availableAgents);
}

// ============================================================================
// Planning Functions
// ============================================================================

/**
 * Create a plan for a goal
 * @param {Object} data - Plan data
 * @returns {Promise<Object>}
 */
async function createPlan(data) {
  const { goal, context, constraints } = data;

  const model = getDefaultModel();

  const prompt = `Create a detailed execution plan for the following goal:

Goal: ${goal}

Context:
${JSON.stringify(context, null, 2)}

Constraints:
${constraints?.join('\n') || 'None'}

Create a step-by-step plan. For each step, specify:
1. Step description
2. Required capability
3. Estimated complexity (low/medium/high)
4. Dependencies on previous steps

Respond with a JSON array of steps.`;

  try {
    const response = await chatCompletion(
      model,
      [
        { role: 'system', content: 'You are a task planner. Output only valid JSON arrays.' },
        { role: 'user', content: prompt },
      ],
      { temperature: 0.3 }
    );

    // Parse the plan
    const jsonMatch = response.match(/\[[\s\S]*\]/);
    const steps = jsonMatch ? JSON.parse(jsonMatch[0]) : [];

    // Add IDs and metadata to steps
    const plan = {
      id: generatePlanId(),
      goal,
      steps: steps.map((step, index) => ({
        id: `step-${index + 1}`,
        description: step.description || step.step || 'Unknown step',
        capability: step.capability || step.required_capability || 'general',
        complexity: step.complexity || step.estimated_complexity || 'medium',
        dependencies: step.dependencies || step.depends_on || [],
        status: 'pending',
        order: index,
      })),
      createdAt: new Date(),
      status: 'active',
    };

    // Store plan
    storePlan(plan);

    return {
      planId: plan.id,
      steps: plan.steps.length,
      estimatedComplexity: calculatePlanComplexity(plan.steps),
    };

  } catch (error) {
    console.error('[PlannerAgent] Failed to create plan:', error.message);

    // Fallback to simple plan
    const plan = {
      id: generatePlanId(),
      goal,
      steps: [
        {
          id: 'step-1',
          description: 'Analyze requirements',
          capability: 'analysis',
          complexity: 'low',
          dependencies: [],
          status: 'pending',
          order: 0,
        },
        {
          id: 'step-2',
          description: goal,
          capability: 'execution',
          complexity: 'medium',
          dependencies: ['step-1'],
          status: 'pending',
          order: 1,
        },
      ],
      createdAt: new Date(),
      status: 'active',
    };

    storePlan(plan);

    return {
      planId: plan.id,
      steps: plan.steps.length,
      estimatedComplexity: 'medium',
    };
  }
}

/**
 * Decompose a complex task into subtasks
 * @param {Object} data - Task data
 * @returns {Promise<Object>}
 */
async function decomposeTask(data) {
  const { task, depth = 0 } = data;

  if (depth > 3) {
    // Prevent infinite recursion
    return {
      task,
      subtasks: [],
      atomic: true,
    };
  }

  const model = getDefaultModel();

  const prompt = `Decompose this task into smaller, actionable subtasks:

Task: ${task}

Break it down into 2-5 subtasks. Each subtask should be:
- Concrete and actionable
- Independently executable (where possible)
- Smaller than the parent task

Respond with a JSON array of subtask descriptions.`;

  try {
    const response = await chatCompletion(
      model,
      [
        { role: 'system', content: 'You are a task decomposition expert. Output only valid JSON arrays.' },
        { role: 'user', content: prompt },
      ],
      { temperature: 0.3 }
    );

    const jsonMatch = response.match(/\[[\s\S]*\]/);
    const subtasks = jsonMatch ? JSON.parse(jsonMatch[0]) : [];

    return {
      task,
      subtasks: subtasks.map((st, i) => ({
        id: `subtask-${i + 1}`,
        description: typeof st === 'string' ? st : st.description || st.task,
        status: 'pending',
      })),
      atomic: subtasks.length === 0,
    };

  } catch (error) {
    return {
      task,
      subtasks: [],
      atomic: true,
    };
  }
}

/**
 * Sequence steps optimally
 * @param {Object} data - Steps data
 * @returns {Promise<Object>}
 */
async function sequenceSteps(data) {
  const { steps, optimization = 'dependency' } = data;

  // Create dependency graph
  const graph = new Map();
  const inDegree = new Map();

  for (const step of steps) {
    graph.set(step.id, []);
    inDegree.set(step.id, 0);
  }

  for (const step of steps) {
    for (const dep of step.dependencies || []) {
      if (graph.has(dep)) {
        graph.get(dep).push(step.id);
        inDegree.set(step.id, inDegree.get(step.id) + 1);
      }
    }
  }

  // Topological sort
  const queue = [];
  const result = [];

  for (const [id, degree] of inDegree) {
    if (degree === 0) {
      queue.push(id);
    }
  }

  while (queue.length > 0) {
    const current = queue.shift();
    const step = steps.find(s => s.id === current);
    result.push(step);

    for (const neighbor of graph.get(current)) {
      inDegree.set(neighbor, inDegree.get(neighbor) - 1);
      if (inDegree.get(neighbor) === 0) {
        queue.push(neighbor);
      }
    }
  }

  // Check for cycles
  if (result.length !== steps.length) {
    return {
      error: 'Circular dependencies detected',
      sequenced: result,
      remaining: steps.filter(s => !result.includes(s)),
    };
  }

  return {
    sequenced: result,
    parallelGroups: identifyParallelGroups(result),
  };
}

/**
 * Estimate task complexity
 * @param {Object} data - Task data
 * @returns {Promise<Object>}
 */
async function estimateComplexity(data) {
  const { task, context } = data;

  const factors = {
    linesOfCode: context?.linesOfCode || 0,
    dependencies: context?.dependencies?.length || 0,
    files: context?.files?.length || 0,
    unknowns: context?.unknowns?.length || 0,
  };

  // Simple complexity calculation
  let score = 0;
  score += factors.linesOfCode / 100;
  score += factors.dependencies * 2;
  score += factors.files * 3;
  score += factors.unknowns * 5;

  let complexity;
  if (score < 10) complexity = 'low';
  else if (score < 30) complexity = 'medium';
  else complexity = 'high';

  return {
    task,
    complexity,
    score: Math.round(score),
    factors,
    estimatedTime: estimateTime(complexity),
  };
}

/**
 * Replan when blocked
 * @param {Object} data - Replan data
 * @returns {Promise<Object>}
 */
async function replan(data) {
  const { planId, blockedStep, reason, alternatives } = data;

  const plan = getPlan(planId);
  if (!plan) {
    return { error: 'Plan not found' };
  }

  // Mark blocked step
  const step = plan.steps.find(s => s.id === blockedStep);
  if (step) {
    step.status = 'blocked';
    step.blockReason = reason;
  }

  // Try alternatives if provided
  if (alternatives && alternatives.length > 0) {
    // Insert alternative steps
    const stepIndex = plan.steps.findIndex(s => s.id === blockedStep);
    const alternativeSteps = alternatives.map((alt, i) => ({
      id: `alt-${blockedStep}-${i}`,
      description: alt,
      capability: step?.capability || 'general',
      complexity: 'medium',
      dependencies: step?.dependencies || [],
      status: 'pending',
      order: step?.order || 0,
      isAlternative: true,
    }));

    plan.steps.splice(stepIndex, 0, ...alternativeSteps);

    return {
      planId,
      action: 'inserted_alternatives',
      newSteps: alternativeSteps.length,
    };
  }

  // Otherwise, try to work around
  const remainingSteps = plan.steps.filter(s =>
    s.status === 'pending' && !s.dependencies.includes(blockedStep)
  );

  return {
    planId,
    action: 'skip_blocked',
    canContinue: remainingSteps.length > 0,
    remainingSteps: remainingSteps.length,
  };
}

/**
 * Coordinate a task across multiple agents
 * @param {Object} task - Task definition
 * @param {Array} availableAgents - Available agents
 * @returns {Promise<Object>}
 */
async function coordinateTask(task, availableAgents) {
  // Create plan
  const planResult = await createPlan({
    goal: task.description,
    context: task.context,
  });

  const plan = getPlan(planResult.planId);

  // Assign steps to agents based on capabilities
  const assignments = [];

  for (const step of plan.steps) {
    const capableAgents = availableAgents.filter(agent =>
      agent.capabilities.includes(step.capability) ||
      agent.capabilities.includes('general')
    );

    if (capableAgents.length === 0) {
      return {
        error: `No agent found with capability: ${step.capability}`,
        step: step.id,
      };
    }

    // Assign to first available agent
    const agent = capableAgents[0];
    assignments.push({
      step: step.id,
      agent: agent.id,
    });
  }

  return {
    planId: plan.id,
    assignments,
    totalSteps: plan.steps.length,
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

// In-memory plan storage (in production, use persistent storage)
const plans = new Map();

function storePlan(plan) {
  plans.set(plan.id, plan);
}

function getPlan(planId) {
  return plans.get(planId);
}

function generatePlanId() {
  return `plan-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

function calculatePlanComplexity(steps) {
  const complexityValues = { low: 1, medium: 2, high: 3 };
  const total = steps.reduce((sum, step) =>
    sum + (complexityValues[step.complexity] || 2), 0
  );

  if (total < steps.length * 1.5) return 'low';
  if (total < steps.length * 2.5) return 'medium';
  return 'high';
}

function identifyParallelGroups(steps) {
  const groups = [];
  let currentGroup = [];
  let currentDependencies = new Set();

  for (const step of steps) {
    const canParallelize = step.dependencies.every(dep =>
      currentDependencies.has(dep)
    );

    if (canParallelize && currentGroup.length < 3) {
      currentGroup.push(step);
    } else {
      if (currentGroup.length > 0) {
        groups.push(currentGroup);
      }
      currentGroup = [step];
    }

    currentDependencies.add(step.id);
  }

  if (currentGroup.length > 0) {
    groups.push(currentGroup);
  }

  return groups;
}

function estimateTime(complexity) {
  const estimates = {
    low: '1-2 hours',
    medium: '2-4 hours',
    high: '4-8 hours',
  };
  return estimates[complexity] || 'unknown';
}

function getPlanStatus(planId) {
  const plan = getPlan(planId);
  if (!plan) return { error: 'Plan not found' };

  const completed = plan.steps.filter(s => s.status === 'completed').length;
  const pending = plan.steps.filter(s => s.status === 'pending').length;
  const blocked = plan.steps.filter(s => s.status === 'blocked').length;

  return {
    planId,
    status: plan.status,
    progress: {
      total: plan.steps.length,
      completed,
      pending,
      blocked,
      percentage: Math.round((completed / plan.steps.length) * 100),
    },
  };
}

function getNextStep(planId) {
  const plan = getPlan(planId);
  if (!plan) return { error: 'Plan not found' };

  const completedIds = new Set(
    plan.steps.filter(s => s.status === 'completed').map(s => s.id)
  );

  const nextStep = plan.steps.find(s =>
    s.status === 'pending' &&
    s.dependencies.every(dep => completedIds.has(dep))
  );

  return nextStep || null;
}

// ============================================================================
// Export
// ============================================================================

export default {
  createPlannerAgent,
};
