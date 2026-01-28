import readline from 'readline';

// ============================================================================
// CLI Interaction Protocols
// ============================================================================

/**
 * Yes/No question protocol
 * @param {string} question - The question to ask
 * @param {boolean} defaultYes - Is the default yes?
 * @returns {Promise<boolean>}
 */
async function askYesNo(question, defaultYes = true) {
  const defaultStr = defaultYes ? 'Y/n' : 'y/N';
  return new Promise((resolve) => {
    rl.question(`\x1b[36m${question}\x1b[0m [${defaultStr}] `, (answer) => {
      const normalized = answer.trim().toLowerCase();
      if (!normalized) {
        resolve(defaultYes);
      }
      resolve(normalized === 'y' || normalized === 'yes');
    });
  });
}

/**
 * Numbered selection protocol
 * @param {string} prompt - Prompt message
 * @param {Array<{label: string, description?: string}>} options - Options with labels
 * @param {number} defaultIndex - Default selection (optional)
 * @returns {Promise<number>} - Index of selected option
 */
async function numberedSelect(prompt, options, defaultIndex = 0) {
  return new Promise((resolve) => {
    console.log(`\x1b[36m${prompt}\x1b[0m\n`);

    options.forEach((opt, i) => {
      const marker = i === defaultIndex ? '→' : ' ';
      const label = opt.description ? `${opt.label} - ${opt.description}` : opt.label;
      console.log(`  ${marker} \x1b[33m${i + 1}.\x1b[0m ${label}`);
    });

    console.log(`\n  \x1b[90m(Type a number or use ↑/↓ arrows)\x1b[0m`);

    // Setup arrow key navigation
    let selected = defaultIndex;
    const keyHandler = (key) => {
      if (key === '\u001b[A') { // Up arrow
        selected = Math.max(0, selected - 1);
        displaySelection();
      } else if (key === '\u001b[B') { // Down arrow
        selected = Math.min(options.length - 1, selected + 1);
        displaySelection();
      } else if (key === '\r' || key === '\n') { // Enter
        readline.emitKeypressEvents(process.stdin);
        process.stdin.removeListener('keypress', keyHandler);
        process.stdin.setRawMode(false);
        console.log();
        resolve(selected);
      } else if (key >= '1' && key <= String(options.length)) {
        readline.emitKeypressEvents(process.stdin);
        process.stdin.removeListener('keypress', keyHandler);
        process.stdin.setRawMode(false);
        console.log();
        resolve(parseInt(key) - 1);
      }
    };

    function displaySelection() {
      // Clear and redraw
      readline.cursorTo(process.stdout, 0);
      readline.moveCursor(process.stdout, 0, -options.length - 2);

      options.forEach((opt, i) => {
        const marker = i === selected ? '→' : ' ';
        const label = opt.description ? `${opt.label} - ${opt.description}` : opt.label;
        const color = i === selected ? '\x1b[32m' : '';
        const reset = i === selected ? '\x1b[0m' : '';
        console.log(`  ${marker} ${color}${i + 1}.${reset} ${label}`);
      });

      readline.cursorTo(process.stdout, 0);
      readline.moveCursor(process.stdout, 0, options.length + 1);
    }

    // Enable raw mode for arrow keys
    process.stdin.setRawMode(true);
    process.stdin.resume();
    readline.emitKeypressEvents(process.stdin);
    process.stdin.on('keypress', keyHandler);
  });
}

/**
 * Multi-select protocol (select multiple items)
 * @param {string} prompt - Prompt message
 * @param {Array<{label: string, description?: string}>} options - Options
 * @param {Array<number>} defaults - Default selected indices
 * @returns {Promise<Array<number>>} - Selected indices
 */
async function multiSelect(prompt, options, defaults = []) {
  return new Promise((resolve) => {
    console.log(`\x1b[36m${prompt}\x1b[0m\n`);
    console.log(`  \x1b[90m[Space] Toggle selection | [Enter] Confirm\x1b[0m\n`);

    let selected = options.map((_, i) => defaults.includes(i));
    let cursor = 0;

    function displaySelection() {
      // Clear previous display (dynamic based on option count)
      readline.cursorTo(process.stdout, 0);
      readline.moveCursor(process.stdout, 0, -options.length - 3);

      options.forEach((opt, i) => {
        const marker = i === cursor ? '→' : ' ';
        const checked = selected[i] ? '[x]' : '[ ]';
        const label = opt.description ? `${opt.label} - ${opt.description}` : opt.label;
        const color = i === cursor ? '\x1b[32m' : '';
        const reset = i === cursor ? '\x1b[0m' : '';
        console.log(`  ${marker} ${color}${checked} ${i + 1}. ${label}${reset}`);
      });

      readline.cursorTo(process.stdout, 0);
      readline.moveCursor(process.stdout, 0, options.length + 2);
    }

    displaySelection();

    const keyHandler = (key) => {
      if (key === '\u001b[A') { // Up
        cursor = Math.max(0, cursor - 1);
        displaySelection();
      } else if (key === '\u001b[B') { // Down
        cursor = Math.min(options.length - 1, cursor + 1);
        displaySelection();
      } else if (key === ' ') { // Space
        selected[cursor] = !selected[cursor];
        displaySelection();
      } else if (key === '\r' || key === '\n') { // Enter
        readline.emitKeypressEvents(process.stdin);
        process.stdin.removeListener('keypress', keyHandler);
        process.stdin.setRawMode(false);
        console.log();
        const result = selected.map((s, i) => s ? i : -1).filter(i => i !== -1);
        resolve(result);
      }
    };

    process.stdin.setRawMode(true);
    process.stdin.resume();
    readline.emitKeypressEvents(process.stdin);
    process.stdin.on('keypress', keyHandler);
  });
}

/**
 * Text input with validation
 * @param {string} prompt - Prompt message
 * @param {Function} validator - Validation function, returns error message or null
 * @param {string} defaultValue - Default value if user enters nothing
 * @returns {Promise<string>}
 */
async function validatedInput(prompt, validator = () => null, defaultValue = '') {
  return new Promise((resolve) => {
    const ask = () => {
      rl.question(`\x1b[36m${prompt}\x1b[0m `, (answer) => {
        const value = answer.trim() || defaultValue;
        if (!value) {
          console.log(`  \x1b[31mPlease enter a value\x1b[0m`);
          ask();
          return;
        }
        const error = validator(value);
        if (error) {
          console.log(`  \x1b[31m${error}\x1b[0m`);
          ask();
          return;
        }
        resolve(value);
      });
    };
    ask();
  });
}

/**
 * Menu-driven selection with back option
 * @param {string} title - Menu title
 * @param {Array<{id: string, label: string, description?: string}>} items - Menu items
 * @returns {Promise<string|null>} - Selected item ID or null for back
 */
async function menuSelect(title, items) {
  return new Promise((resolve) => {
    console.log(`\n\x1b[36m${title}\x1b[0m\n`);

    items.forEach((item, i) => {
      console.log(`  \x1b[33m${i + 1}.\x1b[0m ${item.label}`);
      if (item.description) {
        console.log(`     \x1b[90m${item.description}\x1b[0m`);
      }
    });

    console.log(`  \x1b[33m0.\x1b[0m ← Back`);
    console.log(`\n  \x1b[90m(Type number or use ↑/↓ arrows)\x1b[0m`);

    let selected = 0;
    const keyHandler = (key) => {
      if (key === '\u001b[A') {
        selected = Math.max(0, selected - 1);
      } else if (key === '\u001b[B') {
        selected = Math.min(items.length, selected + 1);
      } else if (key === '\r' || key === '\n') {
        readline.emitKeypressEvents(process.stdin);
        process.stdin.removeListener('keypress', keyHandler);
        process.stdin.setRawMode(false);
        console.log();
        resolve(selected === 0 ? null : items[selected - 1].id);
      } else if (key >= '0' && key <= String(items.length)) {
        readline.emitKeypressEvents(process.stdin);
        process.stdin.removeListener('keypress', keyHandler);
        process.stdin.setRawMode(false);
        console.log();
        const idx = parseInt(key);
        resolve(idx === 0 ? null : items[idx - 1]?.id);
      }
    };

    process.stdin.setRawMode(true);
    process.stdin.resume();
    readline.emitKeypressEvents(process.stdin);
    process.stdin.on('keypress', keyHandler);
  });
}

// ============================================================================
// Risky Action Detection
// ============================================================================

const RISKY_PATTERNS = [
  { pattern: /delete|remove|rm\b/i, action: 'delete', risk: 'high', message: 'This action will permanently delete data' },
  { pattern: /force push|--force/i, action: 'force push', risk: 'high', message: 'Force push will overwrite remote history' },
  { pattern: /drop|reset --hard/i, action: 'reset', risk: 'high', message: 'This will discard local changes permanently' },
  { pattern: /write|save|create.*file/i, action: 'write file', risk: 'medium', message: 'This will modify files on disk' },
  { pattern: /commit.*-m|commit.*message/i, action: 'commit', risk: 'medium', message: 'This will create a commit with your message' },
  { pattern: /exec|run.*command|shell/i, action: 'execute', risk: 'medium', message: 'This will execute a shell command' },
  { pattern: /install|npm install|pip install/i, action: 'install', risk: 'low', message: 'This will install packages to your system' },
  { pattern: /git push|git pull/i, action: 'sync', risk: 'low', message: 'This will sync with remote repository' },
];

/**
 * Check if an action is risky and needs confirmation
 * @param {string} command - The command or action text
 * @returns {{isRisky: boolean, risk: string, message: string, action: string}|null}
 */
function checkRiskyAction(command) {
  for (const { pattern, action, risk, message } of RISKY_PATTERNS) {
    if (pattern.test(command)) {
      return { isRisky: true, risk, message, action };
    }
  }
  return null;
}

/**
 * Check if clarification is needed for a command
 * @param {string} command - Full command text
 * @param {Object} context - Additional context
 * @returns {{needsClarification: boolean, question: string}|null}
 */
function checkNeedsClarification(command, context = {}) {
  const cmd = command.toLowerCase().trim();

  // Check for ambiguous commands
  if (cmd.startsWith('/delete') && !cmd.includes(' ')) {
    return {
      needsClarification: true,
      question: 'Delete what? Please specify a file, tracker, or memory ID.'
    };
  }

  if (cmd.startsWith('/edit') && !cmd.includes(' ')) {
    return {
      needsClarification: true,
      question: 'Edit what? Please specify a file or tracker name.'
    };
  }

  if (cmd.startsWith('/git ') && (cmd === '/git push' || cmd === '/git commit')) {
    return {
      needsClarification: true,
      question: 'This command requires confirmation. Continue?'
    };
  }

  if (cmd.startsWith('/track ') && !context.trackerExists) {
    const parts = cmd.split(' ');
    if (parts.length >= 3 && parts[2] === 'add') {
      return {
        needsClarification: true,
        question: `Create a new tracker "${parts[1]}" and add this entry?`
      };
    }
  }

  return null;
}

// ============================================================================
// Export
// ============================================================================

export {
  askYesNo,
  numberedSelect,
  multiSelect,
  validatedInput,
  menuSelect,
  checkRiskyAction,
  checkNeedsClarification
};

export default {
  askYesNo,
  numberedSelect,
  multiSelect,
  validatedInput,
  menuSelect,
  checkRiskyAction,
  checkNeedsClarification
};
