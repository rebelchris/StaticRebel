/**
 * Continuous Listener - Always-listening voice mode
 *
 * Features:
 * - Wake word activation
 * - Voice command capture
 * - Noise suppression
 * - Audio buffering
 */

import { EventEmitter } from 'events';
import { spawn } from 'child_process';
import path from 'path';
import os from 'os';
import { createWakeWordDetector } from './index.js';
import { createVAD, VAD_MODE } from './vad.js';

const LISTENER_VERSION = '1.0.0';

const DEFAULT_OPTIONS = {
  wakeWords: ['hey assistant'],
  sensitivity: 0.7,
  maxRecordingDuration: 10000,
  silenceEndDelay: 1000,
  noiseThreshold: 0.02,
  sampleRate: 16000,
  channels: 1,
  vadMode: VAD_MODE.AGGRESSIVE,
  autoSend: true,
  outputFormat: 'raw',
};

export class ContinuousListener extends EventEmitter {
  constructor(options = {}) {
    super();

    this.options = { ...DEFAULT_OPTIONS, ...options };

    this.isActive = false;
    this.isRecording = false;
    this.wakeDetector = null;
    this.vad = null;
    this.audioProcess = null;
    this.recordingBuffer = [];
    this.silenceTimer = null;

    this.stats = {
      activations: 0,
      commandsCaptured: 0,
      totalRecordingTime: 0,
      uptime: 0,
    };

    this.startTime = Date.now();
  }

  async initialize() {
    this.wakeDetector = createWakeWordDetector({
      wakeWords: this.options.wakeWords,
      sensitivity: this.options.sensitivity,
      debounceTime: 2000,
    });

    this.wakeDetector.on('wake:detected', this.handleWakeDetected.bind(this));

    this.vad = createVAD({
      mode: this.options.vadMode,
      sampleRate: this.options.sampleRate,
    });

    this.wakeDetector.on('error', (data) => {
      this.emit('error', data);
    });

    await this.wakeDetector.initialize();

    this.emit('initialized', { version: LISTENER_VERSION });
  }

  async start() {
    if (this.isActive) return;

    this.isActive = true;
    this.startTime = Date.now();

    await this.wakeDetector.start();

    this.emit('started');
  }

  stop() {
    if (!this.isActive) return;

    this.isActive = false;

    this.wakeDetector.stop();
    this.stopRecording();

    this.stats.uptime = Date.now() - this.startTime;

    this.emit('stopped');
  }

  handleWakeDetected(detection) {
    this.stats.activations++;

    this.emit('activated', {
      wakeWord: detection.wakeWord,
      timestamp: detection.timestamp,
    });

    if (this.options.autoSend) {
      this.startRecording();
    }
  }

  async startRecording() {
    if (this.isRecording) return;

    this.isRecording = true;
    this.recordingBuffer = [];
    this.vad.reset();

    this.emit('recording:started');

    await this.startAudioCapture();

    if (this.options.maxRecordingDuration) {
      this.recordingTimeout = setTimeout(() => {
        if (this.isRecording) {
          this.stopRecording();
        }
      }, this.options.maxRecordingDuration);
    }
  }

  stopRecording() {
    if (!this.isRecording) return;

    this.isRecording = false;

    if (this.recordingTimeout) {
      clearTimeout(this.recordingTimeout);
      this.recordingTimeout = null;
    }

    if (this.audioProcess) {
      this.audioProcess.kill('SIGTERM');
      this.audioProcess = null;
    }

    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer);
      this.silenceTimer = null;
    }

    const audioData = Buffer.concat(this.recordingBuffer);
    this.recordingBuffer = [];

    const duration = this.calculateDuration(audioData);
    this.stats.totalRecordingTime += duration;

    if (audioData.length > 0) {
      this.stats.commandsCaptured++;

      this.emit('recording:complete', {
        audio: audioData,
        duration,
        sampleRate: this.options.sampleRate,
      });
    } else {
      this.emit('recording:empty');
    }
  }

  async startAudioCapture() {
    if (process.platform === 'darwin') {
      this.startSoXCapture();
    } else if (process.platform === 'linux') {
      this.startALSACapture();
    } else {
      this.startMockCapture();
    }
  }

  startSoXCapture() {
    const recPath = this.findExecutable('rec') || this.findExecutable('sox');

    if (!recPath) {
      this.startMockCapture();
      return;
    }

    const args = [
      '-d',
      '-r', this.options.sampleRate,
      '-c', this.options.channels,
      '-e', 'signed-integer',
      '-b', '16',
      '-t', 'raw',
      '-',
    ];

    this.audioProcess = spawn(recPath, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    this.setupAudioCapture();
  }

  startALSACapture() {
    const args = [
      '-D', 'default',
      '-r', this.options.sampleRate,
      '-c', this.options.channels,
      '-f', 'S16_LE',
      '-t', 'raw',
      '-',
    ];

    this.audioProcess = spawn('arecord', args, {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    this.setupAudioCapture();
  }

  startMockCapture() {
    console.log('[ContinuousListener] Using mock audio capture');

    this.mockInterval = setInterval(() => {
      if (!this.isRecording) return;

      const mockData = Buffer.alloc(320);
      for (let i = 0; i < mockData.length; i++) {
        mockData[i] = Math.floor(Math.random() * 256) - 128;
      }

      this.processAudioChunk(mockData);
    }, 20);
  }

  setupAudioCapture() {
    this.audioProcess.stdout.on('data', (data) => {
      if (!this.isRecording) return;

      this.processAudioChunk(Buffer.from(data));
    });

    this.audioProcess.stderr.on('data', (data) => {
      this.emit('audio:error', { error: data.toString() });
    });

    this.audioProcess.on('error', (error) => {
      this.emit('audio:error', { error: error.message });
    });

    this.audioProcess.on('close', (code) => {
      if (this.isRecording) {
        this.emit('audio:restarting', { reason: `exit code ${code}` });
        setTimeout(() => this.startAudioCapture(), 500);
      }
    });
  }

  processAudioChunk(audioData) {
    this.recordingBuffer.push(Buffer.from(audioData));

    const vadResult = this.vad.processFrame(audioData);

    this.emit('vad:update', vadResult);

    if (vadResult.isSpeaking) {
      this.emit('speaking', {
        duration: vadResult.duration,
        energy: vadResult.energy,
      });

      if (this.silenceTimer) {
        clearTimeout(this.silenceTimer);
        this.silenceTimer = null;
      }
    } else if (this.isRecording && !this.silenceTimer) {
      this.silenceTimer = setTimeout(() => {
        if (this.isRecording) {
          this.stopRecording();
        }
      }, this.options.silenceEndDelay);
    }
  }

  calculateDuration(audioData) {
    const bytesPerSample = 2;
    const bytesPerSecond = this.options.sampleRate * bytesPerSample * this.options.channels;
    return Math.floor((audioData.length / bytesPerSecond) * 1000);
  }

  findExecutable(name) {
    try {
      const { execSync } = require('child_process');
      return execSync(`which ${name}`, { encoding: 'utf-8' }).trim();
    } catch {
      return null;
    }
  }

  addWakeWord(word) {
    this.options.wakeWords.push(word);
    this.wakeDetector.addWakeWord(word);
  }

  removeWakeWord(word) {
    this.options.wakeWords = this.options.wakeWords.filter(w => w !== word);
    this.wakeDetector.removeWakeWord(word);
  }

  setSensitivity(value) {
    this.options.sensitivity = value;
    this.wakeDetector.setSensitivity(value);
  }

  getStats() {
    return {
      version: LISTENER_VERSION,
      isActive: this.isActive,
      isRecording: this.isRecording,
      wakeWords: this.options.wakeWords,
      sensitivity: this.options.sensitivity,
      activations: this.stats.activations,
      commandsCaptured: this.stats.commandsCaptured,
      totalRecordingTime: this.stats.totalRecordingTime,
      uptime: Date.now() - this.startTime,
    };
  }
}

export function createContinuousListener(options = {}) {
  return new ContinuousListener(options);
}

export default ContinuousListener;
