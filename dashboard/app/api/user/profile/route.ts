import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const CONFIG_DIR = path.join(process.env.HOME || '~', '.static-rebel');
const PROFILE_FILE = path.join(CONFIG_DIR, 'user-profile.json');

function ensureConfigDir() {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

function getProfile() {
  try {
    if (fs.existsSync(PROFILE_FILE)) {
      const data = fs.readFileSync(PROFILE_FILE, 'utf-8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('Failed to read profile:', error);
  }

  // Default profile
  return {
    name: '',
    preferences: {
      tone: 'friendly',
      responseLength: 'medium',
      codeStyle: 'explained',
      notifications: true,
    },
  };
}

function saveProfile(profile: any) {
  ensureConfigDir();
  fs.writeFileSync(PROFILE_FILE, JSON.stringify(profile, null, 2));
}

export async function GET() {
  try {
    const profile = getProfile();
    return NextResponse.json(profile);
  } catch (error) {
    console.error('Profile fetch error:', error);
    return NextResponse.json(
      {
        name: '',
        preferences: {
          tone: 'friendly',
          responseLength: 'medium',
          codeStyle: 'explained',
          notifications: true,
        },
      }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const newProfile = await request.json();

    // Validate
    if (typeof newProfile !== 'object') {
      return NextResponse.json({ error: 'Invalid profile data' }, { status: 400 });
    }

    // Merge with existing
    const currentProfile = getProfile();
    const mergedProfile = {
      ...currentProfile,
      ...newProfile,
      preferences: {
        ...currentProfile.preferences,
        ...(newProfile.preferences || {}),
      },
    };

    saveProfile(mergedProfile);

    return NextResponse.json({ success: true, profile: mergedProfile });
  } catch (error) {
    console.error('Profile save error:', error);
    return NextResponse.json({ error: 'Failed to save profile' }, { status: 500 });
  }
}
