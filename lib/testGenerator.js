/**
 * Test Generator - Automatic test generation and QA assistance
 *
 * Features:
 * - Analyze implementation to generate tests
 * - Suggest edge cases based on code analysis
 * - Integrate with popular test frameworks
 * - Track test coverage
 *
 * @module testGenerator
 */

import fs from 'fs/promises';
import path from 'path';
import { parseFile, extractSymbols, getFunctions } from './codeAnalyzer.js';
import { getDefaultModel, chatCompletion } from './modelRegistry.js';

// ============================================================================
// Types & Interfaces
// ============================================================================

/**
 * @typedef {Object} TestFramework
 * @property {string} name - Framework name
 * @property {string} testPattern - Test file pattern
 * @property {string} extension - Test file extension
 * @property {Function} generateTestTemplate - Generate test template
 */

/**
 * @typedef {Object} GeneratedTest
 * @property {string} name - Test name
 * @property {string} code - Test code
 * @property {string} description - Test description
 * @property {string[]} edgeCases - Edge cases covered
 */

/**
 * @typedef {Object} TestSuite
 * @property {string} targetFile - File being tested
 * @property {string} testFile - Test file path
 * @property {GeneratedTest[]} tests - Generated tests
 * @property {string} framework - Test framework used
 */

// ============================================================================
// Test Framework Definitions
// ============================================================================

const TEST_FRAMEWORKS = {
  jest: {
    name: 'Jest',
    testPattern: '*.test.js',
    extension: '.test.js',
    detect: async (projectPath) => {
      try {
        const pkgPath = path.join(projectPath, 'package.json');
        const pkg = JSON.parse(await fs.readFile(pkgPath, 'utf-8'));
        return pkg.devDependencies?.jest || pkg.dependencies?.jest;
      } catch {
        return false;
      }
    },
    generateTemplate: (functionName, testCases) => {
      return `describe('${functionName}', () => {\n${testCases}\n});`;
    },
  },
  mocha: {
    name: 'Mocha',
    testPattern: '*.test.js',
    extension: '.test.js',
    detect: async (projectPath) => {
      try {
        const pkgPath = path.join(projectPath, 'package.json');
        const pkg = JSON.parse(await fs.readFile(pkgPath, 'utf-8'));
        return pkg.devDependencies?.mocha || pkg.dependencies?.mocha;
      } catch {
        return false;
      }
    },
    generateTemplate: (functionName, testCases) => {
      return `describe('${functionName}', () => {\n${testCases}\n});`;
    },
  },
  vitest: {
    name: 'Vitest',
    testPattern: '*.test.js',
    extension: '.test.js',
    detect: async (projectPath) => {
      try {
        const pkgPath = path.join(projectPath, 'package.json');
        const pkg = JSON.parse(await fs.readFile(pkgPath, 'utf-8'));
        return pkg.devDependencies?.vitest || pkg.dependencies?.vitest;
      } catch {
        return false;
      }
    },
    generateTemplate: (functionName, testCases) => {
      return `describe('${functionName}', () => {\n${testCases}\n});`;
    },
  },
  node: {
    name: 'Node.js Test Runner',
    testPattern: '*.test.js',
    extension: '.test.js',
    detect: async (projectPath) => {
      try {
        const pkgPath = path.join(projectPath, 'package.json');
        const pkg = JSON.parse(await fs.readFile(pkgPath, 'utf-8'));
        return pkg.type === 'module';
      } catch {
        return false;
      }
    },
    generateTemplate: (functionName, testCases) => {
      return `import { describe, it } from 'node:test';\nimport assert from 'node:assert';\n\ndescribe('${functionName}', () => {\n${testCases}\n});`;
    },
  },
};

// ============================================================================
// Framework Detection
// ============================================================================

/**
 * Detect the test framework used in a project
 * @param {string} projectPath - Project root path
 * @returns {Promise<TestFramework|null>}
 */
export async function detectTestFramework(projectPath) {
  for (const [key, framework] of Object.entries(TEST_FRAMEWORKS)) {
    if (await framework.detect(projectPath)) {
      return { ...framework, key };
    }
  }

  // Default to Jest if no framework detected
  return { ...TEST_FRAMEWORKS.jest, key: 'jest' };
}

/**
 * Get test file path for a source file
 * @param {string} sourceFile - Source file path
 * @param {TestFramework} framework - Test framework
 * @returns {string}
 */
export function getTestFilePath(sourceFile, framework) {
  const dir = path.dirname(sourceFile);
  const basename = path.basename(sourceFile, path.extname(sourceFile));
  return path.join(dir, `${basename}${framework.extension}`);
}

// ============================================================================
// Edge Case Analysis
// ============================================================================

/**
 * Analyze function for potential edge cases
 * @param {Object} func - Function symbol
 * @param {string} code - Function code
 * @returns {string[]} Edge cases
 */
export function analyzeEdgeCases(func, code) {
  const edgeCases = [];

  // Check for common edge case patterns
  const patterns = [
    { pattern: /if\s*\([^)]*null/i, case: 'null input' },
    { pattern: /if\s*\([^)]*undefined/i, case: 'undefined input' },
    { pattern: /if\s*\([^)]*\.length/i, case: 'empty array/string' },
    { pattern: /if\s*\([^)]*===?\s*0/i, case: 'zero value' },
    { pattern: /if\s*\([^)]*<\s*0/i, case: 'negative number' },
    { pattern: /if\s*\([^)]*>\s*0/i, case: 'positive number' },
    { pattern: /typeof/i, case: 'type checking' },
    { pattern: /instanceof/i, case: 'instance checking' },
    { pattern: /try\s*\{/i, case: 'error handling' },
    { pattern: /throw\s+new/i, case: 'error throwing' },
    { pattern: /async|await/i, case: 'async operation' },
    { pattern: /Promise/i, case: 'promise handling' },
  ];

  for (const { pattern, case: caseName } of patterns) {
    if (pattern.test(code)) {
      edgeCases.push(caseName);
    }
  }

  // Check for parameter count
  const paramMatch = code.match(/function\s*\w*\s*\(([^)]*)\)/);
  if (paramMatch) {
    const params = paramMatch[1].split(',').filter(p => p.trim());
    if (params.length > 0) {
      edgeCases.push(`${params.length} parameter(s)`);
    }
  }

  return [...new Set(edgeCases)];
}

/**
 * Generate edge case suggestions using AI
 * @param {string} functionCode - Function code
 * @param {string} functionName - Function name
 * @returns {Promise<string[]>}
 */
export async function suggestEdgeCasesWithAI(functionCode, functionName) {
  const model = getDefaultModel();

  const prompt = `Analyze this function and suggest edge cases that should be tested:

Function: ${functionName}

Code:
${functionCode}

Suggest 5-7 edge cases that should be tested. Consider:
- Null/undefined inputs
- Empty collections
- Boundary values
- Type mismatches
- Error conditions
- Async behavior

Respond with a JSON array of edge case descriptions.`;

  try {
    const response = await chatCompletion(
      model,
      [
        { role: 'system', content: 'You are a test engineer. Output only valid JSON arrays.' },
        { role: 'user', content: prompt },
      ],
      { temperature: 0.3 }
    );

    // Try to parse JSON
    const jsonMatch = response.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }

    // Fallback: split by lines
    return response.split('\n').filter(line => line.trim().startsWith('-')).map(line => line.replace(/^-\s*/, ''));
  } catch (error) {
    console.error('[TestGenerator] Failed to generate edge cases:', error.message);
    return [];
  }
}

// ============================================================================
// Test Generation
// ============================================================================

/**
 * Generate tests for a function using AI
 * @param {Object} func - Function symbol
 * @param {string} code - Full file code
 * @param {TestFramework} framework - Test framework
 * @returns {Promise<GeneratedTest>}
 */
export async function generateFunctionTest(func, code, framework) {
  const model = getDefaultModel();

  // Extract function code
  const lines = code.split('\n');
  const functionCode = lines.slice(func.lineStart - 1, func.lineEnd || func.lineStart + 10).join('\n');

  // Analyze edge cases
  const edgeCases = analyzeEdgeCases(func, functionCode);

  const prompt = `Generate ${framework.name} tests for this function:

Function: ${func.name}
Signature: ${func.signature}

Code:
${functionCode}

Edge cases to cover:
${edgeCases.map(e => `- ${e}`).join('\n')}

Generate comprehensive test cases with:
1. Happy path tests
2. Edge case tests
3. Error handling tests

Use ${framework.name} syntax. Include descriptive test names and assertions.`;

  try {
    const response = await chatCompletion(
      model,
      [
        { role: 'system', content: `You are a test engineer. Generate ${framework.name} test code only.` },
        { role: 'user', content: prompt },
      ],
      { temperature: 0.3 }
    );

    // Extract test code from response
    const testCode = response.replace(/```[\w]*\n?/g, '').trim();

    return {
      name: func.name,
      code: testCode,
      description: `Tests for ${func.name}`,
      edgeCases,
    };
  } catch (error) {
    console.error('[TestGenerator] Failed to generate test:', error.message);
    return {
      name: func.name,
      code: `// Failed to generate test for ${func.name}`,
      description: 'Generation failed',
      edgeCases,
    };
  }
}

/**
 * Generate tests for a file
 * @param {string} filePath - Source file path
 * @param {Object} options - Generation options
 * @returns {Promise<TestSuite>}
 */
export async function generateTests(filePath, options = {}) {
  // Detect framework
  const projectPath = options.projectPath || path.dirname(filePath);
  const framework = await detectTestFramework(projectPath);

  // Parse file
  const code = await fs.readFile(filePath, 'utf-8');
  const ast = await parseFile(filePath, code);

  if (!ast) {
    throw new Error(`Failed to parse ${filePath}`);
  }

  // Extract functions
  const symbols = extractSymbols(ast, code, filePath);
  const functions = getFunctions(symbols);

  // Generate tests for each function
  const tests = [];
  for (const func of functions) {
    if (options.functions && !options.functions.includes(func.name)) {
      continue;
    }

    const test = await generateFunctionTest(func, code, framework);
    tests.push(test);
  }

  // Determine test file path
  const testFile = options.testFile || getTestFilePath(filePath, framework);

  return {
    targetFile: filePath,
    testFile,
    tests,
    framework: framework.name,
  };
}

/**
 * Write test suite to file
 * @param {TestSuite} suite - Test suite
 * @param {Object} options - Write options
 */
export async function writeTestSuite(suite, options = {}) {
  let content = '';

  // Add imports
  const relativePath = path.relative(path.dirname(suite.testFile), suite.targetFile)
    .replace(/\.js$/, '')
    .replace(/\\/g, '/');

  content += `import { ${suite.tests.map(t => t.name).join(', ')} } from '${relativePath}';\n\n`;

  // Add tests
  for (const test of suite.tests) {
    content += `${test.code}\n\n`;
  }

  // Write file
  if (!options.dryRun) {
    await fs.writeFile(suite.testFile, content);
  }

  return {
    filePath: suite.testFile,
    content,
    testCount: suite.tests.length,
  };
}

// ============================================================================
// Test Execution
// ============================================================================

/**
 * Run tests for a project
 * @param {string} projectPath - Project path
 * @param {Object} options - Run options
 * @returns {Promise<Object>}
 */
export async function runTests(projectPath, options = {}) {
  const framework = await detectTestFramework(projectPath);

  const { spawn } = await import('child_process');

  return new Promise((resolve) => {
    let command;
    let args;

    switch (framework.key) {
      case 'jest':
        command = 'npx';
        args = ['jest', '--json', '--outputFile=/tmp/jest-results.json'];
        break;
      case 'mocha':
        command = 'npx';
        args = ['mocha', '--reporter', 'json'];
        break;
      case 'vitest':
        command = 'npx';
        args = ['vitest', 'run', '--reporter', 'json'];
        break;
      case 'node':
        command = 'node';
        args = ['--test'];
        break;
      default:
        command = 'npm';
        args = ['test'];
    }

    if (options.pattern) {
      args.push(options.pattern);
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
      resolve({
        success: exitCode === 0,
        exitCode,
        stdout,
        stderr,
        framework: framework.name,
      });
    });
  });
}

/**
 * Parse test results
 * @param {string} output - Test command output
 * @param {string} framework - Framework name
 * @returns {Object}
 */
export function parseTestResults(output, framework) {
  try {
    const data = JSON.parse(output);

    if (framework === 'Jest') {
      return {
        total: data.numTotalTests,
        passed: data.numPassedTests,
        failed: data.numFailedTests,
        pending: data.numPendingTests,
        coverage: data.coverageMap ? calculateCoverage(data.coverageMap) : null,
      };
    }

    // Generic parsing
    return {
      total: data.tests?.length || 0,
      passed: data.tests?.filter(t => t.pass).length || 0,
      failed: data.tests?.filter(t => !t.pass).length || 0,
      pending: 0,
      coverage: null,
    };
  } catch {
    // Fallback: parse text output
    const passedMatch = output.match(/(\d+) passing/);
    const failedMatch = output.match(/(\d+) failing/);

    return {
      total: parseInt(passedMatch?.[1] || 0) + parseInt(failedMatch?.[1] || 0),
      passed: parseInt(passedMatch?.[1] || 0),
      failed: parseInt(failedMatch?.[1] || 0),
      pending: 0,
      coverage: null,
    };
  }
}

/**
 * Calculate coverage percentage
 * @param {Object} coverageMap - Coverage map
 * @returns {Object}
 */
function calculateCoverage(coverageMap) {
  let totalStatements = 0;
  let coveredStatements = 0;

  for (const file of Object.values(coverageMap)) {
    const statementMap = file.statementMap || {};
    const coverage = file.s || {};

    for (const key of Object.keys(statementMap)) {
      totalStatements++;
      if (coverage[key] > 0) {
        coveredStatements++;
      }
    }
  }

  return {
    percentage: totalStatements > 0 ? (coveredStatements / totalStatements) * 100 : 0,
    total: totalStatements,
    covered: coveredStatements,
  };
}

// ============================================================================
// Coverage Analysis
// ============================================================================

/**
 * Analyze test coverage
 * @param {string} projectPath - Project path
 * @returns {Promise<Object>}
 */
export async function analyzeCoverage(projectPath) {
  const framework = await detectTestFramework(projectPath);

  if (framework.key !== 'jest') {
    return { error: 'Coverage analysis only supported for Jest' };
  }

  const { spawn } = await import('child_process');

  return new Promise((resolve) => {
    const child = spawn('npx', ['jest', '--coverage', '--json'], {
      cwd: projectPath,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';

    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    child.on('close', () => {
      try {
        const data = JSON.parse(stdout);
        resolve({
          coverage: data.coverageMap ? calculateCoverage(data.coverageMap) : null,
          testResults: data.testResults,
        });
      } catch {
        resolve({ error: 'Failed to parse coverage results' });
      }
    });
  });
}

/**
 * Suggest missing tests based on coverage
 * @param {Object} coverage - Coverage data
 * @returns {string[]}
 */
export function suggestMissingTests(coverage) {
  const suggestions = [];

  if (coverage.percentage < 80) {
    suggestions.push(`Overall coverage is ${coverage.percentage.toFixed(1)}%. Aim for at least 80%.`);
  }

  // Check for uncovered files
  if (coverage.uncoveredFiles) {
    for (const file of coverage.uncoveredFiles) {
      suggestions.push(`Add tests for ${file}`);
    }
  }

  return suggestions;
}

// ============================================================================
// Export Default
// ============================================================================

export default {
  detectTestFramework,
  getTestFilePath,
  analyzeEdgeCases,
  suggestEdgeCasesWithAI,
  generateFunctionTest,
  generateTests,
  writeTestSuite,
  runTests,
  parseTestResults,
  analyzeCoverage,
  suggestMissingTests,
};
