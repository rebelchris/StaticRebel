/**
 * Web Oracle - Research arm for up-to-date information
 * Supports Tavily API, SearxNG (self-hosted), and fallback to DuckDuckGo
 */

import https from 'https';
import http from 'http';
import { URL } from 'url';

// Configuration
const TAVILY_API_KEY = process.env.TAVILY_API_KEY || '';
const SEARXNG_URL = process.env.SEARXNG_URL || 'http://localhost:8080';
const DEFAULT_TIMEOUT = 15000;

/**
 * Search using Tavily API (AI-optimized search)
 * Returns clean, structured results ideal for LLM consumption
 */
export async function searchTavily(query, options = {}) {
  if (!TAVILY_API_KEY) {
    return { error: 'Tavily API key not configured', results: [] };
  }

  const maxResults = options.maxResults || 5;

  try {
    const response = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${TAVILY_API_KEY}`
      },
      body: JSON.stringify({
        query,
        max_results: maxResults,
        include_answer: true,
        include_images: false,
        include_raw_content: false,
        include_links: true
      })
    });

    if (!response.ok) {
      throw new Error(`Tavily API error: ${response.statusText}`);
    }

    const data = await response.json();

    return {
      source: 'tavily',
      query,
      answer: data.answer || '',
      results: (data.results || []).map(r => ({
        title: r.title,
        url: r.url,
        content: r.content,
        score: r.score
      }))
    };
  } catch (error) {
    return { error: error.message, results: [] };
  }
}

/**
 * Search using SearxNG (self-hosted metasearch engine)
 * Returns clean results without tracking
 */
export async function searchSearxNG(query, options = {}) {
  const maxResults = options.maxResults || 10;
  const categories = options.categories || 'general';
  const language = options.language || 'en';

  try {
    const searchUrl = new URL('/search', SEARXNG_URL);
    searchUrl.searchParams.set('q', query);
    searchUrl.searchParams.set('categories', categories);
    searchUrl.searchParams.set('language', language);
    searchUrl.searchParams.set('format', 'json');
    searchUrl.searchParams.set('no_cache', '1');

    const response = await fetch(searchUrl.toString(), {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
      },
      signal: AbortSignal.timeout(DEFAULT_TIMEOUT)
    });

    if (!response.ok) {
      throw new Error(`SearxNG error: ${response.statusText}`);
    }

    const data = await response.json();

    return {
      source: 'searxng',
      query,
      results: (data.results || []).slice(0, maxResults).map(r => ({
        title: r.title,
        url: r.url,
        content: r.content || '',
        engine: r.engine,
        publishedTime: r.publishedTime
      }))
    };
  } catch (error) {
    return { error: error.message, results: [] };
  }
}

/**
 * Search using DuckDuckGo (fallback - HTML scraping)
 * Note: DuckDuckGo blocks programmatic access from servers
 */
export async function searchDuckDuckGo(query, options = {}) {
  return {
    source: 'duckduckgo',
    query,
    error: 'DuckDuckGo blocks programmatic access. Configure TAVILY_API_KEY or SEARXNG_URL for reliable research.',
    results: [],
    setupInstructions: `
To enable web research, configure one of:

1. Tavily API (Recommended):
   - Get API key: https://tavily.com/
   - Add to .env: TAVILY_API_KEY=your-key

2. Self-hosted SearxNG:
   - Install SearxNG: https://searxng.github.io/searxng/
   - Add to .env: SEARXNG_URL=http://your-searxng-instance:8080
`
  };
}

/**
 * Search using Bing (fallback - may not work from servers)
 */
export async function searchBing(query, options = {}) {
  return {
    source: 'bing',
    query,
    error: 'Bing search requires client-side rendering. Configure TAVILY_API_KEY for reliable research.',
    results: []
  };
}

/**
 * Unified search - tries sources in order of preference
 * Returns AI-ready clean results
 */
export async function webResearch(query, options = {}) {
  const { prefer = 'auto', maxResults = 5 } = options;

  // Check if any search provider is configured
  const hasTavily = !!TAVILY_API_KEY;
  const hasSearxNG = SEARXNG_URL !== 'http://localhost:8080';

  if (!hasTavily && !hasSearxNG) {
    return {
      source: 'none',
      query,
      error: 'Web search is not configured.',
      results: [],
      setupInstructions: `
To enable web research, configure one of:

1. Tavily API (Recommended):
   - Get API key: https://tavily.com/
   - Add to .env: TAVILY_API_KEY=your-key

2. Self-hosted SearxNG:
   - Install SearxNG: https://searxng.github.io/searxng/
   - Add to .env: SEARXNG_URL=http://your-searxng-instance:8080

Note: Local Ollama models cannot perform web searches directly.
`
    };
  }

  // If Tavily is configured and preferred
  if (prefer === 'tavily' || (prefer === 'auto' && hasTavily)) {
    const result = await searchTavily(query, { maxResults });
    if (!result.error) {
      return { ...result, method: 'tavily' };
    }
  }

  // Try SearxNG if configured
  if (prefer === 'searxng' || (prefer === 'auto' && hasSearxNG)) {
    const result = await searchSearxNG(query, { maxResults });
    if (!result.error) {
      return { ...result, method: 'searxng' };
    }
  }

  // No working search provider found
  return {
    source: 'none',
    query,
    error: 'All configured search providers failed. Please check your API keys or SearxNG instance.',
    results: []
  };
}

/**
 * Format research results for LLM consumption
 */
export function formatResearchResults(response) {
  if (response.error) {
    let output = `**Web Research Error**\n\n`;
    output += `${response.error}\n`;
    if (response.setupInstructions) {
      output += `\n${response.setupInstructions}`;
    }
    return output;
  }

  let output = `**Web Research: ${response.query}**\n`;
  output += `(Source: ${response.source || response.method})\n\n`;

  if (response.answer) {
    output += `**Answer:** ${response.answer}\n\n`;
  }

  if (response.results && response.results.length > 0) {
    output += `**Results:**\n`;
    response.results.forEach((r, i) => {
      const title = r.title || 'No title';
      const url = r.url || '';
      const content = r.content ? `\n   ${r.content.slice(0, 200)}...` : '';
      output += `${i + 1}. ${title}${url ? `\n   URL: ${url}` : ''}${content}\n\n`;
    });
  }

  output += `_${response.results?.length || 0} results found_`;
  return output;
}

/**
 * Direct research function - returns formatted output
 */
export async function research(query, options = {}) {
  const result = await webResearch(query, options);
  return formatResearchResults(result);
}

/**
 * Research with streaming status updates
 */
export async function* streamResearch(query, options = {}) {
  yield { type: 'thinking', stage: 'search', content: `Researching: "${query}"...` };

  const result = await webResearch(query, options);

  if (result.error) {
    yield { type: 'error', content: result.error };
    return;
  }

  yield { type: 'thinking', stage: 'found', content: `Found ${result.results?.length || 0} results from ${result.source || result.method}` };

  if (result.answer) {
    yield { type: 'answer', content: result.answer };
  }

  for (const r of (result.results || []).slice(0, 5)) {
    yield { type: 'result', title: r.title, url: r.url, content: r.content };
  }

  yield { type: 'done' };
}

export default {
  webResearch,
  research,
  searchTavily,
  searchSearxNG,
  searchDuckDuckGo,
  formatResearchResults,
  streamResearch
};
