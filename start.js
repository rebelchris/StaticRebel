#!/usr/bin/env node

/**
 * Static Rebel - Startup Script
 * Runs the dashboard and assistant (with Telegram bot) together
 */

import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const processes = [];

function log(name, message, color = '\x1b[0m') {
  const timestamp = new Date().toLocaleTimeString();
  console.log(`${color}[${timestamp}] [${name}] ${message}\x1b[0m`);
}

function startProcess(name, script, color) {
  const proc = spawn('node', [script], {
    cwd: __dirname,
    stdio: ['inherit', 'pipe', 'pipe'],
    env: { ...process.env, FORCE_COLOR: '1' },
  });

  proc.stdout.on('data', (data) => {
    const lines = data.toString().trim().split('\n');
    lines.forEach((line) => {
      if (line.trim()) {
        console.log(`${color}[${name}]${'\x1b[0m'} ${line}`);
      }
    });
  });

  proc.stderr.on('data', (data) => {
    const lines = data.toString().trim().split('\n');
    lines.forEach((line) => {
      if (line.trim()) {
        console.log(`${color}[${name}]\x1b[31m ${line}\x1b[0m`);
      }
    });
  });

  proc.on('error', (err) => {
    log(name, `Failed to start: ${err.message}`, '\x1b[31m');
  });

  proc.on('exit', (code, signal) => {
    if (code !== null) {
      log(name, `Exited with code ${code}`, code === 0 ? '\x1b[32m' : '\x1b[31m');
    } else if (signal) {
      log(name, `Killed by signal ${signal}`, '\x1b[33m');
    }
  });

  processes.push({ name, proc });
  return proc;
}

function shutdown() {
  console.log('\n\x1b[33mShutting down...\x1b[0m');
  processes.forEach(({ name, proc }) => {
    log(name, 'Stopping...', '\x1b[33m');
    proc.kill('SIGTERM');
  });

  // Force kill after 5 seconds
  setTimeout(() => {
    processes.forEach(({ proc }) => {
      if (!proc.killed) {
        proc.kill('SIGKILL');
      }
    });
    process.exit(0);
  }, 5000);
}

// Handle shutdown signals
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// Banner
console.log('\x1b[36m');
console.log('╔════════════════════════════════════════════╗');
console.log('║         Static Rebel - Starting Up         ║');
console.log('╚════════════════════════════════════════════╝');
console.log('\x1b[0m');

// Start the dashboard
log('Dashboard', 'Starting on http://localhost:3456', '\x1b[35m');
startProcess('Dashboard', 'dashboard/server.js', '\x1b[35m');

// Small delay before starting assistant to avoid port conflicts
setTimeout(() => {
  log('Assistant', 'Starting (with Telegram bot if configured)', '\x1b[36m');
  startProcess('Assistant', 'assistant.js', '\x1b[36m');
}, 1000);

console.log('\n\x1b[90mPress Ctrl+C to stop all services\x1b[0m\n');
