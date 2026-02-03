/**
 * Tool Migrator
 * 
 * Migrates existing tools from various locations:
 * - assistant.js (webSearch function)
 * - lib/toolRegistry.js (existing tools)
 * - Any other scattered tool implementations
 * 
 * Also registers new OpenClaw-style coding tools:
 * - File tools (read, write, edit, list)
 * - Exec tool (shell command execution)
 * - Project context tool
 */

import fs from 'fs/promises';
import path from 'path';

// Import new coding tools
import { registerFileTools } from './file-tools.js';
import { registerExecTool } from './exec-tool.js';
import { registerProjectContextTool } from './project-context.js';

/**
 * Migrate existing tools to the unified registry
 * @param {ToolRegistry} registry - Target registry
 */
export async function migrateExistingTools(registry) {
  console.log('🔄 Migrating existing tools...');
  
  try {
    // Import and migrate tools from lib/toolRegistry.js
    await migrateFromLegacyToolRegistry(registry);
    
    // Import web search from assistant.js (already handled in registry.js builtin)
    // No need to duplicate, but we could enhance it here
    
    // Register new OpenClaw-style coding tools
    await registerCodingTools(registry);
    
    console.log('✅ Tool migration completed');
  } catch (error) {
    console.error('❌ Tool migration failed:', error);
    throw error;
  }
}

/**
 * Register OpenClaw-style coding tools
 * These provide file manipulation and project understanding capabilities
 * @param {ToolRegistry} registry - Target registry
 */
async function registerCodingTools(registry) {
  console.log('🛠️ Registering coding tools...');
  
  try {
    // File tools: read, write, edit, list
    registerFileTools(registry);
    
    // Exec tool: shell command execution
    registerExecTool(registry);
    
    // Project context tool: understand project structure
    registerProjectContextTool(registry);
    
    console.log('✅ Coding tools registered');
  } catch (error) {
    console.error('⚠️ Failed to register some coding tools:', error.message);
  }
}

/**
 * Migrate tools from the legacy tool registry
 * @param {ToolRegistry} registry - Target registry
 */
async function migrateFromLegacyToolRegistry(registry) {
  try {
    // Import the legacy tool registry
    const legacyRegistryPath = path.resolve(process.cwd(), 'lib', 'toolRegistry.js');
    
    try {
      await fs.access(legacyRegistryPath);
      
      // Import legacy tools (dynamic import to avoid conflicts)
      const { 
        fileReadTool, 
        fileWriteTool, 
        shellTool, 
        webFetchTool, 
        searchTool, 
        taskPlannerTool 
      } = await import('../toolRegistry.js');
      
      // Migrate each tool with enhanced definitions
      migrateLegacyTool(registry, 'file_read_legacy', fileReadTool);
      migrateLegacyTool(registry, 'file_write_legacy', fileWriteTool);
      migrateLegacyTool(registry, 'shell_legacy', shellTool);
      migrateLegacyTool(registry, 'web_fetch', webFetchTool);
      migrateLegacyTool(registry, 'search_local', searchTool);
      migrateLegacyTool(registry, 'task_planner', taskPlannerTool);
      
      console.log('✅ Migrated 6 tools from legacy toolRegistry.js');
    } catch (error) {
      console.log('⚠️ Legacy toolRegistry.js not accessible or incompatible, skipping');
    }
  } catch (error) {
    console.warn('⚠️ Could not migrate from legacy tool registry:', error.message);
  }
}

/**
 * Convert a legacy tool definition to the new format
 * @param {ToolRegistry} registry - Target registry
 * @param {string} name - Tool name
 * @param {Object} legacyTool - Legacy tool definition
 */
function migrateLegacyTool(registry, name, legacyTool) {
  try {
    // Convert legacy tool to new format
    const newTool = {
      schema: convertLegacySchema(legacyTool.inputSchema),
      handler: adaptLegacyHandler(legacyTool.handler),
      description: legacyTool.description,
      metadata: {
        category: inferCategory(name, legacyTool),
        migrated: true,
        originalName: legacyTool.name,
        autonomyLevel: legacyTool.autonomyLevel,
        safetyConstraints: legacyTool.safetyConstraints || []
      }
    };
    
    // Add rate limiting based on tool characteristics
    if (name.includes('shell') || name.includes('write')) {
      newTool.rateLimit = { requests: 5, window: '1m' };
    } else if (name.includes('fetch') || name.includes('web')) {
      newTool.rateLimit = { requests: 20, window: '1m' };
    }
    
    registry.register(name, newTool);
  } catch (error) {
    console.warn(`⚠️ Failed to migrate tool ${name}:`, error.message);
  }
}

/**
 * Convert legacy input schema to new format
 * @param {Object} legacySchema - Legacy schema
 * @returns {Object} New schema format
 */
function convertLegacySchema(legacySchema) {
  if (!legacySchema || !legacySchema.properties) {
    return {};
  }
  
  const newSchema = {};
  
  for (const [prop, config] of Object.entries(legacySchema.properties)) {
    const isRequired = legacySchema.required?.includes(prop);
    const type = config.type || 'string';
    
    newSchema[prop] = isRequired ? type : `${type}?`;
  }
  
  return newSchema;
}

/**
 * Adapt legacy handler to new format
 * @param {Function} legacyHandler - Legacy handler function
 * @returns {Function} New handler format
 */
function adaptLegacyHandler(legacyHandler) {
  return async (params, context = {}) => {
    try {
      // Call legacy handler with just params (old format)
      const result = await legacyHandler(params);
      
      // Wrap result in consistent format
      return {
        ...result,
        _migrated: true,
        _executedAt: new Date().toISOString()
      };
    } catch (error) {
      throw new Error(`Legacy tool execution failed: ${error.message}`);
    }
  };
}

/**
 * Infer tool category from name and definition
 * @param {string} name - Tool name
 * @param {Object} tool - Tool definition
 * @returns {string} Category
 */
function inferCategory(name, tool) {
  const tags = tool.tags || [];
  
  if (tags.includes('filesystem') || name.includes('file')) {
    return 'filesystem';
  }
  
  if (tags.includes('network') || tags.includes('web') || name.includes('web')) {
    return 'network';
  }
  
  if (tags.includes('shell') || name.includes('shell')) {
    return 'system';
  }
  
  if (tags.includes('search') || name.includes('search')) {
    return 'search';
  }
  
  if (tags.includes('planning') || name.includes('planner')) {
    return 'planning';
  }
  
  return 'general';
}

/**
 * Enhanced web search tool (migrated from assistant.js)
 * This enhances the basic web_search tool with additional features
 */
export function createEnhancedWebSearchTool() {
  return {
    schema: {
      query: 'string',
      limit: 'number?',
      site: 'string?',
      timeRange: 'string?'
    },
    handler: async (params, context) => {
      const { query, limit = 5, site, timeRange } = params;
      
      // Construct enhanced query
      let enhancedQuery = query;
      if (site) {
        enhancedQuery = `site:${site} ${query}`;
      }
      
      // Note: Implementation would depend on configured search provider
      console.log(`🔍 Enhanced web search: ${enhancedQuery}`);
      
      return {
        query: enhancedQuery,
        originalQuery: query,
        limit,
        results: [],
        provider: 'disabled',
        message: 'Web search requires API configuration (TAVILY_API_KEY or SEARXNG_URL)',
        enhancedFeatures: { site, timeRange }
      };
    },
    description: 'Enhanced web search with site filtering and time range',
    rateLimit: {
      requests: 15,
      window: '1m'
    },
    metadata: {
      category: 'search',
      enhanced: true,
      originalSource: 'assistant.js'
    }
  };
}

/**
 * Register enhanced tools
 * @param {ToolRegistry} registry - Registry to register to
 */
export function registerEnhancedTools(registry) {
  // Enhanced web search
  registry.register('web_search_enhanced', createEnhancedWebSearchTool());
  
  // Add more enhanced tools here as needed
  console.log('✅ Registered enhanced tools');
}