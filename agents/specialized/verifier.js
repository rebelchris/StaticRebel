/**
 * Verifier Agent - Specialized agent for test execution and result validation
 *
 * Responsibilities:
 * - Run tests and check results
 * - Validate safety constraints
 * - Verify output correctness
 * - Check code quality
 *
 * @module agents/specialized/verifier
 */

import agentRegistry, { AGENT_TYPES, MESSAGE_TYPES } from '../../lib/agentRegistry.js';
import { runTests, parseTestResults, analyzeCoverage } from '../../lib/testGenerator.js';
import { validateCommand } from '../../lib/shellIntegration.js';
import fs from 'fs/promises';

/**
 * Create and register the verifier agent
 * @returns {Object} Agent instance
 */
export function createVerifierAgent() {
  const agent = agentRegistry.registerAgent({
    name: 'VerifierAgent',
    type: AGENT_TYPES.VERIFIER,
    capabilities: [
      'run_tests',
      'validate_safety',
      'verify_output',
      'check_quality',
      'analyze_coverage',
      'lint_code',
    ],
    handler: handleMessage,
  });

  return agent;
}

/**
 * Handle incoming messages
 * @param {Object} message - Agent message
 * @returns {Promise<Object>}
 */
async function handleMessage(message) {
  const { type, payload } = message;

  switch (type) {
    case MESSAGE_TYPES.TASK_ASSIGN:
      return handleTask(payload);

    case MESSAGE_TYPES.QUERY:
      return handleQuery(payload);

    default:
      return { status: 'ignored', reason: 'Unknown message type' };
  }
}

/**
 * Handle task assignment
 * @param {Object} payload - Task payload
 * @returns {Promise<Object>}
 */
async function handleTask(payload) {
  const { taskId, type, data } = payload;

  try {
    agentRegistry.updateTask(taskId, 'running');

    let result;

    switch (type) {
      case 'run_tests':
        result = await runTestsTask(data);
        break;

      case 'validate_safety':
        result = await validateSafetyTask(data);
        break;

      case 'verify_output':
        result = await verifyOutputTask(data);
        break;

      case 'check_quality':
        result = await checkQualityTask(data);
        break;

      case 'analyze_coverage':
        result = await analyzeCoverageTask(data);
        break;

      case 'lint_code':
        result = await lintCodeTask(data);
        break;

      default:
        throw new Error(`Unknown task type: ${type}`);
    }

    agentRegistry.completeTask(taskId, result);
    return result;

  } catch (error) {
    agentRegistry.failTask(taskId, error.message);
    throw error;
  }
}

/**
 * Handle queries
 * @param {Object} payload - Query payload
 * @returns {Promise<Object>}
 */
async function handleQuery(payload) {
  const { type, data } = payload;

  switch (type) {
    case 'check_safety':
      return checkSafety(data);

    case 'validate_syntax':
      return validateSyntax(data);

    default:
      return { error: 'Unknown query type' };
  }
}

// ============================================================================
// Task Implementations
// ============================================================================

/**
 * Run tests task
 * @param {Object} data - Task data
 * @returns {Promise<Object>}
 */
async function runTestsTask(data) {
  const { projectPath, pattern, framework } = data;

  const result = await runTests(projectPath, { pattern });

  if (!result.success) {
    return {
      success: false,
      error: 'Tests failed',
      details: result,
    };
  }

  const parsed = parseTestResults(result.stdout, result.framework);

  return {
    success: parsed.failed === 0,
    framework: result.framework,
    summary: {
      total: parsed.total,
      passed: parsed.passed,
      failed: parsed.failed,
      pending: parsed.pending,
    },
    coverage: parsed.coverage,
    output: result.stdout,
  };
}

/**
 * Validate safety task
 * @param {Object} data - Task data
 * @returns {Promise<Object>}
 */
async function validateSafetyTask(data) {
  const { command, filePath, operation } = data;

  const checks = [];
  let safe = true;

  // Command safety check
  if (command) {
    const validation = validateCommand(command);
    checks.push({
      type: 'command',
      safe: validation.valid,
      riskLevel: validation.riskLevel,
      warnings: validation.warnings,
      errors: validation.errors,
    });

    if (!validation.valid) safe = false;
  }

  // File operation safety check
  if (filePath) {
    const fileCheck = await checkFileOperation(filePath, operation);
    checks.push({
      type: 'file',
      safe: fileCheck.safe,
      reason: fileCheck.reason,
    });

    if (!fileCheck.safe) safe = false;
  }

  return {
    safe,
    checks,
    canProceed: safe,
    requiresConfirmation: checks.some(c => c.riskLevel === 'high'),
  };
}

/**
 * Verify output task
 * @param {Object} data - Task data
 * @returns {Promise<Object>}
 */
async function verifyOutputTask(data) {
  const { actual, expected, type = 'exact' } = data;

  let verified = false;
  let details = {};

  switch (type) {
    case 'exact':
      verified = actual === expected;
      details = { match: verified };
      break;

    case 'contains':
      verified = actual.includes(expected);
      details = { contains: verified };
      break;

    case 'regex':
      const regex = new RegExp(expected);
      verified = regex.test(actual);
      details = { matches: verified };
      break;

    case 'json':
      try {
        const actualObj = JSON.parse(actual);
        const expectedObj = JSON.parse(expected);
        verified = JSON.stringify(actualObj) === JSON.stringify(expectedObj);
        details = { validJson: true, match: verified };
      } catch {
        verified = false;
        details = { validJson: false };
      }
      break;

    case 'exists':
      verified = actual !== null && actual !== undefined;
      details = { exists: verified };
      break;

    default:
      return {
        verified: false,
        error: `Unknown verification type: ${type}`,
      };
  }

  return {
    verified,
    type,
    details,
  };
}

/**
 * Check quality task
 * @param {Object} data - Task data
 * @returns {Promise<Object>}
 */
async function checkQualityTask(data) {
  const { filePath, code, rules } = data;

  const content = code || await fs.readFile(filePath, 'utf-8');
  const issues = [];
  const metrics = {};

  // Basic metrics
  const lines = content.split('\n');
  metrics.totalLines = lines.length;
  metrics.codeLines = lines.filter(l => l.trim() && !l.trim().startsWith('//')).length;
  metrics.commentLines = lines.filter(l => l.trim().startsWith('//') || l.includes('/*')).length;
  metrics.blankLines = lines.filter(l => !l.trim()).length;

  // Check rules
  if (rules) {
    for (const rule of rules) {
      const result = checkRule(content, rule);
      if (!result.passed) {
        issues.push({
          rule: rule.name,
          message: result.message,
          severity: rule.severity || 'warning',
        });
      }
    }
  }

  // Default checks
  if (metrics.totalLines > 500) {
    issues.push({
      rule: 'file-length',
      message: `File is ${metrics.totalLines} lines (recommended: < 500)`,
      severity: 'warning',
    });
  }

  // Calculate quality score
  const maxScore = 100;
  const deductions = issues.filter(i => i.severity === 'error').length * 10 +
                    issues.filter(i => i.severity === 'warning').length * 5;
  const score = Math.max(0, maxScore - deductions);

  return {
    score,
    metrics,
    issues,
    passed: score >= 80,
  };
}

/**
 * Analyze coverage task
 * @param {Object} data - Task data
 * @returns {Promise<Object>}
 */
async function analyzeCoverageTask(data) {
  const { projectPath } = data;

  const result = await analyzeCoverage(projectPath);

  if (result.error) {
    return {
      success: false,
      error: result.error,
    };
  }

  return {
    success: true,
    coverage: result.coverage,
    testResults: result.testResults,
    recommendations: generateCoverageRecommendations(result.coverage),
  };
}

/**
 * Lint code task
 * @param {Object} data - Task data
 * @returns {Promise<Object>}
 */
async function lintCodeTask(data) {
  const { filePath, projectPath, linter = 'eslint' } = data;

  const { spawn } = await import('child_process');

  return new Promise((resolve) => {
    let command;
    let args;

    switch (linter) {
      case 'eslint':
        command = 'npx';
        args = ['eslint', '--format', 'json', filePath || projectPath];
        break;

      case 'prettier':
        command = 'npx';
        args = ['prettier', '--check', filePath || projectPath];
        break;

      default:
        resolve({
          success: false,
          error: `Unknown linter: ${linter}`,
        });
        return;
    }

    const child = spawn(command, args, {
      cwd: projectPath,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('close', (exitCode) => {
      let results;

      try {
        results = JSON.parse(stdout);
      } catch {
        results = stdout;
      }

      resolve({
        success: exitCode === 0,
        linter,
        results,
        errors: stderr,
      });
    });
  });
}

// ============================================================================
// Query Helpers
// ============================================================================

/**
 * Check safety of an operation
 * @param {Object} data - Check data
 * @returns {Object}
 */
function checkSafety(data) {
  const { command, filePath, operation } = data;

  const checks = [];

  if (command) {
    const validation = validateCommand(command);
    checks.push({
      type: 'command',
      safe: validation.valid,
      riskLevel: validation.riskLevel,
    });
  }

  return {
    safe: checks.every(c => c.safe),
    checks,
  };
}

/**
 * Validate syntax of code
 * @param {Object} data - Validation data
 * @returns {Object}
 */
async function validateSyntax(data) {
  const { code, language } = data;

  // Basic syntax validation
  if (language === 'javascript' || language === 'js') {
    try {
      new Function(code);
      return { valid: true, language };
    } catch (error) {
      return { valid: false, error: error.message, language };
    }
  }

  if (language === 'json') {
    try {
      JSON.parse(code);
      return { valid: true, language };
    } catch (error) {
      return { valid: false, error: error.message, language };
    }
  }

  return { valid: true, language, note: 'No syntax validator available' };
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Check if a file operation is safe
 * @param {string} filePath - File path
 * @param {string} operation - Operation type
 * @returns {Promise<Object>}
 */
async function checkFileOperation(filePath, operation) {
  try {
    const stats = await fs.stat(filePath);

    // Check for protected paths
    const protectedPaths = [
      '/etc',
      '/usr',
      '/bin',
      '/sbin',
      '/lib',
      '/sys',
      '/proc',
      '/dev',
    ];

    for (const protectedPath of protectedPaths) {
      if (filePath.startsWith(protectedPath)) {
        return {
          safe: false,
          reason: `Protected path: ${protectedPath}`,
        };
      }
    }

    // Check operation-specific safety
    if (operation === 'delete' && stats.isDirectory()) {
      // Count files in directory
      const entries = await fs.readdir(filePath);
      if (entries.length > 10) {
        return {
          safe: false,
          reason: `Directory contains ${entries.length} items`,
        };
      }
    }

    return { safe: true };

  } catch (error) {
    // File doesn't exist, which is fine for write operations
    if (error.code === 'ENOENT') {
      return { safe: true, note: 'File does not exist' };
    }

    return { safe: false, reason: error.message };
  }
}

/**
 * Check a quality rule
 * @param {string} content - Code content
 * @param {Object} rule - Rule definition
 * @returns {Object}
 */
function checkRule(content, rule) {
  switch (rule.type) {
    case 'max-lines':
      const lines = content.split('\n').length;
      return {
        passed: lines <= rule.value,
        message: `File has ${lines} lines (max: ${rule.value})`,
      };

    case 'no-console':
      const hasConsole = /console\.(log|warn|error)/.test(content);
      return {
        passed: !hasConsole,
        message: hasConsole ? 'Contains console statements' : 'No console statements',
      };

    case 'no-debugger':
      const hasDebugger = /debugger;/.test(content);
      return {
        passed: !hasDebugger,
        message: hasDebugger ? 'Contains debugger statement' : 'No debugger statements',
      };

    default:
      return { passed: true, message: 'Unknown rule type' };
  }
}

/**
 * Generate coverage recommendations
 * @param {Object} coverage - Coverage data
 * @returns {string[]}
 */
function generateCoverageRecommendations(coverage) {
  const recommendations = [];

  if (!coverage) {
    return ['Enable coverage reporting in your test configuration'];
  }

  if (coverage.percentage < 50) {
    recommendations.push('Coverage is below 50%. Consider adding more tests.');
  } else if (coverage.percentage < 80) {
    recommendations.push('Coverage is good but could be improved to 80%.');
  }

  if (coverage.uncovered) {
    for (const file of coverage.uncovered.slice(0, 3)) {
      recommendations.push(`Add tests for ${file}`);
    }
  }

  return recommendations;
}

// ============================================================================
// Export
// ============================================================================

export default {
  createVerifierAgent,
};
