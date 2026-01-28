import readline from 'readline';
import fs from 'fs';
import path from 'path';
import os from 'os';

// ============================================================================
// Charlize's Companion - A Cute Terminal Friend
// ============================================================================

const COMPANIONS = {
  pixie: {
    name: 'Pixie',
    emoji: '🧚',
    color: '\x1b[35m', // Magenta
    height: 4,
    frames: {
      idle: [
        '    .',
        '   /|\\',
        '  ( . )',
        '   /|\\'
      ],
      happy: [
        '    ⭐',
        '   /|\\',
        '  ( ◠ ◠ )',
        '   /|\\'
      ],
      thinking: [
        '    ...',
        '   /|\\',
        '  ( -_- )',
        '   /|\\'
      ],
      excited: [
        '    ✨',
        '   /|\\',
        '  ( ◉ ◉ )',
        '   /|\\'
      ],
      celebrating: [
        '  🎉 ⭐ 🎉',
        '   /|\\',
        '  ( ★ ★ )',
        '   /|\\'
      ],
      tired: [
        '    zZ',
        '   /|\\',
        '  ( -_- )',
        '   /|\\'
      ],
      working: [
        '    🔧',
        '   /|\\',
        '  ( ◕ ◕ )',
        '   /|\\'
      ],
      workout: [
        '    💪',
        '   /|\\',
        '  ( ⚡ ⚡ )',
        '   /|\\'
      ],
      sleeping: [
        '    zZ',
        '  -/|-',
        '  ( -.- )',
        '   |_|'
      ]
    }
  },

  blob: {
    name: 'Blob',
    emoji: '🟢',
    color: '\x1b[32m', // Green
    height: 3,
    frames: {
      idle: [
        '   ████████',
        ' ███░░░░░░██',
        '█░░░░░░░░░░█',
        '█░░░░░░░░░░█',
        '█░░░░░░░░░░█',
        ' ███░░░░░░██',
        '   ████████'
      ],
      happy: [
        '   ████████',
        ' ███░^░^░░██',
        '█░░░◠◠░░░░█',
        '█░░░◠◠░░░░█',
        '█░░░◠◠░░░░█',
        ' ███░^░^░░██',
        '   ████████'
      ],
      thinking: [
        '   ████████',
        ' ███░o.o░░██',
        '█░░░_-_-░░░█',
        '█░░░_-_-░░░█',
        '█░░░_-_-░░░█',
        ' ███░o.o░░██',
        '   ████████'
      ],
      excited: [
        '   ████████',
        ' ███░★░★░░██',
        '█░░░◉◉░░░░█',
        '█░░░◉◉░░░░█',
        '█░░░◉◉░░░░█',
        ' ███░★░★░░██',
        '   ████████'
      ],
      celebrating: [
        ' ⭐ ████████ ⭐',
        ' ███░★░★░░░░██',
        '█░░░◉◉★★░░░░█',
        '█░░░◉◉★★░░░░█',
        '█░░░◉◉★★░░░░█',
        ' ███░★░★░░░░██',
        ' ⭐ ████████ ⭐'
      ],
      tired: [
        '   ████████',
        ' ███░z░z░░██',
        '█░░░_-_░░░░█',
        '█░░░_-_░░░░█',
        '█░░░_-_░░░░█',
        ' ███░z░z░░██',
        '   ████████'
      ],
      working: [
        '   ████████',
        ' ███░B-)░░██',
        '█░░░O_O░░░░█',
        '█░░░O_O░░░░█',
        '█░░░O_O░░░░█',
        ' ███░B-)░░██',
        '   ████████'
      ],
      workout: [
        '   ████████',
        ' ███░💪░░░██',
        '█░░░⚡⚡░░░░█',
        '█░░░⚡⚡░░░░█',
        '█░░░⚡⚡░░░░█',
        ' ███░💪░░░██',
        '   ████████'
      ],
      sleeping: [
        '   ████████',
        ' ███░zzz░░██',
        '█░░░_-_░░░░█',
        '█░░░_-_░░░░█',
        '█░░░_-_░░░░█',
        ' ███░zzz░░██',
        '   ████████'
      ]
    }
  },

  cat: {
    name: 'Mochi',
    emoji: '🐱',
    color: '\x1b[33m', // Yellow
    height: 4,
    frames: {
      idle: [
        '    /\\___/\\',
        '   ( o.o )',
        '   /  |  \\',
        '  (   |   )'
      ],
      happy: [
        '    /\\___/\\',
        '   ( ^.^ )',
        '   /  >  \\',
        '  (  /\\  )'
      ],
      thinking: [
        '    /\\___/\\',
        '   ( -.- )',
        '   /  o  \\',
        '  (  /|\\  )'
      ],
      excited: [
        '    /\\___/\\',
        '   ( >o< )',
        '   /  |  \\',
        '  (  / \\  )'
      ],
      celebrating: [
        '  ⭐ /\\___/\\ ⭐',
        '   ( ◉ ◉ )',
        '   /  |  \\',
        '  (  / \\  )'
      ],
      tired: [
        '    /\\___/\\',
        '   ( -_- )',
        '   /  -  \\',
        '  (  / \\  )'
      ],
      working: [
        '    /\\___/\\',
        '   ( O.O )',
        '   /  -  \\',
        '  (  / \\  )'
      ],
      workout: [
        '    /\\___/\\',
        '   ( ⚡ ⚡ )',
        '   /  ^  \\',
        '  (  / \\  )'
      ],
      sleeping: [
        '    /\\___/\\',
        '   ( -.- )',
        '   / --- \\',
        '  (  zzz )'
      ]
    }
  },

  fox: {
    name: ' Ember',
    emoji: '🦊',
    color: '\x1b[31m', // Red
    height: 4,
    frames: {
      idle: [
        '     /\\',
        '    /  \\',
        '   / ^  \\',
        '  (  |  )'
      ],
      happy: [
        '     /\\',
        '    /  \\',
        '   / ^ ^\\',
        '  (  > < )'
      ],
      thinking: [
        '     /\\',
        '    /  \\',
        '   / o o\\',
        '  (  -  )'
      ],
      excited: [
        '    ✨/\\',
        '   /  /\\',
        '  / ^ ^\\',
        ' (  > < )'
      ],
      celebrating: [
        '  🎉 /\\ 🎉',
        '   /  /\\',
        '  / ^ ^\\',
        ' (  > < )'
      ],
      tired: [
        '     /\\',
        '    /  \\',
        '   / - -\\',
        '  (  _  )'
      ],
      working: [
        '     /\\',
        '    /  \\',
        '   / . .\\',
        '  (  O  )'
      ],
      workout: [
        '   💪/\\',
        '    /  \\',
        '   / ^ ^\\',
        '  (  > < )'
      ],
      sleeping: [
        '     /\\',
        '    /  \\',
        '   / ---\\',
        '  (  z  )'
      ]
    }
  }
};

let currentCompanion = 'cat';
let currentState = 'idle';
let animationFrame = 0;
let animationInterval = null;
let isVisible = true;
let showStats = true;
let stats = {
  workoutsLogged: 0,
  memoriesStored: 0,
  trackersActive: 0
};

const stateMessages = {
  idle: ['Just vibing~', 'Your buddy is here!', 'Ready to help!'],
  happy: ['Yay!', 'That\'s great!', 'Awesome!'],
  thinking: ['Hmm...', 'Let me think...', 'Processing...'],
  excited: ['Whoa!', 'That\'s amazing!', 'No way!!'],
  celebrating: ['Wooohooo!', 'Party time!', 'You did it!'],
  tired: ['So tired...', 'Need a nap...', 'Phew!'],
  working: ['On it!', 'Let me help!', 'Working hard!'],
  workout: ['Workout time!', 'Let\'s go!', 'Strong!'],
  sleeping: ['Zzz...', 'Dreaming...', 'Shhh...']
};

export function getCompanion(name = 'cat') {
  return COMPANIONS[name] || COMPANIONS['cat'];
}

export function setCompanion(name) {
  if (COMPANIONS[name]) {
    currentCompanion = name;
    return true;
  }
  return false;
}

export function getAvailableCompanions() {
  return Object.entries(COMPANIONS).map(([key, c]) => ({
    id: key,
    name: c.name,
    emoji: c.emoji
  }));
}

export function setStats(newStats) {
  stats = { ...stats, ...newStats };
}

export function toggleStats(show) {
  showStats = show !== undefined ? show : !showStats;
}

// Clear line and return cursor to start
function clearLine() {
  readline.clearLine(process.stdout, 0);
  readline.cursorTo(process.stdout, 0);
}

// Move cursor up n lines
function cursorUp(n = 1) {
  readline.moveCursor(process.stdout, 0, -n);
}

export function showCompanion(state = 'idle', message = null) {
  if (!isVisible) return;

  const companion = getCompanion(currentCompanion);
  const frames = companion.frames[state] || companion.frames.idle;
  const frame = frames[animationFrame % frames.length];
  const color = companion.color;
  const reset = '\x1b[0m';

  // Save cursor position
  cursorUp(10);

  // Draw companion
  console.log(`${color}${companion.emoji} ${companion.name}${reset}`);
  console.log(`${color}${frame}${reset}`);

  // Show message or state
  const msg = message || stateMessages[state]?.[Math.floor(Math.random() * stateMessages[state].length)] || '';
  console.log(`  ${color}➜ ${msg}${reset}`);

  // Show stats if enabled
  if (showStats) {
    const statsColor = '\x1b[90m';
    console.log(`${statsColor}  [Workouts: ${stats.workoutsLogged} | Memories: ${stats.memoriesStored} | Trackers: ${stats.trackersActive}]${reset}`);
  }

  console.log(); // Extra line for spacing
}

export function clearCompanion(lines = 5) {
  for (let i = 0; i < lines; i++) {
    clearLine();
    readline.moveCursor(process.stdout, 0, -1);
  }
  clearLine();
  readline.cursorTo(process.stdout, 0);
}

export function setState(state) {
  currentState = state;
  showCompanion();
}

export function reactToEvent(eventType, data = {}) {
  switch (eventType) {
    case 'workout_logged':
      currentState = 'workout';
      showCompanion('workout', `Nice workout! 💪`);
      setTimeout(() => { currentState = 'idle'; }, 2000);
      break;
    case 'memory_stored':
      currentState = 'happy';
      showCompanion('happy', 'Got it! I\'ll remember that~');
      setTimeout(() => { currentState = 'idle'; }, 2000);
      break;
    case 'tracker_query':
      currentState = 'thinking';
      showCompanion('thinking', 'Let me check that for you...');
      break;
    case 'tracker_found':
      currentState = 'happy';
      showCompanion('happy', `Found ${data.count || 0} entries!`);
      setTimeout(() => { currentState = 'idle'; }, 2000);
      break;
    case 'search':
      currentState = 'working';
      showCompanion('working', 'Searching the web...');
      break;
    case 'search_complete':
      currentState = 'excited';
      showCompanion('excited', `Found ${data.count || 0} results!`);
      setTimeout(() => { currentState = 'idle'; }, 3000);
      break;
    case 'error':
      currentState = 'tired';
      showCompanion('tired', 'Oops! Something went wrong...');
      setTimeout(() => { currentState = 'idle'; }, 2000);
      break;
    case 'greeting':
      currentState = 'excited';
      showCompanion('excited', 'Hi there! I\'m ' + getCompanion(currentCompanion).name + '!');
      setTimeout(() => { currentState = 'idle'; }, 2000);
      break;
    default:
      showCompanion();
  }
}

export function startAnimation() {
  if (animationInterval) return;

  animationInterval = setInterval(() => {
    if (currentState === 'idle') {
      animationFrame = (animationFrame + 1) % 4;
      showCompanion('idle');
    }
  }, 2000);
}

export function stopAnimation() {
  if (animationInterval) {
    clearInterval(animationInterval);
    animationInterval = null;
  }
}

export function hideCompanion() {
  isVisible = false;
  stopAnimation();
}

export function showCompanionUI(state = 'idle') {
  // Full UI render with border
  const companion = getCompanion(currentCompanion);
  const frames = companion.frames[state] || companion.frames.idle;
  const color = companion.color;
  const reset = '\x1b[0m';

  const border = '═'.repeat(30);
  const side = '║';

  console.log(`\n${color}╔${border}╗${reset}`);
  console.log(`${side} ${companion.emoji} ${companion.name}'s Corner ${companion.emoji} ${side}`);
  console.log(`${color}╠${border}╣${reset}`);
  console.log(`${side}${color}${' '.repeat(28)}${reset}${side}`);

  frames.forEach(line => {
    const padded = line.padEnd(28, ' ');
    console.log(`${side}${color} ${padded} ${reset}${side}`);
  });

  console.log(`${side}${color}${' '.repeat(28)}${reset}${side}`);

  const msg = stateMessages[state]?.[0] || 'Your buddy is here!';
  console.log(`${side} ➜ ${msg}${' '.repeat(20 - msg.length)}${side}`);
  console.log(`${side}${color}${' '.repeat(28)}${reset}${side}`);

  if (showStats) {
    const statsLine = `[🏋️ ${stats.workoutsLogged} | 🧠 ${stats.memoriesStored} | 📊 ${stats.trackersActive}]`;
    console.log(`${side} ${statsLine}${' '.repeat(28 - statsLine.length)}${side}`);
  }

  console.log(`${color}╚${border}╝${reset}\n`);
}

export function toggleVisibility(visible) {
  isVisible = visible !== undefined ? visible : !isVisible;
}

export default {
  getCompanion,
  setCompanion,
  getAvailableCompanions,
  setStats,
  toggleStats,
  showCompanion,
  clearCompanion,
  setState,
  reactToEvent,
  startAnimation,
  stopAnimation,
  hideCompanion,
  showCompanionUI,
  toggleVisibility
};
