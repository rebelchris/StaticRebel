#!/usr/bin/env node

/**
 * Test Gmail Integration for StaticRebel
 * Quick test to verify the Gmail integration works
 */

import { gmailCommand } from './lib/integrations/gmail-cli.js';
import { getGmailService } from './lib/integrations/gmail.js';
import chalk from 'chalk';

async function testGmailIntegration() {
  console.log(chalk.blue('\n📧 Testing Gmail Integration\n'));

  try {
    // Test 1: Check if service can be loaded
    console.log('✓ Testing Gmail service loading...');
    const gmailService = await getGmailService();
    console.log(chalk.green('✓ Gmail service loaded successfully'));

    // Test 2: Check configuration status
    console.log('\n✓ Testing configuration status...');
    const isConfigured = gmailService.isConfigured();
    if (isConfigured) {
      console.log(chalk.green('✓ Gmail is configured'));
    } else {
      console.log(chalk.yellow('⚠ Gmail not configured (expected for first run)'));
    }

    // Test 3: Test CLI help command
    console.log('\n✓ Testing CLI help command...');
    const helpResult = await gmailCommand(['help']);
    console.log(chalk.green('✓ CLI help command works'));

    // Test 4: Test CLI status command
    console.log('\n✓ Testing CLI status command...');
    const statusResult = await gmailCommand(['status']);
    console.log(chalk.green('✓ CLI status command works'));
    console.log(chalk.dim(`Status: ${statusResult.substring(0, 100)}...`));

    console.log(chalk.green('\n✅ Gmail integration test completed successfully!'));
    console.log(chalk.blue('\nNext steps:'));
    console.log('1. Run `sr gmail setup` to configure Gmail API');
    console.log('2. Test with `sr gmail status` to verify configuration');
    console.log('3. Try natural language: "Check my email"');

  } catch (error) {
    console.error(chalk.red('\n❌ Gmail integration test failed:'), error.message);
    console.error(chalk.dim('\nStack trace:'), error.stack);
    process.exit(1);
  }
}

// Run the test
testGmailIntegration();