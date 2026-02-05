/**
 * Computer Automation Test Suite - Fast Version
 */

import {
  createComputerAutomation,
  createAppleScriptExecutor,
  createAppController,
  createFileAutomation,
  createClipboardManager,
} from './lib/computer-automation/index.js';

function log(message, type = 'info') {
  const timestamp = new Date().toLocaleTimeString();
  const prefix = type === 'success' ? '✓' : type === 'error' ? '✗' : '→';
  console.log(`[${timestamp}] ${prefix} ${message}`);
}

async function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fastTests() {
  console.log('\n' + '='.repeat(50));
  log('Computer Automation - Fast Test Suite');
  console.log('='.repeat(50) + '\n');

  let passed = 0;
  let failed = 0;

  log('1. File Operations...');
  const files = createFileAutomation();
  const testDir = './test-auto-temp';
  const testFile = `${testDir}/test.txt`;

  await files.createDirectory(testDir);
  const write = await files.write(testFile, `Test ${Date.now()}`);
  log(`  write: ${write.success ? 'OK' : 'FAIL'}`, write.success ? 'success' : 'error');
  if (write.success) passed++; else failed++;

  const read = await files.read(testFile);
  log(`  read: ${read.success ? 'OK' : 'FAIL'}`, read.success ? 'success' : 'error');
  if (read.success) passed++; else failed++;

  await files.delete(testFile);
  await files.delete(testDir);

  log('2. Clipboard...');
  const clipboard = createClipboardManager();
  const clipWrite = await clipboard.write(`Test ${Date.now()}`, 'text');
  log(`  write: ${clipWrite.success ? 'OK' : 'FAIL'}`, clipWrite.success ? 'success' : 'error');
  if (clipWrite.success) passed++; else failed++;

  const clipRead = await clipboard.read();
  log(`  read: ${clipRead.success ? 'OK' : 'FAIL'}`, clipRead.success ? 'success' : 'error');
  if (clipRead.success) passed++; else failed++;

  log('3. App Controller...');
  const apps = createAppController({ timeout: 3000 });
  const running = await apps.getRunningApplications();
  log(`  get apps: ${running.success ? `OK (${running.applications.length} apps)` : 'FAIL'}`, running.success ? 'success' : 'error');
  if (running.success) passed++; else failed++;

  log('4. AppleScript...');
  const executor = createAppleScriptExecutor({ timeout: 3000 });
  const notif = await executor.execute('display notification "Test" with title "Quick"');
  log(`  notification: ${notif.success ? 'OK' : 'FAIL'}`, notif.success ? 'success' : 'error');
  if (notif.success) passed++; else failed++;

  log('5. Main Module...');
  const auto = createComputerAutomation({ requireConfirmation: false });
  const status = auto.getStatus();
  log(`  status: ${status.version ? `OK (v${status.version})` : 'FAIL'}`, status.version ? 'success' : 'error');
  if (status.version) passed++; else failed++;

  const fileAction = await auto.executeAction({
    type: 'file_write',
    path: './test-auto-fast.txt',
    content: 'Fast test',
  });
  log(`  file action: ${fileAction.status === 'success' ? 'OK' : 'FAIL'}`, fileAction.status === 'success' ? 'success' : 'error');
  if (fileAction.status === 'success') passed++; else failed++;

  await files.delete('./test-auto-fast.txt');

  console.log('\n' + '='.repeat(50));
  log(`Results: ${passed}/5 passed`);
  failed > 0 && log(`${failed} failed`, 'error');
  console.log('='.repeat(50) + '\n');

  return failed === 0;
}

fastTests().then((success) => {
  process.exit(success ? 0 : 1);
});
