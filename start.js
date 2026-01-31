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

function startProcess(name, command, args, color) {
  const proc = spawn(command, args, {
    cwd: __dirname,
    stdio: ['inherit', 'pipe', 'pipe'],
    env: { ...process.env, FORCE_COLOR: '1' },
    shell: process.platform === 'win32',
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
    log(name, `Exited with code ${code} (signal: ${signal})`, '\x1b[33m');
  });

  processes.push({ name, proc });
  return proc;
}

// Graceful shutdown
process.on('SIGINT', () => {
  log('START', 'Shutting down all services...', '\x1b[33m');
  processes.forEach(({ name, proc }) => {
    log('START', `Stopping ${name}...`, '\x1b[33m');
    proc.kill('SIGTERM');
  });
  setTimeout(() => process.exit(0), 1000);
});

// Start services
log('START', 'Starting Static Rebel services...', '\x1b[36m');

// Start Dashboard
startProcess('DASHBOARD', 'npm', ['run', 'dashboard'], '\x1b[35m');

// Start Assistant
startProcess('ASSISTANT', 'npm', ['run', 'assistant'], '\x1b[34m');

log('START', 'All services started! Press Ctrl+C to stop.', '\x1b[32m');
