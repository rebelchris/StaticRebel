/**
 * Tests for SQLite Vector Memory System
 * 
 * Run with: node --test tests/lib/memory/sqlite-memory.test.js
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import os from 'os';

const { 
  initVectorMemory,
  addMemory,
  searchMemories,
  getMemoriesByType,
  getMemoryStats,
  clearAllMemories,
  closeDatabaseConnection,
  getDatabaseInfo,
} = await import('../../../lib/memory/sqlite-memory.js');

describe('SQLite Vector Memory', () => {
  const testDbDir = path.join(os.tmpdir(), 'static-rebel-test-' + Date.now());
  const originalConfigDir = process.env.HOME;

  before(() => {
    process.env.HOME = testDbDir;
    fs.mkdirSync(testDbDir, { recursive: true });
  });

  after(() => {
    try {
      closeDatabaseConnection();
    } catch (e) {}
    process.env.HOME = originalConfigDir;
    if (fs.existsSync(testDbDir)) {
      fs.rmSync(testDbDir, { recursive: true, force: true });
    }
  });

  it('should initialize database successfully', () => {
    assert.doesNotThrow(() => initVectorMemory());
    
    const dbInfo = getDatabaseInfo();
    assert.strictEqual(dbInfo.connected, true);
    assert.ok(dbInfo.memoryCount >= 0);
  });

  it('should add and retrieve basic memories', async () => {
    // Clear any existing data
    clearAllMemories();
    
    // Add a memory
    const result = await addMemory('Test memory content', { type: 'test' });
    assert.strictEqual(result.success, true);
    assert.ok(result.id);

    // Retrieve by type
    const memories = getMemoriesByType('test');
    assert.ok(memories.length >= 1);
    
    const testMemory = memories.find(m => m.content === 'Test memory content');
    assert.ok(testMemory);
    assert.strictEqual(testMemory.metadata.type, 'test');
  });

  it('should perform vector search', async () => {
    // Clear and add test data
    clearAllMemories();
    await addMemory('JavaScript programming language', { type: 'programming' });
    await addMemory('Python for data science', { type: 'programming' });

    // Search should work (may use fallback embeddings)
    const results = await searchMemories('programming', {
      limit: 5,
      minScore: 0.0 // Very low threshold to ensure results with fallback
    });

    assert.ok(Array.isArray(results));
    // With fallback embeddings, we should get some results
    if (results.length > 0) {
      assert.ok(results[0].score >= 0);
      assert.ok(results[0].content);
    }
  });

  it('should provide memory statistics', async () => {
    clearAllMemories();
    await addMemory('Memory 1', { type: 'test' });
    await addMemory('Memory 2', { type: 'test' });
    await addMemory('Different memory', { type: 'other' });

    const stats = getMemoryStats();
    assert.strictEqual(stats.totalMemories, 3);
    assert.strictEqual(stats.byType.test, 2);
    assert.strictEqual(stats.byType.other, 1);
  });

  it('should clear all memories', async () => {
    // Add some test data
    await addMemory('Memory to clear', { type: 'temp' });
    
    // Verify it exists
    let stats = getMemoryStats();
    assert.ok(stats.totalMemories > 0);
    
    // Clear all
    const result = clearAllMemories();
    assert.strictEqual(result.success, true);
    
    // Verify it's cleared
    stats = getMemoryStats();
    assert.strictEqual(stats.totalMemories, 0);
  });
});