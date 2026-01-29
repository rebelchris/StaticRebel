// Chat API - Chat interface endpoints
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

let personaManager, vectorMemory, configManager;
let chatHistory = [];

// Validation constants
const MAX_MESSAGE_LENGTH = 10000;
const MAX_HISTORY_SIZE = 100;
const ALLOWED_OPTIONS_KEYS = ['temperature', 'maxTokens', 'stream'];

/**
 * Validate and sanitize message input
 * @param {any} message - The message to validate
 * @returns {object} Validation result
 */
function validateMessage(message) {
  // Check type
  if (typeof message !== 'string') {
    return { valid: false, error: 'Message must be a string' };
  }

  // Check empty
  const trimmed = message.trim();
  if (!trimmed) {
    return { valid: false, error: 'Message cannot be empty' };
  }

  // Check length
  if (message.length > MAX_MESSAGE_LENGTH) {
    return {
      valid: false,
      error: `Message exceeds maximum length of ${MAX_MESSAGE_LENGTH} characters`,
    };
  }

  // Sanitize - remove control characters except newlines and tabs
  const sanitized = message.replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, '');

  return { valid: true, sanitized };
}

/**
 * Validate persona ID
 * @param {any} personaId - The persona ID to validate
 * @returns {boolean} Whether the ID is valid
 */
function validatePersonaId(personaId) {
  if (personaId === undefined || personaId === null) return true; // Optional
  if (typeof personaId !== 'string') return false;
  // Allow alphanumeric, hyphens, and underscores
  return /^[a-zA-Z0-9_-]+$/.test(personaId);
}

/**
 * Validate options object
 * @param {any} options - The options to validate
 * @returns {object} Validation result with sanitized options
 */
function validateOptions(options) {
  if (!options || typeof options !== 'object') {
    return { valid: true, sanitized: {} };
  }

  const sanitized = {};

  for (const key of ALLOWED_OPTIONS_KEYS) {
    if (key in options) {
      if (key === 'temperature' && typeof options[key] === 'number') {
        sanitized[key] = Math.max(0, Math.min(2, options[key]));
      } else if (key === 'maxTokens' && typeof options[key] === 'number') {
        sanitized[key] = Math.max(1, Math.min(8192, Math.floor(options[key])));
      } else if (key === 'stream' && typeof options[key] === 'boolean') {
        sanitized[key] = options[key];
      }
    }
  }

  return { valid: true, sanitized };
}

async function loadModules() {
  if (personaManager) return;
  try {
    const personaPath = path.join(
      __dirname,
      '..',
      '..',
      'lib',
      'personaManager.js',
    );
    const vectorPath = path.join(
      __dirname,
      '..',
      '..',
      'lib',
      'vectorMemory.js',
    );
    const configPath = path.join(
      __dirname,
      '..',
      '..',
      'lib',
      'configManager.js',
    );
    const agentPath = path.join(
      __dirname,
      '..',
      '..',
      'agents',
      'main',
      'agent.js',
    );

    const personaModule = await import(personaPath);
    personaManager = personaModule;

    const vectorModule = await import(vectorPath);
    vectorMemory = vectorModule;

    const configModule = await import(configPath);
    configManager = configModule;
  } catch (error) {
    console.error('Error loading chat modules:', error.message);
  }
}

// Send chat message
router.post('/', async (req, res) => {
  try {
    await loadModules();

    const { message, personaId, options = {} } = req.body;

    // Validate message
    const messageValidation = validateMessage(message);
    if (!messageValidation.valid) {
      return res.status(400).json({ error: messageValidation.error });
    }

    // Validate persona ID
    if (!validatePersonaId(personaId)) {
      return res.status(400).json({ error: 'Invalid persona ID format' });
    }

    // Validate options
    const optionsValidation = validateOptions(options);
    if (!optionsValidation.valid) {
      return res.status(400).json({ error: 'Invalid options format' });
    }

    const sanitizedMessage = messageValidation.sanitized;
    const sanitizedOptions = optionsValidation.sanitized;

    // Get active persona
    let activePersona;
    if (personaId) {
      activePersona = personaManager?.getPersonaById?.(personaId);
    }
    if (!activePersona) {
      activePersona = personaManager?.getActivePersona?.();
    }

    // Search for relevant memories
    let context = '';
    try {
      if (vectorMemory?.searchMemories && sanitizedMessage.length > 10) {
        const memories = await vectorMemory.searchMemories(sanitizedMessage, {
          limit: 3,
          minScore: 0.2,
        });
        if (memories.length > 0) {
          context =
            '\n\nRelevant memories:\n' +
            memories
              .map(
                (m) =>
                  `- ${m.content} (relevance: ${(m.score * 100).toFixed(0)}%)`,
              )
              .join('\n');
        }
      }
    } catch (e) {}

    // Build system prompt
    let systemPrompt = 'You are a helpful AI assistant.';
    if (activePersona?.systemPrompt) {
      systemPrompt = activePersona.systemPrompt;
    }

    // Add context to system prompt
    if (context) {
      systemPrompt += context;
    }

    // Add to history (with size limit)
    chatHistory.push({
      role: 'user',
      content: sanitizedMessage,
      timestamp: new Date().toISOString(),
    });

    // Trim history if it exceeds max size
    if (chatHistory.length > MAX_HISTORY_SIZE) {
      chatHistory = chatHistory.slice(-MAX_HISTORY_SIZE);
    }

    // Simple response generation (in production, would call Ollama)
    let responseText = '';
    let usedMemory = false;

    // Generate a response based on the message
    const lowerMessage = sanitizedMessage.toLowerCase();

    if (lowerMessage.includes('hello') || lowerMessage.includes('hi')) {
      responseText = `Hello! I'm ${activePersona?.name || 'Charlize'}, your AI assistant. How can I help you today?`;
    } else if (lowerMessage.includes('help')) {
      responseText = `I can help you with:\n- Answering questions\n- Writing and debugging code\n- Managing tasks and schedules\n- Searching through memories\n- And much more!\n\nJust ask me anything.`;
    } else if (lowerMessage.includes('who are you')) {
      responseText = `I'm ${activePersona?.name || 'Charlize'}, an AI assistant powered by local Ollama models. I can help with coding, analysis, scheduling, memory management, and general tasks.\n\nI'm running on: ${configManager?.getConfig?.('ollama.baseUrl') || 'http://localhost:11434'}`;
    } else if (
      lowerMessage.includes('remember') ||
      lowerMessage.includes('store')
    ) {
      // Store the message as a memory
      try {
        if (vectorMemory?.addMemory) {
          await vectorMemory.addMemory(sanitizedMessage, {
            type: 'conversation',
          });
          responseText =
            "I've stored that information in my memory for future reference.";
          usedMemory = true;
        }
      } catch (e) {}
    } else if (
      lowerMessage.includes('status') ||
      lowerMessage.includes('how are you')
    ) {
      responseText = `I'm running smoothly! Here's a quick status:\n- Active Persona: ${activePersona?.name || 'Unknown'}\n- System: Online\n- Ready to assist you with any task.`;
    } else {
      // Default response
      responseText = `I received your message.\n\n${activePersona?.role ? `As ${activePersona.name} (${activePersona.role}), I'm here to help.` : "I'm here to help."}\n\nIn a full implementation, this would call Ollama to generate a proper response.`;
    }

    // Add context about stored memory
    if (usedMemory && context) {
      responseText +=
        '\n\nI also found some relevant memories that might be helpful.';
    }

    // Add to history
    chatHistory.push({
      role: 'assistant',
      content: responseText,
      timestamp: new Date().toISOString(),
      persona: activePersona?.name,
    });

    // Keep only last 50 messages
    if (chatHistory.length > 50) {
      chatHistory = chatHistory.slice(-50);
    }

    // Broadcast update
    req.app.locals.broadcast?.('chatMessage', {
      user: message,
      assistant: responseText,
      persona: activePersona?.name,
    });

    res.json({
      response: responseText,
      persona: activePersona,
      history: chatHistory.slice(-10),
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get chat history
router.get('/history', async (req, res) => {
  try {
    await loadModules();

    const { limit = 20 } = req.query;

    res.json({
      history: chatHistory.slice(-parseInt(limit)),
      total: chatHistory.length,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Clear chat history
router.delete('/history', async (req, res) => {
  try {
    chatHistory = [];
    res.json({ success: true, message: 'Chat history cleared' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get active persona info
router.get('/persona', async (req, res) => {
  try {
    await loadModules();

    const activePersona = personaManager?.getActivePersona?.();
    const personas = personaManager?.getAvailablePersonas?.() || {};

    res.json({
      active: activePersona,
      available: Object.values(personas),
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Quick commands
router.post('/command', async (req, res) => {
  try {
    await loadModules();

    const { command } = req.body;

    if (!command) {
      return res.status(400).json({ error: 'Command is required' });
    }

    let response = '';
    const lowerCommand = command.toLowerCase();

    switch (true) {
      case lowerCommand.includes('status'):
        response = 'System Status: Online\nAll services running normally.';
        break;
      case lowerCommand.includes('time'):
        response = `Current time: ${new Date().toLocaleString()}`;
        break;
      case lowerCommand.includes('uptime'):
        response = `System uptime: ${Math.floor(process.uptime() / 60)} minutes`;
        break;
      case lowerCommand.includes('persona'):
        const active = personaManager?.getActivePersona?.();
        response = `Active persona: ${active?.name || 'Unknown'}\nRole: ${active?.role || 'N/A'}`;
        break;
      case lowerCommand.includes('memory stats'):
        const stats = vectorMemory?.getMemoryStats?.() || {};
        response = `Memory Stats:\n- Total memories: ${stats.totalMemories || 0}\n- By type: ${JSON.stringify(stats.byType || {})}`;
        break;
      default:
        response = `Command "${command}" recognized. This is a quick command endpoint.`;
    }

    res.json({ response, command });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
