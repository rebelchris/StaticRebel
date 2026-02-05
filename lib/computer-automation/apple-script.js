/**
 * AppleScript Executor
 *
 * Safe execution of AppleScript commands for macOS automation:
 * - Application control
 * - System settings
 * - UI interactions
 * - File operations via Finder
 */

import { spawn } from 'child_process';
import { promisify } from 'util';
import os from 'os';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export class AppleScriptExecutor {
  constructor(options = {}) {
    this.safety = options.safety || null;
    this.timeout = options.timeout || 30000;
    this.executionHistory = [];
  }

  async execute(script, options = {}) {
    const startTime = Date.now();
    const executionId = `as-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const result = {
      executionId,
      success: false,
      output: '',
      error: '',
      exitCode: -1,
      duration: 0,
      timestamp: new Date(),
      script: options.hideScript ? '[HIDDEN]' : script,
    };

    try {
      if (this.safety) {
        const safetyCheck = await this.safety.check({
          type: 'applescript',
          script,
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
        result.output = '[DRY-RUN] Would execute AppleScript';
        result.dryRun = true;
        this.logExecution(result);
        return result;
      }

      const normalizedScript = script.trim();
      let command;
      let args;

      if (normalizedScript.startsWith('osascript')) {
        const parts = normalizedScript.split(/\s+/);
        command = parts[1];
        args = ['-e', normalizedScript.replace(/^osascript\s+-e\s+/, '')];
      } else {
        command = 'osascript';
        args = ['-e', normalizedScript];
      }

      result.command = command;

      const executionResult = await this.runCommand(command, args, this.timeout);

      result.success = executionResult.success;
      result.output = executionResult.stdout;
      result.error = executionResult.stderr;
      result.exitCode = executionResult.exitCode;
      result.duration = Date.now() - startTime;

      if (!result.success && result.error.includes('denied')) {
        result.requiresAccessibilityAccess = true;
        result.message = 'Requires accessibility permission in System Preferences';
      }
    } catch (error) {
      result.error = error.message;
      result.duration = Date.now() - startTime;
    }

    this.logExecution(result);

    return result;
  }

  runCommand(command, args, timeout) {
    return new Promise((resolve) => {
      const child = spawn(command, args, {
        shell: false,
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';
      let timedOut = false;

      const timeoutHandle = setTimeout(() => {
        timedOut = true;
        child.kill('SIGTERM');
      }, timeout);

      child.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('close', (code) => {
        clearTimeout(timeoutHandle);

        if (timedOut) {
          resolve({
            success: false,
            stdout: stdout.trim(),
            stderr: 'Command timed out',
            exitCode: -1,
          });
        } else {
          resolve({
            success: code === 0,
            stdout: stdout.trim(),
            stderr: stderr.trim(),
            exitCode: code,
          });
        }
      });

      child.on('error', (error) => {
        clearTimeout(timeoutHandle);
        resolve({
          success: false,
          stdout: '',
          stderr: error.message,
          exitCode: -1,
        });
      });
    });
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

export function createAppleScriptExecutor(options = {}) {
  return new AppleScriptExecutor(options);
}

export const PRESET_SCRIPTS = {
  getFrontmostApp: `
    tell application "System Events"
      name of first process where it is frontmost
    end tell
  `,

  getRunningApps: `
    tell application "System Events"
      name of every process
    end tell
  `,

  launchApp: (appName) => `
    tell application "${appName}"
      activate
    end tell
  `,

  quitApp: (appName) => `
    tell application "${appName}"
      if running then
        quit
      end if
    end tell
  `,

  showNotification: (title, message) => `
    display notification "${message}" with title "${title}"
  `,

  setVolume: (volume) => `
    set volume ${volume}
  `,

  getVolume: `
    get output volume
  `,

  muteVolume: `
    set volume with output muted
  `,

  unmuteVolume: `
    set volume without output muted
  `,

  speak: (text) => `
    say "${text}"
  `,

  speakWithVoice: (text, voice) => `
    say "${text}" using "${voice}"
  `,

  getClipboard: `
    tell application "System Events"
      get the clipboard
    end tell
  `,

  setClipboard: (text) => `
    tell application "System Events"
      set the clipboard to "${text.replace(/"/g, '\\"')}"
    end tell
  `,

  openFinder: `
    tell application "Finder"
      activate
    end tell
  `,

  revealInFinder: (path) => `
    tell application "Finder"
      reveal POSIX file "${path}"
      activate
    end tell
  `,

  createFolder: (path) => `
    tell application "Finder"
      make new folder at "${path}" with properties {name:"New Folder"}
    end tell
  `,

  emptyTrash: `
    tell application "Finder"
      empty trash
    end tell
  `,

  lockScreen: `
    tell application "System Events"
      keystroke "q" using {command down, control down}
    end tell
  `,

  sleepDisplay: `
    tell application "System Events"
      key code 107
    end tell
  `,

  takeScreenshot: (path) => `
    do shell script "screencapture ${path}"
  `,

  clickAt: (x, y) => `
    tell application "System Events"
      click at {${x}, ${y}}
    end tell
  `,

  keystroke: (key) => `
    tell application "System Events"
      keystroke "${key}"
    end tell
  `,

  keystrokeWithModifier: (key, modifier) => `
    tell application "System Events"
      keystroke "${key}" using {${modifier} down}
    end tell
  `,

  pressFunctionKey: (num) => `
    tell application "System Events"
      key code ${num + 111}
    end tell
  `,

  getBatteryLevel: `
    tell application "System Events"
      battery level
    end tell
  `,

  isCharging: `
    tell application "System Events"
      battery is charging
    end tell
  `,

  getWiFiStatus: `
    do shell script "networksetup -getairportpower en0 | grep 'On'"
  `,

  toggleWiFi: (state) => `
    do shell script "networksetup -setairportpower en0 ${state}"
  `,

  getCurrentTrack: `
    tell application "Spotify"
      if running then
        name of current track
      end if
    end tell
  `,

  playPause: `
    tell application "Spotify"
      if running then
        playpause
      end if
    end tell
  `,

  nextTrack: `
    tell application "Spotify"
      if running then
        next track
      end if
    end tell
  `,

  previousTrack: `
    tell application "Spotify"
      if running then
        previous track
      end if
    end tell
  `,
};

export async function quickExecute(script, options = {}) {
  const executor = createAppleScriptExecutor(options);
  return executor.execute(script, options);
}

export default AppleScriptExecutor;
