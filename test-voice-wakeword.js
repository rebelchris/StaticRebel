/**
 * Voice Wake Word Test Suite
 *
 * Run with: node test-voice-wakeword.js
 */

import {
  createWakeWordDetector,
} from './lib/voice/wake-word/index.js';
import {
  createContinuousListener,
} from './lib/voice/wake-word/continuous-listener.js';
import {
  createVAD,
} from './lib/voice/wake-word/vad.js';

function log(message, type = 'info') {
  const timestamp = new Date().toLocaleTimeString();
  const prefix = type === 'success' ? '✓' : type === 'error' ? '✗' : '→';
  console.log(`[${timestamp}] ${prefix} ${message}`);
}

async function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runTests() {
  console.log('\n' + '='.repeat(50));
  log('Voice Wake Word - Test Suite');
  console.log('='.repeat(50) + '\n');

  let passed = 0;
  let failed = 0;

  log('1. Testing Wake Word Detector...');
  const wakeDetector = createWakeWordDetector({
    wakeWords: ['hey assistant', 'okay computer'],
    sensitivity: 0.7,
  });

  await wakeDetector.initialize();
  log('  Initialized', 'success');
  passed++;

  log('2. Testing wake word management...');
  wakeDetector.addWakeWord('hello computer');
  const words = wakeDetector.getWakeWords();
  log(`  Wake words: ${words.length}`, words.length === 3 ? 'success' : 'error');
  if (words.length === 3) passed++; else failed++;

  wakeDetector.removeWakeWord('hello computer');
  const afterRemove = wakeDetector.getWakeWords();
  log(`  After remove: ${afterRemove.length}`, afterRemove.length === 2 ? 'success' : 'error');
  if (afterRemove.length === 2) passed++; else failed++;

  log('3. Testing sensitivity...');
  wakeDetector.setSensitivity(0.8);
  const stats = wakeDetector.getStats();
  log(`  Sensitivity: ${stats.sensitivity}`, stats.sensitivity === 0.8 ? 'success' : 'error');
  if (stats.sensitivity === 0.8) passed++; else failed++;

  log('4. Testing VAD...');
  const vad = createVAD({
    mode: 2,
    sampleRate: 16000,
  });

  const mockAudio = Buffer.alloc(320);
  for (let i = 0; i < mockAudio.length; i++) {
    mockAudio[i] = Math.floor(Math.random() * 256) - 128;
  }

  const result = vad.processFrame(mockAudio);
  log(`  VAD processed: isSpeech=${result.isSpeech}`, result.isSpeech !== undefined ? 'success' : 'error');
  if (result.isSpeech !== undefined) passed++; else failed++;

  const vadStats = vad.getStats();
  log(`  VAD stats: speech=${vadStats.speechDetected}`, 'success');
  passed++;

  log('5. Testing Continuous Listener...');
  const listener = createContinuousListener({
    wakeWords: ['hey assistant'],
    maxRecordingDuration: 2000,
    autoSend: false,
  });

  listener.on('activated', () => {
    log('  Listener activated!', 'success');
  });

  listener.on('recording:complete', () => {
    log('  Recording complete!', 'success');
  });

  await listener.initialize();
  log('  Listener initialized', 'success');
  passed++;

  listener.on('error', (data) => {
    if (data.error && !data.error.includes('executable')) {
      console.log(`  Warning: ${data.error}`);
    }
  });

  log('6. Testing mock wake detection...');
  wakeDetector.on('wake:detected', (detection) => {
    log(`  Wake detected: ${detection.wakeWord}`, 'success');
  });

  wakeDetector.handleWakeDetection('hey assistant');
  const wakeStats = wakeDetector.getStats();
  log(`  Detections: ${wakeStats.detections}`, wakeStats.detections === 1 ? 'success' : 'error');
  if (wakeStats.detections === 1) passed++; else failed++;

  log('7. Testing debounce...');
  wakeDetector.handleWakeDetection('hey assistant');
  const afterDebounce = wakeDetector.getStats();
  log(`  After debounce: ${afterDebounce.falsePositives}`, afterDebounce.falsePositives === 1 ? 'success' : 'error');
  if (afterDebounce.falsePositives === 1) passed++; else failed++;

  log('8. Getting final stats...');
  const finalStats = wakeDetector.getStats();
  log(`  Version: ${finalStats.version}`, finalStats.version === '1.0.0' ? 'success' : 'error');
  if (finalStats.version === '1.0.0') passed++; else failed++;

  log('9. Stopping components...');
  wakeDetector.stop();
  listener.stop();
  log('  Stopped', 'success');
  passed++;

  console.log('\n' + '='.repeat(50));
  log(`Results: ${passed} passed, ${failed} failed`);
  console.log('='.repeat(50) + '\n');

  return failed === 0;
}

runTests().then((success) => {
  process.exit(success ? 0 : 1);
});
