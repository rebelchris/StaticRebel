/**
 * Web Scraper Skill - Full-page extraction using Playwright
 * Part of PLAN3: The "Scraper" Skill for deep page reading
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SCRAPER_CACHE_DIR = path.join(os.homedir(), '.static-rebel', 'scraper-cache');

// Ensure cache directory exists
if (!fs.existsSync(SCRAPER_CACHE_DIR)) {
  fs.mkdirSync(SCRAPER_CACHE_DIR, { recursive: true });
}

/**
 * Scrape a URL using Playwright - extracts full page content
 * Falls back to simple fetch if Playwright is not available
 */
export async function scrapeUrl(url, options = {}) {
  const { timeout = 30000, extractLinks = false, waitForSelector = null } = options;

  // Try Playwright first
  try {
    const { chromium } = await import('playwright');
    return await scrapeWithPlaywright(url, { timeout, extractLinks, waitForSelector });
  } catch (e) {
    // Fallback to simple fetch
    return await scrapeWithFetch(url, options);
  }
}

/**
 * Scrape using Playwright - full browser automation
 */
async function scrapeWithPlaywright(url, options = {}) {
  const { timeout = 30000, extractLinks = false, waitForSelector = null } = options;

  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    // Set timeout
    page.setDefaultTimeout(timeout);

    // Navigate to URL
    await page.goto(url, { waitUntil: 'networkidle' });

    // Wait for specific selector if provided
    if (waitForSelector) {
      await page.waitForSelector(waitForSelector, { timeout: 10000 }).catch(() => {});
    }

    // Extract main content
    const content = await page.evaluate(() => {
      // Remove unwanted elements
      const remove = ['script', 'style', 'nav', 'footer', 'header', 'aside', 'noscript', 'iframe'];
      remove.forEach(tag => {
        document.querySelectorAll(tag).forEach(el => el.remove());
      });

      // Get main content area
      const main = document.querySelector('main') || document.querySelector('article') || document.body;

      // Extract text content
      const text = main.innerText || '';

      // Extract structured data
      const title = document.title;
      const metaDescription = document.querySelector('meta[name="description"]')?.content || '';
      const headings = Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6'))
        .map(h => ({ level: h.tagName, text: h.innerText.trim() }));

      // Extract links if requested
      const links = extractLinks ? Array.from(document.querySelectorAll('a[href]'))
        .map(a => ({ text: a.innerText.trim(), href: a.href, title: a.title }))
        .filter(l => l.href && !l.href.startsWith('javascript:'))
        .slice(0, 50) : [];

      // Extract images
      const images = Array.from(document.querySelectorAll('img[src]'))
        .map(img => ({ src: img.src, alt: img.alt, title: img.title }))
        .filter(i => i.src)
        .slice(0, 20);

      return { text, title, metaDescription, headings, links, images, html: main.innerHTML };
    });

    // Cache the result
    const cacheKey = generateCacheKey(url);
    const cacheFile = path.join(SCRAPER_CACHE_DIR, `${cacheKey}.json`);
    const cacheData = {
      url,
      timestamp: new Date().toISOString(),
      content
    };
    fs.writeFileSync(cacheFile, JSON.stringify(cacheData, null, 2));

    return {
      success: true,
      source: 'playwright',
      url,
      ...content,
      cached: false
    };
  } catch (error) {
    return { success: false, error: error.message, source: 'playwright' };
  } finally {
    if (browser) await browser.close();
  }
}

/**
 * Fallback: Simple fetch-based scraping
 */
async function scrapeWithFetch(url, options = {}) {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
      },
      signal: AbortSignal.timeout(15000)
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const html = await response.text();

    // Simple HTML parsing (no external deps)
    const content = parseHtmlSimple(html);

    return {
      success: true,
      source: 'fetch',
      url,
      ...content,
      cached: false
    };
  } catch (error) {
    return { success: false, error: error.message, source: 'fetch' };
  }
}

/**
 * Simple HTML parser without external dependencies
 */
function parseHtmlSimple(html) {
  // Remove script and style tags
  let text = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
  text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');

  // Replace common block elements with newlines
  text = text.replace(/<\/?(p|div|br|h[1-6]|li|tr)[\s>]/gi, '\n');

  // Remove all remaining tags
  text = text.replace(/<[^>]+>/g, '');

  // Decode common HTML entities
  text = text.replace(/&nbsp;/gi, ' ');
  text = text.replace(/&amp;/gi, '&');
  text = text.replace(/&lt;/gi, '<');
  text = text.replace(/&gt;/gi, '>');
  text = text.replace(/&quot;/gi, '"');
  text = text.replace(/&#39;/gi, "'");

  // Clean up whitespace
  text = text.replace(/[ \t]+/g, ' ');
  text = text.replace(/\n\s*\n/g, '\n\n');

  // Limit content length
  text = text.slice(0, 10000);

  return {
    text: text.trim(),
    title: extractTitle(html),
    metaDescription: extractMeta(html, 'description')
  };
}

function extractTitle(html) {
  const match = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  return match ? match[1].trim() : '';
}

function extractMeta(html, name) {
  const match = html.match(new RegExp(`<meta[^>]*name=["']${name}["'][^>]*content=["']([^"']+)["']`, 'i')) ||
                html.match(new RegExp(`<meta[^>]*content=["']([^"']+)["'][^>]*name=["']${name}["']`, 'i'));
  return match ? match[1] : '';
}

/**
 * Generate cache key for URL
 */
function generateCacheKey(url) {
  return crypto.createHash('md5').update(url).digest('hex').slice(0, 16);
}

/**
 * Get cached result for URL
 */
export function getCachedResult(url) {
  const cacheKey = generateCacheKey(url);
  const cacheFile = path.join(SCRAPER_CACHE_DIR, `${cacheKey}.json`);

  if (fs.existsSync(cacheFile)) {
    try {
      const data = JSON.parse(fs.readFileSync(cacheFile, 'utf-8'));
      // Check if cache is still valid (24 hours)
      const age = Date.now() - new Date(data.timestamp).getTime();
      if (age < 24 * 60 * 60 * 1000) {
        return { ...data, cached: true };
      }
    } catch (e) {}
  }
  return null;
}

/**
 * Clear scraper cache
 */
export function clearCache() {
  try {
    const files = fs.readdirSync(SCRAPER_CACHE_DIR);
    for (const file of files) {
      fs.unlinkSync(path.join(SCRAPER_CACHE_DIR, file));
    }
    return { success: true, message: `Cleared ${files.length} cached pages` };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Extract structured data from scraped content using LLM
 */
export async function extractStructuredData(scrapedContent, schema) {
  // This would typically use an LLM to extract structured data
  // For now, return a placeholder
  return {
    extracted: false,
    message: 'Use LLM to extract structured data from:',
    contentPreview: scrapedContent.text?.slice(0, 500),
    suggestedSchema: schema
  };
}

/**
 * Scrape multiple URLs in parallel
 */
export async function scrapeMultiple(urls, options = {}) {
  const results = await Promise.all(
    urls.map(url => scrapeUrl(url, options))
  );
  return results;
}

export default {
  scrapeUrl,
  scrapeMultiple,
  getCachedResult,
  clearCache,
  extractStructuredData
};
