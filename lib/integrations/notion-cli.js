import chalk from 'chalk';
import NotionIntegration from './notion.js';
import { TrackerStore } from '../../tracker.js';

/**
 * Notion CLI Commands Handler
 * Provides command-line interface for Notion integration
 */

const notion = new NotionIntegration();
const trackers = new TrackerStore();

export async function notionCommand(args) {
  if (!args || args.length === 0) {
    return showHelp();
  }

  const command = args[0].toLowerCase();

  try {
    await notion.initialize();

    switch (command) {
      case 'setup':
        return await handleSetupCommand(args.slice(1));
      case 'status':
        return await handleStatusCommand();
      case 'sync':
        return await handleSyncCommand(args.slice(1));
      case 'map':
        return await handleMapCommand(args.slice(1));
      case 'databases':
        return await handleDatabasesCommand(args.slice(1));
      case 'daily':
        return await handleDailyCommand(args.slice(1));
      case 'rollup':
        return await handleRollupCommand(args.slice(1));
      case 'reset':
        return await handleResetCommand();
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

/**
 * Handle setup command
 */
async function handleSetupCommand(args) {
  if (args.length === 0) {
    return showSetupHelp();
  }

  const subcommand = args[0].toLowerCase();

  switch (subcommand) {
    case 'api-key':
      return await setupWithApiKey(args.slice(1));
    case 'oauth':
      return await setupWithOAuth();
    case 'verify':
      return await verifySetup();
    default:
      return chalk.red(`Unknown setup command: ${subcommand}\n`) + showSetupHelp();
  }
}

/**
 * Setup with API key
 */
async function setupWithApiKey(args) {
  const apiKey = args[0];
  
  if (!apiKey) {
    return chalk.red('API key is required.\n') +
           chalk.yellow('Usage: sr notion setup api-key <your-api-key>\n\n') +
           chalk.gray('Get your API key from: https://www.notion.so/my-integrations');
  }

  try {
    const result = await notion.setupWithApiKey(apiKey);
    
    return chalk.green('✅ Notion API key configured successfully!\n\n') +
           chalk.white('Next steps:\n') +
           chalk.cyan('1. sr notion databases') + chalk.gray(' - List available databases\n') +
           chalk.cyan('2. sr notion map <trackerId> <databaseId>') + chalk.gray(' - Map tracker to database\n') +
           chalk.cyan('3. sr notion sync <trackerId>') + chalk.gray(' - Sync data to Notion\n\n') +
           chalk.bold('💡 Tip: ') + chalk.gray('Make sure your Notion integration has access to the databases you want to sync with.');
  } catch (error) {
    return chalk.red(`Setup failed: ${error.message}\n\n`) +
           chalk.yellow('Common issues:\n') +
           chalk.white('• Invalid API key format\n') +
           chalk.white('• Integration not shared with databases\n') +
           chalk.white('• Network connectivity issues\n\n') +
           chalk.gray('For help: https://developers.notion.com/docs/getting-started');
  }
}

/**
 * Setup with OAuth (placeholder)
 */
async function setupWithOAuth() {
  return chalk.yellow('OAuth authentication is not yet implemented.\n') +
         chalk.white('Please use API key authentication:\n') +
         chalk.cyan('sr notion setup api-key <your-api-key>\n\n') +
         chalk.gray('OAuth support is planned for a future release.');
}

/**
 * Verify setup
 */
async function verifySetup() {
  if (!notion.isConfigured()) {
    return chalk.red('❌ Notion is not configured.\n') +
           chalk.yellow('Run: ') + chalk.cyan('sr notion setup api-key <your-key>');
  }

  try {
    const isValid = await notion.validateConnection();
    
    if (isValid) {
      return chalk.green('✅ Notion connection verified successfully!\n') +
             chalk.gray('Your integration is working correctly.');
    } else {
      return chalk.red('❌ Notion connection failed.\n') +
             chalk.yellow('Please check your API key and try again.');
    }
  } catch (error) {
    return chalk.red(`❌ Connection error: ${error.message}`);
  }
}

/**
 * Handle status command
 */
async function handleStatusCommand() {
  const status = notion.getSyncStatus();
  
  let output = chalk.bold('📊 Notion Integration Status\n\n');
  
  // Configuration status
  output += chalk.cyan('Configuration: ') + 
    (status.configured ? chalk.green('✅ Configured') : chalk.red('❌ Not configured')) + '\n';
  
  // Last sync
  output += chalk.cyan('Last Sync: ') + 
    (status.lastSync ? 
     chalk.white(new Date(status.lastSync).toLocaleString()) : 
     chalk.gray('Never')) + '\n';
  
  // Mapped trackers
  output += chalk.cyan('Mapped Trackers: ') + 
    chalk.white(status.mappedTrackers.length) + '\n';
  
  if (status.mappedTrackers.length > 0) {
    output += chalk.gray('  • ') + status.mappedTrackers.join(chalk.gray('\n  • ')) + '\n';
  }
  
  // Recent sync history
  if (status.syncHistory.length > 0) {
    output += chalk.cyan('\nRecent Syncs:\n');
    status.syncHistory.slice(-5).forEach(sync => {
      const time = new Date(sync.timestamp).toLocaleString();
      const status = sync.errors > 0 ? 
        chalk.yellow(`⚠️  ${sync.syncedCount} synced, ${sync.errors} errors`) :
        chalk.green(`✅ ${sync.syncedCount} synced`);
      output += chalk.gray(`  ${time} - ${sync.trackerId}: `) + status + '\n';
    });
  }
  
  return output;
}

/**
 * Handle sync command
 */
async function handleSyncCommand(args) {
  if (args.length === 0) {
    return showSyncHelp();
  }

  const trackerId = args[0];
  const options = {
    incremental: args.includes('--incremental') || args.includes('-i'),
    force: args.includes('--force') || args.includes('-f')
  };

  try {
    const result = await notion.syncTrackerToNotion(trackerId, options);
    
    let output = result.success ? 
      chalk.green(`✅ ${result.message}\n`) : 
      chalk.red(`❌ Sync failed: ${result.message}\n`);
    
    if (result.synced !== undefined) {
      output += chalk.white(`Records synced: ${result.synced}\n`);
    }
    
    if (result.errors && result.errors.length > 0) {
      output += chalk.yellow(`\n⚠️  Errors encountered:\n`);
      result.errors.slice(0, 5).forEach(error => {
        output += chalk.gray(`  • ${error}\n`);
      });
      
      if (result.errors.length > 5) {
        output += chalk.gray(`  ... and ${result.errors.length - 5} more\n`);
      }
    }
    
    return output;
  } catch (error) {
    return chalk.red(`Sync failed: ${error.message}\n\n`) +
           chalk.yellow('Common issues:\n') +
           chalk.white('• Tracker not mapped to a database\n') +
           chalk.white('• Invalid database ID or permissions\n') +
           chalk.white('• Property mapping errors\n\n') +
           chalk.cyan('Try: ') + chalk.gray('sr notion status') + chalk.white(' to check configuration');
  }
}

/**
 * Handle map command
 */
async function handleMapCommand(args) {
  if (args.length < 2) {
    return chalk.red('Tracker ID and database ID are required.\n') +
           chalk.yellow('Usage: sr notion map <trackerId> <databaseId> [property mappings]\n\n') +
           chalk.white('Examples:\n') +
           chalk.cyan('  sr notion map water-tracker abc123 title=Entry date=Date value=Amount\n') +
           chalk.cyan('  sr notion map workout-tracker def456 title=Workout date=Date\n\n') +
           chalk.gray('Use "sr notion databases" to list available databases');
  }

  const trackerId = args[0];
  const databaseId = args[1];
  
  // Parse property mappings from remaining args
  const propertyMapping = {};
  args.slice(2).forEach(arg => {
    if (arg.includes('=')) {
      const [key, value] = arg.split('=', 2);
      propertyMapping[key] = value;
    }
  });

  try {
    const result = await notion.mapTrackerToDatabase(trackerId, databaseId, propertyMapping);
    
    return chalk.green('✅ Tracker mapped successfully!\n\n') +
           chalk.white(result.message) + '\n\n' +
           chalk.cyan('Next step: ') + chalk.gray(`sr notion sync ${trackerId}`) + 
           chalk.white(' to sync data');
  } catch (error) {
    return chalk.red(`Mapping failed: ${error.message}\n\n`) +
           chalk.yellow('Tips:\n') +
           chalk.white('• Check that the tracker ID exists\n') +
           chalk.white('• Verify database ID is correct\n') +
           chalk.white('• Ensure property names match exactly\n\n') +
           chalk.cyan('Commands to help:\n') +
           chalk.gray('  sr list                    # List trackers\n') +
           chalk.gray('  sr notion databases        # List databases');
  }
}

/**
 * Handle databases command
 */
async function handleDatabasesCommand(args) {
  const query = args.join(' ');
  
  try {
    const databases = await notion.searchDatabases(query);
    
    if (databases.length === 0) {
      return chalk.yellow('No databases found.\n\n') +
             chalk.white('Make sure:\n') +
             chalk.white('• Your Notion integration has access to databases\n') +
             chalk.white('• Databases exist in your workspace\n\n') +
             chalk.cyan('Share databases: ') + 
             chalk.gray('https://www.notion.so/help/add-and-manage-connections-with-the-api');
    }
    
    let output = chalk.bold(`📄 Available Databases${query ? ` (matching "${query}")` : ''}:\n\n`);
    
    databases.forEach(db => {
      output += chalk.cyan(`▶ ${db.title}\n`);
      output += chalk.white(`  ID: ${chalk.bold(db.id)}\n`);
      output += chalk.white(`  Properties: ${db.properties.join(', ')}\n`);
      output += chalk.gray(`  Last edited: ${new Date(db.lastEditedTime).toLocaleDateString()}\n`);
      output += chalk.gray(`  URL: ${db.url}\n\n`);
    });
    
    return output + chalk.white('💡 Copy the database ID to map with your trackers');
  } catch (error) {
    return chalk.red(`Failed to list databases: ${error.message}\n\n`) +
           chalk.yellow('Common issues:\n') +
           chalk.white('• Integration not configured\n') +
           chalk.white('• No database permissions\n') +
           chalk.white('• Network connectivity\n\n') +
           chalk.cyan('Try: ') + chalk.gray('sr notion status') + chalk.white(' to check configuration');
  }
}

/**
 * Handle daily summary command
 */
async function handleDailyCommand(args) {
  const date = args[0] ? new Date(args[0]) : new Date();
  const databaseIdIndex = args.indexOf('--database');
  const databaseId = databaseIdIndex >= 0 ? args[databaseIdIndex + 1] : null;
  
  if (!databaseId) {
    return chalk.red('Database ID is required for daily summaries.\n') +
           chalk.yellow('Usage: sr notion daily [date] --database <databaseId>\n\n') +
           chalk.white('Examples:\n') +
           chalk.cyan('  sr notion daily --database abc123\n') +
           chalk.cyan('  sr notion daily 2024-01-15 --database abc123\n');
  }
  
  try {
    const result = await notion.createDailySummary(date, { databaseId });
    
    return chalk.green('✅ Daily summary created!\n') +
           chalk.white(`Date: ${date.toLocaleDateString()}\n`) +
           chalk.white(`Page ID: ${result.id}\n`) +
           chalk.gray(`URL: ${result.url}`);
  } catch (error) {
    return chalk.red(`Failed to create daily summary: ${error.message}`);
  }
}

/**
 * Handle rollup command
 */
async function handleRollupCommand(args) {
  if (args.length < 2) {
    return chalk.red('Period and database ID are required.\n') +
           chalk.yellow('Usage: sr notion rollup <weekly|monthly> --database <databaseId> [date]\n\n') +
           chalk.white('Examples:\n') +
           chalk.cyan('  sr notion rollup weekly --database abc123\n') +
           chalk.cyan('  sr notion rollup monthly --database abc123 2024-01-15\n');
  }
  
  const period = args[0].toLowerCase();
  const databaseIdIndex = args.indexOf('--database');
  const databaseId = databaseIdIndex >= 0 ? args[databaseIdIndex + 1] : null;
  const dateStr = args.find(arg => arg.match(/^\d{4}-\d{2}-\d{2}$/));
  const date = dateStr ? new Date(dateStr) : new Date();
  
  if (!['weekly', 'monthly'].includes(period)) {
    return chalk.red('Period must be "weekly" or "monthly"');
  }
  
  if (!databaseId) {
    return chalk.red('Database ID is required (use --database <id>)');
  }
  
  try {
    const result = await notion.createRollupPage(period, date, { databaseId });
    
    return chalk.green(`✅ ${period} rollup created!\n`) +
           chalk.white(`Period: ${period}\n`) +
           chalk.white(`Date: ${date.toLocaleDateString()}\n`) +
           chalk.white(`Page ID: ${result.id}\n`) +
           chalk.gray(`URL: ${result.url}`);
  } catch (error) {
    return chalk.red(`Failed to create ${period} rollup: ${error.message}`);
  }
}

/**
 * Handle reset command
 */
async function handleResetCommand() {
  try {
    const result = await notion.reset();
    
    return chalk.green('✅ Notion configuration reset successfully!\n') +
           chalk.yellow('You will need to run setup again to use Notion integration.\n') +
           chalk.cyan('Run: ') + chalk.gray('sr notion setup api-key <your-key>');
  } catch (error) {
    return chalk.red(`Reset failed: ${error.message}`);
  }
}

/**
 * Show main help
 */
function showHelp() {
  return chalk.bold('🔗 Notion Integration Commands:\n\n') +
    chalk.cyan('Setup:\n') +
    chalk.white('  sr notion setup api-key <key>') + chalk.gray('     - Setup with API key auth\n') +
    chalk.white('  sr notion setup verify') + chalk.gray('            - Verify connection\n') +
    chalk.white('  sr notion status') + chalk.gray('                 - Show integration status\n\n') +
    
    chalk.cyan('Database Management:\n') +
    chalk.white('  sr notion databases [query]') + chalk.gray('       - List/search databases\n') +
    chalk.white('  sr notion map <tracker> <db>') + chalk.gray('      - Map tracker to database\n\n') +
    
    chalk.cyan('Data Sync:\n') +
    chalk.white('  sr notion sync <tracker>') + chalk.gray('          - Sync tracker data\n') +
    chalk.white('  sr notion sync <tracker> --incremental') + chalk.gray(' - Sync only new data\n\n') +
    
    chalk.cyan('Summaries:\n') +
    chalk.white('  sr notion daily --database <id>') + chalk.gray('   - Create daily summary\n') +
    chalk.white('  sr notion rollup weekly --database <id>') + chalk.gray(' - Weekly rollup\n') +
    chalk.white('  sr notion rollup monthly --database <id>') + chalk.gray(' - Monthly rollup\n\n') +
    
    chalk.cyan('Utility:\n') +
    chalk.white('  sr notion reset') + chalk.gray('                 - Reset configuration\n') +
    chalk.white('  sr notion help') + chalk.gray('                  - Show this help\n\n') +
    
    chalk.bold('Examples:\n') +
    chalk.gray('  sr notion setup api-key secret_abc123\n') +
    chalk.gray('  sr notion databases\n') +
    chalk.gray('  sr notion map water-tracker 123abc title=Entry value=Amount\n') +
    chalk.gray('  sr notion sync water-tracker\n') +
    chalk.gray('  sr notion daily --database 456def\n\n') +
    
    chalk.yellow('📖 Documentation: ') + chalk.underline('https://github.com/your-repo/docs/notion-integration');
}

/**
 * Show setup help
 */
function showSetupHelp() {
  return chalk.bold('🔧 Notion Setup Commands:\n\n') +
    chalk.cyan('sr notion setup api-key <key>') + chalk.gray(' - Setup with API key authentication\n') +
    chalk.cyan('sr notion setup oauth') + chalk.gray('         - Setup with OAuth (coming soon)\n') +
    chalk.cyan('sr notion setup verify') + chalk.gray('       - Verify current configuration\n\n') +
    
    chalk.bold('Getting Started:\n') +
    chalk.white('1. Create a Notion integration at: ') + chalk.underline('https://www.notion.so/my-integrations') + '\n' +
    chalk.white('2. Copy your internal integration token\n') +
    chalk.white('3. Share databases with your integration\n') +
    chalk.white('4. Run: ') + chalk.cyan('sr notion setup api-key <your-token>') + '\n\n' +
    
    chalk.yellow('🔒 Security: ') + chalk.gray('Your API key is stored locally and encrypted.');
}

/**
 * Show sync help
 */
function showSyncHelp() {
  return chalk.bold('🔄 Notion Sync Commands:\n\n') +
    chalk.cyan('sr notion sync <trackerId>') + chalk.gray('              - Sync all tracker data\n') +
    chalk.cyan('sr notion sync <trackerId> --incremental') + chalk.gray(' - Sync only new data since last sync\n') +
    chalk.cyan('sr notion sync <trackerId> --force') + chalk.gray('       - Force sync even if no changes\n\n') +
    
    chalk.bold('Examples:\n') +
    chalk.white('  sr notion sync water-tracker') + chalk.gray('            # Sync all water tracking data\n') +
    chalk.white('  sr notion sync workout --incremental') + chalk.gray('  # Sync only new workouts\n\n') +
    
    chalk.yellow('💡 Tip: ') + chalk.gray('Use --incremental for daily syncs to avoid duplicates');
}