import { NextRequest, NextResponse } from 'next/server';
import { searchMemories } from '@/lib/vectorMemory.js';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const query = searchParams.get('q');

    if (!query) {
      return NextResponse.json({ error: 'Search query required' }, { status: 400 });
    }

    try {
      const results = await searchMemories(query, {
        limit: 20,
        minScore: 0.1,
      });

      const normalizedResults = results.map((m: any, i: number) => ({
        id: m.id || `result-${i}`,
        date: m.timestamp || m.date || new Date().toISOString(),
        content: m.content || m.text || '',
        type: m.type || 'vector',
        score: m.score,
      }));

      return NextResponse.json(normalizedResults);
    } catch (e) {
      return NextResponse.json([]);
    }
  } catch (error) {
    console.error('Memory search error:', error);
    return NextResponse.json([]);
  }
}
