// Background Worker System - For long-running tasks
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';
import { Worker } from 'worker_threads';
import { EventEmitter } from 'events';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CONFIG_DIR = path.join(os.homedir(), '.static-rebel');
const WORKER_DIR = path.join(CONFIG_DIR, 'workers');
const TASKS_DIR = path.join(CONFIG_DIR, 'tasks');
const WORKER_LOG_DIR = path.join(CONFIG_DIR, 'logs');

// Task statuses
export const TaskStatus = {
  PENDING: 'pending',
  RUNNING: 'running',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
};

// Task queue
let taskQueue = new Map();
let activeWorkers = new Map(); // Map of taskId -> { worker, threadId, startTime, stats }
let maxWorkers = 2;
let isRunning = false;

// Event emitter for worker lifecycle events
const workerEvents = new EventEmitter();

// Initialize worker system
export function initWorkerSystem() {
  const dirs = [WORKER_DIR, TASKS_DIR, WORKER_LOG_DIR];
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  // Load pending tasks
  loadPendingTasks();
}

// Set max concurrent workers
export function setMaxWorkers(count) {
  maxWorkers = Math.max(1, Math.min(count, 10));
  return { maxWorkers };
}

// Create a new task
export function createTask(config) {
  const task = {
    id: uuidv4().slice(0, 8),
    name: config.name || 'Untitled Task',
    type: config.type || 'general',
    payload: config.payload || {},
    priority: config.priority || 'normal', // low, normal, high, urgent
    status: TaskStatus.PENDING,
    createdAt: new Date().toISOString(),
    startedAt: null,
    completedAt: null,
    result: null,
    error: null,
    progress: 0,
    subtasks: config.subtasks || [],
  };

  // Save task to disk
  saveTask(task);
  taskQueue.set(task.id, task);

  // Trigger worker if available
  processQueue();

  return task;
}

// Save task to disk
function saveTask(task) {
  const taskFile = path.join(TASKS_DIR, `${task.id}.json`);
  fs.writeFileSync(taskFile, JSON.stringify(task, null, 2));
}

// Load pending tasks
function loadPendingTasks() {
  try {
    const files = fs.readdirSync(TASKS_DIR).filter((f) => f.endsWith('.json'));
    for (const file of files) {
      const task = JSON.parse(
        fs.readFileSync(path.join(TASKS_DIR, file), 'utf-8'),
      );
      if (
        task.status === TaskStatus.PENDING ||
        task.status === TaskStatus.RUNNING
      ) {
        taskQueue.set(task.id, task);
      }
    }
  } catch (e) {}
}

// Get task by ID
export function getTask(taskId) {
  return taskQueue.get(taskId) || null;
}

// Get all tasks
export function getAllTasks() {
  return Array.from(taskQueue.values()).sort(
    (a, b) => new Date(b.createdAt) - new Date(a.createdAt),
  );
}

// Get tasks by status
export function getTasksByStatus(status) {
  return Array.from(taskQueue.values()).filter((t) => t.status === status);
}

// Update task
function updateTask(taskId, updates) {
  const task = taskQueue.get(taskId);
  if (task) {
    Object.assign(task, updates);
    saveTask(task);
  }
  return task;
}

// Cancel a task
export function cancelTask(taskId) {
  const task = taskQueue.get(taskId);
  if (task && task.status === TaskStatus.PENDING) {
    updateTask(taskId, {
      status: TaskStatus.CANCELLED,
      completedAt: new Date().toISOString(),
    });
    return { success: true, task };
  }
  return { success: false, error: 'Task cannot be cancelled' };
}

// Process the task queue
function processQueue() {
  if (isRunning) return;
  isRunning = true;

  const runWorker = () => {
    // Find highest priority pending task
    const priorities = ['urgent', 'high', 'normal', 'low'];
    let taskToRun = null;

    for (const priority of priorities) {
      const tasks = getTasksByStatus(TaskStatus.PENDING)
        .filter((t) => t.priority === priority)
        .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

      if (tasks.length > 0) {
        taskToRun = tasks[0];
        break;
      }
    }

    if (!taskToRun) {
      isRunning = false;
      return;
    }

    // Run the task
    runTaskWorker(taskToRun).then(() => {
      runWorker();
    });
  };

  runWorker();
}

// Run a task in a worker thread
async function runTaskWorker(task) {
  updateTask(task.id, {
    status: TaskStatus.RUNNING,
    startedAt: new Date().toISOString(),
  });

  // Check if subtasks exist - run as project
  if (task.subtasks.length > 0) {
    return runProjectTask(task);
  }

  // Create worker script
  const workerCode = `
    const { parentPort, workerData } = require('worker_threads');

    async function executeTask() {
      const { type, payload } = workerData;

      switch (type) {
        case 'research':
          // Simulated research task
          await new Promise(r => setTimeout(r, 5000));
          return { findings: \`Research on \${payload.topic || 'unknown topic'}\`, completed: true };

        case 'code':
          // Code execution
          return { executed: true, output: \`Executed code for \${payload.description || 'task'}\` };

        case 'websearch':
          // Web search task
          await new Promise(r => setTimeout(r, 3000));
          return { results: \`Search results for \${payload.query}\`, count: 5 };

        case 'process':
          // General processing
          return { processed: true, result: payload.data };

        default:
          // Generic task
          await new Promise(r => setTimeout(r, 2000));
          return { completed: true, type };
      }
    }

    executeTask()
      .then(result => parentPort.postMessage({ success: true, result }))
      .catch(error => parentPort.postMessage({ success: false, error: error.message }));
  `;

  const workerScript = path.join(WORKER_DIR, `worker-${task.id}.js`);
  fs.writeFileSync(workerScript, workerCode);

  return new Promise((resolve) => {
    const worker = new Worker(workerScript, {
      workerData: { type: task.type, payload: task.payload },
    });

    // Track active worker with real-time metadata
    const workerInfo = {
      worker,
      threadId: worker.threadId,
      taskId: task.id,
      taskType: task.type,
      taskName: task.name,
      startTime: Date.now(),
      startTimeISO: new Date().toISOString(),
      stats: {
        memoryUsage: null,
        lastUpdate: Date.now(),
      },
    };

    activeWorkers.set(task.id, workerInfo);
    workerEvents.emit('worker:started', {
      taskId: task.id,
      threadId: worker.threadId,
    });

    // Monitor worker health periodically
    const healthInterval = setInterval(() => {
      if (activeWorkers.has(task.id)) {
        const info = activeWorkers.get(task.id);
        info.stats.lastUpdate = Date.now();
      }
    }, 5000);

    worker.on('message', (message) => {
      clearInterval(healthInterval);

      // Remove from active workers
      activeWorkers.delete(task.id);
      workerEvents.emit('worker:completed', {
        taskId: task.id,
        threadId: worker.threadId,
        success: message.success,
      });

      // Cleanup
      try {
        fs.unlinkSync(workerScript);
        worker.terminate();
      } catch (e) {}

      if (message.success) {
        updateTask(task.id, {
          status: TaskStatus.COMPLETED,
          completedAt: new Date().toISOString(),
          result: message.result,
          progress: 100,
        });
      } else {
        updateTask(task.id, {
          status: TaskStatus.FAILED,
          completedAt: new Date().toISOString(),
          error: message.error,
        });
      }
      resolve();
    });

    worker.on('error', (error) => {
      clearInterval(healthInterval);

      // Remove from active workers
      activeWorkers.delete(task.id);
      workerEvents.emit('worker:error', {
        taskId: task.id,
        threadId: worker.threadId,
        error: error.message,
      });

      // Cleanup
      try {
        fs.unlinkSync(workerScript);
        worker.terminate();
      } catch (e) {}

      updateTask(task.id, {
        status: TaskStatus.FAILED,
        completedAt: new Date().toISOString(),
        error: error.message,
      });
      resolve();
    });

    worker.on('exit', (code) => {
      if (code !== 0 && activeWorkers.has(task.id)) {
        clearInterval(healthInterval);
        activeWorkers.delete(task.id);
        workerEvents.emit('worker:exit', {
          taskId: task.id,
          threadId: worker.threadId,
          exitCode: code,
        });

        try {
          fs.unlinkSync(workerScript);
        } catch (e) {}

        updateTask(task.id, {
          status: TaskStatus.FAILED,
          completedAt: new Date().toISOString(),
          error: `Worker exited with code ${code}`,
        });
        resolve();
      }
    });
  });
}

// Run a project task with subtasks
async function runProjectTask(task) {
  const todoContent = `# ${task.name}

Created: ${task.createdAt}
Status: In Progress

## Progress
- [ ] In Progress
- [x] Created

## Subtasks

`;

  let completedSubtasks = 0;

  for (let i = 0; i < task.subtasks.length; i++) {
    const subtask = task.subtasks[i];
    updateTask(task.id, {
      progress: Math.round((completedSubtasks / task.subtasks.length) * 100),
    });

    // Create subtask
    const subtaskResult = await createSubtask(subtask, task.id);

    if (subtaskResult.success) {
      completedSubtasks++;
    }
  }

  updateTask(task.id, {
    status: TaskStatus.COMPLETED,
    completedAt: new Date().toISOString(),
    result: {
      subtasksCompleted: completedSubtasks,
      total: task.subtasks.length,
    },
    progress: 100,
  });

  return { success: true };
}

// Run a single subtask
async function createSubtask(subtask, parentId) {
  const subTask = createTask({
    name: subtask.name,
    type: subtask.type || 'process',
    payload: subtask.payload || {},
    priority: subtask.priority || 'normal',
  });

  // Poll for completion
  return new Promise((resolve) => {
    const checkInterval = setInterval(() => {
      const task = getTask(subTask.id);
      if (
        task &&
        (task.status === TaskStatus.COMPLETED ||
          task.status === TaskStatus.FAILED)
      ) {
        clearInterval(checkInterval);
        resolve({ success: task.status === TaskStatus.COMPLETED, task });
      }
    }, 1000);
  });
}

// Generate TODO.md for a project
export function generateTodoMd(projectName, subtasks, options = {}) {
  const {
    includeProgress = true,
    includeMetadata = true,
    includeResources = true,
  } = options;

  let content = `# ${projectName}

`;

  if (includeMetadata) {
    content += `**Created:** ${new Date().toLocaleDateString()}
**Status:** Planning

`;
  }

  content += `## Overview

`;

  if (includeProgress) {
    content += `## Progress

- [ ] Not Started
- [ ] In Progress
- [ ] Completed

`;
  }

  content += `## Tasks

`;

  let taskNum = 1;
  for (const task of subtasks) {
    const status = task.status === 'completed' ? 'x' : ' ';
    content += `- [${status}] ${taskNum++}. ${task.name}`;
    if (task.description) {
      content += `\n  - *${task.description}*`;
    }
    if (task.dependencies && task.dependencies.length > 0) {
      content += `\n  - Depends on: ${task.dependencies.join(', ')}`;
    }
    content += '\n';
  }

  if (includeResources) {
    content += `

## Resources

- Links and references
- Notes

## Notes

`;
  }

  return content;
}

// Schedule a task for later
export function scheduleTask(config, scheduledTime) {
  const task = createTask({
    ...config,
    scheduledFor: scheduledTime,
  });

  return { task, scheduledFor: scheduledTime };
}

// Retry a failed task
export function retryTask(taskId) {
  const task = getTask(taskId);
  if (task && task.status === TaskStatus.FAILED) {
    return createTask({
      name: task.name,
      type: task.type,
      payload: task.payload,
      priority: task.priority,
      subtasks: task.subtasks,
    });
  }
  return null;
}

// Get worker statistics
export function getWorkerStats() {
  const tasks = Array.from(taskQueue.values());
  const activeWorkerList = getActiveWorkers();
  return {
    totalTasks: tasks.length,
    pending: tasks.filter((t) => t.status === TaskStatus.PENDING).length,
    running: tasks.filter((t) => t.status === TaskStatus.RUNNING).length,
    completed: tasks.filter((t) => t.status === TaskStatus.COMPLETED).length,
    failed: tasks.filter((t) => t.status === TaskStatus.FAILED).length,
    maxWorkers,
    activeWorkers: activeWorkerList.length,
    workerDetails: activeWorkerList,
  };
}

// Get currently active workers with real-time info
export function getActiveWorkers() {
  const now = Date.now();
  return Array.from(activeWorkers.values()).map((info) => ({
    taskId: info.taskId,
    taskName: info.taskName,
    taskType: info.taskType,
    threadId: info.threadId,
    startTime: info.startTimeISO,
    duration: now - info.startTime,
    lastUpdate: info.stats.lastUpdate,
    healthy: now - info.stats.lastUpdate < 10000, // Healthy if updated in last 10s
  }));
}

// Get a specific active worker by task ID
export function getActiveWorker(taskId) {
  const info = activeWorkers.get(taskId);
  if (!info) return null;

  const now = Date.now();
  return {
    taskId: info.taskId,
    taskName: info.taskName,
    taskType: info.taskType,
    threadId: info.threadId,
    startTime: info.startTimeISO,
    duration: now - info.startTime,
    lastUpdate: info.stats.lastUpdate,
    healthy: now - info.stats.lastUpdate < 10000,
  };
}

// Subscribe to worker lifecycle events
export function onWorkerEvent(event, callback) {
  workerEvents.on(event, callback);
}

// Force terminate a running worker
export function terminateWorker(taskId) {
  const info = activeWorkers.get(taskId);
  if (!info) {
    return { success: false, error: 'Worker not found' };
  }

  try {
    info.worker.terminate();
    activeWorkers.delete(taskId);
    updateTask(taskId, {
      status: TaskStatus.FAILED,
      completedAt: new Date().toISOString(),
      error: 'Worker terminated by user',
    });
    workerEvents.emit('worker:terminated', { taskId, threadId: info.threadId });
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// Cleanup old completed tasks
export function cleanupTasks(olderThanDays = 7) {
  const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000);
  let cleaned = 0;

  for (const [taskId, task] of taskQueue) {
    if (
      task.status === TaskStatus.COMPLETED &&
      new Date(task.completedAt) < cutoff
    ) {
      const taskFile = path.join(TASKS_DIR, `${taskId}.json`);
      try {
        fs.unlinkSync(taskFile);
        taskQueue.delete(taskId);
        cleaned++;
      } catch (e) {}
    }
  }

  return { cleaned };
}
