/**
 * LLM Provider Adapters
 * 
 * Adapters for common LLM providers to work with SkillAgent.
 * Each provider returns: { content: string, toolCalls?: array }
 */

/**
 * OpenAI / OpenAI-compatible provider (GPT-4, etc.)
 */
export function createOpenAIProvider(options = {}) {
  const {
    apiKey = process.env.OPENAI_API_KEY,
    baseUrl = 'https://api.openai.com/v1',
    model = 'gpt-4-turbo-preview'
  } = options;

  return async function openaiProvider(messages, tools) {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        messages,
        tools: tools.map(t => ({
          type: 'function',
          function: {
            name: t.name,
            description: t.description,
            parameters: t.parameters
          }
        })),
        tool_choice: 'auto'
      })
    });

    const data = await response.json();
    
    if (data.error) {
      throw new Error(data.error.message);
    }

    const msg = data.choices[0].message;
    
    return {
      content: msg.content || '',
      toolCalls: msg.tool_calls?.map(tc => ({
        id: tc.id,
        name: tc.function.name,
        arguments: JSON.parse(tc.function.arguments)
      }))
    };
  };
}

/**
 * Anthropic Claude provider
 */
export function createAnthropicProvider(options = {}) {
  const {
    apiKey = process.env.ANTHROPIC_API_KEY,
    model = 'claude-3-sonnet-20240229'
  } = options;

  return async function anthropicProvider(messages, tools) {
    // Convert messages format
    const systemMsg = messages.find(m => m.role === 'system');
    const otherMsgs = messages.filter(m => m.role !== 'system');

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model,
        max_tokens: 1024,
        system: systemMsg?.content || '',
        messages: otherMsgs.map(m => ({
          role: m.role === 'tool' ? 'user' : m.role,
          content: m.content
        })),
        tools: tools.map(t => ({
          name: t.name,
          description: t.description,
          input_schema: t.parameters
        }))
      })
    });

    const data = await response.json();
    
    if (data.error) {
      throw new Error(data.error.message);
    }

    // Extract text and tool use from content blocks
    let content = '';
    const toolCalls = [];

    for (const block of data.content) {
      if (block.type === 'text') {
        content += block.text;
      } else if (block.type === 'tool_use') {
        toolCalls.push({
          id: block.id,
          name: block.name,
          arguments: block.input
        });
      }
    }

    return { content, toolCalls: toolCalls.length > 0 ? toolCalls : undefined };
  };
}

/**
 * Ollama provider (local models)
 */
export function createOllamaProvider(options = {}) {
  const {
    baseUrl = process.env.OLLAMA_HOST || 'http://localhost:11434',
    model = 'llama3.1'
  } = options;

  return async function ollamaProvider(messages, tools) {
    // Ollama's tool support varies by model
    // We'll use the chat endpoint with tools if supported
    
    const response = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages,
        tools: tools.map(t => ({
          type: 'function',
          function: {
            name: t.name,
            description: t.description,
            parameters: t.parameters
          }
        })),
        stream: false
      })
    });

    const data = await response.json();
    
    if (data.error) {
      throw new Error(data.error);
    }

    const msg = data.message;
    
    return {
      content: msg.content || '',
      toolCalls: msg.tool_calls?.map(tc => ({
        id: tc.id || Date.now().toString(),
        name: tc.function.name,
        arguments: typeof tc.function.arguments === 'string' 
          ? JSON.parse(tc.function.arguments) 
          : tc.function.arguments
      }))
    };
  };
}

/**
 * Simple mock provider for testing
 */
export function createMockProvider() {
  return async function mockProvider(messages, tools) {
    const lastUserMsg = [...messages].reverse().find(m => m.role === 'user')?.content || '';
    const lower = lastUserMsg.toLowerCase();

    // Simple pattern matching for demo
    if (lower.includes('water') || lower.includes('drank') || lower.includes('hydrat')) {
      const match = lastUserMsg.match(/(\d+)\s*(ml|l|glass|cup)?/i);
      const value = match ? parseInt(match[1]) * (match[2]?.toLowerCase() === 'l' ? 1000 : match[2]?.toLowerCase().includes('glass') ? 250 : 1) : 250;
      
      return {
        content: '',
        toolCalls: [{
          id: '1',
          name: 'log_entry',
          arguments: { skill_id: 'water', data: { value, note: lastUserMsg } }
        }]
      };
    }
    
    if (lower.includes('mood') || lower.includes('feeling') || lower.includes('feel')) {
      const match = lastUserMsg.match(/(\d+)/);
      const score = match ? Math.min(10, Math.max(1, parseInt(match[1]))) : 7;
      
      return {
        content: '',
        toolCalls: [{
          id: '1',
          name: 'log_entry',
          arguments: { skill_id: 'mood', data: { score, note: lastUserMsg } }
        }]
      };
    }

    if (lower.includes('track') && (lower.includes('teach') || lower.includes('new') || lower.includes('create'))) {
      // Extract what they want to track
      const trackMatch = lastUserMsg.match(/track\s+(?:my\s+)?(\w+)/i);
      const name = trackMatch ? trackMatch[1] : 'custom';
      
      return {
        content: '',
        toolCalls: [{
          id: '1',
          name: 'create_skill',
          arguments: { name, data_type: 'number', description: `Track ${name}` }
        }]
      };
    }

    if (lower.includes('how much') || lower.includes('today') || lower.includes('progress')) {
      const skillMatch = lower.match(/(water|mood|exercise|coffee)/);
      const skill = skillMatch ? skillMatch[1] : 'water';
      
      return {
        content: '',
        toolCalls: [{
          id: '1',
          name: 'get_stats',
          arguments: { skill_id: skill, period: 'today' }
        }]
      };
    }

    // Default: just respond
    return {
      content: "I'm here to help you track things! Try saying something like 'drank 500ml water' or 'feeling good today, 8/10' or 'teach me to track coffee'."
    };
  };
}

/**
 * Auto-detect and create provider based on environment
 */
export function createAutoProvider() {
  if (process.env.OPENAI_API_KEY) {
    console.log('Using OpenAI provider');
    return createOpenAIProvider();
  }
  if (process.env.ANTHROPIC_API_KEY) {
    console.log('Using Anthropic provider');
    return createAnthropicProvider();
  }
  if (process.env.OLLAMA_HOST || process.env.OLLAMA_MODEL) {
    console.log('Using Ollama provider');
    return createOllamaProvider();
  }
  
  console.log('No LLM API key found, using mock provider');
  return createMockProvider();
}

export default {
  createOpenAIProvider,
  createAnthropicProvider,
  createOllamaProvider,
  createMockProvider,
  createAutoProvider
};
