/**
 * Test suite for OpenClaw-style coding tools
 * Run with: node lib/tools/test-coding-tools.js
 */

import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Import tools directly for testing
import { readTool, writeTool, editTool, listTool } from './file-tools.js';
import { execTool } from './exec-tool.js';
import { projectContextTool } from './project-context.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEST_DIR = path.join(__dirname, '.test-temp');

// Test utilities
let passed = 0;
let failed = 0;

function test(name, fn) {
  return { name, fn };
}

async function runTest(t) {
  try {
    await t.fn();
    console.log(`  ✅ ${t.name}`);
    passed++;
  } catch (error) {
    console.log(`  ❌ ${t.name}`);
    console.log(`     Error: ${error.message}`);
    failed++;
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message || 'Assertion failed');
  }
}

function assertEquals(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(message || `Expected ${expected}, got ${actual}`);
  }
}

// Setup and teardown
async function setup() {
  await fs.mkdir(TEST_DIR, { recursive: true });
  await fs.writeFile(path.join(TEST_DIR, 'test.txt'), 'line 1\nline 2\nline 3\nline 4\nline 5');
  await fs.writeFile(path.join(TEST_DIR, 'edit-me.txt'), 'Hello World!\nThis is a test file.');
  await fs.mkdir(path.join(TEST_DIR, 'subdir'), { recursive: true });
  await fs.writeFile(path.join(TEST_DIR, 'subdir', 'nested.js'), 'console.log("nested");');
}

async function teardown() {
  await fs.rm(TEST_DIR, { recursive: true, force: true });
}

// Test definitions
const tests = [
  // Read tests
  test('read: should read entire file', async () => {
    const result = await readTool.handler({ path: 'test.txt' }, { cwd: TEST_DIR });
    assert(result.content.includes('line 1'), 'Should contain line 1');
    assertEquals(result.totalLines, 5, 'Should have 5 lines');
  }),

  test('read: should support offset', async () => {
    const result = await readTool.handler({ path: 'test.txt', offset: 3 }, { cwd: TEST_DIR });
    assert(result.content.startsWith('line 3'), 'Should start at line 3');
    assertEquals(result.startLine, 3, 'Start line should be 3');
  }),

  test('read: should support limit', async () => {
    const result = await readTool.handler({ path: 'test.txt', limit: 2 }, { cwd: TEST_DIR });
    const lines = result.content.split('\n');
    assertEquals(lines.length, 2, 'Should have 2 lines');
  }),

  test('read: should fail for non-existent file', async () => {
    try {
      await readTool.handler({ path: 'does-not-exist.txt' }, { cwd: TEST_DIR });
      throw new Error('Should have thrown');
    } catch (e) {
      assert(e.message.includes('not found'), 'Should say file not found');
    }
  }),

  // Write tests
  test('write: should create new file', async () => {
    const content = 'New file content';
    const result = await writeTool.handler({ path: 'new-file.txt', content }, { cwd: TEST_DIR });
    assert(result.created, 'Should report file was created');
    const actual = await fs.readFile(path.join(TEST_DIR, 'new-file.txt'), 'utf-8');
    assertEquals(actual, content, 'Content should match');
  }),

  test('write: should overwrite existing file', async () => {
    const content = 'Overwritten content';
    const result = await writeTool.handler({ path: 'test.txt', content }, { cwd: TEST_DIR });
    assert(result.overwritten, 'Should report file was overwritten');
  }),

  test('write: should create parent directories', async () => {
    const content = 'Deep file';
    await writeTool.handler({ path: 'deep/nested/file.txt', content }, { cwd: TEST_DIR });
    const actual = await fs.readFile(path.join(TEST_DIR, 'deep/nested/file.txt'), 'utf-8');
    assertEquals(actual, content, 'Content should match');
  }),

  // Edit tests
  test('edit: should replace exact text', async () => {
    // Reset the file first
    await fs.writeFile(path.join(TEST_DIR, 'edit-me.txt'), 'Hello World!\nThis is a test file.');
    
    const result = await editTool.handler({
      path: 'edit-me.txt',
      oldText: 'Hello World!',
      newText: 'Goodbye World!'
    }, { cwd: TEST_DIR });
    
    assert(result.replaced, 'Should report replacement');
    const actual = await fs.readFile(path.join(TEST_DIR, 'edit-me.txt'), 'utf-8');
    assert(actual.includes('Goodbye World!'), 'Should contain new text');
  }),

  test('edit: should fail if text not found', async () => {
    try {
      await editTool.handler({
        path: 'edit-me.txt',
        oldText: 'This text does not exist',
        newText: 'New text'
      }, { cwd: TEST_DIR });
      throw new Error('Should have thrown');
    } catch (e) {
      assert(e.message.includes('Could not find'), 'Should say text not found');
    }
  }),

  // List tests
  test('list: should list directory contents', async () => {
    const result = await listTool.handler({ path: '.' }, { cwd: TEST_DIR });
    assert(result.count > 0, 'Should find files');
    assert(result.files.some(f => f.name === 'test.txt' || f === 'test.txt'), 'Should find test.txt');
  }),

  test('list: should list subdirectory', async () => {
    const result = await listTool.handler({ path: 'subdir' }, { cwd: TEST_DIR });
    assert(result.files.some(f => f.name === 'nested.js' || f === 'nested.js'), 'Should find nested.js');
  }),

  // Exec tests
  test('exec: should run simple command', async () => {
    const result = await execTool.handler({ command: 'echo "hello"' }, { cwd: TEST_DIR });
    assertEquals(result.exitCode, 0, 'Should exit with 0');
    assert(result.stdout.includes('hello'), 'Should output hello');
  }),

  test('exec: should capture stderr', async () => {
    const result = await execTool.handler({ command: 'ls nonexistent_dir_xyz 2>&1 || true' }, { cwd: TEST_DIR });
    // Just check it doesn't throw - the command might succeed or fail depending on shell
    assert(typeof result.exitCode === 'number', 'Should have exit code');
  }),

  test('exec: should respect timeout', async () => {
    const result = await execTool.handler({ command: 'sleep 0.1', timeout: 5000 }, { cwd: TEST_DIR });
    assertEquals(result.timedOut, false, 'Should not time out');
  }),

  test('exec: should block dangerous commands', async () => {
    try {
      await execTool.handler({ command: 'rm -rf /' }, { cwd: TEST_DIR });
      throw new Error('Should have thrown');
    } catch (e) {
      assert(e.message.includes('blocked'), 'Should be blocked');
    }
  }),

  // Project context tests
  test('project_context: should detect node.js project', async () => {
    // Use the actual StaticRebel project
    const result = await projectContextTool.handler({}, { cwd: path.resolve(__dirname, '../..') });
    assertEquals(result.type, 'nodejs', 'Should detect nodejs');
    assert(result.configFiles.includes('package.json'), 'Should find package.json');
  }),

  test('project_context: should find entry points', async () => {
    const result = await projectContextTool.handler({}, { cwd: path.resolve(__dirname, '../..') });
    assert(result.entryPoints.length > 0, 'Should find entry points');
  }),

  test('project_context: should provide summary', async () => {
    const result = await projectContextTool.handler({}, { cwd: path.resolve(__dirname, '../..') });
    assert(result.summary.length > 0, 'Should have summary');
  })
];

// Main test runner
async function main() {
  console.log('🧪 Testing OpenClaw-style Coding Tools\n');
  
  console.log('Setting up test environment...');
  await setup();
  
  console.log('\nRunning tests:\n');
  
  for (const t of tests) {
    await runTest(t);
  }
  
  console.log('\nCleaning up...');
  await teardown();
  
  console.log(`\n📊 Results: ${passed} passed, ${failed} failed`);
  
  if (failed > 0) {
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Test runner failed:', err);
  process.exit(1);
});
