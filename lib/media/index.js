/**
 * Media Understanding Module for StaticRebel
 * Provides image and video analysis capabilities using various LLM providers
 */

import fs from 'fs/promises';
import path from 'path';
import { analyzeImage, extractTextFromImage, describeImage } from './image.js';
import { analyzeVideo, extractFramesFromVideo } from './video.js';

// Supported file types
const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg'];
const VIDEO_EXTENSIONS = ['.mp4', '.avi', '.mov', '.wmv', '.flv', '.webm', '.mkv'];

/**
 * Detect if a file is an image based on extension
 */
export function isImage(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return IMAGE_EXTENSIONS.includes(ext);
}

/**
 * Detect if a file is a video based on extension
 */
export function isVideo(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return VIDEO_EXTENSIONS.includes(ext);
}

/**
 * Get MIME type based on file extension
 */
export function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const mimeMap = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.bmp': 'image/bmp',
    '.svg': 'image/svg+xml',
    '.mp4': 'video/mp4',
    '.avi': 'video/x-msvideo',
    '.mov': 'video/quicktime',
    '.wmv': 'video/x-ms-wmv',
    '.flv': 'video/x-flv',
    '.webm': 'video/webm',
    '.mkv': 'video/x-matroska'
  };
  return mimeMap[ext] || 'application/octet-stream';
}

/**
 * Main media analysis function that routes to appropriate handler
 */
export async function analyzeMedia(filePathOrUrl, options = {}) {
  const {
    provider = 'openai',
    model = null,
    prompt = null,
    task = 'analyze'
  } = options;

  try {
    // Check if it's a URL or local file
    let filePath = filePathOrUrl;
    let isUrl = false;
    
    if (filePathOrUrl.startsWith('http://') || filePathOrUrl.startsWith('https://')) {
      isUrl = true;
      // TODO: Download and cache the file temporarily
      throw new Error('URL handling not yet implemented. Please use local files.');
    }

    // Check if file exists
    try {
      await fs.access(filePath);
    } catch (error) {
      throw new Error(`File not found: ${filePath}`);
    }

    // Route based on file type
    if (isImage(filePath)) {
      switch (task) {
        case 'ocr':
        case 'extract-text':
          return await extractTextFromImage(filePath, { provider, model });
        case 'describe':
          return await describeImage(filePath, { provider, model });
        case 'analyze':
        default:
          return await analyzeImage(filePath, { provider, model, prompt });
      }
    } else if (isVideo(filePath)) {
      return await analyzeVideo(filePath, { provider, model, prompt, task });
    } else {
      throw new Error(`Unsupported file type: ${path.extname(filePath)}`);
    }
  } catch (error) {
    throw new Error(`Media analysis failed: ${error.message}`);
  }
}

/**
 * Extract text from image using OCR
 */
export async function extractText(filePath, options = {}) {
  if (!isImage(filePath)) {
    throw new Error('Text extraction is only supported for images');
  }
  return await extractTextFromImage(filePath, options);
}

/**
 * Describe media content
 */
export async function describe(filePath, options = {}) {
  const result = await analyzeMedia(filePath, { ...options, task: 'describe' });
  return result;
}

/**
 * Get supported providers
 */
export function getSupportedProviders() {
  return [
    {
      id: 'openai',
      name: 'OpenAI',
      models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-vision-preview'],
      capabilities: ['image', 'video']
    },
    {
      id: 'anthropic',
      name: 'Anthropic Claude',
      models: ['claude-3-opus', 'claude-3-sonnet', 'claude-3-haiku'],
      capabilities: ['image']
    },
    {
      id: 'google',
      name: 'Google Gemini',
      models: ['gemini-pro-vision', 'gemini-1.5-pro', 'gemini-1.5-flash'],
      capabilities: ['image', 'video']
    },
    {
      id: 'ollama',
      name: 'Ollama (Local)',
      models: ['llava', 'llava:13b', 'llava:34b', 'bakllava'],
      capabilities: ['image']
    }
  ];
}

/**
 * Get file info including basic metadata
 */
export async function getFileInfo(filePath) {
  try {
    const stats = await fs.stat(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const basename = path.basename(filePath);
    
    return {
      path: filePath,
      name: basename,
      extension: ext,
      size: stats.size,
      sizeFormatted: formatBytes(stats.size),
      type: isImage(filePath) ? 'image' : isVideo(filePath) ? 'video' : 'unknown',
      mimeType: getMimeType(filePath),
      modified: stats.mtime,
      created: stats.birthtime
    };
  } catch (error) {
    throw new Error(`Failed to get file info: ${error.message}`);
  }
}

/**
 * Format bytes to human readable format
 */
function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

export { analyzeImage, extractTextFromImage, describeImage } from './image.js';
export { analyzeVideo, extractFramesFromVideo } from './video.js';