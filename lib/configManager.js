// Configuration Manager
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_DIR = path.join(os.homedir(), '.static-rebel', 'config');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

let configCache = null;

export function getConfigPath() {
  return CONFIG_FILE;
}

export function getConfigDir() {
  return CONFIG_DIR;
}

export function loadConfig() {
  if (configCache) {
    return configCache;
  }

  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const data = fs.readFileSync(CONFIG_FILE, 'utf-8');
      configCache = JSON.parse(data);
      return configCache;
    }
  } catch (e) {
    console.error('Failed to load config:', e.message);
  }

  // Return default config structure
  return getDefaultConfig();
}

export function saveConfig(config) {
  try {
    const dir = path.dirname(CONFIG_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
    configCache = config;
    return true;
  } catch (e) {
    console.error('Failed to save config:', e.message);
    return false;
  }
}

export function updateConfig(key, value) {
  const config = loadConfig();
  const keys = key.split('.');
  let current = config;

  for (let i = 0; i < keys.length - 1; i++) {
    if (!current[keys[i]]) {
      current[keys[i]] = {};
    }
    current = current[keys[i]];
  }

  current[keys[keys.length - 1]] = value;
  return saveConfig(config);
}

export function getConfig(key, defaultValue = null) {
  const config = loadConfig();
  const keys = key.split('.');
  let current = config;

  for (const k of keys) {
    if (current === undefined || current === null) {
      return defaultValue;
    }
    current = current[k];
  }

  return current !== undefined ? current : defaultValue;
}

export function getDefaultConfig() {
  return {
    meta: {
      name: 'static-rebel',
      version: '2026.1.28-1',
      lastTouchedAt: new Date().toISOString()
    },
    paths: {
      configDir: CONFIG_DIR,
      workspacesDir: path.join(os.homedir(), '.static-rebel', 'workspaces'),
      trackersDir: path.join(os.homedir(), '.static-rebel', 'trackers'),
      skillsDir: path.join(os.homedir(), '.static-rebel', 'skills'),
      memoryDir: path.join(os.homedir(), '.static-rebel', 'memory'),
      workspace: path.join(os.homedir(), 'static-rebel-workspace')
    },
    ollama: {
      baseUrl: 'http://localhost:11434',
      apiKey: 'ollama-local',
      timeout: 120000
    },
    models: {
      providers: {
        ollama: {
          baseUrl: 'http://localhost:11434',
          models: []
        }
      },
      defaults: {
        general: 'ollama/llama3.2',
        coding: 'ollama/qwen3-coder:latest',
        analysis: 'ollama/deepseek-r1:32b',
        vision: 'ollama/llava',
        embeddings: 'ollama/nomic-embed-text'
      }
    },
    agents: {
      defaults: {
        model: 'ollama/llama3.2',
        maxConcurrent: 4,
        subagents: {
          maxConcurrent: 8,
          allowed: []
        }
      },
      list: []
    },
    telegram: {
      enabled: false,
      botToken: null
    },
    heartbeat: {
      enabled: true,
      intervalMs: 1800000,
      quietHours: { start: '23:00', end: '08:00' }
    },
    cron: { version: 1, jobs: [] },
    memory: {
      dailyDir: path.join(os.homedir(), '.static-rebel', 'memory', 'daily'),
      longTermFile: path.join(os.homedir(), '.static-rebel', 'memory', 'long-term.md'),
      compactionInterval: 100
    },
    skills: { install: { nodeManager: 'npm' }, autoLoad: true },
    hooks: { boot: true, sessionMemory: true, commandLogger: true }
  };
}

export function resolvePath(pathStr) {
  return pathStr.replace('~', os.homedir());
}

export function clearConfigCache() {
  configCache = null;
}
