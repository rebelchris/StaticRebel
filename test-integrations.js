/**
 * Integration Test Suite - All modules together
 *
 * Run with: node test-integrations.js
 */

import {
  createOrchestrator,
} from './lib/integrations/orchestrator.js';
import {
  createVoiceCommandParser,
} from './lib/integrations/voice-command.js';
import {
  createHabitTracker,
} from './lib/integrations/habit-tracker.js';
import {
  createAPIServer,
} from './lib/integrations/api-server.js';

function log(message, type = 'info') {
  const timestamp = new Date().toLocaleTimeString();
  const prefix = type === 'success' ? '✓' : type === 'error' ? '✗' : '→';
  console.log(`[${timestamp}] ${prefix} ${message}`);
}

async function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runTests() {
  console.log('\n' + '='.repeat(50));
  log('Integration Test Suite');
  console.log('='.repeat(50) + '\n');

  let passed = 0;
  let failed = 0;

  log('1. Testing Voice Command Parser...');
  const parser = createVoiceCommandParser();

  const tests = [
    { cmd: 'launch safari', intent: 'launch' },
    { cmd: 'close chrome', intent: 'quit' },
    { cmd: 'notify me to take a break', intent: 'notify' },
    { cmd: 'run npm test', intent: 'execute' },
    { cmd: 'what is the weather', intent: 'query' },
  ];

  for (const test of tests) {
    const result = parser.parse(test.cmd);
    if (result.intent === test.intent) {
      passed++;
    } else {
      log(`  "${test.cmd}" -> ${result.intent} (expected ${test.intent})`, 'error');
      failed++;
    }
  }
  log(`  Parser tests: ${tests.length - failed}/${tests.length}`, failed === 0 ? 'success' : 'error');

  log('2. Testing entity extraction...');
  const withEntities = parser.parse('remind me at 3pm tomorrow');
  if (withEntities.entities.time?.length > 0) {
    passed++;
    log('  Time extracted: ' + withEntities.entities.time[0], 'success');
  } else {
    failed++;
    log('  Time extraction failed', 'error');
  }

  log('3. Testing Habit Tracker...');
  const habits = createHabitTracker();
  await habits.initialize();

  habits.track('app_launch', { app: 'Safari' });
  habits.track('app_launch', { app: 'Safari' });
  habits.track('command_run', { command: 'ls' });
  habits.track('app_quit', { app: 'Safari' });

  const habitList = habits.getHabits({ limit: 10 });
  log(`  Tracked ${habitList.length} habits`, habitList.length >= 2 ? 'success' : 'error');
  if (habitList.length >= 2) passed++; else failed++;

  const prediction = habits.predictNextAction();
  log(`  Prediction: ${prediction?.action || 'none'}`, prediction ? 'success' : 'error');
  if (prediction) passed++; else failed++;

  const habitStats = habits.getStats();
  log(`  Stats: ${habitStats.totalHabits} habits`, 'success');
  passed++;

  log('4. Testing Orchestrator initialization...');
  const orchestrator = createOrchestrator({
    computerAutomation: false,
    taskQueue: false,
    contextAwareness: false,
    wakeWord: false,
    notifications: true,
    suggestions: false,
  });

  await orchestrator.initialize();
  log('  Orchestrator initialized', 'success');
  passed++;

  log('5. Testing orchestrator commands...');
  const cmdTests = [
    'launch Safari',
    'close Chrome',
    'status',
    'help',
  ];

  for (const cmd of cmdTests) {
    const result = await orchestrator.processCommand(cmd);
    log(`  "${cmd}" -> ${result.success ? 'OK' : 'FAIL'}`, result.success ? 'success' : 'error');
    if (result.success) passed++; else failed++;
  }

  log('6. Testing orchestrator status...');
  const status = orchestrator.getFullStatus();
  log(`  Version: ${status.version}`, status.version === '1.0.0' ? 'success' : 'error');
  if (status.version === '1.0.0') passed++; else failed++;
  log(`  Modules: ${Object.keys(status.modules).join(', ') || 'none'}`, 'success');
  passed++;

  log('7. Testing API Server...');
  const server = createAPIServer({
    orchestrator,
  });

  await server.start();
  log('  API Server started on port ' + server.options.port, 'success');
  passed++;

  const http = await import('http');
  const testReq = (path) => new Promise((resolve) => {
    http.get(`http://localhost:${server.options.port}${path}`, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, data }));
    }).on('error', () => resolve({ status: 0 }));
  });

  const statusRes = await testReq('/status');
  if (statusRes.status === 200) {
    log('  /status endpoint OK', 'success');
    passed++;
  } else {
    log('  /status endpoint FAIL', 'error');
    failed++;
  }

  const cmdRes = await new Promise((resolve) => {
    const req = http.request({
      hostname: 'localhost',
      port: server.options.port,
      path: '/command',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, data }));
    });
    req.write(JSON.stringify({ command: 'status' }));
    req.end();
  });

  if (cmdRes.status === 200) {
    log('  /command endpoint OK', 'success');
    passed++;
  } else {
    log('  /command endpoint FAIL', 'error');
    failed++;
  }

  log('8. Stopping server...');
  await server.stop();
  log('  Server stopped', 'success');
  passed++;

  log('9. Stopping orchestrator...');
  await orchestrator.stop();
  log('  Orchestrator stopped', 'success');
  passed++;

  console.log('\n' + '='.repeat(50));
  log(`Results: ${passed} passed, ${failed} failed`);
  console.log('='.repeat(50) + '\n');

  return failed === 0;
}

runTests().then((success) => {
  process.exit(success ? 0 : 1);
});
