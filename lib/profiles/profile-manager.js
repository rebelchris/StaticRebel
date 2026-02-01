/**
 * User Profile Management
 * User onboarding, profile creation and management
 */

import fs from 'fs';
import path from 'path';
import os from 'os';

const PROFILE_FILE = path.join(os.homedir(), '.static-rebel', 'profile.md');

const PROFILE_TEMPLATE = `# User Profile

*Last updated: {date}*

## Basics
- **Name:** {name}
- **Role:** {role}
- **Location:** {location}

## Preferences
- **Communication style:** {communication_style}
- **Preferred tools/technologies:** {tools}
- **Work hours:** {work_hours}

## Current Context
{context}

## Goals & Projects
{goals}

## Notes
{notes}
`;

const ONBOARDING_QUESTIONS = [
  {
    key: 'name',
    prompt: "Hi! I'm Charlize. What's your name?",
    default: 'Friend',
  },
  {
    key: 'role',
    prompt: 'Nice to meet you, {name}. What do you do for work?',
    default: 'Developer',
  },
  { key: 'location', prompt: 'Where are you based?', default: 'Somewhere' },
  {
    key: 'communication_style',
    prompt:
      'How do you prefer to communicate? (brief & direct / detailed & thorough)',
    default: 'brief',
  },
  {
    key: 'tools',
    prompt: 'What tools or technologies do you use most?',
    default: 'Various',
  },
  {
    key: 'work_hours',
    prompt: 'What are your typical work hours?',
    default: '9-5',
  },
  {
    key: 'goals',
    prompt: 'What are you working on right now? Any big goals?',
    default: 'Just exploring',
  },
];

/**
 * Load user profile from file
 */
function loadProfile() {
  try {
    if (fs.existsSync(PROFILE_FILE)) {
      return fs.readFileSync(PROFILE_FILE, 'utf-8');
    }
  } catch (e) {}
  return null;
}

/**
 * Save profile data to file
 */
function saveProfile(data) {
  try {
    const dir = path.dirname(PROFILE_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(PROFILE_FILE, data);
    return true;
  } catch (e) {
    console.error('Failed to save profile:', e.message);
    return false;
  }
}

/**
 * Interactive profile building with onboarding questions
 */
async function buildProfile(rl) {
  console.clear();
  console.log('='.repeat(50));
  console.log('  Charlize - Initial Setup');
  console.log('='.repeat(50));
  console.log('  Let me get to know you a bit...\n');

  const answers = {};

  for (const q of ONBOARDING_QUESTIONS) {
    // Replace {name} placeholder with actual name if we have it
    const question = q.prompt.replace('{name}', answers.name || 'friend');
    const answer = await new Promise((resolve) => {
      rl.question(`  ${question}: `, resolve);
    });
    answers[q.key] = answer.trim() || q.default;
  }

  const profile = PROFILE_TEMPLATE.replace(
    '{date}',
    new Date().toLocaleDateString(),
  )
    .replace('{name}', answers.name)
    .replace('{role}', answers.role)
    .replace('{location}', answers.location)
    .replace('{communication_style}', answers.communication_style)
    .replace('{tools}', answers.tools)
    .replace('{work_hours}', answers.work_hours)
    .replace('{context}', `Just set up Charlize as their AI assistant`)
    .replace('{goals}', answers.goals)
    .replace('{notes}', '');

  saveProfile(profile);

  console.log('\n  Profile saved!\n');
  return profile;
}

/**
 * Check if user has a profile
 */
function hasProfile() {
  return fs.existsSync(PROFILE_FILE);
}

/**
 * Update profile field
 */
function updateProfileField(field, value) {
  const profile = loadProfile();
  if (!profile) return false;

  // Simple field update - replace field value
  const fieldRegex = new RegExp(`(\\*\\*${field}:\\*\\*)[^\\n]*`, 'gi');
  const updatedProfile = profile.replace(fieldRegex, `$1 ${value}`);
  
  return saveProfile(updatedProfile);
}

export {
  PROFILE_FILE,
  PROFILE_TEMPLATE,
  ONBOARDING_QUESTIONS,
  loadProfile,
  saveProfile,
  buildProfile,
  hasProfile,
  updateProfileField,
};