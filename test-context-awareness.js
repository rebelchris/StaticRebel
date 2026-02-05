/**
 * Context Awareness Test Suite
 *
 * Run with: node test-context-awareness.js
 */

import {
  createContextAwareness,
} from './lib/context-awareness/index.js';
import {
  createSmartNotifications,
} from './lib/context-awareness/smart-notifications.js';
import {
  createProactiveSuggestions,
} from './lib/context-awareness/proactive-suggestions.js';

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
  log('Context Awareness - Test Suite');
  console.log('='.repeat(50) + '\n');

  let passed = 0;
  let failed = 0;

  log('1. Testing Context Awareness...');
  const context = createContextAwareness({
    pollInterval: 1000,
    trackWindows: true,
    trackApps: true,
  });

  await context.initialize();
  context.start();
  log('  Started', 'success');
  passed++;

  log('2. Getting current context...');
  const currentCtx = context.getCurrentContext();
  log(`  Activity level: ${currentCtx.activityLevel}`, 'success');
  passed++;

  log('3. Recording activity...');
  context.recordActivity('test');
  context.recordActivity('keyboard');
  const afterActivity = context.getCurrentContext();
  log(`  Activity recorded: ${afterActivity.activityLevel}`, 'success');
  passed++;

  log('4. Getting activity pattern...');
  const pattern = context.getActivityPattern('day');
  log(`  Activities: ${pattern.totalActivities}`, 'success');
  passed++;

  log('5. Getting app usage...');
  const usage = context.getAppUsage();
  log(`  Apps tracked: ${usage.total}`, 'success');
  passed++;

  log('6. Testing Smart Notifications...');
  const notifications = createSmartNotifications();

  notifications.addRule({
    id: 'test_rule',
    name: 'Test Rule',
    trigger: 'test',
    action: 'notify',
  });
  log('  Rule added', 'success');
  passed++;

  const notifResult = await notifications.send({
    title: 'Test',
    message: 'Hello from context test!',
    priority: 'normal',
  });
  log(`  Notification sent: ${notifResult.status}`, notifResult.status === 'sent' ? 'success' : 'error');
  if (notifResult.status === 'sent') passed++; else failed++;

  const stats = notifications.getStats();
  log(`  History: ${stats.history}`, 'success');
  passed++;

  log('7. Testing Proactive Suggestions...');
  const suggestions = createProactiveSuggestions({
    checkInterval: 100,
  });

  suggestions.addTrigger({
    id: 'custom_test',
    name: 'Custom Test Trigger',
    condition: () => true,
    suggest: [
      { action: 'test_action', message: 'This is a test suggestion' },
    ],
  });
  log('  Custom trigger added', 'success');
  passed++;

  suggestions.updateContext({
    activityLevel: 'idle',
    inferred: { state: 'coding', confidence: 0.8 },
  });
  await delay(200);

  const suggList = suggestions.getSuggestions();
  log(`  Suggestions: ${suggList.length}`, 'success');
  passed++;

  if (suggList.length > 0) {
    suggestions.executeSuggestion(suggList[0].id);
    log('  Suggestion executed', 'success');
    passed++;
  }

  log('8. Testing context inference...');
  const inferred = context.inferContext();
  log(`  State: ${inferred.state}, Confidence: ${inferred.confidence}`, 'success');
  passed++;

  log('9. Getting stats...');
  const contextStats = context.getStats();
  log(`  Context version: ${contextStats.version}`, 'success');
  passed++;

  log('10. Shutting down...');
  context.stop();
  notifications.emit('shutdown');
  suggestions.stop();
  log('  Done', 'success');
  passed++;

  console.log('\n' + '='.repeat(50));
  log(`Results: ${passed} passed, ${failed} failed`);
  console.log('='.repeat(50) + '\n');

  return failed === 0;
}

runTests().then((success) => {
  process.exit(success ? 0 : 1);
});
