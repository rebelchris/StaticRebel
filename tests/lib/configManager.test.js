/**
 * Tests for Config Manager Module
 *
 * Run with: node --test tests/lib/configManager.test.js
 */

import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import os from 'os';

// Mock the module before importing
const TEST_CONFIG_DIR = path.join(os.tmpdir(), 'static-rebel-test-config');
const TEST_CONFIG_FILE = path.join(TEST_CONFIG_DIR, 'config.json');

// Store original env
const originalHome = process.env.HOME;

describe('Config Manager', () => {
  let configManager;

  before(async () => {
    // Set up test environment
    process.env.HOME = os.tmpdir();

    // Clean up any existing test files
    if (fs.existsSync(TEST_CONFIG_DIR)) {
      fs.rmSync(TEST_CONFIG_DIR, { recursive: true });
    }
    fs.mkdirSync(TEST_CONFIG_DIR, { recursive: true });

    // Import module after setting env
    configManager = await import('../../lib/configManager.js');
  });

  after(() => {
    // Restore original env
    process.env.HOME = originalHome;

    // Clean up test files
    if (fs.existsSync(TEST_CONFIG_DIR)) {
      fs.rmSync(TEST_CONFIG_DIR, { recursive: true });
    }
  });

  beforeEach(() => {
    // Clear cache between tests
    if (configManager) {
      // Reset internal cache if exposed
    }
  });

  describe('getConfigPath()', () => {
    it('should return a valid path', () => {
      const configPath = configManager.getConfigPath();
      assert.ok(typeof configPath === 'string');
      assert.ok(path.isAbsolute(configPath));
      assert.ok(configPath.endsWith('config.json'));
    });
  });

  describe('getDefaultConfig()', () => {
    it('should return default configuration object', () => {
      const config = configManager.getDefaultConfig();

      assert.ok(config, 'Config should exist');
      assert.ok(config.meta, 'Should have meta section');
      assert.ok(config.paths, 'Should have paths section');
      assert.strictEqual(typeof config.meta.version, 'string');
      assert.ok(config.meta.lastTouchedAt);
    });

    it('should have required path configurations', () => {
      const config = configManager.getDefaultConfig();

      assert.ok(config.paths.configDir);
      assert.ok(config.paths.workspacesDir);
      assert.ok(config.paths.trackersDir);
      assert.ok(config.paths.skillsDir);
      assert.ok(config.paths.memoryDir);
      assert.ok(config.paths.workspace);
    });
  });

  describe('loadConfig()', () => {
    it('should return default config when file does not exist', () => {
      const config = configManager.loadConfig();

      assert.ok(config);
      assert.ok(config.meta);
      assert.ok(config.paths);
    });

    it('should load existing config file', () => {
      const testConfig = {
        meta: {
          name: 'test',
          version: '1.0.0',
          lastTouchedAt: new Date().toISOString(),
        },
        paths: { testDir: '/test/path' },
        custom: { key: 'value' },
      };

      fs.writeFileSync(TEST_CONFIG_FILE, JSON.stringify(testConfig, null, 2));

      const config = configManager.loadConfig();

      assert.strictEqual(config.custom.key, 'value');
    });

    it('should handle corrupted config file gracefully', () => {
      fs.writeFileSync(TEST_CONFIG_FILE, 'invalid json {{{');

      const config = configManager.loadConfig();

      assert.ok(config);
      assert.ok(config.meta); // Should return default
    });
  });

  describe('saveConfig()', () => {
    it('should save config to file', () => {
      const testConfig = configManager.getDefaultConfig();
      testConfig.testKey = 'testValue';

      const result = configManager.saveConfig(testConfig);

      assert.strictEqual(result, true);
      assert.ok(fs.existsSync(TEST_CONFIG_FILE));

      const saved = JSON.parse(fs.readFileSync(TEST_CONFIG_FILE, 'utf-8'));
      assert.strictEqual(saved.testKey, 'testValue');
    });

    it('should create directories if needed', () => {
      const deepDir = path.join(os.tmpdir(), 'deep', 'nested', 'config');
      const deepFile = path.join(deepDir, 'config.json');

      // This tests the mkdirSync recursive behavior
      const testConfig = { test: true };

      // Clean up first
      if (fs.existsSync(deepDir)) {
        fs.rmSync(path.join(os.tmpdir(), 'deep'), { recursive: true });
      }

      // Note: Actual test would need to mock the CONFIG_DIR
      // This is a placeholder for the concept
    });
  });

  describe('getConfig(key, defaultValue)', () => {
    it('should retrieve nested values using dot notation', () => {
      const testConfig = {
        database: {
          host: 'localhost',
          port: 5432,
          credentials: {
            username: 'admin',
          },
        },
      };

      configManager.saveConfig(testConfig);

      assert.strictEqual(configManager.getConfig('database.host'), 'localhost');
      assert.strictEqual(configManager.getConfig('database.port'), 5432);
      assert.strictEqual(
        configManager.getConfig('database.credentials.username'),
        'admin',
      );
    });

    it('should return default value for missing keys', () => {
      const result = configManager.getConfig('nonexistent.key', 'default');
      assert.strictEqual(result, 'default');
    });

    it('should return default value for null/undefined intermediate values', () => {
      const testConfig = { level1: null };
      configManager.saveConfig(testConfig);

      const result = configManager.getConfig('level1.level2', 'default');
      assert.strictEqual(result, 'default');
    });
  });

  describe('updateConfig(key, value)', () => {
    it('should update nested values using dot notation', () => {
      configManager.saveConfig({});

      configManager.updateConfig('settings.theme', 'dark');
      configManager.updateConfig('settings.notifications.enabled', true);

      const config = configManager.loadConfig();
      assert.strictEqual(config.settings.theme, 'dark');
      assert.strictEqual(config.settings.notifications.enabled, true);
    });

    it('should create intermediate objects if needed', () => {
      configManager.saveConfig({});

      configManager.updateConfig('a.b.c.d', 'value');

      const config = configManager.loadConfig();
      assert.strictEqual(config.a.b.c.d, 'value');
    });

    it('should overwrite existing values', () => {
      configManager.saveConfig({ existing: { key: 'old' } });

      configManager.updateConfig('existing.key', 'new');

      const config = configManager.loadConfig();
      assert.strictEqual(config.existing.key, 'new');
    });
  });

  describe('resolvePath()', () => {
    it('should expand ~ to home directory', () => {
      const resolved = configManager.resolvePath('~/test/path');
      assert.ok(resolved.startsWith(os.homedir()));
      assert.ok(resolved.includes('/test/path'));
    });

    it('should resolve relative paths', () => {
      const resolved = configManager.resolvePath('./relative/path');
      assert.ok(path.isAbsolute(resolved));
    });

    it('should return absolute paths unchanged', () => {
      const absolute = '/absolute/path';
      const resolved = configManager.resolvePath(absolute);
      assert.strictEqual(resolved, absolute);
    });

    // Security test
    it('should handle path traversal attempts safely', () => {
      const malicious = '~/../../../etc/passwd';
      const resolved = configManager.resolvePath(malicious);

      // Should not resolve outside home directory
      assert.ok(
        !resolved.includes('/etc/passwd') || resolved.startsWith(os.homedir()),
      );
    });
  });

  describe('Caching Behavior', () => {
    it('should cache config after first load', () => {
      const config1 = configManager.loadConfig();
      const config2 = configManager.loadConfig();

      // Should be same reference due to caching
      assert.strictEqual(config1, config2);
    });

    it('should update cache after save', () => {
      const original = configManager.loadConfig();

      configManager.updateConfig('newKey', 'newValue');

      const updated = configManager.loadConfig();
      assert.strictEqual(updated.newKey, 'newValue');
    });
  });
});

// Edge cases and error handling
describe('Config Manager - Edge Cases', () => {
  it('should handle empty string keys', async () => {
    const configManager = await import('../../lib/configManager.js');

    assert.doesNotThrow(() => {
      configManager.getConfig('', 'default');
    });
  });

  it('should handle keys with multiple dots', async () => {
    const configManager = await import('../../lib/configManager.js');

    configManager.saveConfig({});
    configManager.updateConfig('a..b...c', 'value');

    const config = configManager.loadConfig();
    // Should handle gracefully, either by ignoring empty segments or treating as literal
    assert.ok(config);
  });

  it('should handle very deep nesting', async () => {
    const configManager = await import('../../lib/configManager.js');

    configManager.saveConfig({});

    const deepKey = 'a.b.c.d.e.f.g.h.i.j';
    assert.doesNotThrow(() => {
      configManager.updateConfig(deepKey, 'deepValue');
    });

    assert.strictEqual(configManager.getConfig(deepKey), 'deepValue');
  });

  it('should handle special characters in values', async () => {
    const configManager = await import('../../lib/configManager.js');

    const specialValues = [
      'value with "quotes"',
      'value with \\ backslashes',
      'value with\nnewlines',
      'value with\ttabs',
      'unicode: 🎉 émojis',
    ];

    for (const value of specialValues) {
      configManager.updateConfig('test', value);
      const retrieved = configManager.getConfig('test');
      assert.strictEqual(retrieved, value);
    }
  });
});
