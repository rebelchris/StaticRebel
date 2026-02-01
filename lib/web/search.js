/**
 * Web Search Operations
 * DuckDuckGo and Brave search functionality
 */

import http from 'http';
import https from 'https';

/**
 * Web search using DuckDuckGo
 */
async function webSearch(query, limit = 5) {
  // Web search temporarily disabled - requires API configuration
  console.log('🔍 Web search is temporarily disabled.');
  console.log(
    'To enable, configure TAVILY_API_KEY or SEARXNG_URL in your .env file',
  );
  return [];

  /* Original DuckDuckGo implementation disabled
  return new Promise((resolve) => {
    // Use DuckDuckGo HTML search
    const encodedQuery = encodeURIComponent(query);
    const searchUrl = `https://duckduckgo.com/html/?q=${encodedQuery}&kl=us-en`;

    const req = https.request(
      {
        hostname: 'duckduckgo.com',
        port: 443,
        path: `/html/?q=${encodedQuery}&kl=us-en`,
        method: 'GET',
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        },
      },
      (res) => {
        // Handle HTTP error status codes
        if (res.statusCode !== 200) {
          console.error(`Web search HTTP error: ${res.statusCode}`);
          return resolve([]);
        }

        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('error', (err) => {
          console.error(`Web search read error: ${err.message}`);
          resolve([]);
        });
        res.on('end', () => {
          try {
            // Parse DuckDuckGo HTML results
            const results = [];
            // Updated regex for DuckDuckGo HTML results
            const linkRegex =
              /<a[^>]+class="[^"]*result__a[^"]*"[^>]+href="([^"]+)"[^>]*>([^<]+)<\/a>/g;
            const snippetRegex =
              /<a[^>]+class="[^"]*result__a[^"]*"[^>]+>.*?<\/a>[\s\S]*?<div[^>]+class="[^"]*result__snippet[^"]*"[^>]*>([^<]+)</g;

            let match;
            let lastIndex = 0;

            // Use a more robust parsing approach
            while (
              (match = linkRegex.exec(body)) !== null &&
              results.length < limit
            ) {
              const url = match[1];
              // Decode HTML entities in title
              const title = match[2]
                .replace(/&amp;/g, '&')
                .replace(/&lt;/g, '<')
                .replace(/&gt;/g, '>')
                .replace(/&quot;/g, '"')
                .replace(/&#039;/g, "'")
                .replace(/&apos;/g, "'")
                .replace(/<[^>]+>/g, '')
                .trim();

              // Find snippet after this link
              const snippetMatch = body
                .substring(match.index)
                .match(snippetRegex);
              let snippet = '';
              if (snippetMatch) {
                snippet = snippetMatch[1]
                  .replace(/&amp;/g, '&')
                  .replace(/&lt;/g, '<')
                  .replace(/&gt;/g, '>')
                  .replace(/&quot;/g, '"')
                  .replace(/&#039;/g, "'")
                  .replace(/&apos;/g, "'")
                  .replace(/<[^>]+>/g, '')
                  .trim();
              }

              // Validate result
              if (
                url &&
                title &&
                !url.includes('duckduckgo') &&
                url.startsWith('http')
              ) {
                results.push({ title, url, snippet });
              }
            }

            resolve(results);
          } catch (e) {
            console.error(`Search parsing error: ${e.message}`);
            resolve([]);
          }
        });
      },
    );

    req.on('error', (e) => {
      console.error(`Search request error: ${e.message}`);
      resolve([]);
    });

    req.setTimeout(10000, () => {
      req.destroy();
      console.error('Search request timeout');
      resolve([]);
    });

    req.end();
  });
  */
}

export {
  webSearch,
};