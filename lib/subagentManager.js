// Subagent Manager - Spawn specialized subagents for heavy tasks
import { spawn } from 'child_process';
import { loadConfig, getConfig } from './configManager.js';
import { getModelForTask, parseModelRef, chatCompletion } from './modelRegistry.js';

let activeSubagents = new Map();
let subagentCounter = 0;

export function getSubagentId() {
  return `subagent-${++subagentCounter}`;
}

// Create a subagent session
export async function createSubagent(taskType, systemPrompt, options = {}) {
  const config = loadConfig();
  const defaults = config.agents?.defaults || {};
  const allowedModels = defaults.subagents?.allowed || [];

  const modelRef = options.model || getModelForTask(taskType);
  const { provider, id } = parseModelRef(modelRef);

  if (provider === 'ollama' && !allowedModels.includes(modelRef)) {
    console.warn(`Model ${modelRef} not in allowed subagent list, adding...`);
    allowedModels.push(modelRef);
  }

  const subagentId = getSubagentId();

  const subagent = {
    id: subagentId,
    taskType,
    model: modelRef,
    systemPrompt,
    messages: [
      { role: 'system', content: systemPrompt }
    ],
    createdAt: Date.now(),
    lastActivity: Date.now(),
    status: 'active'
  };

  activeSubagents.set(subagentId, subagent);
  return subagent;
}

// Send message to subagent
export async function sendToSubagent(subagentId, userMessage) {
  const subagent = activeSubagents.get(subagentId);

  if (!subagent) {
    throw new Error(`Subagent ${subagentId} not found`);
  }

  if (subagent.status !== 'active') {
    throw new Error(`Subagent ${subagentId} is not active`);
  }

  // Update activity
  subagent.lastActivity = Date.now();
  subagent.messages.push({ role: 'user', content: userMessage });

  try {
    const response = await chatCompletion(
      subagent.model,
      subagent.messages,
      { timeout: 300000 } // 5 min timeout for subagents
    );

    subagent.messages.push({ role: 'assistant', content: response.message });
    subagent.lastActivity = Date.now();

    return {
      content: response.message,
      subagentId,
      duration: response.totalDuration
    };
  } catch (error) {
    subagent.status = 'error';
    throw error;
  }
}

// Get subagent info
export function getSubagent(subagentId) {
  return activeSubagents.get(subagentId);
}

// List all active subagents
export function listSubagents() {
  return Array.from(activeSubagents.values());
}

// Terminate subagent
export function terminateSubagent(subagentId) {
  const subagent = activeSubagents.get(subagentId);
  if (subagent) {
    subagent.status = 'terminated';
    activeSubagents.delete(subagentId);
    return true;
  }
  return false;
}

// Terminate idle subagents
export function cleanupIdleSubagents(maxIdleMs = 3600000) {
  const now = Date.now();
  const toTerminate = [];

  for (const [id, subagent] of activeSubagents) {
    if (subagent.status === 'active' && (now - subagent.lastActivity) > maxIdleMs) {
      toTerminate.push(id);
    }
  }

  for (const id of toTerminate) {
    terminateSubagent(id);
  }

  return toTerminate.length;
}

// Get subagent statistics
export function getSubagentStats() {
  const subagents = listSubagents();
  return {
    total: subagents.length,
    active: subagents.filter(s => s.status === 'active').length,
    idle: subagents.filter(s => s.status === 'active').length,
    error: subagents.filter(s => s.status === 'error').length,
    terminated: subagents.filter(s => s.status === 'terminated').length
  };
}

// Spawn a detached subagent process (for heavy async tasks)
export function spawnSubagentProcess(scriptPath, args = [], options = {}) {
  const subagentId = getSubagentId();

  const proc = spawn('node', [scriptPath, ...args], {
    detached: true,
    stdio: 'pipe',
    cwd: options.cwd || process.cwd(),
    env: { ...process.env, ...options.env }
  });

  proc.on('error', (err) => {
    console.error(`Subagent ${subagentId} error:`, err.message);
  });

  return {
    id: subagentId,
    process: proc,
    pid: proc.pid
  };
}

// Quick coding subagent
export async function createCodingSubagent(codebasePath, task) {
  const systemPrompt = `You are a coding specialist. Your role:

1. Read and understand the codebase at ${codebasePath}
2. Complete the requested task efficiently
3. Write clean, maintainable code
4. Explain your changes briefly
5. If you need clarification, ask

Current task: ${task}

Focus on writing working code. Don't over-engineer.`;

  return createSubagent('coding', systemPrompt, {
    model: getModelForTask('coding')
  });
}

// Quick analysis subagent
export async function createAnalysisSubagent(topic, context) {
  const systemPrompt = `You are an analysis specialist. Your role:

1. Analyze the given topic thoroughly
2. Consider multiple perspectives
3. Provide clear, structured reasoning
4. Draw actionable conclusions

Topic: ${topic}

Context:
${context}`;

  return createSubagent('analysis', systemPrompt, {
    model: getModelForTask('analysis')
  });
}
