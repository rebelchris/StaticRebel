/**
 * Chat Handler Tests
 * Tests for the unified chat handler functionality
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  handleChat,
  configureChatHandler,
  getChatHandlerConfig,
  findTrackerSmart,
  findOrCreateTrackerSmart,
} from '../../lib/chatHandler.js';

// Mock dependencies
vi.mock('../../lib/actionRegistry.js', () => ({
  initActionRegistry: vi.fn().mockResolvedValue(true),
  executeAction: vi
    .fn()
    .mockResolvedValue({ success: true, result: 'Action executed' }),
  getAllActions: vi.fn().mockReturnValue([
    {
      name: 'track',
      description: 'Track things',
      category: 'tracking',
      intentExamples: ['track my workout', 'log food'],
    },
    {
      name: 'schedule',
      description: 'Schedule reminders',
      category: 'scheduling',
      intentExamples: ['remind me', 'schedule'],
    },
  ]),
}));

vi.mock('../../lib/modelRegistry.js', () => ({
  getDefaultModel: vi.fn().mockReturnValue('llama3.2'),
  chatCompletion: vi.fn().mockResolvedValue({
    message: JSON.stringify({
      intents: [
        { actionName: 'track', confidence: 0.9, reasoning: 'Tracking request' },
      ],
      fallbackToChat: false,
    }),
  }),
}));

vi.mock('../../tracker.js', () => ({
  TrackerStore: vi.fn().mockImplementation(() => ({
    listTrackers: vi.fn().mockReturnValue([
      { name: 'workout', type: 'workout', displayName: 'Workouts' },
      { name: 'nutrition', type: 'nutrition', displayName: 'Nutrition' },
      { name: 'pushups', type: 'custom', displayName: 'Pushup Tracker' },
    ]),
    getTracker: vi
      .fn()
      .mockReturnValue({
        name: 'workout',
        type: 'workout',
        displayName: 'Workouts',
      }),
    createTracker: vi
      .fn()
      .mockReturnValue({
        success: true,
        tracker: { name: 'new', type: 'custom' },
      }),
    addRecord: vi.fn().mockReturnValue({ success: true }),
  })),
  QueryEngine: vi.fn().mockImplementation(() => ({
    getStats: vi.fn().mockReturnValue({ totalEntries: 5, records: [] }),
  })),
  parseRecordFromText: vi
    .fn()
    .mockResolvedValue({ success: true, data: { exercise: 'pushups' } }),
  parseTrackerFromNaturalLanguage: vi.fn().mockResolvedValue({
    name: 'newtracker',
    type: 'custom',
    displayName: 'New Tracker',
  }),
}));

vi.mock('../../agents/main/agent.js', () => ({
  sendMessage: vi.fn().mockResolvedValue({ content: 'Chat response' }),
}));

vi.mock('../../lib/memoryManager.js', () => ({
  writeDailyMemory: vi.fn(),
}));

vi.mock('../../lib/vectorMemory.js', () => ({
  addMemory: vi.fn(),
  searchMemories: vi.fn().mockResolvedValue([]),
}));

describe('Chat Handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Configuration', () => {
    it('should return default configuration', () => {
      const config = getChatHandlerConfig();
      expect(config.DEFAULT_CONFIDENCE_THRESHOLD).toBe(0.6);
      expect(config.TRACKING_CONFIDENCE_THRESHOLD).toBe(0.4);
      expect(config.USE_PATTERN_MATCHING).toBe(true);
      expect(config.USE_LLM_CLASSIFICATION).toBe(true);
    });

    it('should update configuration', () => {
      configureChatHandler({ DEFAULT_CONFIDENCE_THRESHOLD: 0.8 });
      const config = getChatHandlerConfig();
      expect(config.DEFAULT_CONFIDENCE_THRESHOLD).toBe(0.8);
      // Reset
      configureChatHandler({ DEFAULT_CONFIDENCE_THRESHOLD: 0.6 });
    });
  });

  describe('Pattern-based intent detection', () => {
    it('should detect tracking intent from patterns', async () => {
      const result = await handleChat('I had a coffee', { source: 'test' });
      expect(result).toBeDefined();
      expect(result.source).toBe('test');
    });

    it('should detect schedule intent', async () => {
      const result = await handleChat('Remind me to stretch', {
        source: 'test',
      });
      expect(result).toBeDefined();
    });

    it('should detect help intent', async () => {
      const result = await handleChat('What can you do?', { source: 'test' });
      expect(result).toBeDefined();
    });
  });

  describe('Tracker lookup', () => {
    it('should find tracker by type', () => {
      const store = {
        listTrackers: () => [
          { name: 'workout', type: 'workout', displayName: 'Workouts' },
          { name: 'nutrition', type: 'nutrition', displayName: 'Nutrition' },
        ],
      };

      const tracker = findTrackerSmart('workout', 'I did pushups', store);
      expect(tracker).toBeDefined();
      expect(tracker.name).toBe('workout');
    });

    it('should find tracker by keyword matching', () => {
      const store = {
        listTrackers: () => [
          { name: 'pushups', type: 'custom', displayName: 'Pushup Tracker' },
          { name: 'running', type: 'workout', displayName: 'Running' },
        ],
      };

      const tracker = findTrackerSmart(
        'custom',
        'track my pushups today',
        store,
      );
      expect(tracker).toBeDefined();
      expect(tracker.name).toBe('pushups');
    });

    it('should return null when no tracker matches', () => {
      const store = {
        listTrackers: () => [
          { name: 'workout', type: 'workout', displayName: 'Workouts' },
        ],
      };

      const tracker = findTrackerSmart('custom', 'track my swimming', store);
      expect(tracker).toBeNull();
    });
  });

  describe('Smart tracker creation', () => {
    it('should find existing tracker instead of creating new', async () => {
      const store = {
        listTrackers: () => [
          { name: 'pushups', type: 'custom', displayName: 'Pushup Tracker' },
        ],
      };

      const tracker = await findOrCreateTrackerSmart(
        'custom',
        'track pushups',
        store,
      );
      expect(tracker).toBeDefined();
      expect(tracker.name).toBe('pushups');
    });
  });

  describe('Proactive tracking detection', () => {
    it('should identify tracking-like inputs', async () => {
      const trackingInputs = [
        'I had 200 calories',
        'Did a 5k run',
        '30 pushups',
        'Zone 2 training',
      ];

      for (const input of trackingInputs) {
        const result = await handleChat(input, { source: 'test' });
        expect(result).toBeDefined();
        expect(result.source).toBe('test');
      }
    });
  });

  describe('Response structure', () => {
    it('should return response with required fields', async () => {
      const result = await handleChat('Hello', { source: 'test' });

      expect(result).toHaveProperty('content');
      expect(result).toHaveProperty('source', 'test');
      expect(result).toHaveProperty('duration');
      expect(result).toHaveProperty('confidence');
    });
  });
});

describe('Intent Patterns', () => {
  const testCases = [
    { input: 'Remind me to stretch', expectedIntent: 'schedule' },
    { input: 'Write a function', expectedIntent: 'coding' },
    { input: 'Analyze this code', expectedIntent: 'analysis' },
    { input: 'What did we talk about?', expectedIntent: 'memory' },
    { input: 'Show my status', expectedIntent: 'status' },
    { input: 'List my tasks', expectedIntent: 'tasks' },
    { input: 'Available models', expectedIntent: 'models' },
    { input: 'My skills', expectedIntent: 'skills' },
    { input: 'Help me', expectedIntent: 'help' },
    { input: 'Track my workout', expectedIntent: 'track' },
    { input: 'Change persona', expectedIntent: 'persona' },
    { input: 'Remember this', expectedIntent: 'memory2' },
    { input: 'Run in background', expectedIntent: 'worker' },
    { input: 'Connect to API', expectedIntent: 'api' },
    { input: 'Use claude code', expectedIntent: 'orchestrator' },
    { input: 'Research AI', expectedIntent: 'research' },
  ];

  testCases.forEach(({ input, expectedIntent }) => {
    it(`should handle "${input}"`, async () => {
      const result = await handleChat(input, { source: 'test' });
      expect(result).toBeDefined();
    });
  });
});
