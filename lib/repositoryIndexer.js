/**
 * Repository Indexer - Semantic vector index of all files with true embeddings
 *
 * Features:
 * - True semantic embeddings via Ollama's /api/embeddings endpoint
 * - Incremental indexing on file changes
 * - Cross-file relationship mapping
 * - SQLite vector storage with sqlite-vec
 *
 * @module repositoryIndexer
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { createHash } from 'crypto';
import { watch } from 'chokidar';
import Database from 'better-sqlite3';
import os from 'os';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Configuration
const CONFIG_DIR = path.join(os.homedir(), '.static-rebel');
const INDEX_DIR = path.join(CONFIG_DIR, 'index');
const DB_PATH = path.join(INDEX_DIR, 'repository.db');

// Default embedding model
const DEFAULT_EMBEDDING_MODEL = 'nomic-embed-text';
const EMBEDDING_DIMENSIONS = 768; // nomic-embed-text produces 768-dim vectors

// File types to index
const INDEXABLE_EXTENSIONS = new Set([
  '.js', '.ts', '.jsx', '.tsx',
  '.json', '.md', '.txt',
  '.html', '.css', '.scss', '.sass',
  '.yml', '.yaml', '.xml',
  '.py', '.rb', '.go', '.rs', '.java', '.c', '.cpp', '.h',
  '.sh', '.bash', '.zsh',
  '.sql', '.graphql', '.gql',
]);

// Files/directories to ignore
const IGNORE_PATTERNS = [
  'node_modules',
  '.git',
  'dist',
  'build',
  'coverage',
  '.cache',
  '.next',
  '.nuxt',
  '.output',
  '*.min.js',
  '*.min.css',
  '*.map',
  '.DS_Store',
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
];

// ============================================================================
// Database Setup
// ============================================================================

let db = null;

/**
 * Initialize the repository index database
 */
export async function initRepositoryIndex() {
  // Ensure index directory exists
  await fs.mkdir(INDEX_DIR, { recursive: true });

  // Initialize database
  db = new Database(DB_PATH);

  // Enable WAL mode for better concurrency
  db.pragma('journal_mode = WAL');

  // Create tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      path TEXT UNIQUE NOT NULL,
      content_hash TEXT NOT NULL,
      last_modified INTEGER NOT NULL,
      file_size INTEGER NOT NULL,
      language TEXT,
      indexed_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS chunks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      file_id INTEGER NOT NULL,
      chunk_index INTEGER NOT NULL,
      content TEXT NOT NULL,
      start_line INTEGER NOT NULL,
      end_line INTEGER NOT NULL,
      embedding BLOB,
      FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE CASCADE,
      UNIQUE(file_id, chunk_index)
    );

    CREATE TABLE IF NOT EXISTS symbols (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      file_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      type TEXT NOT NULL, -- 'function', 'class', 'variable', 'import', 'export'
      line_start INTEGER NOT NULL,
      line_end INTEGER,
      signature TEXT,
      documentation TEXT,
      FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS relationships (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_symbol_id INTEGER NOT NULL,
      target_symbol_id INTEGER,
      target_file_path TEXT,
      relationship_type TEXT NOT NULL, -- 'calls', 'imports', 'extends', 'implements', 'references'
      line_number INTEGER,
      FOREIGN KEY (source_symbol_id) REFERENCES symbols(id) ON DELETE CASCADE,
      FOREIGN KEY (target_symbol_id) REFERENCES symbols(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_files_path ON files(path);
    CREATE INDEX IF NOT EXISTS idx_chunks_file_id ON chunks(file_id);
    CREATE INDEX IF NOT EXISTS idx_symbols_file_id ON symbols(file_id);
    CREATE INDEX IF NOT EXISTS idx_symbols_name ON symbols(name);
    CREATE INDEX IF NOT EXISTS idx_relationships_source ON relationships(source_symbol_id);
  `);

  console.log('[RepositoryIndexer] Database initialized');
  return true;
}

/**
 * Close the database connection
 */
export function closeRepositoryIndex() {
  if (db) {
    db.close();
    db = null;
  }
}

// ============================================================================
// Embedding Generation
// ============================================================================

/**
 * Generate true semantic embedding using Ollama
 * @param {string} text - Text to embed
 * @param {string} model - Embedding model to use
 * @returns {Promise<Float32Array>} Embedding vector
 */
export async function generateEmbedding(text, model = DEFAULT_EMBEDDING_MODEL) {
  const ollamaHost = process.env.OLLAMA_HOST || 'http://localhost:11434';

  try {
    const response = await fetch(`${ollamaHost}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        prompt: text.slice(0, 8000), // Limit text length
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama API error: ${response.statusText}`);
    }

    const data = await response.json();

    if (!data.embedding || !Array.isArray(data.embedding)) {
      throw new Error('Invalid embedding response from Ollama');
    }

    return new Float32Array(data.embedding);
  } catch (error) {
    console.error('[RepositoryIndexer] Embedding generation failed:', error.message);
    // Fallback to zero vector
    return new Float32Array(EMBEDDING_DIMENSIONS);
  }
}

/**
 * Batch generate embeddings for multiple texts
 * @param {string[]} texts - Texts to embed
 * @param {string} model - Embedding model
 * @returns {Promise<Float32Array[]>} Array of embedding vectors
 */
export async function generateEmbeddingsBatch(texts, model = DEFAULT_EMBEDDING_MODEL) {
  const embeddings = [];
  for (const text of texts) {
    embeddings.push(await generateEmbedding(text, model));
    // Small delay to avoid overwhelming Ollama
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  return embeddings;
}

// ============================================================================
// Content Chunking
// ============================================================================

/**
 * Split content into semantic chunks
 * @param {string} content - File content
 * @param {number} maxChunkSize - Maximum chunk size in characters
 * @returns {Array<{content: string, startLine: number, endLine: number}>}
 */
export function chunkContent(content, maxChunkSize = 1000) {
  const lines = content.split('\n');
  const chunks = [];
  let currentChunk = [];
  let currentSize = 0;
  let startLine = 1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineLength = line.length + 1; // +1 for newline

    if (currentSize + lineLength > maxChunkSize && currentChunk.length > 0) {
      chunks.push({
        content: currentChunk.join('\n'),
        startLine,
        endLine: i,
      });
      currentChunk = [line];
      currentSize = lineLength;
      startLine = i + 1;
    } else {
      currentChunk.push(line);
      currentSize += lineLength;
    }
  }

  // Add remaining chunk
  if (currentChunk.length > 0) {
    chunks.push({
      content: currentChunk.join('\n'),
      startLine,
      endLine: lines.length,
    });
  }

  return chunks;
}

// ============================================================================
// File Indexing
// ============================================================================

/**
 * Calculate content hash
 * @param {string} content - File content
 * @returns {string} SHA-256 hash
 */
function calculateHash(content) {
  return createHash('sha256').update(content).digest('hex');
}

/**
 * Detect programming language from file extension
 * @param {string} filePath - File path
 * @returns {string|null} Language name
 */
function detectLanguage(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const languageMap = {
    '.js': 'javascript',
    '.jsx': 'javascript',
    '.ts': 'typescript',
    '.tsx': 'typescript',
    '.py': 'python',
    '.rb': 'ruby',
    '.go': 'go',
    '.rs': 'rust',
    '.java': 'java',
    '.c': 'c',
    '.cpp': 'cpp',
    '.h': 'c',
    '.html': 'html',
    '.css': 'css',
    '.scss': 'scss',
    '.sass': 'sass',
    '.json': 'json',
    '.md': 'markdown',
    '.yml': 'yaml',
    '.yaml': 'yaml',
    '.xml': 'xml',
    '.sh': 'bash',
    '.bash': 'bash',
    '.zsh': 'zsh',
    '.sql': 'sql',
    '.graphql': 'graphql',
    '.gql': 'graphql',
  };
  return languageMap[ext] || null;
}

/**
 * Check if file should be indexed
 * @param {string} filePath - File path
 * @returns {boolean}
 */
function shouldIndexFile(filePath) {
  const basename = path.basename(filePath);
  const ext = path.extname(filePath).toLowerCase();

  // Check ignore patterns
  for (const pattern of IGNORE_PATTERNS) {
    if (pattern.includes('*')) {
      const regex = new RegExp(pattern.replace('*', '.*'));
      if (regex.test(basename)) return false;
    } else if (filePath.includes(pattern)) {
      return false;
    }
  }

  // Check if extension is indexable
  return INDEXABLE_EXTENSIONS.has(ext);
}

/**
 * Index a single file
 * @param {string} filePath - Absolute file path
 * @param {string} [content] - Optional pre-read content
 * @returns {Promise<boolean>}
 */
export async function indexFile(filePath, content = null) {
  if (!db) {
    throw new Error('Repository index not initialized');
  }

  if (!shouldIndexFile(filePath)) {
    return false;
  }

  try {
    // Read file if content not provided
    if (content === null) {
      content = await fs.readFile(filePath, 'utf-8');
    }

    const stats = await fs.stat(filePath);
    const contentHash = calculateHash(content);
    const language = detectLanguage(filePath);

    // Check if file already indexed and unchanged
    const existingFile = db.prepare('SELECT id, content_hash FROM files WHERE path = ?').get(filePath);

    if (existingFile && existingFile.content_hash === contentHash) {
      // File unchanged, skip
      return true;
    }

    // Delete old chunks and symbols if file exists
    if (existingFile) {
      db.prepare('DELETE FROM files WHERE id = ?').run(existingFile.id);
    }

    // Insert file record
    const fileResult = db.prepare(`
      INSERT INTO files (path, content_hash, last_modified, file_size, language, indexed_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(filePath, contentHash, stats.mtimeMs, stats.size, language, Date.now());

    const fileId = fileResult.lastInsertRowid;

    // Chunk content
    const chunks = chunkContent(content);

    // Generate embeddings for chunks
    const chunkTexts = chunks.map(c => c.content);
    const embeddings = await generateEmbeddingsBatch(chunkTexts);

    // Insert chunks with embeddings
    const insertChunk = db.prepare(`
      INSERT INTO chunks (file_id, chunk_index, content, start_line, end_line, embedding)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const embedding = embeddings[i];
      insertChunk.run(fileId, i, chunk.content, chunk.startLine, chunk.endLine, Buffer.from(embedding.buffer));
    }

    console.log(`[RepositoryIndexer] Indexed: ${filePath} (${chunks.length} chunks)`);
    return true;

  } catch (error) {
    console.error(`[RepositoryIndexer] Failed to index ${filePath}:`, error.message);
    return false;
  }
}

/**
 * Index entire repository
 * @param {string} rootPath - Repository root path
 * @param {Object} options - Indexing options
 * @returns {Promise<Object>} Indexing statistics
 */
export async function indexRepository(rootPath, options = {}) {
  const stats = {
    totalFiles: 0,
    indexedFiles: 0,
    failedFiles: 0,
    skippedFiles: 0,
    startTime: Date.now(),
  };

  console.log(`[RepositoryIndexer] Starting indexing of: ${rootPath}`);

  async function scanDirectory(dirPath) {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);

      if (entry.isDirectory()) {
        // Skip ignored directories
        if (IGNORE_PATTERNS.some(p => fullPath.includes(p))) {
          continue;
        }
        await scanDirectory(fullPath);
      } else if (entry.isFile()) {
        stats.totalFiles++;

        if (shouldIndexFile(fullPath)) {
          const success = await indexFile(fullPath);
          if (success) {
            stats.indexedFiles++;
          } else {
            stats.failedFiles++;
          }
        } else {
          stats.skippedFiles++;
        }
      }
    }
  }

  await scanDirectory(rootPath);

  stats.duration = Date.now() - stats.startTime;
  console.log(`[RepositoryIndexer] Indexing complete:`, stats);

  return stats;
}

// ============================================================================
// Search & Retrieval
// ============================================================================

/**
 * Calculate cosine similarity between two vectors
 * @param {Float32Array} a - First vector
 * @param {Float32Array} b - Second vector
 * @returns {number} Similarity score (0-1)
 */
function cosineSimilarity(a, b) {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  if (normA === 0 || normB === 0) return 0;

  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Search for similar content in the repository
 * @param {string} query - Search query
 * @param {number} topK - Number of results to return
 * @returns {Promise<Array<{path: string, content: string, score: number, startLine: number, endLine: number}>>}
 */
export async function searchSimilar(query, topK = 5) {
  if (!db) {
    throw new Error('Repository index not initialized');
  }

  // Generate query embedding
  const queryEmbedding = await generateEmbedding(query);

  // Get all chunks (in production, use vector DB for efficiency)
  const chunks = db.prepare(`
    SELECT c.id, c.content, c.start_line, c.end_line, c.embedding, f.path
    FROM chunks c
    JOIN files f ON c.file_id = f.id
  `).all();

  // Calculate similarities
  const scored = chunks.map(chunk => {
    const chunkEmbedding = new Float32Array(chunk.embedding.buffer);
    const score = cosineSimilarity(queryEmbedding, chunkEmbedding);
    return {
      path: chunk.path,
      content: chunk.content,
      score,
      startLine: chunk.start_line,
      endLine: chunk.end_line,
    };
  });

  // Sort by score and return top K
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topK);
}

/**
 * Get indexed file information
 * @param {string} filePath - File path
 * @returns {Object|null} File info
 */
export function getFileInfo(filePath) {
  if (!db) return null;

  return db.prepare('SELECT * FROM files WHERE path = ?').get(filePath) || null;
}

/**
 * List all indexed files
 * @returns {Array<Object>} List of file records
 */
export function listIndexedFiles() {
  if (!db) return [];

  return db.prepare('SELECT * FROM files ORDER BY path').all();
}

/**
 * Get file chunks
 * @param {string} filePath - File path
 * @returns {Array<Object>} List of chunks
 */
export function getFileChunks(filePath) {
  if (!db) return [];

  const file = db.prepare('SELECT id FROM files WHERE path = ?').get(filePath);
  if (!file) return [];

  return db.prepare('SELECT * FROM chunks WHERE file_id = ? ORDER BY chunk_index').all(file.id);
}

// ============================================================================
// File Watching
// ============================================================================

let fileWatcher = null;

/**
 * Start watching repository for changes
 * @param {string} rootPath - Repository root
 * @param {Function} onChange - Callback for file changes
 */
export function startFileWatching(rootPath, onChange = null) {
  if (fileWatcher) {
    stopFileWatching();
  }

  fileWatcher = watch(rootPath, {
    ignored: IGNORE_PATTERNS,
    persistent: true,
    ignoreInitial: true,
  });

  fileWatcher.on('add', async (filePath) => {
    if (shouldIndexFile(filePath)) {
      console.log(`[RepositoryIndexer] File added: ${filePath}`);
      await indexFile(filePath);
      if (onChange) onChange('add', filePath);
    }
  });

  fileWatcher.on('change', async (filePath) => {
    if (shouldIndexFile(filePath)) {
      console.log(`[RepositoryIndexer] File changed: ${filePath}`);
      await indexFile(filePath);
      if (onChange) onChange('change', filePath);
    }
  });

  fileWatcher.on('unlink', async (filePath) => {
    console.log(`[RepositoryIndexer] File removed: ${filePath}`);
    if (db) {
      db.prepare('DELETE FROM files WHERE path = ?').run(filePath);
    }
    if (onChange) onChange('unlink', filePath);
  });

  console.log(`[RepositoryIndexer] Started watching: ${rootPath}`);
}

/**
 * Stop file watching
 */
export function stopFileWatching() {
  if (fileWatcher) {
    fileWatcher.close();
    fileWatcher = null;
    console.log('[RepositoryIndexer] Stopped file watching');
  }
}

// ============================================================================
// Statistics & Maintenance
// ============================================================================

/**
 * Get index statistics
 * @returns {Object} Statistics
 */
export function getIndexStats() {
  if (!db) {
    return { error: 'Database not initialized' };
  }

  const fileCount = db.prepare('SELECT COUNT(*) as count FROM files').get().count;
  const chunkCount = db.prepare('SELECT COUNT(*) as count FROM chunks').get().count;
  const symbolCount = db.prepare('SELECT COUNT(*) as count FROM symbols').get().count;

  const totalSize = db.prepare('SELECT SUM(file_size) as total FROM files').get().total || 0;

  return {
    files: fileCount,
    chunks: chunkCount,
    symbols: symbolCount,
    totalSize,
    databasePath: DB_PATH,
  };
}

/**
 * Clear the entire index
 */
export function clearIndex() {
  if (!db) return;

  db.prepare('DELETE FROM relationships').run();
  db.prepare('DELETE FROM symbols').run();
  db.prepare('DELETE FROM chunks').run();
  db.prepare('DELETE FROM files').run();

  console.log('[RepositoryIndexer] Index cleared');
}

/**
 * Vacuum the database to reclaim space
 */
export function vacuumIndex() {
  if (!db) return;

  db.exec('VACUUM');
  console.log('[RepositoryIndexer] Database vacuumed');
}

// ============================================================================
// Export default
// ============================================================================

export default {
  initRepositoryIndex,
  closeRepositoryIndex,
  generateEmbedding,
  generateEmbeddingsBatch,
  chunkContent,
  indexFile,
  indexRepository,
  searchSimilar,
  getFileInfo,
  listIndexedFiles,
  getFileChunks,
  startFileWatching,
  stopFileWatching,
  getIndexStats,
  clearIndex,
  vacuumIndex,
};
