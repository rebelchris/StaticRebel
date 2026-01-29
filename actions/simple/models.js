/**
 * Models Action
 * Lists and manages available AI models
 */

export default {
  name: 'models',
  displayName: 'Model Management',
  description: 'List and manage available AI models from Ollama',
  category: 'system',
  version: '1.0.0',

  intentExamples: [
    'what models do I have',
    'list models',
    'available models',
    'change the model',
    'switch model',
    'use a different model',
    'show me my models',
    'which models are installed',
  ],

  parameters: {
    action: {
      type: 'enum',
      values: ['list', 'switch'],
      description: 'The action to perform',
      default: 'list',
    },
  },

  dependencies: [
    'modelRegistry.listAvailableModels',
    'modelRegistry.getDefaultModel',
  ],

  async handler(input, context, params) {
    const { listAvailableModels, getDefaultModel } = context.modules;

    const models = await listAvailableModels();
    const current = getDefaultModel();

    if (models.length === 0) {
      return 'No models detected. Make sure Ollama is running with: ollama serve';
    }

    return (
      `**Available Ollama Models:**\n\n` +
      models
        .map((m) => {
          const size = m.size ? (m.size / 1024 / 1024 / 1024).toFixed(1) : '?';
          const isCurrent = m.name === current ? ' ← current' : '';
          return `- ${m.name} (${size} GB)${isCurrent}`;
        })
        .join('\n') +
      `\n\nCurrent default: ${current}\n\nTo switch models, update OLLAMA_MODEL in your .env file.`
    );
  },

  source: 'builtin',
  enabled: true,
  createdAt: '2026-01-29',
};
