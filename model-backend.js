import http from 'http';
import https from 'https';

// ============================================================================
// Model Backend Abstraction
// ============================================================================

/**
 * Base class for model backends
 */
class ModelBackend {
  constructor(options = {}) {
    this.options = options;
  }

  async chat(messages, options = {}) {
    throw new Error('Not implemented');
  }

  async stream(messages, options = {}) {
    throw new Error('Not implemented');
  }

  async listModels() {
    return [];
  }
}

/**
 * Ollama backend
 */
class OllamaBackend extends ModelBackend {
  constructor(options = {}) {
    super(options);
    this.host = options.host || process.env.OLLAMA_HOST || 'http://localhost:11434';
    this.model = options.model || process.env.OLLAMA_MODEL || 'qwen3-coder';
  }

  async chat(messages, options = {}) {
    const model = options.model || this.model;
    const data = JSON.stringify({ model, messages, stream: false });

    return new Promise((resolve, reject) => {
      const url = new URL(this.host);
      const req = http.request({
        hostname: url.hostname,
        port: url.port || 11434,
        path: '/api/chat',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data)
        },
        timeout: options.timeout || 30000
      }, (res) => {
        if (res.statusCode !== 200) {
          return reject(new Error(`HTTP ${res.statusCode}`));
        }

        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('error', err => reject(err));
        res.on('end', () => {
          try {
            resolve(JSON.parse(body));
          } catch (e) {
            reject(new Error(`Parse error: ${e.message}`));
          }
        });
      });

      req.on('error', err => reject(err));
      req.setTimeout(options.timeout || 30000, () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });
      req.write(data);
      req.end();
    });
  }

  async stream(messages, options = {}) {
    const model = options.model || this.model;
    const data = JSON.stringify({ model, messages, stream: true });

    return new Promise((resolve, reject) => {
      const url = new URL(this.host);
      const req = http.request({
        hostname: url.hostname,
        port: url.port || 11434,
        path: '/api/chat',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data)
        },
        timeout: options.timeout || 120000
      }, (res) => {
        if (res.statusCode !== 200) {
          return reject(new Error(`HTTP ${res.statusCode}`));
        }

        let buffer = '';
        let output = '';

        res.on('data', (chunk) => {
          buffer += chunk.toString();
          const lines = buffer.split('\n');
          buffer = lines.pop();

          for (const line of lines) {
            if (!line.trim()) continue;
            try {
              const parsed = JSON.parse(line);
              const content = parsed.message?.content || '';
              if (content) {
                output += content;
                if (options.onChunk) {
                  options.onChunk(content, output);
                }
              }
              if (parsed.done) {
                return resolve({ output: output.trim() });
              }
            } catch (e) {}
          }
        });

        res.on('error', err => reject(err));
        res.on('end', () => {
          if (output) {
            resolve({ output: output.trim() });
          } else {
            reject(new Error('No response'));
          }
        });
      });

      req.on('error', err => reject(err));
      req.setTimeout(options.timeout || 120000, () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });
      req.write(data);
      req.end();
    });
  }

  async listModels() {
    return new Promise((resolve, reject) => {
      const url = new URL(this.host);
      const req = http.request({
        hostname: url.hostname,
        port: url.port || 11434,
        path: '/api/tags',
        method: 'GET',
        timeout: 5000
      }, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('error', err => reject(err));
        res.on('end', () => {
          try {
            const parsed = JSON.parse(body);
            resolve(parsed.models || []);
          } catch (e) {
            resolve([]);
          }
        });
      });
      req.on('error', () => resolve([]));
      req.end();
    });
  }
}

/**
 * Anthropic API backend
 */
class AnthropicBackend extends ModelBackend {
  constructor(options = {}) {
    super(options);
    this.apiKey = options.apiKey || process.env.ANTHROPIC_API_KEY;
    this.baseUrl = options.baseUrl || 'https://api.anthropic.com';
    this.model = options.model || 'claude-sonnet-4-20250506';
    this.maxTokens = options.maxTokens || 4096;
  }

  async chat(messages, options = {}) {
    if (!this.apiKey) {
      throw new Error('ANTHROPIC_API_KEY not set');
    }

    const model = options.model || this.model;
    const systemMessage = messages.find(m => m.role === 'system');
    const userMessages = messages.filter(m => m.role !== 'system');

    const body = {
      model,
      max_tokens: options.maxTokens || this.maxTokens,
      messages: userMessages,
      ...(systemMessage && { system: systemMessage.content }),
      stream: false
    };

    return new Promise((resolve, reject) => {
      const url = new URL('/v1/messages', this.baseUrl);
      const req = https.request({
        hostname: url.hostname,
        port: url.port || 443,
        path: url.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01'
        },
        timeout: options.timeout || 60000
      }, (res) => {
        if (res.statusCode !== 200) {
          let err = '';
          res.on('data', chunk => err += chunk);
          res.on('end', () => reject(new Error(`HTTP ${res.statusCode}: ${err}`)));
          return;
        }

        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('error', err => reject(err));
        res.on('end', () => {
          try {
            const parsed = JSON.parse(body);
            resolve({
              message: {
                content: parsed.content?.[0]?.text || ''
              }
            });
          } catch (e) {
            reject(new Error(`Parse error: ${e.message}`));
          }
        });
      });

      req.on('error', err => reject(err));
      req.setTimeout(options.timeout || 60000, () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });
      req.write(JSON.stringify(body));
      req.end();
    });
  }

  async stream(messages, options = {}) {
    if (!this.apiKey) {
      throw new Error('ANTHROPIC_API_KEY not set');
    }

    const model = options.model || this.model;
    const systemMessage = messages.find(m => m.role === 'system');
    const userMessages = messages.filter(m => m.role !== 'system');

    const body = {
      model,
      max_tokens: options.maxTokens || this.maxTokens,
      messages: userMessages,
      ...(systemMessage && { system: systemMessage.content }),
      stream: true
    };

    return new Promise((resolve, reject) => {
      const url = new URL('/v1/messages', this.baseUrl);
      const req = https.request({
        hostname: url.hostname,
        port: url.port || 443,
        path: url.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01'
        },
        timeout: options.timeout || 120000
      }, (res) => {
        if (res.statusCode !== 200) {
          return reject(new Error(`HTTP ${res.statusCode}`));
        }

        let output = '';
        res.on('data', (chunk) => {
          const lines = chunk.toString().split('\n');
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const parsed = JSON.parse(line.slice(6));
                const content = parsed.delta?.text || parsed.completion || '';
                if (content) {
                  output += content;
                  if (options.onChunk) {
                    options.onChunk(content, output);
                  }
                }
              } catch (e) {}
            } else if (line.includes('[DONE]')) {
              return resolve({ output: output.trim() });
            }
          }
        });

        res.on('error', err => reject(err));
        res.on('end', () => {
          if (output) {
            resolve({ output: output.trim() });
          } else {
            reject(new Error('No response'));
          }
        });
      });

      req.on('error', err => reject(err));
      req.setTimeout(options.timeout || 120000, () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });
      req.write(JSON.stringify(body));
      req.end();
    });
  }
}

/**
 * OpenAI API backend
 */
class OpenAIBackend extends ModelBackend {
  constructor(options = {}) {
    super(options);
    this.apiKey = options.apiKey || process.env.OPENAI_API_KEY;
    this.baseUrl = options.baseUrl || 'https://api.openai.com/v1';
    this.model = options.model || 'gpt-4';
  }

  async chat(messages, options = {}) {
    if (!this.apiKey) {
      throw new Error('OPENAI_API_KEY not set');
    }

    const model = options.model || this.model;
    const body = {
      model,
      messages: messages.filter(m => m.role !== 'system'),
      ...(messages.find(m => m.role === 'system') && {
        system: messages.find(m => m.role === 'system').content
      }),
      stream: false
    };

    return new Promise((resolve, reject) => {
      const url = new URL('/chat/completions', this.baseUrl);
      const req = https.request({
        hostname: url.hostname,
        port: url.port || 443,
        path: url.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        timeout: options.timeout || 60000
      }, (res) => {
        if (res.statusCode !== 200) {
          let err = '';
          res.on('data', chunk => err += chunk);
          res.on('end', () => reject(new Error(`HTTP ${res.statusCode}: ${err}`)));
          return;
        }

        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('error', err => reject(err));
        res.on('end', () => {
          try {
            const parsed = JSON.parse(body);
            resolve({
              message: {
                content: parsed.choices?.[0]?.message?.content || ''
              }
            });
          } catch (e) {
            reject(new Error(`Parse error: ${e.message}`));
          }
        });
      });

      req.on('error', err => reject(err));
      req.setTimeout(options.timeout || 60000, () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });
      req.write(JSON.stringify(body));
      req.end();
    });
  }
}

/**
 * Factory function to get backend
 */
function createBackend(type = 'ollama', options = {}) {
  switch (type.toLowerCase()) {
    case 'ollama':
      return new OllamaBackend(options);
    case 'anthropic':
      return new AnthropicBackend(options);
    case 'openai':
      return new OpenAIBackend(options);
    default:
      throw new Error(`Unknown backend type: ${type}`);
  }
}

/**
 * Auto-detect best available backend
 */
function autoDetectBackend() {
  // Check environment for API keys
  if (process.env.ANTHROPIC_API_KEY) {
    return createBackend('anthropic');
  }
  if (process.env.OPENAI_API_KEY) {
    return createBackend('openai');
  }
  // Default to Ollama
  return createBackend('ollama');
}

export {
  ModelBackend,
  OllamaBackend,
  AnthropicBackend,
  OpenAIBackend,
  createBackend,
  autoDetectBackend
};

export default {
  ModelBackend,
  OllamaBackend,
  AnthropicBackend,
  OpenAIBackend,
  createBackend,
  autoDetectBackend
};
