import { NextRequest, NextResponse } from 'next/server';
import path from 'path';

async function loadTrackerModule() {
  try {
    const trackerPath = path.join(process.cwd(), '..', 'tracker.js');
    return await import(trackerPath);
  } catch (error) {
    console.error('Failed to load tracker module:', error);
    return null;
  }
}

export async function GET() {
  try {
    const trackerModule = await loadTrackerModule();

    if (trackerModule?.TrackerStore) {
      const store = new trackerModule.TrackerStore();
      const trackers = store.listTrackers();

      // Enrich with entry counts
      const enrichedTrackers = trackers.map((tracker: any) => {
        const entries = store.getEntries(tracker.name);
        return {
          ...tracker,
          id: tracker.name,
          count: entries?.length || 0,
          lastEntry: entries?.length > 0 ? entries[entries.length - 1]?.timestamp : null,
        };
      });

      return NextResponse.json(enrichedTrackers);
    }

    return NextResponse.json([]);
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

    const trackerModule = await loadTrackerModule();

    if (trackerModule?.TrackerStore) {
      const store = new trackerModule.TrackerStore();
      store.createTracker(name, { type, displayName });
      return NextResponse.json({ success: true, message: 'Tracker created' });
    }

    return NextResponse.json({ error: 'Tracker system not available' }, { status: 503 });
  } catch (error) {
    console.error('Tracker create error:', error);
    return NextResponse.json({ error: 'Failed to create tracker' }, { status: 500 });
  }
}
