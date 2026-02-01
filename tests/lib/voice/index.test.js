/**
 * Tests for Voice I/O Module - Main Entry Point (Node.js native test)
 */

import { describe, test } from 'node:test';
import assert from 'node:assert';
import voice, { 
    VoiceIO, 
    whisper, 
    tts, 
    transcribe, 
    transcribeFile, 
    speak, 
    speakToFile, 
    getVoices, 
    voiceIO 
} from '../../../lib/voice/index.js';

describe('Voice I/O Module Integration', () => {
    describe('Module Exports', () => {
        test('should export all expected functions and classes', () => {
            assert.ok(VoiceIO);
            assert.ok(whisper);
            assert.ok(tts);
            assert.ok(transcribe);
            assert.ok(transcribeFile);
            assert.ok(speak);
            assert.ok(speakToFile);
            assert.ok(getVoices);
            assert.ok(voiceIO);
            
            assert.strictEqual(typeof VoiceIO, 'function');
            assert.strictEqual(typeof whisper, 'object');
            assert.strictEqual(typeof tts, 'object');
            assert.strictEqual(typeof transcribe, 'function');
            assert.strictEqual(typeof transcribeFile, 'function');
            assert.strictEqual(typeof speak, 'function');
            assert.strictEqual(typeof speakToFile, 'function');
            assert.strictEqual(typeof getVoices, 'function');
            assert.strictEqual(typeof voiceIO, 'object');
        });
        
        test('should export default object with all methods', () => {
            assert.ok(voice);
            assert.ok(voice.hasOwnProperty('VoiceIO'));
            assert.ok(voice.hasOwnProperty('whisper'));
            assert.ok(voice.hasOwnProperty('tts'));
            assert.ok(voice.hasOwnProperty('transcribe'));
            assert.ok(voice.hasOwnProperty('speak'));
            assert.ok(voice.hasOwnProperty('getVoices'));
            assert.ok(voice.hasOwnProperty('voiceIO'));
        });
    });
    
    describe('VoiceIO Class', () => {
        test('should create VoiceIO instance', () => {
            const instance = new VoiceIO();
            assert.ok(instance);
            assert.ok(instance instanceof VoiceIO);
        });
        
        test('should initialize with custom configuration', () => {
            const config = {
                whisper: { provider: 'openai' },
                tts: { provider: 'elevenlabs' }
            };
            
            const instance = new VoiceIO(config);
            assert.ok(instance.config);
            assert.deepStrictEqual(instance.config.whisper, config.whisper);
            assert.deepStrictEqual(instance.config.tts, config.tts);
        });
        
        test('should have required methods', () => {
            const instance = new VoiceIO();
            
            assert.strictEqual(typeof instance.listen, 'function');
            assert.strictEqual(typeof instance.speak, 'function');
            assert.strictEqual(typeof instance.conversation, 'function');
            assert.strictEqual(typeof instance.checkAvailability, 'function');
            assert.strictEqual(typeof instance.getConfig, 'function');
            assert.strictEqual(typeof instance.updateConfig, 'function');
        });
    });
    
    describe('Configuration Management', () => {
        test('should get current configuration', () => {
            const testVoiceIO = new VoiceIO();
            const config = testVoiceIO.getConfig();
            
            assert.ok(config.hasOwnProperty('whisper'));
            assert.ok(config.hasOwnProperty('tts'));
            
            assert.strictEqual(typeof config.whisper, 'object');
            assert.strictEqual(typeof config.tts, 'object');
        });
        
        test('should update configuration', () => {
            const testVoiceIO = new VoiceIO();
            const newConfig = {
                whisper: { provider: 'openai' },
                tts: { provider: 'elevenlabs' }
            };
            
            testVoiceIO.updateConfig(newConfig);
            
            const updatedConfig = testVoiceIO.getConfig();
            assert.ok(updatedConfig);
        });
    });
    
    describe('Availability Checking', () => {
        test('should check overall availability', async () => {
            const testVoiceIO = new VoiceIO();
            const availability = await testVoiceIO.checkAvailability();
            
            assert.ok(availability.hasOwnProperty('whisper'));
            assert.ok(availability.hasOwnProperty('tts'));
            assert.ok(availability.hasOwnProperty('available'));
            
            assert.strictEqual(typeof availability.whisper.available, 'boolean');
            assert.strictEqual(typeof availability.tts.available, 'boolean');
            assert.strictEqual(typeof availability.available, 'boolean');
        });
    });
    
    describe('Convenience Functions', () => {
        test('should use convenience getVoices function', () => {
            const voices = getVoices();
            assert.strictEqual(typeof voices, 'object');
            assert.ok(Object.keys(voices).length > 0);
        });
    });
    
    describe('Error Handling', () => {
        test('should handle conversation errors gracefully', async () => {
            const testVoiceIO = new VoiceIO();
            const invalidProcessor = 123; // Not a function or string
            
            const testBuffer = Buffer.alloc(100);
            await assert.rejects(async () => {
                await testVoiceIO.conversation(testBuffer, invalidProcessor);
            }, /Processor must be a function or string/);
        });
    });
    
    describe('Default Instance', () => {
        test('should provide working default voiceIO instance', () => {
            assert.ok(voiceIO);
            assert.ok(voiceIO instanceof VoiceIO);
            
            assert.strictEqual(typeof voiceIO.listen, 'function');
            assert.strictEqual(typeof voiceIO.speak, 'function');
            assert.strictEqual(typeof voiceIO.conversation, 'function');
        });
    });
    
    describe('Module Integration', () => {
        test('should integrate whisper and tts modules properly', () => {
            // Test that the modules are accessible through the main export
            assert.ok(voice.whisper);
            assert.ok(voice.tts);
            
            // Test that they have expected methods
            assert.strictEqual(typeof voice.whisper.transcribe, 'function');
            assert.strictEqual(typeof voice.whisper.checkAvailability, 'function');
            assert.strictEqual(typeof voice.tts.speak, 'function');
            assert.strictEqual(typeof voice.tts.getVoices, 'function');
        });
        
        test('should provide consistent configurations', () => {
            const whisperConfig = whisper.getConfig();
            const ttsConfig = tts.getConfig();
            const voiceIOConfig = voiceIO.getConfig();
            
            assert.ok(whisperConfig);
            assert.ok(ttsConfig);
            assert.ok(voiceIOConfig);
            
            assert.strictEqual(typeof whisperConfig, 'object');
            assert.strictEqual(typeof ttsConfig, 'object');
            assert.strictEqual(typeof voiceIOConfig, 'object');
        });
    });
});

export default describe;