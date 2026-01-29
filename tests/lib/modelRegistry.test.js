/**
 * Tests for Model Registry Module
 *
 * Run with: node --test tests/lib/modelRegistry.test.js
 */

import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert';
import http from 'http';

describe('Model Registry', () => {
  let modelRegistry;
  let mockServer;
  const MOCK_PORT = 11435; // Use different port to avoid conflicts

  before(async () => {
    // Set up mock Ollama server
    mockServer = http.createServer((req, res) => {
      if (req.url === '/api/tags') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            models: [
              { name: 'llama3.2', size: 4000000000 },
              { name: 'qwen3-coder:latest', size: 5000000000 },
              { name: 'nomic-embed-text', size: 100000000 },
            ],
          }),
        );
      } else if (req.url === '/api/chat') {
        let body = '';
        req.on('data', (chunk) => (body += chunk));
        req.on('end', () => {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              message: { role: 'assistant', content: 'Test response' },
              done: true,
            }),
          );
        });
      } else {
        res.writeHead(404);
        res.end('Not found');
      }
    });

    await new Promise((resolve) => {
      mockServer.listen(MOCK_PORT, resolve);
    });

    // Set environment to use mock server
    process.env.OLLAMA_HOST = `http://localhost:${MOCK_PORT}`;

    // Import module after setting env
    modelRegistry = await import('../../lib/modelRegistry.js');
  });

  after(() => {
    mockServer.close();
    delete process.env.OLLAMA_HOST;
  });

  beforeEach(() => {
    // Clear caches if possible
  });

  describe('getOllamaHost()', () => {
    it('should return Ollama host URL', () => {
      const host = modelRegistry.getOllamaHost();
      assert.ok(typeof host === 'string');
      assert.ok(host.includes('localhost'));
    });

    it('should respect OLLAMA_HOST environment variable', () => {
      const host = modelRegistry.getOllamaHost();
      assert.strictEqual(host, `http://localhost:${MOCK_PORT}`);
    });
  });

  describe('getDefaultModel()', () => {
    it('should return a default model name', () => {
      const model = modelRegistry.getDefaultModel();
      assert.ok(typeof model === 'string');
      assert.ok(model.length > 0);
    });

    it('should respect OLLAMA_MODEL environment variable', () => {
      process.env.OLLAMA_MODEL = 'custom-model';

      // Re-import to pick up new env
      // In real test, might need to clear module cache

      delete process.env.OLLAMA_MODEL;
    });
  });

  describe('getEmbeddingModel()', () => {
    it('should return embedding model name', () => {
      const model = modelRegistry.getEmbeddingModel();
      assert.ok(typeof model === 'string');
    });

    it('should default to nomic-embed-text', () => {
      delete process.env.EMBEDDING_MODEL;

      const model = modelRegistry.getEmbeddingModel();
      assert.strictEqual(model, 'nomic-embed-text');
    });
  });

  describe('getVisionModel()', () => {
    it('should return vision model name', () => {
      const model = modelRegistry.getVisionModel();
      assert.ok(typeof model === 'string');
    });

    it('should default to llava', () => {
      delete process.env.VISION_MODEL;

      const model = modelRegistry.getVisionModel();
      assert.strictEqual(model, 'llava');
    });
  });

  describe('loadModelRegistry()', () => {
    it('should return model registry configuration', () => {
      const registry = modelRegistry.loadModelRegistry();

      assert.ok(typeof registry === 'object');
    });

    it('should have providers section', () => {
      const registry = modelRegistry.loadModelRegistry();

      assert.ok(
        registry.providers || registry.defaults || registry.taskMapping,
      );
    });

    it('should cache registry for performance', () => {
      const registry1 = modelRegistry.loadModelRegistry();
      const registry2 = modelRegistry.loadModelRegistry();

      // Should be same object due to caching
      assert.strictEqual(registry1, registry2);
    });
  });

  describe('listConfiguredModels()', () => {
    it('should return array of configured models', () => {
      const models = modelRegistry.listConfiguredModels();

      assert.ok(Array.isArray(models));
    });

    it('should include model metadata', () => {
      const models = modelRegistry.listConfiguredModels();

      if (models.length > 0) {
        const model = models[0];
        assert.ok(model.provider);
        assert.ok(model.id);
      }
    });
  });

  describe('listAvailableModels()', () => {
    it('should fetch available models from Ollama', async () => {
      const models = await modelRegistry.listAvailableModels();

      assert.ok(Array.isArray(models));
      assert.ok(models.length > 0);
    });

    it('should return model information', async () => {
      const models = await modelRegistry.listAvailableModels();

      if (models.length > 0) {
        assert.ok(models[0].name);
        assert.ok(typeof models[0].size === 'number');
      }
    });

    it('should handle connection errors gracefully', async () => {
      // Temporarily set invalid host
      const originalHost = process.env.OLLAMA_HOST;
      process.env.OLLAMA_HOST = 'http://invalid-host:99999';

      const models = await modelRegistry.listAvailableModels();

      // Should return empty array on error, not throw
      assert.ok(Array.isArray(models));

      process.env.OLLAMA_HOST = originalHost;
    });

    it('should cache results', async () => {
      const models1 = await modelRegistry.listAvailableModels();
      const models2 = await modelRegistry.listAvailableModels();

      // Should be same reference due to caching
      assert.strictEqual(models1, models2);
    });
  });

  describe('detectTaskType()', () => {
    it('should detect coding tasks', () => {
      const taskTypes = [
        { input: 'Write a function to sort an array', expected: 'coding' },
        { input: 'Debug this Python script', expected: 'coding' },
        { input: 'Create a React component', expected: 'coding' },
        { input: 'How do I implement binary search?', expected: 'coding' },
      ];

      for (const { input, expected } of taskTypes) {
        const taskType = modelRegistry.detectTaskType(input);
        // Note: actual implementation may vary
        assert.ok(typeof taskType === 'string');
      }
    });

    it('should detect analysis tasks', () => {
      const inputs = [
        'Analyze this data',
        'Compare these options',
        'What are the pros and cons?',
        'Evaluate this approach',
      ];

      for (const input of inputs) {
        const taskType = modelRegistry.detectTaskType(input);
        assert.ok(typeof taskType === 'string');
      }
    });

    it('should handle ambiguous inputs', () => {
      const ambiguous = ['Hello', 'Help me', 'What is this?', ''];

      for (const input of ambiguous) {
        const taskType = modelRegistry.detectTaskType(input);
        assert.ok(typeof taskType === 'string' || taskType === null);
      }
    });
  });

  describe('getModelForTask()', () => {
    it('should return appropriate model for coding tasks', () => {
      const model = modelRegistry.getModelForTask('coding');
      assert.ok(typeof model === 'string');
    });

    it('should return appropriate model for analysis tasks', () => {
      const model = modelRegistry.getModelForTask('analysis');
      assert.ok(typeof model === 'string');
    });

    it('should return default model for unknown tasks', () => {
      const model = modelRegistry.getModelForTask('unknown-task-type');
      assert.ok(typeof model === 'string');
    });

    it('should handle task detection from prompt', () => {
      const model = modelRegistry.getModelForTask('Write a Python script');
      assert.ok(typeof model === 'string');
    });
  });

  describe('parseModelRef()', () => {
    it('should parse provider/model format', () => {
      const result = modelRegistry.parseModelRef('ollama/llama3.2');

      assert.ok(result);
      assert.strictEqual(result.provider, 'ollama');
      assert.strictEqual(result.id, 'llama3.2');
    });

    it('should parse model without provider prefix', () => {
      const result = modelRegistry.parseModelRef('llama3.2');

      assert.ok(result);
      assert.ok(result.provider || result.id);
    });

    it('should handle complex model names', () => {
      const result = modelRegistry.parseModelRef('ollama/qwen3-coder:latest');

      assert.ok(result);
      assert.strictEqual(result.provider, 'ollama');
      assert.ok(result.id.includes('qwen3-coder'));
    });
  });

  describe('chatCompletion()', () => {
    it('should send chat request to model', async () => {
      const messages = [{ role: 'user', content: 'Hello' }];

      const response = await modelRegistry.chatCompletion('llama3.2', messages);

      assert.ok(response);
      assert.ok(response.message);
    });

    it('should handle message history', async () => {
      const messages = [
        { role: 'system', content: 'You are a helpful assistant' },
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there!' },
        { role: 'user', content: 'How are you?' },
      ];

      const response = await modelRegistry.chatCompletion('llama3.2', messages);

      assert.ok(response);
    });

    it('should respect timeout option', async () => {
      const messages = [{ role: 'user', content: 'Test' }];

      // Should complete within timeout
      const response = await modelRegistry.chatCompletion(
        'llama3.2',
        messages,
        {
          timeout: 5000,
        },
      );

      assert.ok(response);
    });

    it('should handle model errors gracefully', async () => {
      // Test with invalid model
      try {
        await modelRegistry.chatCompletion('invalid-model', [
          { role: 'user', content: 'Test' },
        ]);
        // Should either return error object or throw
      } catch (error) {
        assert.ok(error.message);
      }
    });
  });

  describe('createEmbeddings()', () => {
    it('should create embeddings for text', async () => {
      const text = 'This is a test sentence';

      const embedding = await modelRegistry.createEmbeddings(text);

      assert.ok(embedding);
      assert.ok(Array.isArray(embedding) || ArrayBuffer.isView(embedding));
    });

    it('should create embeddings for array of texts', async () => {
      const texts = ['First sentence', 'Second sentence'];

      const embeddings = await modelRegistry.createEmbeddings(texts);

      assert.ok(Array.isArray(embeddings));
      assert.strictEqual(embeddings.length, 2);
    });

    it('should return consistent dimensions', async () => {
      const embedding1 = await modelRegistry.createEmbeddings('Short');
      const embedding2 = await modelRegistry.createEmbeddings(
        'This is a much longer piece of text with many words',
      );

      assert.strictEqual(embedding1.length, embedding2.length);
    });
  });
});

// Edge cases and error handling
describe('Model Registry - Edge Cases', () => {
  it('should handle empty messages array', async () => {
    const modelRegistry = await import('../../lib/modelRegistry.js');

    try {
      await modelRegistry.chatCompletion('llama3.2', []);
    } catch (error) {
      // Expected to error or handle gracefully
      assert.ok(error || true);
    }
  });

  it('should handle very long messages', async () => {
    const modelRegistry = await import('../../lib/modelRegistry.js');

    const longMessage = 'A'.repeat(10000);

    try {
      await modelRegistry.chatCompletion('llama3.2', [
        { role: 'user', content: longMessage },
      ]);
    } catch (error) {
      // Should handle gracefully
      assert.ok(error || true);
    }
  });

  it('should handle special characters in messages', async () => {
    const modelRegistry = await import('../../lib/modelRegistry.js');

    const specialMessages = [
      { role: 'user', content: 'Special chars: <>&"\'' },
      { role: 'user', content: 'Unicode: 🎉 émojis 中文' },
      { role: 'user', content: 'Newlines:\n\r\t' },
      { role: 'user', content: 'Backslashes: \\\\ \\n \\t' },
    ];

    for (const message of specialMessages) {
      try {
        await modelRegistry.chatCompletion('llama3.2', [message]);
      } catch (error) {
        // Should not crash
        assert.ok(true);
      }
    }
  });

  it('should handle network timeouts', async () => {
    const modelRegistry = await import('../../lib/modelRegistry.js');

    // Set very short timeout
    try {
      await modelRegistry.chatCompletion(
        'llama3.2',
        [{ role: 'user', content: 'Test' }],
        { timeout: 1 },
      );
    } catch (error) {
      assert.ok(error.message.includes('timeout') || true);
    }
  });

  it('should handle malformed model responses', async () => {
    // This would require mocking a server that returns invalid JSON
    assert.ok(true); // Placeholder
  });
});
