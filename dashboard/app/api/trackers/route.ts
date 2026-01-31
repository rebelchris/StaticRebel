import { NextResponse } from 'next/server';

// Redirect trackers API to skills API
// Trackers are now unified under the skills system

export async function GET() {
  // Redirect to skills endpoint
  return NextResponse.redirect(new URL('/api/skills', 'http://localhost:3000'));
}

export async function POST() {
  return NextResponse.json({ 
    error: 'Trackers API deprecated. Use /api/skills instead.',
    redirect: '/api/skills'
  }, { status: 301 });
}
