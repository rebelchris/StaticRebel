/**
 * Image Analysis Module
 * Handles image understanding, OCR, and description using various vision models
 */

import fs from 'fs/promises';
import { spawn } from 'child_process';
import { promisify } from 'util';
import fetch from 'node-fetch';
import { getMimeType } from './index.js';

/**
 * Analyze image using vision LLM
 */
export async function analyzeImage(filePath, options = {}) {
  const {
    provider = 'openai',
    model = null,
    prompt = "What's in this image? Describe what you see in detail."
  } = options;

  try {
    // Read image file
    const imageBuffer = await fs.readFile(filePath);
    const base64Image = imageBuffer.toString('base64');
    const mimeType = getMimeType(filePath);

    // Route to appropriate provider
    switch (provider.toLowerCase()) {
      case 'openai':
        return await analyzeImageOpenAI(base64Image, mimeType, prompt, model);
      case 'anthropic':
      case 'claude':
        return await analyzeImageAnthropic(base64Image, mimeType, prompt, model);
      case 'google':
      case 'gemini':
        return await analyzeImageGoogle(base64Image, mimeType, prompt, model);
      case 'ollama':
        return await analyzeImageOllama(filePath, prompt, model);
      default:
        throw new Error(`Unsupported provider: ${provider}`);
    }
  } catch (error) {
    throw new Error(`Image analysis failed: ${error.message}`);
  }
}

/**
 * Extract text from image using OCR
 */
export async function extractTextFromImage(filePath, options = {}) {
  const {
    provider = 'openai',
    model = null
  } = options;

  const ocrPrompt = `Extract all text from this image. Return only the text content, maintaining the original formatting and structure as much as possible. If there's no text, respond with "No text found."`;

  return await analyzeImage(filePath, { provider, model, prompt: ocrPrompt });
}

/**
 * Describe image contents
 */
export async function describeImage(filePath, options = {}) {
  const {
    provider = 'openai',
    model = null
  } = options;

  const describePrompt = `Describe this image in detail. Include:
- What objects, people, or scenes you see
- Colors, lighting, and composition
- Any text or writing visible
- The overall mood or atmosphere
- Any notable details or interesting elements`;

  return await analyzeImage(filePath, { provider, model, prompt: describePrompt });
}

/**
 * Analyze image using OpenAI's vision models
 */
async function analyzeImageOpenAI(base64Image, mimeType, prompt, model = 'gpt-4o') {
  try {
    // Check if OpenAI API key is available
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OpenAI API key not found. Please set OPENAI_API_KEY environment variable.');
    }

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: model,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: prompt
              },
              {
                type: "image_url",
                image_url: {
                  url: `data:${mimeType};base64,${base64Image}`,
                  detail: "high"
                }
              }
            ]
          }
        ],
        max_tokens: 1000,
        temperature: 0.7
      })
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status} ${response.statusText}`);
    }

    const result = await response.json();
    
    return {
      provider: 'openai',
      model: model,
      text: result.choices[0].message.content,
      usage: result.usage,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    throw new Error(`OpenAI analysis failed: ${error.message}`);
  }
}

/**
 * Analyze image using Anthropic's Claude vision models
 */
async function analyzeImageAnthropic(base64Image, mimeType, prompt, model = 'claude-3-sonnet-20240229') {
  try {
    // Check if Anthropic API key is available
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error('Anthropic API key not found. Please set ANTHROPIC_API_KEY environment variable.');
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: model,
        max_tokens: 1000,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: prompt
              },
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: mimeType,
                  data: base64Image
                }
              }
            ]
          }
        ]
      })
    });

    if (!response.ok) {
      throw new Error(`Anthropic API error: ${response.status} ${response.statusText}`);
    }

    const result = await response.json();
    
    return {
      provider: 'anthropic',
      model: model,
      text: result.content[0].text,
      usage: result.usage,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    throw new Error(`Anthropic analysis failed: ${error.message}`);
  }
}

/**
 * Analyze image using Google's Gemini vision models
 */
async function analyzeImageGoogle(base64Image, mimeType, prompt, model = 'gemini-1.5-flash') {
  try {
    // Check if Google API key is available
    const apiKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('Google API key not found. Please set GOOGLE_API_KEY or GEMINI_API_KEY environment variable.');
    }

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: prompt
              },
              {
                inline_data: {
                  mime_type: mimeType,
                  data: base64Image
                }
              }
            ]
          }
        ],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 1000
        }
      })
    });

    if (!response.ok) {
      throw new Error(`Google API error: ${response.status} ${response.statusText}`);
    }

    const result = await response.json();
    
    if (!result.candidates || result.candidates.length === 0) {
      throw new Error('No response from Google Gemini');
    }
    
    return {
      provider: 'google',
      model: model,
      text: result.candidates[0].content.parts[0].text,
      usage: result.usageMetadata,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    throw new Error(`Google analysis failed: ${error.message}`);
  }
}

/**
 * Analyze image using Ollama's local vision models
 */
async function analyzeImageOllama(filePath, prompt, model = 'llava') {
  return new Promise((resolve, reject) => {
    try {
      // Use ollama CLI to analyze image
      const child = spawn('ollama', ['run', model, prompt], {
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let output = '';
      let errorOutput = '';

      // Send the image file path to stdin
      child.stdin.write(filePath + '\n');
      child.stdin.end();

      child.stdout.on('data', (data) => {
        output += data.toString();
      });

      child.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });

      child.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`Ollama process failed: ${errorOutput || 'Unknown error'}`));
          return;
        }

        resolve({
          provider: 'ollama',
          model: model,
          text: output.trim(),
          timestamp: new Date().toISOString()
        });
      });

      child.on('error', (error) => {
        reject(new Error(`Failed to start Ollama: ${error.message}. Make sure Ollama is installed and running.`));
      });
    } catch (error) {
      reject(new Error(`Ollama analysis failed: ${error.message}`));
    }
  });
}

/**
 * Get available models for a provider
 */
export function getAvailableModels(provider) {
  const modelMap = {
    openai: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-vision-preview'],
    anthropic: ['claude-3-opus-20240229', 'claude-3-sonnet-20240229', 'claude-3-haiku-20240307'],
    google: ['gemini-1.5-pro', 'gemini-1.5-flash', 'gemini-pro-vision'],
    ollama: ['llava', 'llava:13b', 'llava:34b', 'bakllava', 'moondream']
  };

  return modelMap[provider.toLowerCase()] || [];
}

/**
 * Check if a provider supports vision
 */
export function supportsVision(provider) {
  const supportedProviders = ['openai', 'anthropic', 'google', 'ollama'];
  return supportedProviders.includes(provider.toLowerCase());
}