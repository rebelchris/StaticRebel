// Config API - Configuration management endpoints
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

let configManager;

async function loadModules() {
  if (configManager) return;
  try {
    const configPath = path.join(__dirname, '..', '..', 'lib', 'configManager.js');
    const module = await import(configPath);
    configManager = module;
  } catch (error) {
    console.error('Error loading config module:', error.message);
  }
}

// Get full configuration
router.get('/', async (req, res) => {
  try {
    await loadModules();

    if (!configManager?.loadConfig) {
      return res.json({ config: getDefaultConfigStructure() });
    }

    const config = configManager.loadConfig();
    res.json({ config });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get specific config value
router.get('/:key', async (req, res) => {
  try {
    await loadModules();

    const { key } = req.params;

    if (!configManager?.getConfig) {
      return res.status(404).json({ error: 'Config not found' });
    }

    const value = configManager.getConfig(key);
    res.json({ key, value });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update configuration
router.put('/', async (req, res) => {
  try {
    await loadModules();

    const { config } = req.body;

    if (!config || typeof config !== 'object') {
      return res.status(400).json({ error: 'Config object is required' });
    }

    if (!configManager?.saveConfig) {
      return res.status(500).json({ error: 'Config system not available' });
    }

    const result = configManager.saveConfig(config);

    if (result) {
      configManager.clearConfigCache?.();
      req.app.locals.broadcast?.('configUpdated', { config });
      res.json({ success: true });
    } else {
      res.status(500).json({ error: 'Failed to save config' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update specific config key
router.put('/:key', async (req, res) => {
  try {
    await loadModules();

    const { key } = req.params;
    const { value } = req.body;

    if (!configManager?.updateConfig) {
      return res.status(500).json({ error: 'Config system not available' });
    }

    const result = configManager.updateConfig(key, value);

    if (result) {
      configManager.clearConfigCache?.();
      req.app.locals.broadcast?.('configUpdated', { key, value });
      res.json({ success: true, key, value });
    } else {
      res.status(500).json({ error: 'Failed to update config' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Reset to defaults
router.post('/reset', async (req, res) => {
  try {
    await loadModules();

    if (!configManager?.getDefaultConfig || !configManager?.saveConfig) {
      return res.status(500).json({ error: 'Config system not available' });
    }

    const defaultConfig = configManager.getDefaultConfig();
    const result = configManager.saveConfig(defaultConfig);

    if (result) {
      configManager.clearConfigCache?.();
      req.app.locals.broadcast?.('configReset', {});
      res.json({ success: true, message: 'Config reset to defaults' });
    } else {
      res.status(500).json({ error: 'Failed to reset config' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get config sections
router.get('/sections', async (req, res) => {
  try {
    await loadModules();

    const config = configManager?.loadConfig?.() || {};

    const sections = {
      meta: {
        name: 'System Information',
        keys: ['meta.name', 'meta.version', 'meta.lastTouchedAt'],
        description: 'Basic system information and version'
      },
      ollama: {
        name: 'Ollama Configuration',
        keys: ['ollama.baseUrl', 'ollama.apiKey', 'ollama.timeout'],
        description: 'Ollama server settings'
      },
      models: {
        name: 'Model Settings',
        keys: ['models.defaults.general', 'models.defaults.coding', 'models.defaults.analysis', 'models.defaults.vision', 'models.defaults.embeddings'],
        description: 'Default models for different task types'
      },
      telegram: {
        name: 'Telegram Bot',
        keys: ['telegram.enabled', 'telegram.botToken'],
        description: 'Telegram integration settings'
      },
      heartbeat: {
        name: 'Heartbeat Monitor',
        keys: ['heartbeat.enabled', 'heartbeat.intervalMs', 'heartbeat.quietHours'],
        description: 'System monitoring settings'
      },
      memory: {
        name: 'Memory Settings',
        keys: ['memory.compactionInterval'],
        description: 'Memory management configuration'
      },
      paths: {
        name: 'Paths',
        keys: ['paths.configDir', 'paths.workspacesDir', 'paths.memoryDir'],
        description: 'File paths used by the system'
      }
    };

    res.json({ sections, currentValues: config });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Export config
router.get('/export', async (req, res) => {
  try {
    await loadModules();

    const config = configManager?.loadConfig?.() || {};

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', 'attachment; filename="config.json"');
    res.json(config);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Helper function for default config structure
function getDefaultConfigStructure() {
  return {
    meta: {
      name: 'ollama-assistant',
      version: '2026.1.28-1'
    },
    ollama: {
      baseUrl: 'http://localhost:11434',
      timeout: 120000
    },
    models: {
      defaults: {
        general: 'ollama/llama3.2',
        coding: 'ollama/qwen3-coder:latest',
        analysis: 'ollama/deepseek-r1:32b'
      }
    },
    telegram: {
      enabled: false
    },
    heartbeat: {
      enabled: true,
      intervalMs: 1800000
    }
  };
}

export default router;
