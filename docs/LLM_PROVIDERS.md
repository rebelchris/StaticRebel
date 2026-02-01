# Multi-Provider LLM Support

StaticRebel now supports multiple LLM providers with automatic fallback, health monitoring, and unified interfaces.

## Supported Providers

### 🏠 Local Providers
- **Ollama** - Local models (llama3.2, qwen3-coder, deepseek-r1, etc.)

### ☁️ Cloud Providers  
- **OpenAI** - GPT-4, GPT-3.5, embeddings
- **Anthropic** - Claude 3.5 Sonnet/Haiku, Claude 3 Opus
- **Groq** - Fast inference for Llama models

## Quick Start

### 1. Environment Setup

```bash
# Required: Ollama (always available as fallback)
export OLLAMA_HOST=http://localhost:11434

# Optional: Add API keys for cloud providers
export OPENAI_API_KEY=sk-your-key-here
export ANTHROPIC_API_KEY=sk-ant-your-key-here  
export GROQ_API_KEY=gsk-your-key-here
```

### 2. Basic Configuration

Add to your `config.json`:

```json
{
  "llm": {
    "provider": "ollama",
    "model": "llama3.2",
    "fallback": {
      "provider": "groq",
      "model": "llama-3.1-70b"
    }
  }
}
```

### 3. Usage in Code

```js
import { setupLLM } from './lib/llm/index.js';

const llm = setupLLM({
  provider: 'ollama',
  model: 'llama3.2',
  enableFallback: true
});

// Chat completion
const response = await llm.chat('ollama/llama3.2', [
  { role: 'user', content: 'Hello!' }
]);

// Streaming
for await (const chunk of llm.stream('ollama/llama3.2', messages)) {
  console.log(chunk.token);
}

// Embeddings  
const embeddings = await llm.embeddings('ollama/nomic-embed-text', ['hello world']);
```

## Features

### 🔄 Automatic Fallback

When a provider fails, the system automatically tries the next provider in the chain:

```js
// If Ollama fails, tries Groq, then OpenAI, then Anthropic
const fallbackChain = [
  'ollama/llama3.2',
  'groq/llama-3.1-70b', 
  'openai/gpt-4o',
  'anthropic/claude-3-5-sonnet'
];
```

### 🎯 Task-Based Model Selection

Different models excel at different tasks:

```js
const response = await llm.chat(null, messages, { 
  task: 'coding'  // Automatically uses best coding model
});
```

Available tasks:
- `general` - General conversation
- `coding` - Code generation/analysis
- `reasoning` - Complex reasoning tasks
- `fast` - Quick responses
- `creative` - Creative writing
- `embeddings` - Text embeddings

### 🏥 Health Monitoring

Providers are automatically health-checked:

```js
const health = await llm.checkAllProviderHealth();
console.log(health);
// {
//   ollama: { healthy: true, models: ['llama3.2', ...] },
//   openai: { healthy: true, models: ['gpt-4', ...] }
// }
```

### 📊 Usage Tracking

Track usage across providers:

```js
const stats = llm.getUsageStats();
console.log(stats);
// {
//   totalRequests: 150,
//   totalTokens: 50000,
//   topProviders: [['ollama', { requests: 100, tokens: 30000 }]],
//   fallbackRate: 0.1
// }
```

## Configuration Reference

### Basic Configuration

```json
{
  "llm": {
    "provider": "ollama",           // Primary provider
    "model": "llama3.2",           // Primary model
    "enableFallback": true,        // Enable fallback chain
    "enableHealthChecks": true,    // Monitor provider health
    "timeout": 120000,             // Request timeout (ms)
    "maxRetries": 3,               // Max fallback attempts
    
    "contextWarningThreshold": 0.8,  // Warn at 80% context
    "contextCriticalThreshold": 0.9, // Fail at 90% context
    
    "fallback": {                  // Simple fallback
      "provider": "groq",
      "model": "llama-3.1-70b"
    }
  }
}
```

### Advanced Configuration

```json
{
  "llm": {
    "provider": "ollama",
    "model": "llama3.2",
    "enableFallback": true,
    
    "fallbackChains": {
      "general": [
        "ollama/llama3.2",
        "groq/llama-3.1-70b",
        "openai/gpt-4o"
      ],
      "coding": [
        "ollama/qwen3-coder",
        "groq/llama-3.1-70b",
        "openai/gpt-4-turbo"
      ],
      "reasoning": [
        "ollama/deepseek-r1",
        "groq/llama-3.1-405b",
        "anthropic/claude-3-opus"
      ]
    }
  }
}
```

## Provider-Specific Setup

### Ollama

```bash
# Install Ollama
curl -fsSL https://ollama.com/install.sh | sh

# Pull models
ollama pull llama3.2
ollama pull qwen3-coder
ollama pull deepseek-r1:32b
ollama pull nomic-embed-text

# Start server (if not using system service)
ollama serve
```

### OpenAI

1. Get API key from [OpenAI Platform](https://platform.openai.com)
2. Set environment variable: `export OPENAI_API_KEY=sk-your-key`
3. Available models: `gpt-4o`, `gpt-4-turbo`, `gpt-3.5-turbo`, `text-embedding-3-small`

### Anthropic

1. Get API key from [Anthropic Console](https://console.anthropic.com)
2. Set environment variable: `export ANTHROPIC_API_KEY=sk-ant-your-key`
3. Available models: `claude-3-5-sonnet`, `claude-3-5-haiku`, `claude-3-opus`

### Groq

1. Get API key from [Groq Console](https://console.groq.com)
2. Set environment variable: `export GROQ_API_KEY=gsk-your-key`  
3. Available models: `llama-3.1-405b-reasoning`, `llama-3.1-70b-versatile`, `llama-3.1-8b-instant`

## Model Recommendations

### For Coding
1. **Primary**: `ollama/qwen3-coder` (free, local)
2. **Fallback**: `groq/llama-3.1-70b` (fast, cloud)
3. **Advanced**: `openai/gpt-4-turbo` (best quality)

### For Reasoning
1. **Primary**: `ollama/deepseek-r1` (free, excellent reasoning)
2. **Fallback**: `groq/llama-3.1-405b` (fast, cloud) 
3. **Advanced**: `anthropic/claude-3-opus` (best reasoning)

### For Speed
1. **Primary**: `ollama/llama3.2` (free, local)
2. **Fallback**: `groq/llama-3.1-8b` (very fast)
3. **Advanced**: `anthropic/claude-3-5-haiku` (fast, quality)

### For Embeddings
1. **Primary**: `ollama/nomic-embed-text` (free, local)
2. **Fallback**: `openai/text-embedding-3-small` (cloud)

## Migration from Old System

The new system is backwards compatible. Existing `askOllama()` calls automatically use the new provider system with fallback support.

### Before
```js
const response = await askOllama(messages);
```

### After (automatic migration)
```js
const response = await askOllama(messages); // Now uses multi-provider fallback!
```

### New Recommended Usage
```js
const llm = setupLLM();
const response = await llm.chat('ollama/llama3.2', messages, { task: 'coding' });
```

## Troubleshooting

### Provider Not Available
```
Error: Provider not available: openai
```
**Solution**: Set the required API key environment variable.

### All Fallbacks Failed
```
Error: All fallback providers failed
```
**Solutions**:
1. Check Ollama is running: `ollama list`
2. Verify API keys are set
3. Check network connectivity
4. Review provider health: `await llm.checkAllProviderHealth()`

### Context Window Overflow
```
Warning: Context window 95% full - may fail
```
**Solutions**:
1. Reduce message history
2. Summarize long conversations  
3. Use models with larger context windows
4. Enable automatic context compaction

### Rate Limits
Cloud providers have rate limits. The system automatically handles retries and fallbacks.

## Performance Tips

1. **Use local models first**: Ollama models are free and fast
2. **Configure task-based fallbacks**: Different models excel at different tasks
3. **Monitor usage**: Check `getUsageStats()` to optimize costs
4. **Health checks**: Enable health monitoring to avoid failed requests
5. **Context management**: Monitor context window usage

## Examples

See `config/llm.example.json` for complete configuration examples.

## API Reference

See individual provider documentation:
- [BaseProvider](../lib/llm/providers/BaseProvider.js)
- [OllamaProvider](../lib/llm/providers/OllamaProvider.js)
- [OpenAIProvider](../lib/llm/providers/OpenAIProvider.js)
- [AnthropicProvider](../lib/llm/providers/AnthropicProvider.js)
- [GroqProvider](../lib/llm/providers/GroqProvider.js)
- [LLMManager](../lib/llm/LLMManager.js)