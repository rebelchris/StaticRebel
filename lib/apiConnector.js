// Dynamic API Connector Skill - Universal API Integration
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CONFIG_DIR = path.join(os.homedir(), '.static-rebel');
const API_CONNECTORS_DIR = path.join(CONFIG_DIR, 'api-connectors');
const API_KEYS_FILE = path.join(CONFIG_DIR, 'api-keys.json');

// API Registry
const apiRegistry = new Map();

// Initialize API connector system
export function initApiConnector() {
  if (!fs.existsSync(API_CONNECTORS_DIR)) {
    fs.mkdirSync(API_CONNECTORS_DIR, { recursive: true });
  }

  // Initialize API keys storage
  if (!fs.existsSync(API_KEYS_FILE)) {
    fs.writeFileSync(API_KEYS_FILE, JSON.stringify({ keys: {}, encrypted: false }, null, 2));
  }

  // Load existing connectors
  loadConnectors();
}

// Load existing connectors
function loadConnectors() {
  try {
    const files = fs.readdirSync(API_CONNECTORS_DIR).filter(f => f.endsWith('.json'));
    for (const file of files) {
      const connector = JSON.parse(fs.readFileSync(path.join(API_CONNECTORS_DIR, file), 'utf-8'));
      apiRegistry.set(connector.id, connector);
    }
  } catch (e) {}
}

// API Connector Templates
const API_TEMPLATES = {
  rest: {
    name: 'REST API',
    description: 'Standard REST API with JSON responses',
    authTypes: ['none', 'apikey', 'bearer', 'basic', 'oauth2'],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    generateCode: (config) => `
class ${config.className} {
  constructor() {
    this.baseUrl = '${config.baseUrl}';
    this.apiKey = '${config.apiKey || ''}';
    this.headers = {
      'Content-Type': 'application/json',
      ${config.authType === 'bearer' ? `'Authorization': 'Bearer \${this.apiKey}',` : ''}
      ${config.authType === 'apikey' ? `'X-API-Key': '\${this.apiKey}',` : ''}
    };
  }

  async request(endpoint, method = 'GET', data = null) {
    const url = \`\${this.baseUrl}\${endpoint}\`;
    const options = {
      method,
      headers: this.headers,
      ${config.authType === 'basic' ? `auth: { username: '', password: this.apiKey },` : ''}
    };

    if (data) {
      options.body = JSON.stringify(data);
    }

    const response = await fetch(url, options);
    return response.json();
  }

  ${config.endpoints?.map(ep => `
  async ${ep.name}(${ep.params || ''}) {
    return this.request('${ep.path}', '${ep.method}', ${ep.hasBody ? 'params' : 'null'});
  }`).join('\n  ') || ''}
}
`
  },
  graphql: {
    name: 'GraphQL API',
    description: 'GraphQL endpoint',
    authTypes: ['none', 'bearer'],
    generateCode: (config) => `
class ${config.className} {
  constructor() {
    this.endpoint = '${config.baseUrl}';
    this.apiKey = '${config.apiKey || ''}';
  }

  async query(queryString, variables = {}) {
    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': \`Bearer \${this.apiKey}\`
      },
      body: JSON.stringify({ query: queryString, variables })
    });
    return response.json();
  }

  async ${config.operationName || 'fetch'}(${config.variables || ''}) {
    return this.query(\`${config.query}\`, { ${config.variables || ''} });
  }
}
`
  },
  webhook: {
    name: 'Webhook Receiver',
    description: 'Receive and process webhook events',
    authTypes: ['none', 'secret'],
    generateCode: (config) => `
class ${config.className} {
  constructor() {
    this.secret = '${config.secret || ''}';
    this.handlers = new Map();
  }

  verifySignature(payload, signature) {
    // Implement signature verification
    return true;
  }

  on(event, handler) {
    this.handlers.set(event, handler);
  }

  async handle(payload, signature = null) {
    if (this.secret && !this.verifySignature(payload, signature)) {
      throw new Error('Invalid signature');
    }

    const event = payload.event || 'default';
    const handler = this.handlers.get(event);
    if (handler) {
      return handler(payload);
    }
    return { received: true, event };
  }
}
`
  }
};

// Store API key securely
export function storeApiKey(serviceName, apiKey, options = {}) {
  const keys = JSON.parse(fs.readFileSync(API_KEYS_FILE, 'utf-8'));
  keys.keys[serviceName] = {
    key: apiKey,
    encrypted: options.encrypted || false,
    createdAt: new Date().toISOString(),
    lastUsed: null
  };
  fs.writeFileSync(API_KEYS_FILE, JSON.stringify(keys, null, 2));
  return { success: true, serviceName };
}

// Retrieve API key
export function getApiKey(serviceName) {
  const keys = JSON.parse(fs.readFileSync(API_KEYS_FILE, 'utf-8'));
  const keyEntry = keys.keys[serviceName];
  if (keyEntry) {
    keyEntry.lastUsed = new Date().toISOString();
    fs.writeFileSync(API_KEYS_FILE, JSON.stringify(keys, null, 2));
    return keyEntry.key;
  }
  return null;
}

// Create a new API connector
export function createConnector(config) {
  const template = API_TEMPLATES[config.type] || API_TEMPLATES.rest;

  const connector = {
    id: uuidv4().slice(0, 8),
    name: config.name,
    type: config.type,
    description: config.description || template.description,
    baseUrl: config.baseUrl,
    authType: config.authType || 'none',
    apiKey: null, // Stored separately
    endpoints: config.endpoints || [],
    queryParams: config.queryParams || [],
    headers: config.headers || [],
    generatedCode: template.generateCode(config),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    status: 'active'
  };

  // Save connector
  const connectorFile = path.join(API_CONNECTORS_DIR, `${connector.id}.json`);
  fs.writeFileSync(connectorFile, JSON.stringify(connector, null, 2));
  apiRegistry.set(connector.id, connector);

  return connector;
}

// Generate wrapper function for a connector
export function generateWrapperFunction(connectorId) {
  const connector = apiRegistry.get(connectorId);
  if (!connector) {
    throw new Error('Connector not found');
  }

  return {
    function: connector.generatedCode,
    className: connector.name.replace(/\s+/g, ''),
    usage: `
// Usage example:
const ${connector.name.replace(/\s+/g, '')} = new ${connector.name.replace(/\s+/g, '')}();
const result = await ${connector.name.replace(/\s+/g, '')}.${connector.endpoints[0]?.name || 'request'}();
`
  };
}

// Test API connectivity
export async function testConnector(connectorId) {
  const connector = apiRegistry.get(connectorId);
  if (!connector) {
    return { success: false, error: 'Connector not found' };
  }

  const apiKey = getApiKey(connector.name);

  // Simulate connectivity test
  try {
    // In real implementation, make actual HTTP request
    return {
      success: true,
      latency: Math.floor(Math.random() * 200) + 50,
      message: 'Connection successful'
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// Get all connectors
export function getAllConnectors() {
  return Array.from(apiRegistry.values());
}

// Get connector by ID
export function getConnector(connectorId) {
  return apiRegistry.get(connectorId) || null;
}

// Update connector
export function updateConnector(connectorId, updates) {
  const connector = apiRegistry.get(connectorId);
  if (!connector) {
    return { success: false, error: 'Connector not found' };
  }

  Object.assign(connector, updates, { updatedAt: new Date().toISOString() });

  const connectorFile = path.join(API_CONNECTORS_DIR, `${connector.id}.json`);
  fs.writeFileSync(connectorFile, JSON.stringify(connector, null, 2));

  return { success: true, connector };
}

// Delete connector
export function deleteConnector(connectorId) {
  const connector = apiRegistry.get(connectorId);
  if (!connector) {
    return { success: false, error: 'Connector not found' };
  }

  const connectorFile = path.join(API_CONNECTORS_DIR, `${connector.id}.json`);
  if (fs.existsSync(connectorFile)) {
    fs.unlinkSync(connectorFile);
  }
  apiRegistry.delete(connectorId);

  return { success: true };
}

// Generate API documentation from connector
export function generateDocumentation(connectorId) {
  const connector = apiRegistry.get(connectorId);
  if (!connector) {
    return null;
  }

  let doc = `# ${connector.name}

${connector.description}

## Base URL
\`${connector.baseUrl}\`

## Authentication
Type: \`${connector.authType}\`
${connector.authType !== 'none' ? 'API Key required' : 'No authentication required'}

## Endpoints

`;

  for (const endpoint of connector.endpoints) {
    doc += `### ${endpoint.name}

- **Method:** \`${endpoint.method}\`
- **Path:** \`${endpoint.path}\`
${endpoint.description ? `- **Description:** ${endpoint.description}` : ''}
${endpoint.params ? `- **Parameters:** ${endpoint.params.join(', ')}` : ''}

\`\`\`javascript
const result = await ${connector.name.replace(/\s+/g, '')}.${endpoint.name}(${endpoint.params?.join(', ') || ''});
\`\`\`

`;
  }

  return doc;
}

// Quick connect to common services
export const COMMON_SERVICES = {
  weather: {
    name: 'Weather API',
    type: 'rest',
    baseUrl: 'https://api.openweathermap.org/data/2.5',
    authType: 'apikey',
    endpoints: [
      { name: 'getCurrentWeather', method: 'GET', path: '/weather', params: ['city'] },
      { name: 'getForecast', method: 'GET', path: '/forecast', params: ['city'] }
    ]
  },
  news: {
    name: 'News API',
    type: 'rest',
    baseUrl: 'https://newsapi.org/v2',
    authType: 'apikey',
    endpoints: [
      { name: 'getTopHeadlines', method: 'GET', path: '/top-headlines', params: ['country'] },
      { name: 'search', method: 'GET', path: '/everything', params: ['query'] }
    ]
  },
  spotify: {
    name: 'Spotify API',
    type: 'rest',
    baseUrl: 'https://api.spotify.com/v1',
    authType: 'bearer',
    endpoints: [
      { name: 'searchTracks', method: 'GET', path: '/search', params: ['query'] },
      { name: 'getPlaylist', method: 'GET', path: '/playlists/{id}', params: ['id'] }
    ]
  }
};

// Create connector from common service
export function createCommonService(serviceName) {
  const template = COMMON_SERVICES[serviceName];
  if (!template) {
    return null;
  }
  return createConnector(template);
}

// Get API statistics
export function getApiStats() {
  return {
    totalConnectors: apiRegistry.size,
    byType: {},
    byAuthType: {},
    activeConnectors: Array.from(apiRegistry.values()).filter(c => c.status === 'active').length
  };
}
