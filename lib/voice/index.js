/**
 * Voice I/O Module - Main Entry Point
 * Provides both speech-to-text (Whisper) and text-to-speech capabilities
 */

import whisper from './whisper.js';
import tts from './tts.js';

/**
 * Voice Input/Output class combining both capabilities
 */
export class VoiceIO {
    constructor(options = {}) {
        this.config = {
            whisper: options.whisper || {},
            tts: options.tts || {}
        };
        
        // Update configurations
        if (this.config.whisper) {
            whisper.updateConfig(this.config.whisper);
        }
        if (this.config.tts) {
            tts.updateConfig(this.config.tts);
        }
    }
    
    /**
     * Transcribe audio to text
     */
    async listen(audioBuffer, options = {}) {
        return await whisper.transcribe(audioBuffer, options);
    }
    
    /**
     * Convert text to speech
     */
    async speak(text, options = {}) {
        return await tts.speak(text, options);
    }
    
    /**
     * Full conversation cycle: listen to audio, process, respond with voice
     */
    async conversation(audioBuffer, processor, options = {}) {
        const {
            transcribeOptions = {},
            speakOptions = {},
            includeAudio = true
        } = options;
        
        try {
            // Step 1: Transcribe audio input
            const transcription = await this.listen(audioBuffer, transcribeOptions);
            
            // Step 2: Process the transcribed text
            let response;
            if (typeof processor === 'function') {
                response = await processor(transcription.text, transcription);
            } else if (typeof processor === 'string') {
                response = processor; // Use as-is
            } else {
                throw new Error('Processor must be a function or string');
            }
            
            // Step 3: Convert response to speech (if requested)
            let audioResponse = null;
            if (includeAudio && response) {
                audioResponse = await this.speak(response, speakOptions);
            }
            
            return {
                input: {
                    transcription: transcription,
                    audio: audioBuffer
                },
                output: {
                    text: response,
                    audio: audioResponse
                },
                timestamp: new Date().toISOString()
            };
            
        } catch (error) {
            throw new Error(`Voice conversation failed: ${error.message}`);
        }
    }
    
    /**
     * Check if both input and output are available
     */
    async checkAvailability() {
        const [whisperStatus, ttsStatus] = await Promise.all([
            whisper.checkAvailability(),
            tts.checkAvailability()
        ]);
        
        return {
            whisper: whisperStatus,
            tts: ttsStatus,
            available: whisperStatus.available && ttsStatus.available
        };
    }
    
    /**
     * Get current configuration
     */
    getConfig() {
        return {
            whisper: whisper.getConfig(),
            tts: tts.getConfig()
        };
    }
    
    /**
     * Update configuration
     */
    updateConfig(newConfig) {
        if (newConfig.whisper) {
            whisper.updateConfig(newConfig.whisper);
        }
        if (newConfig.tts) {
            tts.updateConfig(newConfig.tts);
        }
        Object.assign(this.config, newConfig);
    }
}

// Export individual modules
export { whisper, tts };

// Export convenience functions
export const transcribe = whisper.transcribe;
export const transcribeFile = whisper.transcribeFile;
export const speak = tts.speak;
export const speakToFile = tts.speakToFile;
export const getVoices = tts.getVoices;

// Create default instance
export const voiceIO = new VoiceIO();

// Default export
export default {
    VoiceIO,
    whisper,
    tts,
    transcribe,
    transcribeFile,
    speak,
    speakToFile,
    getVoices,
    voiceIO
};