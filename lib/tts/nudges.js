/**
 * TTS Nudges Integration
 * Provides spoken reminders and notifications
 */

import tts from './index.js';
import chalk from 'chalk';

/**
 * Configuration for nudges
 */
const config = {
    voice: 'jenny',  // Friendly voice for reminders
    playSound: true,
    saveReminders: false,
    volume: 80      // Percentage
};

/**
 * Speak a reminder with appropriate formatting
 */
export async function speakReminder(reminderText, options = {}) {
    try {
        console.log(chalk.yellow('⏰ Speaking reminder...'));
        
        // Format the reminder text
        let spokenText = reminderText;
        
        // Add reminder prefix if not already present
        if (!reminderText.toLowerCase().includes('reminder')) {
            spokenText = `Reminder: ${reminderText}`;
        }
        
        // Use friendly voice and appropriate settings
        const result = await tts.speak(spokenText, {
            voice: options.voice || config.voice,
            provider: options.provider || 'edge',
            ...options
        });
        
        // Play immediately unless disabled
        if (options.play !== false && config.playSound) {
            await tts.playAudio(result.audio, result.format);
        }
        
        // Save reminder audio if configured
        if (config.saveReminders && options.save) {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const filename = `reminder-${timestamp}.${result.format}`;
            await tts.speakToFile(spokenText, filename, { voice: config.voice });
            console.log(chalk.green(`💾 Reminder saved to: ${filename}`));
        }
        
        console.log(chalk.green('✅ Reminder spoken successfully!'));
        
        return {
            ...result,
            reminderText: spokenText,
            timestamp: new Date().toISOString(),
            type: 'reminder'
        };
        
    } catch (error) {
        console.error(chalk.red('❌ Failed to speak reminder:'), error.message);
        throw error;
    }
}

/**
 * Speak a daily nudge (motivational message)
 */
export async function speakDailyNudge(nudgeText, options = {}) {
    try {
        console.log(chalk.blue('🌟 Speaking daily nudge...'));
        
        const result = await tts.speak(nudgeText, {
            voice: options.voice || 'aria', // Inspiring voice
            provider: options.provider || 'edge',
            ...options
        });
        
        if (options.play !== false) {
            await tts.playAudio(result.audio, result.format);
        }
        
        return {
            ...result,
            nudgeText,
            timestamp: new Date().toISOString(),
            type: 'nudge'
        };
        
    } catch (error) {
        console.error(chalk.red('❌ Failed to speak nudge:'), error.message);
        throw error;
    }
}

/**
 * Speak a habit reminder
 */
export async function speakHabitReminder(habitName, customMessage = null, options = {}) {
    try {
        console.log(chalk.cyan(`🎯 Speaking habit reminder: ${habitName}`));
        
        const messages = [
            `Time for your ${habitName} habit!`,
            `Don't forget to ${habitName} today.`,
            `Your ${habitName} reminder is here.`,
            `Let's keep up with your ${habitName} routine.`,
            `Time to focus on ${habitName}.`
        ];
        
        const spokenText = customMessage || messages[Math.floor(Math.random() * messages.length)];
        
        const result = await tts.speak(spokenText, {
            voice: options.voice || 'jenny',
            provider: options.provider || 'edge',
            ...options
        });
        
        if (options.play !== false) {
            await tts.playAudio(result.audio, result.format);
        }
        
        return {
            ...result,
            habitName,
            reminderText: spokenText,
            timestamp: new Date().toISOString(),
            type: 'habit'
        };
        
    } catch (error) {
        console.error(chalk.red('❌ Failed to speak habit reminder:'), error.message);
        throw error;
    }
}

/**
 * Speak a break reminder
 */
export async function speakBreakReminder(breakType = 'break', options = {}) {
    try {
        console.log(chalk.magenta(`☕ Speaking break reminder: ${breakType}`));
        
        const breakMessages = {
            break: [
                "Time to take a break! Step away from your screen.",
                "Break time! Give your eyes and mind a rest.",
                "You've been working hard. Time for a break!",
                "Take a moment to stretch and breathe."
            ],
            water: [
                "Hydration reminder! Time to drink some water.",
                "Don't forget to stay hydrated!",
                "Water break! Your body needs hydration.",
                "Time to drink some water and refresh."
            ],
            stretch: [
                "Time to stretch! Your body will thank you.",
                "Stretch break! Move those muscles.",
                "Let's do some stretches to stay limber.",
                "Take a moment to stretch and move around."
            ],
            eyes: [
                "Give your eyes a break! Look away from the screen.",
                "Eye break time! Look at something far away.",
                "Rest your eyes for a moment.",
                "Time to blink and rest your eyes."
            ]
        };
        
        const messages = breakMessages[breakType] || breakMessages.break;
        const spokenText = messages[Math.floor(Math.random() * messages.length)];
        
        const result = await tts.speak(spokenText, {
            voice: options.voice || 'clara',
            provider: options.provider || 'edge',
            ...options
        });
        
        if (options.play !== false) {
            await tts.playAudio(result.audio, result.format);
        }
        
        return {
            ...result,
            breakType,
            reminderText: spokenText,
            timestamp: new Date().toISOString(),
            type: 'break'
        };
        
    } catch (error) {
        console.error(chalk.red('❌ Failed to speak break reminder:'), error.message);
        throw error;
    }
}

/**
 * Speak a time-based notification
 */
export async function speakTimeNotification(message, timeInfo, options = {}) {
    try {
        console.log(chalk.blue(`⏰ Speaking time notification: ${message}`));
        
        let spokenText = message;
        
        if (timeInfo) {
            const { hour, minute, period } = timeInfo;
            if (hour && minute !== undefined) {
                const timeStr = `${hour}:${minute.toString().padStart(2, '0')} ${period || ''}`.trim();
                spokenText = `It's ${timeStr}. ${message}`;
            }
        }
        
        const result = await tts.speak(spokenText, {
            voice: options.voice || 'guy',
            provider: options.provider || 'edge',
            ...options
        });
        
        if (options.play !== false) {
            await tts.playAudio(result.audio, result.format);
        }
        
        return {
            ...result,
            originalMessage: message,
            spokenText,
            timeInfo,
            timestamp: new Date().toISOString(),
            type: 'time-notification'
        };
        
    } catch (error) {
        console.error(chalk.red('❌ Failed to speak time notification:'), error.message);
        throw error;
    }
}

/**
 * Speak a focus session reminder
 */
export async function speakFocusReminder(sessionType, duration, options = {}) {
    try {
        console.log(chalk.green(`🎯 Speaking focus reminder: ${sessionType}`));
        
        const focusMessages = {
            start: [
                `Starting your ${duration} minute focus session. Let's get to work!`,
                `Focus time! You have ${duration} minutes to concentrate.`,
                `Beginning your focused work session. Stay concentrated for ${duration} minutes.`
            ],
            end: [
                `Great job! Your ${duration} minute focus session is complete.`,
                `Focus session finished! You've been productive for ${duration} minutes.`,
                `Well done! You stayed focused for ${duration} minutes.`
            ],
            break: [
                `Focus break time! You've earned a ${duration} minute break.`,
                `Time for a break after your focused work. Relax for ${duration} minutes.`,
                `Break time! Step away and recharge for ${duration} minutes.`
            ]
        };
        
        const messages = focusMessages[sessionType] || [`${sessionType} for ${duration} minutes.`];
        const spokenText = messages[Math.floor(Math.random() * messages.length)];
        
        const result = await tts.speak(spokenText, {
            voice: options.voice || 'davis',
            provider: options.provider || 'edge',
            ...options
        });
        
        if (options.play !== false) {
            await tts.playAudio(result.audio, result.format);
        }
        
        return {
            ...result,
            sessionType,
            duration,
            reminderText: spokenText,
            timestamp: new Date().toISOString(),
            type: 'focus'
        };
        
    } catch (error) {
        console.error(chalk.red('❌ Failed to speak focus reminder:'), error.message);
        throw error;
    }
}

/**
 * Configure nudges settings
 */
export function configureNudges(newConfig) {
    Object.assign(config, newConfig);
}

/**
 * Get current nudges configuration
 */
export function getNudgesConfig() {
    return { ...config };
}

/**
 * Integration with cronScheduler - create spoken reminder jobs
 */
export async function createSpokenReminderJob(reminderText, cronExpression, options = {}) {
    try {
        // Import cron scheduler
        const { addCronJob } = await import('../cronScheduler.js');
        
        const jobName = options.name || `Spoken Reminder: ${reminderText.substring(0, 30)}...`;
        
        const jobData = {
            type: 'spoken-reminder',
            reminderText,
            voice: options.voice || config.voice,
            provider: options.provider || 'edge'
        };
        
        const result = addCronJob(jobName, cronExpression, async (job) => {
            try {
                await speakReminder(job.data.reminderText, {
                    voice: job.data.voice,
                    provider: job.data.provider
                });
                console.log(chalk.green(`✅ Spoken reminder delivered: ${job.data.reminderText}`));
            } catch (error) {
                console.error(chalk.red(`❌ Failed to deliver spoken reminder: ${error.message}`));
            }
        }, jobData);
        
        if (result.success) {
            console.log(chalk.green(`✅ Created spoken reminder job: ${jobName}`));
            console.log(chalk.gray(`   Schedule: ${cronExpression}`));
            console.log(chalk.gray(`   Voice: ${jobData.voice}`));
        }
        
        return result;
        
    } catch (error) {
        console.error(chalk.red('❌ Failed to create spoken reminder job:'), error.message);
        throw error;
    }
}

/**
 * Quick helper to create common reminder types
 */
export async function createQuickReminder(type, interval, customText = null) {
    const reminderTypes = {
        water: {
            text: customText || 'Time to drink some water! Stay hydrated.',
            voice: 'jenny'
        },
        break: {
            text: customText || 'Time for a break! Step away from your screen.',
            voice: 'clara'
        },
        stretch: {
            text: customText || 'Time to stretch! Move your body.',
            voice: 'jenny'
        },
        eyes: {
            text: customText || 'Give your eyes a break! Look away from the screen.',
            voice: 'clara'
        },
        posture: {
            text: customText || 'Check your posture! Sit up straight.',
            voice: 'davis'
        }
    };
    
    const reminder = reminderTypes[type];
    if (!reminder) {
        throw new Error(`Unknown reminder type: ${type}`);
    }
    
    // Convert interval to cron expression
    let cronExpression;
    if (interval.includes('minutes')) {
        const minutes = parseInt(interval);
        cronExpression = `*/${minutes} * * * *`;
    } else if (interval.includes('hour')) {
        const hours = parseInt(interval) || 1;
        cronExpression = `0 */${hours} * * *`;
    } else {
        cronExpression = interval; // Assume it's already a cron expression
    }
    
    return await createSpokenReminderJob(
        reminder.text,
        cronExpression,
        {
            name: `${type.charAt(0).toUpperCase() + type.slice(1)} Reminder`,
            voice: reminder.voice
        }
    );
}

export default {
    speakReminder,
    speakDailyNudge,
    speakHabitReminder,
    speakBreakReminder,
    speakTimeNotification,
    speakFocusReminder,
    createSpokenReminderJob,
    createQuickReminder,
    configureNudges,
    getNudgesConfig
};