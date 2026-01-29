/**
 * Research Action
 * Web research using the Web Oracle
 */

export default {
  name: 'research',
  displayName: 'Web Research',
  description:
    'Research topics using web search with comprehensive results and sources',
  category: 'research',
  version: '1.0.0',

  intentExamples: [
    'research',
    'look into',
    'investigate',
    'find out about',
    'tell me about the latest',
    'tell me about the new',
    'what is the latest on',
    'what is the new on',
    'hot topic',
    'trending',
    'current state of',
  ],

  parameters: {
    query: {
      type: 'string',
      description: 'The research query or topic',
    },
  },

  dependencies: ['webOracle.research'],

  async handler(input, context, params) {
    const { research } = context.modules.research;

    const query = input
      .replace(
        /research|look into|investigate|find out about|tell me about|what's the|whats the|latest|hot topic|trending|current state of/gi,
        '',
      )
      .trim()
      .replace(/^(on |about |the )/, '');

    if (!query) {
      return `**Web Oracle - Research Tool**

I can research any topic for you using web search.

Try:
- "Research the latest AI developments"
- "Investigate climate change technologies"
- "What's new in quantum computing?"
- "Research Rust vs C++ performance"
- "Find out about GPT-5 rumors"

I'll search the web and provide comprehensive results with sources.`;
    }

    console.log(`\n[WEB ORACLE] Researching: "${query}"...`);

    try {
      const result = await research(query);
      return result;
    } catch (error) {
      return `[Research Error] ${error.message}`;
    }
  },

  source: 'builtin',
  enabled: true,
  createdAt: '2026-01-29',
};
