# Task Queue Module

Background job processing system for Static Rebel.

## Features

- **Persistent Storage**: SQLite-backed job queue
- **Worker Pool**: Parallel job execution
- **Priority Queues**: Critical, high, normal, low
- **Retry Logic**: Exponential backoff on failure
- **Job Dependencies**: Chain jobs together
- **Cron Scheduling**: Schedule jobs with cron expressions
- **Progress Tracking**: Real-time job progress updates

## Quick Start

```javascript
import { createTaskQueue } from './lib/task-queue/index.js';

const queue = await createTaskQueue({
  maxWorkers: 4,
  persistencePath: '~/.static-rebel/task-queue.db',
});

// Enqueue a job
const jobId = await queue.enqueue('notification', {
  title: 'Hello',
  message: 'Task completed!',
}, {
  priority: 'high',
  delay: 5000,  // Run in 5 seconds
  dependencies: ['job-id-1', 'job-id-2'],
});

// Listen for events
queue.on('job:completed', ({ jobId }) => {
  console.log(`Job ${jobId} completed!`);
});

queue.on('job:failed', ({ jobId, error }) => {
  console.error(`Job ${jobId} failed:`, error);
});

// Get status
const stats = queue.getStats();
console.log(stats);

// Shutdown
await queue.shutdown();
```

## Built-in Job Types

| Type | Description |
|------|-------------|
| `notification` | Send macOS notification |
| `email` | Send email via Gmail |
| `webhook` | HTTP webhook call |
| `shell` | Run shell command |
| `download` | Download file |
| `file_process` | Process file (compress, minify, hash) |
| `backup` | Create backup |
| `sync` | Sync directories |
| `ai_inference` | AI model inference |
| `report` | Generate analytics report |
| `cleanup` | Clean up old files |
| `health_check` | System health check |
| `slack` | Send Slack message |
| `discord` | Send Discord message |
| `sleep` | Wait/sleep |

## Scheduling

```javascript
import { createTaskScheduler } from './lib/task-queue/scheduler.js';

const scheduler = createTaskScheduler({ taskQueue: queue });
scheduler.start();

// Create a scheduled job
await scheduler.create({
  name: 'Daily Report',
  cron: '0 9 * * *',  // 9 AM daily
  jobType: 'report',
  payload: { type: 'Daily', data: {} },
});

// List schedules
const schedules = scheduler.getUpcoming(10);
```

## Cron Expressions

```
 ┌───────────── minute (0 - 59)
 │ ┌───────────── hour (0 - 23)
 │ │ ┌───────────── day of month (1 - 31)
 │ │ │ ┌───────────── month (1 - 12)
 │ │ │ │ ┌───────────── day of week (0 - 6)
 │ │ │ │ │
 * * * * *
```

Examples:
- `* * * * *` - Every minute
- `0 9 * * *` - 9 AM daily
- `0 0 * * 0` - Midnight every Sunday
- `30 14 * * 1-5` - 2:30 PM weekdays
- `0 */2 * * *` - Every 2 hours

## API Reference

### TaskQueue

| Method | Description |
|--------|-------------|
| `initialize()` | Initialize queue and workers |
| `enqueue(type, payload, options)` | Add job to queue |
| `cancelJob(jobId)` | Cancel pending job |
| `retryJob(jobId)` | Retry failed job |
| `getJob(jobId)` | Get job details |
| `getJobs(filters)` | List jobs with filters |
| `getStats()` | Get queue statistics |
| `shutdown()` | Graceful shutdown |

### Scheduler

| Method | Description |
|--------|-------------|
| `create(options)` | Create scheduled job |
| `update(id, updates)` | Update schedule |
| `delete(id)` | Delete schedule |
| `enable(id)` | Enable schedule |
| `disable(id)` | Disable schedule |
| `get(id)` | Get schedule |
| `getAll()` | List all schedules |
| `getUpcoming(limit)` | Get upcoming runs |
| `getStats()` | Get scheduler stats |

## Options

```javascript
createTaskQueue({
  maxWorkers: 4,           // Parallel workers
  jobTimeout: 300000,      // 5 min timeout
  maxRetries: 3,           // Retry attempts
  retryDelay: 5000,        // Base delay (ms)
  persistencePath: '~/.static-rebel/task-queue.db',
  pollInterval: 1000,      // Poll frequency
});
```
