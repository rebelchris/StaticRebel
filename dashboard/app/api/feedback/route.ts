import { NextRequest, NextResponse } from 'next/server';
import { logFeedback, getFeedbackStats } from '@/lib/feedbackManager.js';

export async function POST(request: NextRequest) {
  try {
    const { messageId, feedback } = await request.json();

    if (!messageId || !feedback) {
      return NextResponse.json(
        { error: 'Message ID and feedback are required' },
        { status: 400 }
      );
    }

    // Try to use feedback manager
    try {
      await logFeedback({
        messageId,
        feedback: feedback === 'up' ? 'positive' : 'negative',
        timestamp: new Date().toISOString(),
        source: 'dashboard',
      });
    } catch (e) {
      // Feedback manager not available, silently continue
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Feedback error:', error);
    return NextResponse.json({ error: 'Failed to save feedback' }, { status: 500 });
  }
}

export async function GET() {
  try {
    const stats = getFeedbackStats();
    return NextResponse.json(stats);
  } catch (error) {
    console.error('Feedback fetch error:', error);
    return NextResponse.json({ positive: 0, negative: 0, total: 0 });
  }
}
