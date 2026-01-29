/**
 * Parser Agent - Specialized agent for AST and code structure analysis
 *
 * Responsibilities:
 * - Parse code files and extract AST
 * - Identify symbols (functions, classes, variables)
 * - Map dependencies between files
 * - Provide code structure information
 *
 * @module agents/specialized/parser
 */

import agentRegistry, { AGENT_TYPES, MESSAGE_TYPES } from '../../lib/agentRegistry.js';
import { parseFile, extractSymbols, extractDependencies, buildCallGraph } from '../../lib/codeAnalyzer.js';
import fs from 'fs/promises';
import path from 'path';

/**
 * Create and register the parser agent
 * @returns {Object} Agent instance
 */
export function createParserAgent() {
  const agent = agentRegistry.registerAgent({
    name: 'ParserAgent',
    type: AGENT_TYPES.PARSER,
    capabilities: [
      'parse_code',
      'extract_symbols',
      'analyze_dependencies',
      'build_call_graph',
      'identify_exports',
      'identify_imports',
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
      case 'parse_file':
        result = await parseFileTask(data);
        break;

      case 'extract_symbols':
        result = await extractSymbolsTask(data);
        break;

      case 'analyze_dependencies':
        result = await analyzeDependenciesTask(data);
        break;

      case 'build_call_graph':
        result = await buildCallGraphTask(data);
        break;

      case 'analyze_project':
        result = await analyzeProjectTask(data);
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
    case 'get_file_symbols':
      return getFileSymbols(data.filePath);

    case 'get_file_dependencies':
      return getFileDependencies(data.filePath);

    case 'find_symbol_definition':
      return findSymbolDefinition(data.symbolName, data.filePath);

    default:
      return { error: 'Unknown query type' };
  }
}

// ============================================================================
// Task Implementations
// ============================================================================

/**
 * Parse a file task
 * @param {Object} data - Task data
 * @returns {Promise<Object>}
 */
async function parseFileTask(data) {
  const { filePath, content } = data;

  const code = content || await fs.readFile(filePath, 'utf-8');
  const ast = await parseFile(filePath, code);

  if (!ast) {
    throw new Error(`Failed to parse ${filePath}`);
  }

  return {
    filePath,
    parsed: true,
    ast: serializeAST(ast),
  };
}

/**
 * Extract symbols task
 * @param {Object} data - Task data
 * @returns {Promise<Object>}
 */
async function extractSymbolsTask(data) {
  const { filePath, content } = data;

  const code = content || await fs.readFile(filePath, 'utf-8');
  const ast = await parseFile(filePath, code);

  if (!ast) {
    throw new Error(`Failed to parse ${filePath}`);
  }

  const symbols = extractSymbols(ast, code, filePath);

  return {
    filePath,
    symbols: symbols.map(s => ({
      name: s.name,
      type: s.type,
      lineStart: s.lineStart,
      lineEnd: s.lineEnd,
      signature: s.signature,
    })),
    summary: {
      total: symbols.length,
      functions: symbols.filter(s => s.type === 'function').length,
      classes: symbols.filter(s => s.type === 'class').length,
      imports: symbols.filter(s => s.type === 'import').length,
      exports: symbols.filter(s => s.type === 'export').length,
    },
  };
}

/**
 * Analyze dependencies task
 * @param {Object} data - Task data
 * @returns {Promise<Object>}
 */
async function analyzeDependenciesTask(data) {
  const { filePath, content } = data;

  const code = content || await fs.readFile(filePath, 'utf-8');
  const ast = await parseFile(filePath, code);

  if (!ast) {
    throw new Error(`Failed to parse ${filePath}`);
  }

  const dependencies = extractDependencies(ast, filePath);

  return {
    filePath,
    dependencies: dependencies.map(d => ({
      target: d.target,
      type: d.type,
      symbols: d.symbols,
    })),
    summary: {
      total: dependencies.length,
      imports: dependencies.filter(d => d.type === 'import').length,
      requires: dependencies.filter(d => d.type === 'require').length,
    },
  };
}

/**
 * Build call graph task
 * @param {Object} data - Task data
 * @returns {Promise<Object>}
 */
async function buildCallGraphTask(data) {
  const { filePath, content } = data;

  const code = content || await fs.readFile(filePath, 'utf-8');
  const ast = await parseFile(filePath, code);

  if (!ast) {
    throw new Error(`Failed to parse ${filePath}`);
  }

  const callGraph = buildCallGraph(ast, filePath);

  // Convert Maps to serializable objects
  const calls = {};
  for (const [caller, callees] of callGraph.calls) {
    calls[caller] = Array.from(callees);
  }

  const symbols = {};
  for (const [id, symbol] of callGraph.symbols) {
    symbols[id] = symbol;
  }

  return {
    filePath,
    callGraph: {
      calls,
      symbols,
    },
  };
}

/**
 * Analyze entire project task
 * @param {Object} data - Task data
 * @returns {Promise<Object>}
 */
async function analyzeProjectTask(data) {
  const { projectPath, filePaths } = data;

  const results = {
    files: {},
    totalSymbols: 0,
    totalDependencies: 0,
    fileTypes: {},
  };

  for (const filePath of filePaths) {
    try {
      const code = await fs.readFile(filePath, 'utf-8');
      const ast = await parseFile(filePath, code);

      if (!ast) continue;

      const symbols = extractSymbols(ast, code, filePath);
      const dependencies = extractDependencies(ast, filePath);

      results.files[filePath] = {
        symbols: symbols.length,
        dependencies: dependencies.length,
      };

      results.totalSymbols += symbols.length;
      results.totalDependencies += dependencies.length;

      // Track file types
      const ext = path.extname(filePath);
      results.fileTypes[ext] = (results.fileTypes[ext] || 0) + 1;

    } catch (error) {
      console.error(`[ParserAgent] Failed to analyze ${filePath}:`, error.message);
    }
  }

  return results;
}

// ============================================================================
// Query Implementations
// ============================================================================

/**
 * Get symbols in a file
 * @param {string} filePath - File path
 * @returns {Promise<Object>}
 */
async function getFileSymbols(filePath) {
  const code = await fs.readFile(filePath, 'utf-8');
  const ast = await parseFile(filePath, code);

  if (!ast) {
    return { error: 'Failed to parse file' };
  }

  const symbols = extractSymbols(ast, code, filePath);
  return { symbols };
}

/**
 * Get file dependencies
 * @param {string} filePath - File path
 * @returns {Promise<Object>}
 */
async function getFileDependencies(filePath) {
  const code = await fs.readFile(filePath, 'utf-8');
  const ast = await parseFile(filePath, code);

  if (!ast) {
    return { error: 'Failed to parse file' };
  }

  const dependencies = extractDependencies(ast, filePath);
  return { dependencies };
}

/**
 * Find symbol definition
 * @param {string} symbolName - Symbol name
 * @param {string} filePath - Starting file path
 * @returns {Promise<Object>}
 */
async function findSymbolDefinition(symbolName, filePath) {
  const code = await fs.readFile(filePath, 'utf-8');
  const ast = await parseFile(filePath, code);

  if (!ast) {
    return { error: 'Failed to parse file' };
  }

  const symbols = extractSymbols(ast, code, filePath);
  const symbol = symbols.find(s => s.name === symbolName);

  if (symbol) {
    return {
      found: true,
      symbol: {
        name: symbol.name,
        type: symbol.type,
        lineStart: symbol.lineStart,
        lineEnd: symbol.lineEnd,
        filePath,
      },
    };
  }

  return { found: false };
}

// ============================================================================
// Utilities
// ============================================================================

/**
 * Serialize AST for transmission
 * @param {Object} ast - AST object
 * @returns {Object}
 */
function serializeAST(ast) {
  // Simplified serialization - in production, use a proper AST serializer
  return {
    type: ast.type,
    body: ast.body?.map(node => ({
      type: node.type,
      start: node.start,
      end: node.end,
    })),
  };
}

// ============================================================================
// Export
// ============================================================================

export default {
  createParserAgent,
};
