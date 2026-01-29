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
    const query = input
      .replace(/search|look up|find|what's new|latest|google|web|internet/i, '')
      .trim()
      .replace(/^(for |the )/, '');

    if (!query) {
      return 'What would you like me to search for? Try: "Search for latest AI news"';
    }

    const results = await webSearch(query);

    if (results.length === 0) {
      return `No results found for "${query}". Try a different search term.`;
    }

    return (
      `**Web Search: ${query}**\n\n` +
      results
        .slice(0, 5)
        .map((r, i) => {
          const url = r.url ? `\n   ${r.url}` : '';
          return `${i + 1}. ${r.title}${url}`;
        })
        .join('\n\n') +
      `\n\n_${results.length} results found_`
    );
  },

  source: 'builtin',
  enabled: true,
  createdAt: '2026-01-29',
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
