import WebSocket from 'ws';
import { EventEmitter } from 'events';

/**
 * Chrome DevTools Protocol (CDP) Client
 * Handles low-level communication with Chrome browser
 */

export class CDPClient extends EventEmitter {
  constructor(wsUrl) {
    super();
    this.wsUrl = wsUrl;
    this.ws = null;
    this.connected = false;
    this.messageId = 0;
    this.pendingRequests = new Map();
    this.sessionId = null;
  }

  /**
   * Connect to Chrome DevTools Protocol
   */
  async connect() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.wsUrl);
      
      this.ws.on('open', () => {
        this.connected = true;
        this.emit('connected');
        resolve();
      });

      this.ws.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString());
          this.handleMessage(message);
        } catch (error) {
          this.emit('error', error);
        }
      });

      this.ws.on('close', () => {
        this.connected = false;
        this.emit('disconnected');
      });

      this.ws.on('error', (error) => {
        this.emit('error', error);
        reject(error);
      });
    });
  }

  /**
   * Disconnect from CDP
   */
  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
      this.connected = false;
    }
  }

  /**
   * Send command to CDP
   */
  async send(method, params = {}) {
    if (!this.connected) {
      throw new Error('CDP client not connected');
    }

    return new Promise((resolve, reject) => {
      const id = ++this.messageId;
      const message = {
        id,
        method,
        params,
        ...(this.sessionId ? { sessionId: this.sessionId } : {})
      };

      this.pendingRequests.set(id, { resolve, reject });
      
      // Set timeout for requests
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error(`CDP command timeout: ${method}`));
        }
      }, 30000);

      this.ws.send(JSON.stringify(message));
    });
  }

  /**
   * Handle incoming messages from CDP
   */
  handleMessage(message) {
    if (message.id && this.pendingRequests.has(message.id)) {
      const { resolve, reject } = this.pendingRequests.get(message.id);
      this.pendingRequests.delete(message.id);
      
      if (message.error) {
        reject(new Error(`CDP error: ${message.error.message || message.error.code}`));
      } else {
        resolve(message.result || {});
      }
    } else if (message.method) {
      // Handle events
      this.emit('event', message.method, message.params);
    }
  }

  /**
   * Set session ID for target-specific operations
   */
  setSessionId(sessionId) {
    this.sessionId = sessionId;
  }
}

/**
 * Helper functions for CDP operations
 */

export async function createCDPConnection(cdpUrl) {
  // Get browser version to find WebSocket URL
  console.log(`[CDP] Fetching version from ${cdpUrl}/json/version`);
  const versionResponse = await fetch(`${cdpUrl}/json/version`);
  const version = await versionResponse.json();
  
  console.log(`[CDP] Version response:`, version);
  
  if (!version.webSocketDebuggerUrl) {
    throw new Error('No WebSocket debugger URL available');
  }

  console.log(`[CDP] Connecting to WebSocket: ${version.webSocketDebuggerUrl}`);
  const client = new CDPClient(version.webSocketDebuggerUrl);
  await client.connect();
  
  return client;
}

export async function navigateToPage(client, url) {
  await client.send('Page.enable');
  await client.send('Page.navigate', { url });
  
  // Wait for page to load
  return new Promise((resolve) => {
    client.on('event', (method, params) => {
      if (method === 'Page.loadEventFired') {
        resolve();
      }
    });
  });
}

export async function takeScreenshot(client, options = {}) {
  console.log(`[CDP] Taking screenshot with options:`, options);
  
  try {
    await client.send('Page.enable');
    console.log(`[CDP] Page enabled`);
  } catch (error) {
    console.error(`[CDP] Failed to enable Page:`, error.message);
    throw error;
  }
  
  const params = {
    format: options.format || 'png',
    quality: options.quality || 90,
    clip: options.clip,
    fromSurface: true,
    captureBeyondViewport: Boolean(options.fullPage)
  };

  if (options.fullPage) {
    try {
      // Get content size for full page
      console.log(`[CDP] Getting layout metrics for full page`);
      const metrics = await client.send('Page.getLayoutMetrics');
      const contentSize = metrics.contentSize;
      
      if (contentSize) {
        params.clip = {
          x: 0,
          y: 0,
          width: contentSize.width,
          height: contentSize.height,
          scale: 1
        };
        console.log(`[CDP] Full page size: ${contentSize.width}x${contentSize.height}`);
      }
    } catch (error) {
      console.warn(`[CDP] Failed to get layout metrics, using viewport:`, error.message);
    }
  }

  console.log(`[CDP] Capturing screenshot with params:`, params);
  const result = await client.send('Page.captureScreenshot', params);
  console.log(`[CDP] Screenshot captured, data length:`, result.data?.length || 0);
  return Buffer.from(result.data, 'base64');
}

export async function extractPageContent(client) {
  await client.send('Runtime.enable');
  await client.send('Page.enable');
  
  // Get page content
  const htmlResult = await client.send('Runtime.evaluate', {
    expression: 'document.documentElement.outerHTML',
    returnByValue: true
  });

  const textResult = await client.send('Runtime.evaluate', {
    expression: 'document.body.innerText',
    returnByValue: true
  });

  const titleResult = await client.send('Runtime.evaluate', {
    expression: 'document.title',
    returnByValue: true
  });

  const urlResult = await client.send('Runtime.evaluate', {
    expression: 'window.location.href',
    returnByValue: true
  });

  return {
    html: htmlResult.value,
    text: textResult.value,
    title: titleResult.value,
    url: urlResult.value
  };
}

export async function executeJavaScript(client, expression, awaitPromise = false) {
  await client.send('Runtime.enable');
  
  const result = await client.send('Runtime.evaluate', {
    expression,
    awaitPromise,
    returnByValue: true,
    userGesture: true,
    includeCommandLineAPI: true
  });

  if (result.exceptionDetails) {
    throw new Error(`JavaScript execution error: ${result.exceptionDetails.text}`);
  }

  return result.value;
}

export async function clickElement(client, selector) {
  await client.send('Runtime.enable');
  await client.send('Page.enable');
  
  // Find element and click it
  const expression = `
    const element = document.querySelector('${selector}');
    if (!element) throw new Error('Element not found: ${selector}');
    element.click();
    'clicked';
  `;

  return await executeJavaScript(client, expression);
}

export async function fillInput(client, selector, value) {
  await client.send('Runtime.enable');
  await client.send('Page.enable');
  
  const expression = `
    const element = document.querySelector('${selector}');
    if (!element) throw new Error('Element not found: ${selector}');
    element.value = '${value.replace(/'/g, "\\'")}';
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
    'filled';
  `;

  return await executeJavaScript(client, expression);
}

export async function waitForElement(client, selector, timeout = 10000) {
  await client.send('Runtime.enable');
  
  const expression = `
    new Promise((resolve, reject) => {
      const check = () => {
        const element = document.querySelector('${selector}');
        if (element) {
          resolve(element !== null);
        } else {
          setTimeout(check, 100);
        }
      };
      
      setTimeout(() => reject(new Error('Element not found within timeout')), ${timeout});
      check();
    });
  `;

  return await executeJavaScript(client, expression, true);
}

export async function waitForCondition(client, condition, timeout = 10000) {
  const expression = `
    new Promise((resolve, reject) => {
      const check = () => {
        try {
          const result = ${condition};
          if (result) {
            resolve(true);
          } else {
            setTimeout(check, 100);
          }
        } catch (e) {
          setTimeout(check, 100);
        }
      };
      
      setTimeout(() => reject(new Error('Condition not met within timeout')), ${timeout});
      check();
    });
  `;

  return await executeJavaScript(client, expression, true);
}