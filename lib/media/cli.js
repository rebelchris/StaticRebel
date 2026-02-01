/**
 * Media CLI Module
 * Provides command-line interface for media understanding features
 */

import chalk from 'chalk';
import path from 'path';
import { 
  analyzeMedia, 
  extractText, 
  describe, 
  getSupportedProviders, 
  getFileInfo,
  isImage,
  isVideo 
} from './index.js';
import { checkFFmpegAvailability } from './video.js';

/**
 * Main media command handler
 */
export async function mediaCommand(args) {
  if (args.length === 0) {
    return showHelp();
  }

  const command = args[0];

  try {
    switch (command) {
      case 'analyze':
        return await handleAnalyze(args.slice(1));
      case 'ocr':
        return await handleOCR(args.slice(1));
      case 'describe':
        return await handleDescribe(args.slice(1));
      case 'info':
        return await handleInfo(args.slice(1));
      case 'providers':
        return handleProviders();
      case 'check':
        return await handleSystemCheck();
      case 'help':
      case '--help':
      case '-h':
        return showHelp();
      default:
        return `${chalk.red('Error:')} Unknown media command: ${command}\n\n${showHelp()}`;
    }
  } catch (error) {
    return `${chalk.red('Error:')} ${error.message}`;
  }
}

/**
 * Handle analyze command
 */
async function handleAnalyze(args) {
  if (args.length === 0) {
    return `${chalk.red('Error:')} No file specified\n\nUsage: sr media analyze <file> [options]`;
  }

  const filePath = args[0];
  const options = parseOptions(args.slice(1));

  try {
    console.log(chalk.blue(`📸 Analyzing ${path.basename(filePath)}...`));
    
    const result = await analyzeMedia(filePath, options);
    
    let output = `${chalk.green('✓ Analysis Complete')}\n\n`;
    output += `${chalk.bold('File:')} ${filePath}\n`;
    output += `${chalk.bold('Provider:')} ${result.provider}\n`;
    output += `${chalk.bold('Model:')} ${result.model}\n`;
    
    if (result.frameCount) {
      output += `${chalk.bold('Frames Analyzed:')} ${result.frameCount}\n`;
    }
    
    output += `${chalk.bold('Timestamp:')} ${result.timestamp}\n\n`;
    
    if (result.summary) {
      output += `${chalk.bold('Summary:')}\n${result.summary}\n\n`;
    } else {
      output += `${chalk.bold('Analysis:')}\n${result.text}\n\n`;
    }
    
    if (result.frameAnalyses) {
      output += `${chalk.bold('Frame Details:')}\n`;
      result.frameAnalyses.forEach(frame => {
        output += `${chalk.gray(`Frame ${frame.frameNumber} (${frame.timestamp}s):`)} ${frame.analysis}\n`;
      });
      output += '\n';
    }
    
    if (result.usage) {
      output += `${chalk.gray('Usage:')} ${JSON.stringify(result.usage, null, 2)}\n`;
    }
    
    return output;
  } catch (error) {
    return `${chalk.red('Analysis failed:')} ${error.message}`;
  }
}

/**
 * Handle OCR command
 */
async function handleOCR(args) {
  if (args.length === 0) {
    return `${chalk.red('Error:')} No file specified\n\nUsage: sr media ocr <file> [options]`;
  }

  const filePath = args[0];
  const options = parseOptions(args.slice(1));

  if (!isImage(filePath)) {
    return `${chalk.red('Error:')} OCR is only supported for image files`;
  }

  try {
    console.log(chalk.blue(`📝 Extracting text from ${path.basename(filePath)}...`));
    
    const result = await extractText(filePath, options);
    
    let output = `${chalk.green('✓ Text Extraction Complete')}\n\n`;
    output += `${chalk.bold('File:')} ${filePath}\n`;
    output += `${chalk.bold('Provider:')} ${result.provider}\n`;
    output += `${chalk.bold('Model:')} ${result.model}\n\n`;
    output += `${chalk.bold('Extracted Text:')}\n`;
    output += `${result.text}\n`;
    
    return output;
  } catch (error) {
    return `${chalk.red('OCR failed:')} ${error.message}`;
  }
}

/**
 * Handle describe command
 */
async function handleDescribe(args) {
  if (args.length === 0) {
    return `${chalk.red('Error:')} No file specified\n\nUsage: sr media describe <file> [options]`;
  }

  const filePath = args[0];
  const options = parseOptions(args.slice(1));

  try {
    console.log(chalk.blue(`🔍 Describing ${path.basename(filePath)}...`));
    
    const result = await describe(filePath, options);
    
    let output = `${chalk.green('✓ Description Complete')}\n\n`;
    output += `${chalk.bold('File:')} ${filePath}\n`;
    output += `${chalk.bold('Provider:')} ${result.provider}\n`;
    output += `${chalk.bold('Model:')} ${result.model}\n\n`;
    
    if (result.summary) {
      output += `${chalk.bold('Description:')}\n${result.summary}\n`;
    } else {
      output += `${chalk.bold('Description:')}\n${result.text}\n`;
    }
    
    return output;
  } catch (error) {
    return `${chalk.red('Description failed:')} ${error.message}`;
  }
}

/**
 * Handle info command
 */
async function handleInfo(args) {
  if (args.length === 0) {
    return `${chalk.red('Error:')} No file specified\n\nUsage: sr media info <file>`;
  }

  const filePath = args[0];

  try {
    const info = await getFileInfo(filePath);
    
    let output = `${chalk.green('✓ File Information')}\n\n`;
    output += `${chalk.bold('Name:')} ${info.name}\n`;
    output += `${chalk.bold('Path:')} ${info.path}\n`;
    output += `${chalk.bold('Type:')} ${info.type}\n`;
    output += `${chalk.bold('Extension:')} ${info.extension}\n`;
    output += `${chalk.bold('MIME Type:')} ${info.mimeType}\n`;
    output += `${chalk.bold('Size:')} ${info.sizeFormatted} (${info.size} bytes)\n`;
    output += `${chalk.bold('Modified:')} ${info.modified.toISOString()}\n`;
    output += `${chalk.bold('Created:')} ${info.created.toISOString()}\n`;
    
    return output;
  } catch (error) {
    return `${chalk.red('Info failed:')} ${error.message}`;
  }
}

/**
 * Handle providers command
 */
function handleProviders() {
  const providers = getSupportedProviders();
  
  let output = `${chalk.green('✓ Supported Providers')}\n\n`;
  
  providers.forEach(provider => {
    output += `${chalk.bold(provider.name)} (${provider.id})\n`;
    output += `  ${chalk.gray('Models:')} ${provider.models.join(', ')}\n`;
    output += `  ${chalk.gray('Capabilities:')} ${provider.capabilities.join(', ')}\n\n`;
  });
  
  output += `${chalk.yellow('💡 Tip:')} Use --provider <name> and --model <model> to specify which to use\n`;
  
  return output;
}

/**
 * Handle system check command
 */
async function handleSystemCheck() {
  let output = `${chalk.green('🔧 Media Understanding System Check')}\n\n`;
  
  // Check FFmpeg availability
  const ffmpegAvailable = await checkFFmpegAvailability();
  output += `${chalk.bold('FFmpeg:')} ${ffmpegAvailable ? chalk.green('✓ Available') : chalk.red('✗ Not found')}\n`;
  
  if (!ffmpegAvailable) {
    output += `  ${chalk.gray('Video analysis requires FFmpeg. Install: https://ffmpeg.org/download.html')}\n`;
  }
  
  // Check API keys
  output += `\n${chalk.bold('API Keys:')}\n`;
  
  const apiKeys = [
    { name: 'OpenAI', env: 'OPENAI_API_KEY' },
    { name: 'Anthropic', env: 'ANTHROPIC_API_KEY' },
    { name: 'Google/Gemini', env: 'GOOGLE_API_KEY' }
  ];
  
  apiKeys.forEach(api => {
    const hasKey = !!process.env[api.env];
    output += `  ${api.name}: ${hasKey ? chalk.green('✓ Set') : chalk.yellow('⚠ Not set')}\n`;
  });
  
  output += `\n${chalk.yellow('💡 Tip:')} Set API keys in environment variables for full functionality\n`;
  
  return output;
}

/**
 * Parse command-line options
 */
function parseOptions(args) {
  const options = {};
  
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i];
    const value = args[i + 1];
    
    switch (key) {
      case '--provider':
      case '-p':
        options.provider = value;
        break;
      case '--model':
      case '-m':
        options.model = value;
        break;
      case '--prompt':
        options.prompt = value;
        break;
      case '--frames':
      case '-f':
        options.frameCount = parseInt(value) || 5;
        break;
      case '--start':
      case '-s':
        options.startTime = parseFloat(value) || 0;
        break;
      case '--duration':
      case '-d':
        options.duration = parseFloat(value);
        break;
      default:
        // Skip unknown options
        i--; // Back up one since we didn't consume a value
    }
  }
  
  return options;
}

/**
 * Show help information
 */
function showHelp() {
  return `${chalk.bold.green('StaticRebel Media Understanding')}

${chalk.bold('Usage:')}
  sr media <command> [options]

${chalk.bold('Commands:')}
  analyze <file>     Analyze image or video content
  ocr <file>         Extract text from image (OCR)
  describe <file>    Get detailed description of media
  info <file>        Show file information and metadata
  providers          List supported AI providers and models
  check              Check system requirements and API keys
  help               Show this help message

${chalk.bold('Options:')}
  --provider, -p     AI provider (openai, anthropic, google, ollama)
  --model, -m        Specific model to use
  --prompt           Custom analysis prompt
  --frames, -f       Number of frames to extract from video (default: 5)
  --start, -s        Start time for video analysis (seconds)
  --duration, -d     Duration for video analysis (seconds)

${chalk.bold('Examples:')}
  sr media analyze image.jpg
  sr media analyze video.mp4 --provider openai --frames 10
  sr media ocr screenshot.png --provider google
  sr media describe photo.jpg --prompt "Focus on the people in this image"
  sr media info large-file.mp4

${chalk.bold('LLM Integration Examples:')}
  "What's in this image?" → sr media describe image.jpg
  "Extract text from this screenshot" → sr media ocr screenshot.png
  "Summarize this video" → sr media analyze video.mp4

${chalk.yellow('💡 Tip:')} Use 'sr media providers' to see available AI models and capabilities`;
}