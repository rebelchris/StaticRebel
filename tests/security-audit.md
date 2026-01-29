# Security Audit Report - Static Rebel AI Assistant

## Executive Summary

This audit identifies several security concerns across the codebase that should be addressed before production deployment. The most critical issues involve API key storage, command injection risks, and insufficient input validation.

## Critical Issues (Fix Immediately)

### 1. API Keys Stored in Plain Text

**Location:** [`lib/apiConnector.js`](lib/apiConnector.js:26)

```javascript
// Line 26 - API keys stored unencrypted
if (!fs.existsSync(API_KEYS_FILE)) {
  fs.writeFileSync(
    API_KEYS_FILE,
    JSON.stringify({ keys: {}, encrypted: false }, null, 2),
  );
}
```

**Risk:** API keys are stored in plain JSON files in the user's home directory.

**Recommendation:**

- Use the OS keychain (keytar library) or encrypt keys with a master password
- At minimum, use Node.js crypto module to encrypt the file

### 2. Command Injection via Dynamic Tool Loading

**Location:** [`lib/dynamicTools.js`](lib/dynamicTools.js:83)

```javascript
// Line 83 - Dynamic import from user-controlled path
const module = await import(`file://${filePath}`);
```

**Risk:** If an attacker can write to the tools directory, they can execute arbitrary code.

**Recommendation:**

- Validate file paths with path traversal checks
- Use a sandboxed VM for tool execution
- Sign and verify tools before loading

### 3. SQL Injection in Database Module

**Location:** [`lib/db.js`](lib/db.js:94-97)

```javascript
// Lines 94-97 - String concatenation in SQL
const stmt = db.prepare(
  'INSERT INTO memory (date, type, content, metadata) VALUES (?, ?, ?, ?)',
);
stmt.run(date, type, content, JSON.stringify(metadata));
```

**Risk:** While using parameterized queries here, other parts of the code may concatenate SQL.

**Recommendation:**

- Audit all SQL queries for proper parameterization
- Use an ORM like Sequelize or Prisma

### 4. Unvalidated User Input in File Paths

**Location:** [`lib/configManager.js`](lib/configManager.js:86-100)

```javascript
// resolvePath function doesn't validate input
export function resolvePath(inputPath) {
  if (inputPath.startsWith('~/')) {
    return path.join(os.homedir(), inputPath.slice(2));
  }
  return path.resolve(inputPath);
}
```

**Risk:** Path traversal attacks possible if user input reaches this function.

**Recommendation:**

```javascript
export function resolvePath(inputPath) {
  // Validate and sanitize input
  if (typeof inputPath !== 'string') {
    throw new Error('Path must be a string');
  }

  // Prevent path traversal
  const sanitized = inputPath.replace(/\.\./g, '');

  if (sanitized.startsWith('~/')) {
    return path.join(os.homedir(), sanitized.slice(2));
  }

  // Ensure resolved path is within allowed directories
  const resolved = path.resolve(sanitized);
  const allowedDirs = [path.join(os.homedir(), '.static-rebel'), process.cwd()];

  const isAllowed = allowedDirs.some((dir) => resolved.startsWith(dir));
  if (!isAllowed) {
    throw new Error('Path not in allowed directory');
  }

  return resolved;
}
```

## High Severity Issues

### 5. No Rate Limiting on Dashboard API

**Location:** [`dashboard/server.js`](dashboard/server.js:72-84)

**Risk:** No rate limiting on API endpoints makes the service vulnerable to DoS attacks.

**Recommendation:**

```javascript
import rateLimit from 'express-rate-limit';

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
});

app.use('/api/', limiter);
```

### 6. CORS Misconfiguration

**Location:** [`dashboard/server.js`](dashboard/server.js:77)

```javascript
app.use(cors()); // Allows all origins
```

**Risk:** Open CORS policy allows any website to make requests to the API.

**Recommendation:**

```javascript
app.use(
  cors({
    origin: process.env.ALLOWED_ORIGINS?.split(',') || [
      'http://localhost:3000',
    ],
    credentials: true,
  }),
);
```

### 7. Missing Input Validation on Chat API

**Location:** [`dashboard/api/chat.js`](dashboard/api/chat.js:36-44)

```javascript
router.post('/', async (req, res) => {
  const { message, personaId, options = {} } = req.body;

  if (!message) {
    return res.status(400).json({ error: 'Message is required' });
  }
  // No validation of message content, size, or type
```

**Risk:** No validation on message size or content could lead to memory exhaustion or injection attacks.

**Recommendation:**

```javascript
const MAX_MESSAGE_LENGTH = 10000;

router.post('/', async (req, res) => {
  const { message, personaId, options = {} } = req.body;

  if (!message || typeof message !== 'string') {
    return res.status(400).json({ error: 'Message must be a non-empty string' });
  }

  if (message.length > MAX_MESSAGE_LENGTH) {
    return res.status(400).json({ error: `Message exceeds maximum length of ${MAX_MESSAGE_LENGTH}` });
  }

  // Sanitize message
  const sanitizedMessage = message.trim().replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F]/g, '');
```

### 8. No Authentication on API Endpoints

**Location:** All dashboard API routes

**Risk:** Anyone with network access can interact with the assistant, read memories, and execute commands.

**Recommendation:**

- Implement JWT-based authentication
- Add API key authentication for programmatic access
- Use session-based auth for web UI

## Medium Severity Issues

### 9. Information Disclosure via Error Messages

**Location:** Multiple files

```javascript
// Pattern seen throughout
catch (error) {
  res.status(500).json({ error: error.message });
}
```

**Risk:** Detailed error messages can leak sensitive information about the system.

**Recommendation:**

```javascript
catch (error) {
  console.error('Detailed error:', error); // Log full error
  res.status(500).json({
    error: 'Internal server error',
    requestId: generateRequestId() // For support correlation
  });
}
```

### 10. Weak Secret Generation

**Location:** [`lib/workerManager.js`](lib/workerManager.js:55)

```javascript
id: uuidv4().slice(0, 8), // Only 8 characters
```

**Risk:** Short IDs are more susceptible to collision attacks.

**Recommendation:** Use full UUID or at least 16 characters.

### 11. No HTTPS Enforcement

**Location:** [`dashboard/server.js`](dashboard/server.js:73)

**Risk:** HTTP server without TLS encryption.

**Recommendation:**

```javascript
import https from 'https';
import fs from 'fs';

const credentials = {
  key: fs.readFileSync('privatekey.pem'),
  cert: fs.readFileSync('certificate.pem'),
};

const server = https.createServer(credentials, app);
```

### 12. Potential Prototype Pollution

**Location:** [`lib/configManager.js`](lib/configManager.js:55-69)

```javascript
export function updateConfig(key, value) {
  const config = loadConfig();
  const keys = key.split('.');
  let current = config;

  for (let i = 0; i < keys.length - 1; i++) {
    if (!current[keys[i]]) {
      current[keys[i]] = {};
    }
    current = current[keys[i]];
  }
  // No check for __proto__ or constructor
```

**Risk:** If user input reaches the key parameter, prototype pollution is possible.

**Recommendation:**

```javascript
const FORBIDDEN_KEYS = ['__proto__', 'constructor', 'prototype'];

export function updateConfig(key, value) {
  const keys = key.split('.');

  if (keys.some((k) => FORBIDDEN_KEYS.includes(k))) {
    throw new Error('Invalid key');
  }
  // ... rest of function
}
```

## Low Severity Issues

### 13. Missing Security Headers

**Location:** [`dashboard/server.js`](dashboard/server.js:72-84)

**Recommendation:**

```javascript
import helmet from 'helmet';
app.use(helmet());
```

### 14. No Request Logging

**Location:** All API routes

**Risk:** Difficult to detect and investigate attacks.

**Recommendation:**

```javascript
import morgan from 'morgan';
app.use(morgan('combined'));
```

### 15. Environment Variables Not Validated

**Location:** Multiple files

```javascript
const OLLAMA_HOST = process.env.OLLAMA_HOST || 'http://localhost:11434';
```

**Risk:** Malformed environment variables could cause unexpected behavior.

**Recommendation:**

```javascript
import { z } from 'zod';

const envSchema = z.object({
  OLLAMA_HOST: z.string().url().default('http://localhost:11434'),
  PORT: z.string().regex(/^\d+$/).transform(Number).default('3000'),
  // ... other env vars
});

const env = envSchema.parse(process.env);
```

## Security Checklist

- [ ] Encrypt API keys at rest
- [ ] Implement rate limiting
- [ ] Add authentication to all API endpoints
- [ ] Validate and sanitize all user inputs
- [ ] Use HTTPS in production
- [ ] Add security headers (Helmet)
- [ ] Implement request logging
- [ ] Validate environment variables
- [ ] Fix prototype pollution vulnerability
- [ ] Restrict CORS to known origins
- [ ] Sanitize error messages in production
- [ ] Add path traversal protection
- [ ] Implement tool signing/verification
- [ ] Use parameterized queries for all SQL
- [ ] Add request size limits
