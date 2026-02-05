/**
 * Clipboard Manager
 *
 * Read and write to the macOS clipboard:
 * - Read clipboard content
 * - Write text/RTF/images to clipboard
 * - Clear clipboard
 * - Clipboard history
 */

import { spawn } from 'child_process';
import { PRESET_SCRIPTS, createAppleScriptExecutor } from './apple-script.js';

export class ClipboardManager {
  constructor(options = {}) {
    this.safety = options.safety || null;
    this.timeout = options.timeout || 5000;
    this.appleScript = createAppleScriptExecutor({ safety: this.safety, timeout: this.timeout });
    this.history = [];
    this.maxHistorySize = options.maxHistorySize || 20;
  }

  async read(options = {}) {
    const executionId = `clipboard-read-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const result = {
      executionId,
      success: false,
      content: null,
      type: null,
      error: '',
      timestamp: new Date(),
    };

    try {
      if (this.safety) {
        const safetyCheck = await this.safety.check({
          type: 'clipboard_read',
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

      const script = `
        tell application "System Events"
          try
            set the clipboard to the clipboard
            if (number of paragraphs of the clipboard) > 0 then
              get the clipboard as «class utf8»
            else
              get the clipboard
            end if
          on error errMsg
            get the clipboard
          end try
        end tell
      `;

      const executionResult = await this.appleScript.execute(script, { timeout: this.timeout });

      if (executionResult.success && executionResult.output) {
        let content = executionResult.output;

        if (content.includes('«class utf8»')) {
          content = content.replace('«class utf8»', '').trim();
          result.type = 'text';
        } else if (content.includes('(') && content.includes(')')) {
          const parenContent = content.match(/\(([^)]+)\)/);
          if (parenContent) {
            content = parenContent[1];
            result.type = this.detectType(content);
          }
        }

        if (result.type === null) {
          result.type = this.detectType(content);
        }

        result.content = content;
        result.success = true;

        this.addToHistory({
          content,
          type: result.type,
          timestamp: new Date(),
        });
      } else {
        const pbpasteResult = await this.readWithPbpaste();
        result.content = pbpasteResult.content;
        result.type = pbpasteResult.type;
        result.success = pbpasteResult.success;

        if (result.success) {
          this.addToHistory({
            content: result.content,
            type: result.type,
            timestamp: new Date(),
          });
        }
      }
    } catch (error) {
      result.error = error.message;

      const pbpasteResult = await this.readWithPbpaste();
      if (pbpasteResult.success) {
        result.content = pbpasteResult.content;
        result.type = pbpasteResult.type;
        result.success = true;
      }
    }

    return result;
  }

  async readWithPbpaste() {
    return new Promise((resolve) => {
      const child = spawn('pbpaste', [], {
        shell: false,
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';

      const timeout = setTimeout(() => {
        child.kill('SIGTERM');
        resolve({ success: false, content: null, type: null });
      }, 3000);

      child.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('close', (code) => {
        clearTimeout(timeout);

        if (code === 0) {
          resolve({
            success: true,
            content: stdout,
            type: 'text',
          });
        } else {
          resolve({ success: false, content: null, type: null });
        }
      });

      child.on('error', () => {
        clearTimeout(timeout);
        resolve({ success: false, content: null, type: null });
      });
    });
  }

  detectType(content) {
    if (!content || content.length === 0) {
      return 'empty';
    }

    if (content.startsWith('{') && content.endsWith('}')) {
      try {
        JSON.parse(content);
        return 'json';
      } catch {
        return 'text';
      }
    }

    if (content.includes('<!DOCTYPE') || content.includes('<html')) {
      return 'html';
    }

    if (content.includes('http://') || content.includes('https://')) {
      return 'url';
    }

    if (/^data:image/.test(content)) {
      return 'image-base64';
    }

    return 'text';
  }

  async write(content, type = 'text', options = {}) {
    const executionId = `clipboard-write-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const result = {
      executionId,
      success: false,
      type,
      bytesWritten: 0,
      error: '',
      timestamp: new Date(),
    };

    try {
      if (this.safety) {
        const safetyCheck = await this.safety.check({
          type: 'clipboard_write',
          content: typeof content === 'string' ? content : JSON.stringify(content),
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
        result.output = `[DRY-RUN] Would write ${typeof content === 'string' ? content.length : 'binary'} bytes to clipboard`;
        result.dryRun = true;
        return result;
      }

      let script;

      switch (type) {
        case 'text':
          const escapedContent = String(content).replace(/"/g, '\\"').replace(/\n/g, '\\n');
          script = `
            tell application "System Events"
              set the clipboard to "${escapedContent}"
            end tell
          `;
          break;

        case 'url':
          script = `
            tell application "System Events"
              set the clipboard to "${String(content)}"
            end tell
          `;
          break;

        case 'html':
          script = `
            tell application "System Events"
              set the clipboard to ${String(content)}
            end tell
          `;
          break;

        default:
          const textContent = typeof content === 'string' ? content : JSON.stringify(content);
          const escapedText = textContent.replace(/"/g, '\\"');
          script = `
            tell application "System Events"
              set the clipboard to "${escapedText}"
            end tell
          `;
      }

      const executionResult = await this.appleScript.execute(script, { timeout: this.timeout });

      if (executionResult.success) {
        result.success = true;
        result.bytesWritten = typeof content === 'string' ? content.length : 0;
      } else {
        const pbcopyResult = await this.writeWithPbcopy(content);
        result.success = pbcopyResult.success;
        if (pbcopyResult.success) {
          result.bytesWritten = typeof content === 'string' ? content.length : 0;
        }
      }

      if (result.success) {
        this.addToHistory({
          content: typeof content === 'string' ? content : '[binary]',
          type,
          timestamp: new Date(),
        });
      }
    } catch (error) {
      result.error = error.message;

      const pbcopyResult = await this.writeWithPbcopy(content);
      result.success = pbcopyResult.success;
      if (pbcopyResult.success) {
        result.bytesWritten = typeof content === 'string' ? content.length : 0;
      }
    }

    return result;
  }

  async writeWithPbcopy(content) {
    return new Promise((resolve) => {
      const child = spawn('pbcopy', [], {
        shell: false,
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      let stderr = '';

      const timeout = setTimeout(() => {
        child.kill('SIGTERM');
        resolve({ success: false });
      }, 3000);

      child.stdin.write(typeof content === 'string' ? content : JSON.stringify(content));
      child.stdin.end();

      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('close', (code) => {
        clearTimeout(timeout);

        if (code === 0) {
          resolve({ success: true });
        } else {
          resolve({ success: false, error: stderr });
        }
      });

      child.on('error', () => {
        clearTimeout(timeout);
        resolve({ success: false });
      });
    });
  }

  async clear(options = {}) {
    const executionId = `clipboard-clear-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const result = {
      executionId,
      success: false,
      error: '',
      timestamp: new Date(),
    };

    try {
      if (options.dryRun || (this.safety?.dryRun)) {
        result.success = true;
        result.output = '[DRY-RUN] Would clear clipboard';
        result.dryRun = true;
        return result;
      }

      const script = `
        tell application "System Events"
          set the clipboard to ""
        end tell
      `;

      const executionResult = await this.appleScript.execute(script, { timeout: this.timeout });

      if (executionResult.success) {
        result.success = true;
      } else {
        const pbcopyResult = await this.clearWithPbcopy();
        result.success = pbcopyResult.success;
      }
    } catch (error) {
      result.error = error.message;

      const pbcopyResult = await this.clearWithPbcopy();
      result.success = pbcopyResult.success;
    }

    return result;
  }

  async clearWithPbcopy() {
    return new Promise((resolve) => {
      const child = spawn('pbcopy', [], {
        shell: false,
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      const timeout = setTimeout(() => {
        child.kill('SIGTERM');
        resolve({ success: false });
      }, 3000);

      child.stdin.end();

      child.on('close', (code) => {
        clearTimeout(timeout);
        resolve({ success: code === 0 });
      });

      child.on('error', () => {
        clearTimeout(timeout);
        resolve({ success: false });
      });
    });
  }

  async writeFile(filePath, options = {}) {
    const result = await this.files.read(filePath);

    if (result.success) {
      return this.write(result.content, 'text', options);
    }

    return {
      success: false,
      error: `Failed to read file: ${filePath}`,
    };
  }

  async writeJSON(data, options = {}) {
    return this.write(JSON.stringify(data, null, 2), 'json', options);
  }

  addToHistory(entry) {
    this.history.push(entry);
    if (this.history.length > this.maxHistorySize) {
      this.history.shift();
    }
  }

  getHistory() {
    return [...this.history];
  }

  clearHistory() {
    this.history = [];
  }

  async getClipboardTypes() {
    const executionId = `clipboard-types-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const result = {
      executionId,
      success: false,
      types: [],
      error: '',
      timestamp: new Date(),
    };

    try {
      const script = `
        tell application "System Events"
          get the clipboard information
        end tell
      `;

      const executionResult = await this.appleScript.execute(script);

      if (executionResult.success && executionResult.output) {
        result.types = executionResult.output
          .split(', ')
          .map((type) => type.trim())
          .filter((type) => type.length > 0);
        result.success = true;
      }
    } catch (error) {
      result.error = error.message;
    }

    return result;
  }
}

export function createClipboardManager(options = {}) {
  return new ClipboardManager(options);
}

export default ClipboardManager;
