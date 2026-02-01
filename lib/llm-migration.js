/**
 * LLM Migration - Update existing code to use new provider abstraction
 * 
 * This module provides compatibility functions to migrate from direct
 * Ollama calls to the new multi-provider LLM system.
 */

import http from 'http';
import { setupLLM } from './llm/index.js';
import { loadConfig } from './configManager.js';

// Global LLM manager instance
let llmManager = null;

/**
 * Initialize LLM manager with configuration
 */
export async function initLLM() {
  try {
    const config = loadConfig();
    
    // Create LLM configuration from existing config
    const llmConfig = {
      provider: config.llm?.provider || 'ollama',
      model: config.llm?.model || 'llama3.2',
      fallback: config.llm?.fallback || null,
      enableFallback: config.llm?.enableFallback !== false,
      enableHealthChecks: config.llm?.enableHealthChecks !== false,
      timeout: config.llm?.timeout || 120000,
      
      // Provider-specific options
      ollamaHost: process.env.OLLAMA_HOST || 'http://localhost:11434',
      openaiApiKey: process.env.OPENAI_API_KEY,
      anthropicApiKey: process.env.ANTHROPIC_API_KEY,
      groqApiKey: process.env.GROQ_API_KEY,
    };

    // Create LLM manager
    llmManager = setupLLM(llmConfig);
    
    // Wait for initialization
    await new Promise((resolve) => {
      llmManager.once('initialized', resolve);
      
      // Timeout after 5 seconds
      setTimeout(resolve, 5000);
    });

    console.log(`✓ LLM Manager initialized with ${Array.from(llmManager.providers.keys()).join(', ')} providers`);
    
    return llmManager;
  } catch (error) {
    console.warn(`⚠️  LLM Manager initialization failed: ${error.message}`);
    console.warn('   Falling back to direct Ollama calls');
    return null;
  }
}

/**
 * Get LLM manager instance
 */
export function getLLMManager() {
  return llmManager;
}

/**
 * Backwards compatible askOllama function
 * Now uses the new LLM abstraction with fallback
 */
export async function askOllama(messages, options = {}) {
  if (!llmManager) {
    throw new Error('LLM Manager not initialized. Call initLLM() first.');
  }

  try {
    // Use the configured primary model or fallback to ollama
    const modelRef = options.model || llmManager.getPrimaryModel();
    
    const response = await llmManager.chat(modelRef, messages, {
      temperature: options.temperature || 0.7,
      maxTokens: options.maxTokens,
      timeout: options.timeout || 120000,
      task: options.task || 'general'
    });

    // Return in original format for compatibility
    return {
      message: {
        content: response.content
      },
      model: response.model,
      done: true,
      total_duration: response.duration ? response.duration * 1e6 : undefined,
      eval_count: response.tokensUsed
    };
  } catch (error) {
    // If LLM manager fails, throw error in original format
    throw new Error(`LLM request failed: ${error.message}`);
  }
}

/**
 * Enhanced chat completion with task-based model selection
 */
export async function chatCompletion(messages, options = {}) {
  if (!llmManager) {
    throw new Error('LLM Manager not initialized');
  }

  const task = options.task || 'general';
  const response = await llmManager.chat(null, messages, {
    ...options,
    task
  });

  return {
    content: response.content,
    model: response.modelRef,
    tokensUsed: response.tokensUsed,
    duration: response.duration,
    provider: response.provider,
    fallbackUsed: response.fallbackUsed
  };
}

/**
 * Streaming chat with fallback support
 */
export async function* streamCompletion(messages, options = {}) {
  if (!llmManager) {
    throw new Error('LLM Manager not initialized');
  }

  const task = options.task || 'general';
  
  for await (const chunk of llmManager.stream(null, messages, { ...options, task })) {
    yield {
      content: chunk.token,
      done: chunk.done,
      model: chunk.model,
      provider: chunk.provider
    };
  }
}

/**
 * Get embeddings using the new provider system
 */
export async function createEmbeddings(texts, options = {}) {
  if (!llmManager) {
    throw new Error('LLM Manager not initialized');
  }

  try {
    // Use embedding model from chain
    const embeddings = await llmManager.embeddings(null, texts, options);
    return embeddings;
  } catch (error) {
    throw new Error(`Embeddings failed: ${error.message}`);
  }
}

/**
 * List available models across all providers
 */
export async function listAvailableModels() {
  if (!llmManager) {
    return [];
  }

  return llmManager.getAvailableModels();
}

/**
 * Get model for specific task
 */
export function getModelForTask(task) {
  if (!llmManager) {
    return 'ollama/llama3.2'; // fallback
  }

  const fallbackChain = llmManager.getFallbackChain(task);
  return fallbackChain[0] || 'ollama/llama3.2';
}

/**
 * Get default model
 */
export function getDefaultModel() {
  if (!llmManager) {
    return 'llama3.2';
  }

  const primary = llmManager.getPrimaryModel();
  return primary.split('/')[1] || 'llama3.2';
}

/**
 * Health check for all providers
 */
export async function checkProviderHealth() {
  if (!llmManager) {
    return { error: 'LLM Manager not initialized' };
  }

  return await llmManager.checkAllProviderHealth();
}

/**
 * Get usage statistics
 */
export function getUsageStats() {
  if (!llmManager) {
    return null;
  }

  return llmManager.getUsageStats();
}

/**
 * Update LLM configuration
 */
export function updateLLMConfig(updates) {
  if (!llmManager) {
    return false;
  }

  llmManager.updateConfig(updates);
  return true;
}

/**
 * Fallback function for direct Ollama calls (legacy support)
 * This maintains the original HTTP interface as a backup
 */
export function askOllamaDirectly(messages, model = 'llama3.2') {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({ model, messages, stream: false });
    const ollamaHost = process.env.OLLAMA_HOST || 'http://localhost:11434';

    const req = http.request(
      {
        hostname: new URL(ollamaHost).hostname,
        port: new URL(ollamaHost).port || 11434,
        path: '/api/chat',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data),
        },
      },
      (res) => {
        if (res.statusCode !== 200) {
          return reject(new Error(`HTTP error: ${res.statusCode}`));
        }

        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('error', (err) => reject(new Error(`Response error: ${err.message}`)));
        res.on('end', () => {
          try {
            const parsed = JSON.parse(body);
            resolve(parsed);
          } catch (error) {
            reject(new Error('Failed to parse API response'));
          }
        });
      },
    );

    req.setTimeout(30000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
    
    req.on('error', () => reject(new Error('Request failed')));
    req.write(data);
    req.end();
  });
}

export default {
  initLLM,
  getLLMManager,
  askOllama,
  chatCompletion,
  streamCompletion,
  createEmbeddings,
  listAvailableModels,
  getModelForTask,
  getDefaultModel,
  checkProviderHealth,
  getUsageStats,
  updateLLMConfig,
  askOllamaDirectly
};