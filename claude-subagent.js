#!/usr/bin/env node

/**
 * Claude Subagent - Runs a coding assistant via multiple model backends
 * Supports Ollama, Anthropic, and OpenAI with streaming output.
 */

import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import http from 'http';
import { createBackend, autoDetectBackend } from './model-backend.js';
import { loadConfig } from './lib/configManager.js';

const config = loadConfig();
const OLLAMA_HOST = process.env.OLLAMA_HOST || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || config?.models?.defaults?.general || 'ollama/qwen3-coder';
const BACKEND_TYPE = process.env.BACKEND_TYPE || 'auto';

/**
 * List files recursively up to a depth
 */
function listFilesRecursive(dir, maxDepth, currentDepth = 0) {
  if (currentDepth >= maxDepth) return [];

  try {
    const items = fs.readdirSync(dir);
    let result = [];

    for (const item of items) {
      if (item.startsWith('.') || item === 'node_modules') continue;

      const fullPath = path.join(dir, item);
      const stat = fs.statSync(fullPath);
      const indent = '  '.repeat(currentDepth);

      if (stat.isDirectory()) {
        result.push(`${indent}[dir] ${item}/`);
        result = result.concat(
          listFilesRecursive(fullPath, maxDepth, currentDepth + 1),
        );
      } else {
        result.push(`${indent} ${item}`);
      }
    }

    return result;
  } catch {
    return [];
  }
}

/**
 * Get project context
 */
function getProjectContext() {
  const cwd = process.cwd();
  const files = listFilesRecursive(cwd, 2);

  // Try to read package.json
  let packageInfo = '';
  try {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(cwd, 'package.json'), 'utf-8'),
    );
    packageInfo = `\nProject: ${pkg.name || 'unknown'}\nDescription: ${pkg.description || 'N/A'}\n`;
  } catch {
    // ignore
  }

  return `Current directory: ${cwd}\n${packageInfo}\nFiles:\n${files.slice(0, 30).join('\n')}`;
}

/**
 * Main execution
 */
async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'chat';

  if (command === 'chat') {
    const prompt =
      args.slice(1).join(' ') || 'Hello! How can you help me today?';
    const backend = await autoDetectBackend(BACKEND_TYPE);

    console.log(`Using backend: ${backend.name}\n`);

    const context = getProjectContext();
    const messages = [
      {
        role: 'system',
        content: `You are a helpful coding assistant. You have access to the following project context:\n\n${context}`,
      },
      { role: 'user', content: prompt },
    ];

    try {
      const response = await backend.chat(messages);
      console.log('\n' + response);
    } catch (err) {
      console.error('Error:', err.message);
      process.exit(1);
    }
  } else if (command === 'stream') {
    const prompt = args.slice(1).join(' ') || 'Hello!';
    const backend = await autoDetectBackend(BACKEND_TYPE);

    console.log(`Streaming with backend: ${backend.name}\n`);

    const context = getProjectContext();
    const messages = [
      {
        role: 'system',
        content: `You are a helpful coding assistant.\n\n${context}`,
      },
      { role: 'user', content: prompt },
    ];

    try {
      for await (const chunk of backend.stream(messages)) {
        process.stdout.write(chunk);
      }
      console.log();
    } catch (err) {
      console.error('Error:', err.message);
      process.exit(1);
    }
  } else {
    console.log(
      'Usage: node claude-subagent.js [chat|stream] "your prompt here"',
    );
  }
}

main();
