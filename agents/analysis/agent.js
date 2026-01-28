// Analysis Subagent - Deep reasoning and analysis tasks
import { chatCompletion, getModelForTask } from '../../lib/modelRegistry.js';

const DEFAULT_MODEL = 'ollama/deepseek-r1:32b';

let systemPrompt = `You are an analysis specialist AI assistant. Your role:

1. Analyze topics thoroughly and deeply
2. Consider multiple perspectives and approaches
3. Provide clear, structured reasoning
4. Draw actionable conclusions
5. Challenge assumptions constructively

## Analysis Framework

When analyzing:
- Define the problem/question clearly
- Break down into components
- Identify key factors and relationships
- Consider constraints and trade-offs
- Synthesize findings into actionable insights

## Output Format

1. Summary (2-3 sentences)
2. Key Findings (bullet points)
3. Analysis Details
4. Recommendations (if appropriate)

Current task:`;

let messages = [];
let currentModel = null;
let currentTopic = null;

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

// Initialize for analysis
export async function init(topic, context = '') {
  currentTopic = topic;

  messages = [
    {
      role: 'system',
      content: `${systemPrompt}\n\n## Analysis Task\n${topic}${context ? '\n\n## Context\n' + context : ''}`
    }
  ];

  return {
    topic,
    model: getModel(),
    messages: messages.length
  };
}

// Send to analysis agent
export async function send(message, options = {}) {
  messages.push({ role: 'user', content: message });

  const model = getModel();
  const response = await chatCompletion(model, messages, {
    temperature: options.temperature || 0.5,
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

// Quick analysis methods
export async function analyzeCode(code) {
  messages.push({
    role: 'user',
    content: `Analyze this code:\n\n\`\`\`\n${code}\n\`\`\`\n\nProvide: 1) Overview 2) Potential issues 3) Suggestions for improvement`
  });

  return send('');
}

export async function compareOptions(options) {
  const formatted = options.map((o, i) => `${i + 1}. ${o}`).join('\n');
  messages.push({
    role: 'user',
    content: `Compare these options:\n\n${formatted}\n\nConsider: pros/cons, trade-offs, and recommendations`
  });

  return send('');
}

export async function evaluateIdea(idea) {
  messages.push({
    role: 'user',
    content: `Evaluate this idea:\n\n${idea}\n\nProvide: feasibility, risks, potential, and recommendations`
  });

  return send('');
}

// Get session info
export function getSession() {
  return {
    topic: currentTopic,
    model: getModel(),
    messages: messages.length
  };
}

// Clear session
export function clear() {
  messages = [];
  currentTopic = null;
}

// Export conversation
export function exportConversation() {
  return messages.map(m => `${m.role}: ${m.content}`).join('\n\n');
}
