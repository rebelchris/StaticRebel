// Hybrid Memory System - Combines Vector + Keyword Search
//
// Features:
// - Vector embeddings for semantic similarity (via Ollama or fallback)
// - Keyword matching for exact term retrieval
// - Combined scoring for "best of both worlds" results
//
// Inspired by OpenClaw's hybrid memory approach.

import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import { createHash } from 'crypto';

// Import the real embeddings provider
import * as embeddings from './embeddings.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CONFIG_DIR = path.join(os.homedir(), '.static-rebel');
const VECTOR_DIR = path.join(CONFIG_DIR, 'vector-memory');

// Simple embedding storage (in production, use ChromaDB or Qdrant)
let embeddingCache = new Map();

// ============================================================================
// Keyword Index (for fast exact matching)
// ============================================================================

let keywordIndex = new Map(); // word -> Set of memory IDs

/**
 * Build keyword index for a memory item
 */
function buildKeywordIndex(memory) {
  // Extract words from content
  const words = memory.content
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2);

  for (const word of words) {
    if (!keywordIndex.has(word)) {
      keywordIndex.set(word, new Set());
    }
    keywordIndex.get(word).add(memory.id);
  }
}

/**
 * Remove memory from keyword index
 */
function removeFromKeywordIndex(memoryId) {
  for (const [word, ids] of keywordIndex) {
    ids.delete(memoryId);
    if (ids.size === 0) {
      keywordIndex.delete(word);
    }
  }
}

/**
 * Search by exact keyword match
 */
function keywordSearch(query, options = {}) {
  const { limit = 10, type = null } = options;
  const queryWords = query.toLowerCase().split(/\s+/);
  const matchedIds = new Map(); // memoryId -> match count

  for (const word of queryWords) {
    const ids = keywordIndex.get(word);
    if (ids) {
      for (const id of ids) {
        matchedIds.set(id, (matchedIds.get(id) || 0) + 1);
      }
    }
  }

  // Filter by type if specified
  if (type) {
    for (const [id] of matchedIds) {
      const memory = embeddingCache.get(id);
      if (!memory || memory.metadata.type !== type) {
        matchedIds.delete(id);
      }
    }
  }

  // Sort by match count and limit
  return Array.from(matchedIds.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([id, count]) => ({
      id,
      keywordScore: count / queryWords.length,
      matchType: count === queryWords.length ? 'exact' : 'partial',
    }));
}

// ============================================================================
// Hybrid Search (Vector + Keyword)
// ============================================================================

/**
 * Search with combined vector similarity and keyword matching
 * Returns results sorted by combined score
 */
export async function hybridSearch(query, options = {}) {
  const {
    limit = 5,
    minScore = 0.2,
    type = null,
    vectorWeight = 0.6,  // Weight for semantic similarity
    keywordWeight = 0.4, // Weight for keyword match
  } = options;

  // Load all memories from disk
  const memoriesFile = path.join(VECTOR_DIR, 'memories.jsonl');
  const memories = [];

  try {
    const content = fs.readFileSync(memoriesFile, 'utf-8').trim();
    if (content) {
      const lines = content.split('\n');
      for (const line of lines) {
        try {
          memories.push(JSON.parse(line));
        } catch {}
      }
    }
  } catch {}

  // Build keyword index from loaded memories
  keywordIndex.clear();
  for (const memory of memories) {
    buildKeywordIndex(memory);
  }

  // Get keyword matches
  const keywordResults = keywordSearch(query, { limit: limit * 2, type });
  const keywordMatchIds = new Set(keywordResults.map((r) => r.id));

  // Generate query embedding
  const queryEmbedding = await generateEmbedding(query);
  const results = [];

  for (const memory of memories) {
    // Filter by type if specified
    if (type && memory.metadata.type !== type) {
      continue;
    }

    // Calculate vector similarity
    const vectorScore = cosineSimilarity(queryEmbedding, memory.embedding);

    // Get keyword score
    const keywordResult = keywordResults.find((r) => r.id === memory.id);
    const keywordScore = keywordResult ? keywordResult.keywordScore : 0;

    // Combined score (weighted average)
    const combinedScore =
      vectorScore * vectorWeight + keywordScore * keywordWeight;

    if (combinedScore >= minScore) {
      results.push({
        ...memory,
        vectorScore,
        keywordScore,
        keywordMatchType: keywordResult?.matchType || null,
        combinedScore,
      });
    }
  }

  // Sort by combined score and limit
  results.sort((a, b) => b.combinedScore - a.combinedScore);
  return results.slice(0, limit);
}

// Initialize vector memory system
export function initVectorMemory() {
  if (!fs.existsSync(VECTOR_DIR)) {
    fs.mkdirSync(VECTOR_DIR, { recursive: true });
  }
  // Create indexes directory
  const indexesDir = path.join(VECTOR_DIR, 'indexes');
  if (!fs.existsSync(indexesDir)) {
    fs.mkdirSync(indexesDir, { recursive: true });
  }
}

// Generate embedding using real Ollama embeddings (with fallback)
// Uses the embeddings provider from lib/embeddings.js
export async function generateEmbedding(text) {
  return embeddings.generateEmbedding(text);
}

/**
 * Get embedding provider status (useful for debugging)
 */
export function getEmbeddingStatus() {
  return embeddings.getStatus();
}

// Cosine similarity between two vectors (optimized with typed arrays)
export function cosineSimilarity(a, b) {
  if (a.length !== b.length) return 0;

  // Use Float32Array for better performance
  const vecA = a instanceof Float32Array ? a : new Float32Array(a);
  const vecB = b instanceof Float32Array ? b : new Float32Array(b);

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  // Single loop for all calculations
  for (let i = 0; i < vecA.length; i++) {
    const ai = vecA[i];
    const bi = vecB[i];
    dotProduct += ai * bi;
    normA += ai * ai;
    normB += bi * bi;
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  return denominator === 0 ? 0 : dotProduct / denominator;
}

// Optimized cosine similarity for pre-normalized vectors
export function cosineSimilarityFast(a, b) {
  if (a.length !== b.length) return 0;

  const vecA = a instanceof Float32Array ? a : new Float32Array(a);
  const vecB = b instanceof Float32Array ? b : new Float32Array(b);

  let dotProduct = 0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
  }

  return dotProduct;
}

// Add memory to vector store
export async function addMemory(content, metadata = {}) {
  const embedding = await generateEmbedding(content);
  const id = createHash('sha256')
    .update(content + Date.now())
    .digest('hex')
    .slice(0, 16);

  const memoryItem = {
    id,
    content,
    embedding,
    metadata: {
      ...metadata,
      timestamp: new Date().toISOString(),
      type: metadata.type || 'general',
    },
  };

  // Store in memory map
  embeddingCache.set(id, memoryItem);

  // Build keyword index for hybrid search
  buildKeywordIndex(memoryItem);

  // Persist to disk
  const memoriesFile = path.join(VECTOR_DIR, 'memories.jsonl');
  fs.appendFileSync(memoriesFile, JSON.stringify(memoryItem) + '\n');

  return { id, success: true };
}

// Search memories by semantic similarity
export async function searchMemories(query, options = {}) {
  const { limit = 5, minScore = 0.3, type = null } = options;

  const queryEmbedding = await generateEmbedding(query);
  const results = [];

  // Load all memories from disk
  const memoriesFile = path.join(VECTOR_DIR, 'memories.jsonl');

  try {
    const lines = fs.readFileSync(memoriesFile, 'utf-8').trim().split('\n');

    for (const line of lines) {
      try {
        const memory = JSON.parse(line);

        // Filter by type if specified
        if (type && memory.metadata.type !== type) {
          continue;
        }

        const score = cosineSimilarity(queryEmbedding, memory.embedding);

        if (score >= minScore) {
          results.push({
            ...memory,
            score,
          });
        }
      } catch (e) {
        // Skip malformed lines
      }
    }
  } catch (e) {
    // File doesn't exist yet
  }

  // Sort by score and limit
  results.sort((a, b) => b.score - a.score);
  return results.slice(0, limit);
}

// Get all memories of a specific type
export function getMemoriesByType(type) {
  const results = [];
  const memoriesFile = path.join(VECTOR_DIR, 'memories.jsonl');

  try {
    const lines = fs.readFileSync(memoriesFile, 'utf-8').trim().split('\n');

    for (const line of lines) {
      try {
        const memory = JSON.parse(line);
        if (memory.metadata.type === type) {
          results.push(memory);
        }
      } catch (e) {}
    }
  } catch (e) {}

  return results;
}

// Delete a memory
export function deleteMemory(id) {
  const memoriesFile = path.join(VECTOR_DIR, 'memories.jsonl');

  try {
    const lines = fs.readFileSync(memoriesFile, 'utf-8').trim().split('\n');
    const newLines = lines.filter((line) => {
      const memory = JSON.parse(line);
      return memory.id !== id;
    });

    fs.writeFileSync(memoriesFile, newLines.join('\n'));
    embeddingCache.delete(id);
    return true;
  } catch (e) {
    return false;
  }
}

// Get memory statistics
export function getMemoryStats() {
  const stats = {
    totalMemories: 0,
    byType: {},
    oldestMemory: null,
    newestMemory: null,
  };

  const memoriesFile = path.join(VECTOR_DIR, 'memories.jsonl');

  try {
    const lines = fs.readFileSync(memoriesFile, 'utf-8').trim().split('\n');

    for (const line of lines) {
      try {
        const memory = JSON.parse(line);
        stats.totalMemories++;

        const type = memory.metadata.type || 'general';
        stats.byType[type] = (stats.byType[type] || 0) + 1;

        const timestamp = new Date(memory.metadata.timestamp);
        if (!stats.oldestMemory || timestamp < stats.oldestMemory) {
          stats.oldestMemory = memory.metadata.timestamp;
        }
        if (!stats.newestMemory || timestamp > stats.newestMemory) {
          stats.newestMemory = memory.metadata.timestamp;
        }
      } catch (e) {}
    }
  } catch (e) {}

  return stats;
}

// Store user preference in vector memory
export async function rememberPreference(key, value, context = '') {
  const content = `User preference: ${key} = ${value}. Context: ${context}`;
  return addMemory(content, { type: 'preference', key, context });
}

// Recall preferences related to a query
export async function recallPreferences(query) {
  return searchMemories(query, { limit: 5, type: 'preference' });
}

// Store project context
export async function rememberProject(projectName, details) {
  const content = `Project "${projectName}": ${JSON.stringify(details)}`;
  return addMemory(content, { type: 'project', projectName });
}

// Search project memories
export async function recallProjects(query) {
  return searchMemories(query, { limit: 5, type: 'project' });
}

// Clear all memories
export function clearAllMemories() {
  const memoriesFile = path.join(VECTOR_DIR, 'memories.jsonl');
  if (fs.existsSync(memoriesFile)) {
    fs.unlinkSync(memoriesFile);
  }
  embeddingCache.clear();
  return { success: true };
}

// Export memories to JSON
export function exportMemories() {
  const memoriesFile = path.join(VECTOR_DIR, 'memories.jsonl');

  try {
    const lines = fs.readFileSync(memoriesFile, 'utf-8').trim().split('\n');
    return lines.map((line) => JSON.parse(line));
  } catch (e) {
    return [];
  }
}

// Import memories from JSON
export function importMemories(memories) {
  const memoriesFile = path.join(VECTOR_DIR, 'memories.jsonl');

  for (const memory of memories) {
    fs.appendFileSync(memoriesFile, JSON.stringify(memory) + '\n');
  }

  return { imported: memories.length };
}

// ============================================================================
// Keyword Index Rebuild (for file watcher re-indexing)
// ============================================================================

/**
 * Rebuild keyword index from disk
 * Called by memoryManager.js when vector memory files change
 */
export function rebuildKeywordIndexFromDisk() {
  const memoriesFile = path.join(VECTOR_DIR, 'memories.jsonl');

  try {
    if (!fs.existsSync(memoriesFile)) {
      return { rebuilt: false };
    }

    const content = fs.readFileSync(memoriesFile, 'utf-8').trim();
    if (!content) {
      return { rebuilt: false };
    }

    // Clear and rebuild keyword index
    keywordIndex.clear();
    const lines = content.split('\n');
    let count = 0;

    for (const line of lines) {
      try {
        const memory = JSON.parse(line);
        buildKeywordIndex(memory);
        count++;
      } catch {}
    }

    return { rebuilt: true, memoriesIndexed: count };
  } catch (error) {
    return { rebuilt: false, error: error.message };
  }
}

/**
 * Get keyword index statistics
 */
export function getKeywordIndexStats() {
  return {
    totalWords: keywordIndex.size,
    words: Array.from(keywordIndex.keys()).slice(0, 20),
  };
}

/**
 * Get all memories (for dashboard compatibility)
 */
export async function getAllMemories(options = {}) {
  const { limit = 100, type = null } = options;
  const memories = [];

  // Get from embedding cache
  for (const [id, memory] of embeddingCache) {
    if (type && memory.metadata?.type !== type) continue;
    memories.push({
      id,
      content: memory.content,
      timestamp: memory.timestamp,
      metadata: memory.metadata,
      score: 1.0,
    });
  }

  // Sort by timestamp descending
  memories.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  return memories.slice(0, limit);
}

/**
 * Configure the embeddings provider
 * @param {Object} options - Configuration options
 * @param {string} options.ollamaUrl - Ollama server URL (default: http://localhost:11434)
 * @param {string} options.model - Embedding model name (default: nomic-embed-text)
 */
export function configureEmbeddings(options = {}) {
  embeddings.configure(options);
}

/**
 * Check if Ollama embeddings are available
 * @returns {Promise<boolean>}
 */
export async function checkEmbeddingsAvailable() {
  return embeddings.probeOllama();
}
