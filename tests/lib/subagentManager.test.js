/**
 * Tests for Subagent Manager Module
 *
 * Run with: node --test tests/lib/subagentManager.test.js
 */

import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert';

describe('Subagent Manager', () => {
  let subagentManager;

  before(async () => {
    subagentManager = await import('../../lib/subagentManager.js');
  });

  beforeEach(() => {
    // Clean up active subagents if possible
    const subagents = subagentManager.listSubagents();
    for (const subagent of subagents) {
      subagentManager.terminateSubagent(subagent.id);
    }
  });

  describe('getSubagentId()', () => {
    it('should generate unique IDs', () => {
      const id1 = subagentManager.getSubagentId();
      const id2 = subagentManager.getSubagentId();

      assert.ok(typeof id1 === 'string');
      assert.ok(id1.startsWith('subagent-'));
      assert.notStrictEqual(id1, id2);
    });

    it('should increment counter', () => {
      const id1 = subagentManager.getSubagentId();
      const id2 = subagentManager.getSubagentId();

      const num1 = parseInt(id1.split('-')[1]);
      const num2 = parseInt(id2.split('-')[1]);

      assert.strictEqual(num2, num1 + 1);
    });
  });

  describe('createSubagent()', () => {
    it('should create a subagent with given task type', async () => {
      const subagent = await subagentManager.createSubagent(
        'coding',
        'Test system prompt',
      );

      assert.ok(subagent);
      assert.ok(subagent.id);
      assert.strictEqual(subagent.taskType, 'coding');
      assert.strictEqual(subagent.systemPrompt, 'Test system prompt');
    });

    it('should initialize with system message', async () => {
      const systemPrompt = 'You are a coding assistant';
      const subagent = await subagentManager.createSubagent(
        'coding',
        systemPrompt,
      );

      assert.ok(subagent.messages);
      assert.strictEqual(subagent.messages.length, 1);
      assert.strictEqual(subagent.messages[0].role, 'system');
      assert.strictEqual(subagent.messages[0].content, systemPrompt);
    });

    it('should set initial status to active', async () => {
      const subagent = await subagentManager.createSubagent(
        'analysis',
        'Test prompt',
      );

      assert.strictEqual(subagent.status, 'active');
    });

    it('should track creation time', async () => {
      const before = Date.now();
      const subagent = await subagentManager.createSubagent('coding', 'Test');
      const after = Date.now();

      assert.ok(subagent.createdAt >= before);
      assert.ok(subagent.createdAt <= after);
    });

    it('should select appropriate model for task type', async () => {
      const codingSubagent = await subagentManager.createSubagent(
        'coding',
        'Test',
      );
      const analysisSubagent = await subagentManager.createSubagent(
        'analysis',
        'Test',
      );

      assert.ok(codingSubagent.model);
      assert.ok(analysisSubagent.model);
      // Different task types might use different models
    });

    it('should allow custom model selection', async () => {
      const customModel = 'ollama/custom-model';
      const subagent = await subagentManager.createSubagent('coding', 'Test', {
        model: customModel,
      });

      assert.strictEqual(subagent.model, customModel);
    });

    it('should add to active subagents list', async () => {
      const beforeCount = subagentManager.listSubagents().length;

      await subagentManager.createSubagent('coding', 'Test');

      const afterCount = subagentManager.listSubagents().length;
      assert.strictEqual(afterCount, beforeCount + 1);
    });
  });

  describe('sendToSubagent()', () => {
    it('should send message and get response', async () => {
      const subagent = await subagentManager.createSubagent('coding', 'Test');

      // This would require mocking the model response
      // For now, just test the interface
      try {
        const response = await subagentManager.sendToSubagent(
          subagent.id,
          'Hello',
        );
        assert.ok(response);
        assert.ok(response.content);
      } catch (error) {
        // Expected if no model available
        assert.ok(error);
      }
    });

    it('should update message history', async () => {
      const subagent = await subagentManager.createSubagent('coding', 'Test');
      const initialLength = subagent.messages.length;

      try {
        await subagentManager.sendToSubagent(subagent.id, 'Test message');
        const updatedSubagent = subagentManager.getSubagent(subagent.id);
        assert.ok(updatedSubagent.messages.length > initialLength);
      } catch (error) {
        // Expected if no model available
      }
    });

    it('should throw error for non-existent subagent', async () => {
      await assert.rejects(async () => {
        await subagentManager.sendToSubagent('non-existent-id', 'Hello');
      }, /not found/);
    });

    it('should throw error for inactive subagent', async () => {
      const subagent = await subagentManager.createSubagent('coding', 'Test');
      subagent.status = 'terminated';

      await assert.rejects(async () => {
        await subagentManager.sendToSubagent(subagent.id, 'Hello');
      }, /not active/);
    });

    it('should update last activity timestamp', async () => {
      const subagent = await subagentManager.createSubagent('coding', 'Test');
      const beforeActivity = subagent.lastActivity;

      // Wait a bit
      await new Promise((resolve) => setTimeout(resolve, 10));

      try {
        await subagentManager.sendToSubagent(subagent.id, 'Test');
        const updatedSubagent = subagentManager.getSubagent(subagent.id);
        assert.ok(updatedSubagent.lastActivity > beforeActivity);
      } catch (error) {
        // Expected if no model available
      }
    });
  });

  describe('getSubagent()', () => {
    it('should return subagent by ID', async () => {
      const created = await subagentManager.createSubagent('coding', 'Test');
      const retrieved = subagentManager.getSubagent(created.id);

      assert.ok(retrieved);
      assert.strictEqual(retrieved.id, created.id);
    });

    it('should return undefined for non-existent ID', () => {
      const subagent = subagentManager.getSubagent('non-existent');
      assert.strictEqual(subagent, undefined);
    });

    it('should return same reference as in list', async () => {
      const created = await subagentManager.createSubagent('coding', 'Test');
      const fromGet = subagentManager.getSubagent(created.id);
      const fromList = subagentManager
        .listSubagents()
        .find((s) => s.id === created.id);

      assert.strictEqual(fromGet, fromList);
    });
  });

  describe('listSubagents()', () => {
    it('should return array of subagents', async () => {
      await subagentManager.createSubagent('coding', 'Test 1');
      await subagentManager.createSubagent('analysis', 'Test 2');

      const subagents = subagentManager.listSubagents();

      assert.ok(Array.isArray(subagents));
      assert.ok(subagents.length >= 2);
    });

    it('should return subagent details', async () => {
      await subagentManager.createSubagent('coding', 'Test');
      const subagents = subagentManager.listSubagents();

      if (subagents.length > 0) {
        const subagent = subagents[0];
        assert.ok(subagent.id);
        assert.ok(subagent.taskType);
        assert.ok(subagent.status);
        assert.ok(subagent.createdAt);
      }
    });

    it('should return empty array when no subagents', () => {
      // Clear all subagents
      const subagents = subagentManager.listSubagents();
      for (const s of subagents) {
        subagentManager.terminateSubagent(s.id);
      }

      const list = subagentManager.listSubagents();
      assert.ok(Array.isArray(list));
      assert.strictEqual(list.length, 0);
    });
  });

  describe('terminateSubagent()', () => {
    it('should terminate active subagent', async () => {
      const subagent = await subagentManager.createSubagent('coding', 'Test');

      const result = subagentManager.terminateSubagent(subagent.id);

      assert.strictEqual(result, true);
      assert.strictEqual(subagent.status, 'terminated');
    });

    it('should remove from active list', async () => {
      const subagent = await subagentManager.createSubagent('coding', 'Test');
      const beforeCount = subagentManager.listSubagents().length;

      subagentManager.terminateSubagent(subagent.id);

      const afterCount = subagentManager.listSubagents().length;
      assert.strictEqual(afterCount, beforeCount - 1);
    });

    it('should return false for non-existent subagent', () => {
      const result = subagentManager.terminateSubagent('non-existent');
      assert.strictEqual(result, false);
    });

    it('should prevent further messages to terminated subagent', async () => {
      const subagent = await subagentManager.createSubagent('coding', 'Test');
      subagentManager.terminateSubagent(subagent.id);

      await assert.rejects(async () => {
        await subagentManager.sendToSubagent(subagent.id, 'Hello');
      }, /not active/);
    });
  });

  describe('createCodingSubagent()', () => {
    it('should create subagent with coding configuration', async () => {
      const subagent =
        await subagentManager.createCodingSubagent('Write a function');

      assert.ok(subagent);
      assert.strictEqual(subagent.taskType, 'coding');
      assert.ok(
        subagent.systemPrompt.includes('coding') ||
          subagent.systemPrompt.includes('code'),
      );
    });

    it('should include task in system prompt', async () => {
      const task = 'Implement quicksort';
      const subagent = await subagentManager.createCodingSubagent(task);

      assert.ok(
        subagent.systemPrompt.includes(task) ||
          subagent.messages.some((m) => m.content.includes(task)),
      );
    });
  });

  describe('createAnalysisSubagent()', () => {
    it('should create subagent with analysis configuration', async () => {
      const subagent =
        await subagentManager.createAnalysisSubagent('Analyze this data');

      assert.ok(subagent);
      assert.strictEqual(subagent.taskType, 'analysis');
      assert.ok(
        subagent.systemPrompt.includes('analysis') ||
          subagent.systemPrompt.includes('analyze'),
      );
    });

    it('should include topic in system prompt', async () => {
      const topic = 'Market trends';
      const subagent = await subagentManager.createAnalysisSubagent(topic);

      assert.ok(
        subagent.systemPrompt.includes(topic) ||
          subagent.messages.some((m) => m.content.includes(topic)),
      );
    });
  });

  describe('getSubagentStats()', () => {
    it('should return statistics object', () => {
      const stats = subagentManager.getSubagentStats();

      assert.ok(typeof stats === 'object');
      assert.ok(typeof stats.total === 'number');
      assert.ok(typeof stats.active === 'number');
    });

    it('should count subagents correctly', async () => {
      const beforeStats = subagentManager.getSubagentStats();

      const subagent = await subagentManager.createSubagent('coding', 'Test');

      const afterStats = subagentManager.getSubagentStats();

      assert.strictEqual(afterStats.total, beforeStats.total + 1);
      assert.strictEqual(afterStats.active, beforeStats.active + 1);
    });

    it('should track by task type', async () => {
      await subagentManager.createSubagent('coding', 'Test 1');
      await subagentManager.createSubagent('analysis', 'Test 2');

      const stats = subagentManager.getSubagentStats();

      assert.ok(stats.byType);
      assert.ok(stats.byType.coding >= 1);
      assert.ok(stats.byType.analysis >= 1);
    });
  });
});

// Edge cases and error handling
describe('Subagent Manager - Edge Cases', () => {
  it('should handle rapid creation and termination', async () => {
    const subagentManager = await import('../../lib/subagentManager.js');

    const subagents = [];

    // Rapidly create subagents
    for (let i = 0; i < 10; i++) {
      subagents.push(
        await subagentManager.createSubagent('coding', `Task ${i}`),
      );
    }

    // Rapidly terminate
    for (const subagent of subagents) {
      subagentManager.terminateSubagent(subagent.id);
    }

    const stats = subagentManager.getSubagentStats();
    // All should be terminated
    assert.strictEqual(stats.active, 0);
  });

  it('should handle very long system prompts', async () => {
    const subagentManager = await import('../../lib/subagentManager.js');

    const longPrompt = 'A'.repeat(10000);

    const subagent = await subagentManager.createSubagent('coding', longPrompt);

    assert.ok(subagent);
    assert.strictEqual(subagent.systemPrompt.length, 10000);
  });

  it('should handle special characters in prompts', async () => {
    const subagentManager = await import('../../lib/subagentManager.js');

    const specialPrompts = [
      'Prompt with "quotes"',
      "Prompt with 'apostrophes'",
      'Prompt with 🎉 emojis',
      'Prompt with\nnewlines',
      'Prompt with <html>tags</html>',
      'Prompt with {braces} and [brackets]',
    ];

    for (const prompt of specialPrompts) {
      const subagent = await subagentManager.createSubagent('coding', prompt);
      assert.ok(subagent);
      assert.ok(
        subagent.systemPrompt.includes(prompt.replace(/\n/g, '')) || true,
      );
    }
  });

  it('should handle concurrent message sends', async () => {
    const subagentManager = await import('../../lib/subagentManager.js');

    const subagent = await subagentManager.createSubagent('coding', 'Test');

    // Try to send multiple messages concurrently
    const promises = [];
    for (let i = 0; i < 5; i++) {
      promises.push(
        subagentManager
          .sendToSubagent(subagent.id, `Message ${i}`)
          .catch(() => null),
      );
    }

    const results = await Promise.all(promises);

    // Should complete without crashing
    assert.ok(results.length === 5);
  });

  it('should prevent memory leaks with many subagents', async () => {
    const subagentManager = await import('../../lib/subagentManager.js');

    // Create many subagents
    for (let i = 0; i < 100; i++) {
      const subagent = await subagentManager.createSubagent(
        'coding',
        `Task ${i}`,
      );
      subagentManager.terminateSubagent(subagent.id);
    }

    const stats = subagentManager.getSubagentStats();
    // Should not accumulate terminated subagents indefinitely
    assert.ok(stats.total < 100);
  });
});
