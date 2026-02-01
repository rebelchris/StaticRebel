/**
 * Unified Tool System - Main Entry Point
 * 
 * Single entry point for tool discovery and execution across StaticRebel.
 * Consolidates tools from assistant.js, lib/toolRegistry.js, and skills.
 */

import { ToolRegistry, getToolRegistry } from './registry.js';
import { migrateExistingTools } from './migrator.js';
import { loadSkillsAsTools } from './skill-adapter.js';

// ============================================================================
// Main Tool System
// ============================================================================

class UnifiedToolSystem {
  constructor() {
    this.registry = getToolRegistry();
    this.initialized = false;
  }
  
  /**
   * Initialize the tool system
   * Migrates existing tools and loads skills
   */
  async initialize() {
    if (this.initialized) return;
    
    console.log('🔧 Initializing Unified Tool System...');
    
    try {
      // Migrate existing tools from various locations
      await migrateExistingTools(this.registry);
      
      // Load skills as tools
      await loadSkillsAsTools(this.registry);
      
      this.initialized = true;
      console.log(`🔧 Tool system initialized with ${this.registry.tools.size} tools`);
    } catch (error) {
      console.error('❌ Failed to initialize tool system:', error);
      throw error;
    }
  }
  
  /**
   * Execute a tool by name
   * @param {string} toolName - Name of tool to execute
   * @param {Object} params - Parameters for the tool
   * @param {Object} context - Execution context (user, session, etc.)
   * @returns {Promise<Object>} Tool execution result
   */
  async executeTool(toolName, params = {}, context = {}) {
    if (!this.initialized) {
      await this.initialize();
    }
    
    return await this.registry.execute(toolName, params, context);
  }
  
  /**
   * Get available tools
   * @param {Object} filters - Optional filters
   * @returns {Array} List of available tools
   */
  getAvailableTools(filters = {}) {
    if (!this.initialized) {
      console.warn('Tool system not initialized. Call initialize() first.');
      return [];
    }
    
    let tools = this.registry.list();
    
    // Apply filters
    if (filters.category) {
      tools = tools.filter(tool => 
        tool.metadata?.category === filters.category
      );
    }
    
    if (filters.hasRateLimit !== undefined) {
      tools = tools.filter(tool => 
        !!tool.hasRateLimit === filters.hasRateLimit
      );
    }
    
    return tools;
  }
  
  /**
   * Discover tools by query
   * @param {string} query - Search query
   * @returns {Array} Matching tools
   */
  discoverTools(query) {
    if (!this.initialized) {
      console.warn('Tool system not initialized. Call initialize() first.');
      return [];
    }
    
    return this.registry.discover(query);
  }
  
  /**
   * Register a new tool
   * @param {string} name - Tool name
   * @param {Object} definition - Tool definition
   */
  registerTool(name, definition) {
    return this.registry.register(name, definition);
  }
  
  /**
   * Check if a tool exists
   * @param {string} name - Tool name
   * @returns {boolean} Tool exists
   */
  hasTool(name) {
    return this.registry.has(name);
  }
  
  /**
   * Get tool definition
   * @param {string} name - Tool name
   * @returns {Object|null} Tool definition
   */
  getTool(name) {
    return this.registry.get(name);
  }
  
  /**
   * Get tool usage statistics
   * @returns {Object} Usage statistics
   */
  getStats() {
    const tools = this.registry.list();
    const categories = {};
    
    tools.forEach(tool => {
      const category = tool.metadata?.category || 'uncategorized';
      categories[category] = (categories[category] || 0) + 1;
    });
    
    return {
      totalTools: tools.length,
      categories,
      hasRateLimit: tools.filter(t => t.hasRateLimit).length,
      initialized: this.initialized
    };
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let globalToolSystem = null;

/**
 * Get the global tool system instance
 * @returns {UnifiedToolSystem} Tool system instance
 */
export function getToolSystem() {
  if (!globalToolSystem) {
    globalToolSystem = new UnifiedToolSystem();
  }
  return globalToolSystem;
}

/**
 * Initialize the global tool system
 * @returns {Promise<void>}
 */
export async function initializeToolSystem() {
  const system = getToolSystem();
  await system.initialize();
  return system;
}

/**
 * Execute a tool (convenience function)
 * @param {string} toolName - Tool name
 * @param {Object} params - Parameters
 * @param {Object} context - Context
 * @returns {Promise<Object>} Result
 */
export async function executeTool(toolName, params, context) {
  const system = getToolSystem();
  return await system.executeTool(toolName, params, context);
}

/**
 * Get available tools (convenience function)
 * @param {Object} filters - Filters
 * @returns {Array} Tools
 */
export function getAvailableTools(filters) {
  const system = getToolSystem();
  return system.getAvailableTools(filters);
}

/**
 * Discover tools (convenience function)
 * @param {string} query - Query
 * @returns {Array} Matching tools
 */
export function discoverTools(query) {
  const system = getToolSystem();
  return system.discoverTools(query);
}

// ============================================================================
// Exports
// ============================================================================

export {
  UnifiedToolSystem,
  ToolRegistry
};

export default getToolSystem;