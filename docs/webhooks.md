# StaticRebel Webhook System

A comprehensive webhook system that enables StaticRebel to send and receive HTTP callbacks for real-time integrations with external systems.

## Overview

The webhook system supports both outgoing and incoming webhooks:

- **Outgoing webhooks**: StaticRebel sends HTTP requests to external URLs when specific events occur
- **Incoming webhooks**: External systems can send HTTP requests to StaticRebel to trigger actions

## Features

- ✅ **Event-driven triggers** - Automatically triggered by StaticRebel events
- ✅ **Configurable payloads** - Customizable JSON templates with dynamic data
- ✅ **Retry logic** - Exponential backoff retry mechanism for failed deliveries
- ✅ **Security** - HMAC signature verification for payload integrity
- ✅ **Logging** - Complete audit trail of all webhook activities
- ✅ **CLI management** - Easy webhook configuration via command line
- ✅ **Health monitoring** - Test webhook connectivity and monitor performance

## Quick Start

### 1. Add Your First Outgoing Webhook

```bash
# Add a webhook for journal entries
sr webhook add \
  --name "Slack Journal Notifications" \
  --url "https://hooks.slack.com/services/YOUR/SLACK/WEBHOOK" \
  --event "entry_logged" \
  --secret "your-webhook-secret"

# Test the webhook
sr webhook list
sr webhook test <webhook-id>
```

### 2. Start Incoming Webhook Server

```bash
# Start the server (runs on port 3001 by default)
sr webhook start

# Check status
sr webhook status
```

### 3. Send an Incoming Webhook

```bash
# Log an entry via webhook
curl -X POST http://localhost:3001/webhook \
  -H "Content-Type: application/json" \
  -H "X-Webhook-Event: log_entry" \
  -d '{
    "content": "Just finished a great workout!",
    "tags": ["fitness", "positive"],
    "mood": "energetic"
  }'
```

## Outgoing Webhooks

### Event Types

StaticRebel can trigger webhooks for these events:

| Event | Description | When It Triggers |
|-------|-------------|------------------|
| `entry_logged` | Journal entry created | When user logs a new journal entry |
| `streak_milestone` | Streak milestone reached | When user hits 7, 14, 30, 100+ day streaks |
| `goal_reached` | Goal completed | When a user goal is marked as completed |
| `nudge` | Reminder sent | When StaticRebel sends a nudge/reminder |

### Payload Templates

Each event has a default payload template that you can customize:

#### Entry Logged
```json
{
  "event": "entry_logged",
  "timestamp": "{{timestamp}}",
  "user_id": "{{user_id}}",
  "entry": {
    "id": "{{entry.id}}",
    "content": "{{entry.content}}",
    "tags": "{{entry.tags}}",
    "mood": "{{entry.mood}}"
  }
}
```

#### Streak Milestone
```json
{
  "event": "streak_milestone",
  "timestamp": "{{timestamp}}",
  "user_id": "{{user_id}}",
  "streak": {
    "type": "{{streak.type}}",
    "current_count": "{{streak.current_count}}",
    "milestone": "{{streak.milestone}}",
    "achievement": "{{streak.achievement}}"
  }
}
```

### Template Variables

Use `{{variable}}` syntax to insert dynamic data:

- `{{timestamp}}` - ISO 8601 timestamp
- `{{user_id}}` - User identifier
- `{{entry.content}}` - Journal entry text
- `{{entry.tags}}` - Array of tags
- `{{entry.mood}}` - Mood rating/description
- `{{streak.current_count}}` - Current streak count
- `{{goal.title}}` - Goal name
- `{{nudge.message}}` - Nudge text

### Security

Webhooks can be secured with HMAC signatures:

```bash
# Add webhook with secret
sr webhook add \
  --name "Secure Webhook" \
  --url "https://api.example.com/webhook" \
  --event "entry_logged" \
  --secret "your-secret-key"
```

The webhook will include this header:
```
X-Webhook-Signature: sha256=<hmac-signature>
```

To verify in your endpoint:
```javascript
const crypto = require('crypto');

function verifyWebhook(payload, signature, secret) {
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');
  
  return signature === `sha256=${expectedSignature}`;
}
```

## Incoming Webhooks

### Endpoint

The incoming webhook server runs on port 3001 with the endpoint:
```
POST http://localhost:3001/webhook
```

### Event Types

Send these event types to trigger different actions:

| Event Type | Description | Action |
|------------|-------------|--------|
| `log_entry` | Log a journal entry | Adds entry to journal system |
| `trigger_action` | Trigger a StaticRebel action | Executes specified action |
| `external_update` | External system update | Broadcasts update to other systems |

### Examples

#### Log Entry
```bash
curl -X POST http://localhost:3001/webhook \
  -H "Content-Type: application/json" \
  -H "X-Webhook-Event: log_entry" \
  -d '{
    "content": "Completed my morning routine",
    "tags": ["routine", "morning"],
    "mood": "productive",
    "timestamp": "2024-02-01T08:00:00Z"
  }'
```

#### Trigger Action
```bash
curl -X POST http://localhost:3001/webhook \
  -H "Content-Type: application/json" \
  -H "X-Webhook-Event: trigger_action" \
  -d '{
    "action": "send_reminder",
    "params": {
      "message": "Time for your afternoon walk!",
      "type": "fitness"
    }
  }'
```

#### External Update
```bash
curl -X POST http://localhost:3001/webhook \
  -H "Content-Type: application/json" \
  -H "X-Webhook-Event: external_update" \
  -d '{
    "system": "fitness_tracker",
    "update": {
      "steps": 10000,
      "calories": 450,
      "date": "2024-02-01"
    }
  }'
```

## CLI Commands

### List Webhooks
```bash
sr webhook list
sr webhook ls
```

### Add Webhook
```bash
sr webhook add \
  --name "My Webhook" \
  --url "https://api.example.com/webhook" \
  --event "entry_logged" \
  --secret "optional-secret" \
  --header-Authorization "Bearer token123"
```

### Remove Webhook
```bash
sr webhook remove <webhook-id>
sr webhook rm <webhook-id>
```

### Test Webhook
```bash
sr webhook test <webhook-id>
```

### View Logs
```bash
# View all logs from last 7 days
sr webhook logs

# Filter by specific webhook
sr webhook logs --webhook <webhook-id>

# Filter by event type
sr webhook logs --event "entry_logged"

# Filter by status
sr webhook logs --status "failed"

# Custom date range
sr webhook logs --days 30
```

### View Statistics
```bash
sr webhook stats
```

### Server Management
```bash
# Start incoming webhook server
sr webhook start

# Stop webhook server  
sr webhook stop

# Check status
sr webhook status
```

### Help and Info
```bash
# Show available templates
sr webhook templates

# Show event types
sr webhook events

# Show help
sr webhook help
```

## Configuration

Webhooks are configured in `data/webhooks/webhooks.json`:

```json
{
  "version": "1.0",
  "updated": "2024-02-01T12:00:00Z",
  "webhooks": [
    {
      "id": "webhook-123",
      "name": "Slack Notifications",
      "url": "https://hooks.slack.com/services/...",
      "event": "entry_logged",
      "enabled": true,
      "headers": {
        "Authorization": "Bearer token"
      },
      "secret": "webhook-secret",
      "template": {
        "text": "New journal entry: {{entry.content}}"
      },
      "createdAt": "2024-02-01T10:00:00Z",
      "updatedAt": "2024-02-01T10:00:00Z"
    }
  ]
}
```

## Logs and Monitoring

### Log Files

Daily log files are stored in `data/webhooks/`:
```
data/webhooks/
├── webhooks.json           # Webhook configuration
├── webhook-logs-2024-02-01.json
├── webhook-logs-2024-02-02.json
└── ...
```

### Log Format

Each log entry contains:
```json
{
  "id": "delivery-uuid",
  "webhookId": "webhook-123",
  "url": "https://api.example.com/webhook",
  "event": "entry_logged",
  "attempt": 1,
  "status": "success",
  "statusCode": 200,
  "duration": 245,
  "timestamp": "2024-02-01T12:34:56Z",
  "payload": "[payload data]",
  "response": "OK"
}
```

### Retry Logic

Failed webhooks are automatically retried with exponential backoff:

1. **Initial retry**: 1 second delay
2. **Second retry**: 2 seconds delay  
3. **Third retry**: 4 seconds delay
4. **Max retries**: 3 attempts
5. **Max delay**: 30 seconds

## Integration Examples

### Slack Integration

Create a Slack webhook to get notified of journal entries:

1. **Create Slack Incoming Webhook**:
   - Go to your Slack workspace settings
   - Create a new incoming webhook
   - Copy the webhook URL

2. **Add StaticRebel Webhook**:
   ```bash
   sr webhook add \
     --name "Slack Journal Alerts" \
     --url "https://hooks.slack.com/services/YOUR/WEBHOOK/URL" \
     --event "entry_logged"
   ```

3. **Custom Slack Payload**:
   ```json
   {
     "text": "📝 New journal entry",
     "attachments": [
       {
         "color": "good",
         "fields": [
           {
             "title": "Content",
             "value": "{{entry.content}}",
             "short": false
           },
           {
             "title": "Mood",
             "value": "{{entry.mood}}",
             "short": true
           },
           {
             "title": "Tags",
             "value": "{{entry.tags}}",
             "short": true
           }
         ],
         "footer": "StaticRebel",
         "ts": "{{timestamp}}"
       }
     ]
   }
   ```

### Discord Integration

Send streak milestones to Discord:

```bash
sr webhook add \
  --name "Discord Streaks" \
  --url "https://discord.com/api/webhooks/YOUR/WEBHOOK" \
  --event "streak_milestone"
```

Discord payload template:
```json
{
  "content": "🎉 **Streak Milestone Achieved!**",
  "embeds": [
    {
      "title": "{{streak.achievement}}",
      "description": "You've reached {{streak.current_count}} days!",
      "color": 5814783,
      "timestamp": "{{timestamp}}"
    }
  ]
}
```

### Zapier Integration

Connect to 1000+ apps via Zapier webhooks:

1. Create a Zapier webhook trigger
2. Add the webhook URL to StaticRebel
3. Set up your Zapier automation

```bash
sr webhook add \
  --name "Zapier Automation" \
  --url "https://hooks.zapier.com/hooks/catch/XXXXX/XXXXX/" \
  --event "goal_reached"
```

### IFTTT Integration

Use IFTTT webhooks for IoT integrations:

```bash
sr webhook add \
  --name "IFTTT Smart Home" \
  --url "https://maker.ifttt.com/trigger/EVENT_NAME/with/key/YOUR_KEY" \
  --event "nudge"
```

## Troubleshooting

### Common Issues

**Webhook not triggering**:
- Check if webhook is enabled: `sr webhook list`
- Verify event type matches your needs: `sr webhook events`
- Check logs for errors: `sr webhook logs --status failed`

**Connection timeouts**:
- Test webhook connectivity: `sr webhook test <id>`
- Check if target URL is accessible
- Verify firewall/network settings

**Authentication errors**:
- Verify webhook secret is correct
- Check custom headers are properly set
- Test with curl to isolate issues

**Payload issues**:
- Review template variables: `sr webhook templates`
- Check log payload to debug template rendering
- Validate JSON syntax in custom templates

### Debug Mode

Enable debug logging by setting environment variable:
```bash
export EVENT_DEBUG=true
sr webhook test <webhook-id>
```

### Test with curl

Test your webhook endpoint directly:
```bash
curl -X POST https://your-webhook-url.com/endpoint \
  -H "Content-Type: application/json" \
  -H "X-Webhook-Signature: sha256=test" \
  -d '{"test": "payload"}'
```

## Advanced Usage

### Custom Headers

Add custom headers for authentication:
```bash
sr webhook add \
  --name "API Integration" \
  --url "https://api.example.com/webhook" \
  --event "entry_logged" \
  --header-Authorization "Bearer your-token" \
  --header-X-API-Version "v1"
```

### Conditional Webhooks

Filter webhooks based on event data (coming soon):
```json
{
  "conditions": {
    "mood": ["positive", "energetic"],
    "tags": ["fitness"]
  }
}
```

### Webhook Chains

Trigger multiple webhooks in sequence (coming soon):
```json
{
  "chains": [
    {
      "webhook": "webhook-1",
      "onSuccess": "webhook-2",
      "onFailure": "webhook-error"
    }
  ]
}
```

## API Reference

For programmatic access, see the webhook manager API:

```javascript
import { getWebhookManager } from './lib/integrations/webhooks.js';

const manager = getWebhookManager();

// Add webhook
await manager.addWebhook({
  name: 'My Webhook',
  url: 'https://api.example.com/webhook',
  event: 'entry_logged'
});

// Test webhook
const result = await manager.testWebhook(webhookId);

// Get logs
const logs = await manager.getLogs({ days: 7 });
```

## Support

- 📖 **Documentation**: This file and inline help (`sr webhook help`)
- 🐛 **Issues**: Report bugs in the main StaticRebel repository
- 💬 **Community**: Join the StaticRebel Discord for questions
- 📧 **Contact**: Reach out for integration help

---

*Happy webhooking! 🎣*