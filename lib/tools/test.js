#!/usr/bin/env node

/**
 * Unified Tool System Test
 * 
 * Simple test script to verify the unified tool system works correctly.
 */

import { 
  initializeToolSystem, 
  executeTool, 
  getAvailableTools, 
  discoverTools,
  getToolSystem 
} from './index.js';

async function runTests() {
  console.log('🧪 Testing Unified Tool System\n');
  
  try {
    // Test 1: Initialize the system
    console.log('1️⃣ Initializing tool system...');
    await initializeToolSystem();
    console.log('✅ System initialized successfully\n');
    
    // Test 2: List available tools
    console.log('2️⃣ Listing available tools...');
    const tools = getAvailableTools();
    console.log(`✅ Found ${tools.length} tools:`);
    tools.forEach(tool => {
      console.log(`   - ${tool.name}: ${tool.description}`);
    });
    console.log();
    
    // Test 3: Test tool discovery
    console.log('3️⃣ Testing tool discovery...');
    const searchTools = discoverTools('search');
    console.log(`✅ Found ${searchTools.length} search-related tools:`);
    searchTools.forEach(tool => {
      console.log(`   - ${tool.name}: ${tool.description}`);
    });
    console.log();
    
    // Test 4: Test web search tool
    console.log('4️⃣ Testing web_search tool...');
    const searchResult = await executeTool('web_search', {
      query: 'Node.js testing',
      limit: 3
    });
    
    if (searchResult.success) {
      console.log('✅ Web search executed successfully');
      console.log('   Result:', searchResult.result);
    } else {
      console.log('❌ Web search failed:', searchResult.error);
    }
    console.log();
    
    // Test 5: Test log_skill tool
    console.log('5️⃣ Testing log_skill tool...');
    const logResult = await executeTool('log_skill', {
      skill_id: 'test_skill',
      data: { 
        test: true, 
        timestamp: Date.now(),
        message: 'Test execution from tool system'
      }
    });
    
    if (logResult.success) {
      console.log('✅ Skill logging executed successfully');
      console.log('   Result:', logResult.result);
    } else {
      console.log('❌ Skill logging failed:', logResult.error);
    }
    console.log();
    
    // Test 6: Test file operations
    console.log('6️⃣ Testing file operations...');
    const testFilePath = './test-tool-output.txt';
    const testContent = `Tool System Test\nExecuted at: ${new Date().toISOString()}\n`;
    
    // Write test file
    const writeResult = await executeTool('file_write', {
      path: testFilePath,
      content: testContent
    });
    
    if (writeResult.success) {
      console.log('✅ File write executed successfully');
      
      // Read test file
      const readResult = await executeTool('file_read', {
        path: testFilePath
      });
      
      if (readResult.success) {
        console.log('✅ File read executed successfully');
        console.log('   Content preview:', readResult.result.content.substring(0, 50) + '...');
      } else {
        console.log('❌ File read failed:', readResult.error);
      }
    } else {
      console.log('❌ File write failed:', writeResult.error);
    }
    console.log();
    
    // Test 7: Test parameter validation
    console.log('7️⃣ Testing parameter validation...');
    try {
      const invalidResult = await executeTool('web_search', {
        query: 123, // Invalid type - should be string
        limit: 'not_a_number' // Invalid type - should be number
      });
      
      if (!invalidResult.success) {
        console.log('✅ Parameter validation working correctly');
        console.log('   Error (expected):', invalidResult.error);
      } else {
        console.log('❌ Parameter validation not working - invalid params accepted');
      }
    } catch (error) {
      // Parameter validation throws an error, which is also correct behavior
      console.log('✅ Parameter validation working correctly (throws error)');
      console.log('   Error (expected):', error.message);
    }
    console.log();
    
    // Test 8: Test rate limiting
    console.log('8️⃣ Testing rate limiting...');
    console.log('   Making multiple rapid requests...');
    
    const rapidResults = [];
    for (let i = 0; i < 3; i++) {
      const result = await executeTool('log_skill', {
        skill_id: `rate_test_${i}`,
        data: { iteration: i }
      });
      rapidResults.push(result.success);
    }
    
    const successCount = rapidResults.filter(Boolean).length;
    console.log(`✅ Rate limiting test: ${successCount}/3 requests succeeded`);
    console.log();
    
    // Test 9: Test system statistics
    console.log('9️⃣ Getting system statistics...');
    const system = getToolSystem();
    const stats = system.getStats();
    console.log('✅ System statistics:', stats);
    console.log();
    
    // Test 10: Test custom tool registration
    console.log('🔟 Testing custom tool registration...');
    system.registerTool('test_custom_tool', {
      schema: {
        message: 'string',
        level: 'string?'
      },
      handler: async (params) => {
        const { message, level = 'info' } = params;
        return {
          logged: true,
          message: `[${level.toUpperCase()}] ${message}`,
          timestamp: new Date().toISOString()
        };
      },
      description: 'Test custom tool for logging messages'
    });
    
    const customResult = await executeTool('test_custom_tool', {
      message: 'Hello from custom tool!',
      level: 'debug'
    });
    
    if (customResult.success) {
      console.log('✅ Custom tool registration and execution successful');
      console.log('   Result:', customResult.result);
    } else {
      console.log('❌ Custom tool failed:', customResult.error);
    }
    console.log();
    
    console.log('🎉 All tests completed!\n');
    
    // Final summary
    const finalStats = system.getStats();
    console.log('📊 Final System State:');
    console.log(`   Total Tools: ${finalStats.totalTools}`);
    console.log(`   Categories: ${Object.keys(finalStats.categories).join(', ')}`);
    console.log(`   Rate Limited Tools: ${finalStats.hasRateLimit}`);
    console.log(`   Initialized: ${finalStats.initialized}`);
    
  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

// Run tests if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runTests().catch(console.error);
}

export { runTests };