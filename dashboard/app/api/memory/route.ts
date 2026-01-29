import { NextRequest, NextResponse } from 'next/server';
import path from 'path';

async function loadModule(moduleName: string) {
  try {
    const modulePath = path.join(process.cwd(), '..', 'lib', `${moduleName}.js`);
    return await import(modulePath);
  } catch (error) {
    return null;
  }
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const type = searchParams.get('type') || 'daily';

    const vectorMemory = await loadModule('vectorMemory');
    const memoryManager = await loadModule('memoryManager');

    let memories: any[] = [];

    if (type === 'vector' && vectorMemory?.getAllMemories) {
      memories = await vectorMemory.getAllMemories({ limit: 50 });
    } else if (memoryManager?.getRecentDailyMemories) {
      memories = memoryManager.getRecentDailyMemories(50);
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

    const vectorMemory = await loadModule('vectorMemory');

    if (vectorMemory?.addMemory) {
      await vectorMemory.addMemory(content, { type });
      return NextResponse.json({ success: true, message: 'Memory added' });
    }

    return NextResponse.json({ error: 'Memory system not available' }, { status: 503 });
  } catch (error) {
    console.error('Memory add error:', error);
    return NextResponse.json({ error: 'Failed to add memory' }, { status: 500 });
  }
}
