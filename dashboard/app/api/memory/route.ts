import { NextRequest, NextResponse } from 'next/server';
import { getAllMemories, addMemory } from '@/lib/vectorMemory.js';
import { getRecentDailyMemories } from '@/lib/memoryManager.js';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const type = searchParams.get('type') || 'daily';

    let memories: any[] = [];

    if (type === 'vector') {
      try {
        memories = await getAllMemories({ limit: 50 });
      } catch (e) {
        // Vector memory not available
      }
    } else {
      try {
        memories = getRecentDailyMemories(50);
      } catch (e) {
        // Memory manager not available
      }
    }

    // Normalize memory format
    const normalizedMemories = memories.map((m: any, i: number) => ({
      id: m.id || `mem-${i}`,
      date: m.timestamp || m.date || new Date().toISOString(),
      content: m.content || m.summary || m.text || JSON.stringify(m),
      type: m.type || type,
      score: m.score,
    }));

    return NextResponse.json(normalizedMemories);
  } catch (error) {
    console.error('Memory fetch error:', error);
    return NextResponse.json([]);
  }
}

export async function POST(request: NextRequest) {
  try {
    const { content, type = 'manual' } = await request.json();

    if (!content) {
      return NextResponse.json({ error: 'Content is required' }, { status: 400 });
    }

    try {
      await addMemory(content, { type });
      return NextResponse.json({ success: true, message: 'Memory added' });
    } catch (e) {
      return NextResponse.json({ error: 'Memory system not available' }, { status: 503 });
    }
  } catch (error) {
    console.error('Memory add error:', error);
    return NextResponse.json({ error: 'Failed to add memory' }, { status: 500 });
  }
}
