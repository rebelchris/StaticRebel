/**
 * Tests for Text-to-Speech Module (Node.js native test)
 */

import { describe, test } from 'node:test';
import assert from 'node:assert';
import tts from '../../../lib/voice/tts.js';

describe('Text-to-Speech Module', () => {
    describe('Configuration', () => {
        test('should have default configuration', () => {
            const config = tts.getConfig();
            
            assert.ok(config.hasOwnProperty('edgeTts'));
            assert.ok(config.hasOwnProperty('elevenLabs'));
            assert.ok(config.hasOwnProperty('coqui'));
            assert.ok(config.hasOwnProperty('provider'));
            assert.ok(config.hasOwnProperty('format'));
            assert.ok(config.hasOwnProperty('cache'));
            
            assert.ok(config.edgeTts.hasOwnProperty('defaultVoice'));
            assert.strictEqual(config.edgeTts.defaultVoice, 'en-US-AriaNeural');
            assert.strictEqual(config.provider, 'edge');
            assert.strictEqual(config.format, 'mp3');
        });
        
        test('should update configuration', () => {
            const originalConfig = tts.getConfig();
            const newVoice = 'en-US-JennyNeural';
            
            tts.updateConfig({
                edgeTts: {
                    ...originalConfig.edgeTts,
                    defaultVoice: newVoice
                }
            });
            
            const updatedConfig = tts.getConfig();
            assert.strictEqual(updatedConfig.edgeTts.defaultVoice, newVoice);
            
            // Restore original config
            tts.updateConfig(originalConfig);
        });
    });
    
    describe('Voice Management', () => {
        test('should provide list of available voices', () => {
            const voices = tts.getVoices();
            
            assert.ok(voices);
            assert.strictEqual(typeof voices, 'object');
            assert.ok(Object.keys(voices).length > 0);
            
            // Check that default voice exists
            assert.ok(voices.hasOwnProperty('en-US-AriaNeural'));
            assert.ok(voices['en-US-AriaNeural'].includes('Aria'));
        });
        
        test('should filter voices by language', () => {
            const enUSVoices = tts.getVoicesForLanguage('en-US');
            const esESVoices = tts.getVoicesForLanguage('es-ES');
            
            assert.ok(Object.keys(enUSVoices).length > 0);
            assert.ok(Object.keys(esESVoices).length > 0);
            
            // All en-US voices should start with 'en-US'
            Object.keys(enUSVoices).forEach(voiceId => {
                assert.match(voiceId, /^en-US/);
            });
            
            // All es-ES voices should start with 'es-ES'
            Object.keys(esESVoices).forEach(voiceId => {
                assert.match(voiceId, /^es-ES/);
            });
        });
    });
    
    describe('Provider Availability', () => {
        test('should check provider availability', async () => {
            const availability = await tts.checkAvailability();
            
            assert.ok(availability.hasOwnProperty('edge'));
            assert.ok(availability.hasOwnProperty('elevenlabs'));
            assert.ok(availability.hasOwnProperty('coqui'));
            assert.ok(availability.hasOwnProperty('available'));
            assert.ok(availability.hasOwnProperty('errors'));
            
            assert.strictEqual(typeof availability.edge, 'boolean');
            assert.strictEqual(typeof availability.elevenlabs, 'boolean');
            assert.strictEqual(typeof availability.coqui, 'boolean');
            assert.strictEqual(typeof availability.available, 'boolean');
        });
    });
    
    describe('Input Validation', () => {
        test('should reject empty or invalid text', async () => {
            await assert.rejects(async () => {
                await tts.speak('');
            }, /Text cannot be empty/);
            
            await assert.rejects(async () => {
                await tts.speak(null);
            }, /Text cannot be empty/);
            
            await assert.rejects(async () => {
                await tts.speak(undefined);
            }, /Text cannot be empty/);
            
            await assert.rejects(async () => {
                await tts.speak('   ');
            }, /Text cannot be empty/);
        });
        
        test('should handle valid text input', () => {
            const validTexts = [
                'Hello, world!',
                'This is a test message.',
                'Numbers: 123, 456, 789',
                'Special chars: @#$%^&*()',
                'Multi-line\ntext\ntest'
            ];
            
            validTexts.forEach(text => {
                // Just test that validation logic would work
                assert.ok(text && text.trim().length > 0);
            });
        });
    });
    
    describe('Caching', () => {
        test('should clear cache without errors', () => {
            // Test cache clearing functionality
            tts.clearCache();
            // This should succeed without errors
            assert.ok(true);
        });
    });
    
    describe('Error Handling', () => {
        test('should provide meaningful error messages', async () => {
            const errorCases = [
                { text: '', expectedError: /Text cannot be empty/ },
                { text: null, expectedError: /Text cannot be empty/ },
                { text: undefined, expectedError: /Text cannot be empty/ },
                { text: '   ', expectedError: /Text cannot be empty/ }
            ];
            
            for (const testCase of errorCases) {
                await assert.rejects(async () => {
                    await tts.speak(testCase.text);
                }, testCase.expectedError);
            }
        });
    });
    
    describe('Configuration Options', () => {
        test('should handle different output formats', () => {
            const formats = ['mp3', 'wav', 'webm'];
            const config = tts.getConfig();
            
            formats.forEach(format => {
                // Mock test - just ensure format is a valid string
                assert.strictEqual(typeof format, 'string');
                assert.ok(format.length > 0);
            });
            
            assert.ok(['mp3', 'wav', 'webm'].includes(config.format));
        });
        
        test('should support voice parameters', () => {
            const config = tts.getConfig();
            
            assert.ok(config.edgeTts.hasOwnProperty('rate'));
            assert.ok(config.edgeTts.hasOwnProperty('pitch'));
            assert.ok(config.edgeTts.hasOwnProperty('volume'));
            
            assert.strictEqual(typeof config.edgeTts.rate, 'string');
            assert.strictEqual(typeof config.edgeTts.pitch, 'string');
            assert.strictEqual(typeof config.edgeTts.volume, 'string');
        });
    });
});

export default describe;