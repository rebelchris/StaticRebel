/**
 * Searcher Agent - Specialized agent for web search and knowledge retrieval
 *
 * Responsibilities:
 * - Search the web for information
 * - Fetch documentation
 * - Query knowledge bases
 * - Retrieve release notes
 *
 * @module agents/specialized/searcher
 */

import agentRegistry, { AGENT_TYPES, MESSAGE_TYPES } from '../../lib/agentRegistry.js';
import knowledgePlugins from '../../lib/knowledgePlugins.js';
import { searchSimilar } from '../../lib/repositoryIndexer.js';

/**
 * Create and register the searcher agent
 * @returns {Object} Agent instance
 */
export function createSearcherAgent() {
  const agent = agentRegistry.registerAgent({
    name: 'SearcherAgent',
    type: AGENT_TYPES.SEARCHER,
    capabilities: [
      'web_search',
      'search_documentation',
      'search_stackoverflow',
      'fetch_release_notes',
      'search_repository',
      'query_knowledge_base',
    ],
    handler: handleMessage,
  });

  return agent;
}

/**
 * Handle incoming messages
 * @param {Object} message - Agent message
 * @returns {Promise<Object>}
 */
async function handleMessage(message) {
  const { type, payload } = message;

  switch (type) {
    case MESSAGE_TYPES.TASK_ASSIGN:
      return handleTask(payload);

    case MESSAGE_TYPES.QUERY:
      return handleQuery(payload);

    default:
      return { status: 'ignored', reason: 'Unknown message type' };
  }
}

/**
 * Handle task assignment
 * @param {Object} payload - Task payload
 * @returns {Promise<Object>}
 */
async function handleTask(payload) {
  const { taskId, type, data } = payload;

  try {
    agentRegistry.updateTask(taskId, 'running');

    let result;

    switch (type) {
      case 'web_search':
        result = await webSearchTask(data);
        break;

      case 'search_documentation':
        result = await searchDocumentationTask(data);
        break;

      case 'search_stackoverflow':
        result = await searchStackOverflowTask(data);
        break;

      case 'fetch_release_notes':
        result = await fetchReleaseNotesTask(data);
        break;

      case 'search_repository':
        result = await searchRepositoryTask(data);
        break;

      case 'query_knowledge_base':
        result = await queryKnowledgeBaseTask(data);
        break;

      default:
        throw new Error(`Unknown task type: ${type}`);
    }

    agentRegistry.completeTask(taskId, result);
    return result;

  } catch (error) {
    agentRegistry.failTask(taskId, error.message);
    throw error;
  }
}

/**
 * Handle queries
 * @param {Object} payload - Query payload
 * @returns {Promise<Object>}
 */
async function handleQuery(payload) {
  const { type, data } = payload;

  switch (type) {
    case 'quick_search':
      return quickSearch(data.query);

    case 'get_documentation':
      return getDocumentation(data.package, data.version);

    case 'find_code_examples':
      return findCodeExamples(data.topic);

    default:
      return { error: 'Unknown query type' };
  }
}

// ============================================================================
// Task Implementations
// ============================================================================

/**
 * Web search task
 * @param {Object} data - Task data
 * @returns {Promise<Object>}
 */
async function webSearchTask(data) {
  const { query, maxResults = 5, sources } = data;

  const results = await knowledgePlugins.search(query, {
    maxResults,
    sources: sources || ['stackoverflow', 'mdn', 'documentation'],
  });

  return {
    query,
    results: results.map(r => ({
      source: r.source,
      title: r.title,
      content: r.content.substring(0, 500),
      url: r.url,
      credibility: r.credibility,
    })),
    total: results.length,
  };
}

/**
 * Search documentation task
 * @param {Object} data - Task data
 * @returns {Promise<Object>}
 */
async function searchDocumentationTask(data) {
  const { package: packageName, version, topic } = data;

  const results = await knowledgePlugins.fetch('documentation', packageName, { version });

  // If topic specified, filter or search within results
  let filtered = results;
  if (topic && results.length > 0) {
    const topicLower = topic.toLowerCase();
    filtered = results.filter(r =>
      r.title.toLowerCase().includes(topicLower) ||
      r.content.toLowerCase().includes(topicLower)
    );
  }

  return {
    package: packageName,
    version,
    topic,
    results: filtered.map(r => ({
      title: r.title,
      content: r.content.substring(0, 1000),
      url: r.url,
    })),
    found: filtered.length > 0,
  };
}

/**
 * Search StackOverflow task
 * @param {Object} data - Task data
 * @returns {Promise<Object>}
 */
async function searchStackOverflowTask(data) {
  const { query, maxResults = 5, includeAnswers = true } = data;

  const results = await knowledgePlugins.search(query, {
    maxResults,
    sources: ['stackoverflow'],
  });

  let enrichedResults = results;

  // Fetch answers for top questions if requested
  if (includeAnswers && results.length > 0) {
    const topQuestion = results[0];
    if (topQuestion.metadata?.answerCount > 0) {
      // Extract question ID from URL
      const match = topQuestion.url.match(/questions\/(\d+)/);
      if (match) {
        const questionId = parseInt(match[1]);
        const answers = await knowledgePlugins.fetch('stackoverflow', questionId);
        enrichedResults = [...results, ...answers];
      }
    }
  }

  return {
    query,
    results: enrichedResults.map(r => ({
      source: r.source,
      title: r.title,
      content: r.content.substring(0, 800),
      url: r.url,
      score: r.metadata?.score,
      isAccepted: r.metadata?.isAccepted,
    })),
    total: enrichedResults.length,
  };
}

/**
 * Fetch release notes task
 * @param {Object} data - Task data
 * @returns {Promise<Object>}
 */
async function fetchReleaseNotesTask(data) {
  const { package: packageName, version } = data;

  const results = await knowledgePlugins.fetch('releases', packageName, { version });

  return {
    package: packageName,
    version: version || 'latest',
    results: results.map(r => ({
      version: r.metadata?.version || r.title,
      content: r.content.substring(0, 2000),
      url: r.url,
      date: r.timestamp,
      prerelease: r.metadata?.prerelease,
    })),
    found: results.length > 0,
  };
}

/**
 * Search repository task
 * @param {Object} data - Task data
 * @returns {Promise<Object>}
 */
async function searchRepositoryTask(data) {
  const { query, maxResults = 5 } = data;

  const results = await searchSimilar(query, maxResults);

  return {
    query,
    results: results.map(r => ({
      path: r.path,
      content: r.content.substring(0, 500),
      score: r.score,
      lines: `${r.startLine}-${r.endLine}`,
    })),
    total: results.length,
  };
}

/**
 * Query knowledge base task
 * @param {Object} data - Task data
 * @returns {Promise<Object>}
 */
async function queryKnowledgeBaseTask(data) {
  const { query, sources, maxResults = 10 } = data;

  // Search across all available sources
  const results = await knowledgePlugins.search(query, {
    maxResults,
    sources: sources || knowledgePlugins.getSources().map(s => s.name),
  });

  // Group by source
  const grouped = {};
  for (const result of results) {
    if (!grouped[result.source]) {
      grouped[result.source] = [];
    }
    grouped[result.source].push(result);
  }

  return {
    query,
    grouped: Object.entries(grouped).map(([source, items]) => ({
      source,
      count: items.length,
      topResult: items[0],
    })),
    total: results.length,
    topResults: results.slice(0, 3).map(r => ({
      source: r.source,
      title: r.title,
      url: r.url,
      credibility: r.credibility,
    })),
  };
}

// ============================================================================
// Query Helpers
// ============================================================================

/**
 * Quick search across sources
 * @param {string} query - Search query
 * @returns {Promise<Object>}
 */
async function quickSearch(query) {
  const results = await knowledgePlugins.search(query, {
    maxResults: 3,
    sources: ['stackoverflow', 'mdn'],
  });

  return {
    query,
    hasResults: results.length > 0,
    topResult: results[0] ? {
      source: results[0].source,
      title: results[0].title,
      snippet: results[0].content.substring(0, 200),
      url: results[0].url,
    } : null,
    total: results.length,
  };
}

/**
 * Get documentation for a package
 * @param {string} packageName - Package name
 * @param {string} version - Package version
 * @returns {Promise<Object>}
 */
async function getDocumentation(packageName, version) {
  const results = await knowledgePlugins.fetch('documentation', packageName, { version });

  if (results.length === 0) {
    return {
      found: false,
      package: packageName,
    };
  }

  const doc = results[0];
  return {
    found: true,
    package: packageName,
    version: doc.metadata?.version,
    readme: doc.content.substring(0, 3000),
    homepage: doc.metadata?.homepage,
    repository: doc.metadata?.repository,
  };
}

/**
 * Find code examples for a topic
 * @param {string} topic - Topic to search
 * @returns {Promise<Object>}
 */
async function findCodeExamples(topic) {
  // Search StackOverflow for code examples
  const results = await knowledgePlugins.search(`${topic} example code`, {
    maxResults: 5,
    sources: ['stackoverflow'],
  });

  // Extract code blocks from results
  const examples = [];
  for (const result of results) {
    const codeBlocks = result.content.match(/```[\s\S]*?```/g) || [];
    if (codeBlocks.length > 0) {
      examples.push({
        source: result.url,
        code: codeBlocks[0].replace(/```/g, '').trim(),
        context: result.title,
      });
    }
  }

  return {
    topic,
    examples: examples.slice(0, 3),
    total: examples.length,
  };
}

// ============================================================================
// Export
// ============================================================================

export default {
  createSearcherAgent,
};
