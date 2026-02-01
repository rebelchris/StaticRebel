# WhatsApp Integration for StaticRebel

The WhatsApp integration enables StaticRebel to send and receive messages via WhatsApp, providing a natural and convenient way to log health and fitness data, receive nudges, and get daily summaries.

## Features

### ✅ Implemented
- **QR Code Authentication**: Secure login using WhatsApp Web
- **Session Persistence**: Stays logged in between restarts
- **Natural Language Processing**: Understands messages like "drank 2 glasses of water"
- **Message Logging**: All conversations are logged for tracking
- **Daily Summaries**: Generate and send daily progress reports
- **Nudges & Reminders**: Send motivational messages and reminders
- **Multi-device Support**: Works across multiple devices
- **Media Handling**: Support for images and files (structure ready)
- **LLM Integration**: Uses StaticRebel's LLM for intelligent parsing
- **CLI Commands**: Full command-line interface for management

### 🚧 Future Features
- **Voice Message Transcription**: Convert voice messages to text
- **Advanced Media Processing**: Image analysis for food logging
- **Group Chat Support**: Multi-user tracking in groups
- **Scheduled Notifications**: Automatic daily check-ins
- **Integration with Wearables**: Connect fitness trackers

## Setup

### Prerequisites
- Node.js 18+ with ES modules support
- WhatsApp mobile app
- Chrome/Chromium for WhatsApp Web (installed automatically)

### Installation
1. Install dependencies (already done if you've set up StaticRebel):
   ```bash
   npm install
   ```

2. Set up WhatsApp:
   ```bash
   sr whatsapp setup
   ```

3. Scan the QR code with your WhatsApp mobile app

4. Wait for "WhatsApp client is ready!" confirmation

## Usage

### CLI Commands

#### Setup & Status
```bash
# Initial setup with QR code
sr whatsapp setup

# Check connection status
sr whatsapp status

# Stop WhatsApp client
sr whatsapp stop
```

#### Messaging
```bash
# Send a message
sr whatsapp send 1234567890 "Hello from StaticRebel!"

# Send a nudge/reminder
sr whatsapp nudge 1234567890 water
sr whatsapp nudge 1234567890 exercise

# List recent chats
sr whatsapp chats
```

#### Testing & Development
```bash
# Test natural language processing
sr whatsapp test-nlp "drank 3 glasses of water"
sr whatsapp test-nlp "exercised for 45 minutes"

# Show help
sr whatsapp help
```

### Natural Language Logging

Users can send messages in natural language to log activities:

**Water Intake:**
- "drank 2 glasses of water"
- "had 1 liter of water"
- "drink 16 oz water"

**Exercise:**
- "exercised for 30 minutes"
- "went for a 5 mile run"
- "workout 45 mins"

**Weight:**
- "weight 150 lbs"
- "weigh 68 kg"

**Mood:**
- "feeling great today"
- "mood anxious"

### Queries & Commands

**Get Daily Summary:**
- "show me today's summary"
- "what are my stats?"
- "/sr stats"

**General Queries:**
- "how much water did I drink?"
- "what was my exercise time?"
- "how am I doing?"

## Configuration

### Environment Variables
```bash
# Optional: Custom session name
WHATSAPP_SESSION_NAME=my-staticrebel-session

# Optional: Custom Chrome path
PUPPETEER_EXECUTABLE_PATH=/path/to/chrome
```

### File Structure
```
data/whatsapp-sessions/
├── session/                 # WhatsApp Web session data
├── logs/                   # Daily message logs (JSONL)
├── tracking/               # Parsed health data (JSONL)
├── media/                  # Downloaded media files
└── status.json            # Connection status
```

## API Usage

### Programmatic Access
```javascript
import { getWhatsAppService } from './lib/integrations/whatsapp.js';

// Get service instance
const whatsapp = getWhatsAppService();

// Start service
await whatsapp.start();

// Send message
await whatsapp.sendMessage('1234567890@c.us', 'Hello!');

// Send nudge
await whatsapp.sendNudge('1234567890@c.us', 'water');

// Check status
const status = await whatsapp.getStatus();
console.log(status);
```

### Custom Message Handlers
```javascript
// Register custom handler
whatsapp.registerMessageHandler('custom', async (message, contact, chat) => {
  // Handle custom logic
  console.log('Custom handler:', message.body);
});

// Remove handler
whatsapp.removeMessageHandler('custom');
```

## Security & Privacy

### Data Handling
- **Local Storage**: All data stored locally, never sent to external servers
- **Encrypted Sessions**: WhatsApp sessions use WhatsApp's encryption
- **Privacy First**: No data mining or external tracking
- **User Control**: Users can delete data at any time

### Session Security
- Sessions are stored locally in `data/whatsapp-sessions/`
- Use strong device security (full disk encryption recommended)
- Sessions auto-expire after 30 days of inactivity
- Can be manually logged out with `sr whatsapp stop`

## Troubleshooting

### Common Issues

**QR Code Not Working:**
- Make sure WhatsApp mobile app is updated
- Try refreshing: stop and restart setup
- Check internet connection on both devices

**Connection Drops:**
- Run `sr whatsapp status` to check
- Restart with `sr whatsapp setup`
- Check system resources (Chrome can be memory-intensive)

**Messages Not Processing:**
- Check logs in `data/whatsapp-sessions/logs/`
- Verify LLM is running for advanced parsing
- Test NLP with `sr whatsapp test-nlp "your message"`

**Chrome/Puppeteer Issues:**
```bash
# Install Chrome dependencies (Ubuntu/Debian)
sudo apt-get install -y ca-certificates fonts-liberation libappindicator3-1 \
    libasound2 libatk-bridge2.0-0 libatk1.0-0 libcairo-gobject2 libcairo2 \
    libdbus-1-3 libdrm2 libfontconfig1 libgbm1 libgconf-2-4 libgtk-3-0 \
    libgtk-3-common libice6 libnspr4 libnss3 libsm6 libx11-6 libx11-xcb1 \
    libxcb1 libxcomposite1 libxcursor1 libxdamage1 libxext6 libxfixes3 \
    libxi6 libxrandr2 libxrender1 libxss1 libxtst6
```

### Debug Logging
```bash
# Enable debug mode
DEBUG=whatsapp* sr whatsapp setup

# Check session files
ls -la data/whatsapp-sessions/

# View recent logs
tail -f data/whatsapp-sessions/logs/$(date +%Y-%m-%d).jsonl
```

## Integration with StaticRebel

The WhatsApp integration seamlessly works with StaticRebel's core features:

- **Memory System**: Conversations stored in daily memory
- **LLM Integration**: Uses configured models for parsing
- **Health Tracking**: Integrates with existing tracker system
- **Notifications**: Can send scheduled reminders
- **Multi-modal**: Supports text, voice, and media

## Development

### Code Structure
- `whatsapp.js`: Main integration class
- `whatsapp-cli.js`: CLI command handlers
- Session data in `data/whatsapp-sessions/`

### Adding Features
1. Extend `WhatsAppIntegration` class
2. Add CLI commands in `whatsapp-cli.js`
3. Update help text and documentation
4. Test with `sr whatsapp test-nlp`

### Testing
```bash
# Test basic functionality
sr whatsapp help
sr whatsapp status
sr whatsapp test-nlp "test message"

# Test with real WhatsApp (after setup)
sr whatsapp send YOUR_NUMBER "test from StaticRebel"
```

## License

Part of StaticRebel - see main project license.