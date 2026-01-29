/**
 * Search Action
 * Quick web search for current information
 */

import https from 'https';

export default {
  name: 'search',
  displayName: 'Web Search',
  description: 'Search the web for current information and news',
  category: 'research',
  version: '1.0.0',

  intentExamples: [
    'search',
    'look up',
    'find',
    'google',
    'what is new',
    'latest news',
    'what is happening',
    'current events',
    'search for',
    'search the web',
    'search the internet',
  ],

  parameters: {
    query: {
      type: 'string',
      description: 'The search query',
    },
  },

  dependencies: [],

  async handler(input, context, params) {
    return '🔍 Web search is temporarily disabled.\n\nTo enable web search, configure one of:\n\n1. **Tavily API** (Recommended):\n   - Get API key: https://tavily.com/\n   - Add to .env: TAVILY_API_KEY=your-key\n\n2. **Self-hosted SearxNG**:\n   - Install: https://searxng.github.io/searxng/\n   - Add to .env: SEARXNG_URL=http://localhost:8080\n\nLocal Ollama models cannot perform web searches directly.';
  },

  source: 'builtin',
  enabled: false,
  createdAt: '2026-01-29',
  disabledReason: 'Web search temporarily disabled - requires TAVILY_API_KEY or SEARXNG to be configured',
};

// Web search implementation using DuckDuckGo
async function webSearch(query) {
  return new Promise((resolve) => {
    const req = https.request(
      {
        hostname: 'duckduckgo.com',
        path: `/?q=${encodeURIComponent(query)}&t=h_&ia=web`,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          Accept:
            'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
        },
        timeout: 15000,
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          const results = [];

          // DuckDuckGo HTML format
          const linkRegex =
            /<a[^>]+class="[^"]*result__a[^"]*"[^>]+href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
          let match;

          while ((match = linkRegex.exec(data)) && results.length < 5) {
            let title = match[2]
              .trim()
              .replace(/<[^>]*>/g, '')
              .replace(/&#x27;/g, "'")
              .replace(/&/g, '&')
              .replace(/"/g, '"')
              .replace(/</g, '<')
              .replace(/>/g, '>');

            const url = match[1];

            if (
              title &&
              title.length > 15 &&
              !title.match(
                /^(Web|Images|Videos|News|Maps|More|Settings|Privacy)$/,
              )
            ) {
              results.push({ title, url });
            }
          }

          resolve(results);
        });
      },
    );
    req.on('error', () => resolve([]));
    req.on('timeout', () => {
      req.destroy();
      resolve([]);
    });
    req.end();
  });
}
