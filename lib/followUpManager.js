// Follow-Up Question Manager - Context-aware question handling with state
// ============================================================================
// This module provides a structured way to handle follow-up questions with:
// - Context preservation across question flows
// - State management for multi-step interactions
// - Clear visual indicators that a question is being asked
// - Automatic execution after receiving answers
// ============================================================================

/**
 * Follow-up question types
 */
export const QuestionType = {
  YES_NO: 'yes_no', // Simple yes/no confirmation
  TEXT: 'text', // Free text input
  SELECT: 'select', // Single selection from options
  MULTI_SELECT: 'multi_select', // Multiple selections
  NUMBER: 'number', // Numeric input
  FILE: 'file', // File path input
  CONFIRM: 'confirm', // Action confirmation with details
};

/**
 * Follow-up state manager
 * Maintains context across question flows
 */
class FollowUpState {
  constructor() {
    this.activeQuestion = null;
    this.questionHistory = [];
    this.context = {};
    this.sessionId = `session-${Date.now()}`;
  }

  /**
   * Start a new question flow
   * @param {Object} question - Question configuration
   * @param {Object} context - Context to preserve
   */
  startQuestion(question, context = {}) {
    this.activeQuestion = {
      id: `q-${Date.now()}`,
      type: question.type,
      question: question.question,
      options: question.options || null,
      defaultValue: question.defaultValue,
      validator: question.validator,
      onAnswer: question.onAnswer,
      onCancel: question.onCancel,
      metadata: question.metadata || {},
      timestamp: Date.now(),
    };
    this.context = { ...this.context, ...context };
    return this.activeQuestion;
  }

  /**
   * Record an answer and clear active question
   * @param {*} answer - The user's answer
   */
  recordAnswer(answer) {
    if (this.activeQuestion) {
      this.questionHistory.push({
        ...this.activeQuestion,
        answer,
        answeredAt: Date.now(),
      });
      const question = this.activeQuestion;
      this.activeQuestion = null;
      return question;
    }
    return null;
  }

  /**
   * Cancel current question
   */
  cancel() {
    if (this.activeQuestion?.onCancel) {
      this.activeQuestion.onCancel(this.context);
    }
    this.activeQuestion = null;
  }

  /**
   * Check if there's an active question
   */
  hasActiveQuestion() {
    return this.activeQuestion !== null;
  }

  /**
   * Get current active question
   */
  getActiveQuestion() {
    return this.activeQuestion;
  }

  /**
   * Get context
   */
  getContext() {
    return this.context;
  }

  /**
   * Update context
   */
  updateContext(updates) {
    this.context = { ...this.context, ...updates };
  }

  /**
   * Clear all state
   */
  clear() {
    this.activeQuestion = null;
    this.questionHistory = [];
    this.context = {};
  }
}

// Global state instance
const globalState = new FollowUpState();

/**
 * Format a follow-up question with clear visual indicators
 * @param {string} question - The question text
 * @param {string} type - Question type
 * @param {Object} options - Additional formatting options
 */
export function formatQuestion(
  question,
  type = QuestionType.TEXT,
  options = {},
) {
  const { context = '', defaultValue = null, hint = '' } = options;

  let formatted = '\n';
  formatted +=
    '┌─────────────────────────────────────────────────────────────┐\n';
  formatted +=
    '│  🤔 FOLLOW-UP QUESTION                                      │\n';
  formatted +=
    '├─────────────────────────────────────────────────────────────┤\n';

  if (context) {
    formatted += `│  Context: ${context.padEnd(50)}│\n`;
    formatted +=
      '├─────────────────────────────────────────────────────────────┤\n';
  }

  // Wrap question text to fit in box
  const wrappedQuestion = wrapText(question, 55);
  wrappedQuestion.forEach((line) => {
    formatted += `│  ${line.padEnd(57)}│\n`;
  });

  if (defaultValue) {
    formatted +=
      '├─────────────────────────────────────────────────────────────┤\n';
    formatted += `│  Default: ${defaultValue.padEnd(49)}│\n`;
  }

  if (hint) {
    formatted +=
      '├─────────────────────────────────────────────────────────────┤\n';
    formatted += `│  💡 ${hint.padEnd(53)}│\n`;
  }

  formatted +=
    '└─────────────────────────────────────────────────────────────┘\n';

  return formatted;
}

/**
 * Wrap text to specified width
 * @param {string} text - Text to wrap
 * @param {number} width - Maximum line width
 * @returns {string[]} - Array of wrapped lines
 */
export function wrapText(text, width) {
  const words = text.split(' ');
  const lines = [];
  let currentLine = '';

  for (const word of words) {
    if ((currentLine + word).length > width) {
      lines.push(currentLine.trim());
      currentLine = word + ' ';
    } else {
      currentLine += word + ' ';
    }
  }
  if (currentLine.trim()) {
    lines.push(currentLine.trim());
  }

  return lines.length ? lines : [text];
}

/**
 * Format options for display
 * @param {Array<{value: string, label: string, description?: string}>} options
 */
export function formatOptions(options) {
  let formatted = '\n';
  options.forEach((opt, i) => {
    const marker = `  ${i + 1}.`;
    const label = opt.label || opt.value;
    const desc = opt.description ? ` \x1b[90m- ${opt.description}\x1b[0m` : '';
    formatted += `${marker} ${label}${desc}\n`;
  });
  return formatted;
}

/**
 * Create a yes/no question configuration
 * @param {string} question - The question to ask
 * @param {Object} options - Configuration options
 */
export function createYesNoQuestion(question, options = {}) {
  const {
    defaultYes = true,
    context = '',
    onYes = null,
    onNo = null,
    metadata = {},
  } = options;

  return {
    type: QuestionType.YES_NO,
    question,
    context,
    defaultValue: defaultYes ? 'Yes' : 'No',
    metadata,
    onAnswer: (answer, ctx) => {
      if (answer && onYes) {
        return onYes(ctx);
      } else if (!answer && onNo) {
        return onNo(ctx);
      }
      return answer;
    },
  };
}

/**
 * Create a selection question configuration
 * @param {string} question - The question to ask
 * @param {Array} options - Selection options
 * @param {Object} config - Configuration options
 */
export function createSelectQuestion(question, options, config = {}) {
  const {
    context = '',
    defaultIndex = 0,
    onSelect = null,
    metadata = {},
  } = config;

  return {
    type: QuestionType.SELECT,
    question,
    context,
    options,
    defaultValue: options[defaultIndex]?.label || options[defaultIndex],
    metadata: { ...metadata, defaultIndex },
    onAnswer: (answer, ctx) => {
      const selected = options[answer];
      if (onSelect) {
        return onSelect(selected, answer, ctx);
      }
      return selected;
    },
  };
}

/**
 * Create a text input question configuration
 * @param {string} question - The question to ask
 * @param {Object} options - Configuration options
 */
export function createTextQuestion(question, options = {}) {
  const {
    context = '',
    defaultValue = '',
    validator = null,
    onAnswer = null,
    hint = '',
    metadata = {},
  } = options;

  return {
    type: QuestionType.TEXT,
    question,
    context,
    defaultValue,
    validator,
    hint,
    metadata,
    onAnswer: (answer, ctx) => {
      if (onAnswer) {
        return onAnswer(answer, ctx);
      }
      return answer;
    },
  };
}

/**
 * Create a confirmation question with action details
 * @param {string} action - Description of the action
 * @param {Object} details - Action details to display
 * @param {Object} options - Configuration options
 */
export function createConfirmQuestion(action, details = {}, options = {}) {
  const {
    context = '',
    onConfirm = null,
    onCancel = null,
    metadata = {},
  } = options;

  let question = `Are you sure you want to ${action}?`;

  return {
    type: QuestionType.CONFIRM,
    question,
    context,
    details,
    metadata,
    onAnswer: (answer, ctx) => {
      if (answer && onConfirm) {
        return onConfirm(ctx);
      } else if (!answer && onCancel) {
        return onCancel(ctx);
      }
      return answer;
    },
  };
}

/**
 * Execute the answer handler and provide feedback
 * @param {Object} question - The question that was answered
 * @param {*} answer - The user's answer
 * @param {Object} context - Current context
 */
export async function executeAnswer(question, answer, context) {
  console.log('\n  \x1b[90mProcessing...\x1b[0m\n');

  try {
    let result;
    if (question.onAnswer) {
      result = await question.onAnswer(answer, context);
    } else {
      result = answer;
    }

    // Provide success feedback
    console.log('\n  \x1b[32m✓ Done\x1b[0m\n');

    return {
      success: true,
      result,
      question: question.question,
      answer,
    };
  } catch (error) {
    console.log(`\n  \x1b[31m✗ Error: ${error.message}\x1b[0m\n`);
    return {
      success: false,
      error: error.message,
      question: question.question,
      answer,
    };
  }
}

/**
 * Check if input is an answer to an active question
 * @param {string} input - User input
 */
export function isQuestionAnswer(input) {
  return globalState.hasActiveQuestion();
}

/**
 * Process a potential answer to an active question
 * @param {string} input - User input
 */
export async function processAnswer(input) {
  const question = globalState.getActiveQuestion();
  if (!question) {
    return null;
  }

  let answer;

  // Parse answer based on question type
  switch (question.type) {
    case QuestionType.YES_NO:
    case QuestionType.CONFIRM:
      answer = input.toLowerCase().match(/^(y|yes|true|1)$/i) !== null;
      break;

    case QuestionType.SELECT:
      const num = parseInt(input, 10);
      if (isNaN(num) || num < 1 || num > question.options.length) {
        console.log(
          `  \x1b[31mPlease enter a number between 1 and ${question.options.length}\x1b[0m`,
        );
        return { handled: true, valid: false };
      }
      answer = num - 1;
      break;

    case QuestionType.NUMBER:
      answer = parseFloat(input);
      if (isNaN(answer)) {
        console.log('  \x1b[31mPlease enter a valid number\x1b[0m');
        return { handled: true, valid: false };
      }
      break;

    case QuestionType.TEXT:
    default:
      answer = input.trim();
      // Apply validator if provided
      if (question.validator) {
        const error = question.validator(answer);
        if (error) {
          console.log(`  \x1b[31m${error}\x1b[0m`);
          return { handled: true, valid: false };
        }
      }
      break;
  }

  // Record the answer
  globalState.recordAnswer(answer);

  // Execute the handler
  const result = await executeAnswer(
    question,
    answer,
    globalState.getContext(),
  );

  return {
    handled: true,
    valid: true,
    result,
  };
}

/**
 * Start a new question flow
 * @param {Object} questionConfig - Question configuration
 * @param {Object} context - Initial context
 */
export function startQuestionFlow(questionConfig, context = {}) {
  const question = globalState.startQuestion(questionConfig, context);

  // Display the question
  const formatted = formatQuestion(question.question, question.type, {
    context: question.context,
    defaultValue: question.defaultValue,
    hint: question.hint,
  });

  console.log(formatted);

  // Display options if applicable
  if (question.options) {
    console.log(formatOptions(question.options));
  }

  return question;
}

/**
 * Get current state
 */
export function getState() {
  return {
    hasActiveQuestion: globalState.hasActiveQuestion(),
    activeQuestion: globalState.getActiveQuestion(),
    context: globalState.getContext(),
    history: globalState.questionHistory,
  };
}

/**
 * Clear all state
 */
export function clearState() {
  globalState.clear();
}

/**
 * Cancel current question
 */
export function cancelQuestion() {
  globalState.cancel();
}

// Export the state class for testing
export { FollowUpState };

// Default export
export default {
  QuestionType,
  FollowUpState,
  formatQuestion,
  formatOptions,
  createYesNoQuestion,
  createSelectQuestion,
  createTextQuestion,
  createConfirmQuestion,
  executeAnswer,
  isQuestionAnswer,
  processAnswer,
  startQuestionFlow,
  getState,
  clearState,
  cancelQuestion,
};
