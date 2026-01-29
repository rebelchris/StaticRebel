/**
 * Tests for Memory Manager Module
 *
 * Run with: node --test tests/lib/memoryManager.test.js
 */

import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import os from 'os';

const TEST_MEMORY_DIR = path.join(os.tmpdir(), 'static-rebel-test-memory');
const TEST_DAILY_DIR = path.join(TEST_MEMORY_DIR, 'daily');
const TEST_LONG_TERM_FILE = path.join(TEST_MEMORY_DIR, 'long-term.md');

describe('Memory Manager', () => {
  let memoryManager;

  before(async () => {
    // Clean up and create test directory
    if (fs.existsSync(TEST_MEMORY_DIR)) {
      fs.rmSync(TEST_MEMORY_DIR, { recursive: true });
    }
    fs.mkdirSync(TEST_MEMORY_DIR, { recursive: true });

    // Import module
    memoryManager = await import('../../lib/memoryManager.js');
  });

  after(() => {
    // Clean up
    if (fs.existsSync(TEST_MEMORY_DIR)) {
      fs.rmSync(TEST_MEMORY_DIR, { recursive: true });
    }
  });

  beforeEach(() => {
    // Clean daily directory before each test
    if (fs.existsSync(TEST_DAILY_DIR)) {
      const files = fs.readdirSync(TEST_DAILY_DIR);
      for (const file of files) {
        fs.unlinkSync(path.join(TEST_DAILY_DIR, file));
      }
    }
  });

  describe('getMemoryPaths()', () => {
    it('should return memory directory paths', () => {
      const paths = memoryManager.getMemoryPaths();

      assert.ok(paths.dailyDir);
      assert.ok(paths.longTermFile);
      assert.ok(paths.heartbeatState);
      assert.ok(typeof paths.dailyDir === 'string');
    });
  });

  describe('initMemory()', () => {
    it('should create memory directories', () => {
      memoryManager.initMemory();

      const paths = memoryManager.getMemoryPaths();
      assert.ok(fs.existsSync(paths.dailyDir));
    });

    it('should create long-term memory file if not exists', () => {
      memoryManager.initMemory();

      const paths = memoryManager.getMemoryPaths();
      assert.ok(fs.existsSync(paths.longTermFile));

      const content = fs.readFileSync(paths.longTermFile, 'utf-8');
      assert.ok(content.includes('# Long-Term Memory'));
      assert.ok(content.includes('Important Context'));
    });

    it('should create heartbeat state file if not exists', () => {
      memoryManager.initMemory();

      const paths = memoryManager.getMemoryPaths();
      assert.ok(fs.existsSync(paths.heartbeatState));

      const state = JSON.parse(fs.readFileSync(paths.heartbeatState, 'utf-8'));
      assert.ok(state.lastChecks);
      assert.ok(state.lastHeartbeat !== undefined);
    });

    it('should not overwrite existing files', () => {
      // Create existing file with custom content
      const paths = memoryManager.getMemoryPaths();
      fs.mkdirSync(path.dirname(paths.longTermFile), { recursive: true });
      fs.writeFileSync(paths.longTermFile, '# Custom Content');

      memoryManager.initMemory();

      const content = fs.readFileSync(paths.longTermFile, 'utf-8');
      assert.strictEqual(content, '# Custom Content');
    });
  });

  describe('getTodayMemoryFile()', () => {
    it("should return path with today's date", () => {
      const filePath = memoryManager.getTodayMemoryFile();
      const today = new Date().toISOString().split('T')[0];

      assert.ok(filePath.includes(today));
      assert.ok(filePath.endsWith('.md'));
    });

    it('should return consistent path for same day', () => {
      const filePath1 = memoryManager.getTodayMemoryFile();
      const filePath2 = memoryManager.getTodayMemoryFile();

      assert.strictEqual(filePath1, filePath2);
    });
  });

  describe('readDailyMemory()', () => {
    it('should return empty string for non-existent file', () => {
      const content = memoryManager.readDailyMemory('2099-01-01');
      assert.strictEqual(content, '');
    });

    it('should read existing daily memory file', () => {
      const today = new Date().toISOString().split('T')[0];
      const filePath = path.join(TEST_DAILY_DIR, `${today}.md`);

      fs.mkdirSync(TEST_DAILY_DIR, { recursive: true });
      fs.writeFileSync(filePath, "# Today's Notes\n\nTest content");

      const content = memoryManager.readDailyMemory();
      assert.ok(content.includes("Today's Notes"));
      assert.ok(content.includes('Test content'));
    });

    it('should read specific date when provided', () => {
      const specificDate = '2024-01-15';
      const filePath = path.join(TEST_DAILY_DIR, `${specificDate}.md`);

      fs.mkdirSync(TEST_DAILY_DIR, { recursive: true });
      fs.writeFileSync(filePath, 'Specific date content');

      const content = memoryManager.readDailyMemory(specificDate);
      assert.strictEqual(content, 'Specific date content');
    });
  });

  describe('writeDailyMemory()', () => {
    it('should create new file with content', () => {
      fs.mkdirSync(TEST_DAILY_DIR, { recursive: true });

      memoryManager.writeDailyMemory('First entry', false);

      const content = memoryManager.readDailyMemory();
      assert.ok(content.includes('First entry'));
    });

    it('should append content by default', () => {
      fs.mkdirSync(TEST_DAILY_DIR, { recursive: true });

      memoryManager.writeDailyMemory('First entry', false);
      memoryManager.writeDailyMemory('Second entry', true);
      memoryManager.writeDailyMemory('Third entry', true);

      const content = memoryManager.readDailyMemory();
      assert.ok(content.includes('First entry'));
      assert.ok(content.includes('Second entry'));
      assert.ok(content.includes('Third entry'));
    });

    it('should overwrite when append is false', () => {
      fs.mkdirSync(TEST_DAILY_DIR, { recursive: true });

      memoryManager.writeDailyMemory('Original content', false);
      memoryManager.writeDailyMemory('New content', false);

      const content = memoryManager.readDailyMemory();
      assert.ok(!content.includes('Original content'));
      assert.ok(content.includes('New content'));
    });

    it('should handle special characters in content', () => {
      fs.mkdirSync(TEST_DAILY_DIR, { recursive: true });

      const specialContent =
        'Special: "quotes", \'apostrophes\', émojis 🎉, new\nlines';
      memoryManager.writeDailyMemory(specialContent, false);

      const content = memoryManager.readDailyMemory();
      assert.ok(content.includes('quotes'));
      assert.ok(content.includes('émojis'));
    });
  });

  describe('readLongTermMemory()', () => {
    it('should return null if file does not exist', () => {
      // Temporarily move file if exists
      const paths = memoryManager.getMemoryPaths();
      const backupPath = paths.longTermFile + '.backup';

      if (fs.existsSync(paths.longTermFile)) {
        fs.renameSync(paths.longTermFile, backupPath);
      }

      const content = memoryManager.readLongTermMemory();

      // Restore
      if (fs.existsSync(backupPath)) {
        fs.renameSync(backupPath, paths.longTermFile);
      }

      assert.strictEqual(content, null);
    });

    it('should read long-term memory content', () => {
      memoryManager.initMemory();

      const content = memoryManager.readLongTermMemory();
      assert.ok(typeof content === 'string');
      assert.ok(content.length > 0);
    });
  });

  describe('loadSessionMemory()', () => {
    it('should return memory context object', () => {
      const context = memoryManager.loadSessionMemory();

      assert.ok(typeof context === 'object');
      // Should include daily and long-term memory
    });

    it('should include recent daily memories', () => {
      fs.mkdirSync(TEST_DAILY_DIR, { recursive: true });

      // Create memories for last few days
      const today = new Date();
      for (let i = 0; i < 3; i++) {
        const date = new Date(today);
        date.setDate(date.getDate() - i);
        const dateStr = date.toISOString().split('T')[0];
        const filePath = path.join(TEST_DAILY_DIR, `${dateStr}.md`);
        fs.writeFileSync(filePath, `Memory for ${dateStr}`);
      }

      const context = memoryManager.loadSessionMemory();
      assert.ok(context);
    });
  });

  describe('curateMemory()', () => {
    it('should summarize old daily memories', () => {
      fs.mkdirSync(TEST_DAILY_DIR, { recursive: true });

      // Create old memory file
      const oldDate = '2023-01-01';
      const filePath = path.join(TEST_DAILY_DIR, `${oldDate}.md`);
      fs.writeFileSync(filePath, 'Old memory content that should be curated');

      // Curate memories older than 30 days
      const result = memoryManager.curateMemory(30);

      // Should have processed the old file
      assert.ok(result);
    });

    it('should not curate recent memories', () => {
      fs.mkdirSync(TEST_DAILY_DIR, { recursive: true });

      const today = new Date().toISOString().split('T')[0];
      const filePath = path.join(TEST_DAILY_DIR, `${today}.md`);
      fs.writeFileSync(filePath, 'Recent memory');

      const result = memoryManager.curateMemory(30);

      // File should still exist
      assert.ok(fs.existsSync(filePath));
    });
  });

  describe('getMemoryStats()', () => {
    it('should return memory statistics', () => {
      fs.mkdirSync(TEST_DAILY_DIR, { recursive: true });

      // Create some test files
      fs.writeFileSync(path.join(TEST_DAILY_DIR, '2024-01-01.md'), 'Content 1');
      fs.writeFileSync(path.join(TEST_DAILY_DIR, '2024-01-02.md'), 'Content 2');

      const stats = memoryManager.getMemoryStats();

      assert.ok(typeof stats === 'object');
      assert.ok(stats.totalFiles >= 2);
      assert.ok(typeof stats.totalSize === 'number');
    });

    it('should handle empty memory directory', () => {
      // Ensure directory exists but is empty
      fs.mkdirSync(TEST_DAILY_DIR, { recursive: true });

      const stats = memoryManager.getMemoryStats();

      assert.ok(typeof stats === 'object');
      assert.strictEqual(stats.totalFiles, 0);
      assert.strictEqual(stats.totalSize, 0);
    });
  });

  describe('getRecentDailyMemories()', () => {
    it('should return memories from last N days', () => {
      fs.mkdirSync(TEST_DAILY_DIR, { recursive: true });

      // Create memories for last 7 days
      const today = new Date();
      for (let i = 0; i < 7; i++) {
        const date = new Date(today);
        date.setDate(date.getDate() - i);
        const dateStr = date.toISOString().split('T')[0];
        const filePath = path.join(TEST_DAILY_DIR, `${dateStr}.md`);
        fs.writeFileSync(filePath, `Memory for day ${i}`);
      }

      const recent = memoryManager.getRecentDailyMemories(5);

      assert.ok(Array.isArray(recent));
      assert.ok(recent.length <= 5);
    });

    it('should return empty array if no memories exist', () => {
      const recent = memoryManager.getRecentDailyMemories(7);

      assert.ok(Array.isArray(recent));
      assert.strictEqual(recent.length, 0);
    });
  });
});

// Edge cases and error handling
describe('Memory Manager - Edge Cases', () => {
  it('should handle concurrent writes gracefully', async () => {
    const memoryManager = await import('../../lib/memoryManager.js');

    fs.mkdirSync(TEST_DAILY_DIR, { recursive: true });

    // Simulate concurrent writes
    const promises = [];
    for (let i = 0; i < 10; i++) {
      promises.push(
        new Promise((resolve) => {
          setTimeout(() => {
            memoryManager.writeDailyMemory(`Concurrent entry ${i}`, true);
            resolve();
          }, Math.random() * 10);
        }),
      );
    }

    await Promise.all(promises);

    const content = memoryManager.readDailyMemory();
    // Should have all entries (order may vary)
    for (let i = 0; i < 10; i++) {
      assert.ok(content.includes(`Concurrent entry ${i}`));
    }
  });

  it('should handle very long content', async () => {
    const memoryManager = await import('../../lib/memoryManager.js');

    fs.mkdirSync(TEST_DAILY_DIR, { recursive: true });

    const longContent = 'A'.repeat(100000); // 100KB of content

    assert.doesNotThrow(() => {
      memoryManager.writeDailyMemory(longContent, false);
    });

    const content = memoryManager.readDailyMemory();
    assert.strictEqual(content.length, 100000);
  });

  it('should handle invalid date strings', async () => {
    const memoryManager = await import('../../lib/memoryManager.js');

    // Should not throw on invalid date
    assert.doesNotThrow(() => {
      memoryManager.readDailyMemory('invalid-date');
      memoryManager.readDailyMemory('');
      memoryManager.readDailyMemory(null);
    });
  });

  it('should handle filesystem errors gracefully', async () => {
    const memoryManager = await import('../../lib/memoryManager.js');

    // Should not crash on permission errors (simulated)
    assert.doesNotThrow(() => {
      const stats = memoryManager.getMemoryStats();
      assert.ok(typeof stats === 'object');
    });
  });
});
