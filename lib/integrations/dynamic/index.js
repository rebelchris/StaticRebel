#!/usr/bin/env node

/**
 * Dynamic Integration System for StaticRebel
 * 
 * This system allows users to define any integration and lets the LLM
 * figure out how to use it. Makes StaticRebel infinitely extensible.
 * 
 * Features:
 * - Hot-reloadable integration definitions
 * - LLM-generated tool descriptions
 * - Automatic API call construction
 * - Smart response parsing
 * - Natural language interface
 */

import fs from 'fs';
import path from 'path';
import { promises as fsPromises } from 'fs';
import { fileURLToPath } from 'url';
import { EventEmitter } from 'events';
import chalk from 'chalk';
import { chatCompletion, getDefaultModel } from '../../modelRegistry.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const INTEGRATIONS_DIR = path.join(__dirname, '../../../integrations');
const USER_INTEGRATIONS_DIR = path.join(process.cwd(), 'integrations');
const CONFIG_FILE = path.join(process.cwd(), 'integrations.json');

class DynamicIntegrationManager extends EventEmitter {
  constructor() {
    super();
    this.integrations = new Map();
    this.watchers = new Map();
    this.isInitialized = false;
  }

  async initialize() {
    if (this.isInitialized) return;
    
    // Ensure directories exist
    await this.ensureDirectories();
    
    // Load integrations
    await this.loadIntegrations();
    
    // Set up file watchers for hot-reload
    this.setupWatchers();
    
    this.isInitialized = true;
    this.emit('ready');
    
    console.log(chalk.green(`✅ Dynamic Integration System loaded ${this.integrations.size} integrations`));
  }

  async ensureDirectories() {
    const dirs = [INTEGRATIONS_DIR, USER_INTEGRATIONS_DIR];
    for (const dir of dirs) {
      await fsPromises.mkdir(dir, { recursive: true });
    }
  }

  async loadIntegrations() {
    this.integrations.clear();
    
    // Load system integrations
    await this.loadFromDirectory(INTEGRATIONS_DIR, 'system');
    
    // Load user integrations
    await this.loadFromDirectory(USER_INTEGRATIONS_DIR, 'user');
    
    // Load config-based integrations
    await this.loadFromConfig();
  }

  async loadFromDirectory(dir, source) {
    try {
      const files = await fsPromises.readdir(dir);
      
      for (const file of files) {
        if (file.endsWith('.json')) {
          const filePath = path.join(dir, file);
          try {
            const content = await fsPromises.readFile(filePath, 'utf8');
            const integration = JSON.parse(content);
            
            // Validate integration format
            if (this.validateIntegration(integration)) {
              const id = integration.id || path.basename(file, '.json');
              integration.id = id;
              integration.source = source;
              integration.filePath = filePath;
              
              this.integrations.set(id, integration);
              console.log(chalk.blue(`📦 Loaded ${source} integration: ${integration.name}`));
            }
          } catch (error) {
            console.warn(chalk.yellow(`⚠️  Failed to load integration from ${filePath}: ${error.message}`));
          }
        }
      }
    } catch (error) {
      // Directory doesn't exist or is empty - that's okay
    }
  }

  async loadFromConfig() {
    try {
      if (fs.existsSync(CONFIG_FILE)) {
        const config = JSON.parse(await fsPromises.readFile(CONFIG_FILE, 'utf8'));
        
        if (config.integrations) {
          for (const [id, integration] of Object.entries(config.integrations)) {
            if (this.validateIntegration(integration)) {
              integration.id = id;
              integration.source = 'config';
              this.integrations.set(id, integration);
              console.log(chalk.blue(`📦 Loaded config integration: ${integration.name}`));
            }
          }
        }
      }
    } catch (error) {
      console.warn(chalk.yellow(`⚠️  Failed to load integrations from config: ${error.message}`));
    }
  }

  validateIntegration(integration) {
    const required = ['name', 'description', 'actions'];
    for (const field of required) {
      if (!integration[field]) {
        console.warn(chalk.yellow(`⚠️  Integration missing required field: ${field}`));
        return false;
      }
    }
    
    // Validate actions
    if (!Array.isArray(integration.actions)) {
      console.warn(chalk.yellow(`⚠️  Integration actions must be an array`));
      return false;
    }
    
    for (const action of integration.actions) {
      if (!action.name || !action.description) {
        console.warn(chalk.yellow(`⚠️  Action missing name or description`));
        return false;
      }
    }
    
    return true;
  }

  setupWatchers() {
    // Watch directories for changes
    const watchDirectories = [INTEGRATIONS_DIR, USER_INTEGRATIONS_DIR];
    
    for (const dir of watchDirectories) {
      if (fs.existsSync(dir)) {
        try {
          const watcher = fs.watch(dir, { recursive: true }, (eventType, filename) => {
            if (filename && filename.endsWith('.json')) {
              console.log(chalk.cyan(`🔄 Integration file changed: ${filename}`));
              this.loadIntegrations();
            }
          });
          this.watchers.set(dir, watcher);
        } catch (error) {
          console.warn(chalk.yellow(`⚠️  Could not watch directory ${dir}: ${error.message}`));
        }
      }
    }
    
    // Watch config file
    if (fs.existsSync(CONFIG_FILE)) {
      try {
        const watcher = fs.watch(CONFIG_FILE, (eventType) => {
          console.log(chalk.cyan(`🔄 Integration config changed`));
          this.loadIntegrations();
        });
        this.watchers.set(CONFIG_FILE, watcher);
      } catch (error) {
        console.warn(chalk.yellow(`⚠️  Could not watch config file: ${error.message}`));
      }
    }
  }

  // Generate LLM tool descriptions from integrations
  generateToolDescriptions() {
    const tools = [];
    
    for (const [id, integration] of this.integrations) {
      for (const action of integration.actions) {
        const tool = {
          name: `${id}_${action.name}`,
          description: `${integration.description} - ${action.description}`,
          integration: id,
          action: action.name,
          parameters: action.parameters || {},
          authentication: integration.authentication || {},
          endpoint: action.endpoint || integration.baseUrl,
          method: action.method || 'GET',
          headers: action.headers || {},
          responseFormat: action.responseFormat || integration.responseFormat || 'json'
        };
        
        tools.push(tool);
      }
    }
    
    return tools;
  }

  // Let LLM decide which integration to use
  async selectIntegration(userRequest) {
    if (!this.isInitialized) {
      await this.initialize();
    }

    const integrationList = Array.from(this.integrations.values()).map(i => ({
      id: i.id,
      name: i.name,
      description: i.description,
      capabilities: i.capabilities || [],
      actions: i.actions.map(a => ({ name: a.name, description: a.description }))
    }));

    const prompt = `
User wants to: "${userRequest}"

Available integrations:
${JSON.stringify(integrationList, null, 2)}

Which integration and action should I use? Respond with JSON:
{
  "integration": "integration_id",
  "action": "action_name",
  "reasoning": "why this integration/action is best",
  "confidence": 0.9
}

If no integration fits, respond with:
{
  "integration": null,
  "reasoning": "explanation why no integration fits",
  "confidence": 0.0
}
`;

    try {
      const response = await chatCompletion([
        { role: 'user', content: prompt }
      ], {
        model: getDefaultModel(),
        temperature: 0.1
      });

      const result = JSON.parse(response.content);
      return result;
    } catch (error) {
      console.error('Failed to select integration:', error);
      return { integration: null, reasoning: 'Error selecting integration', confidence: 0.0 };
    }
  }

  // LLM constructs API call based on integration schema
  async constructApiCall(integrationId, actionName, userRequest, userParams = {}) {
    const integration = this.integrations.get(integrationId);
    if (!integration) {
      throw new Error(`Integration ${integrationId} not found`);
    }

    const action = integration.actions.find(a => a.name === actionName);
    if (!action) {
      throw new Error(`Action ${actionName} not found in integration ${integrationId}`);
    }

    const prompt = `
User request: "${userRequest}"
User parameters: ${JSON.stringify(userParams)}

Integration: ${integration.name}
Action: ${action.name}
Description: ${action.description}

Action schema:
${JSON.stringify(action, null, 2)}

Integration auth: ${JSON.stringify(integration.authentication || {}, null, 2)}
Base URL: ${integration.baseUrl || 'not specified'}

Construct the API call. Respond with JSON:
{
  "url": "full API endpoint URL",
  "method": "HTTP method",
  "headers": {
    "Content-Type": "application/json",
    ...other headers including auth
  },
  "body": { ...request body if needed },
  "parameters": { ...extracted parameters },
  "reasoning": "explain your parameter choices"
}

Extract parameter values from the user request intelligently.
`;

    try {
      const response = await chatCompletion([
        { role: 'user', content: prompt }
      ], {
        model: getDefaultModel(),
        temperature: 0.1
      });

      const apiCall = JSON.parse(response.content);
      
      // Add authentication if needed
      await this.addAuthentication(apiCall, integration);
      
      return apiCall;
    } catch (error) {
      console.error('Failed to construct API call:', error);
      throw new Error(`Failed to construct API call: ${error.message}`);
    }
  }

  async addAuthentication(apiCall, integration) {
    if (!integration.authentication) return;

    const auth = integration.authentication;
    
    switch (auth.type) {
      case 'api_key':
        if (auth.header) {
          apiCall.headers[auth.header] = auth.value || process.env[auth.envVar];
        } else if (auth.query) {
          apiCall.url += (apiCall.url.includes('?') ? '&' : '?') + 
            `${auth.query}=${auth.value || process.env[auth.envVar]}`;
        }
        break;
        
      case 'bearer':
        apiCall.headers['Authorization'] = `Bearer ${auth.value || process.env[auth.envVar]}`;
        break;
        
      case 'basic':
        const credentials = Buffer.from(
          `${auth.username || process.env[auth.usernameEnvVar]}:${auth.password || process.env[auth.passwordEnvVar]}`
        ).toString('base64');
        apiCall.headers['Authorization'] = `Basic ${credentials}`;
        break;
        
      case 'oauth':
        // OAuth handling would need to be implemented based on the specific flow
        console.warn('OAuth authentication not yet implemented');
        break;
    }
  }

  // Execute the API call
  async executeApiCall(apiCall) {
    const { default: fetch } = await import('node-fetch');
    
    const options = {
      method: apiCall.method,
      headers: apiCall.headers
    };
    
    if (apiCall.body && ['POST', 'PUT', 'PATCH'].includes(apiCall.method)) {
      options.body = JSON.stringify(apiCall.body);
    }
    
    try {
      const response = await fetch(apiCall.url, options);
      const data = await response.text();
      
      let parsedData;
      try {
        parsedData = JSON.parse(data);
      } catch {
        parsedData = data;
      }
      
      return {
        status: response.status,
        statusText: response.statusText,
        data: parsedData,
        success: response.ok
      };
    } catch (error) {
      return {
        status: 0,
        statusText: error.message,
        data: null,
        success: false,
        error: error.message
      };
    }
  }

  // Parse and present responses intelligently
  async parseResponse(response, integration, action, userRequest) {
    const prompt = `
Original user request: "${userRequest}"
Integration: ${integration.name}
Action: ${action.name}

API Response:
Status: ${response.status}
Data: ${JSON.stringify(response.data, null, 2)}

Parse this response and create a human-friendly summary. Focus on:
1. Whether the request was successful
2. Key information from the response
3. Any next steps or important details
4. Format it naturally, not as technical JSON

Response format hint: ${action.responseFormat || integration.responseFormat || 'auto'}
`;

    try {
      const llmResponse = await chatCompletion([
        { role: 'user', content: prompt }
      ], {
        model: getDefaultModel(),
        temperature: 0.3
      });

      return llmResponse.content;
    } catch (error) {
      console.error('Failed to parse response:', error);
      return `API call completed with status ${response.status}. Raw response: ${JSON.stringify(response.data)}`;
    }
  }

  // Main method: handle natural language request
  async handleRequest(userRequest, userParams = {}) {
    try {
      // Step 1: Select the best integration
      const selection = await this.selectIntegration(userRequest);
      
      if (!selection.integration) {
        return {
          success: false,
          message: `I couldn't find a suitable integration for your request. ${selection.reasoning}`,
          availableIntegrations: Array.from(this.integrations.keys())
        };
      }

      console.log(chalk.cyan(`🎯 Selected: ${selection.integration}.${selection.action} (confidence: ${selection.confidence})`));
      console.log(chalk.dim(`   Reasoning: ${selection.reasoning}`));

      // Step 2: Construct the API call
      const apiCall = await this.constructApiCall(selection.integration, selection.action, userRequest, userParams);
      console.log(chalk.cyan(`🔧 API Call: ${apiCall.method} ${apiCall.url}`));

      // Step 3: Execute the API call
      const response = await this.executeApiCall(apiCall);
      
      // Step 4: Parse and present the response
      const integration = this.integrations.get(selection.integration);
      const action = integration.actions.find(a => a.name === selection.action);
      const parsedResponse = await this.parseResponse(response, integration, action, userRequest);

      return {
        success: response.success,
        message: parsedResponse,
        integration: selection.integration,
        action: selection.action,
        rawResponse: response,
        apiCall: apiCall
      };
      
    } catch (error) {
      console.error('Error handling request:', error);
      return {
        success: false,
        message: `Error processing your request: ${error.message}`,
        error: error.message
      };
    }
  }

  // Save a new integration
  async saveIntegration(integration, toConfig = false) {
    if (!this.validateIntegration(integration)) {
      throw new Error('Invalid integration format');
    }

    if (toConfig) {
      // Save to integrations.json
      let config = {};
      if (fs.existsSync(CONFIG_FILE)) {
        config = JSON.parse(await fsPromises.readFile(CONFIG_FILE, 'utf8'));
      }
      
      if (!config.integrations) {
        config.integrations = {};
      }
      
      config.integrations[integration.id] = integration;
      await fsPromises.writeFile(CONFIG_FILE, JSON.stringify(config, null, 2));
    } else {
      // Save to file
      const filePath = path.join(USER_INTEGRATIONS_DIR, `${integration.id}.json`);
      await fsPromises.writeFile(filePath, JSON.stringify(integration, null, 2));
    }

    console.log(chalk.green(`✅ Integration ${integration.name} saved successfully`));
  }

  // Test an integration
  async testIntegration(integrationId, actionName = null, testData = {}) {
    const integration = this.integrations.get(integrationId);
    if (!integration) {
      throw new Error(`Integration ${integrationId} not found`);
    }

    const results = [];
    const actionsToTest = actionName ? 
      integration.actions.filter(a => a.name === actionName) : 
      integration.actions;

    for (const action of actionsToTest) {
      try {
        console.log(chalk.cyan(`🧪 Testing ${integrationId}.${action.name}...`));
        
        const testRequest = action.testRequest || `Test ${action.description}`;
        const result = await this.handleRequest(testRequest, testData);
        
        results.push({
          action: action.name,
          success: result.success,
          message: result.message,
          error: result.error
        });
        
        console.log(result.success ? 
          chalk.green(`✅ ${action.name}: Success`) : 
          chalk.red(`❌ ${action.name}: ${result.error || 'Failed'}`));
          
      } catch (error) {
        results.push({
          action: action.name,
          success: false,
          error: error.message
        });
        console.log(chalk.red(`❌ ${action.name}: ${error.message}`));
      }
    }

    return results;
  }

  // Get integration info
  getIntegration(id) {
    return this.integrations.get(id);
  }

  // List all integrations
  listIntegrations() {
    return Array.from(this.integrations.values());
  }

  // Remove integration
  async removeIntegration(id) {
    const integration = this.integrations.get(id);
    if (!integration) {
      throw new Error(`Integration ${id} not found`);
    }

    // Remove from file system if it has a file path
    if (integration.filePath && integration.source !== 'config') {
      await fsPromises.unlink(integration.filePath);
    }

    // Remove from config if it's a config integration
    if (integration.source === 'config') {
      const config = JSON.parse(await fsPromises.readFile(CONFIG_FILE, 'utf8'));
      delete config.integrations[id];
      await fsPromises.writeFile(CONFIG_FILE, JSON.stringify(config, null, 2));
    }

    this.integrations.delete(id);
    console.log(chalk.green(`✅ Integration ${id} removed`));
  }

  // Cleanup
  destroy() {
    for (const watcher of this.watchers.values()) {
      watcher.close();
    }
    this.watchers.clear();
    this.integrations.clear();
    this.isInitialized = false;
  }
}

// Create singleton instance
const dynamicIntegrationManager = new DynamicIntegrationManager();

// Export the manager and convenience functions
export default dynamicIntegrationManager;
export { DynamicIntegrationManager };

export async function handleDynamicIntegration(userRequest, userParams = {}) {
  if (!dynamicIntegrationManager.isInitialized) {
    await dynamicIntegrationManager.initialize();
  }
  return dynamicIntegrationManager.handleRequest(userRequest, userParams);
}

export async function listDynamicIntegrations() {
  if (!dynamicIntegrationManager.isInitialized) {
    await dynamicIntegrationManager.initialize();
  }
  return dynamicIntegrationManager.listIntegrations();
}

export async function testDynamicIntegration(integrationId, actionName, testData) {
  if (!dynamicIntegrationManager.isInitialized) {
    await dynamicIntegrationManager.initialize();
  }
  return dynamicIntegrationManager.testIntegration(integrationId, actionName, testData);
}

export async function saveDynamicIntegration(integration, toConfig = false) {
  if (!dynamicIntegrationManager.isInitialized) {
    await dynamicIntegrationManager.initialize();
  }
  return dynamicIntegrationManager.saveIntegration(integration, toConfig);
}