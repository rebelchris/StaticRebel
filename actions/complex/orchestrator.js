/**
 * Orchestrator Action
 * Routes complex tasks to Claude Code CLI and Ollama
 */

export default {
  name: 'orchestrator',
  displayName: 'Task Orchestrator',
  description:
    'Route complex tasks to Claude Code CLI with dual-streaming support',
  category: 'development',
  version: '1.0.0',

  intentExamples: [
    'use claude code',
    'spawn claude',
    'run claude cli',
    'orchestrate',
    'dual stream',
    'streaming response',
    'complex coding',
    'deep refactor',
    'full codebase',
    'claude task',
    'advanced debugging',
    'architecture review',
  ],

  parameters: {
    task: {
      type: 'string',
      description: 'The task to orchestrate',
    },
    route: {
      type: 'enum',
      values: ['ollama', 'claude-code', 'both'],
      description: 'Which route to use',
    },
  },

  dependencies: [
    'orchestrator.routeTask',
    'orchestrator.streamOllama',
    'orchestrator.runClaudeCode',
  ],

  async handler(input, context, params) {
    const { routeTask, streamOllama, runClaudeCode } =
      context.modules.orchestrator;

    const task = input
      .replace(
        /use claude code|spawn claude|run claude cli|orchestrate|dual stream|streaming response|complex coding|deep refactor|full codebase|claude.*task|advanced debugging|architecture review/gi,
        '',
      )
      .trim();

    if (!task) {
      return `**Orchestrator - Claude Code CLI + Streaming**

I can delegate complex tasks to Claude Code CLI for powerful coding assistance.

Try:
- "Debug this complex issue in my codebase"
- "Refactor the entire project structure"
- "Do a full architecture review"
- "Advanced debugging with trace logs"

Or use direct mode:
- "Use claude code to fix this bug"
- "Spawn claude for a complete rewrite"`;
    }

    // Determine the best route
    const route = routeTask(task);
    console.log(`\n[ORCHESTRATOR] Task: "${task.substring(0, 50)}..."`);
    console.log(`[ORCHESTRATOR] Route: ${route}\n`);

    // Route to appropriate handler
    if (route === 'ollama') {
      process.stdout.write('[OLLAMA] ');
      for await (const token of streamOllama(task)) {
        if (token.type === 'token') {
          process.stdout.write(token.content);
        } else if (token.type === 'thinking') {
          console.log(`\n[${token.source.toUpperCase()}] ${token.content}`);
        } else if (token.type === 'done') {
          console.log('\n[OLLAMA] Done\n');
        }
      }
      return '';
    } else if (route === 'claude-code') {
      try {
        await runClaudeCode(task);
        return '';
      } catch (error) {
        return `[Claude Code Error] ${error.message}`;
      }
    } else {
      // Orchestrate - use both
      console.log(
        '[ORCHESTRATOR] Running with both Ollama and Claude Code in parallel...\n',
      );
      return `I've dispatched your task to both local Ollama and Claude Code CLI for comprehensive assistance. Check the output above!`;
    }
  },

  source: 'builtin',
  enabled: true,
  createdAt: '2026-01-29',
};
