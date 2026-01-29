/**
 * Action Template
 * Use this as a starting point for creating new actions
 */

export default {
  // Unique identifier (required)
  name: 'actionName',

  // Human-readable name
  displayName: 'Action Display Name',

  // Description for LLM classification (required)
  description: 'Brief description of what this action does',

  // Category for grouping
  category: 'general', // system | utility | research | tracking | skill

  // Version
  version: '1.0.0',

  // Natural language examples that trigger this action (required)
  intentExamples: [
    'example trigger phrase 1',
    'example trigger phrase 2',
    'how do I do something',
  ],

  // Optional parameter schema
  parameters: {
    paramName: {
      type: 'string', // string | number | boolean | enum | array
      description: 'What this parameter is for',
      required: false,
      default: 'default value',
    },
    action: {
      type: 'enum',
      values: ['list', 'create', 'delete'],
      description: 'The action to perform',
    },
  },

  // Dependencies - modules/functions this action needs
  dependencies: ['moduleName.functionName'],

  // The main handler function (required)
  async handler(input, context, params) {
    // input: The full user input text
    // context: Contains modules and other context
    // params: Extracted parameters from the LLM

    // Access modules from context
    // const { someFunction } = context.modules;

    // Your implementation here
    return 'Action result';
  },

  // Metadata
  source: 'builtin', // builtin | user | skill
  enabled: true,
  createdAt: '2026-01-29',
};
