/**
 * Memory Action
 * Manages daily and long-term memories
 */

export default {
  name: 'memory',
  displayName: 'Memory Management',
  description:
    'Access daily memories, view history, and curate long-term memory',
  category: 'utility',
  version: '1.0.0',

  intentExamples: [
    'what did we talk about',
    'what did we discuss',
    'remember that',
    'my memory stats',
    'show my memories',
    'long term memory',
    'curate memory',
    'forget',
    'what did we cover',
  ],

  parameters: {
    action: {
      type: 'enum',
      values: ['today', 'recent', 'stats', 'curate', 'longterm'],
      description: 'Memory action to perform',
    },
  },

  dependencies: [
    'memoryManager.getMemoryStats',
    'memoryManager.readDailyMemory',
    'memoryManager.readLongTermMemory',
    'memoryManager.getRecentDailyMemories',
    'memoryManager.curateMemory',
  ],

  async handler(input, context, params) {
    const {
      getMemoryStats,
      readDailyMemory,
      readLongTermMemory,
      getRecentDailyMemories,
      curateMemory,
    } = context.modules;

    const lower = input.toLowerCase();

    // Stats request
    if (/stats/i.test(lower)) {
      const memStats = getMemoryStats();
      return (
        `**Memory Overview**\n\n` +
        `- Daily files: ${memStats.dailyFiles}\n` +
        `- Oldest memory: ${memStats.oldestMemory || 'None'}\n` +
        `- Newest memory: ${memStats.newestMemory || 'None'}\n` +
        `- Storage used: ${((memStats.dailySize + memStats.longTermSize) / 1024).toFixed(1)} KB`
      );
    }

    // Recent discussions
    if (/what did we (talk about|discuss|cover)/i.test(lower)) {
      const recent = getRecentDailyMemories(3);
      if (recent.length === 0) return "We haven't created any memories yet.";

      return (
        "**Here's what we've been discussing:**\n\n" +
        recent.map((r) => `## ${r.date}\n${r.content}`).join('\n\n---\n\n')
      );
    }

    // Curate memory
    if (/curate/i.test(lower)) {
      await curateMemory();
      return "✅ I've reviewed your recent memories and updated long-term memory with the important bits.";
    }

    // Long-term memory
    if (/long.?term/i.test(lower)) {
      const longTerm = readLongTermMemory();
      return longTerm || 'No long-term memories yet.';
    }

    // Default: show today's memory
    const today = readDailyMemory();
    return today || 'No memories for today yet.';
  },

  source: 'builtin',
  enabled: true,
  createdAt: '2026-01-29',
};
