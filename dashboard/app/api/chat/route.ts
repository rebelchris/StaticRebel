import { NextRequest, NextResponse } from 'next/server';

const API_URL = process.env.ASSISTANT_API_URL || 'http://localhost:8080';

// Track chat history for the session
let chatHistory: Array<{ role: string; content: string; timestamp: string }> = [];
const MAX_HISTORY = 50;

export async function POST(request: NextRequest) {
  try {
    const { message } = await request.json();

    if (!message || typeof message !== 'string') {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 });
    }

    const sanitizedMessage = message.trim().slice(0, 10000);
    if (!sanitizedMessage) {
      return NextResponse.json({ error: 'Message cannot be empty' }, { status: 400 });
    }

    chatHistory.push({
      role: 'user',
      content: sanitizedMessage,
      timestamp: new Date().toISOString(),
    });

    if (chatHistory.length > MAX_HISTORY) {
      chatHistory = chatHistory.slice(-MAX_HISTORY);
    }

    const responseText = await processMessage(sanitizedMessage);

    chatHistory.push({
      role: 'assistant',
      content: responseText,
      timestamp: new Date().toISOString(),
    });

    return NextResponse.json({
      response: responseText,
      history: chatHistory.slice(-10),
    });
  } catch (error: any) {
    console.error('Chat API error:', error);
    return NextResponse.json(
      { error: 'Failed to process message', details: error.message },
      { status: 500 }
    );
  }
}

async function processMessage(message: string): Promise<string> {
  try {
    const response = await fetch(`${API_URL}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message,
        context: { source: 'web-dashboard' }
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.details || 'Assistant API error');
    }

    const data = await response.json();
    return data.response;
  } catch (error: any) {
    console.error('[Chat] Proxy error:', error.message);
    return `Could not reach the assistant. Make sure Charlize is running with \`node enhanced.js\`.`;
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
