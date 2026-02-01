#!/usr/bin/env node

/**
 * CLI Interface for Dynamic Integration System
 * 
 * Commands:
 * - sr integration add         - Interactive wizard to define new integration
 * - sr integration list        - Show available integrations
 * - sr integration test <name> - Test an integration
 * - sr integration remove <id> - Remove an integration
 * - sr integration info <id>   - Show integration details
 */

import chalk from 'chalk';
import readline from 'readline';
import fs from 'fs';
import { promises as fsPromises } from 'fs';
import path from 'path';
import dynamicIntegrationManager, { 
  listDynamicIntegrations, 
  testDynamicIntegration, 
  saveDynamicIntegration,
  handleDynamicIntegration
} from './index.js';

// Create readline interface for prompts
function createInterface() {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
}

// Prompt user for input
function prompt(question) {
  return new Promise((resolve) => {
    const rl = createInterface();
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

// Validate URL format
function isValidUrl(string) {
  try {
    new URL(string);
    return true;
  } catch {
    return false;
  }
}

// Interactive wizard to add new integration
async function addIntegrationWizard() {
  console.log(chalk.blue.bold('\n🚀 Dynamic Integration Setup Wizard\n'));
  console.log(chalk.dim('This wizard will help you create a new integration that StaticRebel can use.'));
  console.log(chalk.dim('The LLM will automatically figure out how to use it based on your configuration.\n'));

  const integration = {
    actions: [],
    capabilities: [],
    authentication: {}
  };

  // Basic info
  integration.id = await prompt('Integration ID (e.g., "my-blog", "crm-system"): ');
  if (!integration.id || !/^[a-z0-9-_]+$/.test(integration.id)) {
    console.log(chalk.red('❌ Invalid ID. Use lowercase letters, numbers, hyphens, and underscores only.'));
    return;
  }

  integration.name = await prompt('Integration name (e.g., "My WordPress Blog"): ');
  if (!integration.name) {
    console.log(chalk.red('❌ Name is required.'));
    return;
  }

  integration.description = await prompt('Description (what does this integration do?): ');
  if (!integration.description) {
    console.log(chalk.red('❌ Description is required.'));
    return;
  }

  // Base URL (optional)
  const baseUrl = await prompt('Base URL (optional, e.g., "https://api.example.com"): ');
  if (baseUrl) {
    if (isValidUrl(baseUrl)) {
      integration.baseUrl = baseUrl;
    } else {
      console.log(chalk.yellow('⚠️  Invalid URL format, skipping base URL.'));
    }
  }

  // Capabilities
  console.log(chalk.cyan('\n📋 Capabilities (what can this integration do?)'));
  console.log(chalk.dim('Enter one per line, press Enter on empty line to finish:'));
  
  let capability;
  while ((capability = await prompt('Capability: '))) {
    integration.capabilities.push(capability);
  }

  // Authentication
  console.log(chalk.cyan('\n🔐 Authentication Setup'));
  const authType = await prompt('Authentication type (none/api_key/bearer/basic/oauth) [none]: ') || 'none';
  
  if (authType !== 'none') {
    integration.authentication.type = authType;
    
    switch (authType) {
      case 'api_key':
        integration.authentication.header = await prompt('API key header name (e.g., "X-API-Key"): ');
        integration.authentication.envVar = await prompt('Environment variable name (e.g., "MY_API_KEY"): ');
        break;
        
      case 'bearer':
        integration.authentication.envVar = await prompt('Environment variable name for token (e.g., "MY_TOKEN"): ');
        break;
        
      case 'basic':
        integration.authentication.usernameEnvVar = await prompt('Username environment variable: ');
        integration.authentication.passwordEnvVar = await prompt('Password environment variable: ');
        break;
        
      case 'oauth':
        console.log(chalk.yellow('OAuth setup is complex. You\'ll need to implement the flow manually.'));
        integration.authentication.clientId = await prompt('Client ID environment variable: ');
        integration.authentication.clientSecret = await prompt('Client Secret environment variable: ');
        break;
    }
  }

  // Actions
  console.log(chalk.cyan('\n⚡ Actions (what specific things can you do with this integration?)'));
  console.log(chalk.dim('You need at least one action. Examples: "create_post", "get_data", "send_notification"'));
  
  let actionCount = 0;
  while (true) {
    console.log(chalk.blue(`\n--- Action ${actionCount + 1} ---`));
    
    const action = {};
    
    action.name = await prompt('Action name (e.g., "create_post"): ');
    if (!action.name) {
      if (actionCount === 0) {
        console.log(chalk.red('❌ You need at least one action.'));
        continue;
      }
      break;
    }
    
    action.description = await prompt('Action description: ');
    if (!action.description) {
      console.log(chalk.red('❌ Description is required.'));
      continue;
    }
    
    action.method = (await prompt('HTTP method (GET/POST/PUT/DELETE) [POST]: ')) || 'POST';
    action.endpoint = await prompt('Endpoint path (e.g., "/posts", "/api/create"): ');
    
    // Parameters
    console.log(chalk.dim('Parameters (optional - the LLM will extract these from user requests):'));
    action.parameters = {};
    
    let paramName;
    while ((paramName = await prompt('Parameter name (or Enter to skip): '))) {
      const paramType = await prompt(`  Type for "${paramName}" (string/number/boolean/object) [string]: `) || 'string';
      const paramRequired = (await prompt(`  Is "${paramName}" required? (y/n) [n]: `)) === 'y';
      const paramDescription = await prompt(`  Description for "${paramName}": `);
      
      action.parameters[paramName] = {
        type: paramType,
        required: paramRequired,
        description: paramDescription || `${paramName} parameter`
      };
    }
    
    // Test request (optional)
    action.testRequest = await prompt('Test request example (optional): ');
    
    // Response format hint
    action.responseFormat = await prompt('Response format hint (json/xml/text/html) [json]: ') || 'json';
    
    integration.actions.push(action);
    actionCount++;
    
    const addAnother = await prompt('\nAdd another action? (y/n) [n]: ');
    if (addAnother !== 'y') break;
  }

  // Save location
  console.log(chalk.cyan('\n💾 Save Integration'));
  const saveToConfig = (await prompt('Save to config file (vs separate file)? (y/n) [n]: ')) === 'y';
  
  try {
    await saveDynamicIntegration(integration, saveToConfig);
    
    console.log(chalk.green.bold('\n✅ Integration created successfully!'));
    console.log(chalk.dim(`\nYou can now use natural language to interact with ${integration.name}:`));
    console.log(chalk.cyan(`  "Post this to my ${integration.name.toLowerCase()}"`));
    console.log(chalk.cyan(`  "Get data from ${integration.name.toLowerCase()}"`));
    console.log(chalk.cyan(`  "Update my ${integration.name.toLowerCase()} with this info"`));
    
    console.log(chalk.dim(`\nTest it with:`));
    console.log(chalk.white(`  sr integration test ${integration.id}`));
    
    if (integration.authentication.type !== 'none') {
      console.log(chalk.yellow(`\n⚠️  Don't forget to set your environment variables for authentication!`));
      if (integration.authentication.envVar) {
        console.log(chalk.dim(`  export ${integration.authentication.envVar}="your-key-here"`));
      }
      if (integration.authentication.usernameEnvVar) {
        console.log(chalk.dim(`  export ${integration.authentication.usernameEnvVar}="username"`));
        console.log(chalk.dim(`  export ${integration.authentication.passwordEnvVar}="password"`));
      }
    }
    
  } catch (error) {
    console.log(chalk.red(`❌ Failed to save integration: ${error.message}`));
  }
}

// List all integrations
async function listIntegrations() {
  try {
    const integrations = await listDynamicIntegrations();
    
    if (integrations.length === 0) {
      console.log(chalk.yellow('📦 No integrations found.'));
      console.log(chalk.dim('Create one with: sr integration add'));
      return;
    }
    
    console.log(chalk.blue.bold(`\n📦 Available Integrations (${integrations.length})\n`));
    
    const grouped = integrations.reduce((acc, integration) => {
      const source = integration.source || 'unknown';
      if (!acc[source]) acc[source] = [];
      acc[source].push(integration);
      return acc;
    }, {});
    
    for (const [source, items] of Object.entries(grouped)) {
      console.log(chalk.cyan.bold(`${source.toUpperCase()}:`));
      
      for (const integration of items) {
        console.log(`  ${chalk.white(integration.id)} - ${chalk.dim(integration.name)}`);
        console.log(`    ${chalk.dim(integration.description)}`);
        console.log(`    ${chalk.green(integration.actions.length + ' action(s)')}: ${integration.actions.map(a => a.name).join(', ')}`);
        
        if (integration.capabilities && integration.capabilities.length > 0) {
          console.log(`    ${chalk.blue('Capabilities')}: ${integration.capabilities.join(', ')}`);
        }
        
        console.log();
      }
    }
    
    console.log(chalk.dim('Use natural language to interact with integrations:'));
    console.log(chalk.cyan('  "Post this to my blog"'));
    console.log(chalk.cyan('  "Get my latest data"'));
    console.log(chalk.cyan('  "Send this notification"'));
    console.log(chalk.dim('\nOr test specific integrations:'));
    console.log(chalk.white('  sr integration test <id>'));
    
  } catch (error) {
    console.log(chalk.red(`❌ Error listing integrations: ${error.message}`));
  }
}

// Test integration
async function testIntegration(integrationId, actionName = null) {
  if (!integrationId) {
    console.log(chalk.red('❌ Integration ID is required'));
    console.log(chalk.dim('Usage: sr integration test <id> [action]'));
    return;
  }
  
  try {
    console.log(chalk.blue.bold(`\n🧪 Testing Integration: ${integrationId}\n`));
    
    const results = await testDynamicIntegration(integrationId, actionName, {});
    
    let successCount = 0;
    for (const result of results) {
      if (result.success) successCount++;
      
      const status = result.success ? chalk.green('✅ PASS') : chalk.red('❌ FAIL');
      console.log(`${status} ${chalk.white(result.action)}`);
      
      if (result.success) {
        console.log(chalk.dim(`  ${result.message}`));
      } else {
        console.log(chalk.red(`  Error: ${result.error}`));
      }
      console.log();
    }
    
    const summary = `${successCount}/${results.length} tests passed`;
    const summaryColor = successCount === results.length ? chalk.green : chalk.yellow;
    console.log(summaryColor.bold(`📊 Test Results: ${summary}`));
    
    if (successCount < results.length) {
      console.log(chalk.dim('\n💡 Tips for fixing failed tests:'));
      console.log(chalk.dim('  • Check your environment variables for authentication'));
      console.log(chalk.dim('  • Verify the API endpoints are correct'));
      console.log(chalk.dim('  • Make sure the service is accessible'));
    }
    
  } catch (error) {
    console.log(chalk.red(`❌ Error testing integration: ${error.message}`));
  }
}

// Show integration info
async function showIntegrationInfo(integrationId) {
  if (!integrationId) {
    console.log(chalk.red('❌ Integration ID is required'));
    return;
  }
  
  try {
    const integration = dynamicIntegrationManager.getIntegration(integrationId);
    if (!integration) {
      console.log(chalk.red(`❌ Integration ${integrationId} not found`));
      return;
    }
    
    console.log(chalk.blue.bold(`\n📋 Integration: ${integration.name}\n`));
    
    console.log(chalk.cyan('ID:'), integration.id);
    console.log(chalk.cyan('Description:'), integration.description);
    console.log(chalk.cyan('Source:'), integration.source || 'unknown');
    
    if (integration.baseUrl) {
      console.log(chalk.cyan('Base URL:'), integration.baseUrl);
    }
    
    if (integration.capabilities && integration.capabilities.length > 0) {
      console.log(chalk.cyan('Capabilities:'));
      for (const capability of integration.capabilities) {
        console.log(`  • ${capability}`);
      }
    }
    
    if (integration.authentication && integration.authentication.type !== 'none') {
      console.log(chalk.cyan('\nAuthentication:'), integration.authentication.type);
      if (integration.authentication.envVar) {
        console.log(`  Environment variable: ${integration.authentication.envVar}`);
      }
    }
    
    console.log(chalk.cyan(`\nActions (${integration.actions.length}):`));
    for (const action of integration.actions) {
      console.log(`\n  ${chalk.white.bold(action.name)} (${action.method || 'GET'})`);
      console.log(`  ${chalk.dim(action.description)}`);
      
      if (action.endpoint) {
        console.log(`  Endpoint: ${action.endpoint}`);
      }
      
      if (action.parameters && Object.keys(action.parameters).length > 0) {
        console.log(`  Parameters:`);
        for (const [name, param] of Object.entries(action.parameters)) {
          const required = param.required ? chalk.red('*') : '';
          console.log(`    • ${name}${required} (${param.type}) - ${param.description}`);
        }
      }
    }
    
    console.log(chalk.dim('\nUsage examples:'));
    console.log(chalk.white(`  sr integration test ${integrationId}`));
    console.log(chalk.cyan(`  "Use ${integration.name} to do something"`));
    
  } catch (error) {
    console.log(chalk.red(`❌ Error showing integration info: ${error.message}`));
  }
}

// Remove integration
async function removeIntegration(integrationId) {
  if (!integrationId) {
    console.log(chalk.red('❌ Integration ID is required'));
    return;
  }
  
  try {
    const integration = dynamicIntegrationManager.getIntegration(integrationId);
    if (!integration) {
      console.log(chalk.red(`❌ Integration ${integrationId} not found`));
      return;
    }
    
    console.log(chalk.yellow(`\n⚠️  You are about to remove integration: ${integration.name}`));
    const confirm = await prompt('Are you sure? (y/n): ');
    
    if (confirm.toLowerCase() === 'y') {
      await dynamicIntegrationManager.removeIntegration(integrationId);
      console.log(chalk.green(`✅ Integration ${integrationId} removed successfully`));
    } else {
      console.log('Cancelled.');
    }
    
  } catch (error) {
    console.log(chalk.red(`❌ Error removing integration: ${error.message}`));
  }
}

// Create example integration
async function createExample(type = 'rest') {
  const examples = {
    rest: {
      id: 'example-api',
      name: 'Example REST API',
      description: 'Generic REST API integration example',
      baseUrl: 'https://api.example.com',
      authentication: {
        type: 'api_key',
        header: 'X-API-Key',
        envVar: 'EXAMPLE_API_KEY'
      },
      capabilities: ['read data', 'create records', 'update information'],
      actions: [
        {
          name: 'get_data',
          description: 'Retrieve data from the API',
          method: 'GET',
          endpoint: '/data',
          parameters: {
            limit: { type: 'number', required: false, description: 'Number of items to return' },
            filter: { type: 'string', required: false, description: 'Filter criteria' }
          },
          responseFormat: 'json',
          testRequest: 'Get the latest data'
        },
        {
          name: 'create_item',
          description: 'Create a new item',
          method: 'POST',
          endpoint: '/items',
          parameters: {
            title: { type: 'string', required: true, description: 'Item title' },
            description: { type: 'string', required: false, description: 'Item description' },
            tags: { type: 'array', required: false, description: 'Item tags' }
          },
          responseFormat: 'json',
          testRequest: 'Create a test item'
        }
      ]
    },
    webhook: {
      id: 'webhook-service',
      name: 'Webhook Integration',
      description: 'Send data to webhook endpoints',
      capabilities: ['send notifications', 'trigger webhooks', 'post data'],
      authentication: {
        type: 'none'
      },
      actions: [
        {
          name: 'send_webhook',
          description: 'Send data to a webhook URL',
          method: 'POST',
          endpoint: '', // Will be provided by user
          parameters: {
            url: { type: 'string', required: true, description: 'Webhook URL' },
            payload: { type: 'object', required: true, description: 'Data to send' },
            headers: { type: 'object', required: false, description: 'Custom headers' }
          },
          responseFormat: 'json',
          testRequest: 'Send test data to webhook'
        }
      ]
    }
  };
  
  const example = examples[type];
  if (!example) {
    console.log(chalk.red(`❌ Unknown example type: ${type}`));
    console.log(chalk.dim('Available types: rest, webhook'));
    return;
  }
  
  try {
    await saveDynamicIntegration(example, false);
    console.log(chalk.green(`✅ Created example integration: ${example.name}`));
    console.log(chalk.dim(`Test it with: sr integration test ${example.id}`));
  } catch (error) {
    console.log(chalk.red(`❌ Error creating example: ${error.message}`));
  }
}

// Main CLI handler
export async function integrationCommand(args) {
  if (!args || args.length === 0) {
    console.log(chalk.blue.bold('\n🔌 Dynamic Integration System\n'));
    console.log('Available commands:');
    console.log(chalk.cyan('  add') + '                     - Create a new integration');
    console.log(chalk.cyan('  list') + '                    - List all integrations');
    console.log(chalk.cyan('  test <id>') + '              - Test an integration');
    console.log(chalk.cyan('  info <id>') + '              - Show integration details');
    console.log(chalk.cyan('  remove <id>') + '            - Remove an integration');
    console.log(chalk.cyan('  example [rest|webhook]') + '  - Create example integration');
    console.log(chalk.dim('\nNatural language usage:'));
    console.log(chalk.white('  "Post this to my blog"'));
    console.log(chalk.white('  "Get my latest data"'));
    console.log(chalk.white('  "Send this notification"'));
    return;
  }
  
  const [command, ...subArgs] = args;
  
  try {
    switch (command) {
      case 'add':
        await addIntegrationWizard();
        break;
        
      case 'list':
        await listIntegrations();
        break;
        
      case 'test':
        await testIntegration(subArgs[0], subArgs[1]);
        break;
        
      case 'info':
        await showIntegrationInfo(subArgs[0]);
        break;
        
      case 'remove':
        await removeIntegration(subArgs[0]);
        break;
        
      case 'example':
        await createExample(subArgs[0] || 'rest');
        break;
        
      default:
        console.log(chalk.red(`❌ Unknown command: ${command}`));
        console.log(chalk.dim('Use: sr integration --help'));
    }
  } catch (error) {
    console.log(chalk.red(`❌ Error: ${error.message}`));
  }
}

export default integrationCommand;