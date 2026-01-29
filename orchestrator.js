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
const CLAUDE_CLI_PATH = process.env.CLAUDE_CLI_PATH || '/Users/charlizebongers/.local/bin/claude';

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
      num_predict: options.maxTokens || 2048
    }
  };

  // Yield thinking state
  yield { type: 'thinking', source: 'ollama', content: `Thinking with ${model}...` };

  try {
    const response = await fetch(`${host}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      yield { type: 'error', source: 'ollama', content: `Ollama error: ${response.statusText}` };
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value);
      const lines = chunk.split('\n').filter(l => l.trim());

      for (const line of lines) {
        try {
          const data = JSON.parse(line);
          if (data.response) {
            yield { type: 'token', source: 'ollama', content: data.response };
          }
          if (data.done) {
            yield { type: 'done', source: 'ollama' };
          }
        } catch (e) {
          // Ignore parse errors for partial chunks
        }
      }
    }
  } catch (error) {
    yield { type: 'error', source: 'ollama', content: error.message };
  }
}

/**
 * Simple non-streaming Ollama chat
 */
export async function chatOllama(prompt, options = {}) {
  const model = options.model || OLLAMA_MODEL;
  const host = options.host || OLLAMA_HOST;

  const requestBody = {
    model,
    prompt,
    stream: false,
    options: {
      temperature: options.temperature || 0.7,
      num_predict: options.maxTokens || 2048
    }
  };

  try {
    const response = await fetch(`${host}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      throw new Error(`Ollama error: ${response.statusText}`);
    }

    const data = await response.json();
    return data.response;
  } catch (error) {
    return `[Ollama Error] ${error.message}`;
  }
}

// ============================================================================
// Claude Code CLI Integration
// ============================================================================

/**
 * Spawn Claude Code CLI as a subprocess with streaming output
 */
export async function* streamClaudeCode(prompt, options = {}) {
  const workspace = options.workspace || process.cwd();
  const verbose = options.verbose !== false;

  // Check if Claude CLI exists
  if (!fs.existsSync(CLAUDE_CLI_PATH)) {
    yield { type: 'error', source: 'claude-code', content: `Claude CLI not found at ${CLAUDE_CLI_PATH}` };
    return;
  }

  yield { type: 'thinking', source: 'claude-code', content: 'Spawning Claude Code CLI...' };

  // Build command - use claude CLI with the task
  const args = ['--print', '--no-color', prompt];

  const proc = spawn(CLAUDE_CLI_PATH, args, {
    cwd: workspace,
    env: { ...process.env, ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || '' },
    stdio: ['pipe', 'pipe', 'pipe']
  });

  let buffer = '';
  let stderrBuffer = '';

  // Yield thinking state
  yield { type: 'thinking', source: 'claude-code', content: 'Claude Code is thinking...' };

  // stdout stream
  for await (const chunk of proc.stdout) {
    const text = new TextDecoder().decode(chunk);
    buffer += text;
    yield { type: 'token', source: 'claude-code', content: text };
  }

  // stderr (for debugging/info)
  proc.stderr.on('data', (chunk) => {
    stderrBuffer += new TextDecoder().decode(chunk);
  });

  // Wait for completion
  await new Promise((resolve, reject) => {
    proc.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Claude Code exited with code ${code}: ${stderrBuffer}`));
      }
    });
    proc.on('error', reject);
  });

  yield { type: 'done', source: 'claude-code' };
}

/**
 * Run Claude Code CLI with full session support
 */
export async function runClaudeCode(task, options = {}) {
  const workspace = options.workspace || process.cwd();

  if (!fs.existsSync(CLAUDE_CLI_PATH)) {
    return `[Error] Claude CLI not found at ${CLAUDE_CLI_PATH}`;
  }

  return new Promise((resolve, reject) => {
    const args = ['--print', '--no-color', task];
    const proc = spawn(CLAUDE_CLI_PATH, args, {
      cwd: workspace,
      env: { ...process.env },
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => {
      stdout += new TextDecoder().decode(data);
    });

    proc.stderr.on('data', (data) => {
      stderr += new TextDecoder().decode(data);
    });

    proc.on('close', (code) => {
      if (code === 0) {
        resolve(stdout);
      } else {
        reject(new Error(`Claude Code error (${code}): ${stderr}`));
      }
    });

    proc.on('error', reject);
  });
}

// ============================================================================
// Unified Streaming Output
// ============================================================================

/**
 * Merge multiple streams into a single output with source tracking
 */
export async function* mergeStreams(streams) {
  const iterators = [];
  const sources = [];

  for (const [name, stream] of streams) {
    iterators.push(stream[Symbol.asyncIterator]());
    sources.push({ name, iterator: iterators.last, done: false });
  }

  while (true) {
    let allDone = true;
    let tokens = [];

    for (let i = 0; i < iterators.length; i++) {
      if (sources[i].done) continue;

      const result = await iterators[i].next();
      if (result.done) {
        sources[i].done = true;
      } else {
        allDone = false;
        tokens.push({ source: sources[i].name, ...result.value });
      }
    }

    if (allDone) break;
    if (tokens.length > 0) yield tokens;
  }
}

/**
 * Display merged streams to console with source prefixes
 */
export async function displayMergedStreams(streams, options = {}) {
  const { prefix = '  ', showSources = true } = options;

  for await (const tokens of mergeStreams(streams)) {
    for (const token of tokens) {
      if (token.type === 'thinking') {
        console.log(`${prefix}[${token.source.toUpperCase()}] ${token.content}`);
      } else if (token.type === 'token') {
        const sourcePrefix = showSources ? `[${token.source.toUpperCase()}] ` : '';
        process.stdout.write(`${prefix}${sourcePrefix}${token.content}`);
      } else if (token.type === 'error') {
        console.log(`\n${prefix}ERROR [${token.source}]: ${token.content}`);
      } else if (token.type === 'done') {
        console.log(`\n${prefix}[${token.source.toUpperCase()}] Done`);
      }
    }
  }
  console.log('');
}

// ============================================================================
// Intelligent Orchestration
// ============================================================================

/**
 * Determine whether to use Ollama or Claude Code based on task complexity
 */
export function routeTask(task) {
  const taskLower = task.toLowerCase();

  // Claude Code for complex coding/debugging
  const codingPatterns = [
    /debug/i, /fix (the )?bug/i, /refactor/i, /architecture/i,
    /review (all )?code/i, /explain (this )?codebase/i,
    /implement (complex|advanced)/i, /design pattern/i,
    /unit test/i, /migration/i, /security audit/i
  ];

  // Ollama for quick/light tasks
  const quickPatterns = [
    /what is/i, /how (do|to)/i, /explain/i, /summarize/i,
    /write (a |some )?(simple|basic)? ?(code|function|comment)/i
  ];

  for (const pattern of codingPatterns) {
    if (pattern.test(taskLower)) {
      return 'claude-code';
    }
  }

  for (const pattern of quickPatterns) {
    if (pattern.test(taskLower)) {
      return 'ollama';
    }
  }

  // Default: both in parallel for complex tasks
  return 'orchestrate';
}

/**
 * Orchestrate a task - uses best backend(s) based on task analysis
 */
export async function orchestrate(task, options = {}) {
  const route = options.route || routeTask(task);
  const verbose = options.verbose !== false;

  if (verbose) {
    console.log(`\n[ORCHESTRATOR] Task: "${task.substring(0, 50)}..."`);
    console.log(`[ORCHESTRATOR] Route: ${route}\n`);
  }

  switch (route) {
    case 'ollama':
      for await (const token of streamOllama(task, options)) {
        if (token.type === 'token') {
          process.stdout.write(token.content);
        } else if (token.type === 'thinking') {
          if (verbose) console.log(`[OLLAMA] ${token.content}`);
        } else if (token.type === 'done') {
          if (verbose) console.log('\n[OLLAMA] Response complete');
        } else if (token.type === 'error') {
          console.log(`\n[ERROR] ${token.content}`);
        }
      }
      break;

    case 'claude-code':
      for await (const token of streamClaudeCode(task, options)) {
        if (token.type === 'token') {
          process.stdout.write(token.content);
        } else if (token.type === 'thinking') {
          if (verbose) console.log(`[CLAUDE] ${token.content}`);
        } else if (token.type === 'done') {
          if (verbose) console.log('\n[CLAUDE] Response complete');
        } else if (token.type === 'error') {
          console.log(`\n[ERROR] ${token.content}`);
        }
      }
      break;

    case 'orchestrate':
      // Run both in parallel and merge streams
      const streams = [
        ['OLLAMA', streamOllama(task, options)],
        ['CLAUDE', streamClaudeCode(task, options)]
      ];

      await displayMergedStreams(streams, { showSources: true });
      break;

    default:
      throw new Error(`Unknown route: ${route}`);
  }
}

// ============================================================================
// Interactive Mode
// ============================================================================

async function interactiveMode() {
  console.log('\n=== Orchestrator Interface ===');
  console.log('Local Ollama + Claude Code CLI');
  console.log('Type /quit to exit, /route ollama|claude|auto to force route\n');

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  let currentRoute = 'auto';

  const ask = () => {
    rl.question('\n> ', async (question) => {
      const q = question.trim();

      if (!q) { ask(); return; }

      if (['/quit', '/exit', 'bye'].includes(q.toLowerCase())) {
        console.log('\nGoodbye!\n');
        rl.close();
        return;
      }

      if (q.startsWith('/route ')) {
        const route = q.split(' ')[1];
        if (['ollama', 'claude', 'auto'].includes(route)) {
          currentRoute = route;
          console.log(`Route set to: ${route}\n`);
        } else {
          console.log('Valid routes: ollama, claude, auto\n');
        }
        ask();
        return;
      }

      if (q.startsWith('/help')) {
        console.log(`
Commands:
  /route ollama    Use only Ollama
  /route claude    Use only Claude Code CLI
  /route auto      Auto-detect (default)
  /quit            Exit

Examples:
  "Explain this function"      -> Ollama
  "Debug this复杂的 bug" -> Claude Code
  "Fix my entire codebase"     -> Both in parallel
        `);
        ask();
        return;
      }

      try {
        await orchestrate(q, { route: currentRoute });
        console.log('');
      } catch (error) {
        console.log(`\nError: ${error.message}\n`);
      }

      ask();
    });
  };

  ask();
}

// ============================================================================
// Main CLI
// ============================================================================

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  const prompt = args.slice(1).join(' ');

  if (!command || command === 'help' || command === '--help') {
    console.log(`
Orchestrator Interface - Ollama + Claude Code CLI

Usage:
  node orchestrator.js chat "prompt"         Quick Ollama chat
  node orchestrator.js claude "task"         Spawn Claude Code CLI
  node orchestrator.js route "task"          Show route decision
  node orchestrator.js orchestrate "task"    Auto-select backend
  node orchestrator.js stream "task"         Dual-stream output
  node orchestrator.js                       Interactive mode

Routes:
  ollama       - Quick local model (fast, private)
  claude       - Claude Code CLI (powerful, cloud)
  orchestrate  - Both in parallel

Environment:
  OLLAMA_HOST      Ollama server (default: http://localhost:11434)
  OLLAMA_MODEL     Model (default: qwen3-coder)
  CLAUDE_CLI_PATH  Claude CLI path

Examples:
  node orchestrator.js chat "What is Node.js?"
  node orchestrator.js claude "Fix the bug in enhanced.js"
  node orchestrator.js orchestrate "Analyze this codebase"
  node orchestrator.js stream "Refactor my project"
    `);
    return;
  }

  if (command === 'chat') {
    if (!prompt) {
      console.log('Usage: node orchestrator.js chat "prompt"');
      process.exit(1);
    }
    const response = await chatOllama(prompt);
    console.log(`\n${response}\n`);
  } else if (command === 'claude') {
    if (!prompt) {
      console.log('Usage: node orchestrator.js claude "task"');
      process.exit(1);
    }
    try {
      await runClaudeCode(prompt);
    } catch (error) {
      console.error(`Error: ${error.message}`);
      process.exit(1);
    }
  } else if (command === 'route') {
    if (!prompt) {
      console.log('Usage: node orchestrator.js route "task"');
      process.exit(1);
    }
    const route = routeTask(prompt);
    console.log(`\nTask: "${prompt.substring(0, 50)}..."`);
    console.log(`Recommended route: ${route}\n`);
  } else if (command === 'orchestrate' || command === 'auto') {
    if (!prompt) {
      console.log('Usage: node orchestrator.js orchestrate "task"');
      process.exit(1);
    }
    await orchestrate(prompt);
    console.log('');
  } else if (command === 'stream') {
    if (!prompt) {
      console.log('Usage: node orchestrator.js stream "task"');
      process.exit(1);
    }
    const streams = [
      ['OLLAMA', streamOllama(prompt)],
      ['CLAUDE', streamClaudeCode(prompt)]
    ];
    await displayMergedStreams(streams);
  } else {
    // Treat as prompt for orchestration
    await orchestrate([command, ...args].join(' '));
    console.log('');
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}
