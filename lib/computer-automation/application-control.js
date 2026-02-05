/**
 * Application Controller
 *
 * Control macOS applications:
 * - Launch applications
 * - Quit applications
 * - Switch between applications
 * - Get running applications
 * - Get application information
 */

import { spawn } from 'child_process';
import { PRESET_SCRIPTS, createAppleScriptExecutor } from './apple-script.js';

const BUNDLE_ID_MAP = {
  'safari': 'com.apple.safari',
  'chrome': 'com.google.Chrome',
  'firefox': 'org.mozilla.firefox',
  'finder': 'com.apple.finder',
  'terminal': 'com.apple.terminal',
  'iterm': 'com.googlecode.iterm2',
  'vscode': 'com.microsoft.VSCode',
  'slack': 'com.tinyspeck.slackmacgap',
  'discord': 'com.hnc.Discord',
  'spotify': 'com.spotify.client',
  'music': 'com.apple.music',
  'photos': 'com.apple.photos',
  'notes': 'com.apple.Notes',
  'calendar': 'com.apple.iCal',
  'mail': 'com.apple.mail',
  'messages': 'com.apple.iChat',
  'facetime': 'com.apple.FaceTime',
  'settings': 'com.apple.systempreferences',
  'system preferences': 'com.apple.systempreferences',
  'photoshop': 'com.adobe.Photoshop',
  'illustrator': 'com.adobe.illustrator',
  'xcode': 'com.apple.dt.Xcode',
  'skype': 'com.skype.skype',
  'zoom': 'us.zoom.xos',
  'skype for business': 'com.microsoft.SkypeForBusiness',
  'outlook': 'com.microsoft.Outlook',
  'word': 'com.microsoft.Word',
  'excel': 'com.microsoft.Excel',
  'powerpoint': 'com.microsoft.PowerPoint',
  'preview': 'com.apple.preview',
  'textedit': 'com.apple.TextEdit',
  'app store': 'com.apple.AppStore',
  'launchpad': 'com.apple.launchpad.launcher',
  'dashboard': 'com.apple.dashboard',
  'mission control': 'com.apple.dock.extras',
};

export class AppController {
  constructor(options = {}) {
    this.safety = options.safety || null;
    this.timeout = options.timeout || 30000;
    this.appleScript = createAppleScriptExecutor({ safety: this.safety, timeout: this.timeout });
    this.executionHistory = [];
    this.knownApps = new Map();
  }

  async launch(appName, options = {}) {
    const executionId = `launch-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const result = {
      executionId,
      success: false,
      appName,
      bundleId: null,
      output: '',
      error: '',
      duration: 0,
      timestamp: new Date(),
    };

    try {
      if (this.safety) {
        const safetyCheck = await this.safety.check({
          type: 'launch_app',
          name: appName,
        });

        if (!safetyCheck.allowed) {
          throw new Error(`Safety check failed: ${safetyCheck.errors.join(', ')}`);
        }

        if (safetyCheck.requiresConfirmation && !options.skipConfirmation) {
          result.needsConfirmation = true;
          result.warnings = safetyCheck.warnings;
          return result;
        }
      }

      if (options.dryRun || (this.safety?.dryRun)) {
        result.success = true;
        result.output = `[DRY-RUN] Would launch: ${appName}`;
        result.dryRun = true;
        this.logExecution(result);
        return result;
      }

      const bundleId = this.getBundleId(appName);
      result.bundleId = bundleId;

      let script;
      if (bundleId) {
        script = `
          tell application id "${bundleId}"
            activate
          end tell
        `;
      } else {
        script = PRESET_SCRIPTS.launchApp(appName);
      }

      const startTime = Date.now();
      const executionResult = await this.appleScript.execute(script, { timeout: this.timeout });
      result.duration = Date.now() - startTime;

      result.success = executionResult.success;
      result.output = executionResult.output || `Launched ${appName}`;

      if (!executionResult.success) {
        const openResult = await this.launchWithOpen(appName);
        result.success = openResult.success;
        result.output = openResult.output || result.output;
        result.fallback = openResult.fallback;
      }
    } catch (error) {
      result.error = error.message;
    }

    this.logExecution(result);

    return result;
  }

  async launchWithOpen(appName) {
    return new Promise((resolve) => {
      const child = spawn('open', ['-a', appName], {
        shell: false,
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';

      const timeout = setTimeout(() => {
        child.kill('SIGTERM');
        resolve({ success: false, output: '', fallback: 'timeout' });
      }, 10000);

      child.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('close', (code) => {
        clearTimeout(timeout);
        resolve({
          success: code === 0,
          output: stdout.trim() || stderr.trim(),
          fallback: 'open',
        });
      });

      child.on('error', (error) => {
        clearTimeout(timeout);
        resolve({ success: false, output: error.message, fallback: 'error' });
      });
    });
  }

  async quit(appName, options = {}) {
    const executionId = `quit-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const result = {
      executionId,
      success: false,
      appName,
      bundleId: null,
      output: '',
      error: '',
      duration: 0,
      timestamp: new Date(),
    };

    try {
      if (this.safety) {
        const safetyCheck = await this.safety.check({
          type: 'quit_app',
          name: appName,
        });

        if (!safetyCheck.allowed) {
          throw new Error(`Safety check failed: ${safetyCheck.errors.join(', ')}`);
        }

        if (safetyCheck.requiresConfirmation && !options.skipConfirmation) {
          result.needsConfirmation = true;
          result.warnings = safetyCheck.warnings;
          return result;
        }
      }

      if (options.dryRun || (this.safety?.dryRun)) {
        result.success = true;
        result.output = `[DRY-RUN] Would quit: ${appName}`;
        result.dryRun = true;
        this.logExecution(result);
        return result;
      }

      const bundleId = this.getBundleId(appName);
      result.bundleId = bundleId;

      let script;
      if (bundleId) {
        script = `
          tell application id "${bundleId}"
            if running then
              quit
            end if
          end tell
        `;
      } else {
        script = PRESET_SCRIPTS.quitApp(appName);
      }

      const startTime = Date.now();
      const executionResult = await this.appleScript.execute(script, { timeout: this.timeout });
      result.duration = Date.now() - startTime;

      result.success = executionResult.success;
      result.output = executionResult.success
        ? `Quit ${appName}`
        : `Failed to quit ${appName}`;
    } catch (error) {
      result.error = error.message;
    }

    this.logExecution(result);

    return result;
  }

  async switchTo(appName, options = {}) {
    const executionId = `switch-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const result = {
      executionId,
      success: false,
      appName,
      bundleId: null,
      output: '',
      error: '',
      duration: 0,
      timestamp: new Date(),
    };

    try {
      const launchResult = await this.launch(appName, options);
      result.bundleId = launchResult.bundleId;
      result.success = launchResult.success;
      result.output = launchResult.output;
    } catch (error) {
      result.error = error.message;
    }

    this.logExecution(result);

    return result;
  }

  async getRunningApplications() {
    const executionId = `list-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const result = {
      executionId,
      success: false,
      applications: [],
      error: '',
      timestamp: new Date(),
    };

    try {
      const script = PRESET_SCRIPTS.getRunningApps;
      const executionResult = await this.appleScript.execute(script);

      if (executionResult.success && executionResult.output) {
        result.applications = executionResult.output
          .split(', ')
          .map((name) => name.trim())
          .filter((name) => name.length > 0);

        result.success = true;
      } else {
        result.applications = await this.getRunningAppsNative();
        result.success = result.applications.length > 0;
      }
    } catch (error) {
      result.error = error.message;
      result.applications = await this.getRunningAppsNative();
      result.success = result.applications.length > 0;
    }

    return result;
  }

  getRunningAppsNative() {
    return new Promise((resolve) => {
      const child = spawn('ps', ['-eo', 'comm='], {
        shell: false,
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      let stdout = '';

      child.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      child.on('close', () => {
        const apps = stdout
          .split('\n')
          .map((line) => line.trim().replace('.app', ''))
          .filter((name) => name.length > 0);
        resolve([...new Set(apps)]);
      });

      child.on('error', () => {
        resolve([]);
      });
    });
  }

  async isRunning(appName) {
    const runningApps = await this.getRunningApplications();
    const normalizedName = appName.toLowerCase();

    return runningApps.applications.some(
      (app) =>
        app.toLowerCase().includes(normalizedName) ||
        normalizedName.includes(app.toLowerCase())
    );
  }

  async getFrontmostApplication() {
    const executionId = `frontmost-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const result = {
      executionId,
      success: false,
      application: null,
      error: '',
      timestamp: new Date(),
    };

    try {
      const script = PRESET_SCRIPTS.getFrontmostApp;
      const executionResult = await this.appleScript.execute(script);

      result.success = executionResult.success;
      result.application = executionResult.output || null;
    } catch (error) {
      result.error = error.message;
    }

    return result;
  }

  async getApplicationInfo(appName) {
    const executionId = `info-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const result = {
      executionId,
      success: false,
      name: appName,
      bundleId: null,
      path: null,
      running: false,
      version: null,
      error: '',
      timestamp: new Date(),
    };

    try {
      const bundleId = this.getBundleId(appName);
      result.bundleId = bundleId;

      result.running = await this.isRunning(appName);

      if (bundleId) {
        const script = `
          tell application "System Events"
            get version of application file of process "${appName}"
          end tell
        `;
        const versionResult = await this.appleScript.execute(script);
        if (versionResult.success) {
          result.version = versionResult.output;
        }
      }

      result.success = true;
    } catch (error) {
      result.error = error.message;
    }

    return result;
  }

  getBundleId(appName) {
    const normalized = appName.toLowerCase().trim();

    if (BUNDLE_ID_MAP[normalized]) {
      return BUNDLE_ID_MAP[normalized];
    }

    for (const [name, bundleId] of Object.entries(BUNDLE_ID_MAP)) {
      if (normalized.includes(name) || name.includes(normalized)) {
        return bundleId;
      }
    }

    return null;
  }

  registerApplication(appName, bundleId, options = {}) {
    this.knownApps.set(appName.toLowerCase(), {
      bundleId,
      ...options,
    });
  }

  unregisterApplication(appName) {
    this.knownApps.delete(appName.toLowerCase());
  }

  logExecution(result) {
    this.executionHistory.push(result);
    if (this.executionHistory.length > 100) {
      this.executionHistory.shift();
    }
  }

  getHistory() {
    return [...this.executionHistory];
  }

  clearHistory() {
    this.executionHistory = [];
  }
}

export function createAppController(options = {}) {
  return new AppController(options);
}

export { BUNDLE_ID_MAP };

export default AppController;
