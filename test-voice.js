#!/usr/bin/env node

/**
 * Voice I/O Test Script
 * Quick test of voice functionality without full StaticRebel startup
 */

import { voiceIO } from './lib/voice/index.js';
import fs from 'fs';

async function testVoiceIO() {
  console.log('🎤 Testing Voice I/O Module...\n');
  
  try {
    // Test 1: Check availability
    console.log('1️⃣ Checking provider availability...');
    const availability = await voiceIO.checkAvailability();
    
    console.log(`   Whisper available: ${availability.whisper.available ? '✅' : '❌'}`);
    console.log(`   TTS available: ${availability.tts.available ? '✅' : '❌'}\n`);
    
    // Test 2: TTS Test (if available)
    if (availability.tts.available) {
      console.log('2️⃣ Testing Text-to-Speech...');
      const testText = 'Hello! This is a test of the StaticRebel voice system.';
      
      try {
        const ttsResult = await voiceIO.speak(testText);
        console.log(`   ✅ TTS Success!`);
        console.log(`   Provider: ${ttsResult.provider}`);
        console.log(`   Voice: ${ttsResult.voice}`);
        console.log(`   Size: ${(ttsResult.size / 1024).toFixed(1)} KB`);
        
        // Save test audio
        const outputFile = `voice_test_${Date.now()}.${ttsResult.format}`;
        fs.writeFileSync(outputFile, ttsResult.audio);
        console.log(`   Saved to: ${outputFile}\n`);
        
      } catch (ttsError) {
        console.log(`   ❌ TTS Error: ${ttsError.message}\n`);
      }
    } else {
      console.log('2️⃣ Skipping TTS test (not available)\n');
    }
    
    // Test 3: Create test WAV for transcription
    if (availability.whisper.available) {
      console.log('3️⃣ Testing Speech-to-Text...');
      console.log('   (Creating minimal test audio file...)');
      
      // Create a minimal WAV file for testing
      const sampleRate = 44100;
      const duration = 1; // 1 second
      const channels = 1;
      const bitsPerSample = 16;
      const dataSize = sampleRate * duration * channels * (bitsPerSample / 8);
      
      const wavBuffer = Buffer.alloc(44 + dataSize);
      let offset = 0;
      
      // WAV Header
      wavBuffer.write('RIFF', offset); offset += 4;
      wavBuffer.writeUInt32LE(44 + dataSize - 8, offset); offset += 4;
      wavBuffer.write('WAVE', offset); offset += 4;
      wavBuffer.write('fmt ', offset); offset += 4;
      wavBuffer.writeUInt32LE(16, offset); offset += 4;
      wavBuffer.writeUInt16LE(1, offset); offset += 2;
      wavBuffer.writeUInt16LE(channels, offset); offset += 2;
      wavBuffer.writeUInt32LE(sampleRate, offset); offset += 4;
      wavBuffer.writeUInt32LE(sampleRate * channels * (bitsPerSample / 8), offset); offset += 4;
      wavBuffer.writeUInt16LE(channels * (bitsPerSample / 8), offset); offset += 2;
      wavBuffer.writeUInt16LE(bitsPerSample, offset); offset += 2;
      wavBuffer.write('data', offset); offset += 4;
      wavBuffer.writeUInt32LE(dataSize, offset); offset += 4;
      
      // Fill with silence
      wavBuffer.fill(0, offset);
      
      try {
        const transcribeResult = await voiceIO.listen(wavBuffer, {
          filename: 'test_silence.wav'
        });
        
        console.log(`   ✅ Transcription Success!`);
        console.log(`   Provider: ${transcribeResult.provider}`);
        console.log(`   Language: ${transcribeResult.language}`);
        console.log(`   Result: "${transcribeResult.text}"\n`);
        
      } catch (transcribeError) {
        console.log(`   ❌ Transcription Error: ${transcribeError.message}\n`);
      }
    } else {
      console.log('3️⃣ Skipping transcription test (not available)\n');
    }
    
    // Test 4: Configuration
    console.log('4️⃣ Configuration Info:');
    const config = voiceIO.getConfig();
    console.log(`   Whisper Provider: ${config.whisper.provider}`);
    console.log(`   TTS Provider: ${config.tts.provider}`);
    console.log(`   Default Voice: ${config.tts.edgeTts?.defaultVoice || 'N/A'}`);
    
    console.log('\n✅ Voice I/O test completed!');
    
  } catch (error) {
    console.error(`\n❌ Test failed: ${error.message}`);
    process.exit(1);
  }
}

testVoiceIO().catch(console.error);