/**
 * Run Action
 * Execute shell commands with safety checks
 */

import { spawn } from 'child_process';
import readline from 'readline';

const SAFE_COMMANDS = new Set([
  'ls',
  'cat',
  'head',
  'tail',
  'pwd',
  'date',
  'echo',
  'git status',
  'git log --oneline',
  'git branch',
  'git diff --stat',
  'npm',
  'node',
  'which',
  'whoami',
  'uname',
  'clear',
  'exit',
]);

export default {
  name: 'run',
  displayName: 'Shell Commands',
  description:
    'Run shell commands and terminal operations with safety confirmation',
  category: 'system',
  version: '1.0.0',

  intentExamples: [
    'run a command',
    'run shell',
    'execute',
    'terminal',
    'bash',
    'run ls',
    'run pwd',
    'run git status',
  ],

  parameters: {
    command: {
      type: 'string',
      description: 'The shell command to execute',
    },
    confirm: {
      type: 'boolean',
      description: 'Whether to confirm before running dangerous commands',
      default: true,
    },
  },

  dependencies: [],

  async handler(input, context, params) {
    const cmd = input.replace(/run|execute|terminal|bash|command/i, '').trim();
    if (!cmd) return 'What command should I run?';

    const isDangerous = !Array.from(SAFE_COMMANDS).some((c) =>
      cmd.startsWith(c),
    );

    if (isDangerous && params.confirm !== false) {
      // In interactive mode, we'd ask for confirmation
      // For now, return a warning message
      return `⚠️ **Command requires confirmation:**\n\n"${cmd}"\n\nThis command is not in the safe list. In interactive mode, you would be asked to confirm (y/n).\n\nSafe commands: ${Array.from(SAFE_COMMANDS).join(', ')}`;
    }

    try {
      const result = await runShellCommand(cmd);
      return `**Command output:**\n\n\`\`\`\n${result}\n\`\`\``;
    } catch (error) {
      return `[Command Error] ${error.message}`;
    }
  },

  source: 'builtin',
  enabled: true,
  createdAt: '2026-01-29',
};

function runShellCommand(cmd) {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, { shell: true });
    let out = '';
    let err = '';

    proc.stdout.on('data', (d) => (out += d.toString()));
    proc.stderr.on('data', (d) => (err += d.toString()));

    proc.on('close', (code) => {
      if (code !== 0 && !out) {
        reject(new Error(err || `Command exited with code ${code}`));
      } else {
        resolve(out || err || `(exit ${code})`);
      }
    });

    proc.on('error', (error) => {
      reject(error);
    });
  });
}
