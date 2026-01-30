import { NextRequest, NextResponse } from 'next/server';

type TaskStatus = 'pending' | 'running' | 'completed' | 'failed';
type TaskType = 'general' | 'research' | 'code' | 'websearch' | 'process';
type TaskPriority = 'low' | 'normal' | 'high' | 'urgent';

interface Task {
  id: string;
  name: string;
  type: TaskType;
  status: TaskStatus;
  priority: TaskPriority;
  payload?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  completedAt?: string;
  error?: string;
  result?: unknown;
}

// In-memory storage for tasks (in production, this would be a database or job queue)
let tasks: Task[] = [];

// GET /api/workers - Get all tasks with optional filter
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const filter = searchParams.get('filter') as TaskStatus | 'all' | null;

    let filteredTasks = tasks;
    if (filter && filter !== 'all') {
      filteredTasks = tasks.filter((t) => t.status === filter);
    }

    // Sort by created date, newest first
    filteredTasks.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );

    const stats = {
      total: tasks.length,
      pending: tasks.filter((t) => t.status === 'pending').length,
      running: tasks.filter((t) => t.status === 'running').length,
      completed: tasks.filter((t) => t.status === 'completed').length,
      failed: tasks.filter((t) => t.status === 'failed').length,
    };

    return NextResponse.json({ tasks: filteredTasks, stats });
  } catch (error) {
    console.error('Failed to fetch tasks:', error);
    return NextResponse.json(
      { error: 'Failed to fetch tasks' },
      { status: 500 },
    );
  }
}

// POST /api/workers - Create new task
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, type, priority, payload } = body;

    if (!name) {
      return NextResponse.json(
        { error: 'Task name is required' },
        { status: 400 },
      );
    }

    const newTask: Task = {
      id: `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name,
      type: type || 'general',
      status: 'pending',
      priority: priority || 'normal',
      payload: payload || {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    tasks.push(newTask);

    // Simulate task processing (in production, this would be handled by a worker)
    processTask(newTask.id);

    return NextResponse.json({ task: newTask, success: true });
  } catch (error) {
    console.error('Failed to create task:', error);
    return NextResponse.json(
      { error: 'Failed to create task' },
      { status: 500 },
    );
  }
}

// PUT /api/workers - Update task status or retry
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, action, updates } = body;

    if (!id) {
      return NextResponse.json(
        { error: 'Task ID is required' },
        { status: 400 },
      );
    }

    const taskIndex = tasks.findIndex((t) => t.id === id);
    if (taskIndex === -1) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    if (action === 'retry' && tasks[taskIndex].status === 'failed') {
      tasks[taskIndex].status = 'pending';
      tasks[taskIndex].error = undefined;
      tasks[taskIndex].updatedAt = new Date().toISOString();
      processTask(id);
    } else if (updates) {
      tasks[taskIndex] = {
        ...tasks[taskIndex],
        ...updates,
        updatedAt: new Date().toISOString(),
      };
    }

    return NextResponse.json({ task: tasks[taskIndex], success: true });
  } catch (error) {
    console.error('Failed to update task:', error);
    return NextResponse.json(
      { error: 'Failed to update task' },
      { status: 500 },
    );
  }
}

// DELETE /api/workers - Delete task
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { error: 'Task ID is required' },
        { status: 400 },
      );
    }

    const taskIndex = tasks.findIndex((t) => t.id === id);
    if (taskIndex === -1) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    tasks.splice(taskIndex, 1);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to delete task:', error);
    return NextResponse.json(
      { error: 'Failed to delete task' },
      { status: 500 },
    );
  }
}

// Simulate task processing
async function processTask(taskId: string) {
  const task = tasks.find((t) => t.id === taskId);
  if (!task || task.status !== 'pending') return;

  // Update to running
  task.status = 'running';
  task.startedAt = new Date().toISOString();
  task.updatedAt = new Date().toISOString();

  // Simulate processing time based on priority
  const delay =
    task.priority === 'urgent'
      ? 2000
      : task.priority === 'high'
        ? 5000
        : task.priority === 'normal'
          ? 10000
          : 15000;

  setTimeout(() => {
    const currentTask = tasks.find((t) => t.id === taskId);
    if (!currentTask || currentTask.status !== 'running') return;

    // 90% success rate simulation
    const success = Math.random() > 0.1;

    if (success) {
      currentTask.status = 'completed';
      currentTask.result = { message: 'Task completed successfully' };
    } else {
      currentTask.status = 'failed';
      currentTask.error = 'Simulated task failure';
    }

    currentTask.completedAt = new Date().toISOString();
    currentTask.updatedAt = new Date().toISOString();
  }, delay);
}
