import { NextRequest, NextResponse } from 'next/server';
import { getActivePersona } from '@/lib/personaManager.js';
import { searchMemories } from '@/lib/vectorMemory.js';
import { handleChat } from '@/lib/chatHandler.js';

// In-memory chat history for this session
let chatHistory: Array<{ role: string; content: string; timestamp: string }> = [];
const MAX_HISTORY = 50;

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

    // Get active persona
    let activePersona = getActivePersona();

    // Search for relevant memories
    let context = '';
    if (sanitizedMessage.length > 10) {
      try {
        const memories = await searchMemories(sanitizedMessage, {
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

    // Generate response using the actual chat handler
    let responseText: string;

    try {
      // Try to use the actual chat handler for AI responses
      const result: any = await handleChat(sanitizedMessage, {
        source: 'dashboard',
        context: { persona: activePersona },
      });
      responseText = result?.content || result?.response || String(result);
    } catch (e: any) {
      console.error('Chat handler error, using fallback:', e?.message || e);
      responseText = generateFallbackResponse(sanitizedMessage, activePersona);
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
      type: 'ai',
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

function generateFallbackResponse(message: string, persona: any): string {
  const lowerMessage = message.toLowerCase();
  const personaName = persona?.name || 'StaticRebel';

  // Greetings
  if (lowerMessage.match(/^(hi|hello|hey|good morning|good afternoon|good evening)/)) {
    return `Hello! I'm ${personaName}. How can I help you today?`;
  }

  // Help request
  if (lowerMessage.includes('help') || lowerMessage.includes('what can you do')) {
    return `I can help you with:
- Answering questions and having conversations
- Writing and debugging code
- Managing tasks and schedules
- Searching through your memories
- And much more!

Just ask me anything.`;
  }

  // Who are you
  if (lowerMessage.includes('who are you')) {
    return `I'm ${personaName}, an AI assistant powered by local Ollama models. I can help with coding, analysis, scheduling, memory management, and general tasks.`;
  }

  // Status check
  if (lowerMessage.includes('status') || lowerMessage.includes('how are you')) {
    return `I'm running smoothly! Here's a quick status:
- Active Persona: ${personaName}
- System: Online
- Ready to assist you with any task.`;
  }

  // Default response
  return `I received your message: "${message.slice(0, 100)}${message.length > 100 ? '...' : ''}"

As ${personaName}, I'm here to help.

Note: For full AI responses with advanced reasoning, make sure Ollama is running with a model loaded.`;
}
