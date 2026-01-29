/**
 * Knowledge Plugins - External knowledge source integration
 *
 * Features:
 * - Plugin architecture for external knowledge sources
 * - StackOverflow integration
 * - Official documentation fetching
 * - Release notes extraction
 * - Source credibility scoring
 *
 * @module knowledgePlugins
 */

import { EventEmitter } from 'events';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

// ============================================================================
// Configuration
// ============================================================================

const CACHE_DIR = path.join(os.homedir(), '.static-rebel', 'knowledge-cache');
const DEFAULT_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

// ============================================================================
// Types & Interfaces
// ============================================================================

/**
 * @typedef {Object} KnowledgeSource
 * @property {string} name - Source name
 * @property {string} type - Source type ('web', 'api', 'local')
 * @property {Function} search - Search function
 * @property {Function} fetch - Fetch function
 * @property {number} credibility - Credibility score 0-1
 * @property {number} cacheTTL - Cache TTL in ms
 */

/**
 * @typedef {Object} KnowledgeResult
 * @property {string} source - Source name
 * @property {string} title - Result title
 * @property {string} content - Result content
 * @property {string} url - Source URL
 * @property {Date} timestamp - When fetched
 * @property {number} credibility - Credibility score
 * @property {Object} metadata - Additional metadata
 */

// ============================================================================
// Cache Management
// ============================================================================

/**
 * Initialize knowledge cache
 */
async function initCache() {
  await fs.mkdir(CACHE_DIR, { recursive: true });
}

/**
 * Get cache key for a query
 * @param {string} source - Source name
 * @param {string} query - Query string
 * @returns {string}
 */
function getCacheKey(source, query) {
  return `${source}_${Buffer.from(query).toString('base64').replace(/[/+=]/g, '_')}.json`;
}

/**
 * Get cached result
 * @param {string} source - Source name
 * @param {string} query - Query string
 * @param {number} ttl - Cache TTL
 * @returns {Promise<KnowledgeResult[]|null>}
 */
async function getCached(source, query, ttl = DEFAULT_CACHE_TTL) {
  try {
    const cacheKey = getCacheKey(source, query);
    const cachePath = path.join(CACHE_DIR, cacheKey);

    const data = await fs.readFile(cachePath, 'utf-8');
    const cached = JSON.parse(data);

    // Check if cache is still valid
    if (Date.now() - cached.timestamp < ttl) {
      return cached.results;
    }
  } catch {
    // Cache miss or error
  }

  return null;
}

/**
 * Cache results
 * @param {string} source - Source name
 * @param {string} query - Query string
 * @param {KnowledgeResult[]} results - Results to cache
 */
async function setCached(source, query, results) {
  try {
    const cacheKey = getCacheKey(source, query);
    const cachePath = path.join(CACHE_DIR, cacheKey);

    await fs.writeFile(cachePath, JSON.stringify({
      timestamp: Date.now(),
      results,
    }, null, 2));
  } catch (error) {
    console.error('[KnowledgePlugins] Failed to cache results:', error.message);
  }
}

/**
 * Clear expired cache entries
 */
async function clearExpiredCache() {
  try {
    const files = await fs.readdir(CACHE_DIR);

    for (const file of files) {
      try {
        const cachePath = path.join(CACHE_DIR, file);
        const data = await fs.readFile(cachePath, 'utf-8');
        const cached = JSON.parse(data);

        if (Date.now() - cached.timestamp > DEFAULT_CACHE_TTL) {
          await fs.unlink(cachePath);
        }
      } catch {
        // Skip invalid cache files
      }
    }
  } catch {
    // Directory might not exist
  }
}

// ============================================================================
// StackOverflow Plugin
// ============================================================================

/**
 * Search StackOverflow
 * @param {string} query - Search query
 * @param {Object} options - Search options
 * @returns {Promise<KnowledgeResult[]>}
 */
async function searchStackOverflow(query, options = {}) {
  const cacheKey = `stackoverflow_${query}`;
  const cached = await getCached('stackoverflow', query);
  if (cached) return cached;

  try {
    // Stack Exchange API
    const searchUrl = new URL('https://api.stackexchange.com/2.3/search/advanced');
    searchUrl.searchParams.set('q', query);
    searchUrl.searchParams.set('site', 'stackoverflow');
    searchUrl.searchParams.set('pagesize', options.maxResults || 5);
    searchUrl.searchParams.set('order', 'desc');
    searchUrl.searchParams.set('sort', 'relevance');
    searchUrl.searchParams.set('filter', 'withbody');

    const response = await fetch(searchUrl.toString());

    if (!response.ok) {
      throw new Error(`StackOverflow API error: ${response.statusText}`);
    }

    const data = await response.json();

    const results = (data.items || []).map(item => ({
      source: 'stackoverflow',
      title: item.title,
      content: item.body?.substring(0, 1000) || '',
      url: item.link,
      timestamp: new Date(),
      credibility: 0.8,
      metadata: {
        score: item.score,
        answerCount: item.answer_count,
        viewCount: item.view_count,
        tags: item.tags,
        isAnswered: item.is_answered,
      },
    }));

    await setCached('stackoverflow', query, results);
    return results;
  } catch (error) {
    console.error('[KnowledgePlugins] StackOverflow search failed:', error.message);
    return [];
  }
}

/**
 * Get StackOverflow answers for a question
 * @param {number} questionId - Question ID
 * @returns {Promise<KnowledgeResult[]>}
 */
async function getStackOverflowAnswers(questionId) {
  try {
    const url = new URL(`https://api.stackexchange.com/2.3/questions/${questionId}/answers`);
    url.searchParams.set('site', 'stackoverflow');
    url.searchParams.set('order', 'desc');
    url.searchParams.set('sort', 'votes');
    url.searchParams.set('filter', 'withbody');

    const response = await fetch(url.toString());

    if (!response.ok) {
      throw new Error(`StackOverflow API error: ${response.statusText}`);
    }

    const data = await response.json();

    return (data.items || []).map(item => ({
      source: 'stackoverflow-answer',
      title: `Answer to question ${questionId}`,
      content: item.body?.substring(0, 2000) || '',
      url: `https://stackoverflow.com/a/${item.answer_id}`,
      timestamp: new Date(),
      credibility: item.is_accepted ? 0.95 : 0.7,
      metadata: {
        score: item.score,
        isAccepted: item.is_accepted,
        author: item.owner?.display_name,
      },
    }));
  } catch (error) {
    console.error('[KnowledgePlugins] Failed to get answers:', error.message);
    return [];
  }
}

// ============================================================================
// Documentation Plugin
// ============================================================================

/**
 * Fetch documentation from various sources
 * @param {string} packageName - Package name
 * @param {string} [version] - Package version
 * @returns {Promise<KnowledgeResult[]>}
 */
async function fetchDocumentation(packageName, version = null) {
  const cacheKey = `docs_${packageName}_${version || 'latest'}`;
  const cached = await getCached('documentation', cacheKey);
  if (cached) return cached;

  const results = [];

  // Try npm registry for README
  try {
    const npmUrl = `https://registry.npmjs.org/${packageName}`;
    const response = await fetch(npmUrl);

    if (response.ok) {
      const data = await response.json();
      const pkgVersion = version || data['dist-tags']?.latest;
      const versionData = data.versions?.[pkgVersion];

      if (versionData) {
        results.push({
          source: 'npm',
          title: `${packageName}@${pkgVersion}`,
          content: versionData.readme?.substring(0, 5000) || 'No README available',
          url: `https://www.npmjs.com/package/${packageName}`,
          timestamp: new Date(),
          credibility: 0.9,
          metadata: {
            version: pkgVersion,
            homepage: versionData.homepage,
            repository: versionData.repository,
          },
        });
      }
    }
  } catch (error) {
    console.error('[KnowledgePlugins] NPM fetch failed:', error.message);
  }

  await setCached('documentation', cacheKey, results);
  return results;
}

/**
 * Fetch MDN documentation
 * @param {string} topic - Topic to search
 * @returns {Promise<KnowledgeResult[]>}
 */
async function fetchMDN(topic) {
  const cacheKey = `mdn_${topic}`;
  const cached = await getCached('mdn', cacheKey);
  if (cached) return cached;

  try {
    // MDN search API
    const searchUrl = `https://developer.mozilla.org/api/v1/search?q=${encodeURIComponent(topic)}&locale=en-US`;
    const response = await fetch(searchUrl);

    if (!response.ok) {
      throw new Error(`MDN API error: ${response.statusText}`);
    }

    const data = await response.json();

    const results = (data.documents || []).slice(0, 3).map(doc => ({
      source: 'mdn',
      title: doc.title,
      content: doc.summary || '',
      url: `https://developer.mozilla.org${doc.mdn_url}`,
      timestamp: new Date(),
      credibility: 0.95,
      metadata: {
        slug: doc.slug,
        locale: doc.locale,
      },
    }));

    await setCached('mdn', cacheKey, results);
    return results;
  } catch (error) {
    console.error('[KnowledgePlugins] MDN fetch failed:', error.message);
    return [];
  }
}

// ============================================================================
// Release Notes Plugin
// ============================================================================

/**
 * Fetch release notes for a package
 * @param {string} packageName - Package name
 * @param {string} [version] - Specific version
 * @returns {Promise<KnowledgeResult[]>}
 */
async function fetchReleaseNotes(packageName, version = null) {
  const cacheKey = `releases_${packageName}_${version || 'all'}`;
  const cached = await getCached('releases', cacheKey);
  if (cached) return cached;

  const results = [];

  // Try GitHub releases
  try {
    // Extract owner/repo from common patterns
    const npmUrl = `https://registry.npmjs.org/${packageName}`;
    const npmResponse = await fetch(npmUrl);

    if (npmResponse.ok) {
      const npmData = await npmResponse.json();
      const repoUrl = npmData.repository?.url || npmData.homepage;

      if (repoUrl && repoUrl.includes('github.com')) {
        const match = repoUrl.match(/github\.com[/:]([^/]+)\/([^/\.]+)/);
        if (match) {
          const [, owner, repo] = match;
          const releasesUrl = `https://api.github.com/repos/${owner}/${repo}/releases`;

          if (version) {
            // Get specific release
            const releaseUrl = `https://api.github.com/repos/${owner}/${repo}/releases/tags/${version}`;
            const releaseResponse = await fetch(releaseUrl);

            if (releaseResponse.ok) {
              const release = await releaseResponse.json();
              results.push({
                source: 'github-releases',
                title: `${packageName} ${release.tag_name}`,
                content: release.body?.substring(0, 5000) || 'No release notes',
                url: release.html_url,
                timestamp: new Date(release.published_at),
                credibility: 0.9,
                metadata: {
                  version: release.tag_name,
                  prerelease: release.prerelease,
                  author: release.author?.login,
                },
              });
            }
          } else {
            // Get recent releases
            const releasesResponse = await fetch(releasesUrl);

            if (releasesResponse.ok) {
              const releases = await releasesResponse.json();
              results.push(...releases.slice(0, 3).map(release => ({
                source: 'github-releases',
                title: `${packageName} ${release.tag_name}`,
                content: release.body?.substring(0, 3000) || 'No release notes',
                url: release.html_url,
                timestamp: new Date(release.published_at),
                credibility: 0.9,
                metadata: {
                  version: release.tag_name,
                  prerelease: release.prerelease,
                },
              })));
            }
          }
        }
      }
    }
  } catch (error) {
    console.error('[KnowledgePlugins] Release notes fetch failed:', error.message);
  }

  await setCached('releases', cacheKey, results);
  return results;
}

// ============================================================================
// Knowledge Plugin Manager
// ============================================================================

class KnowledgePluginManager extends EventEmitter {
  constructor() {
    super();
    this.sources = new Map();
    this.defaultSources = ['stackoverflow', 'documentation', 'mdn', 'releases'];

    // Register built-in sources
    this.registerSource({
      name: 'stackoverflow',
      type: 'api',
      search: searchStackOverflow,
      fetch: getStackOverflowAnswers,
      credibility: 0.8,
      cacheTTL: 24 * 60 * 60 * 1000,
    });

    this.registerSource({
      name: 'documentation',
      type: 'api',
      search: fetchDocumentation,
      fetch: fetchDocumentation,
      credibility: 0.9,
      cacheTTL: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    this.registerSource({
      name: 'mdn',
      type: 'api',
      search: fetchMDN,
      fetch: fetchMDN,
      credibility: 0.95,
      cacheTTL: 30 * 24 * 60 * 60 * 1000, // 30 days
    });

    this.registerSource({
      name: 'releases',
      type: 'api',
      search: fetchReleaseNotes,
      fetch: fetchReleaseNotes,
      credibility: 0.9,
      cacheTTL: 24 * 60 * 60 * 1000,
    });

    // Initialize cache
    initCache();
  }

  /**
   * Register a knowledge source
   * @param {KnowledgeSource} source - Source to register
   */
  registerSource(source) {
    this.sources.set(source.name, source);
    this.emit('source:registered', source);
  }

  /**
   * Unregister a knowledge source
   * @param {string} name - Source name
   */
  unregisterSource(name) {
    this.sources.delete(name);
    this.emit('source:unregistered', { name });
  }

  /**
   * Get registered sources
   * @returns {KnowledgeSource[]}
   */
  getSources() {
    return Array.from(this.sources.values());
  }

  /**
   * Search across knowledge sources
   * @param {string} query - Search query
   * @param {Object} options - Search options
   * @returns {Promise<KnowledgeResult[]>}
   */
  async search(query, options = {}) {
    const sources = options.sources || this.defaultSources;
    const results = [];

    // Search each source
    const searchPromises = sources.map(async (sourceName) => {
      const source = this.sources.get(sourceName);
      if (!source) return [];

      try {
        this.emit('search:started', { source: sourceName, query });
        const sourceResults = await source.search(query, options);
        this.emit('search:completed', { source: sourceName, count: sourceResults.length });
        return sourceResults;
      } catch (error) {
        this.emit('search:error', { source: sourceName, error: error.message });
        return [];
      }
    });

    const allResults = await Promise.all(searchPromises);

    // Flatten and sort by credibility
    const flatResults = allResults.flat();
    flatResults.sort((a, b) => b.credibility - a.credibility);

    return flatResults;
  }

  /**
   * Fetch specific information from a source
   * @param {string} sourceName - Source name
   * @param {string} identifier - Item identifier
   * @param {Object} options - Fetch options
   * @returns {Promise<KnowledgeResult[]>}
   */
  async fetch(sourceName, identifier, options = {}) {
    const source = this.sources.get(sourceName);
    if (!source) {
      throw new Error(`Unknown source: ${sourceName}`);
    }

    return source.fetch(identifier, options);
  }

  /**
   * Clear all caches
   */
  async clearCache() {
    await clearExpiredCache();
    this.emit('cache:cleared');
  }

  /**
   * Get source credibility score
   * @param {string} sourceName - Source name
   * @returns {number}
   */
  getCredibility(sourceName) {
    const source = this.sources.get(sourceName);
    return source?.credibility || 0.5;
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Format knowledge results for AI consumption
 * @param {KnowledgeResult[]} results - Results to format
 * @param {number} maxLength - Maximum total length
 * @returns {string}
 */
export function formatResultsForAI(results, maxLength = 4000) {
  let formatted = '';

  for (const result of results) {
    const entry = `\n--- ${result.source} ---\n`;
    const title = `Title: ${result.title}\n`;
    const content = `Content: ${result.content.substring(0, 1000)}\n`;
    const url = `URL: ${result.url}\n`;
    const credibility = `Credibility: ${(result.credibility * 100).toFixed(0)}%\n`;

    const entryText = entry + title + content + url + credibility;

    if (formatted.length + entryText.length > maxLength) {
      break;
    }

    formatted += entryText;
  }

  return formatted || 'No results found.';
}

/**
 * Filter results by minimum credibility
 * @param {KnowledgeResult[]} results - Results to filter
 * @param {number} minCredibility - Minimum credibility (0-1)
 * @returns {KnowledgeResult[]}
 */
export function filterByCredibility(results, minCredibility = 0.7) {
  return results.filter(r => r.credibility >= minCredibility);
}

/**
 * Get related topics from results
 * @param {KnowledgeResult[]} results - Results to analyze
 * @returns {string[]}
 */
export function extractRelatedTopics(results) {
  const topics = new Set();

  for (const result of results) {
    if (result.metadata?.tags) {
      result.metadata.tags.forEach(tag => topics.add(tag));
    }
  }

  return Array.from(topics).slice(0, 10);
}

// ============================================================================
// Singleton Export
// ============================================================================

const pluginManager = new KnowledgePluginManager();

export default pluginManager;

// Named exports
export {
  KnowledgePluginManager,
  searchStackOverflow,
  getStackOverflowAnswers,
  fetchDocumentation,
  fetchMDN,
  fetchReleaseNotes,
  initCache,
  clearExpiredCache,
};
