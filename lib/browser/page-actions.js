/**
 * Browser Page Actions
 * High-level browser automation using CDP client
 */

import http from 'http';
import { browserWsCommand } from './cdp-client.js';

const CDP_PORT = process.env.CDP_PORT || '18800';

/**
 * Navigate browser to URL
 */
async function browserNavigate(url) {
  try {
    // First get the target ID
    const targetsReq = http.request(
      {
        hostname: '127.0.0.1',
        port: CDP_PORT,
        path: '/json',
        method: 'GET',
        timeout: 3000,
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => {
          try {
            const targets = JSON.parse(body);
            const target = targets.find((t) => t.type === 'page');
            if (target) {
              // Navigate to URL using the target's webSocketDebuggerUrl
              const wsUrl = target.webSocketDebuggerUrl;
              browserWsCommand(wsUrl, 'Page.navigate', { url });
            }
          } catch (e) {}
        });
      },
    );
    targetsReq.onerror = () => {};
    targetsReq.end();
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * Get page content (title, text)
 */
async function browserGetPageContent() {
  return new Promise((resolve) => {
    http
      .get(`http://127.0.0.1:${CDP_PORT}/json`, (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => {
          try {
            const targets = JSON.parse(body);
            const target = targets.find((t) => t.type === 'page');
            if (target && target.url) {
              // Get page content via CDP
              const wsUrl = target.webSocketDebuggerUrl;
              browserWsCommand(wsUrl, 'DOM.getDocument', { depth: -1 }).then(
                (domResult) => {
                  browserWsCommand(wsUrl, 'Runtime.evaluate', {
                    expression: 'document.body.innerText.slice(0, 5000)',
                  }).then((textResult) => {
                    resolve({
                      url: target.url,
                      title: target.title,
                      text: textResult.result?.value || '',
                    });
                  });
                },
              );
            } else {
              resolve({ url: 'about:blank', text: '' });
            }
          } catch (e) {
            resolve({ error: e.message });
          }
        });
      })
      .on('error', () => {
        resolve({ error: 'CDP not available' });
      });
  });
}

/**
 * Take screenshot of current page
 */
async function browserScreenshot() {
  return new Promise((resolve) => {
    http
      .get(`http://127.0.0.1:${CDP_PORT}/json`, (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => {
          try {
            const targets = JSON.parse(body);
            const target = targets.find((t) => t.type === 'page');
            if (target) {
              const wsUrl = target.webSocketDebuggerUrl;
              browserWsCommand(wsUrl, 'Page.captureScreenshot', {
                format: 'png',
              }).then((result) => {
                resolve(result.data || null);
              });
            } else {
              resolve(null);
            }
          } catch (e) {
            resolve(null);
          }
        });
      })
      .on('error', () => {
        resolve(null);
      });
  });
}

export {
  browserNavigate,
  browserGetPageContent,
  browserScreenshot,
};