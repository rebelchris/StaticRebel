/**
 * Video Analysis Module
 * Handles video understanding through frame extraction and analysis
 */

import fs from 'fs/promises';
import path from 'path';
import { spawn } from 'child_process';
import os from 'os';
import { analyzeImage } from './image.js';

/**
 * Analyze video by extracting frames and analyzing them
 */
export async function analyzeVideo(filePath, options = {}) {
  const {
    provider = 'openai',
    model = null,
    prompt = "Analyze this video by describing what you see in the frames.",
    task = 'analyze',
    frameCount = 5,
    startTime = 0,
    duration = null
  } = options;

  try {
    // Extract frames from video
    const frames = await extractFramesFromVideo(filePath, {
      frameCount,
      startTime,
      duration
    });

    if (frames.length === 0) {
      throw new Error('No frames could be extracted from the video');
    }

    // Analyze each frame
    const frameAnalyses = [];
    for (let i = 0; i < frames.length; i++) {
      const frame = frames[i];
      try {
        const framePrompt = task === 'describe' 
          ? `This is frame ${i + 1} of ${frames.length} from a video at timestamp ${frame.timestamp}s. Describe what you see in this frame.`
          : `${prompt} (Frame ${i + 1}/${frames.length} at ${frame.timestamp}s)`;

        const analysis = await analyzeImage(frame.path, {
          provider,
          model,
          prompt: framePrompt
        });

        frameAnalyses.push({
          frameNumber: i + 1,
          timestamp: frame.timestamp,
          framePath: frame.path,
          analysis: analysis.text,
          provider: analysis.provider,
          model: analysis.model
        });
      } catch (error) {
        console.warn(`Failed to analyze frame ${i + 1}: ${error.message}`);
        frameAnalyses.push({
          frameNumber: i + 1,
          timestamp: frame.timestamp,
          framePath: frame.path,
          analysis: `Error: ${error.message}`,
          provider,
          model: model || 'unknown'
        });
      }
    }

    // Generate summary
    const summary = await generateVideoSummary(frameAnalyses, prompt, task);

    // Clean up temporary frame files
    await cleanupFrames(frames);

    return {
      provider,
      model: model || 'default',
      videoPath: filePath,
      task,
      summary,
      frameAnalyses,
      frameCount: frames.length,
      timestamp: new Date().toISOString()
    };

  } catch (error) {
    throw new Error(`Video analysis failed: ${error.message}`);
  }
}

/**
 * Extract frames from video using FFmpeg
 */
export async function extractFramesFromVideo(filePath, options = {}) {
  const {
    frameCount = 5,
    startTime = 0,
    duration = null,
    outputDir = null
  } = options;

  try {
    // Create temporary directory for frames
    const tempDir = outputDir || await fs.mkdtemp(path.join(os.tmpdir(), 'sr-video-frames-'));
    
    // Get video duration first
    const videoDuration = await getVideoDuration(filePath);
    
    // Calculate frame extraction points
    const extractionDuration = duration || (videoDuration - startTime);
    const frameInterval = extractionDuration / (frameCount - 1);
    
    const frames = [];
    
    for (let i = 0; i < frameCount; i++) {
      const timestamp = startTime + (i * frameInterval);
      const frameFileName = `frame_${String(i + 1).padStart(3, '0')}.jpg`;
      const framePath = path.join(tempDir, frameFileName);
      
      try {
        await extractSingleFrame(filePath, timestamp, framePath);
        frames.push({
          path: framePath,
          timestamp: Math.round(timestamp * 100) / 100,
          frameNumber: i + 1
        });
      } catch (error) {
        console.warn(`Failed to extract frame at ${timestamp}s: ${error.message}`);
      }
    }

    return frames;
  } catch (error) {
    throw new Error(`Frame extraction failed: ${error.message}`);
  }
}

/**
 * Extract a single frame from video at specified timestamp
 */
async function extractSingleFrame(videoPath, timestamp, outputPath) {
  return new Promise((resolve, reject) => {
    const args = [
      '-ss', timestamp.toString(),
      '-i', videoPath,
      '-vframes', '1',
      '-q:v', '2',
      '-y',
      outputPath
    ];

    const ffmpeg = spawn('ffmpeg', args, {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let errorOutput = '';

    ffmpeg.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });

    ffmpeg.on('close', (code) => {
      if (code === 0) {
        resolve(outputPath);
      } else {
        reject(new Error(`FFmpeg failed: ${errorOutput}`));
      }
    });

    ffmpeg.on('error', (error) => {
      reject(new Error(`Failed to start FFmpeg: ${error.message}. Make sure FFmpeg is installed.`));
    });
  });
}

/**
 * Get video duration using FFprobe
 */
async function getVideoDuration(videoPath) {
  return new Promise((resolve, reject) => {
    const args = [
      '-v', 'quiet',
      '-show_entries', 'format=duration',
      '-of', 'csv=p=0',
      videoPath
    ];

    const ffprobe = spawn('ffprobe', args, {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let output = '';
    let errorOutput = '';

    ffprobe.stdout.on('data', (data) => {
      output += data.toString();
    });

    ffprobe.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });

    ffprobe.on('close', (code) => {
      if (code === 0) {
        const duration = parseFloat(output.trim());
        resolve(duration || 60); // Default to 60 seconds if unable to determine
      } else {
        console.warn(`FFprobe warning: ${errorOutput}`);
        resolve(60); // Default fallback
      }
    });

    ffprobe.on('error', (error) => {
      console.warn(`FFprobe not available: ${error.message}`);
      resolve(60); // Default fallback
    });
  });
}

/**
 * Generate a summary from frame analyses
 */
async function generateVideoSummary(frameAnalyses, originalPrompt, task) {
  if (frameAnalyses.length === 0) {
    return "No frames could be analyzed.";
  }

  // Create a narrative summary based on frame analyses
  const frameDescriptions = frameAnalyses
    .filter(frame => !frame.analysis.startsWith('Error:'))
    .map(frame => `Frame ${frame.frameNumber} (${frame.timestamp}s): ${frame.analysis}`)
    .join('\n\n');

  if (!frameDescriptions) {
    return "All frame analyses failed.";
  }

  let summary = '';
  
  switch (task) {
    case 'describe':
      summary = `Video Description:\n\nThis video contains ${frameAnalyses.length} analyzed frames spanning the duration. Here's what happens:\n\n${frameDescriptions}`;
      break;
    case 'analyze':
      summary = `Video Analysis:\n\n${frameDescriptions}\n\nOverall Assessment: The video shows a sequence of events captured across ${frameAnalyses.length} key frames.`;
      break;
    default:
      summary = `Video Summary (${task}):\n\n${frameDescriptions}`;
  }

  return summary;
}

/**
 * Clean up temporary frame files
 */
async function cleanupFrames(frames) {
  for (const frame of frames) {
    try {
      await fs.unlink(frame.path);
    } catch (error) {
      // Ignore cleanup errors
      console.warn(`Failed to cleanup frame ${frame.path}: ${error.message}`);
    }
  }

  // Try to remove the temp directory
  if (frames.length > 0) {
    try {
      const tempDir = path.dirname(frames[0].path);
      await fs.rmdir(tempDir);
    } catch (error) {
      // Ignore cleanup errors
    }
  }
}

/**
 * Analyze video with specific prompts for common use cases
 */
export async function summarizeVideo(filePath, options = {}) {
  const summary = await analyzeVideo(filePath, {
    ...options,
    prompt: "Summarize what happens in this video. Focus on the main actions, objects, and any narrative progression.",
    task: 'summarize'
  });
  
  return summary.summary;
}

/**
 * Extract and analyze key moments from video
 */
export async function extractKeyMoments(filePath, options = {}) {
  const { frameCount = 10 } = options;
  
  return await analyzeVideo(filePath, {
    ...options,
    frameCount,
    prompt: "Identify and describe the key moment or action in this frame. What makes this frame significant?",
    task: 'key-moments'
  });
}

/**
 * Check if FFmpeg is available
 */
export async function checkFFmpegAvailability() {
  return new Promise((resolve) => {
    const ffmpeg = spawn('ffmpeg', ['-version'], {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    ffmpeg.on('close', (code) => {
      resolve(code === 0);
    });

    ffmpeg.on('error', () => {
      resolve(false);
    });
  });
}

/**
 * Get video metadata
 */
export async function getVideoMetadata(filePath) {
  return new Promise((resolve, reject) => {
    const args = [
      '-v', 'quiet',
      '-print_format', 'json',
      '-show_format',
      '-show_streams',
      filePath
    ];

    const ffprobe = spawn('ffprobe', args, {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let output = '';
    let errorOutput = '';

    ffprobe.stdout.on('data', (data) => {
      output += data.toString();
    });

    ffprobe.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });

    ffprobe.on('close', (code) => {
      if (code === 0) {
        try {
          const metadata = JSON.parse(output);
          resolve(metadata);
        } catch (error) {
          reject(new Error(`Failed to parse metadata: ${error.message}`));
        }
      } else {
        reject(new Error(`FFprobe failed: ${errorOutput}`));
      }
    });

    ffprobe.on('error', (error) => {
      reject(new Error(`Failed to start FFprobe: ${error.message}`));
    });
  });
}