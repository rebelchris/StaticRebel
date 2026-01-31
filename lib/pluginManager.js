/**
 * Plugin Manager - Extensible plugin system for StaticRebel
 *
 * Features:
 * - Drop-in tool registration
 * - Versioned capabilities
 * - Declarative permissions
 * - Hot-reload support
 */

import { EventEmitter } from 'events';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import os from 'os';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ============================================================================
// Types & Interfaces
// ============================================================================

/**
 * @typedef {Object} Plugin
 * @property {string} name - Plugin name
 * @property {string} version - Plugin version (semver)
 * @property {string} description - Plugin description
 * @property {string} author - Plugin author
 * @property {string[]} capabilities - Capabilities provided
 * @property {PluginPermission[]} permissions - Required permissions
 * @property {PluginTool[]} tools - Tools provided by plugin
 * @property {Function} [init] - Initialization function
 * @property {Function} [destroy] - Cleanup function
 * @property {Object} [config] - Default configuration
 */

/**
 * @typedef {Object} PluginPermission
 * @property {string} type - 'filesystem' | 'network' | 'shell' | 'memory'
 * @property {string} description - What the permission allows
 * @property {string} [path] - Specific path for filesystem permissions
 * @property {string} [host] - Specific host for network permissions
 * @property {boolean} required - Whether permission is required
 */

/**
 * @typedef {Object} PluginTool
 * @property {string} name - Tool name
 * @property {string} description - Tool description
 * @property {Function} handler - Tool implementation
 * @property {Object} inputSchema - Input validation schema
 * @property {number} autonomyLevel - Required autonomy level
 */

/**
 * @typedef {Object} PluginManifest
 * @property {string} name - Plugin name
 * @property {string} version - Plugin version
 * @property {string} main - Entry point file
 * @property {string[]} dependencies - Plugin dependencies
 * @property {PluginPermission[]} permissions - Required permissions
 */

// ============================================================================
// Plugin Manager Class
// ============================================================================

export class PluginManager extends EventEmitter {
  constructor(options = {}) {
    super();

    this.plugins = new Map();
    this.tools = new Map();
    this.capabilities = new Map();
    this.hooks = new Map();

    this.config = {
      pluginDir:
        options.pluginDir ||
        path.join(os.homedir(), '.static-rebel', 'plugins'),
      builtinDir: options.builtinDir || path.join(__dirname, '../plugins'),
      autoLoad: options.autoLoad !== false,
      hotReload: options.hotReload || false,
      strictPermissions: options.strictPermissions !== false,
      ...options,
    };

    this.fileWatchers = new Map();

    if (this.config.autoLoad) {
      this.init();
    }
  }

  /**
   * Initialize the plugin manager
   */
  async init() {
    // Ensure plugin directories exist
    await this.ensureDirectories();

    // Load builtin plugins
    await this.loadBuiltinPlugins();

    // Load user plugins
    await this.loadUserPlugins();

    this.emit('initialized', {
      plugins: this.plugins.size,
      tools: this.tools.size,
    });
  }

  /**
   * Ensure plugin directories exist
   */
  async ensureDirectories() {
    try {
      await fs.mkdir(this.config.pluginDir, { recursive: true });
    } catch (error) {
      this.emit('error', { type: 'mkdir', error });
    }
  }

  /**
   * Load builtin plugins
   */
  async loadBuiltinPlugins() {
    try {
      await fs.access(this.config.builtinDir);
    } catch {
      // No builtin plugins directory
      return;
    }

    const entries = await fs.readdir(this.config.builtinDir, {
      withFileTypes: true,
    });

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const pluginPath = path.join(this.config.builtinDir, entry.name);
        await this.loadPlugin(pluginPath, 'builtin');
      }
    }
  }

  /**
   * Load user plugins
   */
  async loadUserPlugins() {
    try {
      const entries = await fs.readdir(this.config.pluginDir, {
        withFileTypes: true,
      });

      for (const entry of entries) {
        if (entry.isDirectory()) {
          const pluginPath = path.join(this.config.pluginDir, entry.name);
          await this.loadPlugin(pluginPath, 'user');
        }
      }
    } catch (error) {
      // No user plugins yet
    }
  }

  /**
   * Load a plugin from a directory
   */
  async loadPlugin(pluginPath, source = 'user') {
    try {
      // Read manifest
      const manifestPath = path.join(pluginPath, 'manifest.json');
      let manifest;

      try {
        const manifestContent = await fs.readFile(manifestPath, 'utf-8');
        manifest = JSON.parse(manifestContent);
      } catch {
        // Try to load from package.json
        const packagePath = path.join(pluginPath, 'package.json');
        const packageContent = await fs.readFile(packagePath, 'utf-8');
        const pkg = JSON.parse(packageContent);

        manifest = {
          name: pkg.name,
          version: pkg.version,
          description: pkg.description,
          main: pkg.main || 'index.js',
          permissions: pkg.staticRebel?.permissions || [],
        };
      }

      // Validate manifest
      if (!manifest.name || !manifest.version) {
        throw new Error('Plugin manifest must have name and version');
      }

      // Check if already loaded
      if (this.plugins.has(manifest.name)) {
        const existing = this.plugins.get(manifest.name);
        if (existing.version === manifest.version) {
          this.emit('plugin:skipped', {
            name: manifest.name,
            reason: 'already_loaded',
          });
          return;
        }

        // Unload old version
        await this.unloadPlugin(manifest.name);
      }

      // Load plugin module
      const mainPath = path.join(pluginPath, manifest.main || 'index.js');
      // Use eval to prevent webpack from parsing the dynamic import
      const loadModule = eval('(async (p) => { const m = await import("file://" + p); return m; })');
      const module = await loadModule(mainPath);

      const plugin = {
        ...manifest,
        source,
        path: pluginPath,
        module,
        loadedAt: new Date(),
        tools: new Map(),
      };

      // Initialize plugin if init function exists
      if (module.init && typeof module.init === 'function') {
        const initResult = await module.init({
          config: this.config,
          registerTool: (tool) => this.registerPluginTool(plugin, tool),
          registerHook: (event, handler) =>
            this.registerHook(plugin, event, handler),
          emit: (event, data) =>
            this.emit(`plugin:${manifest.name}:${event}`, data),
        });

        plugin.initResult = initResult;
      }

      // Auto-register tools from module exports
      if (module.tools) {
        for (const tool of module.tools) {
          this.registerPluginTool(plugin, tool);
        }
      }

      // Store plugin
      this.plugins.set(manifest.name, plugin);

      // Register capabilities
      if (manifest.capabilities) {
        for (const capability of manifest.capabilities) {
          this.capabilities.set(capability, {
            plugin: manifest.name,
            version: manifest.version,
          });
        }
      }

      // Setup hot reload if enabled
      if (this.config.hotReload) {
        this.setupHotReload(plugin);
      }

      this.emit('plugin:loaded', {
        name: manifest.name,
        version: manifest.version,
        source,
        tools: plugin.tools.size,
      });

      return plugin;
    } catch (error) {
      this.emit('plugin:error', { path: pluginPath, error });
      throw error;
    }
  }

  /**
   * Register a tool from a plugin
   */
  registerPluginTool(plugin, tool) {
    if (!tool.name || !tool.handler) {
      throw new Error('Tool must have name and handler');
    }

    const fullName = `${plugin.name}:${tool.name}`;

    const toolDef = {
      ...tool,
      plugin: plugin.name,
      fullName,
      registeredAt: new Date(),
    };

    this.tools.set(fullName, toolDef);
    plugin.tools.set(tool.name, toolDef);

    this.emit('tool:registered', {
      name: fullName,
      plugin: plugin.name,
    });
  }

  /**
   * Register a hook from a plugin
   */
  registerHook(plugin, event, handler) {
    if (!this.hooks.has(event)) {
      this.hooks.set(event, []);
    }

    this.hooks.get(event).push({
      plugin: plugin.name,
      handler,
    });
  }

  /**
   * Unload a plugin
   */
  async unloadPlugin(name) {
    const plugin = this.plugins.get(name);
    if (!plugin) {
      return false;
    }

    // Call destroy function if exists
    if (plugin.module?.destroy && typeof plugin.module.destroy === 'function') {
      try {
        await plugin.module.destroy();
      } catch (error) {
        this.emit('plugin:destroy_error', { name, error });
      }
    }

    // Unregister tools
    for (const [toolName, tool] of plugin.tools) {
      this.tools.delete(tool.fullName);
      this.emit('tool:unregistered', {
        name: tool.fullName,
        plugin: name,
      });
    }

    // Unregister hooks
    for (const [event, handlers] of this.hooks) {
      this.hooks.set(
        event,
        handlers.filter((h) => h.plugin !== name),
      );
    }

    // Remove capabilities
    for (const [capability, info] of this.capabilities) {
      if (info.plugin === name) {
        this.capabilities.delete(capability);
      }
    }

    // Remove file watcher
    if (this.fileWatchers.has(name)) {
      this.fileWatchers.get(name).close();
      this.fileWatchers.delete(name);
    }

    // Remove plugin
    this.plugins.delete(name);

    this.emit('plugin:unloaded', { name });

    return true;
  }

  /**
   * Setup hot reload for a plugin
   */
  setupHotReload(plugin) {
    try {
      const { watch } = require('fs');

      const watcher = watch(
        plugin.path,
        { recursive: true },
        (eventType, filename) => {
          // Debounce reload
          clearTimeout(plugin.reloadTimeout);
          plugin.reloadTimeout = setTimeout(() => {
            this.emit('plugin:hot_reload', { name: plugin.name });
            this.unloadPlugin(plugin.name);
            this.loadPlugin(plugin.path, plugin.source);
          }, 500);
        },
      );

      this.fileWatchers.set(plugin.name, watcher);
    } catch (error) {
      this.emit('plugin:watch_error', { name: plugin.name, error });
    }
  }

  /**
   * Execute a hook
   */
  async executeHook(event, data) {
    const handlers = this.hooks.get(event) || [];
    const results = [];

    for (const { plugin, handler } of handlers) {
      try {
        const result = await handler(data);
        results.push({ plugin, result, success: true });
      } catch (error) {
        results.push({ plugin, error, success: false });
      }
    }

    return results;
  }

  /**
   * Get a plugin
   */
  getPlugin(name) {
    return this.plugins.get(name);
  }

  /**
   * Get a tool
   */
  getTool(name) {
    return this.tools.get(name);
  }

  /**
   * Execute a plugin tool
   */
  async executeTool(name, params, context = {}) {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new Error(`Tool not found: ${name}`);
    }

    // Check permissions if strict mode
    if (this.config.strictPermissions) {
      const plugin = this.plugins.get(tool.plugin);
      const permissionCheck = await this.checkPermissions(plugin, params);
      if (!permissionCheck.allowed) {
        throw new Error(`Permission denied: ${permissionCheck.reason}`);
      }
    }

    this.emit('tool:executing', { name, params });

    try {
      const result = await tool.handler(params, context);
      this.emit('tool:completed', { name, result });
      return result;
    } catch (error) {
      this.emit('tool:error', { name, error });
      throw error;
    }
  }

  /**
   * Check plugin permissions
   */
  async checkPermissions(plugin, params) {
    if (!plugin.permissions) {
      return { allowed: true };
    }

    for (const permission of plugin.permissions) {
      if (!permission.required) continue;

      switch (permission.type) {
        case 'filesystem':
          if (permission.path && params.path) {
            const allowed = params.path.startsWith(permission.path);
            if (!allowed) {
              return {
                allowed: false,
                reason: `Path ${params.path} is outside allowed directory ${permission.path}`,
              };
            }
          }
          break;

        case 'network':
          if (permission.host && params.url) {
            const url = new URL(params.url);
            const allowed = url.hostname === permission.host;
            if (!allowed) {
              return {
                allowed: false,
                reason: `Host ${url.hostname} is not allowed`,
              };
            }
          }
          break;
      }
    }

    return { allowed: true };
  }

  /**
   * List all plugins
   */
  listPlugins() {
    return Array.from(this.plugins.values()).map((p) => ({
      name: p.name,
      version: p.version,
      description: p.description,
      source: p.source,
      tools: p.tools.size,
      loadedAt: p.loadedAt,
    }));
  }

  /**
   * List all tools
   */
  listTools() {
    return Array.from(this.tools.values()).map((t) => ({
      name: t.fullName,
      plugin: t.plugin,
      description: t.description,
      autonomyLevel: t.autonomyLevel,
    }));
  }

  /**
   * List capabilities
   */
  listCapabilities() {
    return Array.from(this.capabilities.entries()).map(([name, info]) => ({
      name,
      plugin: info.plugin,
      version: info.version,
    }));
  }

  /**
   * Check if a capability is available
   */
  hasCapability(name) {
    return this.capabilities.has(name);
  }

  /**
   * Get plugin providing a capability
   */
  getCapabilityProvider(name) {
    const info = this.capabilities.get(name);
    if (!info) return null;
    return this.plugins.get(info.plugin);
  }

  /**
   * Install a plugin from a URL or path
   */
  async installPlugin(source, options = {}) {
    this.emit('plugin:installing', { source });

    try {
      // This is a placeholder - actual implementation would
      // download from npm, git, or local path

      if (source.startsWith('http')) {
        // Download from URL
        throw new Error('URL installation not yet implemented');
      } else if (source.startsWith('npm:')) {
        // Install from npm
        throw new Error('NPM installation not yet implemented');
      } else {
        // Local path
        const targetPath = path.join(
          this.config.pluginDir,
          path.basename(source),
        );
        await fs.cp(source, targetPath, { recursive: true });

        const plugin = await this.loadPlugin(targetPath, 'user');

        this.emit('plugin:installed', {
          name: plugin.name,
          source,
          path: targetPath,
        });

        return plugin;
      }
    } catch (error) {
      this.emit('plugin:install_error', { source, error });
      throw error;
    }
  }

  /**
   * Uninstall a plugin
   */
  async uninstallPlugin(name) {
    const plugin = this.plugins.get(name);
    if (!plugin) {
      throw new Error(`Plugin not found: ${name}`);
    }

    await this.unloadPlugin(name);

    // Remove files if user plugin
    if (plugin.source === 'user') {
      try {
        await fs.rm(plugin.path, { recursive: true });
      } catch (error) {
        this.emit('plugin:uninstall_error', { name, error });
      }
    }

    this.emit('plugin:uninstalled', { name });
  }

  /**
   * Get plugin statistics
   */
  getStats() {
    return {
      plugins: this.plugins.size,
      tools: this.tools.size,
      capabilities: this.capabilities.size,
      hooks: this.hooks.size,
      bySource: {
        builtin: Array.from(this.plugins.values()).filter(
          (p) => p.source === 'builtin',
        ).length,
        user: Array.from(this.plugins.values()).filter(
          (p) => p.source === 'user',
        ).length,
      },
    };
  }

  /**
   * Destroy the plugin manager
   */
  async destroy() {
    // Unload all plugins
    for (const name of this.plugins.keys()) {
      await this.unloadPlugin(name);
    }

    this.plugins.clear();
    this.tools.clear();
    this.capabilities.clear();
    this.hooks.clear();

    this.emit('destroyed');
  }
}

// ============================================================================
// Factory Function
// ============================================================================

export function createPluginManager(options = {}) {
  return new PluginManager(options);
}

// ============================================================================
// Default Export
// ============================================================================

export default PluginManager;
