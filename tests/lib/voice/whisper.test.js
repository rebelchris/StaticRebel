/**
 * Tests for Whisper Speech-to-Text Module (Node.js native test)
 */

import { describe, test } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import whisper from '../../../lib/voice/whisper.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('Whisper Speech-to-Text', () => {
    describe('Configuration', () => {
        test('should have default configuration', () => {
            const config = whisper.getConfig();
            
            assert.ok(config.hasOwnProperty('ollama'));
            assert.ok(config.hasOwnProperty('openai'));
            assert.ok(config.hasOwnProperty('provider'));
            assert.ok(config.hasOwnProperty('supportedFormats'));
            assert.ok(config.hasOwnProperty('maxFileSizeBytes'));
            
            assert.ok(config.supportedFormats.includes('wav'));
            assert.ok(config.supportedFormats.includes('mp3'));
            assert.ok(config.supportedFormats.includes('webm'));
        });
        
        test('should update configuration', () => {
            const originalConfig = whisper.getConfig();
            const newProvider = 'openai';
            
            whisper.updateConfig({ provider: newProvider });
            
            const updatedConfig = whisper.getConfig();
            assert.strictEqual(updatedConfig.provider, newProvider);
            
            // Restore original config
            whisper.updateConfig({ provider: originalConfig.provider });
        });
    });
    
    describe('Input Validation', () => {
        test('should handle invalid audio input', async () => {
            await assert.rejects(async () => {
                await whisper.transcribe(null);
            }, /Audio input must be a Buffer/);
            
            await assert.rejects(async () => {
                await whisper.transcribe(Buffer.alloc(0));
            }, /Audio buffer is empty/);
            
            // Test oversized buffer
            const largeBuffer = Buffer.alloc(30 * 1024 * 1024); // 30MB
            await assert.rejects(async () => {
                await whisper.transcribe(largeBuffer);
            }, /Audio file too large/);
        });
    });
    
    describe('Provider Availability', () => {
        test('should check provider availability', async () => {
            const availability = await whisper.checkAvailability();
            
            assert.ok(availability.hasOwnProperty('ollama'));
            assert.ok(availability.hasOwnProperty('openai'));
            assert.ok(availability.hasOwnProperty('available'));
            assert.ok(availability.hasOwnProperty('errors'));
            
            assert.strictEqual(typeof availability.ollama, 'boolean');
            assert.strictEqual(typeof availability.openai, 'boolean');
            assert.strictEqual(typeof availability.available, 'boolean');
            assert.strictEqual(typeof availability.errors, 'object');
        });
    });
    
    describe('Error Handling', () => {
        test('should handle provider errors gracefully', async () => {
            await assert.rejects(async () => {
                const testBuffer = Buffer.alloc(1024);
                await whisper.transcribe(testBuffer, { provider: 'invalid-provider' });
            }, /Unknown provider: invalid-provider/);
        });
    });
    
    describe('Basic Functionality', () => {
        test('should validate audio buffer size', () => {
            const config = whisper.getConfig();
            const maxSize = config.maxFileSizeBytes;
            
            assert.ok(typeof maxSize === 'number');
            assert.ok(maxSize > 0);
        });
        
        test('should support multiple audio formats', () => {
            const config = whisper.getConfig();
            const formats = config.supportedFormats;
            
            assert.ok(Array.isArray(formats));
            assert.ok(formats.length > 0);
            assert.ok(formats.includes('wav'));
            assert.ok(formats.includes('mp3'));
        });
    });
});

export default describe;