/**
 * Memory2 Action (Vector Memory)
 * Semantic memory storage and search
 */

export default {
  name: 'memory2',
  displayName: 'Vector Memory',
  description: 'Store and search memories using semantic/vector search',
  category: 'utility',
  version: '1.0.0',

  intentExamples: [
    'remember this',
    'remember that',
    'remember information',
    'store this',
    'store that',
    'search my memories',
    'semantic search',
    'long term memory',
    'recall something',
    'vector memory',
    'semantic memory',
  ],

  parameters: {
    action: {
      type: 'enum',
      values: ['remember', 'search', 'stats'],
      description: 'Memory action to perform',
    },
  },

  dependencies: [
    'vectorMemory.addMemory',
    'vectorMemory.searchMemories',
    'vectorMemory.getMemoryStats',
    'vectorMemory.rememberPreference',
  ],

  async handler(input, context, params) {
    const { addMemory, searchMemories, getMemoryStats, rememberPreference } =
      context.modules.vectorMemory;

    const lower = input.toLowerCase();

    // Store new memory
    if (/remember|store/i.test(lower)) {
      const content = input.replace(/remember|store|this|that/i, '').trim();
      if (!content) return 'What would you like me to remember?';

      await addMemory(content, { type: 'user_preference' });
      await rememberPreference('user_instruction', content, input);

      return `✅ Got it! I'll remember: "${content}"`;
    }

    // Semantic search
    if (/search/i.test(lower)) {
      const query = input.replace(/search|my|memories/i, '').trim();
      const results = await searchMemories(query || input, { limit: 5 });

      if (results.length === 0) {
        return 'No matching memories found.';
      }

      return (
        `**Semantic Search Results:**\n\n` +
        results
          .map(
            (r, i) =>
              `${i + 1}. ${r.content} (${(r.score * 100).toFixed(0)}% match)`,
          )
          .join('\n\n')
      );
    }

    // Memory stats
    const stats = getMemoryStats();
    return (
      `**Vector Memory Stats:**\n\n` +
      `Total memories: ${stats.totalMemories}\n` +
      Object.entries(stats.byType || {})
        .map(([type, count]) => `- ${type}: ${count}`)
        .join('\n')
    );
  },

  source: 'builtin',
  enabled: true,
  createdAt: '2026-01-29',
};
