/**
 * CDP (Chrome DevTools Protocol) Client
 * Browser automation via CDP WebSocket connection
 */

import http from 'http';

const CDP_PORT = process.env.CDP_PORT || '18800';
const CDP_URL = `ws://127.0.0.1:${CDP_PORT}`;

/**
 * Execute CDP command via HTTP/WebSocket
 */
async function cdpCommand(method, params = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: CDP_PORT,
        path: '/json/protocol',
        method: 'GET',
        timeout: 5000,
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => {
          // Try to use CDP WebSocket
          cdpWsRequest(method, params).then(resolve).catch(reject);
        });
      },
    );
    req.onerror = () => reject(new Error('CDP not available'));
    req.end();
  });
}

/**
 * Execute CDP command via WebSocket
 */
async function cdpWsRequest(method, params = {}) {
  return new Promise((resolve, reject) => {
    const wsUrl = `ws://127.0.0.1:${CDP_PORT}/`;
    const ws = require('ws');
    const wsClient = new ws(wsUrl, 'chrome-devtools');

    let response = null;
    let timeout = setTimeout(() => {
      wsClient.close();
      reject(new Error('CDP timeout'));
    }, 10000);

    wsClient.on('open', () => {
      const id = Date.now().toString(36) + Math.random().toString(36).slice(2);
      wsClient.send(JSON.stringify({ id, method, params }));
    });

    wsClient.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.id) {
          clearTimeout(timeout);
          if (msg.result) {
            resolve(msg.result);
          } else if (msg.error) {
            reject(new Error(msg.error.message || 'CDP error'));
          }
        }
      } catch (e) {}
    });

    wsClient.on('error', (e) => {
      clearTimeout(timeout);
      reject(e);
    });
  });
}

/**
 * Execute command via WebSocket with custom URL
 */
async function browserWsCommand(wsUrl, method, params = {}) {
  return new Promise((resolve, reject) => {
    const ws = require('ws');
    const wsClient = new ws(wsUrl, 'chrome-devtools');

    let timeout = setTimeout(() => {
      wsClient.close();
      reject(new Error('WebSocket timeout'));
    }, 15000);

    wsClient.on('open', () => {
      const id = Date.now().toString(36) + Math.random().toString(36).slice(2);
      wsClient.send(JSON.stringify({ id, method, params }));
    });

    wsClient.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.id) {
          clearTimeout(timeout);
          wsClient.close();
          if (msg.result) {
            resolve(msg.result);
          } else if (msg.error) {
            reject(new Error(msg.error.message || 'WebSocket error'));
          } else {
            resolve(null);
          }
        }
      } catch (e) {
        // Ignore parsing errors for non-JSON messages
      }
    });

    wsClient.on('error', (e) => {
      clearTimeout(timeout);
      reject(e);
    });
  });
}

export {
  CDP_PORT,
  CDP_URL,
  cdpCommand,
  cdpWsRequest,
  browserWsCommand,
};