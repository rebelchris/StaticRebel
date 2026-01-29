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
    this.host =
      options.host || process.env.OLLAMA_HOST || 'http://localhost:11434';
    this.model = options.model || process.env.OLLAMA_MODEL || 'qwen3-coder';
  }

  async chat(messages, options = {}) {
    const model = options.model || this.model;
    const data = JSON.stringify({ model, messages, stream: false });

    return new Promise((resolve, reject) => {
      const url = new URL(this.host);
      const req = http.request(
        {
          hostname: url.hostname,
          port: url.port || 11434,
          path: '/api/chat',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': data.length,
          },
        },
        (res) => {
          let body = '';
          res.on('data', (chunk) => (body += chunk));
          res.on('end', () => {
            try {
              const json = JSON.parse(body);
              resolve(json.message?.content || json.response || '');
            } catch (err) {
              reject(new Error('Failed to parse response: ' + err.message));
            }
          });
        },
      );

      req.on('error', reject);
      req.write(data);
      req.end();
    });
  }

  async *stream(messages, options = {}) {
    const model = options.model || this.model;
    const data = JSON.stringify({ model, messages, stream: true });

    const url = new URL(this.host);
    const res = await new Promise((resolve, reject) => {
      const req = http.request(
        {
          hostname: url.hostname,
          port: url.port || 11434,
          path: '/api/chat',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': data.length,
          },
        },
        resolve,
      );
      req.on('error', reject);
      req.write(data);
      req.end();
    });

    let buffer = '';
    for await (const chunk of res) {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop();

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const json = JSON.parse(line);
          if (json.message?.content) {
            yield json.message.content;
          } else if (json.response) {
            yield json.response;
          }
        } catch {
          // ignore parse errors
        }
      }
    }
  }

  async listModels() {
    return new Promise((resolve, reject) => {
      const url = new URL(this.host);
      http
        .get(
          {
            hostname: url.hostname,
            port: url.port || 11434,
            path: '/api/tags',
          },
          (res) => {
            let body = '';
            res.on('data', (chunk) => (body += chunk));
            res.on('end', () => {
              try {
                const json = JSON.parse(body);
                resolve(json.models?.map((m) => m.name) || []);
              } catch {
                resolve([]);
              }
            });
          },
        )
        .on('error', () => resolve([]));
    });
  }
}

/**
 * Create a backend instance
 */
export function createBackend(type, options = {}) {
  switch (type) {
    case 'ollama':
      return new OllamaBackend(options);
    default:
      throw new Error(`Unknown backend type: ${type}`);
  }
}

/**
 * Auto-detect available backend
 */
export async function autoDetectBackend(preferred = 'auto') {
  if (preferred !== 'auto') {
    return createBackend(preferred);
  }

  // Try Ollama first
  const ollama = new OllamaBackend();
  try {
    const models = await ollama.listModels();
    if (models.length > 0) {
      return ollama;
    }
  } catch {
    // Ollama not available
  }

  throw new Error(
    'No model backend available. Please ensure Ollama is running.',
  );
}
