// Coding Subagent - Specialized coding and development tasks
import fs from 'fs';
import path from 'path';
import { chatCompletion, getModelForTask, parseModelRef } from '../../lib/modelRegistry.js';

const DEFAULT_MODEL = 'ollama/qwen3-coder:latest';

let systemPrompt = `You are a coding specialist AI assistant. Your role:

1. Read and understand the codebase you're working with
2. Complete coding tasks efficiently and correctly
3. Write clean, maintainable, well-documented code
4. Explain your changes clearly
5. If you need clarification, ask

## Guidelines

- Write working code over "perfect" code
- Don't over-engineer solutions
- Use existing code patterns and conventions
- Consider edge cases and error handling
- Write tests when appropriate

## Output Format

When making changes, output:
1. Brief explanation of what you're doing
2. The code changes (with file paths)
3. Any notes on usage or testing

Current task:`;

let messages = [];
let currentModel = null;
let currentTask = null;

export function getModel() {
  return currentModel || DEFAULT_MODEL;
}

export function setModel(model) {
  currentModel = model;
}

export function getSystemPrompt() {
  return systemPrompt;
}

export function setSystemPrompt(prompt) {
  systemPrompt = prompt;
}

// Initialize for a task
export async function init(task, codebasePath = process.cwd()) {
  currentTask = task;

  // Check if codebase exists and get info
  let codebaseInfo = '';
  try {
    if (fs.existsSync(codebasePath)) {
      const files = getCodebaseStructure(codebasePath);
      codebaseInfo = `\n\n## Codebase Context\nWorking directory: ${codebasePath}\n\nFile structure:\n${files}`;
    }
  } catch (e) {}

  messages = [
    { role: 'system', content: systemPrompt + '\n\n' + currentTask + codebaseInfo }
  ];

  return {
    task,
    model: getModel(),
    messages: messages.length
  };
}

function getCodebaseStructure(dir, depth = 2, currentDepth = 0) {
  if (currentDepth >= depth) return '';

  let output = '';
  try {
    const items = fs.readdirSync(dir, { withFileTypes: true });
    for (const item of items) {
      if (item.name.startsWith('.') || item.name === 'node_modules') continue;
      output += `${'  '.repeat(currentDepth + 1)}${item.name}${item.isDirectory() ? '/' : ''}\n`;
      if (item.isDirectory()) {
        output += getCodebaseStructure(path.join(dir, item.name), depth, currentDepth + 1);
      }
    }
  } catch (e) {}
  return output;
}

// Send message to coding agent
export async function send(message, options = {}) {
  messages.push({ role: 'user', content: message });

  const model = getModel();
  const response = await chatCompletion(model, messages, {
    temperature: options.temperature || 0.3,
    maxTokens: options.maxTokens || 8192,
    timeout: options.timeout || 300000
  });

  messages.push({ role: 'assistant', content: response.message });

  return {
    content: response.message,
    model,
    duration: response.totalDuration
  };
}

// Execute code change (simulated - would use actual file operations)
export async function executeChange(filePath, newContent, operation = 'write') {
  const fullPath = path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath);

  try {
    const dir = path.dirname(fullPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    if (operation === 'delete') {
      if (fs.existsSync(fullPath)) {
        fs.unlinkSync(fullPath);
        return { success: true, message: `Deleted ${filePath}` };
      }
      return { success: false, message: 'File not found' };
    }

    fs.writeFileSync(fullPath, newContent);
    return {
      success: true,
      message: `${operation === 'create' ? 'Created' : 'Updated'} ${filePath}`,
      path: fullPath
    };
  } catch (error) {
    return { success: false, message: error.message };
  }
}

// Read file
export async function readFile(filePath) {
  const fullPath = path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath);

  try {
    if (fs.existsSync(fullPath)) {
      return fs.readFileSync(fullPath, 'utf-8');
    }
    return null;
  } catch (error) {
    return null;
  }
}

// Run shell command
export async function runCommand(cmd, options = {}) {
  const { spawn } = await import('child_process');
  return new Promise((resolve) => {
    const proc = spawn(cmd, { shell: true, cwd: options.cwd || process.cwd() });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', d => stdout += d);
    proc.stderr.on('data', d => stderr += d);

    proc.on('close', code => {
      resolve({ code, stdout, stderr });
    });
  });
}

// Get session info
export function getSession() {
  return {
    task: currentTask,
    model: getModel(),
    messages: messages.length,
    lastMessage: messages[messages.length - 1]?.content?.substring(0, 100)
  };
}

// Clear session
export function clear() {
  messages = [];
  currentTask = null;
}

// Export conversation
export function exportConversation() {
  return messages.map(m => `${m.role}: ${m.content}`).join('\n\n');
}
