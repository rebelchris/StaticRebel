/**
 * Multi-Step Planner
 *
 * Takes complex user requests and breaks them into sequential steps with checkpoints.
 * Executes steps with human approval at checkpoints.
 *
 * Usage:
 *   import { createPlan, executePlan, getPlanStatus } from './lib/planning/planner.js';
 *   const plan = await createPlan('build a React app with user auth');
 *   const result = await executePlan(plan, { onCheckpoint: async (step) => confirm(step) });
 */

import { chatCompletion, getModelForTask } from '../modelRegistry.js';
import { writeDailyMemory } from '../memoryManager.js';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

const execAsync = promisify(exec);

// ============================================================================
// Configuration
// ============================================================================

const CONFIG = {
  DEBUG: process.env.DEBUG_PLANNER === 'true',
  MAX_STEPS: 20,
  DEFAULT_CHECKPOINT_INTERVAL: 3, // Checkpoint every N steps
  PLAN_STORAGE_PATH: path.join(os.homedir(), '.static-rebel', 'plans'),
};

// ============================================================================
// Types
// ============================================================================

/**
 * @typedef {Object} PlanStep
 * @property {number} index - Step number (1-based)
 * @property {string} description - Human-readable description
 * @property {string} [command] - Shell command to execute (optional)
 * @property {string} [file] - File to create/modify (optional)
 * @property {string} [fileContent] - Content for file (if file specified)
 * @property {string} [action] - Action type: 'command', 'file', 'manual', 'checkpoint'
 * @property {boolean} checkpoint - Whether this step requires human approval
 * @property {string} [status] - 'pending', 'running', 'completed', 'failed', 'skipped'
 * @property {string} [output] - Output from execution
 * @property {string} [error] - Error message if failed
 */

/**
 * @typedef {Object} Plan
 * @property {string} id - Unique plan ID
 * @property {string} request - Original user request
 * @property {string} summary - Brief summary of the plan
 * @property {PlanStep[]} steps - Sequential steps
 * @property {number} estimatedSteps - Total estimated steps
 * @property {number} currentStep - Current step index (0-based)
 * @property {string} status - 'created', 'running', 'paused', 'completed', 'failed', 'cancelled'
 * @property {Date} createdAt - When plan was created
 * @property {Date} [updatedAt] - Last update time
 */

// ============================================================================
// Plan Storage
// ============================================================================

async function ensurePlanStorage() {
  try {
    await fs.mkdir(CONFIG.PLAN_STORAGE_PATH, { recursive: true });
  } catch (error) {
    // Ignore if already exists
  }
}

async function savePlan(plan) {
  await ensurePlanStorage();
  const filePath = path.join(CONFIG.PLAN_STORAGE_PATH, `${plan.id}.json`);
  await fs.writeFile(filePath, JSON.stringify(plan, null, 2));
  return plan;
}

async function loadPlan(planId) {
  const filePath = path.join(CONFIG.PLAN_STORAGE_PATH, `${planId}.json`);
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    return null;
  }
}

async function listPlans() {
  await ensurePlanStorage();
  try {
    const files = await fs.readdir(CONFIG.PLAN_STORAGE_PATH);
    const plans = [];
    for (const file of files) {
      if (file.endsWith('.json')) {
        const plan = await loadPlan(file.replace('.json', ''));
        if (plan) plans.push(plan);
      }
    }
    return plans.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  } catch (error) {
    return [];
  }
}

// ============================================================================
// Complexity Detection
// ============================================================================

const COMPLEX_TASK_PATTERNS = [
  // Development tasks
  /\b(build|create|develop|implement)\s+(a|an|the)?\s*(react|vue|angular|next|node|express|app|application|website|api|service)/i,
  /\b(migrate|migration|convert)\s+(to|from|database|schema|code)/i,
  /\b(refactor|restructure|reorganize)\s+(the|this|my)?\s*(codebase|code|project|app)/i,
  /\b(set\s*up|setup|configure|install)\s+(development|dev|prod|production|ci|cd|pipeline|docker|kubernetes)/i,

  // Data tasks
  /\b(analyze|process|transform|etl|pipeline)\s+(data|dataset|csv|json|database)/i,
  /\b(import|export|backup|restore)\s+(data|database|schema)/i,

  // Multi-step indicators
  /\b(step\s*by\s*step|steps?\s*to|guide\s*me|walk\s*me\s*through)/i,
  /\b(and\s+then|after\s+that|next|finally|first|second|third)/i,
  /\b(multiple|several|many|various)\s+(files?|components?|steps?|tasks?)/i,

  // Infrastructure
  /\b(deploy|deployment|hosting|infrastructure|aws|gcp|azure|cloud)/i,
  /\b(monitor|monitoring|logging|alerting|observability)/i,
];

/**
 * Detect if a request is complex enough to need multi-step planning
 */
export function isComplexTask(input) {
  const lowerInput = input.toLowerCase();

  // Check patterns
  for (const pattern of COMPLEX_TASK_PATTERNS) {
    if (pattern.test(input)) {
      return { isComplex: true, reason: 'matches_complex_pattern' };
    }
  }

  // Check for multiple action verbs
  const actionVerbs = ['build', 'create', 'add', 'remove', 'update', 'fix', 'configure', 'set up', 'install', 'deploy'];
  const verbCount = actionVerbs.filter(verb => lowerInput.includes(verb)).length;
  if (verbCount >= 2) {
    return { isComplex: true, reason: 'multiple_actions' };
  }

  // Check for conjunctions suggesting multiple steps
  const conjunctions = lowerInput.match(/\b(and|then|also|plus|with|including)\b/g) || [];
  if (conjunctions.length >= 2) {
    return { isComplex: true, reason: 'multiple_conjunctions' };
  }

  return { isComplex: false, reason: 'simple_task' };
}

// ============================================================================
// Plan Creation (LLM-powered)
// ============================================================================

/**
 * Create a structured plan from a complex user request
 */
export async function createPlan(request, options = {}) {
  const {
    checkpointInterval = CONFIG.DEFAULT_CHECKPOINT_INTERVAL,
    maxSteps = CONFIG.MAX_STEPS,
    context = {},
  } = options;

  const planId = `plan_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

  if (CONFIG.DEBUG) {
    console.log(`[Planner] Creating plan for: "${request}"`);
  }

  // Use LLM to break down the task
  const model = getModelForTask?.('planning') || 'ollama/llama3.2';

  const systemPrompt = `You are a task planning assistant. Break down complex requests into sequential, atomic steps.

Rules:
1. Each step should be a single, clear action
2. Include shell commands where applicable (prefix with \`command:\`)
3. Include file paths where applicable (prefix with \`file:\`)
4. Mark important milestones as checkpoints
5. Keep steps atomic and testable
6. Consider dependencies between steps
7. Maximum ${maxSteps} steps

Output format (JSON):
{
  "summary": "Brief description of the overall plan",
  "steps": [
    {
      "description": "What this step does",
      "action": "command|file|manual",
      "command": "optional shell command",
      "file": "optional file path",
      "fileContent": "optional content if creating file",
      "checkpoint": true/false
    }
  ]
}

Current context:
- Working directory: ${context.cwd || process.cwd()}
- Platform: ${process.platform}`;

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: `Break down this task into steps: ${request}` },
  ];

  try {
    const response = await chatCompletion(model, messages, { format: 'json' });
    const content = typeof response === 'string' ? response : response.content;

    // Parse JSON response
    let planData;
    try {
      // Extract JSON from response (handle markdown code blocks)
      const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, content];
      planData = JSON.parse(jsonMatch[1] || content);
    } catch (parseError) {
      // Fallback: create simple plan
      planData = {
        summary: `Execute: ${request}`,
        steps: [
          {
            description: request,
            action: 'manual',
            checkpoint: true,
          },
        ],
      };
    }

    // Build plan structure
    const steps = planData.steps.slice(0, maxSteps).map((step, index) => ({
      index: index + 1,
      description: step.description,
      action: step.action || 'manual',
      command: step.command || null,
      file: step.file || null,
      fileContent: step.fileContent || null,
      checkpoint: step.checkpoint || ((index + 1) % checkpointInterval === 0),
      status: 'pending',
      output: null,
      error: null,
    }));

    // Ensure last step is always a checkpoint
    if (steps.length > 0) {
      steps[steps.length - 1].checkpoint = true;
    }

    const plan = {
      id: planId,
      request,
      summary: planData.summary || `Plan for: ${request}`,
      steps,
      estimatedSteps: steps.length,
      currentStep: 0,
      status: 'created',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Save plan
    await savePlan(plan);

    if (CONFIG.DEBUG) {
      console.log(`[Planner] Created plan ${planId} with ${steps.length} steps`);
    }

    // Record in memory
    writeDailyMemory(`Created plan: ${plan.summary} (${steps.length} steps)`);

    return plan;
  } catch (error) {
    console.error('[Planner] Failed to create plan:', error.message);

    // Return minimal fallback plan
    return {
      id: planId,
      request,
      summary: `Execute: ${request}`,
      steps: [{
        index: 1,
        description: request,
        action: 'manual',
        checkpoint: true,
        status: 'pending',
      }],
      estimatedSteps: 1,
      currentStep: 0,
      status: 'created',
      createdAt: new Date().toISOString(),
      error: error.message,
    };
  }
}

// ============================================================================
// Plan Execution
// ============================================================================

/**
 * Execute a single step
 */
async function executeStep(step, options = {}) {
  const { dryRun = false, cwd = process.cwd() } = options;

  step.status = 'running';

  try {
    if (dryRun) {
      step.output = `[DRY RUN] Would execute: ${step.description}`;
      step.status = 'completed';
      return step;
    }

    switch (step.action) {
      case 'command':
        if (step.command) {
          const { stdout, stderr } = await execAsync(step.command, {
            cwd,
            timeout: 60000, // 1 minute timeout
          });
          step.output = stdout || stderr || 'Command completed';
          step.status = 'completed';
        } else {
          step.output = 'No command specified';
          step.status = 'skipped';
        }
        break;

      case 'file':
        if (step.file && step.fileContent) {
          const filePath = path.isAbsolute(step.file)
            ? step.file
            : path.join(cwd, step.file);
          await fs.mkdir(path.dirname(filePath), { recursive: true });
          await fs.writeFile(filePath, step.fileContent);
          step.output = `Created file: ${step.file}`;
          step.status = 'completed';
        } else {
          step.output = 'No file or content specified';
          step.status = 'skipped';
        }
        break;

      case 'manual':
      default:
        step.output = 'Manual step - requires user action';
        step.status = 'completed';
        break;
    }
  } catch (error) {
    step.error = error.message;
    step.status = 'failed';
  }

  return step;
}

/**
 * Execute a plan with checkpoint approval
 *
 * @param {Plan} plan - The plan to execute
 * @param {Object} options - Execution options
 * @param {Function} options.onCheckpoint - Async function called at checkpoints, should return true to continue
 * @param {Function} options.onStep - Callback after each step
 * @param {boolean} options.dryRun - If true, don't actually execute commands
 * @param {string} options.cwd - Working directory
 */
export async function executePlan(plan, options = {}) {
  const {
    onCheckpoint = async () => true,
    onStep = () => {},
    dryRun = false,
    cwd = process.cwd(),
  } = options;

  plan.status = 'running';
  plan.updatedAt = new Date().toISOString();
  await savePlan(plan);

  if (CONFIG.DEBUG) {
    console.log(`[Planner] Executing plan ${plan.id} from step ${plan.currentStep + 1}`);
  }

  for (let i = plan.currentStep; i < plan.steps.length; i++) {
    const step = plan.steps[i];
    plan.currentStep = i;

    // Check if this is a checkpoint requiring approval
    if (step.checkpoint && i > 0) {
      plan.status = 'paused';
      await savePlan(plan);

      const shouldContinue = await onCheckpoint(step, plan);

      if (!shouldContinue) {
        plan.status = 'paused';
        plan.updatedAt = new Date().toISOString();
        await savePlan(plan);
        return {
          success: false,
          plan,
          pausedAt: step.index,
          reason: 'checkpoint_rejected',
        };
      }

      plan.status = 'running';
    }

    // Execute step
    await executeStep(step, { dryRun, cwd });
    plan.updatedAt = new Date().toISOString();
    await savePlan(plan);

    // Callback
    onStep(step, plan);

    // Check for failure
    if (step.status === 'failed') {
      plan.status = 'failed';
      await savePlan(plan);

      writeDailyMemory(`Plan failed at step ${step.index}: ${step.error}`);

      return {
        success: false,
        plan,
        failedAt: step.index,
        error: step.error,
      };
    }
  }

  // All steps completed
  plan.status = 'completed';
  plan.currentStep = plan.steps.length;
  plan.updatedAt = new Date().toISOString();
  await savePlan(plan);

  writeDailyMemory(`Completed plan: ${plan.summary}`);

  return {
    success: true,
    plan,
  };
}

/**
 * Resume a paused plan
 */
export async function resumePlan(planId, options = {}) {
  const plan = await loadPlan(planId);
  if (!plan) {
    throw new Error(`Plan not found: ${planId}`);
  }

  if (plan.status !== 'paused') {
    throw new Error(`Plan is not paused (status: ${plan.status})`);
  }

  return executePlan(plan, options);
}

/**
 * Cancel a plan
 */
export async function cancelPlan(planId) {
  const plan = await loadPlan(planId);
  if (!plan) {
    throw new Error(`Plan not found: ${planId}`);
  }

  plan.status = 'cancelled';
  plan.updatedAt = new Date().toISOString();
  await savePlan(plan);

  writeDailyMemory(`Cancelled plan: ${plan.summary}`);

  return plan;
}

// ============================================================================
// Plan Status & Formatting
// ============================================================================

/**
 * Get current status of a plan
 */
export async function getPlanStatus(planId) {
  const plan = await loadPlan(planId);
  if (!plan) return null;

  const completedSteps = plan.steps.filter(s => s.status === 'completed').length;
  const failedSteps = plan.steps.filter(s => s.status === 'failed').length;

  return {
    id: plan.id,
    summary: plan.summary,
    status: plan.status,
    progress: `${completedSteps}/${plan.estimatedSteps}`,
    progressPercent: Math.round((completedSteps / plan.estimatedSteps) * 100),
    currentStep: plan.currentStep + 1,
    completedSteps,
    failedSteps,
    createdAt: plan.createdAt,
    updatedAt: plan.updatedAt,
  };
}

/**
 * Format plan as human-readable text
 */
export function formatPlan(plan) {
  const lines = [
    `**${plan.summary}**`,
    `Status: ${plan.status} | Steps: ${plan.estimatedSteps}`,
    '',
    '**Steps:**',
  ];

  for (const step of plan.steps) {
    const statusIcon = {
      pending: '○',
      running: '◐',
      completed: '●',
      failed: '✗',
      skipped: '⊘',
    }[step.status] || '○';

    const checkpointMark = step.checkpoint ? ' [CHECKPOINT]' : '';
    lines.push(`${statusIcon} ${step.index}. ${step.description}${checkpointMark}`);

    if (step.command) {
      lines.push(`   └─ Command: \`${step.command}\``);
    }
    if (step.file) {
      lines.push(`   └─ File: ${step.file}`);
    }
    if (step.error) {
      lines.push(`   └─ Error: ${step.error}`);
    }
  }

  return lines.join('\n');
}

// ============================================================================
// Exports
// ============================================================================

export {
  loadPlan,
  listPlans,
  savePlan,
  CONFIG as PLANNER_CONFIG,
};
