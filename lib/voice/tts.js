/**
 * Text-to-Speech Module
 * Primary: edge-tts (free, high quality)
 * Fallbacks: ElevenLabs, Coqui
 */

import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const execAsync = promisify(exec);

/**
 * TTS Configuration
 */
const config = {
    // Primary provider - Microsoft Edge TTS
    edgeTts: {
        defaultVoice: process.env.TTS_VOICE || 'en-US-AriaNeural',
        rate: process.env.TTS_RATE || '0%',        // -100% to +200%
        pitch: process.env.TTS_PITCH || '+0Hz',    // relative pitch
        volume: process.env.TTS_VOLUME || '+0%'    // relative volume
    },
    
    // ElevenLabs fallback
    elevenLabs: {
        apiKey: process.env.ELEVENLABS_API_KEY,
        voiceId: process.env.ELEVENLABS_VOICE_ID || '21m00Tcm4TlvDq8ikWAM', // Rachel
        model: process.env.ELEVENLABS_MODEL || 'eleven_monolingual_v1',
        endpoint: 'https://api.elevenlabs.io/v1/text-to-speech'
    },
    
    // Coqui TTS fallback
    coqui: {
        model: process.env.COQUI_MODEL || 'tts_models/en/ljspeech/tacotron2-DDC',
        vocoder: process.env.COQUI_VOCODER || 'vocoder_models/en/ljspeech/hifigan_v2'
    },
    
    // Default provider
    provider: process.env.TTS_PROVIDER || 'edge',
    
    // Output format
    format: process.env.TTS_FORMAT || 'mp3', // mp3, wav, webm
    
    // Cache settings
    cache: {
        enabled: true,
        maxSize: 100, // Max cached items
        ttl: 24 * 60 * 60 * 1000 // 24 hours
    }
};

/**
 * Simple in-memory cache for TTS results
 */
const ttsCache = new Map();

/**
 * Available voices for Edge TTS
 */
const edgeVoices = {
    // English voices
    'en-US-AriaNeural': 'Aria (Female, US)',
    'en-US-JennyNeural': 'Jenny (Female, US)', 
    'en-US-GuyNeural': 'Guy (Male, US)',
    'en-US-DavisNeural': 'Davis (Male, US)',
    'en-GB-SoniaNeural': 'Sonia (Female, UK)',
    'en-GB-RyanNeural': 'Ryan (Male, UK)',
    'en-AU-NatashaNeural': 'Natasha (Female, AU)',
    'en-AU-WilliamNeural': 'William (Male, AU)',
    'en-CA-ClaraNeural': 'Clara (Female, CA)',
    'en-CA-LiamNeural': 'Liam (Male, CA)',
    
    // Other languages
    'es-ES-ElviraNeural': 'Elvira (Female, Spanish)',
    'fr-FR-DeniseNeural': 'Denise (Female, French)',
    'de-DE-KatjaNeural': 'Katja (Female, German)',
    'it-IT-ElsaNeural': 'Elsa (Female, Italian)',
    'pt-BR-FranciscaNeural': 'Francisca (Female, Portuguese)',
    'ru-RU-SvetlanaNeural': 'Svetlana (Female, Russian)',
    'ja-JP-NanamiNeural': 'Nanami (Female, Japanese)',
    'ko-KR-SunHiNeural': 'SunHi (Female, Korean)',
    'zh-CN-XiaoxiaoNeural': 'Xiaoxiao (Female, Chinese)'
};

/**
 * Generate cache key for TTS request
 */
function getCacheKey(text, voice, options = {}) {
    const key = JSON.stringify({
        text: text.trim(),
        voice,
        rate: options.rate || config.edgeTts.rate,
        pitch: options.pitch || config.edgeTts.pitch,
        volume: options.volume || config.edgeTts.volume,
        format: options.format || config.format
    });
    
    // Create short hash
    let hash = 0;
    for (let i = 0; i < key.length; i++) {
        const char = key.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32-bit integer
    }
    
    return Math.abs(hash).toString(36);
}

/**
 * Check if edge-tts is installed
 */
async function checkEdgeTtsInstallation() {
    try {
        await execAsync('edge-tts --help');
        return true;
    } catch (error) {
        return false;
    }
}

/**
 * Install edge-tts via pip
 */
async function installEdgeTts() {
    try {
        console.log('Installing edge-tts...');
        await execAsync('pip install edge-tts');
        return true;
    } catch (error) {
        console.warn('Failed to install edge-tts:', error.message);
        return false;
    }
}

/**
 * Generate speech using Microsoft Edge TTS
 */
async function speakWithEdgeTts(text, voice = config.edgeTts.defaultVoice, options = {}) {
    // Check if edge-tts is available
    if (!(await checkEdgeTtsInstallation())) {
        if (!(await installEdgeTts())) {
            throw new Error('edge-tts is not available and could not be installed');
        }
    }
    
    const {
        rate = config.edgeTts.rate,
        pitch = config.edgeTts.pitch,
        volume = config.edgeTts.volume,
        format = config.format
    } = options;
    
    // Create temporary output file
    const tempDir = os.tmpdir();
    const tempFile = path.join(tempDir, `tts_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.${format}`);
    
    try {
        // Build edge-tts command
        const cmd = [
            'edge-tts',
            '--voice', voice,
            '--rate', rate,
            '--pitch', pitch,
            '--volume', volume,
            '--text', `"${text.replace(/"/g, '\\"')}"`,
            '--write-media', tempFile
        ].join(' ');
        
        await execAsync(cmd, { timeout: 30000 });
        
        // Read the generated audio file
        if (!fs.existsSync(tempFile)) {
            throw new Error('TTS output file was not created');
        }
        
        const audioBuffer = fs.readFileSync(tempFile);
        
        return {
            audio: audioBuffer,
            format: format,
            voice: voice,
            provider: 'edge-tts',
            size: audioBuffer.length,
            duration: null // edge-tts doesn't provide duration info
        };
        
    } finally {
        // Clean up temp file
        try {
            if (fs.existsSync(tempFile)) {
                fs.unlinkSync(tempFile);
            }
        } catch (error) {
            console.warn('Failed to clean up temp file:', error.message);
        }
    }
}

/**
 * Generate speech using ElevenLabs API
 */
async function speakWithElevenLabs(text, voiceId = config.elevenLabs.voiceId, options = {}) {
    if (!config.elevenLabs.apiKey) {
        throw new Error('ElevenLabs API key not configured');
    }
    
    const {
        stability = 0.5,
        similarityBoost = 0.5,
        style = 0,
        useSpeakerBoost = true
    } = options;
    
    try {
        const response = await fetch(`${config.elevenLabs.endpoint}/${voiceId}`, {
            method: 'POST',
            headers: {
                'Accept': 'audio/mpeg',
                'Content-Type': 'application/json',
                'xi-api-key': config.elevenLabs.apiKey
            },
            body: JSON.stringify({
                text: text,
                model_id: config.elevenLabs.model,
                voice_settings: {
                    stability: stability,
                    similarity_boost: similarityBoost,
                    style: style,
                    use_speaker_boost: useSpeakerBoost
                }
            })
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`ElevenLabs request failed: ${response.status} ${response.statusText} - ${errorText}`);
        }
        
        const audioBuffer = Buffer.from(await response.arrayBuffer());
        
        return {
            audio: audioBuffer,
            format: 'mp3',
            voice: voiceId,
            provider: 'elevenlabs',
            size: audioBuffer.length,
            duration: null
        };
        
    } catch (error) {
        throw new Error(`ElevenLabs TTS failed: ${error.message}`);
    }
}

/**
 * Generate speech using Coqui TTS (local)
 */
async function speakWithCoqui(text, model = config.coqui.model, options = {}) {
    // Create temporary output file
    const tempDir = os.tmpdir();
    const tempFile = path.join(tempDir, `coqui_tts_${Date.now()}.wav`);
    
    try {
        // Build TTS command for Coqui
        const cmd = [
            'tts',
            '--text', `"${text.replace(/"/g, '\\"')}"`,
            '--model_name', model,
            '--out_path', tempFile
        ].join(' ');
        
        await execAsync(cmd, { timeout: 60000 });
        
        // Read the generated audio file
        if (!fs.existsSync(tempFile)) {
            throw new Error('Coqui TTS output file was not created');
        }
        
        const audioBuffer = fs.readFileSync(tempFile);
        
        return {
            audio: audioBuffer,
            format: 'wav',
            voice: model,
            provider: 'coqui',
            size: audioBuffer.length,
            duration: null
        };
        
    } finally {
        // Clean up temp file
        try {
            if (fs.existsSync(tempFile)) {
                fs.unlinkSync(tempFile);
            }
        } catch (error) {
            console.warn('Failed to clean up temp file:', error.message);
        }
    }
}

/**
 * Main TTS function with fallback support
 */
export async function speak(text, options = {}) {
    const {
        voice = config.edgeTts.defaultVoice,
        provider = config.provider,
        useCache = config.cache.enabled,
        ...otherOptions
    } = options;
    
    if (!text || text.trim().length === 0) {
        throw new Error('Text cannot be empty');
    }
    
    const trimmedText = text.trim();
    
    // Check cache first
    if (useCache) {
        const cacheKey = getCacheKey(trimmedText, voice, options);
        if (ttsCache.has(cacheKey)) {
            const cached = ttsCache.get(cacheKey);
            // Check if cache entry is still valid
            if (Date.now() - cached.timestamp < config.cache.ttl) {
                return {
                    ...cached.result,
                    cached: true
                };
            } else {
                ttsCache.delete(cacheKey);
            }
        }
    }
    
    let result;
    let lastError;
    
    // Try primary provider first
    try {
        if (provider === 'edge' || provider === 'edge-tts') {
            result = await speakWithEdgeTts(trimmedText, voice, otherOptions);
        } else if (provider === 'elevenlabs') {
            result = await speakWithElevenLabs(trimmedText, voice, otherOptions);
        } else if (provider === 'coqui') {
            result = await speakWithCoqui(trimmedText, voice, otherOptions);
        } else {
            throw new Error(`Unknown TTS provider: ${provider}`);
        }
    } catch (error) {
        lastError = error;
        console.warn(`Primary TTS provider (${provider}) failed:`, error.message);
        
        // Try fallback providers
        const fallbackOrder = ['edge', 'elevenlabs', 'coqui'].filter(p => p !== provider);
        
        for (const fallbackProvider of fallbackOrder) {
            try {
                console.log(`Trying fallback provider: ${fallbackProvider}`);
                
                if (fallbackProvider === 'edge') {
                    result = await speakWithEdgeTts(trimmedText, config.edgeTts.defaultVoice, otherOptions);
                } else if (fallbackProvider === 'elevenlabs' && config.elevenLabs.apiKey) {
                    result = await speakWithElevenLabs(trimmedText, config.elevenLabs.voiceId, otherOptions);
                } else if (fallbackProvider === 'coqui') {
                    result = await speakWithCoqui(trimmedText, config.coqui.model, otherOptions);
                } else {
                    continue; // Skip if provider requirements not met
                }
                
                console.log(`Fallback provider ${fallbackProvider} succeeded`);
                break;
                
            } catch (fallbackError) {
                console.warn(`Fallback provider ${fallbackProvider} failed:`, fallbackError.message);
                lastError = fallbackError;
            }
        }
    }
    
    if (!result) {
        throw new Error(`All TTS providers failed. Last error: ${lastError.message}`);
    }
    
    // Add metadata
    result.text = trimmedText;
    result.timestamp = new Date().toISOString();
    result.cached = false;
    
    // Cache the result
    if (useCache && ttsCache.size < config.cache.maxSize) {
        const cacheKey = getCacheKey(trimmedText, voice, options);
        ttsCache.set(cacheKey, {
            result: { ...result },
            timestamp: Date.now()
        });
    }
    
    return result;
}

/**
 * Save TTS audio to file
 */
export async function speakToFile(text, outputPath, options = {}) {
    try {
        const result = await speak(text, options);
        
        // Ensure output directory exists
        const outputDir = path.dirname(outputPath);
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }
        
        fs.writeFileSync(outputPath, result.audio);
        
        return {
            ...result,
            outputPath: outputPath
        };
        
    } catch (error) {
        throw new Error(`Failed to save TTS to file ${outputPath}: ${error.message}`);
    }
}

/**
 * Get available voices
 */
export function getVoices() {
    return { ...edgeVoices };
}

/**
 * List available voices for a specific language
 */
export function getVoicesForLanguage(languageCode) {
    const voices = {};
    
    for (const [voiceId, description] of Object.entries(edgeVoices)) {
        if (voiceId.startsWith(languageCode)) {
            voices[voiceId] = description;
        }
    }
    
    return voices;
}

/**
 * Check TTS provider availability
 */
export async function checkAvailability() {
    const status = {
        edge: false,
        elevenlabs: false,
        coqui: false,
        available: false,
        errors: {}
    };
    
    // Check Edge TTS
    try {
        status.edge = await checkEdgeTtsInstallation();
    } catch (error) {
        status.errors.edge = error.message;
    }
    
    // Check ElevenLabs
    if (config.elevenLabs.apiKey) {
        try {
            // Simple validation - just check if API key looks valid
            status.elevenlabs = config.elevenLabs.apiKey.length > 20;
        } catch (error) {
            status.errors.elevenlabs = error.message;
        }
    }
    
    // Check Coqui TTS
    try {
        await execAsync('tts --help');
        status.coqui = true;
    } catch (error) {
        status.errors.coqui = error.message;
    }
    
    status.available = status.edge || status.elevenlabs || status.coqui;
    
    return status;
}

/**
 * Get current configuration
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

/**
 * Clear TTS cache
 */
export function clearCache() {
    ttsCache.clear();
}

export default {
    speak,
    speakToFile,
    getVoices,
    getVoicesForLanguage,
    checkAvailability,
    getConfig,
    updateConfig,
    clearCache
};