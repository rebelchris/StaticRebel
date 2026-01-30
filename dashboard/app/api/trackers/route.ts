import { NextRequest, NextResponse } from 'next/server';
import { TrackerStore } from '@/tracker.js';

export async function GET() {
  try {
    const store = new TrackerStore();
    const trackers = store.listTrackers();

    // Add id field for consistency
    const enrichedTrackers = trackers.map((tracker: any) => ({
      ...tracker,
      id: tracker.name || tracker.id,
    }));

    return NextResponse.json(enrichedTrackers);
  } catch (error) {
    console.error('Trackers fetch error:', error);
    return NextResponse.json([]);
  }
}

export async function POST(request: NextRequest) {
  try {
    const { name, type, displayName } = await request.json();

    if (!name) {
      return NextResponse.json({ error: 'Tracker name is required' }, { status: 400 });
    }

    try {
      const store = new TrackerStore();
      store.createTracker({ name, type, displayName } as any);
      return NextResponse.json({ success: true, message: 'Tracker created' });
    } catch (e) {
      return NextResponse.json({ error: 'Tracker system not available' }, { status: 503 });
    }
  } catch (error) {
    console.error('Tracker create error:', error);
    return NextResponse.json({ error: 'Failed to create tracker' }, { status: 500 });
  }
}
