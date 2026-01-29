# Static Rebel Test Suite

Comprehensive test suite for the Static Rebel AI Assistant.

## Running Tests

### Run All Tests

```bash
npm test
```

### Run Specific Test Suites

```bash
# Library modules
npm run test:lib

# Agent modules
npm run test:agents

# Dashboard API
npm run test:dashboard

# Individual modules
npm run test:config
npm run test:memory
npm run test:models
npm run test:subagents
npm run test:cron
```

### Watch Mode

```bash
npm run test:watch
```

## Test Structure

```
tests/
├── README.md                 # This file
├── package.json              # Test dependencies and scripts
├── security-audit.md         # Security audit report
├── optimizations.md          # Performance optimization report
├── lib/                      # Library module tests
│   ├── configManager.test.js
│   ├── memoryManager.test.js
│   ├── modelRegistry.test.js
│   ├── subagentManager.test.js
│   └── cronScheduler.test.js
├── agents/                   # Agent module tests
│   ├── mainAgent.test.js
│   └── codingAgent.test.js
└── dashboard/                # Dashboard API tests
    └── api.test.js
```

## Test Coverage

### Library Modules

#### Config Manager (`lib/configManager.test.js`)

- Configuration loading and saving
- Dot notation key access
- Default configuration
- Path resolution
- Caching behavior
- Edge cases (empty keys, deep nesting, special characters)

#### Memory Manager (`lib/memoryManager.test.js`)

- Directory initialization
- Daily memory read/write
- Long-term memory access
- Session memory loading
- Memory curation
- Statistics gathering
- Concurrent writes
- Large content handling

#### Model Registry (`lib/modelRegistry.test.js`)

- Model configuration
- Available model listing
- Task type detection
- Model selection
- Chat completion
- Embedding creation
- Connection error handling
- Timeout handling

#### Subagent Manager (`lib/subagentManager.test.js`)

- Subagent creation
- Message sending
- Lifecycle management (create, get, terminate)
- Specialized subagents (coding, analysis)
- Statistics tracking
- Concurrent operations
- Memory leak prevention

#### Cron Scheduler (`lib/cronScheduler.test.js`)

- Cron expression parsing
- Time matching
- Job management (add, list, delete, toggle)
- Next run calculation
- Scheduler lifecycle
- DST handling
- Invalid expression handling

### Agent Modules

#### Main Agent (`agents/mainAgent.test.js`)

- Persona loading
- System prompt building
- Session management
- Message handling
- Command processing
- Error recovery

#### Coding Agent (`agents/codingAgent.test.js`)

- Initialization
- File operations
- Code changes (create, read, update, delete)
- Command execution
- Safety validations

### Dashboard API (`dashboard/api.test.js`)

- Chat endpoints
- Memory endpoints
- Persona management
- Worker management
- Configuration
- Status checks
- Error handling
- Rate limiting
- Input validation
- Security (XSS, injection)

## Writing Tests

### Basic Test Structure

```javascript
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';

describe('Module Name', () => {
  let module;

  before(async () => {
    module = await import('../../lib/module.js');
  });

  describe('functionName()', () => {
    it('should do something', () => {
      const result = module.functionName();
      assert.strictEqual(result, expected);
    });
  });
});
```

### Async Tests

```javascript
it('should handle async operations', async () => {
  const result = await module.asyncFunction();
  assert.ok(result);
});
```

### Error Testing

```javascript
it('should throw on invalid input', async () => {
  await assert.rejects(async () => {
    await module.function('invalid');
  }, /expected error message/);
});
```

### Setup and Teardown

```javascript
import fs from 'fs';
import path from 'path';
import os from 'os';

const TEST_DIR = path.join(os.tmpdir(), 'test-dir');

before(() => {
  if (fs.existsSync(TEST_DIR)) {
    fs.rmSync(TEST_DIR, { recursive: true });
  }
  fs.mkdirSync(TEST_DIR, { recursive: true });
});

after(() => {
  if (fs.existsSync(TEST_DIR)) {
    fs.rmSync(TEST_DIR, { recursive: true });
  }
});

beforeEach(() => {
  // Run before each test
});
```

## Best Practices

1. **Isolation**: Each test should be independent
2. **Cleanup**: Always clean up test files and state
3. **Mocking**: Mock external dependencies (HTTP requests, file system)
4. **Edge Cases**: Test boundary conditions and error cases
5. **Performance**: Keep tests fast and focused

## Security Testing

Tests include checks for:

- Path traversal attacks
- SQL injection
- XSS attacks
- Prototype pollution
- Command injection

## Known Limitations

1. Some tests require the Ollama server to be running
2. File system tests use temporary directories
3. Network tests may fail in offline environments
4. Dashboard API tests require the server to be started

## Contributing

When adding new tests:

1. Follow the existing naming convention: `*.test.js`
2. Group related tests in `describe` blocks
3. Use descriptive test names
4. Include both positive and negative test cases
5. Add edge case tests
6. Update this README with new test coverage
