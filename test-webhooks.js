#!/usr/bin/env node

/**
 * Test script for StaticRebel webhook system
 * Tests both outgoing and incoming webhooks
 */

import { getWebhookManager } from './lib/integrations/webhooks.js';
import { getEventBus, EventTypes } from './lib/eventBus.js';
import chalk from 'chalk';

const log = (msg, color = 'white') => console.log(chalk[color](msg));

async function testWebhookSystem() {
  log('\n🎣 Testing StaticRebel Webhook System\n', 'blue');
  
  try {
    // Initialize webhook manager
    const webhookManager = getWebhookManager({
      incomingPort: 3002, // Use different port for testing
      logPayloads: true
    });
    
    const eventBus = getEventBus();
    
    log('✅ Webhook manager initialized', 'green');
    
    // Test 1: Add a test webhook
    log('\n📝 Test 1: Adding test webhook...', 'yellow');
    
    const testWebhook = await webhookManager.addWebhook({
      name: 'Test Webhook',
      url: 'https://httpbin.org/post', // Test endpoint that echoes requests
      event: 'entry_logged',
      template: {
        test: true,
        message: 'Test webhook from StaticRebel',
        entry_content: '{{entry.content}}',
        timestamp: '{{timestamp}}'
      }
    });
    
    log(`✅ Added webhook: ${testWebhook.id}`, 'green');
    
    // Test 2: List webhooks
    log('\n📋 Test 2: Listing webhooks...', 'yellow');
    const webhooks = webhookManager.listWebhooks();
    log(`✅ Found ${webhooks.length} webhook(s)`, 'green');
    
    // Test 3: Test webhook connectivity
    log('\n🔌 Test 3: Testing webhook connectivity...', 'yellow');
    try {
      const testResult = await webhookManager.testWebhook(testWebhook.id);
      if (testResult.success) {
        log('✅ Webhook test successful', 'green');
      } else {
        log('❌ Webhook test failed', 'red');
        console.log(testResult.error);
      }
    } catch (error) {
      log(`❌ Webhook test error: ${error.message}`, 'red');
    }
    
    // Test 4: Trigger webhook via event
    log('\n🚀 Test 4: Triggering webhook via event...', 'yellow');
    
    eventBus.emit(EventTypes.ENTRY_LOGGED, {
      data: {
        userId: 'test-user',
        entry: {
          id: 'test-entry-123',
          content: 'This is a test journal entry for webhook testing',
          mood: 'excited',
          tags: ['testing', 'webhooks']
        }
      }
    });
    
    // Wait a moment for webhook delivery
    await new Promise(resolve => setTimeout(resolve, 2000));
    log('✅ Event emitted, check logs for delivery status', 'green');
    
    // Test 5: Get webhook logs
    log('\n📊 Test 5: Checking webhook logs...', 'yellow');
    const logs = await webhookManager.getLogs({ days: 1 });
    log(`✅ Found ${logs.length} log entries`, 'green');
    
    if (logs.length > 0) {
      const latestLog = logs[0];
      log(`   Latest: ${latestLog.status} - ${latestLog.event} (${latestLog.duration}ms)`, 'cyan');
    }
    
    // Test 6: Get webhook statistics
    log('\n📈 Test 6: Getting webhook statistics...', 'yellow');
    const stats = await webhookManager.getStats();
    log('✅ Statistics retrieved:', 'green');
    log(`   Total webhooks: ${stats.totalWebhooks}`, 'cyan');
    log(`   Enabled webhooks: ${stats.enabledWebhooks}`, 'cyan');
    log(`   Today's deliveries: ${stats.today.deliveries}`, 'cyan');
    
    // Test 7: Start incoming webhook server
    log('\n🌐 Test 7: Starting incoming webhook server...', 'yellow');
    try {
      await webhookManager.startIncomingServer();
      log(`✅ Incoming webhook server started on port ${webhookManager.config.incomingPort}`, 'green');
      
      // Test incoming webhook with curl equivalent
      log('\n📥 Test 8: Testing incoming webhook...', 'yellow');
      
      const testIncomingData = {
        event: 'log_entry',
        content: 'Test entry from incoming webhook',
        tags: ['incoming', 'webhook', 'test'],
        mood: 'curious'
      };
      
      try {
        // Use fetch to test the incoming webhook
        const response = await fetch(`http://localhost:${webhookManager.config.incomingPort}/webhook`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Webhook-Event': 'log_entry'
          },
          body: JSON.stringify(testIncomingData)
        });
        
        const result = await response.json();
        
        if (response.ok) {
          log('✅ Incoming webhook test successful', 'green');
          log(`   Response: ${result.message}`, 'cyan');
        } else {
          log('❌ Incoming webhook test failed', 'red');
          console.log(result);
        }
      } catch (fetchError) {
        log(`❌ Incoming webhook test error: ${fetchError.message}`, 'red');
      }
      
    } catch (serverError) {
      log(`❌ Failed to start incoming server: ${serverError.message}`, 'red');
    }
    
    // Test 9: Remove test webhook
    log('\n🗑️ Test 9: Cleaning up test webhook...', 'yellow');
    await webhookManager.removeWebhook(testWebhook.id);
    log('✅ Test webhook removed', 'green');
    
    // Shutdown server
    await webhookManager.shutdown();
    log('✅ Webhook server shut down', 'green');
    
    log('\n🎉 All webhook tests completed!', 'green');
    log('\nTo get started with webhooks:', 'white');
    log('  sr webhook help', 'cyan');
    log('  sr webhook add --name "My Webhook" --url "https://..." --event "entry_logged"', 'cyan');
    log('  sr webhook start', 'cyan');
    
  } catch (error) {
    log(`\n❌ Test failed: ${error.message}`, 'red');
    console.error(error);
    process.exit(1);
  }
}

// Run tests if script is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  testWebhookSystem().then(() => {
    log('\n✅ Test script completed successfully!', 'green');
    process.exit(0);
  }).catch((error) => {
    log(`\n❌ Test script failed: ${error.message}`, 'red');
    process.exit(1);
  });
}

export { testWebhookSystem };