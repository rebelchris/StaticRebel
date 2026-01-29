import { NextRequest, NextResponse } from 'next/server';
import path from 'path';

// In-memory chat history for this session
let chatHistory: Array<{ role: string; content: string; timestamp: string }> = [];
const MAX_HISTORY = 50;

// Helper to safely import lib modules
async function loadModule(moduleName: string) {
  try {
    const modulePath = path.join(process.cwd(), '..', 'lib', `${moduleName}.js`);
    return await import(modulePath);
  } catch (error) {
    console.error(`Failed to load ${moduleName}:`, error);
    return null;
  }
}

export async function POST(request: NextRequest) {
  try {
    const { message, stream = false } = await request.json();

    if (!message || typeof message !== 'string') {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 });
    }

    const sanitizedMessage = message.trim().slice(0, 10000);
    if (!sanitizedMessage) {
      return NextResponse.json({ error: 'Message cannot be empty' }, { status: 400 });
    }

    // Load chat handler
    const chatHandler = await loadModule('chatHandler');
    const personaManager = await loadModule('personaManager');
    const vectorMemory = await loadModule('vectorMemory');

    // Get active persona
    let activePersona = personaManager?.getActivePersona?.();

    // Search for relevant memories
    let context = '';
    if (vectorMemory?.searchMemories && sanitizedMessage.length > 10) {
      try {
        const memories = await vectorMemory.searchMemories(sanitizedMessage, {
          limit: 3,
          minScore: 0.2,
        });
        if (memories.length > 0) {
          context =
            '\n\nRelevant memories:\n' +
            memories
              .map((m: any) => `- ${m.content} (relevance: ${(m.score * 100).toFixed(0)}%)`)
              .join('\n');
        }
      } catch (e) {
        // Memory search failed, continue without context
      }
    }

    // Add user message to history
    chatHistory.push({
      role: 'user',
      content: sanitizedMessage,
      timestamp: new Date().toISOString(),
    });

    // Trim history
    if (chatHistory.length > MAX_HISTORY) {
      chatHistory = chatHistory.slice(-MAX_HISTORY);
    }

    let responseText = '';

    // Try to use chat handler
    if (chatHandler?.handleChat) {
      try {
        const result = await chatHandler.handleChat(sanitizedMessage, {
          source: 'dashboard',
          context: {
            user: { persona: activePersona },
            conversation: { history: chatHistory },
          },
        });
        responseText = result.content || 'I could not process your request.';
      } catch (error) {
        console.error('Chat handler error:', error);
        responseText = getFallbackResponse(sanitizedMessage, activePersona);
      }
    } else {
      // Fallback response
      responseText = getFallbackResponse(sanitizedMessage, activePersona);
    }

    // Add context note if memories were found
    if (context) {
      responseText += '\n\n_I found some relevant memories that helped inform this response._';
    }

    // Add assistant response to history
    chatHistory.push({
      role: 'assistant',
      content: responseText,
      timestamp: new Date().toISOString(),
    });

    return NextResponse.json({
      response: responseText,
      persona: activePersona,
      history: chatHistory.slice(-10),
    });
  } catch (error) {
    console.error('Chat API error:', error);
    return NextResponse.json(
      { error: 'Failed to process chat message' },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    history: chatHistory.slice(-20),
    total: chatHistory.length,
  });
}

export async function DELETE() {
  chatHistory = [];
  return NextResponse.json({ success: true, message: 'Chat history cleared' });
}

function getFallbackResponse(message: string, persona: any): string {
  const lowerMessage = message.toLowerCase();

  if (lowerMessage.includes('hello') || lowerMessage.includes('hi')) {
    return `Hello! I'm ${persona?.name || 'your AI assistant'}. How can I help you today?`;
  }

  if (lowerMessage.includes('help')) {
    return `I can help you with:
- Answering questions
- Writing and debugging code
- Managing tasks and schedules
- Searching through memories
- And much more!

Just ask me anything.`;
  }

  if (lowerMessage.includes('who are you')) {
    return `I'm ${persona?.name || 'StaticRebel'}, an AI assistant powered by local Ollama models. I can help with coding, analysis, scheduling, memory management, and general tasks.`;
  }

  if (lowerMessage.includes('status') || lowerMessage.includes('how are you')) {
    return `I'm running smoothly! Here's a quick status:
- Active Persona: ${persona?.name || 'Default'}
- System: Online
- Ready to assist you with any task.`;
  }

  return `I received your message: "${message.slice(0, 100)}${message.length > 100 ? '...' : ''}"

${persona?.role ? `As ${persona.name} (${persona.role}), I'm here to help.` : "I'm here to help."}

Note: For full AI responses, make sure Ollama is running with llama3.2 loaded.`;
}
