/**
 * Wake Word Detection - "Hey Assistant" hotword detection
 *
 * Features:
 * - Multiple wake word support
 * - Sensitivity adjustment
 * - Energy-based detection (fallback)
 * - Audio stream processing
 */

import { EventEmitter } from 'events';
import { spawn } from 'child_process';
import path from 'path';
import os from 'os';

const WAKE_WORD_VERSION = '1.0.0';

const DEFAULT_OPTIONS = {
  wakeWords: ['hey assistant', 'hey computer', 'okay computer'],
  sensitivity: 0.7,
  usePorcupine: false,
  porcupineAccessKey: null,
  debounceTime: 1500,
  minEnergy: 0.02,
  checkInterval: 100,
  audioDevice: null,
};

export class WakeWordDetector extends EventEmitter {
  constructor(options = {}) {
    super();

    this.options = { ...DEFAULT_OPTIONS, ...options };

    this.isListening = false;
    this.audioProcess = null;
    this.lastWakeTime = null;
    this.debounceTimer = null;
    this.porcupine = null;
    this.useSimple = false;
    this.audioStream = null;

    this.stats = {
      detections: 0,
      falsePositives: 0,
      totalAudioProcessed: 0,
      uptime: 0,
    };

    this.energyHistory = [];
    this.historySize = 10;

    this.startTime = Date.now();
  }

  async initialize() {
    if (this.options.usePorcupine && this.options.porcupineAccessKey) {
      await this.initPorcupine();
    } else {
      this.useSimpleDetection();
    }

    this.emit('initialized', { version: WAKE_WORD_VERSION });
  }

  async initPorcupine() {
    try {
      const PorcupineModule = await import('@picovoice/porcupine-node');
      const Porcupine = PorcupineModule.default || PorcupineModule;

      const wakeWords = this.options.wakeWords.map((word, index) => ({
        phrase: word,
        label: `wake_${index}`,
      }));

      this.porcupine = new Porcupine(
        this.options.porcupineAccessKey,
        wakeWords,
        this.options.sensitivity
      );

      this.emit('porcupine:initialized', { wordCount: wakeWords.length });
    } catch (error) {
      console.warn('[WakeWord] Porcupine init failed, using simple detection:', error.message);
      this.useSimpleDetection();
    }
  }

  useSimpleDetection() {
    this.useSimple = true;
    this.energyHistory = [];
    this.emit('simple:detection:enabled');
  }

  async start() {
    if (this.isListening) return;

    this.isListening = true;
    this.startTime = Date.now();

    await this.startAudioCapture();

    this.emit('started');
  }

  async startAudioCapture() {
    if (process.platform === 'darwin') {
      await this.startSoXCapture();
    } else if (process.platform === 'linux') {
      await this.startALSAcapture();
    } else {
      this.startMockAudio();
    }
  }

  async startSoXCapture() {
    const soxPath = this.findExecutable('sox');
    const recPath = this.findExecutable('rec');

    if (soxPath) {
      await this.startSoXWithSox(soxPath);
    } else if (recPath) {
      await this.startSoXWithRec(recPath);
    } else {
      this.startMockAudio();
    }
  }

  startSoXWithSox(soxPath) {
    const args = [
      '-d',
      '-r', '16000',
      '-c', '1',
      '-e', 'signed-integer',
      '-b', '16',
      '-t', 'raw',
      '-',
    ];

    this.audioProcess = spawn(soxPath, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    this.setupAudioProcess();
  }

  startSoXWithRec(recPath) {
    const args = [
      '-d',
      '-r', '16000',
      '-c', '1',
      '-e', 'signed-integer',
      '-b', '16',
      '-t', 'raw',
      '-',
    ];

    this.audioProcess = spawn(recPath, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    this.setupAudioProcess();
  }

  startALSAcapture() {
    const args = [
      '-D', 'default',
      '-r', '16000',
      '-c', '1',
      '-f', 'S16_LE',
      '-t', 'raw',
      '-',
    ];

    this.audioProcess = spawn('arecord', args, {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    this.setupAudioProcess();
  }

  startMockAudio() {
    console.log('[WakeWord] Using mock audio detection');

    this.mockInterval = setInterval(() => {
      if (!this.isListening) {
        clearInterval(this.mockInterval);
        return;
      }

      const mockEnergy = Math.random() * 0.005;

      if (mockEnergy > this.options.minEnergy && Math.random() < 0.0005) {
        this.detectSpeechPattern();
      }
    }, this.options.checkInterval);
  }

  setupAudioProcess() {
    const buffer = [];

    this.audioProcess.stdout.on('data', (data) => {
      if (!this.isListening) return;

      buffer.push(Buffer.from(data));

      if (buffer.length > 50) {
        const audioData = Buffer.concat(buffer);
        buffer.length = 0;

        this.processAudioChunk(audioData);
      }
    });

    this.audioProcess.stderr.on('data', (data) => {
      this.emit('audio:error', { error: data.toString() });
    });

    this.audioProcess.on('error', (error) => {
      this.emit('audio:error', { error: error.message });
    });

    this.audioProcess.on('close', (code) => {
      if (this.isListening) {
        this.emit('audio:restarting', { reason: `exit code ${code}` });
        setTimeout(() => this.startAudioCapture(), 1000);
      }
    });
  }

  async processAudioChunk(audioData) {
    this.stats.totalAudioProcessed += audioData.length;

    if (this.porcupine) {
      await this.processWithPorcupine(audioData);
    } else {
      this.processWithEnergy(audioData);
    }
  }

  async processWithPorcupine(audioData) {
    try {
      const results = this.porcupine.process(audioData);

      for (const result of results) {
        if (result.hit) {
          const wakeWord = this.options.wakeWords[result.keywordIndex] || 'unknown';
          this.handleWakeDetection(wakeWord);
        }
      }
    } catch (error) {
      this.emit('porcupine:error', { error: error.message });
    }
  }

  processWithEnergy(audioData) {
    const energy = this.calculateEnergy(audioData);

    this.energyHistory.push(energy);
    if (this.energyHistory.length > this.historySize) {
      this.energyHistory.shift();
    }

    if (energy > this.options.minEnergy) {
      const avgEnergy = this.energyHistory.slice(0, -1).reduce((a, b) => a + b, 0) / Math.max(1, this.energyHistory.length - 1);

      if (energy > avgEnergy * 3 && avgEnergy > 0.005) {
        this.detectSpeechPattern();
      }
    }
  }

  detectSpeechPattern() {
    if (this.debounceTimer) return;

    if (this.lastWakeTime && Date.now() - this.lastWakeTime < this.options.debounceTime) {
      this.stats.falsePositives++;
      return;
    }

    const word = this.options.wakeWords[Math.floor(Math.random() * this.options.wakeWords.length)];

    this.handleWakeDetection(word);
  }

  calculateEnergy(audioData) {
    try {
      const samples = new Int16Array(audioData.buffer);
      let sum = 0;

      for (let i = 0; i < samples.length; i++) {
        sum += Math.abs(samples[i]);
      }

      return sum / (samples.length || 1) / 32768;
    } catch {
      return 0;
    }
  }

  handleWakeDetection(wakeWord) {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.lastWakeTime = Date.now();
    this.stats.detections++;

    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
    }, this.options.debounceTime);

    const detection = {
      wakeWord,
      timestamp: Date.now(),
      uptime: Date.now() - this.startTime,
    };

    this.emit('wake:detected', detection);
  }

  findExecutable(name) {
    try {
      const { execSync } = require('child_process');
      return execSync(`which ${name}`, { encoding: 'utf-8' }).trim();
    } catch {
      return null;
    }
  }

  async stop() {
    this.isListening = false;

    if (this.audioProcess) {
      this.audioProcess.kill('SIGTERM');
      this.audioProcess = null;
    }

    if (this.mockInterval) {
      clearInterval(this.mockInterval);
      this.mockInterval = null;
    }

    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    if (this.porcupine) {
      try {
        this.porcupine.release();
      } catch {}
      this.porcupine = null;
    }

    this.stats.uptime = Date.now() - this.startTime;

    this.emit('stopped');
  }

  addWakeWord(word) {
    if (!this.options.wakeWords.includes(word.toLowerCase())) {
      this.options.wakeWords.push(word.toLowerCase());
      this.emit('wakeword:added', { word });
    }
  }

  removeWakeWord(word) {
    const index = this.options.wakeWords.indexOf(word.toLowerCase());
    if (index > -1) {
      this.options.wakeWords.splice(index, 1);
      this.emit('wakeword:removed', { word });
    }
  }

  setSensitivity(value) {
    this.options.sensitivity = Math.max(0, Math.min(1, value));
    this.emit('sensitivity:changed', { sensitivity: this.options.sensitivity });
  }

  getStats() {
    return {
      version: WAKE_WORD_VERSION,
      isListening: this.isListening,
      wakeWords: this.options.wakeWords,
      sensitivity: this.options.sensitivity,
      detections: this.stats.detections,
      falsePositives: this.stats.falsePositives,
      uptime: Date.now() - this.startTime,
      accuracy: this.stats.detections > 0
        ? this.stats.detections / (this.stats.detections + this.stats.falsePositives + 1)
        : 0,
    };
  }

  getWakeWords() {
    return [...this.options.wakeWords];
  }
}

export function createWakeWordDetector(options = {}) {
  return new WakeWordDetector(options);
}

export default WakeWordDetector;
