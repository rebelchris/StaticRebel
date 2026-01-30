import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { homedir } from 'os';

const CONFIG_DIR = path.join(homedir(), '.ollama-assistant');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

interface Config {
  ollama?: {
    baseUrl?: string;
    timeout?: number;
  };
  models?: {
    defaults?: {
      general?: string;
      coding?: string;
      analysis?: string;
      vision?: string;
    };
  };
  telegram?: {
    enabled?: boolean;
    botToken?: string;
  };
  heartbeat?: {
    enabled?: boolean;
    intervalMs?: number;
    quietHours?: {
      start?: string;
      end?: string;
    };
  };
  paths?: {
    configDir?: string;
    workspacesDir?: string;
    memoryDir?: string;
  };
}

async function ensureConfigDir() {
  try {
    await fs.mkdir(CONFIG_DIR, { recursive: true });
  } catch {
    // Directory may already exist
  }
}

async function loadConfig(): Promise<Config> {
  await ensureConfigDir();
  try {
    const data = await fs.readFile(CONFIG_FILE, 'utf-8');
    return JSON.parse(data);
  } catch {
    return getDefaultConfig();
  }
}

async function saveConfig(config: Config): Promise<void> {
  await ensureConfigDir();
  await fs.writeFile(CONFIG_FILE, JSON.stringify(config, null, 2));
}

function getDefaultConfig(): Config {
  return {
    ollama: {
      baseUrl: 'http://localhost:11434',
      timeout: 120000,
    },
    models: {
      defaults: {
        general: 'ollama/llama3.2',
        coding: 'ollama/qwen3-coder:latest',
        analysis: 'ollama/deepseek-r1:32b',
        vision: 'ollama/llava',
      },
    },
    telegram: {
      enabled: false,
      botToken: '',
    },
    heartbeat: {
      enabled: true,
      intervalMs: 1800000,
      quietHours: {
        start: '23:00',
        end: '08:00',
      },
    },
    paths: {
      configDir: CONFIG_DIR,
      workspacesDir: path.join(CONFIG_DIR, 'workspaces'),
      memoryDir: path.join(CONFIG_DIR, 'memory'),
    },
  };
}

// GET /api/config - Get full configuration
export async function GET() {
  try {
    const config = await loadConfig();
    return NextResponse.json({ config });
  } catch (error) {
    console.error('Failed to load config:', error);
    return NextResponse.json(
      { error: 'Failed to load configuration' },
      { status: 500 },
    );
  }
}

// PUT /api/config - Update full configuration
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { config } = body;

    if (!config || typeof config !== 'object') {
      return NextResponse.json(
        { error: 'Config object is required' },
        { status: 400 },
      );
    }

    await saveConfig(config);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to save config:', error);
    return NextResponse.json(
      { error: 'Failed to save configuration' },
      { status: 500 },
    );
  }
}

// PATCH /api/config - Update specific config section
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { section, data } = body;

    if (!section || typeof data !== 'object') {
      return NextResponse.json(
        { error: 'Section and data are required' },
        { status: 400 },
      );
    }

    const config = await loadConfig();
    (config as Record<string, unknown>)[section] = {
      ...((config as Record<string, unknown>)[section] as object),
      ...data,
    };
    await saveConfig(config);

    return NextResponse.json({ success: true, config });
  } catch (error) {
    console.error('Failed to update config section:', error);
    return NextResponse.json(
      { error: 'Failed to update configuration' },
      { status: 500 },
    );
  }
}
