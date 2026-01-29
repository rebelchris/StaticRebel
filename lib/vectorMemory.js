// Vector Memory System - Semantic Memory using Embeddings
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import { createHash } from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CONFIG_DIR = path.join(os.homedir(), '.static-rebel');
const VECTOR_DIR = path.join(CONFIG_DIR, 'vector-memory');

// Simple embedding storage (in production, use ChromaDB or Qdrant)
let embeddingCache = new Map();

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

// Generate a simple hash-based embedding (for semantic similarity)
// In production, use actual embeddings from Ollama's embedding endpoint
export async function generateEmbedding(text) {
  // Normalize text for consistent hashing
  const normalized = text.toLowerCase().trim();

  // Create a simple vector representation based on word patterns
  // This is a placeholder - real implementation would use Ollama embeddings
  const words = normalized.split(/\s+/);
  const wordFreq = {};

  for (const word of words) {
    wordFreq[word] = (wordFreq[word] || 0) + 1;
  }

  // Create a 384-dimensional sparse vector (MiniLM-Large size)
  const vector = new Array(384).fill(0);

  // Use hash to determine dimensions
  let dimIndex = 0;
  for (const [word, freq] of Object.entries(wordFreq)) {
    const hash = createHash('sha256').update(word).digest();
    dimIndex = parseInt(hash.slice(0, 4), 16) % 384;
    vector[dimIndex] += freq;
  }

  // Normalize
  const magnitude = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
  if (magnitude > 0) {
    for (let i = 0; i < vector.length; i++) {
      vector[i] /= magnitude;
    }
  }

  return vector;
}

// Cosine similarity between two vectors
export function cosineSimilarity(a, b) {
  if (a.length !== b.length) return 0;

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

// Add memory to vector store
export async function addMemory(content, metadata = {}) {
  const embedding = await generateEmbedding(content);
  const id = createHash('sha256').update(content + Date.now()).digest('hex').slice(0, 16);

  const memoryItem = {
    id,
    content,
    embedding,
    metadata: {
      ...metadata,
      timestamp: new Date().toISOString(),
      type: metadata.type || 'general'
    }
  };

  // Store in memory map
  embeddingCache.set(id, memoryItem);

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
            score
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
    const newLines = lines.filter(line => {
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
    newestMemory: null
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
    return lines.map(line => JSON.parse(line));
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
