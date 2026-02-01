/**
 * TTS CLI Command Handler
 * Handles speak commands for StaticRebel
 */

import chalk from 'chalk';
import path from 'path';
import os from 'os';
import tts from './index.js';

/**
 * Display help for speak commands
 */
function showHelp() {
    console.log(chalk.blue('\n📢 StaticRebel TTS Commands\n'));
    
    console.log(chalk.green('Basic Usage:'));
    console.log('  sr speak "Hello world"                    - Speak text with default voice');
    console.log('  sr speak --play "Hello world"             - Speak and play immediately');
    console.log('  sr speak --save output.mp3 "Hello"       - Save to file');
    console.log('  sr speak --voice aria "Hello"            - Use specific voice');
    console.log('  sr speak --provider openai "Hello"       - Use specific provider');
    
    console.log(chalk.green('\nVoice Options:'));
    console.log('  --voice <voice>        Voice to use (aria, guy, jenny, alloy, etc.)');
    console.log('  --provider <provider>  TTS provider (edge, openai, elevenlabs, system)');
    console.log('  --rate <rate>          Speech rate (-100% to +200% for edge)');
    console.log('  --pitch <pitch>        Voice pitch (+/-Hz for edge)');
    console.log('  --speed <speed>        Speech speed (0.25-4.0 for OpenAI)');
    
    console.log(chalk.green('\nOutput Options:'));
    console.log('  --save <file>          Save audio to file');
    console.log('  --play                 Play audio immediately (default)');
    console.log('  --no-play              Don\'t play audio');
    console.log('  --format <format>      Audio format (mp3, wav, webm)');
    
    console.log(chalk.green('\nStreaming Options:'));
    console.log('  --stream               Enable streaming for long text');
    console.log('  --chunk-size <size>    Characters per chunk (default: 200)');
    
    console.log(chalk.green('\nUtility Commands:'));
    console.log('  sr speak --voices                         - List available voices');
    console.log('  sr speak --providers                      - List available providers');
    console.log('  sr speak --status                         - Show provider status');
    console.log('  sr speak --config                         - Show current configuration');
    console.log('  sr speak --clear-cache                    - Clear TTS cache');
    
    console.log(chalk.green('\nExamples:'));
    console.log('  sr speak "Good morning! How are you?"');
    console.log('  sr speak --voice guy --save morning.mp3 "Good morning!"');
    console.log('  sr speak --provider openai --voice alloy "Hello from OpenAI"');
    console.log('  sr speak --stream "This is a very long text that will be..."');
    
    console.log(chalk.blue('\n💡 Tip: Use aliases like "aria", "guy", "jenny" for Edge voices'));
    console.log(chalk.blue('       or "alloy", "nova", "shimmer" for OpenAI voices\n'));
}

/**
 * List available voices
 */
async function listVoices() {
    console.log(chalk.blue('\n🎤 Available Voices\n'));
    
    const voices = tts.getVoices();
    
    for (const [provider, voiceMap] of Object.entries(voices)) {
        console.log(chalk.green(`${provider.toUpperCase()}:`));
        
        for (const [alias, voiceId] of Object.entries(voiceMap)) {
            console.log(chalk.gray(`  ${alias.padEnd(12)} → ${voiceId}`));
        }
        console.log();
    }
}

/**
 * List available providers
 */
async function listProviders() {
    console.log(chalk.blue('\n⚙️ Available Providers\n'));
    
    const availability = await tts.checkAvailability();
    
    const providers = [
        { 
            name: 'Edge TTS', 
            key: 'edge', 
            description: 'Microsoft Edge TTS (Free, High Quality)',
            available: availability.edge 
        },
        { 
            name: 'OpenAI TTS', 
            key: 'openai', 
            description: 'OpenAI Text-to-Speech API (Requires API key)',
            available: availability.openai 
        },
        { 
            name: 'ElevenLabs', 
            key: 'elevenlabs', 
            description: 'ElevenLabs Voice AI (Requires API key)',
            available: availability.elevenlabs 
        },
        { 
            name: 'System TTS', 
            key: 'system', 
            description: 'Built-in system TTS (macOS say, Linux espeak)',
            available: availability.system 
        }
    ];
    
    for (const provider of providers) {
        const status = provider.available ? chalk.green('✅ Available') : chalk.red('❌ Unavailable');
        console.log(`${chalk.blue(provider.name)} (${provider.key})`);
        console.log(`  Status: ${status}`);
        console.log(`  Description: ${chalk.gray(provider.description)}`);
        
        if (!provider.available && availability.errors[provider.key]) {
            console.log(`  Error: ${chalk.red(availability.errors[provider.key])}`);
        }
        console.log();
    }
}

/**
 * Show provider status
 */
async function showStatus() {
    console.log(chalk.blue('\n📊 TTS Status\n'));
    
    const availability = await tts.checkAvailability();
    const config = tts.getConfig();
    
    console.log(`Default Provider: ${chalk.green(config.provider)}`);
    console.log(`Overall Status: ${availability.available ? chalk.green('✅ Ready') : chalk.red('❌ No providers available')}`);
    console.log();
    
    console.log('Provider Details:');
    for (const [provider, status] of Object.entries(availability)) {
        if (provider === 'available' || provider === 'errors') continue;
        
        const icon = status ? '✅' : '❌';
        console.log(`  ${provider}: ${icon}`);
        
        if (!status && availability.errors[provider]) {
            console.log(`    ${chalk.red(availability.errors[provider])}`);
        }
    }
    console.log();
}

/**
 * Show current configuration
 */
function showConfig() {
    console.log(chalk.blue('\n⚙️ TTS Configuration\n'));
    
    const config = tts.getConfig();
    
    console.log(chalk.green('General:'));
    console.log(`  Provider: ${config.provider}`);
    console.log(`  Streaming: ${config.streaming.enabled ? 'Enabled' : 'Disabled'}`);
    console.log(`  Cache: ${config.cache.enabled ? 'Enabled' : 'Disabled'}`);
    console.log();
    
    console.log(chalk.green('Edge TTS:'));
    console.log(`  Default Voice: ${config.edgeTts.defaultVoice}`);
    console.log(`  Rate: ${config.edgeTts.rate}`);
    console.log(`  Pitch: ${config.edgeTts.pitch}`);
    console.log(`  Volume: ${config.edgeTts.volume}`);
    console.log(`  Format: ${config.edgeTts.format}`);
    console.log();
    
    console.log(chalk.green('OpenAI:'));
    console.log(`  API Key: ${config.openai.apiKey ? 'Configured' : 'Not configured'}`);
    console.log(`  Model: ${config.openai.model}`);
    console.log(`  Voice: ${config.openai.voice}`);
    console.log(`  Speed: ${config.openai.speed}`);
    console.log();
    
    console.log(chalk.green('ElevenLabs:'));
    console.log(`  API Key: ${config.elevenLabs.apiKey ? 'Configured' : 'Not configured'}`);
    console.log(`  Voice ID: ${config.elevenLabs.voiceId}`);
    console.log(`  Model: ${config.elevenLabs.model}`);
    console.log();
}

/**
 * Parse arguments for speak command
 */
function parseArgs(args) {
    const options = {
        text: '',
        voice: null,
        provider: null,
        rate: null,
        pitch: null,
        speed: null,
        save: null,
        play: true,
        format: null,
        streaming: false,
        chunkSize: null,
        showHelp: false,
        showVoices: false,
        showProviders: false,
        showStatus: false,
        showConfig: false,
        clearCache: false
    };
    
    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        
        switch (arg) {
            case '--help':
            case '-h':
                options.showHelp = true;
                break;
                
            case '--voices':
                options.showVoices = true;
                break;
                
            case '--providers':
                options.showProviders = true;
                break;
                
            case '--status':
                options.showStatus = true;
                break;
                
            case '--config':
                options.showConfig = true;
                break;
                
            case '--clear-cache':
                options.clearCache = true;
                break;
                
            case '--voice':
                options.voice = args[++i];
                break;
                
            case '--provider':
                options.provider = args[++i];
                break;
                
            case '--rate':
                options.rate = args[++i];
                break;
                
            case '--pitch':
                options.pitch = args[++i];
                break;
                
            case '--speed':
                options.speed = parseFloat(args[++i]);
                break;
                
            case '--save':
                options.save = args[++i];
                break;
                
            case '--play':
                options.play = true;
                break;
                
            case '--no-play':
                options.play = false;
                break;
                
            case '--format':
                options.format = args[++i];
                break;
                
            case '--stream':
                options.streaming = true;
                break;
                
            case '--chunk-size':
                options.chunkSize = parseInt(args[++i]);
                break;
                
            default:
                // If it doesn't start with --, it's part of the text
                if (!arg.startsWith('--')) {
                    if (options.text) {
                        options.text += ' ' + arg;
                    } else {
                        options.text = arg;
                    }
                }
                break;
        }
    }
    
    return options;
}

/**
 * Execute speak command
 */
async function executeSpeakCommand(text, options) {
    try {
        console.log(chalk.blue(`🗣️ Speaking: "${text.length > 50 ? text.substring(0, 50) + '...' : text}"`));
        
        // Build TTS options
        const ttsOptions = {};
        
        if (options.voice) ttsOptions.voice = options.voice;
        if (options.provider) ttsOptions.provider = options.provider;
        if (options.rate) ttsOptions.rate = options.rate;
        if (options.pitch) ttsOptions.pitch = options.pitch;
        if (options.speed) ttsOptions.speed = options.speed;
        if (options.format) ttsOptions.format = options.format;
        if (options.streaming) ttsOptions.streaming = true;
        if (options.chunkSize) ttsOptions.chunkSize = options.chunkSize;
        
        // Generate speech
        const result = await tts.speak(text, ttsOptions);
        
        console.log(chalk.green('✅ Speech generated successfully!'));
        console.log(`   Provider: ${result.provider}`);
        console.log(`   Voice: ${result.voice}`);
        console.log(`   Size: ${(result.size / 1024).toFixed(1)} KB`);
        
        if (result.streaming) {
            console.log(`   Chunks: ${result.totalChunks}`);
        }
        
        if (result.cached) {
            console.log(`   Source: ${chalk.yellow('Cache')}`);
        }
        
        // Save to file if requested
        if (options.save) {
            if (result.streaming) {
                // For streaming results, concatenate chunks
                const allAudio = Buffer.concat(result.chunks.map(chunk => chunk.audio));
                require('fs').writeFileSync(options.save, allAudio);
            } else {
                require('fs').writeFileSync(options.save, result.audio);
            }
            console.log(chalk.green(`💾 Saved to: ${options.save}`));
        }
        
        // Play audio if requested
        if (options.play) {
            console.log(chalk.blue('🔊 Playing audio...'));
            
            if (result.streaming) {
                // Play chunks sequentially
                for (let i = 0; i < result.chunks.length; i++) {
                    console.log(chalk.gray(`Playing chunk ${i + 1}/${result.chunks.length}...`));
                    await tts.playAudio(result.chunks[i].audio, result.chunks[i].format);
                }
            } else {
                await tts.playAudio(result.audio, result.format);
            }
            
            console.log(chalk.green('✅ Playback completed!'));
        }
        
    } catch (error) {
        console.error(chalk.red('❌ TTS Error:'), error.message);
        
        // Suggest solutions for common errors
        if (error.message.includes('edge-tts')) {
            console.log(chalk.yellow('💡 Try: pip install edge-tts'));
        } else if (error.message.includes('API key')) {
            console.log(chalk.yellow('💡 Set the appropriate API key in your environment variables'));
        } else if (error.message.includes('No audio player')) {
            console.log(chalk.yellow('💡 Install an audio player: sudo apt install paplay (Linux) or similar'));
        }
        
        process.exit(1);
    }
}

/**
 * Main speak command handler
 */
export async function speakCommand(args) {
    try {
        const options = parseArgs(args);
        
        // Handle utility commands
        if (options.showHelp) {
            showHelp();
            return;
        }
        
        if (options.showVoices) {
            await listVoices();
            return;
        }
        
        if (options.showProviders) {
            await listProviders();
            return;
        }
        
        if (options.showStatus) {
            await showStatus();
            return;
        }
        
        if (options.showConfig) {
            showConfig();
            return;
        }
        
        if (options.clearCache) {
            tts.clearCache();
            console.log(chalk.green('✅ TTS cache cleared'));
            return;
        }
        
        // Check if we have text to speak
        if (!options.text || options.text.trim().length === 0) {
            console.error(chalk.red('❌ No text provided to speak'));
            console.log(chalk.yellow('Usage: sr speak "text to speak"'));
            console.log(chalk.gray('       sr speak --help for more options'));
            process.exit(1);
        }
        
        // Execute speak command
        await executeSpeakCommand(options.text, options);
        
    } catch (error) {
        console.error(chalk.red('❌ Speak command failed:'), error.message);
        process.exit(1);
    }
}

export default speakCommand;