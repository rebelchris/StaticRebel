/**
 * Tests for Follow-Up Question Manager
 *
 * Run with: node --test tests/lib/followUpManager.test.js
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';

// Import the module
import {
  FollowUpState,
  QuestionType,
  formatQuestion,
  formatOptions,
  createYesNoQuestion,
  createSelectQuestion,
  createTextQuestion,
  createConfirmQuestion,
  executeAnswer,
  wrapText,
} from '../../lib/followUpManager.js';

describe('FollowUpState', () => {
  let state;

  beforeEach(() => {
    state = new FollowUpState();
  });

  it('should start with no active question', () => {
    assert.strictEqual(state.hasActiveQuestion(), false);
    assert.strictEqual(state.getActiveQuestion(), null);
  });

  it('should start a question and track it', () => {
    const question = {
      type: QuestionType.YES_NO,
      question: 'Is this a test?',
      onAnswer: (answer) => answer,
    };

    const started = state.startQuestion(question, { test: true });

    assert.strictEqual(state.hasActiveQuestion(), true);
    assert.ok(started.id);
    assert.strictEqual(started.type, QuestionType.YES_NO);
    assert.deepStrictEqual(state.getContext(), { test: true });
  });

  it('should record answers and clear active question', () => {
    const question = {
      type: QuestionType.YES_NO,
      question: 'Is this a test?',
      onAnswer: (answer) => answer,
    };

    state.startQuestion(question);
    assert.strictEqual(state.hasActiveQuestion(), true);

    const recorded = state.recordAnswer(true);
    assert.strictEqual(state.hasActiveQuestion(), false);
    assert.strictEqual(recorded.type, QuestionType.YES_NO);
    assert.strictEqual(state.questionHistory.length, 1);
    assert.strictEqual(state.questionHistory[0].answer, true);
  });

  it('should update context', () => {
    state.startQuestion(
      { type: QuestionType.TEXT, question: 'Test?' },
      { initial: 'value' },
    );
    state.updateContext({ additional: 'data' });

    assert.deepStrictEqual(state.getContext(), {
      initial: 'value',
      additional: 'data',
    });
  });

  it('should clear all state', () => {
    state.startQuestion(
      { type: QuestionType.TEXT, question: 'Test?' },
      { test: true },
    );
    state.recordAnswer('answer');

    state.clear();

    assert.strictEqual(state.hasActiveQuestion(), false);
    assert.deepStrictEqual(state.getContext(), {});
    assert.strictEqual(state.questionHistory.length, 0);
  });
});

describe('formatQuestion', () => {
  it('should format a basic question', () => {
    const formatted = formatQuestion('Is this a test?', QuestionType.YES_NO);

    assert.ok(formatted.includes('FOLLOW-UP QUESTION'));
    assert.ok(formatted.includes('Is this a test?'));
    assert.ok(formatted.includes('🤔'));
  });

  it('should include context when provided', () => {
    const formatted = formatQuestion('Is this a test?', QuestionType.YES_NO, {
      context: 'Testing the system',
    });

    assert.ok(formatted.includes('Context: Testing the system'));
  });

  it('should include default value when provided', () => {
    const formatted = formatQuestion('Is this a test?', QuestionType.YES_NO, {
      defaultValue: 'Yes',
    });

    assert.ok(formatted.includes('Default: Yes'));
  });

  it('should include hint when provided', () => {
    const formatted = formatQuestion('Is this a test?', QuestionType.YES_NO, {
      hint: 'Say yes or no',
    });

    assert.ok(formatted.includes('💡'));
    assert.ok(formatted.includes('Say yes or no'));
  });

  it('should wrap long text', () => {
    const longQuestion =
      'This is a very long question that should be wrapped to multiple lines because it exceeds the maximum width of the box format';
    const formatted = formatQuestion(longQuestion, QuestionType.TEXT);

    // Should have multiple lines for the question (wrapped text creates multiple lines in the box)
    const lines = formatted.split('\n');
    // The question text should appear in the formatted output
    assert.ok(formatted.includes('This is a very long question'));
    // The formatted output should have multiple lines (the box structure)
    assert.ok(lines.length > 5);
  });
});

describe('formatOptions', () => {
  it('should format options with labels', () => {
    const options = [
      { value: 'a', label: 'Option A' },
      { value: 'b', label: 'Option B' },
    ];

    const formatted = formatOptions(options);

    assert.ok(formatted.includes('1. Option A'));
    assert.ok(formatted.includes('2. Option B'));
  });

  it('should include descriptions when provided', () => {
    const options = [
      { value: 'a', label: 'Option A', description: 'First option' },
    ];

    const formatted = formatOptions(options);

    assert.ok(formatted.includes('Option A'));
    assert.ok(formatted.includes('First option'));
  });
});

describe('createYesNoQuestion', () => {
  it('should create a yes/no question with defaults', () => {
    const question = createYesNoQuestion('Continue?');

    assert.strictEqual(question.type, QuestionType.YES_NO);
    assert.strictEqual(question.question, 'Continue?');
    assert.strictEqual(question.defaultValue, 'Yes');
  });

  it('should respect defaultYes option', () => {
    const question = createYesNoQuestion('Continue?', { defaultYes: false });

    assert.strictEqual(question.defaultValue, 'No');
  });

  it('should include context when provided', () => {
    const question = createYesNoQuestion('Continue?', {
      context: 'File deletion',
    });

    assert.strictEqual(question.context, 'File deletion');
  });

  it('should call onYes when answered yes', async () => {
    let called = false;
    const onYes = () => {
      called = true;
      return 'confirmed';
    };
    const question = createYesNoQuestion('Continue?', { onYes });

    const result = await question.onAnswer(true, {});

    assert.strictEqual(called, true);
    assert.strictEqual(result, 'confirmed');
  });

  it('should call onNo when answered no', async () => {
    let called = false;
    const onNo = () => {
      called = true;
      return 'cancelled';
    };
    const question = createYesNoQuestion('Continue?', { onNo });

    const result = await question.onAnswer(false, {});

    assert.strictEqual(called, true);
    assert.strictEqual(result, 'cancelled');
  });
});

describe('createSelectQuestion', () => {
  it('should create a select question', () => {
    const options = [
      { value: 'a', label: 'Option A' },
      { value: 'b', label: 'Option B' },
    ];

    const question = createSelectQuestion('Choose one:', options);

    assert.strictEqual(question.type, QuestionType.SELECT);
    assert.deepStrictEqual(question.options, options);
    assert.strictEqual(question.defaultValue, 'Option A');
  });

  it('should use defaultIndex for default value', () => {
    const options = [
      { value: 'a', label: 'Option A' },
      { value: 'b', label: 'Option B' },
    ];

    const question = createSelectQuestion('Choose one:', options, {
      defaultIndex: 1,
    });

    assert.strictEqual(question.defaultValue, 'Option B');
  });

  it('should call onSelect with selected option', async () => {
    const options = [
      { value: 'a', label: 'Option A' },
      { value: 'b', label: 'Option B' },
    ];
    let selectedOption = null;
    let selectedIndex = null;
    const onSelect = (opt, idx) => {
      selectedOption = opt;
      selectedIndex = idx;
      return 'selected';
    };

    const question = createSelectQuestion('Choose one:', options, { onSelect });
    const result = await question.onAnswer(1, {});

    assert.deepStrictEqual(selectedOption, options[1]);
    assert.strictEqual(selectedIndex, 1);
    assert.strictEqual(result, 'selected');
  });
});

describe('createTextQuestion', () => {
  it('should create a text question', () => {
    const question = createTextQuestion('Enter your name:');

    assert.strictEqual(question.type, QuestionType.TEXT);
    assert.strictEqual(question.question, 'Enter your name:');
  });

  it('should include default value', () => {
    const question = createTextQuestion('Enter your name:', {
      defaultValue: 'Anonymous',
    });

    assert.strictEqual(question.defaultValue, 'Anonymous');
  });

  it('should include hint', () => {
    const question = createTextQuestion('Enter your name:', {
      hint: 'Use your real name',
    });

    assert.strictEqual(question.hint, 'Use your real name');
  });

  it('should call onAnswer with text', async () => {
    let receivedAnswer = null;
    let receivedContext = null;
    const onAnswer = (answer, ctx) => {
      receivedAnswer = answer;
      receivedContext = ctx;
      return 'processed';
    };
    const question = createTextQuestion('Enter name:', { onAnswer });

    const result = await question.onAnswer('John', { test: true });

    assert.strictEqual(receivedAnswer, 'John');
    assert.deepStrictEqual(receivedContext, { test: true });
    assert.strictEqual(result, 'processed');
  });
});

describe('createConfirmQuestion', () => {
  it('should create a confirmation question', () => {
    const question = createConfirmQuestion('delete the file');

    assert.strictEqual(question.type, QuestionType.CONFIRM);
    assert.ok(question.question.includes('delete the file'));
  });

  it('should include action details', () => {
    const question = createConfirmQuestion('delete the file', {
      message: 'This cannot be undone',
      risk: 'high',
    });

    assert.deepStrictEqual(question.details, {
      message: 'This cannot be undone',
      risk: 'high',
    });
  });

  it('should call onConfirm when confirmed', async () => {
    let called = false;
    const onConfirm = () => {
      called = true;
      return 'confirmed';
    };
    const question = createConfirmQuestion('run command', {}, { onConfirm });

    const result = await question.onAnswer(true, {});

    assert.strictEqual(called, true);
    assert.strictEqual(result, 'confirmed');
  });

  it('should call onCancel when cancelled', async () => {
    let called = false;
    const onCancel = () => {
      called = true;
      return 'cancelled';
    };
    const question = createConfirmQuestion('run command', {}, { onCancel });

    const result = await question.onAnswer(false, {});

    assert.strictEqual(called, true);
    assert.strictEqual(result, 'cancelled');
  });
});

describe('executeAnswer', () => {
  it('should execute onAnswer and return success', async () => {
    const question = {
      question: 'Test?',
      onAnswer: async (answer, ctx) => 'result',
    };

    const result = await executeAnswer(question, 'answer', {});

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.result, 'result');
  });

  it('should handle errors gracefully', async () => {
    const question = {
      question: 'Test?',
      onAnswer: async () => {
        throw new Error('Failed');
      },
    };

    const result = await executeAnswer(question, 'answer', {});

    assert.strictEqual(result.success, false);
    assert.strictEqual(result.error, 'Failed');
  });

  it('should return answer directly when no onAnswer', async () => {
    const question = {
      question: 'Test?',
    };

    const result = await executeAnswer(question, 'answer', {});

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.result, 'answer');
  });
});

describe('wrapText', () => {
  it('should not wrap short text', () => {
    const lines = wrapText('Short text', 50);
    assert.strictEqual(lines.length, 1);
    assert.strictEqual(lines[0], 'Short text');
  });

  it('should wrap long text', () => {
    const longText =
      'This is a very long text that needs to be wrapped because it exceeds fifty characters';
    const lines = wrapText(longText, 30);

    assert.ok(lines.length > 1);
    lines.forEach((line) => {
      assert.ok(line.length <= 30);
    });
  });

  it('should handle empty string', () => {
    const lines = wrapText('', 50);
    assert.strictEqual(lines.length, 1);
    assert.strictEqual(lines[0], '');
  });
});
