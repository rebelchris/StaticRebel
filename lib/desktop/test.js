/**
 * Desktop Integration Test
 * 
 * Simple test to verify desktop notifications work
 */

import { DesktopIntegration } from './index.js';

async function testDesktopIntegration() {
  console.log('🧪 Testing Desktop Integration...\n');

  try {
    // Test basic initialization
    console.log('1. Testing basic initialization...');
    const desktop = new DesktopIntegration({
      notifications: { enabled: true, sound: false },
      tray: { enabled: false }, // Disable tray for simple test
      nudges: { enabled: false }
    });

    await desktop.init();
    console.log('✓ Desktop integration initialized');

    // Test notification system
    console.log('\n2. Testing notification system...');
    
    await desktop.showNotification({
      title: 'StaticRebel Test',
      message: 'Desktop notifications are working! 🎉',
      timeout: 3000
    });
    console.log('✓ Test notification sent');

    // Wait a moment for notification to display
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Test custom notification
    console.log('\n3. Testing custom notification...');
    await desktop.notify(
      'Custom Test',
      'This is a custom notification with different settings',
      { urgency: 'low', timeout: 2000 }
    );
    console.log('✓ Custom notification sent');

    // Test status reporting
    console.log('\n4. Testing status reporting...');
    const status = desktop.getStatus();
    console.log('✓ Status:', JSON.stringify(status, null, 2));

    // Test mock nudge
    console.log('\n5. Testing mock nudge notification...');
    const mockNudge = {
      type: 'test',
      priority: 'medium',
      skillId: 'water',
      message: '💧 Test nudge: Don\'t forget to stay hydrated!'
    };

    await desktop.showNudge(mockNudge);
    console.log('✓ Mock nudge notification sent');

    // Shutdown
    await desktop.shutdown();
    console.log('\n✅ All tests completed successfully!');

  } catch (error) {
    console.error('❌ Test failed:', error);
    
    if (error.message.includes('node-notifier')) {
      console.log('\n💡 Tip: Make sure node-notifier is installed:');
      console.log('   npm install node-notifier');
    }
  }
}

// Test platform detection
async function testPlatformDetection() {
  console.log('\n🔍 Platform Detection:');
  
  const os = await import('os');
  const platform = os.platform();
  
  console.log(`Platform: ${platform}`);
  console.log(`Notifications supported: ${true}`); // node-notifier works everywhere
  
  const traySupport = platform === 'win32' || platform === 'darwin' || platform === 'linux';
  console.log(`System tray supported: ${traySupport}`);
  
  if (!traySupport) {
    console.log('ℹ️  System tray will use fallback mode on this platform');
  }
}

// Run tests if called directly
async function runAllTests() {
  console.log('StaticRebel Desktop Integration Test\n');
  
  await testPlatformDetection();
  
  console.log('\nStarting notification tests in 2 seconds...');
  setTimeout(testDesktopIntegration, 2000);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runAllTests();
}

export { testDesktopIntegration, testPlatformDetection };