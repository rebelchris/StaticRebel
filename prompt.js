import readline from 'readline';

// ============================================================================
// CLI Interaction Protocols
// ============================================================================

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

/**
 * Yes/No question protocol
 * @param {string} question - The question to ask
 * @param {boolean} defaultYes - Is the default yes?
 * @returns {Promise<boolean>}
 */
export async function askYesNo(question, defaultYes = true) {
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
export async function numberedSelect(prompt, options, defaultIndex = 0) {
  return new Promise((resolve) => {
    console.log(`\x1b[36m${prompt}\x1b[0m\n`);

    options.forEach((opt, i) => {
      const marker = i === defaultIndex ? '→' : ' ';
      const label = opt.description
        ? `${opt.label} - ${opt.description}`
        : opt.label;
      console.log(`  ${marker} \x1b[33m${i + 1}.\x1b[0m ${label}`);
    });

    console.log(`\n  \x1b[90m(Type a number 1-${options.length})\x1b[0m`);

    rl.question('\n> ', (answer) => {
      const num = parseInt(answer.trim(), 10);
      if (isNaN(num) || num < 1 || num > options.length) {
        resolve(defaultIndex);
      } else {
        resolve(num - 1);
      }
    });
  });
}

/**
 * Multi-select protocol
 * @param {string} prompt - Prompt message
 * @param {Array<{label: string, value: any}>} options - Options
 * @returns {Promise<Array<any>>} - Selected values
 */
export async function multiSelect(prompt, options) {
  return new Promise((resolve) => {
    console.log(`\x1b[36m${prompt}\x1b[0m`);
    console.log(
      '\x1b[90m(Enter comma-separated numbers, e.g., 1,3,4)\x1b[0m\n',
    );

    options.forEach((opt, i) => {
      console.log(`  \x1b[33m${i + 1}.\x1b[0m ${opt.label}`);
    });

    rl.question('\n> ', (answer) => {
      const indices = answer
        .split(',')
        .map((s) => parseInt(s.trim(), 10))
        .filter((n) => !isNaN(n) && n >= 1 && n <= options.length);

      resolve(indices.map((i) => options[i - 1].value));
    });
  });
}

/**
 * Check if an action needs user confirmation (risk assessment)
 * @param {string} action - Action description
 * @param {number} riskLevel - 0-3 risk level
 * @returns {Promise<boolean>} - Whether to proceed
 */
export async function checkRiskyAction(action, riskLevel = 1) {
  const riskLabels = [
    '',
    '\x1b[33m[CAUTION]\x1b[0m',
    '\x1b[35m[WARNING]\x1b[0m',
    '\x1b[31m[DANGER]\x1b[0m',
  ];

  if (riskLevel === 0) return true;

  console.log(`\n${riskLabels[riskLevel]} ${action}`);
  return await askYesNo('Proceed?', riskLevel < 2);
}

/**
 * Check if user input needs clarification
 * @param {string} input - User input
 * @returns {boolean}
 */
export function checkNeedsClarification(input) {
  const vaguePatterns = [
    /^(?:do|make|create|fix)\s+(?:it|this|that|something)$/i,
    /^(?:what|how)\s+(?:about|with)\s+(?:it|this|that)$/i,
    /^(?:yes|no|maybe|ok|okay)$/i,
  ];

  return vaguePatterns.some((pattern) => pattern.test(input.trim()));
}

/**
 * Close the readline interface
 */
export function closePrompt() {
  rl.close();
}
