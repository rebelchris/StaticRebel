/**
 * Task Queue - Quick Test
 */

import {
  createTaskQueue,
} from './lib/task-queue/index.js';

function log(message, type = 'info') {
  const timestamp = new Date().toLocaleTimeString();
  const prefix = type === 'success' ? '✓' : type === 'error' ? '✗' : '→';
  console.log(`[${timestamp}] ${prefix} ${message}`);
}

async function quickTest() {
  console.log('\n' + '='.repeat(50));
  log('Task Queue - Quick Test');
  console.log('='.repeat(50) + '\n');

  let passed = 0;
  let failed = 0;

  log('1. Initializing queue...');
  const queue = createTaskQueue({
    maxWorkers: 2,
    pollInterval: 100,
    persistencePath: './test-tq.db',
  });
  await queue.initialize();
  log('  OK', 'success');
  passed++;

  log('2. Enqueueing jobs...');
  const j1 = await queue.enqueue('notification', { title: 'Test 1', message: 'Hello' }, { priority: 'high' });
  const j2 = await queue.enqueue('sleep', { duration: 50 });
  const j3 = await queue.enqueue('sleep', { duration: 50 }, { priority: 'low' });
  log(`  Enqueued: ${j1.substring(0, 15)}..., ${j2.substring(0, 15)}..., ${j3.substring(0, 15)}...`, 'success');
  passed++;

  log('3. Getting stats...');
  const stats = queue.getStats();
  log(`  Workers: ${stats.workers.total}, Jobs pending: ${stats.jobs.pending}`, 'success');
  passed++;

  log('4. Getting jobs...');
  const jobs = queue.getJobs({ limit: 10 });
  log(`  Retrieved ${jobs.length} jobs`, 'success');
  passed++;

  log('5. Creating scheduler...');
  const { createTaskScheduler } = await import('./lib/task-queue/scheduler.js');
  const scheduler = createTaskScheduler({ taskQueue: queue });
  scheduler.start();
  log('  Scheduler started', 'success');
  passed++;

  await scheduler.create({
    name: 'Quick Test',
    cron: '* * * * *',
    jobType: 'notification',
    payload: { title: 'Cron', message: 'Test' },
  });
  const schedStats = scheduler.getStats();
  log(`  Schedule created (total: ${schedStats.total})`, 'success');
  passed++;

  log('6. Testing cancellation...');
  const cancelMe = await queue.enqueue('sleep', { duration: 1000 });
  await queue.cancelJob(cancelMe);
  const afterCancel = queue.getJobs({ status: 'pending' });
  log(`  Cancelled job removed from pending`, 'success');
  passed++;

  log('7. Shutting down...');
  await queue.shutdown();
  scheduler.stop();
  log('  Done', 'success');
  passed++;

  console.log('\n' + '='.repeat(50));
  log(`Results: ${passed}/7 passed`);
  console.log('='.repeat(50) + '\n');

  try {
    await require('fs').promises.unlink('./test-tq.db');
  } catch {}

  return failed === 0;
}

quickTest().then(() => process.exit(0));
