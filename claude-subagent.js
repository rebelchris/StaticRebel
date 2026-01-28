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

const OLLAMA_HOST = process.env.OLLAMA_HOST || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'qwen3-coder';
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
        result = result.concat(listFilesRecursive(fullPath, maxDepth, currentDepth + 1));
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
 * Build system prompt with workspace context
 */
function buildSystemPrompt(workspace, systemPrompt = '') {
  const workspaceExists = fs.existsSync(workspace);
  const files = workspaceExists ? listFilesRecursive(workspace, 2) : [];

  let prompt = `You are a helpful coding assistant.

Current workspace: ${workspace}`;

  if (files.length > 0) {
    prompt += `\n\nDirectory structure (top 2 levels):\n${files.join('\n')}`;
  }

  if (systemPrompt) {
    prompt += `\n\nAdditional instructions:\n${systemPrompt}`;
  }

  return prompt;
}

/**
 * ClaudeSubagent - Manages coding tasks with any backend
 */
export class ClaudeSubagent {
  constructor(options = {}) {
    this.workspace = options.workspace || process.cwd();
    this.model = options.model || OLLAMA_MODEL;
    this.systemPrompt = options.systemPrompt || '';
    this.backendType = options.backend || BACKEND_TYPE;
    this.backend = this.createBackend(options);
  }

  createBackend(options = {}) {
    if (this.backendType === 'auto') {
      return autoDetectBackend();
    }
    return createBackend(this.backendType, {
      host: options.host || OLLAMA_HOST,
      model: options.model || this.model,
      apiKey: options.apiKey,
      baseUrl: options.baseUrl
    });
  }

  /**
   * Run a query with streaming
   */
  async query(prompt, options = {}) {
    const workspace = options.workspace || this.workspace;
    const model = options.model || this.model;
    const systemPrompt = options.systemPrompt || this.systemPrompt;

    const fullSystemPrompt = buildSystemPrompt(workspace, systemPrompt);

    const messages = [
      { role: 'system', content: fullSystemPrompt },
      { role: 'user', content: prompt }
    ];

    let output = '';

    return this.backend.stream(messages, {
      model,
      timeout: options.timeout || 120000,
      onChunk: (chunk, total) => {
        output = total;
        if (options.onOutput) options.onOutput(chunk);
      }
    }).then(() => ({ output }));
  }

  /**
   * Run a task in a directory with streaming
   */
  async run(task, options = {}) {
    const dir = options.workspace || this.workspace;
    const model = options.model || this.model;

    const fullSystemPrompt = buildSystemPrompt(dir, this.systemPrompt);
    const fullPrompt = `${fullSystemPrompt}\n\n---\n\nTask: ${task}`;

    let output = '';

    return this.backend.stream([
      { role: 'system', content: fullSystemPrompt },
      { role: 'user', content: fullPrompt }
    ], {
      model,
      timeout: options.timeout || 120000,
      onChunk: (chunk, total) => {
        output = total;
        if (options.onOutput) options.onOutput(chunk);
      }
    }).then(() => ({ output }));
  }

  /**
   * Chat with the model (non-streaming)
   */
  async chat(messages, options = {}) {
    const model = options.model || this.model;
    return this.backend.chat(messages, { model, timeout: options.timeout || 60000 });
  }

  /**
   * List available models
   */
  async listModels() {
    return this.backend.listModels();
  }
}

/**
 * Convenience function: Run a single query
 */
export async function claudeQuery(prompt, options = {}) {
  const subagent = new ClaudeSubagent({
    workspace: options.workspace || process.cwd(),
    model: options.model || OLLAMA_MODEL,
    systemPrompt: options.systemPrompt || '',
    backend: options.backend || BACKEND_TYPE
  });

  return subagent.query(prompt, options);
}

/**
 * Run subagent on a project directory with streaming
 */
export async function claudeInDir(dir, task, options = {}) {
  const subagent = new ClaudeSubagent({
    workspace: dir,
    model: options.model || OLLAMA_MODEL,
    systemPrompt: options.systemPrompt || '',
    backend: options.backend || BACKEND_TYPE
  });

  if (options.stream) {
    let output = '';
    await subagent.run(task, {
      onOutput: (chunk) => {
        output += chunk;
        process.stdout.write(chunk);
      }
    });
    return output;
  } else {
    const result = await subagent.run(task);
    return result.output;
  }
}

/**
 * Run non-streaming chat
 */
export async function claudeChat(messages, options = {}) {
  const subagent = new ClaudeSubagent({
    model: options.model || OLLAMA_MODEL,
    backend: options.backend || BACKEND_TYPE
  });

  return subagent.chat(messages, options);
}

/**
 * List models from current backend
 */
export async function listBackendModels() {
  const backend = autoDetectBackend();
  return backend.listModels();
}

// CLI interface
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  const param = args[1];

  if (command === 'run') {
    if (!param) {
      console.error('Usage: claude-subagent run <directory> "<task>"');
      process.exit(1);
    }
    const task = args.slice(2).join(' ');
    const result = await claudeInDir(param, task);
    console.log('\n--- Response ---');
    console.log(result);
  } else if (command === 'query') {
    const prompt = args.slice(1).join(' ');
    const result = await claudeQuery(prompt);
    console.log(result);
  } else if (command === 'chat') {
    // Interactive chat mode
    console.log('Claude Subagent Chat Mode');
    console.log('Type your message, /quit to exit\n');
    const readline = await import('readline');
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const subagent = new ClaudeSubagent();

    while (true) {
      const prompt = await new Promise(resolve => {
        rl.question('\x1b[36mYou:\x1b[0m ', resolve);
      });

      if (prompt.trim().toLowerCase() === '/quit') {
        console.log('Goodbye!');
        break;
      }

      console.log('\x1b[33mClaude:\x1b[0m ');
      const result = await subagent.query(prompt, {
        onOutput: (chunk) => process.stdout.write(chunk)
      });
      console.log('\n');
    }
    rl.close();
  } else if (command === 'models') {
    console.log('Available models:\n');
    const models = await listBackendModels();
    if (models.length === 0) {
      console.log('No models found. Make sure your backend is running.');
    } else {
      models.forEach(m => console.log(`  - ${m.name || m}`));
    }
  } else if (command === 'help') {
    console.log(`
Claude Subagent - Multi-backend coding assistant

Commands:
  run <dir> <task>  Run a task in a directory
  query "<prompt>"  Run a single query
  chat              Interactive chat mode
  models            List available models

Environment:
  BACKEND_TYPE      Backend: auto, ollama, anthropic, openai (default: auto)
  OLLAMA_HOST       Ollama host (default: http://localhost:11434)
  OLLAMA_MODEL      Ollama model (default: qwen3-coder)
  ANTHROPIC_API_KEY Anthropic API key (for Claude)
  OPENAI_API_KEY    OpenAI API key (for GPT)

Backend Selection:
  - "auto" tries: Anthropic -> OpenAI -> Ollama
  - Set BACKEND_TYPE=ollama to force Ollama
  - Set BACKEND_TYPE=anthropic to use Claude

Examples:
  node claude-subagent.js run ~/projects/my-app "Explain this codebase"
  BACKEND_TYPE=anthropic node claude-subagent.js query "What is 2+2?"
  node claude-subagent.js chat

Requires:
  - Ollama: https://ollama.com
  - Anthropic API key: https://anthropic.com
  - OpenAI API key: https://openai.com
`);
  } else {
    console.log('Claude Subagent - Multi-backend coding assistant');
    console.log('Run "node claude-subagent.js help" for usage');
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}
