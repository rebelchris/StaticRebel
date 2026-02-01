import chalk from 'chalk';
import SocialManager, { createWaterChallenge, shareWaterStreak, exportChallenge, importChallenge } from './index.js';
import { TrackerStore } from '../../tracker.js';

/**
 * Social CLI Commands Handler
 * Provides command-line interface for social tracking features
 */

const social = new SocialManager();
const trackers = new TrackerStore();

export async function socialCommand(args) {
  if (!args || args.length === 0) {
    return showHelp();
  }

  const command = args[0].toLowerCase();

  try {
    switch (command) {
      case 'challenge':
        return await handleChallengeCommand(args.slice(1));
      case 'share':
        return await handleShareCommand(args.slice(1));
      case 'settings':
        return await handleSettingsCommand(args.slice(1));
      case 'export':
        return await handleExportCommand(args.slice(1));
      case 'import':
        return await handleImportCommand(args.slice(1));
      case 'status':
        return await handleStatusCommand();
      case 'help':
      case '--help':
      case '-h':
        return showHelp();
      default:
        return chalk.red(`Unknown command: ${command}\n`) + showHelp();
    }
  } catch (error) {
    return chalk.red(`Error: ${error.message}`);
  }
}

async function handleChallengeCommand(args) {
  if (!args || args.length === 0) {
    return showChallengeHelp();
  }

  const subcommand = args[0].toLowerCase();

  switch (subcommand) {
    case 'create':
      return await createChallenge(args.slice(1));
    case 'join':
      return await joinChallenge(args.slice(1));
    case 'list':
      return await listChallenges();
    case 'progress':
      return await updateProgress(args.slice(1));
    case 'leaderboard':
      return await showLeaderboard(args.slice(1));
    case 'end':
      return await endChallenge(args.slice(1));
    case 'water':
      return await createWaterChallengeQuick(args.slice(1));
    default:
      return chalk.red(`Unknown challenge command: ${subcommand}\n`) + showChallengeHelp();
  }
}

async function createChallenge(args) {
  const name = args[0] || 'Unnamed Challenge';
  const trackerId = args[1] || 'water';
  const duration = parseInt(args[2]) || 7;
  const type = args[3] || 'streak';

  const challenge = await social.createChallenge({
    name,
    trackerId,
    duration,
    type,
    createdBy: 'local-user'
  });

  return chalk.green('✅ Challenge created!\n') +
    chalk.white(`Name: ${challenge.name}\n`) +
    chalk.white(`Type: ${challenge.type}\n`) +
    chalk.white(`Duration: ${challenge.duration} days\n`) +
    chalk.white(`Share Code: ${chalk.cyan(challenge.shareCode)}\n`) +
    chalk.white(`ID: ${challenge.id}`);
}

async function createWaterChallengeQuick(args) {
  const participantName = args[0] || 'You';
  const duration = parseInt(args[1]) || 7;
  const target = args[2] ? parseInt(args[2]) : null;

  const challenge = await createWaterChallenge(participantName, duration, target);

  return chalk.blue('💧 Water Challenge Created!\n') +
    chalk.white(`Duration: ${duration} days\n`) +
    (target ? chalk.white(`Target: ${target} ml/day\n`) : '') +
    chalk.white(`Share Code: ${chalk.cyan(challenge.shareCode)}\n`) +
    chalk.gray('Share this code with friends to join the challenge!');
}

async function joinChallenge(args) {
  const shareCode = args[0];
  const participantName = args[1] || 'Anonymous';
  const anonymous = args.includes('--anonymous');

  if (!shareCode) {
    return chalk.red('Share code is required. Usage: social challenge join <shareCode> [name] [--anonymous]');
  }

  const challenge = await social.joinChallenge(shareCode, participantName, anonymous);

  return chalk.green('🎉 Successfully joined challenge!\n') +
    chalk.white(`Challenge: ${challenge.name}\n`) +
    chalk.white(`Participants: ${challenge.participants.length}\n`) +
    chalk.gray('Use "social challenge progress" to update your progress.');
}

async function listChallenges() {
  const challenges = await social.getActiveChallenges();

  if (challenges.length === 0) {
    return chalk.yellow('No active challenges. Create one with "social challenge create"');
  }

  let output = chalk.bold('🏆 Active Challenges:\n\n');
  
  for (const challenge of challenges) {
    const endDate = new Date(challenge.endDate);
    const daysLeft = Math.ceil((endDate - new Date()) / (1000 * 60 * 60 * 24));
    
    output += chalk.cyan(`▶ ${challenge.name}\n`);
    output += chalk.white(`  Type: ${challenge.type} | Duration: ${challenge.duration} days\n`);
    output += chalk.white(`  Participants: ${challenge.participants.length} | Days left: ${daysLeft}\n`);
    output += chalk.white(`  Share Code: ${chalk.bold(challenge.shareCode)}\n`);
    output += chalk.gray(`  ID: ${challenge.id}\n\n`);
  }

  return output;
}

async function updateProgress(args) {
  const challengeId = args[0];
  const value = parseFloat(args[1]) || 1;
  const note = args.slice(2).join(' ');

  if (!challengeId) {
    return chalk.red('Challenge ID is required. Usage: social challenge progress <challengeId> [value] [note]');
  }

  // Find participant ID (assuming first participant for local user)
  const challenge = await social.getChallenge(challengeId);
  if (!challenge) {
    return chalk.red('Challenge not found');
  }

  const participant = challenge.participants[0]; // Assume first is local user
  if (!participant) {
    return chalk.red('You are not a participant in this challenge');
  }

  await social.updateChallengeProgress(challengeId, participant.id, { value, note });

  return chalk.green('✅ Progress updated!\n') +
    chalk.white(`Value: ${value}\n`) +
    (note ? chalk.white(`Note: ${note}\n`) : '') +
    chalk.gray('Check leaderboard with "social challenge leaderboard"');
}

async function showLeaderboard(args) {
  const challengeId = args[0];

  if (!challengeId) {
    return chalk.red('Challenge ID is required. Usage: social challenge leaderboard <challengeId>');
  }

  const challenge = await social.getChallenge(challengeId);
  if (!challenge) {
    return chalk.red('Challenge not found');
  }

  if (challenge.leaderboard.length === 0) {
    return chalk.yellow('No participants have recorded progress yet.');
  }

  let output = chalk.bold(`🏆 ${challenge.name} Leaderboard:\n\n`);
  
  challenge.leaderboard.forEach((participant, index) => {
    const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : '  ';
    const name = participant.anonymous ? chalk.gray(participant.name) : chalk.white(participant.name);
    output += `${medal} ${name} - ${chalk.cyan(participant.score)} (${participant.entries} entries)\n`;
  });

  return output;
}

async function endChallenge(args) {
  const challengeId = args[0];

  if (!challengeId) {
    return chalk.red('Challenge ID is required. Usage: social challenge end <challengeId>');
  }

  const result = await social.endChallenge(challengeId);

  return chalk.green('🏁 Challenge completed!\n') +
    chalk.white(`Final Results for ${result.name}:\n\n`) +
    result.leaderboard.map((p, i) => 
      `${i + 1}. ${p.name} - ${p.score} points`
    ).join('\n');
}

async function handleShareCommand(args) {
  const type = args[0]; // 'streak', 'achievement', 'goal'
  const trackerId = args[1];
  const anonymous = args.includes('--anonymous');
  const format = args.includes('--ascii') ? 'ascii' : args.includes('--svg') ? 'svg' : 'ascii';

  if (!type || !trackerId) {
    return chalk.red('Usage: social share <type> <trackerId> [--anonymous] [--ascii|--svg]\n') +
      chalk.gray('Types: streak, achievement, goal');
  }

  // Get tracker data
  const trackerData = await trackers.getRecords(trackerId);
  if (!trackerData || trackerData.records.length === 0) {
    return chalk.red('No data found for this tracker');
  }

  // Calculate streak for water tracking
  let shareData;
  if (type === 'streak' && trackerId === 'water') {
    const records = trackerData.records;
    const streakDays = calculateWaterStreak(records);
    shareData = {
      type: 'streak',
      trackerId,
      streak: streakDays,
      recentActivity: getRecentActivity(records),
      total: records.length
    };
  } else {
    shareData = {
      type,
      trackerId,
      data: trackerData.records
    };
  }

  const shareLink = await shareWaterStreak(shareData, anonymous);
  const graphic = await social.exportGraphic(shareData, format);

  return chalk.green('📤 Share created!\n') +
    chalk.white(`URL: ${shareLink.url}\n`) +
    chalk.white(`QR Code: ${shareLink.qrCode}\n`) +
    chalk.white(`Expires: ${new Date(shareLink.expiresAt).toLocaleDateString()}\n\n`) +
    chalk.bold('Visual:\n') +
    chalk.gray(graphic);
}

async function handleSettingsCommand(args) {
  if (args.length === 0) {
    const settings = await social.getSettings();
    let output = chalk.bold('🔒 Privacy Settings:\n\n');
    
    Object.entries(settings).forEach(([key, value]) => {
      const icon = value ? '✅' : '❌';
      output += `${icon} ${key}: ${chalk.cyan(value)}\n`;
    });
    
    return output + chalk.gray('\nUse "social settings <key> <value>" to update');
  }

  const key = args[0];
  const value = args[1] === 'true' || args[1] === 'yes' || args[1] === '1';

  const updatedSettings = await social.updateSettings({ [key]: value });

  return chalk.green(`✅ Updated ${key} to ${value}\n`) +
    chalk.gray('Current settings:\n') +
    Object.entries(updatedSettings).map(([k, v]) => `  ${k}: ${v}`).join('\n');
}

async function handleExportCommand(args) {
  const challengeId = args[0];
  const includePersonal = args.includes('--personal');

  if (!challengeId) {
    return chalk.red('Challenge ID is required. Usage: social export <challengeId> [--personal]');
  }

  const exportData = await exportChallenge(challengeId, includePersonal);
  const fileName = `challenge-${challengeId}-${Date.now()}.json`;
  const filePath = `./exports/${fileName}`;

  // Create exports directory if it doesn't exist
  try {
    await import('fs/promises').then(fs => fs.mkdir('./exports', { recursive: true }));
    await import('fs/promises').then(fs => fs.writeFile(filePath, JSON.stringify(exportData, null, 2)));
  } catch (error) {
    return chalk.red(`Failed to export: ${error.message}`);
  }

  return chalk.green('📦 Challenge exported!\n') +
    chalk.white(`File: ${filePath}\n`) +
    chalk.gray('Share this file to import the challenge elsewhere');
}

async function handleImportCommand(args) {
  const filePath = args[0];

  if (!filePath) {
    return chalk.red('File path is required. Usage: social import <filePath>');
  }

  try {
    const fileContent = await import('fs/promises').then(fs => fs.readFile(filePath, 'utf-8'));
    const challengeData = JSON.parse(fileContent);
    const imported = await importChallenge(challengeData);

    return chalk.green('📥 Challenge imported!\n') +
      chalk.white(`Name: ${imported.name}\n`) +
      chalk.white(`ID: ${imported.id}\n`) +
      chalk.white(`Share Code: ${chalk.cyan(imported.shareCode)}`);
  } catch (error) {
    return chalk.red(`Failed to import: ${error.message}`);
  }
}

async function handleStatusCommand() {
  const challenges = await social.getActiveChallenges();
  const settings = await social.getSettings();

  let output = chalk.bold('📊 Social Status:\n\n');
  
  output += chalk.cyan('Active Challenges: ') + chalk.white(challenges.length) + '\n';
  output += chalk.cyan('Sharing Enabled: ') + 
    (settings.shareStreaks || settings.shareGoals || settings.shareAchievements ? 
     chalk.green('Yes') : chalk.red('No')) + '\n';
  output += chalk.cyan('Anonymous Mode: ') + 
    (settings.allowAnonymous ? chalk.green('Available') : chalk.red('Disabled')) + '\n';

  if (challenges.length > 0) {
    output += chalk.gray('\nRecent challenges:\n');
    challenges.slice(0, 3).forEach(challenge => {
      output += chalk.gray(`  • ${challenge.name} (${challenge.participants.length} participants)\n`);
    });
  }

  return output;
}

// Helper functions

function calculateWaterStreak(records) {
  if (records.length === 0) return 0;

  let streak = 0;
  let currentDate = new Date();
  currentDate.setHours(0, 0, 0, 0);

  const sortedRecords = records.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  
  for (const record of sortedRecords) {
    const recordDate = new Date(record.timestamp);
    recordDate.setHours(0, 0, 0, 0);
    
    if (recordDate.getTime() === currentDate.getTime()) {
      streak++;
      currentDate.setDate(currentDate.getDate() - 1);
    } else {
      break;
    }
  }
  
  return streak;
}

function getRecentActivity(records) {
  const activity = {};
  const last7Days = Array.from({ length: 7 }, (_, i) => {
    const date = new Date();
    date.setDate(date.getDate() - i);
    return date.toDateString();
  });

  last7Days.forEach(dateStr => {
    const hasRecord = records.some(record => 
      new Date(record.timestamp).toDateString() === dateStr
    );
    activity[dateStr] = hasRecord;
  });

  return activity;
}

function showHelp() {
  return chalk.bold('🤝 Social Tracking Commands:\n\n') +
    chalk.cyan('social challenge create <name> <trackerId> [duration] [type]') + 
    chalk.gray(' - Create a new challenge\n') +
    chalk.cyan('social challenge water [name] [duration] [target]') + 
    chalk.gray(' - Quick water challenge\n') +
    chalk.cyan('social challenge join <shareCode> [name] [--anonymous]') + 
    chalk.gray(' - Join a challenge\n') +
    chalk.cyan('social challenge list') + 
    chalk.gray(' - List active challenges\n') +
    chalk.cyan('social challenge progress <challengeId> [value] [note]') + 
    chalk.gray(' - Update progress\n') +
    chalk.cyan('social challenge leaderboard <challengeId>') + 
    chalk.gray(' - Show leaderboard\n') +
    chalk.cyan('social challenge end <challengeId>') + 
    chalk.gray(' - End a challenge\n\n') +
    
    chalk.cyan('social share <type> <trackerId> [--anonymous] [--ascii|--svg]') + 
    chalk.gray(' - Share achievement\n') +
    chalk.cyan('social settings [key] [value]') + 
    chalk.gray(' - View/update privacy settings\n') +
    chalk.cyan('social export <challengeId> [--personal]') + 
    chalk.gray(' - Export challenge data\n') +
    chalk.cyan('social import <filePath>') + 
    chalk.gray(' - Import challenge data\n') +
    chalk.cyan('social status') + 
    chalk.gray(' - Show social status\n') +
    chalk.cyan('social help') + 
    chalk.gray(' - Show this help\n\n') +
    
    chalk.bold('Examples:\n') +
    chalk.white('  social challenge water "Daily Hydration" 7') + 
    chalk.gray(' # 7-day water challenge\n') +
    chalk.white('  social challenge join SwiftTiger123') + 
    chalk.gray(' # Join using share code\n') +
    chalk.white('  social share streak water --ascii') + 
    chalk.gray(' # Share water streak\n') +
    chalk.white('  social settings shareStreaks true') + 
    chalk.gray(' # Enable streak sharing\n');
}

function showChallengeHelp() {
  return chalk.bold('🏆 Challenge Commands:\n\n') +
    chalk.cyan('create <name> <trackerId> [duration] [type]') + 
    chalk.gray(' - Create new challenge\n') +
    chalk.cyan('water [name] [duration] [target]') + 
    chalk.gray(' - Quick water challenge\n') +
    chalk.cyan('join <shareCode> [name] [--anonymous]') + 
    chalk.gray(' - Join challenge\n') +
    chalk.cyan('list') + 
    chalk.gray(' - List active challenges\n') +
    chalk.cyan('progress <challengeId> [value] [note]') + 
    chalk.gray(' - Update progress\n') +
    chalk.cyan('leaderboard <challengeId>') + 
    chalk.gray(' - Show leaderboard\n') +
    chalk.cyan('end <challengeId>') + 
    chalk.gray(' - End challenge\n');
}