/**
 * Dynamic Tools Manager - Hot-reload for API Connectors
 * Part of PLAN3: Smart Connectors - API Discovery Loop
 *
 * Automatically discovers and loads API connectors from the skills/tools directory
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CONFIG_DIR = path.join(os.homedir(), '.static-rebel');
const TOOLS_DIR = path.join(CONFIG_DIR, 'tools');

// Dynamic tools registry
const dynamicTools = new Map();
const toolHandlers = new Map();

// File watcher for hot-reload
let fileWatcher = null;

/**
 * Initialize dynamic tools system
 */
export function initDynamicTools() {
  // Create tools directory if needed
  if (!fs.existsSync(TOOLS_DIR)) {
    fs.mkdirSync(TOOLS_DIR, { recursive: true });
  }

  // Load all existing tools
  loadAllTools();

  // Start file watcher for hot-reload
  startFileWatcher();

  console.log(`[DynamicTools] Initialized with ${dynamicTools.size} tools`);
}

/**
 * Load all tools from the tools directory
 */
export function loadAllTools() {
  try {
    const files = fs.readdirSync(TOOLS_DIR);

    const loadPromises = [];

    for (const file of files) {
      const filePath = path.join(TOOLS_DIR, file);

      // Load .js files as tools
      if (file.endsWith('.js') && fs.statSync(filePath).isFile()) {
        loadPromises.push(loadTool(filePath, file));
      }

      // Load .json files as API specs (OpenAPI/Swagger)
      if ((file.endsWith('.json') || file.endsWith('.yaml') || file.endsWith('.yml')) &&
          fs.statSync(filePath).isFile()) {
        loadPromises.push(loadApiSpec(filePath, file));
      }
    }

    // Wait for all async loads to complete
    Promise.all(loadPromises).catch(e => {
      console.error(`[DynamicTools] Load error: ${e.message}`);
    });
  } catch (e) {
    console.error(`[DynamicTools] Failed to load tools: ${e.message}`);
  }
}

/**
 * Load a single tool from a JS file
 */
async function loadTool(filePath, fileName) {
  try {
    const toolName = fileName.replace('.js', '');
    // Use eval to prevent webpack from parsing the dynamic import
    const loadModule = eval('(async (p) => { const m = await import("file://" + p); return m; })');
    const module = await loadModule(filePath);

    // Look for default export or named exports
    const tool = module.default || module;

    if (tool && tool.name) {
      dynamicTools.set(tool.name, {
        ...tool,
        source: 'file',
        path: filePath,
        loadedAt: new Date().toISOString()
      });

      // Register handler if present
      if (tool.handler) {
        toolHandlers.set(tool.name, tool.handler);
      }

      console.log(`[DynamicTools] Loaded tool: ${tool.name}`);
    }
  } catch (e) {
    console.error(`[DynamicTools] Failed to load tool ${filePath}: ${e.message}`);
  }
}

/**
 * Load an API spec (OpenAPI/Swagger) and generate a tool
 */
async function loadApiSpec(filePath, fileName) {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const spec = JSON.parse(content);

    // Generate tool from OpenAPI spec
    const toolName = spec.info?.title?.toLowerCase().replace(/\s+/g, '_') || fileName.replace(/\.(json|yaml|yml)$/, '');

    const tool = {
      name: toolName,
      description: spec.info?.description || `API client for ${spec.info?.title}`,
      version: spec.info?.version || '1.0.0',
      type: 'openapi',
      spec,
      endpoints: Object.keys(spec.paths || {}),
      source: 'openapi',
      path: filePath,
      loadedAt: new Date().toISOString(),

      // Generated handler
      async handler(params) {
        return await callOpenApiEndpoint(spec, params);
      }
    };

    dynamicTools.set(toolName, tool);
    console.log(`[DynamicTools] Loaded OpenAPI spec: ${toolName} (${tool.endpoints.length} endpoints)`);
  } catch (e) {
    console.error(`[DynamicTools] Failed to load API spec ${filePath}: ${e.message}`);
  }
}

/**
 * Call an OpenAPI endpoint based on params
 */
async function callOpenApiEndpoint(spec, params) {
  const { endpoint, method = 'GET', data = {} } = params;

  if (!endpoint) {
    return { error: 'endpoint parameter required' };
  }

  // Find matching path in spec
  const pathSpec = spec.paths?.[endpoint];
  if (!pathSpec) {
    return { error: `Endpoint ${endpoint} not found in spec` };
  }

  const methodSpec = pathSpec[method.toLowerCase()];
  if (!methodSpec) {
    return { error: `Method ${method} not supported for ${endpoint}` };
  }

  // Build URL
  let url = spec.servers?.[0]?.url || '';
  url += endpoint;

  // Substitute path parameters
  const pathParams = endpoint.match(/\{([^}]+)\}/g) || [];
  for (const param of pathParams) {
    const paramName = param.slice(1, -1);
    if (data[paramName]) {
      url = url.replace(param, encodeURIComponent(data[paramName]));
    }
  }

  // Build request options
  const options = {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(spec.security?.length ? { 'Authorization': 'Bearer TOKEN' } : {})
    }
  };

  // Add query/body parameters
  if (['POST', 'PUT', 'PATCH'].includes(method) && data.body) {
    options.body = JSON.stringify(data.body);
  } else if (Object.keys(data).length > 0) {
    const queryParams = new URLSearchParams();
    for (const [key, value] of Object.entries(data)) {
      if (!pathParams.includes(`{${key}}`)) {
        queryParams.append(key, value);
      }
    }
    url += `?${queryParams.toString()}`;
  }

  // Make request
  try {
    const response = await fetch(url, options);
    const result = await response.json();
    return { success: true, data: result, status: response.status };
  } catch (e) {
    return { error: e.message };
  }
}

/**
 * Start file system watcher for hot-reload
 */
function startFileWatcher() {
  try {
    fileWatcher = fs.watch(TOOLS_DIR, (eventType, filename) => {
      if (eventType === 'change' || eventType === 'add') {
        console.log(`[DynamicTools] Detected change: ${filename}`);

        // Debounce reloads
        debouncedReload();
      }
    });
  } catch (e) {
    console.error(`[DynamicTools] Failed to start file watcher: ${e.message}`);
  }
}

// Debounce timer for reload
let reloadTimer = null;
function debouncedReload() {
  if (reloadTimer) clearTimeout(reloadTimer);
  reloadTimer = setTimeout(() => {
    console.log('[DynamicTools] Hot-reloading tools...');
    loadAllTools();
    reloadTimer = null;
  }, 1000);
}

/**
 * Get all available dynamic tools
 */
export function getDynamicTools() {
  return Array.from(dynamicTools.values());
}

/**
 * Get a specific tool by name
 */
export function getTool(name) {
  return dynamicTools.get(name) || null;
}

/**
 * Call a dynamic tool
 */
export async function callTool(name, params = {}) {
  const tool = dynamicTools.get(name);
  if (!tool) {
    return { error: `Tool '${name}' not found` };
  }

  try {
    if (tool.handler) {
      return await tool.handler(params);
    }
    if (tool.type === 'openapi') {
      return await callOpenApiEndpoint(tool.spec, params);
    }
    return { error: 'Tool has no handler' };
  } catch (e) {
    return { error: e.message };
  }
}

/**
 * Create a new tool from OpenAPI spec URL
 */
export async function createToolFromUrl(url, name = null) {
  try {
    const response = await fetch(url);
    const spec = await response.json();

    // Generate filename
    const fileName = (name || spec.info?.title?.toLowerCase().replace(/\s+/g, '_') || 'api') + '.json';
    const filePath = path.join(TOOLS_DIR, fileName);

    // Save spec
    fs.writeFileSync(filePath, JSON.stringify(spec, null, 2));

    // Load it
    loadApiSpec(filePath, fileName);

    return { success: true, name: fileName.replace('.json', ''), path: filePath };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

/**
 * Register a custom tool at runtime
 */
export function registerTool(tool) {
  if (!tool.name) {
    return { success: false, error: 'Tool must have a name' };
  }

  dynamicTools.set(tool.name, {
    ...tool,
    source: 'runtime',
    loadedAt: new Date().toISOString()
  });

  if (tool.handler) {
    toolHandlers.set(tool.name, tool.handler);
  }

  return { success: true, name: tool.name };
}

/**
 * Unregister a tool
 */
export function unregisterTool(name) {
  dynamicTools.delete(name);
  toolHandlers.delete(name);
  return { success: true };
}

/**
 * Stop file watcher
 */
export function stopFileWatcher() {
  if (fileWatcher) {
    fileWatcher.close();
    fileWatcher = null;
  }
}

/**
 * Get tool statistics
 */
export function getToolStats() {
  return {
    totalTools: dynamicTools.size,
    bySource: {
      file: Array.from(dynamicTools.values()).filter(t => t.source === 'file').length,
      openapi: Array.from(dynamicTools.values()).filter(t => t.source === 'openapi').length,
      runtime: Array.from(dynamicTools.values()).filter(t => t.source === 'runtime').length
    },
    tools: Array.from(dynamicTools.keys())
  };
}

export default {
  initDynamicTools,
  getDynamicTools,
  getTool,
  callTool,
  registerTool,
  unregisterTool,
  createToolFromUrl,
  getToolStats,
  stopFileWatcher
};
