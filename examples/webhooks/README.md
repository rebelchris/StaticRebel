# Webhook Examples

This directory contains example webhook configurations for popular integrations.

## Quick Setup

Run the interactive setup script:

```bash
./setup-webhooks.sh
```

Or manually configure webhooks using the example files below.

## Example Integrations

### [Slack Integration](slack-integration.json)
Get notified in Slack when you log journal entries.

**Features:**
- Rich message formatting with entry content, mood, and tags
- Customizable channel notifications
- Embedded timestamp and branding

**Setup:**
```bash
sr webhook add \
  --name "Slack Journal Alerts" \
  --url "https://hooks.slack.com/services/YOUR/WEBHOOK/URL" \
  --event "entry_logged"
```

### [Discord Integration](discord-streaks.json)
Celebrate streak milestones in your Discord server.

**Features:**
- Rich embeds with trophy icons and colors
- Milestone-based messaging
- Server-wide celebrations

**Setup:**
```bash
sr webhook add \
  --name "Discord Streak Celebrations" \
  --url "https://discord.com/api/webhooks/YOUR/WEBHOOK/URL" \
  --event "streak_milestone"
```

### [Zapier Automation](zapier-automation.json)
Connect goal completions to 1000+ apps via Zapier.

**Features:**
- Email notifications
- Spreadsheet tracking
- Social media posting
- Task manager updates

**Setup:**
```bash
sr webhook add \
  --name "Zapier Goal Triggers" \
  --url "https://hooks.zapier.com/hooks/catch/YOUR/WEBHOOK/" \
  --event "goal_reached"
```

### [IFTTT Smart Home](ifttt-smart-home.json)
Trigger smart home automation from StaticRebel nudges.

**Features:**
- Philips Hue light control
- Thermostat adjustments
- Smart device automation
- Routine-based triggers

**Setup:**
```bash
sr webhook add \
  --name "IFTTT Smart Home Triggers" \
  --url "https://maker.ifttt.com/trigger/staticrebel_nudge/with/key/YOUR_KEY" \
  --event "nudge"
```

## Testing Webhooks

After setting up any webhook:

```bash
# List all webhooks
sr webhook list

# Test webhook connectivity
sr webhook test <webhook-id>

# View delivery logs
sr webhook logs

# Check statistics
sr webhook stats
```

## Custom Integrations

### API Webhook Template

```json
{
  "name": "Custom API Integration",
  "url": "https://api.your-service.com/webhooks/staticrebel",
  "event": "entry_logged",
  "headers": {
    "Authorization": "Bearer your-api-token",
    "Content-Type": "application/json"
  },
  "secret": "your-webhook-secret",
  "template": {
    "event_type": "journal_entry",
    "timestamp": "{{timestamp}}",
    "user_id": "{{user_id}}",
    "data": {
      "content": "{{entry.content}}",
      "mood": "{{entry.mood}}",
      "tags": "{{entry.tags}}"
    }
  }
}
```

### Webhook Security

For production webhooks, always use:

1. **HTTPS URLs** for encrypted communication
2. **Webhook secrets** for payload verification
3. **API tokens** in custom headers for authentication

Example secure webhook:
```bash
sr webhook add \
  --name "Secure Production Webhook" \
  --url "https://api.example.com/webhook" \
  --event "entry_logged" \
  --secret "your-strong-secret-key" \
  --header-Authorization "Bearer your-api-token" \
  --header-X-Source "StaticRebel"
```

## Troubleshooting

### Common Issues

**Webhook not triggering:**
- Verify event type: `sr webhook events`
- Check webhook is enabled: `sr webhook list`
- Review logs for errors: `sr webhook logs --status failed`

**Connection errors:**
- Test URL accessibility with curl
- Verify webhook endpoint accepts POST requests
- Check firewall/network settings

**Authentication issues:**
- Validate webhook secret is correct
- Confirm API tokens haven't expired
- Test with minimal payload first

### Debug Commands

```bash
# Enable debug mode
export EVENT_DEBUG=true

# Test webhook with debug output
sr webhook test <webhook-id>

# View detailed logs
sr webhook logs --webhook <webhook-id> --days 1

# Test incoming webhook server
curl -X POST http://localhost:3001/webhook \
  -H "Content-Type: application/json" \
  -d '{"test": "payload"}'
```

## Contributing

Have a great webhook integration example? 

1. Create a JSON configuration file
2. Include setup instructions
3. Add troubleshooting tips
4. Test thoroughly
5. Submit a pull request

## Support

- 📖 **Documentation**: See [docs/webhooks.md](../../docs/webhooks.md)
- 🛠️ **CLI Help**: `sr webhook help`
- 🐛 **Issues**: Report bugs in the main repository
- 💬 **Community**: Join the StaticRebel Discord

---

*Happy integrating! 🎯*