/**
 * API Action
 * API connectors and integrations
 */

export default {
  name: 'api',
  displayName: 'API Connectors',
  description:
    'Connect to external APIs, manage integrations, and store API keys',
  category: 'utility',
  version: '1.0.0',

  intentExamples: [
    'connect to api',
    'api connector',
    'api integration',
    'new api',
    'new integration',
    'store api key',
    'dynamic api',
    'dynamic connector',
    'webhook',
  ],

  parameters: {
    action: {
      type: 'enum',
      values: ['connect', 'list', 'store_key'],
      description: 'API action to perform',
    },
  },

  dependencies: ['apiConnector.getAllConnectors', 'apiConnector.getApiStats'],

  async handler(input, context, params) {
    const { getAllConnectors, getApiStats } = context.modules.apiConnector;

    const lower = input.toLowerCase();
    const connectors = getAllConnectors();
    const stats = getApiStats();

    // Create new connector
    if (/connect|new|integration/i.test(lower)) {
      return `**Create New API Connector**

To connect an API, provide:
- Base URL (e.g., https://api.example.com)
- Authentication type (apikey, bearer, basic, oauth2)
- API key (stored securely)
- Endpoints you want to use

Example:
"Connect to Weather API with base URL https://api.openweathermap.org/data/2.5 and API key xxx"`;
    }

    // Store API key
    if (/api key|store/i.test(lower)) {
      return "To store an API key, say: 'Store API key for <service-name>'";
    }

    // List connectors
    return `**API Connectors**

Total connectors: ${stats.totalConnectors}
Active: ${stats.activeConnectors}

${connectors.length > 0 ? connectors.map((c) => `- ${c.name} (${c.type})`).join('\n') : 'No connectors configured yet.'}

Say 'connect to API' to add a new one.`;
  },

  source: 'builtin',
  enabled: true,
  createdAt: '2026-01-29',
};
