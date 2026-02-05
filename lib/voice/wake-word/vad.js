/**
 * Voice Activity Detection (VAD)
 *
 * Detects speech vs silence in audio streams
 */

import { EventEmitter } from 'events';

const VAD_VERSION = '1.0.0';

const VAD_MODE = {
  QUALITY: 0,
  LOW_BITRATE: 1,
  AGGRESSIVE: 2,
  VERY_AGGRESSIVE: 3,
};

const SILENCE_THRESHOLD = 500;
const SPEECH_TIMEOUT = 1500;

export class VoiceActivityDetector extends EventEmitter {
  constructor(options = {}) {
    super();

    this.options = {
      mode: options.mode || VAD_MODE.AGGRESSIVE,
      sampleRate: options.sampleRate || 16000,
      frameDuration: options.frameDuration || 30,
      silenceThreshold: options.silenceThreshold || SILENCE_THRESHOLD,
      speechTimeout: options.speechTimeout || SPEECH_TIMEOUT,
      minSpeechDuration: options.minSpeechDuration || 300,
    };

    this.isSpeaking = false;
    this.speechStartTime = null;
    this.lastSpeechTime = null;
    this.speechFrames = 0;
    this.silenceFrames = 0;

    this.stats = {
      speechDetected: 0,
      silenceDetected: 0,
      totalSpeechDuration: 0,
    };
  }

  processFrame(audioData) {
    const energy = this.calculateEnergy(audioData);
    const isSpeech = energy > this.options.silenceThreshold;

    if (isSpeech) {
      this.handleSpeechFrame(energy);
    } else {
      this.handleSilenceFrame();
    }

    return {
      isSpeech,
      energy,
      isSpeaking: this.isSpeaking,
      duration: this.isSpeaking ? Date.now() - this.speechStartTime : 0,
    };
  }

  handleSpeechFrame(energy) {
    this.stats.speechDetected++;
    this.lastSpeechTime = Date.now();

    if (!this.isSpeaking) {
      this.speechStartTime = Date.now();
      this.speechFrames = 0;
      this.emit('speech:start', { energy });
    }

    this.isSpeaking = true;
    this.speechFrames++;
    this.silenceFrames = 0;

    if (this.speechFrames >= this.options.minSpeechDuration / this.options.frameDuration) {
      this.emit('speech:detected', {
        duration: Date.now() - this.speechStartTime,
        energy,
      });
    }
  }

  handleSilenceFrame() {
    this.stats.silenceDetected++;

    if (this.isSpeaking) {
      this.silenceFrames++;

      if (this.silenceFrames >= this.options.speechTimeout / this.options.frameDuration) {
        const duration = Date.now() - this.speechStartTime;
        this.stats.totalSpeechDuration += duration;

        this.emit('speech:end', {
          duration,
          lastSpeechTime: this.lastSpeechTime,
        });

        this.isSpeaking = false;
        this.speechStartTime = null;
        this.speechFrames = 0;
        this.silenceFrames = 0;
      }
    }
  }

  calculateEnergy(audioData) {
    try {
      const samples = new Int16Array(audioData.buffer);
      let sum = 0;

      for (let i = 0; i < samples.length; i++) {
        sum += Math.abs(samples[i]);
      }

      return sum / (samples.length || 1);
    } catch {
      return 0;
    }
  }

  reset() {
    this.isSpeaking = false;
    this.speechStartTime = null;
    this.lastSpeechTime = null;
    this.speechFrames = 0;
    this.silenceFrames = 0;
  }

  getStats() {
    return {
      version: VAD_VERSION,
      isSpeaking: this.isSpeaking,
      speechDetected: this.stats.speechDetected,
      silenceDetected: this.stats.silenceDetected,
      totalSpeechDuration: this.stats.totalSpeechDuration,
    };
  }
}

export function createVAD(options = {}) {
  return new VoiceActivityDetector(options);
}

export { VAD_MODE };
export { VoiceActivityDetector as VAD }; 
