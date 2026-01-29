/**
 * Analysis Action
 * Spawns analysis subagent for thinking and evaluation tasks
 */

export default {
  name: 'analysis',
  displayName: 'Analysis & Thinking',
  description: 'Analyze, compare, evaluate, and think through complex problems',
  category: 'research',
  version: '1.0.0',

  intentExamples: [
    'analyze',
    'compare',
    'evaluate',
    'assess',
    'think about',
    'what do you think',
    'should I',
    'pros and cons',
    'look into',
    'investigate',
    'figure out',
    'deep analysis',
    'analyze this',
  ],

  parameters: {
    topic: {
      type: 'string',
      description: 'The topic or question to analyze',
    },
  },

  dependencies: [
    'subagentManager.createAnalysisSubagent',
    'subagentManager.sendToSubagent',
  ],

  async handler(input, context, params) {
    const { createAnalysisSubagent, sendToSubagent } =
      context.modules.subagents;

    const subagent = await createAnalysisSubagent(input, '');
    const result = await sendToSubagent(subagent.id, input);

    return `[Analysis using ${subagent.model}]\n\n${result.content}`;
  },

  source: 'builtin',
  enabled: true,
  createdAt: '2026-01-29',
};
