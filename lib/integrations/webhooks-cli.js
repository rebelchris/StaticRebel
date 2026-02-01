/**
 * CLI handler for webhook management commands
 */

import chalk from 'chalk';
import { getWebhookManager, WebhookEventTypes } from './webhooks.js';

/**
 * Handle webhook CLI commands
 * @param {Array} args - Command arguments
 */
export async function webhookCommand(args) {
  if (args.length === 0) {
    return showWebhookHelp();
  }

  const command = args[0];
  const manager = getWebhookManager();

  try {
    switch (command) {
      case 'list':
      case 'ls':
        return await listWebhooks(manager);

      case 'add':
        return await addWebhook(manager, args.slice(1));

      case 'remove':
      case 'rm':
        return await removeWebhook(manager, args.slice(1));

      case 'test':
        return await testWebhook(manager, args.slice(1));

      case 'logs':
        return await showLogs(manager, args.slice(1));

      case 'stats':
        return await showStats(manager);

      case 'start':
        return await startWebhookServer(manager);

      case 'stop':
        return await stopWebhookServer(manager);

      case 'status':
        return await showStatus(manager);

      case 'templates':
        return showTemplates();

      case 'events':
        return showEventTypes();

      case 'help':
      case '--help':
      case '-h':
        return showWebhookHelp();

      default:
        return `${chalk.red('Error:')} Unknown webhook command '${command}'\n\n${showWebhookHelp()}`;
    }
  } catch (error) {
    return `${chalk.red('Error:')} ${error.message}`;
  }
}

function showWebhookHelp() {
  return `
${chalk.bold.blue('StaticRebel Webhook System')}

${chalk.bold('Usage:')} sr webhook <command> [options]

${chalk.bold('Commands:')}
  ${chalk.cyan('list')}             List all configured webhooks
  ${chalk.cyan('add')}              Add a new webhook
  ${chalk.cyan('remove <id>')}      Remove a webhook by ID
  ${chalk.cyan('test <id>')}        Test webhook connectivity
  ${chalk.cyan('logs')}             Show webhook delivery logs
  ${chalk.cyan('stats')}            Show webhook statistics
  ${chalk.cyan('start')}            Start incoming webhook server
  ${chalk.cyan('stop')}             Stop incoming webhook server
  ${chalk.cyan('status')}           Show webhook system status
  ${chalk.cyan('templates')}        Show available payload templates
  ${chalk.cyan('events')}           Show available event types

${chalk.bold('Examples:')}
  sr webhook list
  sr webhook add --name "Slack Notifications" --url "https://hooks.slack.com/..." --event "entry_logged"
  sr webhook test webhook-123
  sr webhook logs --days 7 --event "streak_milestone"

${chalk.bold('Incoming Webhooks:')}
  POST http://localhost:3001/webhook
  
  Headers:
    Content-Type: application/json
    X-Webhook-Event: log_entry|trigger_action|external_update
  
  Example payload:
    {
      "event": "log_entry",
      "content": "Had a great workout today!",
      "tags": ["fitness", "positive"],
      "mood": "energetic"
    }

${chalk.bold('Event Types:')}
  - entry_logged: When a new journal entry is logged
  - streak_milestone: When a streak milestone is reached
  - goal_reached: When a goal is completed
  - nudge: When a nudge/reminder is sent

For more information, see: ${chalk.underline('docs/webhooks.md')}
`;
}

async function listWebhooks(manager) {
  const webhooks = manager.listWebhooks();

  if (webhooks.length === 0) {
    return `${chalk.yellow('No webhooks configured.')}\n\nUse ${chalk.cyan('sr webhook add')} to create your first webhook.`;
  }

  let output = `${chalk.bold('Configured Webhooks:')}\n\n`;

  for (const webhook of webhooks) {
    const status = webhook.enabled !== false ? 
      chalk.green('✓ enabled') : 
      chalk.red('✗ disabled');
    
    const lastUsed = webhook.lastUsed ? 
      `Last used: ${new Date(webhook.lastUsed).toLocaleDateString()}` : 
      'Never used';

    output += `${chalk.bold(webhook.name)} ${chalk.gray(`(${webhook.id.substring(0, 8)}...)`)}\n`;
    output += `  Event: ${chalk.cyan(webhook.event)}\n`;
    output += `  URL: ${webhook.url}\n`;
    output += `  Status: ${status}\n`;
    output += `  ${chalk.gray(lastUsed)}\n\n`;
  }

  return output.trim();
}

async function addWebhook(manager, args) {
  // Parse arguments
  const options = parseAddWebhookArgs(args);
  
  if (!options.name) {
    return `${chalk.red('Error:')} Webhook name is required.\n\nExample: sr webhook add --name "My Webhook" --url "https://..." --event "entry_logged"`;
  }

  if (!options.url) {
    return `${chalk.red('Error:')} Webhook URL is required.\n\nExample: sr webhook add --name "My Webhook" --url "https://..." --event "entry_logged"`;
  }

  if (!options.event) {
    return `${chalk.red('Error:')} Event type is required.\n\nAvailable events: ${getAvailableEvents().join(', ')}`;
  }

  try {
    const webhook = await manager.addWebhook(options);
    
    return `${chalk.green('✓')} Webhook added successfully!\n\n` +
           `ID: ${webhook.id}\n` +
           `Name: ${webhook.name}\n` +
           `Event: ${webhook.event}\n` +
           `URL: ${webhook.url}\n\n` +
           `Test it with: ${chalk.cyan(`sr webhook test ${webhook.id.substring(0, 8)}`)}`;
  } catch (error) {
    return `${chalk.red('Error:')} ${error.message}`;
  }
}

function parseAddWebhookArgs(args) {
  const options = {};
  
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    if (arg === '--name' && args[i + 1]) {
      options.name = args[i + 1];
      i++;
    } else if (arg === '--url' && args[i + 1]) {
      options.url = args[i + 1];
      i++;
    } else if (arg === '--event' && args[i + 1]) {
      options.event = args[i + 1];
      i++;
    } else if (arg === '--secret' && args[i + 1]) {
      options.secret = args[i + 1];
      i++;
    } else if (arg === '--disabled') {
      options.enabled = false;
    } else if (arg.startsWith('--header-') && args[i + 1]) {
      if (!options.headers) options.headers = {};
      const headerName = arg.substring(9);
      options.headers[headerName] = args[i + 1];
      i++;
    }
  }
  
  return options;
}

async function removeWebhook(manager, args) {
  if (args.length === 0) {
    return `${chalk.red('Error:')} Webhook ID is required.\n\nExample: sr webhook remove <webhook-id>`;
  }

  const id = args[0];
  
  // Find webhook by partial ID match
  const webhooks = manager.listWebhooks();
  const matchingWebhooks = webhooks.filter(w => w.id.startsWith(id));

  if (matchingWebhooks.length === 0) {
    return `${chalk.red('Error:')} No webhook found with ID starting with '${id}'`;
  }

  if (matchingWebhooks.length > 1) {
    return `${chalk.red('Error:')} Multiple webhooks match '${id}':\n` +
           matchingWebhooks.map(w => `  ${w.id} - ${w.name}`).join('\n') +
           '\n\nPlease be more specific.';
  }

  const webhook = matchingWebhooks[0];
  
  try {
    await manager.removeWebhook(webhook.id);
    return `${chalk.green('✓')} Webhook '${webhook.name}' removed successfully.`;
  } catch (error) {
    return `${chalk.red('Error:')} ${error.message}`;
  }
}

async function testWebhook(manager, args) {
  if (args.length === 0) {
    return `${chalk.red('Error:')} Webhook ID is required.\n\nExample: sr webhook test <webhook-id>`;
  }

  const id = args[0];
  
  // Find webhook by partial ID match
  const webhooks = manager.listWebhooks();
  const matchingWebhooks = webhooks.filter(w => w.id.startsWith(id));

  if (matchingWebhooks.length === 0) {
    return `${chalk.red('Error:')} No webhook found with ID starting with '${id}'`;
  }

  if (matchingWebhooks.length > 1) {
    return `${chalk.red('Error:')} Multiple webhooks match '${id}':\n` +
           matchingWebhooks.map(w => `  ${w.id} - ${w.name}`).join('\n') +
           '\n\nPlease be more specific.';
  }

  const webhook = matchingWebhooks[0];
  
  try {
    console.log(`${chalk.blue('Testing webhook:')} ${webhook.name}...`);
    
    const result = await manager.testWebhook(webhook.id);
    
    if (result.success) {
      return `${chalk.green('✓')} Webhook test successful!\n\n` +
             `Response: ${result.response.statusCode}\n` +
             `Duration: ${result.response.duration}ms\n` +
             `Delivery ID: ${result.response.id}`;
    } else {
      return `${chalk.red('✗')} Webhook test failed!\n\n` +
             `Error: ${result.error.error}\n` +
             `Status: ${result.error.statusCode || 'No response'}\n` +
             `Duration: ${result.error.duration}ms`;
    }
  } catch (error) {
    return `${chalk.red('Error:')} ${error.message}`;
  }
}

async function showLogs(manager, args) {
  const options = parseLogArgs(args);
  const logs = await manager.getLogs(options);

  if (logs.length === 0) {
    return `${chalk.yellow('No webhook logs found')} for the specified criteria.`;
  }

  let output = `${chalk.bold('Webhook Delivery Logs')}\n\n`;

  // Group logs by date
  const logsByDate = {};
  for (const log of logs) {
    const date = new Date(log.timestamp).toDateString();
    if (!logsByDate[date]) logsByDate[date] = [];
    logsByDate[date].push(log);
  }

  for (const [date, dayLogs] of Object.entries(logsByDate)) {
    output += `${chalk.bold.underline(date)}\n`;
    
    for (const log of dayLogs) {
      const status = log.status === 'success' ? 
        chalk.green('✓') : 
        chalk.red('✗');
      
      const time = new Date(log.timestamp).toLocaleTimeString();
      const webhook = manager.getWebhook(log.webhookId);
      const webhookName = webhook ? webhook.name : log.webhookId.substring(0, 8);
      
      output += `  ${status} ${time} ${chalk.cyan(log.event)} → ${webhookName}`;
      
      if (log.status === 'success') {
        output += ` ${chalk.gray(`(${log.statusCode}, ${log.duration}ms)`)}`;
      } else {
        output += ` ${chalk.red(log.error)}`;
        if (log.attempt > 1) {
          output += chalk.gray(` (attempt ${log.attempt})`);
        }
      }
      
      output += '\n';
    }
    output += '\n';
  }

  return output.trim();
}

function parseLogArgs(args) {
  const options = {};
  
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    if (arg === '--days' && args[i + 1]) {
      options.days = parseInt(args[i + 1], 10);
      i++;
    } else if (arg === '--webhook' && args[i + 1]) {
      options.webhookId = args[i + 1];
      i++;
    } else if (arg === '--event' && args[i + 1]) {
      options.event = args[i + 1];
      i++;
    } else if (arg === '--status' && args[i + 1]) {
      options.status = args[i + 1];
      i++;
    }
  }
  
  return options;
}

async function showStats(manager) {
  const stats = await manager.getStats();

  let output = `${chalk.bold('Webhook System Statistics')}\n\n`;

  // Overall stats
  output += `${chalk.bold('Overview:')}\n`;
  output += `  Total webhooks: ${stats.totalWebhooks}\n`;
  output += `  Enabled webhooks: ${stats.enabledWebhooks}\n`;
  output += `  Today's deliveries: ${stats.today.deliveries}\n`;
  output += `  Success rate: ${stats.today.deliveries > 0 ? 
    Math.round((stats.today.successful / stats.today.deliveries) * 100) : 0}%\n\n`;

  // By event type
  if (Object.keys(stats.byEvent).length > 0) {
    output += `${chalk.bold('By Event Type:')}\n`;
    
    for (const [event, eventStats] of Object.entries(stats.byEvent)) {
      if (eventStats.webhooks > 0) {
        output += `  ${chalk.cyan(event)}:\n`;
        output += `    Webhooks: ${eventStats.webhooks}\n`;
        output += `    Today: ${eventStats.deliveries} (${eventStats.successful} successful, ${eventStats.failed} failed)\n`;
      }
    }
  }

  return output.trim();
}

async function startWebhookServer(manager) {
  try {
    if (manager.server) {
      return `${chalk.yellow('Webhook server is already running.')}`;
    }

    await manager.startIncomingServer();
    return `${chalk.green('✓')} Webhook server started on port ${manager.config.incomingPort}\n\n` +
           `Endpoint: POST http://localhost:${manager.config.incomingPort}${manager.config.incomingPath}`;
  } catch (error) {
    return `${chalk.red('Error:')} Failed to start webhook server: ${error.message}`;
  }
}

async function stopWebhookServer(manager) {
  try {
    if (!manager.server) {
      return `${chalk.yellow('Webhook server is not running.')}`;
    }

    await manager.shutdown();
    return `${chalk.green('✓')} Webhook server stopped.`;
  } catch (error) {
    return `${chalk.red('Error:')} Failed to stop webhook server: ${error.message}`;
  }
}

async function showStatus(manager) {
  const stats = await manager.getStats();
  
  let output = `${chalk.bold('Webhook System Status')}\n\n`;

  // Server status
  const serverStatus = manager.server ? 
    chalk.green('Running') : 
    chalk.red('Stopped');
  
  output += `Incoming server: ${serverStatus}`;
  if (manager.server) {
    output += ` (port ${manager.config.incomingPort})`;
  }
  output += '\n';

  // Configuration
  output += `Configuration:\n`;
  output += `  Data directory: ${manager.config.dataDir}\n`;
  output += `  Max retries: ${manager.config.maxRetries}\n`;
  output += `  Timeout: ${manager.config.timeoutMs}ms\n`;
  output += `  Log retention: ${manager.config.logRetentionDays} days\n\n`;

  // Webhooks
  output += `Webhooks: ${stats.totalWebhooks} total, ${stats.enabledWebhooks} enabled\n`;
  
  if (stats.totalWebhooks > 0) {
    output += `Today's activity: ${stats.today.deliveries} deliveries `;
    output += `(${stats.today.successful} successful, ${stats.today.failed} failed)\n`;
  }

  return output.trim();
}

function showTemplates() {
  const templates = [
    {
      event: 'entry_logged',
      description: 'Triggered when a journal entry is logged',
      fields: ['timestamp', 'user_id', 'entry.id', 'entry.content', 'entry.tags', 'entry.mood']
    },
    {
      event: 'streak_milestone',
      description: 'Triggered when a streak milestone is reached',
      fields: ['timestamp', 'user_id', 'streak.type', 'streak.current_count', 'streak.milestone', 'streak.achievement']
    },
    {
      event: 'goal_reached',
      description: 'Triggered when a goal is completed',
      fields: ['timestamp', 'user_id', 'goal.id', 'goal.title', 'goal.target', 'goal.achieved_value', 'goal.completion_date']
    },
    {
      event: 'nudge',
      description: 'Triggered when a nudge/reminder is sent',
      fields: ['timestamp', 'user_id', 'nudge.type', 'nudge.message', 'nudge.priority', 'nudge.context']
    }
  ];

  let output = `${chalk.bold('Webhook Payload Templates')}\n\n`;

  for (const template of templates) {
    output += `${chalk.cyan.bold(template.event)}\n`;
    output += `  ${template.description}\n`;
    output += `  Available fields: ${template.fields.map(f => chalk.yellow(`{{${f}}}`)).join(', ')}\n\n`;
  }

  output += `${chalk.bold('Template Variables:')}\n`;
  output += `  Use {{field_name}} syntax to insert dynamic values\n`;
  output += `  Nested fields use dot notation: {{entry.content}}\n`;
  output += `  Custom templates can be specified when adding webhooks\n`;

  return output.trim();
}

function showEventTypes() {
  const events = getAvailableEvents();
  
  let output = `${chalk.bold('Available Event Types')}\n\n`;

  const eventDescriptions = {
    entry_logged: 'When a new journal entry is logged',
    streak_milestone: 'When a streak milestone is reached (e.g., 10 days, 30 days)',
    goal_reached: 'When a goal is completed or achieved',
    nudge: 'When a nudge/reminder is sent to the user'
  };

  for (const event of events) {
    output += `${chalk.cyan(event)}\n`;
    output += `  ${eventDescriptions[event] || 'Custom event type'}\n\n`;
  }

  output += `${chalk.bold('Event Flow:')}\n`;
  output += `  1. StaticRebel emits an event (e.g., 'entry.logged')\n`;
  output += `  2. Webhook system catches the event\n`;
  output += `  3. Matching webhooks are triggered\n`;
  output += `  4. HTTP requests are sent with event data\n`;

  return output.trim();
}

function getAvailableEvents() {
  return ['entry_logged', 'streak_milestone', 'goal_reached', 'nudge'];
}

export default { webhookCommand };