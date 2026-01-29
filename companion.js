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
      idle: ['    .', '   /|\\', '  ( . )', '   /|\\'],
      happy: ['    ⭐', '   /|\\', '  ( ◠ ◠ )', '   /|\\'],
      thinking: ['    ...', '   /|\\', '  ( -_- )', '   /|\\'],
      excited: ['    ✨', '   /|\\', '  ( ◉ ◉ )', '   /|\\'],
      celebrating: ['  🎉 ⭐ 🎉', '   /|\\', '  ( ★ ★ )', '   /|\\'],
      tired: ['    zZ', '   /|\\', '  ( -_- )', '   /|\\'],
    },
  },
  robot: {
    name: 'Byte',
    emoji: '🤖',
    color: '\x1b[36m', // Cyan
    height: 4,
    frames: {
      idle: ['  ┌───┐', '  │◠ ◠│', '  │ □ │', '  └───┘'],
      happy: ['  ┌───┐', '  │◠ ◠│', '  │ □ │', '  └───┘'],
      thinking: ['  ┌───┐', '  │- -│', '  │ □ │', '  └───┘'],
      excited: ['  ┌───┐', '  │◉ ◉│', '  │ □ │', '  └───┘'],
      celebrating: ['  ┌───┐', '  │★ ★│', '  │ □ │', '  └───┘'],
      tired: ['  ┌───┐', '  │- -│', '  │ □ │', '  └───┘'],
    },
  },
};

// ============================================================================
// Companion Display
// ============================================================================

class Companion {
  constructor(type = 'pixie') {
    this.type = type;
    this.companion = COMPANIONS[type];
    this.currentMood = 'idle';
    this.animationFrame = 0;
  }

  setMood(mood) {
    if (this.companion.frames[mood]) {
      this.currentMood = mood;
    }
  }

  render() {
    const frame = this.companion.frames[this.currentMood];
    const color = this.companion.color;
    const reset = '\x1b[0m';

    console.clear();
    console.log('\n');
    console.log(
      `${color}    ${this.companion.emoji} ${this.companion.name}${reset}`,
    );
    console.log('');

    for (const line of frame) {
      console.log(`${color}${line}${reset}`);
    }

    console.log('');
  }

  say(message) {
    this.render();
    console.log(`  "${message}"\n`);
  }

  async animate(mood, duration = 2000) {
    this.setMood(mood);
    this.render();
    await new Promise((resolve) => setTimeout(resolve, duration));
    this.setMood('idle');
    this.render();
  }
}

// ============================================================================
// Interactive Mode
// ============================================================================

async function interactiveMode() {
  const companion = new Companion('pixie');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  companion.say("Hi there! I'm here to keep you company while you work!");

  const moods = ['happy', 'thinking', 'excited', 'tired'];
  let moodIndex = 0;

  console.log('Commands: mood, animate, bye');
  console.log('');

  const ask = () => {
    rl.question('> ', async (input) => {
      const cmd = input.trim().toLowerCase();

      if (cmd === 'bye' || cmd === 'exit' || cmd === 'quit') {
        companion.say('Bye bye! Have a great day! 👋');
        rl.close();
        return;
      }

      if (cmd === 'mood') {
        companion.setMood(moods[moodIndex]);
        companion.say(`I'm feeling ${moods[moodIndex]}!`);
        moodIndex = (moodIndex + 1) % moods.length;
      } else if (cmd === 'animate') {
        await companion.animate('excited', 1500);
        companion.say('That was fun!');
      } else if (cmd) {
        companion.setMood('thinking');
        companion.render();
        await new Promise((r) => setTimeout(r, 500));
        companion.setMood('happy');
        companion.say("I'm just a companion, but I'm here for you!");
      } else {
        companion.render();
      }

      ask();
    });
  };

  ask();
}

// ============================================================================
// CLI
// ============================================================================

const args = process.argv.slice(2);
const command = args[0];

if (command === 'interactive' || command === 'i') {
  interactiveMode();
} else if (command === 'say') {
  const companion = new Companion(args[1] || 'pixie');
  companion.say(args.slice(2).join(' ') || 'Hello!');
} else {
  const companion = new Companion('pixie');
  companion.render();
  console.log('Usage: node companion.js [interactive|say <type> <message>]');
}
