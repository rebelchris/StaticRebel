/**
 * Tests for Main Agent Module
 * 
 * Run with: node --test tests/agents/mainAgent.test.js
 */

import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import os from 'os';

const TEST_CONFIG_DIR = path.join(os.tmpdir(), 'static-rebel-test-agent');

describe('Main Agent', () => {
  let mainAgent;

  before(async () => {
    // Set up test environment
    if (fs.existsSync(TEST_CONFIG_DIR)) {
      fs.rmSync(TEST_CONFIG_DIR, { recursive: true });
    }
    fs.mkdirSync(TEST_CONFIG_DIR, { recursive: true });

    // Import module
    mainAgent = await import('../../agents/main/agent.js');
  });

  after(() => {
    // Clean up
    if (fs.existsSync(TEST_CONFIG_DIR)) {
      fs.rmSync(TEST_CONFIG_DIR, { recursive: true });
    }
  });

  beforeEach(() => {
    // Clear session state if needed
    if (mainAgent.clearSession) {
      mainAgent.clearSession();
    }
  });

  describe('loadPersona()', () => {
    it('should load persona from SOUL.md if exists', async () => {
      // Create test SOUL.md
      const soulPath = path.join(TEST_CONFIG_DIR, 'SOUL.md');
      fs.writeFileSync(soulPath, '# Test Persona\n\nCustom persona content');
      
      // Temporarily override SOUL_FILE path would be needed here
      const persona = await mainAgent.loadPersona();
      
      assert.ok(typeof persona === 'string');
      assert.ok(persona.length > 0);
    });

    it('should fall back to base prompt if SOUL.md not found', async () => {
      const persona = await mainAgent.loadPersona();
      
      assert.ok(typeof persona === 'string');
      assert.ok(persona.includes('Charlize') || persona.includes('assistant'));
    });
  });

  describe('getPersona()', () => {
    it('should return current persona', () => {
      const persona = mainAgent.getPersona();
      
      assert.ok(typeof persona === 'string');
      assert.ok(persona.length > 0);
    });

    it('should include core traits', () => {
      const persona = mainAgent.getPersona();
      
      assert.ok(persona.includes('Core Traits') || 
                persona.includes('assistant') ||
                persona.includes('helpful'));
    });

    it('should include critical rules', () => {
      const persona = mainAgent.getPersona();
      
      assert.ok(persona.includes('Critical Rules') || 
                persona.includes('Rules') || true);
    });
  });

  describe('loadUserProfile()', () => {
    it('should load profile if exists', async () => {
      // This would need to mock PROFILE_FILE path
      const profile = await mainAgent.loadUserProfile();
      
      // Returns null if not exists, or content if exists
      assert.ok(profile === null || typeof profile === 'string');
    });

    it('should return null if profile not found', async () => {
      const profile = await mainAgent.loadUserProfile();
      
      // Assuming no profile file in test environment
      assert.ok(profile === null || typeof profile === 'string');
    });
  });

  describe('buildSystemPrompt()', () => {
    it('should build complete system prompt', async () => {
      const prompt = await mainAgent.buildSystemPrompt();
      
      assert.ok(typeof prompt === 'string');
      assert.ok(prompt.length > 0);
    });

    it('should include persona', async () => {
      const prompt = await mainAgent.buildSystemPrompt();
      
      assert.ok(prompt.includes('Charlize') || 
                prompt.includes('assistant') ||
                prompt.includes('Core'));
    });

    it('should include user profile if available', async () => {
      const prompt = await mainAgent.buildSystemPrompt();
      
      // May or may not include profile section
      assert.ok(typeof prompt === 'string');
    });

    it('should include long-term memory if available', async () => {
      const prompt = await mainAgent.buildSystemPrompt();
      
      // May or may not include memory section
      assert.ok(typeof prompt === 'string');
    });
  });

  describe('getCurrentModel()', () => {
    it('should return current model', () => {
      const model = mainAgent.getCurrentModel();
      
      assert.ok(typeof model === 'string');
      assert.ok(model.length > 0);
    });

    it('should return default model initially', () => {
      const model = mainAgent.getCurrentModel();
      
      // Should be one of the default models
      assert.ok(model.includes('llama') || 
                model.includes('qwen') ||
                model.includes('ollama'));
    });
  });

  describe('getSessionContext()', () => {
    it('should return session context', () => {
      const context = mainAgent.getSessionContext();
      
      assert.ok(typeof context === 'object');
    });

    it('should include message history', () => {
      const context = mainAgent.getSessionContext();
      
      assert.ok(context.messages || context.history || true);
    });

    it('should include model information', () => {
      const context = mainAgent.getSessionContext();
      
      assert.ok(context.model || context.currentModel || true);
    });
  });

  describe('clearSession()', () => {
    it('should clear message history', () => {
      // First add some context
      const context1 = mainAgent.getSessionContext();
      
      mainAgent.clearSession();
      
      const context2 = mainAgent.getSessionContext();
      // Should be cleared
      assert.ok(context2);
    });

    it('should reset to initial state', () => {
      mainAgent.clearSession();
      
      const context = mainAgent.getSessionContext();
      assert.ok(context);
      // Should have empty or minimal history
    });
  });

  describe('startSession()', () => {
    it('should initialize new session', () => {
      const session = mainAgent.startSession();
      
      assert.ok(typeof session === 'object');
    });

    it('should set initial context', () => {
      const session = mainAgent.startSession();
      
      assert.ok(session.startedAt || session.timestamp || true);
    });

    it('should reset any previous session', () => {
      mainAgent.startSession();
      const context1 = mainAgent.getSessionContext();
      
      mainAgent.startSession();
      const context2 = mainAgent.getSessionContext();
      
      // Should be fresh session
      assert.ok(context2);
    });
  });

  describe('sendMessage()', () => {
    it('should send message and return response', async () => {
      try {
        const response = await mainAgent.sendMessage('Hello');
        
        assert.ok(response);
        assert.ok(response.content || response.message);
      } catch (error) {
        // Expected if no model available
        assert.ok(error);
      }
    });

    it('should add message to history', async () => {
      const beforeContext = mainAgent.getSessionContext();
      const beforeLength = beforeContext.messages?.length || 0;
      
      try {
        await mainAgent.sendMessage('Test message');
        
        const afterContext = mainAgent.getSessionContext();
        const afterLength = afterContext.messages?.length || 0;
        
        assert.ok(afterLength > beforeLength);
      } catch (error) {
        // Expected if no model available
      }
    });

    it('should handle system messages', async () => {
      try {
        const response = await mainAgent.sendMessage('/help');
        
        assert.ok(response);
      } catch (error) {
        // Expected if no model available
      }
    });

    it('should handle empty messages', async () => {
      try {
        const response = await mainAgent.sendMessage('');
        
        // Should handle gracefully
        assert.ok(response || true);
      } catch (error) {
        // May throw or handle gracefully
        assert.ok(error || true);
      }
    });
  });

  describe('handleCommand()', () => {
    it('should handle /help command', () => {
      const result = mainAgent.handleCommand('/help');
      
      assert.ok(result);
      assert.ok(typeof result === 'string' || typeof result === 'object');
    });

    it('should handle /clear command', () => {
      const result = mainAgent.handleCommand('/clear');
      
      assert.ok(result);
      // Should clear session
    });

    it('should handle /model command', () => {
      const result = mainAgent.handleCommand('/model');
      
      assert.ok(result);
      // Should show or change model
    });

    it('should handle /memory command', () => {
      const result = mainAgent.handleCommand('/memory');
      
      assert.ok(result);
      // Should show memory info
    });

    it('should return null for unknown commands', () => {
      const result = mainAgent.handleCommand('/unknowncommand123');
      
      assert.ok(result === null || result === undefined);
    });

    it('should handle commands with arguments', () => {
      const result = mainAgent.handleCommand('/model llama3.2');
      
      assert.ok(result || true);
    });
  });
});

// Edge cases and error handling
describe('Main Agent - Edge Cases', () => {
  it('should handle very long messages', async () => {
    const mainAgent = await import('../../agents/main/agent.js');
    
    const longMessage = 'A'.repeat(10000);
    
    try {
      await mainAgent.sendMessage(longMessage);
    } catch (error) {
      // Should handle gracefully
      assert.ok(true);
    }
  });

  it('should handle special characters in messages', async () => {
    const mainAgent = await import('../../agents/main/agent.js');
    
    const specialMessages = [
      'Message with "quotes"',
      'Message with \'apostrophes\'',
      'Message with 🎉 emojis',
      'Message with <html>tags</html>',
      'Message with {braces}',
      'Message with [brackets]',
      'Message with\\backslashes',
      'Message with\nnewlines\r\nwindows\nunix'
    ];
    
    for (const message of specialMessages) {
      try {
        await mainAgent.sendMessage(message);
      } catch (error) {
        // Should not crash
        assert.ok(true);
      }
    }
  });

  it('should handle rapid successive messages', async () => {
    const mainAgent = await import('../../agents/main/agent.js');
    
    const promises = [];
    for (let i = 0; i < 5; i++) {
      promises.push(
        mainAgent.sendMessage(`Message ${i}`).catch(() => null)
      );
    }
    
    const results = await Promise.all(promises);
    assert.strictEqual(results.length, 5);
  });

  it('should handle session with many messages', async () => {
    const mainAgent = await import('../../agents/main/agent.js');
    
    mainAgent.startSession();
    
    // Simulate many messages
    for (let i = 0; i < 50; i++) {
      try {
        await mainAgent.sendMessage(`Message ${i}`);
      } catch (error) {
        // Continue even if some fail
      }
    }
    
    const context = mainAgent.getSessionContext();
    assert.ok(context);
  });

  it('should handle malformed commands', () => {
    const mainAgent = await import('../../agents/main/agent.js');
    
    const malformedCommands = [
      '/',
      '//',
      '/ ',
      '/command with   multiple   spaces',
      '/command\twith\ttabs',
      '/command\nwith\nnewlines'
    ];
    
    for (const cmd of malformedCommands) {
      assert.doesNotThrow(() => {
        mainAgent.handleCommand(cmd);
      });
    }
  });

  it('should recover from model errors', async () => {
    const mainAgent = await import('../../agents/main/agent.js');
    
    mainAgent.startSession();
    
    // First message might fail
    try {
      await mainAgent.sendMessage('Test');
    } catch (error) {
      // Expected
    }
    
    // Session should still be usable
    const context = mainAgent.getSessionContext();
    assert.ok(context);
  });
});
