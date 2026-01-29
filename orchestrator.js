#!/usr/bin/env node

/**
 * Orchestrator Interface - Unified streaming interface for Ollama + Claude Code CLI
 *
 * This module bridges local Ollama models with the Claude Code CLI for:
 * - Streaming sub-responses from both sources
 * - Unified output feed for real-time updates
 * - Intelligent routing between local and remote capabilities
 *
 * Usage:
 *   node orchestrator.js chat "Hello"              # Quick Ollama chat
 *   node orchestrator.js claude "fix this bug"     # Spawn Claude Code CLI
 *   node orchestrator.js orchestrated "research X" # Intelligent routing
 *   node orchestrator.js stream "prompt"           # Dual-stream output
 */

import { spawn } from 'child_process';
import readline from 'readline';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const OLLAMA_HOST = process.env.OLLAMA_HOST || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'qwen3-coder';
const CLAUDE_CLI_PATH =
  process.env.CLAUDE_CLI_PATH || '/Users/charlizebongers/.local/bin/claude';

// ============================================================================
// Ollama Integration
// ============================================================================

/**
 * Stream response from local Ollama model
 */
export async function* streamOllama(prompt, options = {}) {
  const model = options.model || OLLAMA_MODEL;
  const host = options.host || OLLAMA_HOST;

  const requestBody = {
    model,
    prompt,
    stream: true,
    options: {
      temperature: options.temperature || 0.7,
      num_predict: options.maxTokens || 2048,
    },
  };

  const url = new URL(host);
  const response = await fetch(`${host}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    throw new Error(`Ollama error: ${response.status} ${response.statusText}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value);
    const lines = chunk.split('\n').filter((line) => line.trim());

    for (const line of lines) {
      try {
        const data = JSON.parse(line);
        if (data.response) {
          yield { source: 'ollama', content: data.response, done: data.done };
        }
      } catch (e) {
        // Ignore parse errors
      }
    }
  }
}

/**
 * Non-streaming Ollama chat
 */
export async function chatOllama(prompt, options = {}) {
  const chunks = [];
  for await (const chunk of streamOllama(prompt, options)) {
    chunks.push(chunk.content);
    if (chunk.done) break;
  }
  return chunks.join('');
}

// ============================================================================
// Claude Code CLI Integration
// ============================================================================

/**
 * Spawn Claude Code CLI process
 */
export function spawnClaudeCode(prompt, options = {}) {
  const args = ['-p', prompt];

  if (options.allowTools) {
    args.push('--allow-tools', options.allowTools.join(','));
  }

  if (options.verbose) {
    args.push('--verbose');
  }

  return spawn(CLAUDE_CLI_PATH, args, {
    stdio: ['inherit', 'pipe', 'pipe'],
    cwd: options.cwd || process.cwd(),
  });
}

/**
 * Stream Claude Code CLI output
 */
export async function* streamClaudeCode(prompt, options = {}) {
  const proc = spawnClaudeCode(prompt, options);

  yield { source: 'claude', type: 'start', content: 'Claude Code CLI started' };

  // Handle stdout
  const stdoutRl = readline.createInterface({ input: proc.stdout });
  for await (const line of stdoutRl) {
    yield { source: 'claude', type: 'stdout', content: line };
  }

  // Handle stderr
  const stderrRl = readline.createInterface({ input: proc.stderr });
  for await (const line of stderrRl) {
    yield { source: 'claude', type: 'stderr', content: line };
  }

  // Wait for exit
  const exitCode = await new Promise((resolve) => {
    proc.on('close', resolve);
  });

  yield { source: 'claude', type: 'end', exitCode };
}

// ============================================================================
// Intelligent Routing
// ============================================================================

/**
 * Determine best routing for a task
 */
export function routeTask(prompt) {
  const lower = prompt.toLowerCase();

  // Tasks better suited for Claude Code
  const claudePatterns = [
    /fix.*bug/i,
    /debug/i,
    /refactor/i,
    /code review/i,
    /architecture/i,
    /complex.*change/i,
    /multi.*file/i,
    /across.*codebase/i,
    /claude/i,
  ];

  // Check if any pattern matches
  const needsClaude = claudePatterns.some((pattern) => pattern.test(lower));

  return {
    route: needsClaude ? 'claude' : 'ollama',
    confidence: needsClaude ? 0.9 : 0.7,
    reasoning: needsClaude
      ? 'Task involves complex code changes that benefit from Claude Code CLI'
      : 'Task is suitable for local Ollama model',
  };
}

/**
 * Execute task with intelligent routing
 */
export async function* orchestrate(prompt, options = {}) {
  const routing = routeTask(prompt);

  yield {
    source: 'orchestrator',
    type: 'routing',
    route: routing.route,
    confidence: routing.confidence,
    reasoning: routing.reasoning,
  };

  if (routing.route === 'claude') {
    yield* streamClaudeCode(prompt, options);
  } else {
    yield* streamOllama(prompt, options);
  }
}

// ============================================================================
// Dual Stream Output
// ============================================================================

/**
 * Stream from both sources simultaneously
 */
export async function* dualStream(prompt, options = {}) {
  const ollamaStream = streamOllama(prompt, options);
  const claudeStream = streamClaudeCode(prompt, options);

  // Use async iterators to merge streams
  const ollamaIter = ollamaStream[Symbol.asyncIterator]();
  const claudeIter = claudeStream[Symbol.asyncIterator]();

  let ollamaDone = false;
  let claudeDone = false;

  while (!ollamaDone || !claudeDone) {
    const promises = [];

    if (!ollamaDone) {
      promises.push(
        ollamaIter.next().then((result) => {
          if (result.done) {
            ollamaDone = true;
            return null;
          }
          return result.value;
        }),
      );
    }

    if (!claudeDone) {
      promises.push(
        claudeIter.next().then((result) => {
          if (result.done) {
            claudeDone = true;
            return null;
          }
          return result.value;
        }),
      );
    }

    const result = await Promise.race(promises);
    if (result) {
      yield result;
    }
  }
}

// ============================================================================
// CLI Interface
// ============================================================================

async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'chat';
  const prompt = args.slice(1).join(' ');

  if (!prompt) {
    console.log('Usage: node orchestrator.js <command> "your prompt"');
    console.log('');
    console.log('Commands:');
    console.log('  chat "prompt"         - Quick Ollama chat');
    console.log('  claude "prompt"       - Spawn Claude Code CLI');
    console.log('  orchestrated "prompt" - Intelligent routing');
    console.log('  stream "prompt"       - Dual-stream output');
    process.exit(1);
  }

  switch (command) {
    case 'chat': {
      console.log('🤖 Ollama:\n');
      for await (const chunk of streamOllama(prompt)) {
        process.stdout.write(chunk.content);
        if (chunk.done) break;
      }
      console.log('\n');
      break;
    }

    case 'claude': {
      console.log('🧠 Claude Code CLI:\n');
      for await (const event of streamClaudeCode(prompt)) {
        if (event.type === 'stdout' || event.type === 'stderr') {
          console.log(event.content);
        }
      }
      break;
    }

    case 'orchestrated': {
      console.log('🎯 Orchestrated:\n');
      for await (const event of orchestrate(prompt)) {
        if (event.type === 'routing') {
          console.log(
            `[Routing to ${event.route} with ${(event.confidence * 100).toFixed(0)}% confidence]`,
          );
          console.log(`Reason: ${event.reasoning}\n`);
        } else if (event.content) {
          process.stdout.write(event.content);
        }
      }
      console.log('\n');
      break;
    }

    case 'stream': {
      console.log('🌊 Dual Stream:\n');
      for await (const event of dualStream(prompt)) {
        const prefix = event.source === 'ollama' ? '[O]' : '[C]';
        if (event.content && typeof event.content === 'string') {
          console.log(`${prefix} ${event.content}`);
        }
      }
      break;
    }

    default:
      console.error(`Unknown command: ${command}`);
      process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}
