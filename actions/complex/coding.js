/**
 * Coding Action
 * Spawns coding subagent for code generation tasks
 */

export default {
  name: 'coding',
  displayName: 'Code Generation',
  description:
    'Write code, functions, classes, and scripts using a coding subagent',
  category: 'development',
  version: '1.0.0',

  intentExamples: [
    'write code',
    'write a function',
    'write a class',
    'write a script',
    'create a function',
    'create a class',
    'create a module',
    'create a component',
    'create an api',
    'build a',
    'implement',
    'code',
    'debug',
    'fix the bug',
    'fix the error',
    'refactor',
    'review my code',
    'program',
    'develop',
  ],

  parameters: {
    task: {
      type: 'string',
      description: 'The coding task description',
    },
    language: {
      type: 'string',
      description: 'Programming language to use',
    },
  },

  dependencies: [
    'subagentManager.createCodingSubagent',
    'subagentManager.sendToSubagent',
  ],

  async handler(input, context, params) {
    const { createCodingSubagent, sendToSubagent } = context.modules.subagents;

    const subagent = await createCodingSubagent(process.cwd(), input);
    const result = await sendToSubagent(subagent.id, input);

    return `[Coding agent using ${subagent.model}]\n\n${result.content}`;
  },

  source: 'builtin',
  enabled: true,
  createdAt: '2026-01-29',
};
