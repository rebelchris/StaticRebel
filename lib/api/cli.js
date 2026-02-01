/**
 * StaticRebel API CLI Commands
 */

import { StaticRebelAPIServer } from './server.js';

export async function apiCommand(args) {
  const command = args[0];
  
  switch (command) {
    case 'start':
      return await startApiServer(args.slice(1));
    case 'stop':
      return 'API server stop command not implemented yet';
    case 'status':
      return await getApiStatus();
    case 'key':
      return await getApiKey();
    default:
      return getApiHelp();
  }
}

async function startApiServer(args) {
  try {
    const options = parseStartOptions(args);
    const server = new StaticRebelAPIServer(options);
    
    console.log('🚀 Starting StaticRebel API Server...');
    await server.start();
    
    // Keep the process running
    process.on('SIGINT', () => {
      console.log('\n🛑 Shutting down StaticRebel API Server...');
      process.exit(0);
    });
    
    // Return a message but don't exit the process
    return 'API Server is running. Press Ctrl+C to stop.';
  } catch (error) {
    throw new Error(`Failed to start API server: ${error.message}`);
  }
}

function parseStartOptions(args) {
  const options = {};
  
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    if (arg === '--port' || arg === '-p') {
      const port = parseInt(args[i + 1]);
      if (isNaN(port) || port < 1 || port > 65535) {
        throw new Error('Invalid port number');
      }
      options.port = port;
      i++; // Skip next argument
    } else if (arg === '--cors') {
      options.cors = args[i + 1] || '*';
      i++; // Skip next argument
    } else if (arg === '--help' || arg === '-h') {
      console.log(getStartHelp());
      process.exit(0);
    }
  }
  
  return options;
}

async function getApiStatus() {
  try {
    const fetch = (await import('node-fetch')).default;
    const port = process.env.SR_API_PORT || 3000;
    
    const response = await fetch(`http://localhost:${port}/health`);
    if (response.ok) {
      const data = await response.json();
      return `✅ API Server is running on port ${port}\nStatus: ${data.status}\nVersion: ${data.version}`;
    } else {
      return '❌ API Server is not responding';
    }
  } catch (error) {
    return '❌ API Server is not running';
  }
}

async function getApiKey() {
  const envKey = process.env.SR_API_KEY;
  if (envKey) {
    return `🔐 API Key (from environment): ${envKey}`;
  } else {
    // Generate default key same way as server
    const crypto = await import('crypto');
    const os = await import('os');
    const machineId = process.env.HOSTNAME || os.hostname();
    const defaultKey = crypto.createHash('sha256').update(`staticrebel-${machineId}`).digest('hex').substring(0, 32);
    return `🔐 API Key (default): ${defaultKey}\n\n💡 Tip: Set SR_API_KEY environment variable for a custom key`;
  }
}

function getApiHelp() {
  return `StaticRebel API Commands

Usage: sr api <command> [options]

Commands:
  start [options]    Start the API server
  stop              Stop the API server
  status            Check API server status
  key               Show the current API key

Examples:
  sr api start                 # Start server on default port 3000
  sr api start --port 8080     # Start server on port 8080
  sr api start --cors "*"      # Start with custom CORS setting
  sr api status               # Check if server is running
  sr api key                  # Show API key

Environment Variables:
  SR_API_PORT         Port for API server (default: 3000)
  SR_API_KEY          Custom API key (default: auto-generated)
  SR_API_CORS_ORIGIN  CORS origin setting (default: "*")`;
}

function getStartHelp() {
  return `Start StaticRebel API Server

Usage: sr api start [options]

Options:
  --port, -p <number>    Port to run the server on (default: 3000)
  --cors <origin>        CORS origin setting (default: "*")
  --help, -h             Show this help message

Examples:
  sr api start                 # Default settings
  sr api start --port 8080     # Custom port
  sr api start --cors localhost:3000  # Specific CORS origin

The API provides these endpoints:
  GET  /api/skills             List all skills
  GET  /api/skills/:id/entries Get entries for a skill
  POST /api/skills/:id/log     Log an entry for a skill
  GET  /api/stats              Get usage statistics
  GET  /api/streaks            Get current streaks
  POST /api/reminders          Create a reminder
  GET  /api/docs               OpenAPI documentation

Authentication:
  Include X-API-Key header with your API key
  Get your API key with: sr api key`;
}