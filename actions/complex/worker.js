/**
 * Worker Action
 * Background workers and project management
 */

import fs from 'fs';
import path from 'path';

export default {
  name: 'worker',
  displayName: 'Background Workers',
  description:
    'Create background tasks, manage projects, and generate TODO.md files',
  category: 'utility',
  version: '1.0.0',

  intentExamples: [
    'run in background',
    'run a background task',
    'long running task',
    'create a project',
    'project management',
    'background task',
    'async task',
    'subtask',
    'todo.md',
    'task queue',
    'create project',
  ],

  parameters: {
    action: {
      type: 'enum',
      values: ['create', 'background', 'stats'],
      description: 'Worker action to perform',
    },
    projectName: {
      type: 'string',
      description: 'Name of the project to create',
    },
  },

  dependencies: [
    'workerManager.createTask',
    'workerManager.getAllTasks',
    'workerManager.getWorkerStats',
    'workerManager.generateTodoMd',
  ],

  async handler(input, context, params) {
    const { createTask, getAllTasks, getWorkerStats, generateTodoMd } =
      context.modules.workerManager;

    const lower = input.toLowerCase();

    // Create project with TODO.md
    if (/create (a )?project/i.test(lower)) {
      const projectName =
        input.replace(/create|a|project/i, '').trim() || 'New Project';

      const task = createTask({
        name: projectName,
        type: 'project',
        payload: { description: input },
        subtasks: [
          { name: 'Set up project structure', type: 'process' },
          { name: 'Research dependencies', type: 'research' },
          { name: 'Implement core features', type: 'code' },
          { name: 'Write tests', type: 'process' },
          { name: 'Documentation', type: 'process' },
        ],
      });

      // Generate TODO.md
      const todoContent = generateTodoMd(projectName, task.subtasks);
      const todoPath = path.join(process.cwd(), 'TODO.md');
      fs.writeFileSync(todoPath, todoContent);

      return (
        `✅ Created project "${projectName}"!\n\n` +
        `- Background task created: ${task.id}\n` +
        `- TODO.md generated at: ${todoPath}\n` +
        `- Subtasks: ${task.subtasks.length}`
      );
    }

    // Create background task
    if (/run (in |a )?background|async/i.test(lower)) {
      const taskName =
        input
          .replace(/run|in|background|async|long|running|task/i, '')
          .trim() || 'Background Task';
      const taskType = /research/i.test(lower)
        ? 'research'
        : /code|build/i.test(lower)
          ? 'code'
          : 'process';

      const task = createTask({
        name: taskName,
        type: taskType,
        payload: { description: input },
        priority: 'normal',
      });

      return (
        `✅ Started background task: **${task.name}**\n` +
        `- Task ID: ${task.id}\n` +
        `- Status: ${task.status}\n` +
        `Check back later for results!`
      );
    }

    // Show worker stats
    const stats = getWorkerStats();
    return (
      `**Background Workers Stats:**\n\n` +
      `Pending: ${stats.pending}\n` +
      `Running: ${stats.running}\n` +
      `Completed: ${stats.completed}\n` +
      `Failed: ${stats.failed}\n` +
      `Max Workers: ${stats.maxWorkers}\n\n` +
      `Say "create a project" to start a new project with TODO.md generation.`
    );
  },

  source: 'builtin',
  enabled: true,
  createdAt: '2026-01-29',
};
