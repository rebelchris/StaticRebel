import fs from 'fs';
import path from 'path';
import os from 'os';
import http from 'http';
import https from 'https';

const SCRAPER_CACHE_DIR = path.join(
  os.homedir(),
  '.static-rebel',
  'scraper-cache',
);

/**
 * Ensure cache directory exists
 */
function ensureCacheDir() {
  if (!fs.existsSync(SCRAPER_CACHE_DIR)) {
    fs.mkdirSync(SCRAPER_CACHE_DIR, { recursive: true });
  }
}

/**
 * Get cache file path for URL
 */
function getCacheFile(url) {
  const hash = Buffer.from(url).toString('base64').replace(/[/+=]/g, '_');
  return path.join(SCRAPER_CACHE_DIR, `${hash}.json`);
}

/**
 * Check if cached content is still valid
 */
function isCacheValid(cacheFile, maxAge = 3600000) {
  // 1 hour default
  try {
    const stats = fs.statSync(cacheFile);
    return Date.now() - stats.mtime.getTime() < maxAge;
  } catch {
    return false;
  }
}

/**
 * Fetch content from URL
 */
export async function fetchUrl(url, options = {}) {
  ensureCacheDir();

  // Check cache first
  const cacheFile = getCacheFile(url);
  if (!options.noCache && isCacheValid(cacheFile, options.maxAge)) {
    try {
      const cached = JSON.parse(fs.readFileSync(cacheFile, 'utf-8'));
      return cached.content;
    } catch {
      // Ignore cache errors
    }
  }

  // Fetch from network
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https:') ? https : http;
    const req = client.get(
      url,
      {
        headers: {
          'User-Agent': 'StaticRebel-Scraper/1.0',
        },
        timeout: options.timeout || 30000,
      },
      (res) => {
        if (
          res.statusCode >= 300 &&
          res.statusCode < 400 &&
          res.headers.location
        ) {
          // Follow redirects
          fetchUrl(res.headers.location, options).then(resolve).catch(reject);
          return;
        }

        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }

        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          // Cache the result
          try {
            fs.writeFileSync(
              cacheFile,
              JSON.stringify({
                url,
                content: data,
                timestamp: Date.now(),
              }),
            );
          } catch {
            // Ignore cache write errors
          }
          resolve(data);
        });
      },
    );

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
  });
}

/**
 * Extract text content from HTML
 */
export function extractText(html) {
  // Simple HTML to text extraction
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extract links from HTML
 */
export function extractLinks(html, baseUrl) {
  const links = [];
  const regex = /href=["']([^"']+)["']/gi;
  let match;

  while ((match = regex.exec(html)) !== null) {
    try {
      const url = new URL(match[1], baseUrl).href;
      links.push(url);
    } catch {
      // Ignore invalid URLs
    }
  }

  return [...new Set(links)];
}

/**
 * Scrape a webpage and extract content
 */
export async function scrape(url, options = {}) {
  const html = await fetchUrl(url, options);

  return {
    url,
    html,
    text: extractText(html),
    links: options.includeLinks ? extractLinks(html, url) : undefined,
    title: html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] || '',
  };
}

/**
 * Clear scraper cache
 */
export function clearCache() {
  try {
    if (fs.existsSync(SCRAPER_CACHE_DIR)) {
      const files = fs.readdirSync(SCRAPER_CACHE_DIR);
      for (const file of files) {
        fs.unlinkSync(path.join(SCRAPER_CACHE_DIR, file));
      }
    }
    return true;
  } catch (e) {
    console.error('Failed to clear cache:', e.message);
    return false;
  }
}
