/**
 * Project Context Tool - Understand project structure
 * 
 * Analyzes a project directory to detect:
 * - Project type (Node.js, Python, Go, etc.)
 * - Framework (React, Vue, Express, Django, etc.)
 * - Entry points
 * - Structure overview
 * - Configuration files
 */

import { promises as fs } from 'fs';
import path from 'path';

// ============================================================================
// Project Detection Rules
// ============================================================================

const PROJECT_INDICATORS = {
  // Node.js / JavaScript
  nodejs: {
    files: ['package.json'],
    type: 'nodejs',
    language: 'javascript'
  },
  
  // TypeScript
  typescript: {
    files: ['tsconfig.json'],
    type: 'typescript',
    language: 'typescript'
  },
  
  // Python
  python: {
    files: ['requirements.txt', 'setup.py', 'pyproject.toml', 'Pipfile'],
    type: 'python',
    language: 'python'
  },
  
  // Go
  golang: {
    files: ['go.mod', 'go.sum'],
    type: 'golang',
    language: 'go'
  },
  
  // Rust
  rust: {
    files: ['Cargo.toml'],
    type: 'rust',
    language: 'rust'
  },
  
  // Ruby
  ruby: {
    files: ['Gemfile', 'Rakefile'],
    type: 'ruby',
    language: 'ruby'
  },
  
  // Java/Kotlin
  java: {
    files: ['pom.xml', 'build.gradle', 'build.gradle.kts'],
    type: 'java',
    language: 'java'
  },
  
  // PHP
  php: {
    files: ['composer.json'],
    type: 'php',
    language: 'php'
  }
};

const FRAMEWORK_INDICATORS = {
  // JavaScript/TypeScript frameworks
  react: {
    packageDeps: ['react', 'react-dom'],
    configFiles: ['vite.config.js', 'next.config.js', 'gatsby-config.js'],
    framework: 'react'
  },
  nextjs: {
    packageDeps: ['next'],
    configFiles: ['next.config.js', 'next.config.mjs', 'next.config.ts'],
    framework: 'nextjs'
  },
  vue: {
    packageDeps: ['vue'],
    configFiles: ['vue.config.js', 'nuxt.config.js'],
    framework: 'vue'
  },
  nuxt: {
    packageDeps: ['nuxt'],
    configFiles: ['nuxt.config.js', 'nuxt.config.ts'],
    framework: 'nuxt'
  },
  angular: {
    packageDeps: ['@angular/core'],
    configFiles: ['angular.json'],
    framework: 'angular'
  },
  svelte: {
    packageDeps: ['svelte'],
    configFiles: ['svelte.config.js'],
    framework: 'svelte'
  },
  express: {
    packageDeps: ['express'],
    framework: 'express'
  },
  fastify: {
    packageDeps: ['fastify'],
    framework: 'fastify'
  },
  nestjs: {
    packageDeps: ['@nestjs/core'],
    configFiles: ['nest-cli.json'],
    framework: 'nestjs'
  },
  
  // Python frameworks
  django: {
    files: ['manage.py'],
    requirements: ['django'],
    framework: 'django'
  },
  flask: {
    requirements: ['flask'],
    framework: 'flask'
  },
  fastapi: {
    requirements: ['fastapi'],
    framework: 'fastapi'
  }
};

// ============================================================================
// Helper Functions
// ============================================================================

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readJSON(filePath) {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content);
  } catch {
    return null;
  }
}

async function detectProjectType(projectPath) {
  for (const [name, indicator] of Object.entries(PROJECT_INDICATORS)) {
    for (const file of indicator.files) {
      if (await fileExists(path.join(projectPath, file))) {
        return {
          type: indicator.type,
          language: indicator.language,
          indicator: file
        };
      }
    }
  }
  return { type: 'unknown', language: 'unknown', indicator: null };
}

async function detectFramework(projectPath, projectType) {
  const frameworks = [];
  
  // Check package.json for Node.js projects
  if (projectType.type === 'nodejs' || projectType.type === 'typescript') {
    const pkg = await readJSON(path.join(projectPath, 'package.json'));
    if (pkg) {
      const allDeps = {
        ...pkg.dependencies,
        ...pkg.devDependencies
      };
      
      for (const [name, indicator] of Object.entries(FRAMEWORK_INDICATORS)) {
        if (indicator.packageDeps) {
          const hasDep = indicator.packageDeps.some(dep => dep in allDeps);
          if (hasDep) {
            frameworks.push(indicator.framework);
          }
        }
        if (indicator.configFiles) {
          for (const configFile of indicator.configFiles) {
            if (await fileExists(path.join(projectPath, configFile))) {
              if (!frameworks.includes(indicator.framework)) {
                frameworks.push(indicator.framework);
              }
            }
          }
        }
      }
    }
  }
  
  // Check Python requirements
  if (projectType.type === 'python') {
    const reqPath = path.join(projectPath, 'requirements.txt');
    if (await fileExists(reqPath)) {
      try {
        const content = await fs.readFile(reqPath, 'utf-8');
        const requirements = content.toLowerCase();
        
        for (const [name, indicator] of Object.entries(FRAMEWORK_INDICATORS)) {
          if (indicator.requirements) {
            const hasReq = indicator.requirements.some(req => 
              requirements.includes(req.toLowerCase())
            );
            if (hasReq) {
              frameworks.push(indicator.framework);
            }
          }
        }
      } catch {}
    }
    
    // Check for Django's manage.py
    if (await fileExists(path.join(projectPath, 'manage.py'))) {
      if (!frameworks.includes('django')) {
        frameworks.push('django');
      }
    }
  }
  
  return frameworks;
}

async function findEntryPoints(projectPath, projectType) {
  const entryPoints = [];
  
  // Node.js entry points
  if (projectType.type === 'nodejs' || projectType.type === 'typescript') {
    const pkg = await readJSON(path.join(projectPath, 'package.json'));
    if (pkg) {
      if (pkg.main) entryPoints.push(pkg.main);
      if (pkg.module) entryPoints.push(pkg.module);
      if (pkg.bin) {
        if (typeof pkg.bin === 'string') {
          entryPoints.push(pkg.bin);
        } else {
          entryPoints.push(...Object.values(pkg.bin));
        }
      }
      // Check scripts for common entry patterns
      if (pkg.scripts) {
        const startScript = pkg.scripts.start || '';
        const match = startScript.match(/node\s+(\S+\.js)/);
        if (match && !entryPoints.includes(match[1])) {
          entryPoints.push(match[1]);
        }
      }
    }
    
    // Common entry point names
    const commonEntries = ['index.js', 'index.ts', 'main.js', 'main.ts', 'app.js', 'app.ts', 'server.js', 'server.ts'];
    for (const entry of commonEntries) {
      if (await fileExists(path.join(projectPath, entry))) {
        if (!entryPoints.includes(entry)) {
          entryPoints.push(entry);
        }
      }
      // Check src/ directory
      if (await fileExists(path.join(projectPath, 'src', entry))) {
        const srcEntry = `src/${entry}`;
        if (!entryPoints.includes(srcEntry)) {
          entryPoints.push(srcEntry);
        }
      }
    }
  }
  
  // Python entry points
  if (projectType.type === 'python') {
    const commonPythonEntries = ['main.py', 'app.py', '__main__.py', 'run.py'];
    for (const entry of commonPythonEntries) {
      if (await fileExists(path.join(projectPath, entry))) {
        entryPoints.push(entry);
      }
    }
  }
  
  return [...new Set(entryPoints)];
}

async function getDirectoryStructure(projectPath, depth = 2) {
  const structure = [];
  
  async function walk(dir, currentDepth, prefix = '') {
    if (currentDepth > depth) return;
    
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      
      // Filter out common ignored directories
      const filtered = entries.filter(e => 
        !['node_modules', '.git', '__pycache__', '.next', 'dist', 'build', '.cache', 'coverage'].includes(e.name) &&
        !e.name.startsWith('.')
      );
      
      // Sort: directories first
      filtered.sort((a, b) => {
        if (a.isDirectory() !== b.isDirectory()) {
          return a.isDirectory() ? -1 : 1;
        }
        return a.name.localeCompare(b.name);
      });
      
      for (const entry of filtered) {
        const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
        
        if (entry.isDirectory()) {
          structure.push({ path: relativePath, type: 'directory' });
          await walk(path.join(dir, entry.name), currentDepth + 1, relativePath);
        } else {
          structure.push({ path: relativePath, type: 'file' });
        }
      }
    } catch {}
  }
  
  await walk(projectPath, 0);
  return structure;
}

async function getConfigFiles(projectPath) {
  const configPatterns = [
    'package.json',
    'tsconfig.json',
    'tsconfig.*.json',
    '.eslintrc*',
    '.prettierrc*',
    'vite.config.*',
    'next.config.*',
    'webpack.config.*',
    'babel.config.*',
    '.babelrc*',
    'jest.config.*',
    'vitest.config.*',
    'tailwind.config.*',
    'postcss.config.*',
    '.env.example',
    'docker-compose.yml',
    'Dockerfile',
    'Makefile',
    'requirements.txt',
    'pyproject.toml',
    'setup.py',
    'Cargo.toml',
    'go.mod'
  ];
  
  const found = [];
  for (const pattern of configPatterns) {
    if (pattern.includes('*')) {
      // Simple glob - just check common extensions
      const base = pattern.replace('*', '');
      const extensions = ['', '.js', '.ts', '.mjs', '.cjs', '.json', '.yaml', '.yml'];
      for (const ext of extensions) {
        const file = base + ext;
        if (await fileExists(path.join(projectPath, file))) {
          found.push(file);
        }
      }
    } else {
      if (await fileExists(path.join(projectPath, pattern))) {
        found.push(pattern);
      }
    }
  }
  
  return [...new Set(found)];
}

// ============================================================================
// Project Context Tool Definition
// ============================================================================

export const projectContextTool = {
  name: 'project_context',
  description: 'Analyze a project directory to understand its structure, type, and configuration.',
  schema: {
    path: 'string?'  // Project root (default: cwd)
  },
  handler: async (params, context = {}) => {
    const { path: projectPath = '.' } = params;
    const baseDir = context.projectRoot || context.cwd || process.cwd();
    const resolvedPath = path.resolve(baseDir, projectPath);
    
    // Verify it's a directory
    try {
      const stats = await fs.stat(resolvedPath);
      if (!stats.isDirectory()) {
        throw new Error(`"${projectPath}" is not a directory`);
      }
    } catch (error) {
      if (error.code === 'ENOENT') {
        throw new Error(`Directory not found: ${projectPath}`);
      }
      throw error;
    }
    
    // Gather project information
    const [projectType, configFiles] = await Promise.all([
      detectProjectType(resolvedPath),
      getConfigFiles(resolvedPath)
    ]);
    
    const [frameworks, entryPoints, structure] = await Promise.all([
      detectFramework(resolvedPath, projectType),
      findEntryPoints(resolvedPath, projectType),
      getDirectoryStructure(resolvedPath, 2)
    ]);
    
    // Get package.json info if available
    let packageInfo = null;
    const pkg = await readJSON(path.join(resolvedPath, 'package.json'));
    if (pkg) {
      packageInfo = {
        name: pkg.name,
        version: pkg.version,
        description: pkg.description,
        scripts: Object.keys(pkg.scripts || {}),
        dependencyCount: Object.keys(pkg.dependencies || {}).length,
        devDependencyCount: Object.keys(pkg.devDependencies || {}).length
      };
    }
    
    return {
      path: projectPath,
      absolutePath: resolvedPath,
      type: projectType.type,
      language: projectType.language,
      frameworks,
      entryPoints,
      configFiles,
      packageInfo,
      structure: structure.slice(0, 100), // Limit structure output
      structureCount: structure.length,
      summary: generateSummary(projectType, frameworks, entryPoints, packageInfo)
    };
  },
  metadata: {
    category: 'project',
    safe: true
  }
};

function generateSummary(projectType, frameworks, entryPoints, packageInfo) {
  const parts = [];
  
  if (projectType.type !== 'unknown') {
    parts.push(`${projectType.type} project`);
  }
  
  if (frameworks.length > 0) {
    parts.push(`using ${frameworks.join(', ')}`);
  }
  
  if (packageInfo?.name) {
    parts.push(`(${packageInfo.name})`);
  }
  
  if (entryPoints.length > 0) {
    parts.push(`with entry point${entryPoints.length > 1 ? 's' : ''}: ${entryPoints.slice(0, 3).join(', ')}`);
  }
  
  return parts.length > 0 ? parts.join(' ') : 'Unknown project type';
}

// ============================================================================
// Register Project Context Tool
// ============================================================================

/**
 * Register the project_context tool with a registry
 * @param {ToolRegistry} registry - The tool registry to register with
 */
export function registerProjectContextTool(registry) {
  if (!registry.has(projectContextTool.name)) {
    registry.register(projectContextTool.name, projectContextTool);
    console.log(`🔍 Registered project_context tool`);
  } else {
    console.log(`⚠️ Tool "project_context" already registered, skipping`);
  }
}

export default projectContextTool;
