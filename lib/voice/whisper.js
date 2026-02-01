/**
 * Voice Input Module - Whisper Speech-to-Text
 * Supports both Ollama (local) and OpenAI API
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import os from 'os';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Configuration for Whisper providers
 */
const config = {
    // Primary provider - Ollama (local)
    ollama: {
        endpoint: process.env.OLLAMA_ENDPOINT || 'http://localhost:11434',
        model: process.env.WHISPER_MODEL || 'whisper:latest'
    },
    
    // Fallback provider - OpenAI API
    openai: {
        apiKey: process.env.OPENAI_API_KEY,
        model: process.env.OPENAI_WHISPER_MODEL || 'whisper-1',
        endpoint: 'https://api.openai.com/v1/audio/transcriptions'
    },
    
    // Default to Ollama
    provider: process.env.WHISPER_PROVIDER || 'ollama',
    
    // Supported formats
    supportedFormats: ['wav', 'mp3', 'mp4', 'webm', 'ogg', 'flac', 'm4a'],
    
    // Max file size (25MB for OpenAI limit)
    maxFileSizeBytes: 25 * 1024 * 1024
};

/**
 * Get file extension from buffer or filename
 */
function getFileExtension(input) {
    if (typeof input === 'string') {
        return path.extname(input).toLowerCase().replace('.', '');
    }
    
    // Try to detect from buffer headers
    if (Buffer.isBuffer(input)) {
        const header = input.slice(0, 16);
        
        // WAV signature
        if (header.slice(0, 4).toString() === 'RIFF' && header.slice(8, 12).toString() === 'WAVE') {
            return 'wav';
        }
        
        // MP3 signature (ID3 or FF FB/FF F3/FF F2)
        if (header[0] === 0x49 && header[1] === 0x44 && header[2] === 0x33) { // ID3
            return 'mp3';
        }
        if (header[0] === 0xFF && (header[1] & 0xE0) === 0xE0) { // MPEG frame
            return 'mp3';
        }
        
        // OGG signature
        if (header.slice(0, 4).toString() === 'OggS') {
            return 'ogg';
        }
        
        // WebM/Matroska signature
        if (header.slice(0, 4).equals(Buffer.from([0x1A, 0x45, 0xDF, 0xA3]))) {
            return 'webm';
        }
        
        // FLAC signature
        if (header.slice(0, 4).toString() === 'fLaC') {
            return 'flac';
        }
        
        // M4A signature (ftyp box)
        if (header.slice(4, 8).toString() === 'ftyp') {
            const brand = header.slice(8, 12).toString();
            if (brand === 'M4A ' || brand === 'mp42' || brand === 'isom') {
                return 'm4a';
            }
        }
    }
    
    // Default fallback
    return 'wav';
}

/**
 * Validate audio format and size
 */
function validateAudioInput(audioBuffer, filename = null) {
    if (!Buffer.isBuffer(audioBuffer)) {
        throw new Error('Audio input must be a Buffer');
    }
    
    if (audioBuffer.length === 0) {
        throw new Error('Audio buffer is empty');
    }
    
    if (audioBuffer.length > config.maxFileSizeBytes) {
        throw new Error(`Audio file too large: ${audioBuffer.length} bytes (max: ${config.maxFileSizeBytes})`);
    }
    
    const extension = filename ? path.extname(filename).toLowerCase().replace('.', '') : getFileExtension(audioBuffer);
    
    if (!config.supportedFormats.includes(extension)) {
        throw new Error(`Unsupported audio format: ${extension}. Supported: ${config.supportedFormats.join(', ')}`);
    }
    
    return extension;
}

/**
 * Create temporary file for audio buffer
 */
function createTempAudioFile(audioBuffer, extension) {
    const tempDir = os.tmpdir();
    const tempFile = path.join(tempDir, `whisper_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.${extension}`);
    
    fs.writeFileSync(tempFile, audioBuffer);
    return tempFile;
}

/**
 * Transcribe audio using Ollama Whisper
 */
async function transcribeWithOllama(audioBuffer, extension) {
    const tempFile = createTempAudioFile(audioBuffer, extension);
    
    try {
        // Create form data manually since we're using fetch
        const formData = new FormData();
        const audioFile = new File([audioBuffer], `audio.${extension}`, { 
            type: `audio/${extension}` 
        });
        formData.append('file', audioFile);
        formData.append('model', config.ollama.model);
        
        const response = await fetch(`${config.ollama.endpoint}/api/transcribe`, {
            method: 'POST',
            body: formData
        });
        
        if (!response.ok) {
            throw new Error(`Ollama request failed: ${response.status} ${response.statusText}`);
        }
        
        const result = await response.json();
        
        if (result.error) {
            throw new Error(`Ollama transcription error: ${result.error}`);
        }
        
        return {
            text: result.text || result.transcription || '',
            language: result.language || 'unknown',
            provider: 'ollama',
            model: config.ollama.model,
            duration: result.duration,
            confidence: result.confidence
        };
        
    } finally {
        // Clean up temp file
        try {
            fs.unlinkSync(tempFile);
        } catch (error) {
            console.warn('Failed to clean up temp file:', error.message);
        }
    }
}

/**
 * Transcribe audio using OpenAI API
 */
async function transcribeWithOpenAI(audioBuffer, extension) {
    if (!config.openai.apiKey) {
        throw new Error('OpenAI API key not configured');
    }
    
    try {
        // Create form data
        const formData = new FormData();
        const audioFile = new File([audioBuffer], `audio.${extension}`, { 
            type: `audio/${extension}` 
        });
        formData.append('file', audioFile);
        formData.append('model', config.openai.model);
        formData.append('response_format', 'verbose_json'); // Get more detailed response
        
        const response = await fetch(config.openai.endpoint, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${config.openai.apiKey}`
            },
            body: formData
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`OpenAI request failed: ${response.status} ${response.statusText} - ${errorText}`);
        }
        
        const result = await response.json();
        
        return {
            text: result.text || '',
            language: result.language || 'unknown',
            provider: 'openai',
            model: config.openai.model,
            duration: result.duration,
            segments: result.segments,
            words: result.words
        };
        
    } catch (error) {
        if (error.message.includes('API key')) {
            throw error;
        }
        throw new Error(`OpenAI transcription failed: ${error.message}`);
    }
}

/**
 * Main transcription function
 */
export async function transcribe(audioBuffer, options = {}) {
    const {
        filename = null,
        provider = config.provider,
        language = null,
        temperature = 0,
        prompt = null
    } = options;
    
    try {
        // Validate input
        const extension = validateAudioInput(audioBuffer, filename);
        
        let result;
        
        // Try primary provider first
        if (provider === 'ollama') {
            try {
                result = await transcribeWithOllama(audioBuffer, extension);
            } catch (error) {
                console.warn('Ollama transcription failed:', error.message);
                
                // Fallback to OpenAI if available
                if (config.openai.apiKey) {
                    console.log('Falling back to OpenAI...');
                    result = await transcribeWithOpenAI(audioBuffer, extension);
                } else {
                    throw error;
                }
            }
        } else if (provider === 'openai') {
            result = await transcribeWithOpenAI(audioBuffer, extension);
        } else {
            throw new Error(`Unknown provider: ${provider}`);
        }
        
        // Post-process result
        result.text = result.text.trim();
        result.timestamp = new Date().toISOString();
        result.audioSize = audioBuffer.length;
        result.audioFormat = extension;
        
        return result;
        
    } catch (error) {
        console.error('Transcription failed:', error.message);
        throw error;
    }
}

/**
 * Transcribe audio file from disk
 */
export async function transcribeFile(filePath, options = {}) {
    try {
        if (!fs.existsSync(filePath)) {
            throw new Error(`Audio file not found: ${filePath}`);
        }
        
        const audioBuffer = fs.readFileSync(filePath);
        const filename = path.basename(filePath);
        
        return await transcribe(audioBuffer, { ...options, filename });
        
    } catch (error) {
        throw new Error(`Failed to transcribe file ${filePath}: ${error.message}`);
    }
}

/**
 * Check if Whisper is available
 */
export async function checkAvailability() {
    const status = {
        ollama: false,
        openai: false,
        available: false,
        errors: {}
    };
    
    // Check Ollama
    try {
        const response = await fetch(`${config.ollama.endpoint}/api/tags`, {
            timeout: 5000
        });
        
        if (response.ok) {
            const models = await response.json();
            status.ollama = models.models?.some(m => m.name.includes('whisper')) || false;
        }
    } catch (error) {
        status.errors.ollama = error.message;
    }
    
    // Check OpenAI
    if (config.openai.apiKey) {
        try {
            // Create a minimal test request to check API validity
            const testBuffer = Buffer.alloc(1024); // Minimal buffer
            // We don't actually send this, just validate the key format
            status.openai = config.openai.apiKey.startsWith('sk-');
        } catch (error) {
            status.errors.openai = error.message;
        }
    }
    
    status.available = status.ollama || status.openai;
    
    return status;
}

/**
 * Get configuration
 */
export function getConfig() {
    return { ...config };
}

/**
 * Update configuration
 */
export function updateConfig(newConfig) {
    Object.assign(config, newConfig);
}

export default {
    transcribe,
    transcribeFile,
    checkAvailability,
    getConfig,
    updateConfig
};