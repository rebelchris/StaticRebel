/**
 * Code Analyzer - AST-based code understanding and analysis
 *
 * Features:
 * - Parse JavaScript/TypeScript AST
 * - Extract function/class definitions
 * - Build code dependency graph
 * - Jump-to-definition support
 *
 * @module codeAnalyzer
 */

import { parse as parseJS } from 'acorn';
import { walk as walkJS } from 'acorn-walk';
import { parse as parseTS } from 'typescript';
import fs from 'fs/promises';
import path from 'path';

// ============================================================================
// Types & Interfaces
// ============================================================================

/**
 * @typedef {Object} Symbol
 * @property {string} name - Symbol name
 * @property {string} type - Symbol type ('function', 'class', 'variable', 'interface', 'type', 'import', 'export')
 * @property {number} lineStart - Starting line number
 * @property {number} lineEnd - Ending line number
 * @property {string} signature - Function signature or type definition
 * @property {string} documentation - JSDoc/documentation comment
 * @property {string} filePath - Source file path
 */

/**
 * @typedef {Object} Dependency
 * @property {string} source - Source file path
 * @property {string} target - Target file path or module
 * @property {string} type - Dependency type ('import', 'require', 'dynamic')
 * @property {string[]} symbols - Imported symbol names
 */

/**
 * @typedef {Object} CallGraph
 * @property {Map<string, Set<string>>} calls - Map of caller -> callees
 * @property {Map<string, Symbol>} symbols - Map of symbol ID -> symbol
 */

// ============================================================================
// JavaScript/TypeScript Parsing
// ============================================================================

/**
 * Parse JavaScript code to AST
 * @param {string} code - JavaScript code
 * @param {Object} options - Parse options
 * @returns {Object} AST
 */
export function parseJavaScript(code, options = {}) {
  return parseJS(code, {
    ecmaVersion: 'latest',
    sourceType: 'module',
    allowReturnOutsideFunction: true,
    allowImportExportEverywhere: true,
    locations: true,
    ...options,
  });
}

/**
 * Parse TypeScript code to AST
 * @param {string} code - TypeScript code
 * @param {string} filePath - File path for error reporting
 * @returns {Object} TypeScript AST
 */
export function parseTypeScript(code, filePath = 'unknown.ts') {
  return parseTS(code, {
    target: 99, // ESNext
    module: 1, // ESModule
    moduleResolution: 2, // Node
    allowJs: true,
    jsx: 2, // React JSX
  });
}

/**
 * Detect if code is TypeScript
 * @param {string} filePath - File path
 * @returns {boolean}
 */
function isTypeScript(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return ext === '.ts' || ext === '.tsx';
}

/**
 * Parse file based on extension
 * @param {string} filePath - File path
 * @param {string} [content] - Optional pre-read content
 * @returns {Object|null} AST or null if parsing fails
 */
export async function parseFile(filePath, content = null) {
  try {
    if (!content) {
      content = await fs.readFile(filePath, 'utf-8');
    }

    if (isTypeScript(filePath)) {
      return parseTypeScript(content, filePath);
    } else {
      return parseJavaScript(content);
    }
  } catch (error) {
    console.error(`[CodeAnalyzer] Failed to parse ${filePath}:`, error.message);
    return null;
  }
}

// ============================================================================
// Symbol Extraction
// ============================================================================

/**
 * Extract JSDoc comment before a node
 * @param {string} code - Full source code
 * @param {number} start - Node start position
 * @returns {string|null}
 */
function extractJSDoc(code, start) {
  const before = code.slice(0, start);
  const lines = before.split('\n');
  const docs = [];

  // Look backwards for JSDoc comment
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim();
    if (line.startsWith('/**')) {
      docs.unshift(line);
      break;
    } else if (line.startsWith('*') || line.startsWith('*/')) {
      docs.unshift(line);
    } else if (line === '' || line.startsWith('//')) {
      continue;
    } else {
      break;
    }
  }

  return docs.length > 0 ? docs.join('\n') : null;
}

/**
 * Build function signature from parameters
 * @param {Object} node - Function node
 * @param {string} code - Source code
 * @returns {string}
 */
function buildSignature(node, code) {
  const params = node.params.map(p => {
    if (p.type === 'Identifier') {
      return p.name;
    } else if (p.type === 'AssignmentPattern') {
      return `${p.left.name} = ...`;
    } else if (p.type === 'RestElement') {
      return `...${p.argument.name}`;
    } else if (p.type === 'ObjectPattern') {
      return '{...}';
    } else if (p.type === 'ArrayPattern') {
      return '[...]';
    }
    return '?';
  });

  return `(${params.join(', ')})`;
}

/**
 * Extract symbols from AST
 * @param {Object} ast - Parsed AST
 * @param {string} code - Source code
 * @param {string} filePath - File path
 * @returns {Symbol[]}
 */
export function extractSymbols(ast, code, filePath) {
  const symbols = [];

  walkJS(ast, {
    // Function declarations
    FunctionDeclaration(node) {
      if (node.id) {
        symbols.push({
          name: node.id.name,
          type: 'function',
          lineStart: node.loc?.start?.line || 0,
          lineEnd: node.loc?.end?.line || 0,
          signature: buildSignature(node, code),
          documentation: extractJSDoc(code, node.start),
          filePath,
        });
      }
    },

    // Class declarations
    ClassDeclaration(node) {
      if (node.id) {
        symbols.push({
          name: node.id.name,
          type: 'class',
          lineStart: node.loc?.start?.line || 0,
          lineEnd: node.loc?.end?.line || 0,
          signature: `class ${node.id.name}`,
          documentation: extractJSDoc(code, node.start),
          filePath,
        });

        // Extract class methods
        if (node.body && node.body.body) {
          for (const member of node.body.body) {
            if (member.type === 'MethodDefinition' && member.key) {
              symbols.push({
                name: `${node.id.name}.${member.key.name}`,
                type: 'function',
                lineStart: member.loc?.start?.line || 0,
                lineEnd: member.loc?.end?.line || 0,
                signature: buildSignature(member.value, code),
                documentation: extractJSDoc(code, member.start),
                filePath,
              });
            }
          }
        }
      }
    },

    // Variable declarations (const, let, var)
    VariableDeclarator(node, state, ancestors) {
      if (node.id && node.id.type === 'Identifier') {
        const parent = ancestors[ancestors.length - 2];
        const isConst = parent && parent.kind === 'const';
        const isFunction = node.init && (node.init.type === 'FunctionExpression' || node.init.type === 'ArrowFunctionExpression');

        symbols.push({
          name: node.id.name,
          type: isFunction ? 'function' : 'variable',
          lineStart: node.loc?.start?.line || 0,
          lineEnd: node.loc?.end?.line || 0,
          signature: isFunction ? buildSignature(node.init, code) : `${parent?.kind || 'var'} ${node.id.name}`,
          documentation: extractJSDoc(code, node.start),
          filePath,
        });
      }
    },

    // Import declarations
    ImportDeclaration(node) {
      node.specifiers.forEach(spec => {
        symbols.push({
          name: spec.local?.name || spec.imported?.name,
          type: 'import',
          lineStart: node.loc?.start?.line || 0,
          lineEnd: node.loc?.end?.line || 0,
          signature: `import from "${node.source.value}"`,
          documentation: null,
          filePath,
        });
      });
    },

    // Export declarations
    ExportNamedDeclaration(node) {
      if (node.declaration) {
        const decl = node.declaration;
        if (decl.id) {
          symbols.push({
            name: decl.id.name,
            type: 'export',
            lineStart: node.loc?.start?.line || 0,
            lineEnd: node.loc?.end?.line || 0,
            signature: `export ${decl.type}`,
            documentation: extractJSDoc(code, node.start),
            filePath,
          });
        }
      }
    },

    // Export default
    ExportDefaultDeclaration(node) {
      let name = 'default';
      if (node.declaration) {
        if (node.declaration.id) {
          name = node.declaration.id.name;
        } else if (node.declaration.type === 'FunctionDeclaration') {
          name = node.declaration.id?.name || 'default';
        }
      }

      symbols.push({
        name,
        type: 'export',
        lineStart: node.loc?.start?.line || 0,
        lineEnd: node.loc?.end?.line || 0,
        signature: 'export default',
        documentation: extractJSDoc(code, node.start),
        filePath,
      });
    },
  });

  return symbols;
}

// ============================================================================
// Dependency Analysis
// ============================================================================

/**
 * Extract dependencies from AST
 * @param {Object} ast - Parsed AST
 * @param {string} filePath - File path
 * @returns {Dependency[]}
 */
export function extractDependencies(ast, filePath) {
  const dependencies = [];

  walkJS(ast, {
    // ES6 imports
    ImportDeclaration(node) {
      const symbols = node.specifiers.map(s => s.local?.name || s.imported?.name);
      dependencies.push({
        source: filePath,
        target: node.source.value,
        type: 'import',
        symbols,
      });
    },

    // CommonJS require
    CallExpression(node) {
      if (node.callee.type === 'Identifier' && node.callee.name === 'require' &&
          node.arguments.length > 0 && node.arguments[0].type === 'Literal') {
        dependencies.push({
          source: filePath,
          target: node.arguments[0].value,
          type: 'require',
          symbols: [],
        });
      }

      // Dynamic import
      if (node.callee.type === 'Import' && node.arguments.length > 0) {
        dependencies.push({
          source: filePath,
          target: node.arguments[0].value,
          type: 'dynamic',
          symbols: [],
        });
      }
    },
  });

  return dependencies;
}

// ============================================================================
// Call Graph Construction
// ============================================================================

/**
 * Build call graph from AST
 * @param {Object} ast - Parsed AST
 * @param {string} filePath - File path
 * @returns {CallGraph}
 */
export function buildCallGraph(ast, filePath) {
  const calls = new Map();
  const symbols = new Map();
  const scopeStack = [];

  function getCurrentScope() {
    return scopeStack.length > 0 ? scopeStack[scopeStack.length - 1] : 'global';
  }

  walkJS(ast, {
    FunctionDeclaration(node) {
      if (node.id) {
        const scope = getCurrentScope();
        const symbolId = `${filePath}::${node.id.name}`;
        symbols.set(symbolId, {
          name: node.id.name,
          type: 'function',
          lineStart: node.loc?.start?.line,
          filePath,
        });
        scopeStack.push(node.id.name);
      }
    },

    FunctionExpression(node) {
      if (node.id) {
        scopeStack.push(node.id.name);
      }
    },

    ArrowFunctionExpression(node) {
      scopeStack.push('arrow');
    },

    // Track function calls
    CallExpression(node) {
      const caller = getCurrentScope();
      let callee = null;

      if (node.callee.type === 'Identifier') {
        callee = node.callee.name;
      } else if (node.callee.type === 'MemberExpression') {
        if (node.callee.object.type === 'Identifier' && node.callee.property.type === 'Identifier') {
          callee = `${node.callee.object.name}.${node.callee.property.name}`;
        }
      }

      if (callee) {
        if (!calls.has(caller)) {
          calls.set(caller, new Set());
        }
        calls.get(caller).add(callee);
      }
    },
  });

  return { calls, symbols };
}

// ============================================================================
// Symbol Resolution
// ============================================================================

/**
 * Find definition of a symbol
 * @param {string} symbolName - Symbol name to find
 * @param {string} fromFile - File searching from
 * @param {Map<string, Symbol[]>} fileSymbols - Map of file path to symbols
 * @returns {Symbol|null}
 */
export function findDefinition(symbolName, fromFile, fileSymbols) {
  // First check current file
  const currentFileSymbols = fileSymbols.get(fromFile) || [];
  const localDef = currentFileSymbols.find(s => s.name === symbolName);
  if (localDef) return localDef;

  // Then check all files
  for (const [filePath, symbols] of fileSymbols) {
    const def = symbols.find(s => s.name === symbolName);
    if (def) return def;
  }

  return null;
}

/**
 * Find all references to a symbol
 * @param {string} symbolName - Symbol name
 * @param {Map<string, Symbol[]>} fileSymbols - Map of file path to symbols
 * @returns {Array<{filePath: string, symbol: Symbol}>}
 */
export function findReferences(symbolName, fileSymbols) {
  const references = [];

  for (const [filePath, symbols] of fileSymbols) {
    for (const symbol of symbols) {
      if (symbol.name === symbolName ||
          (symbol.type === 'import' && symbol.name === symbolName)) {
        references.push({ filePath, symbol });
      }
    }
  }

  return references;
}

// ============================================================================
// Project-Wide Analysis
// ============================================================================

/**
 * Analyze entire project
 * @param {string} rootPath - Project root path
 * @param {string[]} filePaths - Files to analyze
 * @returns {Promise<Object>} Analysis results
 */
export async function analyzeProject(rootPath, filePaths) {
  const results = {
    files: new Map(),
    symbols: new Map(),
    dependencies: [],
    callGraphs: new Map(),
  };

  for (const filePath of filePaths) {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const ast = await parseFile(filePath, content);

      if (!ast) continue;

      const symbols = extractSymbols(ast, content, filePath);
      const deps = extractDependencies(ast, filePath);
      const callGraph = buildCallGraph(ast, filePath);

      results.files.set(filePath, {
        path: filePath,
        symbols,
        dependencies: deps,
        ast,
      });

      results.symbols.set(filePath, symbols);
      results.dependencies.push(...deps);
      results.callGraphs.set(filePath, callGraph);

    } catch (error) {
      console.error(`[CodeAnalyzer] Failed to analyze ${filePath}:`, error.message);
    }
  }

  return results;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Get all exported symbols from a file
 * @param {Symbol[]} symbols - File symbols
 * @returns {Symbol[]}
 */
export function getExports(symbols) {
  return symbols.filter(s => s.type === 'export');
}

/**
 * Get all imported symbols in a file
 * @param {Symbol[]} symbols - File symbols
 * @returns {Symbol[]}
 */
export function getImports(symbols) {
  return symbols.filter(s => s.type === 'import');
}

/**
 * Get all functions in a file
 * @param {Symbol[]} symbols - File symbols
 * @returns {Symbol[]}
 */
export function getFunctions(symbols) {
  return symbols.filter(s => s.type === 'function');
}

/**
 * Get all classes in a file
 * @param {Symbol[]} symbols - File symbols
 * @returns {Symbol[]}
 */
export function getClasses(symbols) {
  return symbols.filter(s => s.type === 'class');
}

// ============================================================================
// Export Default
// ============================================================================

export default {
  parseJavaScript,
  parseTypeScript,
  parseFile,
  extractSymbols,
  extractDependencies,
  buildCallGraph,
  findDefinition,
  findReferences,
  analyzeProject,
  getExports,
  getImports,
  getFunctions,
  getClasses,
};
