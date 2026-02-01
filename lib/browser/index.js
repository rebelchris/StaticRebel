import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { 
  CDPClient, 
  createCDPConnection,
  navigateToPage,
  takeScreenshot,
  extractPageContent,
  executeJavaScript,
  clickElement,
  fillInput,
  waitForElement,
  waitForCondition
} from './cdp.js';

/**
 * Browser Automation for StaticRebel
 * High-level interface for browser operations using Chrome DevTools Protocol
 */

export class BrowserAutomation {
  constructor(options = {}) {
    this.headless = options.headless !== false; // Default to headless
    this.port = options.port || 9222;
    this.userDataDir = options.userDataDir || path.join(os.tmpdir(), 'static-rebel-browser');
    this.chromeProcess = null;
    this.cdpClient = null;
    this.cdpUrl = `http://localhost:${this.port}`;
    this.timeout = options.timeout || 30000;
  }

  /**
   * Launch Chrome browser with CDP enabled
   */
  async launchChrome() {
    if (this.chromeProcess) {
      throw new Error('Chrome is already running');
    }

    // Find Chrome executable
    const chromeExecutable = this.findChromeExecutable();
    if (!chromeExecutable) {
      throw new Error('Chrome executable not found. Please install Chrome or Chromium.');
    }

    // Prepare Chrome arguments
    const args = [
      `--remote-debugging-port=${this.port}`,
      `--user-data-dir=${this.userDataDir}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-default-apps',
      '--disable-popup-blocking',
      '--disable-translate',
      '--disable-background-timer-throttling',
      '--disable-renderer-backgrounding',
      '--disable-backgrounding-occluded-windows',
      '--disable-features=TranslateUI',
      '--disable-ipc-flooding-protection',
      '--disable-web-security',
      '--disable-features=VizDisplayCompositor',
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu'
    ];

    if (this.headless) {
      args.push('--headless');
    }

    console.log(`[Browser] Launching Chrome with: ${chromeExecutable}`);
    console.log(`[Browser] Args: ${args.join(' ')}`);
    
    // Launch Chrome
    this.chromeProcess = spawn(chromeExecutable, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: false
    });

    this.chromeProcess.on('error', (error) => {
      console.error(`[Browser] Chrome launch error: ${error.message}`);
      throw new Error(`Failed to launch Chrome: ${error.message}`);
    });

    this.chromeProcess.stdout.on('data', (data) => {
      console.log(`[Browser] Chrome stdout: ${data.toString()}`);
    });

    this.chromeProcess.stderr.on('data', (data) => {
      console.error(`[Browser] Chrome stderr: ${data.toString()}`);
    });

    this.chromeProcess.on('exit', (code) => {
      console.log(`[Browser] Chrome exited with code: ${code}`);
    });

    // Wait for Chrome to start
    await this.waitForChrome();
    
    return this;
  }

  /**
   * Connect to existing Chrome instance
   */
  async connectToChrome(cdpUrl) {
    this.cdpUrl = cdpUrl;
    await this.waitForChrome();
    return this;
  }

  /**
   * Wait for Chrome to be ready
   */
  async waitForChrome() {
    const startTime = Date.now();
    console.log(`[Browser] Waiting for Chrome to be ready at ${this.cdpUrl}`);
    
    while (Date.now() - startTime < this.timeout) {
      try {
        console.log(`[Browser] Checking Chrome readiness... (${Date.now() - startTime}ms)`);
        const response = await fetch(`${this.cdpUrl}/json/version`);
        if (response.ok) {
          console.log(`[Browser] Chrome is ready!`);
          return;
        }
      } catch (error) {
        console.log(`[Browser] Chrome not ready yet: ${error.message}`);
      }
      
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    throw new Error(`Chrome did not start within timeout (${this.timeout}ms)`);
  }

  /**
   * Create a new tab and navigate to URL
   */
  async openPage(url) {
    if (!this.cdpClient) {
      this.cdpClient = await createCDPConnection(this.cdpUrl);
    }

    await navigateToPage(this.cdpClient, url);
    return this;
  }

  /**
   * Navigate current page to URL
   */
  async navigate(url) {
    if (!this.cdpClient) {
      throw new Error('No active browser connection. Call openPage() first.');
    }

    await navigateToPage(this.cdpClient, url);
    return this;
  }

  /**
   * Take screenshot of current page
   */
  async screenshot(options = {}) {
    if (!this.cdpClient) {
      throw new Error('No active browser connection. Call openPage() first.');
    }

    return await takeScreenshot(this.cdpClient, options);
  }

  /**
   * Extract content from current page
   */
  async scrapeContent() {
    if (!this.cdpClient) {
      throw new Error('No active browser connection. Call openPage() first.');
    }

    return await extractPageContent(this.cdpClient);
  }

  /**
   * Execute JavaScript on current page
   */
  async executeScript(script, awaitPromise = false) {
    if (!this.cdpClient) {
      throw new Error('No active browser connection. Call openPage() first.');
    }

    return await executeJavaScript(this.cdpClient, script, awaitPromise);
  }

  /**
   * Click element by CSS selector
   */
  async click(selector) {
    if (!this.cdpClient) {
      throw new Error('No active browser connection. Call openPage() first.');
    }

    return await clickElement(this.cdpClient, selector);
  }

  /**
   * Fill input field
   */
  async fill(selector, value) {
    if (!this.cdpClient) {
      throw new Error('No active browser connection. Call openPage() first.');
    }

    return await fillInput(this.cdpClient, selector, value);
  }

  /**
   * Wait for element to appear
   */
  async waitFor(selector, timeout) {
    if (!this.cdpClient) {
      throw new Error('No active browser connection. Call openPage() first.');
    }

    return await waitForElement(this.cdpClient, selector, timeout || this.timeout);
  }

  /**
   * Wait for custom condition
   */
  async waitForCondition(condition, timeout) {
    if (!this.cdpClient) {
      throw new Error('No active browser connection. Call openPage() first.');
    }

    return await waitForCondition(this.cdpClient, condition, timeout || this.timeout);
  }

  /**
   * Fill out form with multiple fields
   */
  async fillForm(formData) {
    for (const [selector, value] of Object.entries(formData)) {
      await this.fill(selector, value);
    }
    return this;
  }

  /**
   * Submit form
   */
  async submitForm(formSelector = 'form') {
    await this.click(`${formSelector} [type="submit"], ${formSelector} button[type="submit"]`);
    return this;
  }

  /**
   * Get page title
   */
  async getTitle() {
    return await this.executeScript('document.title');
  }

  /**
   * Get current URL
   */
  async getUrl() {
    return await this.executeScript('window.location.href');
  }

  /**
   * Get element text
   */
  async getText(selector) {
    return await this.executeScript(`document.querySelector('${selector}')?.textContent || ''`);
  }

  /**
   * Check if element exists
   */
  async elementExists(selector) {
    return await this.executeScript(`document.querySelector('${selector}') !== null`);
  }

  /**
   * Scroll to element
   */
  async scrollTo(selector) {
    await this.executeScript(`document.querySelector('${selector}')?.scrollIntoView()`);
    return this;
  }

  /**
   * Close browser
   */
  async close() {
    if (this.cdpClient) {
      this.cdpClient.disconnect();
      this.cdpClient = null;
    }

    if (this.chromeProcess) {
      this.chromeProcess.kill();
      this.chromeProcess = null;
    }

    return this;
  }

  /**
   * Find Chrome executable on the system
   */
  findChromeExecutable() {
    const possiblePaths = [];

    if (process.platform === 'darwin') {
      // macOS
      possiblePaths.push(
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        '/Applications/Chromium.app/Contents/MacOS/Chromium'
      );
    } else if (process.platform === 'win32') {
      // Windows
      possiblePaths.push(
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Users\\' + os.userInfo().username + '\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe'
      );
    } else {
      // Linux
      possiblePaths.push(
        '/usr/bin/google-chrome',
        '/usr/bin/google-chrome-stable',
        '/usr/bin/chromium',
        '/usr/bin/chromium-browser',
        '/snap/bin/chromium'
      );
    }

    // Check each possible path
    for (const chromePath of possiblePaths) {
      if (fs.existsSync(chromePath)) {
        return chromePath;
      }
    }

    return null;
  }
}

/**
 * Convenience functions for quick operations
 */

/**
 * Quick screenshot of a URL
 */
export async function screenshotUrl(url, options = {}) {
  console.log(`[Browser] Starting screenshot for: ${url}`);
  const browser = new BrowserAutomation({ headless: true });
  try {
    await browser.launchChrome();
    console.log(`[Browser] Chrome launched successfully`);
    
    // Create new tab
    const createResponse = await fetch(`${browser.cdpUrl}/json/new`, { method: 'PUT' });
    const tabInfo = await createResponse.json();
    console.log(`[Browser] Created new tab:`, tabInfo);
    
    if (!tabInfo.webSocketDebuggerUrl) {
      throw new Error('Failed to get WebSocket URL for new tab');
    }
    
    // Connect directly to the new tab
    const { CDPClient, navigateToPage, takeScreenshot } = await import('./cdp.js');
    const client = new CDPClient(tabInfo.webSocketDebuggerUrl);
    await client.connect();
    console.log(`[Browser] Connected to new tab`);
    
    // Navigate to the URL
    await navigateToPage(client, url);
    console.log(`[Browser] Navigated to ${url}`);
    
    // Wait for page to load
    await new Promise(resolve => setTimeout(resolve, 3000));
    console.log(`[Browser] Page load wait complete`);
    
    return await takeScreenshot(client, options);
  } finally {
    await browser.close();
  }
}

/**
 * Quick scrape of a URL
 */
export async function scrapeUrl(url) {
  const browser = new BrowserAutomation({ headless: true });
  try {
    await browser.launchChrome();
    await browser.openPage(url);
    
    // Wait a bit for page to fully load
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    return await browser.scrapeContent();
  } finally {
    await browser.close();
  }
}

/**
 * Open URL in headed browser for manual interaction
 */
export async function openBrowser(url) {
  const browser = new BrowserAutomation({ headless: false });
  await browser.launchChrome();
  
  if (url) {
    await browser.openPage(url);
  }
  
  return browser;
}

export { BrowserAutomation as default };