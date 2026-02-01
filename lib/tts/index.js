/**
 * StaticRebel TTS Module
 * Comprehensive Text-to-Speech system with multiple providers
 */

import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import chalk from 'chalk';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const execAsync = promisify(exec);

/**
 * TTS Configuration
 */
const config = {
    // Default provider priority
    provider: process.env.TTS_PROVIDER || 'edge',
    
    // Edge TTS (Microsoft)
    edgeTts: {
        defaultVoice: process.env.TTS_VOICE || 'en-US-AriaNeural',
        rate: process.env.TTS_RATE || '0%',        // -100% to +200%
        pitch: process.env.TTS_PITCH || '+0Hz',    // relative pitch
        volume: process.env.TTS_VOLUME || '+0%',   // relative volume
        format: process.env.TTS_FORMAT || 'mp3'    // mp3, wav, webm
    },
    
    // OpenAI TTS
    openai: {
        apiKey: process.env.OPENAI_API_KEY,
        model: process.env.OPENAI_TTS_MODEL || 'tts-1',
        voice: process.env.OPENAI_TTS_VOICE || 'alloy',
        format: process.env.OPENAI_TTS_FORMAT || 'mp3',
        speed: parseFloat(process.env.OPENAI_TTS_SPEED || '1.0'),
        endpoint: 'https://api.openai.com/v1/audio/speech'
    },
    
    // ElevenLabs
    elevenLabs: {
        apiKey: process.env.ELEVENLABS_API_KEY,
        voiceId: process.env.ELEVENLABS_VOICE_ID || '21m00Tcm4TlvDq8ikWAM', // Rachel
        model: process.env.ELEVENLABS_MODEL || 'eleven_monolingual_v1',
        stability: parseFloat(process.env.ELEVENLABS_STABILITY || '0.5'),
        similarityBoost: parseFloat(process.env.ELEVENLABS_SIMILARITY_BOOST || '0.5'),
        endpoint: 'https://api.elevenlabs.io/v1/text-to-speech'
    },
    
    // System TTS
    system: {
        macOSVoice: process.env.MACOS_VOICE || 'Samantha',
        linuxVoice: process.env.LINUX_VOICE || 'en+f3',
        windowsVoice: process.env.WINDOWS_VOICE || 'Microsoft Zira Desktop',
        speed: parseInt(process.env.SYSTEM_TTS_SPEED || '200') // words per minute
    },
    
    // Streaming settings
    streaming: {
        enabled: process.env.TTS_STREAMING === 'true',
        chunkSize: parseInt(process.env.TTS_CHUNK_SIZE || '200'), // characters
        chunkOverlap: parseInt(process.env.TTS_CHUNK_OVERLAP || '20') // overlap chars
    },
    
    // Cache settings
    cache: {
        enabled: process.env.TTS_CACHE_ENABLED !== 'false',
        maxSize: parseInt(process.env.TTS_CACHE_MAX_SIZE || '100'),
        ttl: parseInt(process.env.TTS_CACHE_TTL || '86400') * 1000 // 24 hours
    }
};

/**
 * Voice definitions for different providers
 */
const voices = {
    // Edge TTS voices
    edge: {
        'aria': 'en-US-AriaNeural',
        'jenny': 'en-US-JennyNeural',
        'guy': 'en-US-GuyNeural',
        'davis': 'en-US-DavisNeural',
        'sonia': 'en-GB-SoniaNeural',
        'ryan': 'en-GB-RyanNeural',
        'natasha': 'en-AU-NatashaNeural',
        'william': 'en-AU-WilliamNeural',
        'clara': 'en-CA-ClaraNeural',
        'liam': 'en-CA-LiamNeural'
    },
    
    // OpenAI voices
    openai: {
        'alloy': 'alloy',
        'echo': 'echo',
        'fable': 'fable',
        'onyx': 'onyx',
        'nova': 'nova',
        'shimmer': 'shimmer'
    },
    
    // ElevenLabs voices (popular ones)
    elevenlabs: {
        'rachel': '21m00Tcm4TlvDq8ikWAM',
        'domi': 'AZnzlk1XvdvUeBnXmlld',
        'bella': 'EXAVITQu4vr4xnSDxMaL',
        'antoni': 'ErXwobaYiN019PkySvjV',
        'elli': 'MF3mGyEYCl7XYWbV9V6O',
        'josh': 'TxGEqnHWrfWFTfGW9XjX',
        'arnold': 'VR6AewLTigWG4xSOukaG',
        'adam': 'pNInz6obpgDQGcFmaJgB',
        'sam': 'yoZ06aMxZJJ28mfd3POQ'
    }
};

/**
 * Simple in-memory cache
 */
const ttsCache = new Map();

/**
 * Generate cache key for TTS request
 */
function getCacheKey(text, voice, provider, options = {}) {
    const key = JSON.stringify({
        text: text.trim(),
        voice,
        provider,
        ...options
    });
    
    // Create short hash
    let hash = 0;
    for (let i = 0; i < key.length; i++) {
        const char = key.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }
    
    return Math.abs(hash).toString(36);
}

/**
 * Check and install edge-tts if needed
 */
async function ensureEdgeTts() {
    try {
        await execAsync('edge-tts --help');
        return true;
    } catch (error) {
        console.log(chalk.yellow('Installing edge-tts...'));
        try {
            await execAsync('pip install edge-tts');
            return true;
        } catch (installError) {
            console.error(chalk.red('Failed to install edge-tts:'), installError.message);
            return false;
        }
    }
}

/**
 * Generate speech using Microsoft Edge TTS
 */
async function speakWithEdgeTts(text, voice, options = {}) {
    if (!(await ensureEdgeTts())) {
        throw new Error('edge-tts is not available');
    }
    
    const {
        rate = config.edgeTts.rate,
        pitch = config.edgeTts.pitch,
        volume = config.edgeTts.volume,
        format = config.edgeTts.format
    } = options;
    
    const tempDir = os.tmpdir();
    const tempFile = path.join(tempDir, `tts_edge_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.${format}`);
    
    try {
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
        
        if (!fs.existsSync(tempFile)) {
            throw new Error('TTS output file was not created');
        }
        
        const audioBuffer = fs.readFileSync(tempFile);
        fs.unlinkSync(tempFile);
        
        return {
            audio: audioBuffer,
            format: format,
            voice: voice,
            provider: 'edge-tts',
            size: audioBuffer.length
        };
        
    } catch (error) {
        // Clean up temp file
        try {
            if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
        } catch {}
        throw error;
    }
}

/**
 * Generate speech using OpenAI TTS
 */
async function speakWithOpenAI(text, voice, options = {}) {
    if (!config.openai.apiKey) {
        throw new Error('OpenAI API key not configured');
    }
    
    const {
        model = config.openai.model,
        speed = config.openai.speed,
        format = config.openai.format
    } = options;
    
    try {
        const response = await fetch(config.openai.endpoint, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${config.openai.apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: model,
                input: text,
                voice: voice,
                response_format: format,
                speed: speed
            })
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`OpenAI TTS failed: ${response.status} ${errorText}`);
        }
        
        const audioBuffer = Buffer.from(await response.arrayBuffer());
        
        return {
            audio: audioBuffer,
            format: format,
            voice: voice,
            provider: 'openai',
            size: audioBuffer.length
        };
        
    } catch (error) {
        throw new Error(`OpenAI TTS failed: ${error.message}`);
    }
}

/**
 * Generate speech using ElevenLabs
 */
async function speakWithElevenLabs(text, voiceId, options = {}) {
    if (!config.elevenLabs.apiKey) {
        throw new Error('ElevenLabs API key not configured');
    }
    
    const {
        model = config.elevenLabs.model,
        stability = config.elevenLabs.stability,
        similarityBoost = config.elevenLabs.similarityBoost
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
                model_id: model,
                voice_settings: {
                    stability: stability,
                    similarity_boost: similarityBoost
                }
            })
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`ElevenLabs request failed: ${response.status} ${errorText}`);
        }
        
        const audioBuffer = Buffer.from(await response.arrayBuffer());
        
        return {
            audio: audioBuffer,
            format: 'mp3',
            voice: voiceId,
            provider: 'elevenlabs',
            size: audioBuffer.length
        };
        
    } catch (error) {
        throw new Error(`ElevenLabs TTS failed: ${error.message}`);
    }
}

/**
 * Generate speech using system TTS
 */
async function speakWithSystemTTS(text, voice, options = {}) {
    const platform = os.platform();
    const tempDir = os.tmpdir();
    const tempFile = path.join(tempDir, `tts_system_${Date.now()}.wav`);
    
    try {
        if (platform === 'darwin') {
            // macOS - use say command
            const voiceName = voice || config.system.macOSVoice;
            const rate = options.speed || config.system.speed;
            
            await execAsync(`say -v "${voiceName}" -r ${rate} -o "${tempFile}" "${text.replace(/"/g, '\\"')}"`, {
                timeout: 30000
            });
            
        } else if (platform === 'linux') {
            // Linux - use espeak
            const voiceName = voice || config.system.linuxVoice;
            const speed = options.speed || config.system.speed;
            
            await execAsync(`espeak -v "${voiceName}" -s ${speed} -w "${tempFile}" "${text.replace(/"/g, '\\"')}"`, {
                timeout: 30000
            });
            
        } else if (platform === 'win32') {
            // Windows - use PowerShell
            const voiceName = voice || config.system.windowsVoice;
            const rate = Math.max(-10, Math.min(10, (options.speed - 200) / 20)); // Convert to -10 to +10 range
            
            const psCommand = `Add-Type -AssemblyName System.Speech; $synth = New-Object System.Speech.Synthesis.SpeechSynthesizer; $synth.SelectVoice('${voiceName}'); $synth.Rate = ${rate}; $synth.SetOutputToWaveFile('${tempFile}'); $synth.Speak('${text.replace(/'/g, "''")}'); $synth.Dispose()`;
            
            await execAsync(`powershell -Command "${psCommand}"`, {
                timeout: 30000
            });
            
        } else {
            throw new Error(`Unsupported platform: ${platform}`);
        }
        
        if (!fs.existsSync(tempFile)) {
            throw new Error('System TTS output file was not created');
        }
        
        const audioBuffer = fs.readFileSync(tempFile);
        fs.unlinkSync(tempFile);
        
        return {
            audio: audioBuffer,
            format: 'wav',
            voice: voice || 'system-default',
            provider: 'system',
            size: audioBuffer.length
        };
        
    } catch (error) {
        // Clean up temp file
        try {
            if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
        } catch {}
        throw error;
    }
}

/**
 * Split long text into chunks for streaming
 */
function splitTextForStreaming(text, chunkSize = config.streaming.chunkSize, overlap = config.streaming.chunkOverlap) {
    if (text.length <= chunkSize) {
        return [text];
    }
    
    const chunks = [];
    let start = 0;
    
    while (start < text.length) {
        let end = Math.min(start + chunkSize, text.length);
        
        // Try to break at sentence boundaries
        if (end < text.length) {
            const sentenceEnd = text.lastIndexOf('.', end);
            const questionEnd = text.lastIndexOf('?', end);
            const exclamationEnd = text.lastIndexOf('!', end);
            
            const lastSentence = Math.max(sentenceEnd, questionEnd, exclamationEnd);
            if (lastSentence > start + chunkSize * 0.5) {
                end = lastSentence + 1;
            }
        }
        
        chunks.push(text.substring(start, end).trim());
        start = Math.max(end - overlap, start + 1);
    }
    
    return chunks.filter(chunk => chunk.length > 0);
}

/**
 * Main TTS function
 */
export async function speak(text, options = {}) {
    if (!text || text.trim().length === 0) {
        throw new Error('Text cannot be empty');
    }
    
    const {
        voice = config.edgeTts.defaultVoice,
        provider = config.provider,
        useCache = config.cache.enabled,
        streaming = config.streaming.enabled,
        ...otherOptions
    } = options;
    
    const trimmedText = text.trim();
    
    // Handle streaming for long text
    if (streaming && trimmedText.length > config.streaming.chunkSize) {
        return await speakStreaming(trimmedText, { voice, provider, ...otherOptions });
    }
    
    // Check cache first
    if (useCache) {
        const cacheKey = getCacheKey(trimmedText, voice, provider, otherOptions);
        if (ttsCache.has(cacheKey)) {
            const cached = ttsCache.get(cacheKey);
            if (Date.now() - cached.timestamp < config.cache.ttl) {
                return { ...cached.result, cached: true };
            } else {
                ttsCache.delete(cacheKey);
            }
        }
    }
    
    // Resolve voice alias to actual voice ID
    let resolvedVoice = voice;
    if (voices[provider] && voices[provider][voice]) {
        resolvedVoice = voices[provider][voice];
    }
    
    let result;
    let lastError;
    
    // Try primary provider
    try {
        switch (provider) {
            case 'edge':
            case 'edge-tts':
                result = await speakWithEdgeTts(trimmedText, resolvedVoice, otherOptions);
                break;
            case 'openai':
                result = await speakWithOpenAI(trimmedText, resolvedVoice, otherOptions);
                break;
            case 'elevenlabs':
                result = await speakWithElevenLabs(trimmedText, resolvedVoice, otherOptions);
                break;
            case 'system':
                result = await speakWithSystemTTS(trimmedText, resolvedVoice, otherOptions);
                break;
            default:
                throw new Error(`Unknown TTS provider: ${provider}`);
        }
    } catch (error) {
        lastError = error;
        console.warn(chalk.yellow(`Primary TTS provider (${provider}) failed: ${error.message}`));
        
        // Try fallback providers
        const fallbacks = ['edge', 'system', 'openai', 'elevenlabs'].filter(p => p !== provider);
        
        for (const fallbackProvider of fallbacks) {
            try {
                // Skip if provider requirements not met
                if (fallbackProvider === 'openai' && !config.openai.apiKey) continue;
                if (fallbackProvider === 'elevenlabs' && !config.elevenLabs.apiKey) continue;
                
                console.log(chalk.blue(`Trying fallback provider: ${fallbackProvider}`));
                
                const fallbackVoice = voices[fallbackProvider] ? 
                    Object.values(voices[fallbackProvider])[0] : 
                    config[fallbackProvider]?.defaultVoice || resolvedVoice;
                
                switch (fallbackProvider) {
                    case 'edge':
                        result = await speakWithEdgeTts(trimmedText, fallbackVoice, otherOptions);
                        break;
                    case 'openai':
                        result = await speakWithOpenAI(trimmedText, fallbackVoice, otherOptions);
                        break;
                    case 'elevenlabs':
                        result = await speakWithElevenLabs(trimmedText, fallbackVoice, otherOptions);
                        break;
                    case 'system':
                        result = await speakWithSystemTTS(trimmedText, fallbackVoice, otherOptions);
                        break;
                }
                
                console.log(chalk.green(`Fallback provider ${fallbackProvider} succeeded`));
                break;
                
            } catch (fallbackError) {
                console.warn(chalk.yellow(`Fallback provider ${fallbackProvider} failed: ${fallbackError.message}`));
                lastError = fallbackError;
            }
        }
    }
    
    if (!result) {
        throw new Error(`All TTS providers failed. Last error: ${lastError?.message}`);
    }
    
    // Add metadata
    result.text = trimmedText;
    result.timestamp = new Date().toISOString();
    result.cached = false;
    
    // Cache the result
    if (useCache && ttsCache.size < config.cache.maxSize) {
        const cacheKey = getCacheKey(trimmedText, voice, provider, otherOptions);
        ttsCache.set(cacheKey, {
            result: { ...result },
            timestamp: Date.now()
        });
    }
    
    return result;
}

/**
 * Streaming TTS for long text
 */
export async function speakStreaming(text, options = {}) {
    const chunks = splitTextForStreaming(text, options.chunkSize, options.chunkOverlap);
    const results = [];
    
    console.log(chalk.blue(`Streaming TTS: ${chunks.length} chunks`));
    
    for (let i = 0; i < chunks.length; i++) {
        console.log(chalk.gray(`Processing chunk ${i + 1}/${chunks.length}...`));
        
        const chunkResult = await speak(chunks[i], { 
            ...options, 
            streaming: false // Avoid recursion
        });
        
        results.push(chunkResult);
    }
    
    return {
        chunks: results,
        totalChunks: chunks.length,
        totalSize: results.reduce((sum, r) => sum + r.size, 0),
        provider: results[0]?.provider,
        format: results[0]?.format,
        streaming: true
    };
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
        
        if (result.streaming) {
            // For streaming results, concatenate all chunks
            const allAudio = Buffer.concat(result.chunks.map(chunk => chunk.audio));
            fs.writeFileSync(outputPath, allAudio);
        } else {
            fs.writeFileSync(outputPath, result.audio);
        }
        
        return {
            ...result,
            outputPath: outputPath,
            saved: true
        };
        
    } catch (error) {
        throw new Error(`Failed to save TTS to file ${outputPath}: ${error.message}`);
    }
}

/**
 * Play TTS audio directly (platform-specific)
 */
export async function playAudio(audioBuffer, format = 'mp3') {
    const platform = os.platform();
    const tempDir = os.tmpdir();
    const tempFile = path.join(tempDir, `tts_play_${Date.now()}.${format}`);
    
    try {
        // Save audio to temp file
        fs.writeFileSync(tempFile, audioBuffer);
        
        let playCommand;
        
        if (platform === 'darwin') {
            // macOS
            playCommand = `afplay "${tempFile}"`;
        } else if (platform === 'linux') {
            // Linux - try common players
            const players = ['paplay', 'aplay', 'mpg123', 'ffplay'];
            let foundPlayer = null;
            
            for (const player of players) {
                try {
                    await execAsync(`which ${player}`);
                    foundPlayer = player;
                    break;
                } catch {}
            }
            
            if (!foundPlayer) {
                throw new Error('No audio player found. Install paplay, aplay, mpg123, or ffplay');
            }
            
            playCommand = `${foundPlayer} "${tempFile}"`;
            if (foundPlayer === 'ffplay') playCommand += ' -nodisp -autoexit';
            
        } else if (platform === 'win32') {
            // Windows
            playCommand = `powershell -c "(New-Object Media.SoundPlayer '${tempFile}').PlaySync();"`;
        } else {
            throw new Error(`Audio playback not supported on platform: ${platform}`);
        }
        
        await execAsync(playCommand);
        
    } finally {
        // Clean up temp file
        try {
            if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
        } catch {}
    }
}

/**
 * Get available voices for all providers
 */
export function getVoices(provider = null) {
    if (provider) {
        return voices[provider] || {};
    }
    return voices;
}

/**
 * Check provider availability
 */
export async function checkAvailability() {
    const status = {
        edge: false,
        openai: false,
        elevenlabs: false,
        system: false,
        available: false,
        errors: {}
    };
    
    // Check Edge TTS
    try {
        status.edge = await ensureEdgeTts();
    } catch (error) {
        status.errors.edge = error.message;
    }
    
    // Check OpenAI
    status.openai = !!config.openai.apiKey;
    if (!status.openai) status.errors.openai = 'API key not configured';
    
    // Check ElevenLabs
    status.elevenlabs = !!config.elevenLabs.apiKey;
    if (!status.elevenlabs) status.errors.elevenlabs = 'API key not configured';
    
    // Check System TTS
    try {
        const platform = os.platform();
        if (platform === 'darwin') {
            await execAsync('which say');
            status.system = true;
        } else if (platform === 'linux') {
            await execAsync('which espeak');
            status.system = true;
        } else if (platform === 'win32') {
            status.system = true; // PowerShell is usually available
        }
    } catch (error) {
        status.errors.system = `System TTS not available: ${error.message}`;
    }
    
    status.available = status.edge || status.openai || status.elevenlabs || status.system;
    
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

/**
 * LLM Integration - Read text aloud
 */
export async function readAloud(text, options = {}) {
    console.log(chalk.blue('🔊 Reading aloud...'));
    
    const result = await speak(text, {
        voice: 'aria', // Use a natural voice for reading
        ...options
    });
    
    if (options.play !== false) {
        await playAudio(result.audio, result.format);
    }
    
    return result;
}

/**
 * LLM Integration - Speak daily summary
 */
export async function speakDailySummary(summaryText, options = {}) {
    console.log(chalk.blue('📊 Speaking daily summary...'));
    
    const result = await speak(summaryText, {
        voice: 'guy', // Use a professional voice for summaries
        ...options
    });
    
    if (options.play !== false) {
        await playAudio(result.audio, result.format);
    }
    
    if (options.save) {
        const summaryPath = options.save === true ? 
            path.join(os.homedir(), 'daily_summary.mp3') : 
            options.save;
        await speakToFile(summaryText, summaryPath, options);
    }
    
    return result;
}

/**
 * Nudges Integration - Spoken reminders
 */
export async function speakReminder(reminderText, options = {}) {
    console.log(chalk.yellow('⏰ Speaking reminder...'));
    
    const result = await speak(`Reminder: ${reminderText}`, {
        voice: 'jenny', // Use a friendly voice for reminders
        ...options
    });
    
    if (options.play !== false) {
        await playAudio(result.audio, result.format);
    }
    
    return result;
}

// Import nudges functionality
import nudges from './nudges.js';

// Export default object
export default {
    speak,
    speakStreaming,
    speakToFile,
    playAudio,
    readAloud,
    speakDailySummary,
    speakReminder,
    getVoices,
    checkAvailability,
    getConfig,
    updateConfig,
    clearCache,
    nudges
};

// Export nudges for direct access
export { nudges };