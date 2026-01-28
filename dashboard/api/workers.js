// Workers API - Task queue endpoints
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

let workerManager;

async function loadModules() {
  if (workerManager) return;
  try {
    const workerPath = path.join(__dirname, '..', '..', 'lib', 'workerManager.js');
    const module = await import(workerPath);
    workerManager = module;
  } catch (error) {
    console.error('Error loading worker module:', error.message);
  }
}

// Get all tasks
router.get('/', async (req, res) => {
  try {
    await loadModules();

    if (!workerManager?.getAllTasks) {
      return res.json({ tasks: [], stats: {} });
    }

    const tasks = workerManager.getAllTasks();
    const stats = workerManager.getWorkerStats?.() || {};

    res.json({ tasks, stats });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get task by ID
router.get('/:id', async (req, res) => {
  try {
    await loadModules();

    const { id } = req.params;

    if (!workerManager?.getTask) {
      return res.status(404).json({ error: 'Task not found' });
    }

    const task = workerManager.getTask(id);

    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    res.json({ task });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get task statistics
router.get('/stats', async (req, res) => {
  try {
    await loadModules();

    if (!workerManager?.getWorkerStats) {
      return res.json({ totalTasks: 0, pending: 0, running: 0, completed: 0, failed: 0 });
    }

    const stats = workerManager.getWorkerStats();
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create a new task
router.post('/', async (req, res) => {
  try {
    await loadModules();

    const { name, type = 'general', payload = {}, priority = 'normal', subtasks = [] } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Task name is required' });
    }

    if (!workerManager?.createTask) {
      return res.status(500).json({ error: 'Worker system not available' });
    }

    const task = workerManager.createTask({
      name,
      type,
      payload,
      priority,
      subtasks
    });

    req.app.locals.broadcast?.('taskCreated', { task });
    res.json({ task });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Cancel a task
router.post('/:id/cancel', async (req, res) => {
  try {
    await loadModules();

    const { id } = req.params;

    if (!workerManager?.cancelTask) {
      return res.status(500).json({ error: 'Worker system not available' });
    }

    const result = workerManager.cancelTask(id);

    if (result.success) {
      req.app.locals.broadcast?.('taskCancelled', result);
      res.json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Retry a failed task
router.post('/:id/retry', async (req, res) => {
  try {
    await loadModules();

    const { id } = req.params;

    if (!workerManager?.retryTask) {
      return res.status(500).json({ error: 'Worker system not available' });
    }

    const newTask = workerManager.retryTask(id);

    if (newTask) {
      req.app.locals.broadcast?.('taskRetried', { task: newTask });
      res.json({ task: newTask });
    } else {
      res.status(400).json({ error: 'Task cannot be retried' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Generate TODO.md for project
router.post('/todo', async (req, res) => {
  try {
    await loadModules();

    const { projectName, subtasks, options = {} } = req.body;

    if (!projectName || !subtasks || subtasks.length === 0) {
      return res.status(400).json({ error: 'Project name and subtasks are required' });
    }

    if (!workerManager?.generateTodoMd) {
      return res.status(500).json({ error: 'Worker system not available' });
    }

    const content = workerManager.generateTodoMd(projectName, subtasks, options);
    res.json({ content });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Cleanup old tasks
router.post('/cleanup', async (req, res) => {
  try {
    await loadModules();

    const { olderThanDays = 7 } = req.body;

    if (!workerManager?.cleanupTasks) {
      return res.status(500).json({ error: 'Worker system not available' });
    }

    const result = workerManager.cleanupTasks(olderThanDays);

    req.app.locals.broadcast?.('tasksCleaned', result);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get tasks by status
router.get('/filter/:status', async (req, res) => {
  try {
    await loadModules();

    const { status } = req.params;

    if (!workerManager?.getTasksByStatus) {
      return res.json({ tasks: [] });
    }

    const tasks = workerManager.getTasksByStatus(status);
    res.json({ tasks });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
