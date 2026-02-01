# StaticRebel REST API Documentation

The StaticRebel REST API provides external access to your skills tracking system, enabling integration with external apps, shortcuts, widgets, and automation tools.

## Getting Started

### Starting the API Server

```bash
# Start on default port 3000
sr api start

# Start on custom port
sr api start --port 8080

# Start with custom CORS settings
sr api start --cors "https://yourapp.com"
```

### Authentication

All API endpoints (except documentation) require authentication using an API key.

**Header:** `X-API-Key: your-api-key`

**Alternative:** `Authorization: Bearer your-api-key`

Get your API key:
```bash
sr api key
```

### Base URL

When running locally: `http://localhost:3000`

## Endpoints

### Skills

#### List All Skills
```http
GET /api/skills
```

Returns all tracked skills with basic metadata.

**Response:**
```json
{
  "skills": [
    {
      "id": "skill_123",
      "name": "Reading",
      "description": "Books and articles read",
      "unit": "pages",
      "type": "increment",
      "category": "learning",
      "created": 1643723400000,
      "totalEntries": 45,
      "lastEntry": 1643809800000
    }
  ],
  "count": 1
}
```

#### Get Skill Entries
```http
GET /api/skills/{id}/entries
```

**Parameters:**
- `limit` (optional): Number of entries to return (default: 100)
- `offset` (optional): Offset for pagination (default: 0)
- `from` (optional): Filter entries from date (YYYY-MM-DD)
- `to` (optional): Filter entries to date (YYYY-MM-DD)

**Example:**
```http
GET /api/skills/reading/entries?limit=10&from=2024-01-01&to=2024-01-31
```

**Response:**
```json
{
  "skill": {
    "id": "reading",
    "name": "Reading",
    "unit": "pages"
  },
  "entries": [
    {
      "id": "entry_456",
      "value": 25,
      "notes": "Finished Chapter 3 of Clean Code",
      "timestamp": 1643809800000,
      "date": "2024-01-31"
    }
  ],
  "pagination": {
    "total": 45,
    "limit": 10,
    "offset": 0,
    "hasMore": true
  }
}
```

#### Log Entry
```http
POST /api/skills/{id}/log
```

**Body:**
```json
{
  "value": 25,
  "notes": "Optional notes about this entry",
  "timestamp": "2024-01-31T14:30:00Z"
}
```

**Response:**
```json
{
  "success": true,
  "entry": {
    "id": "entry_789",
    "value": 25,
    "notes": "Optional notes about this entry",
    "timestamp": 1643640600000,
    "date": "2024-01-31"
  }
}
```

### Statistics

#### Usage Statistics
```http
GET /api/stats
```

**Response:**
```json
{
  "totalSkills": 5,
  "totalEntries": 234,
  "entriesToday": 3,
  "entriesThisWeek": 18,
  "entriesThisMonth": 67,
  "activeSkills": 4,
  "skillStats": [
    {
      "id": "reading",
      "name": "Reading",
      "totalEntries": 45,
      "entriesToday": 1,
      "entriesThisWeek": 5,
      "entriesThisMonth": 15,
      "lastEntry": 1643809800000
    }
  ]
}
```

#### Current Streaks
```http
GET /api/streaks
```

**Response:**
```json
{
  "streaks": [
    {
      "id": "reading",
      "name": "Reading",
      "currentStreak": 7,
      "longestStreak": 21,
      "lastEntry": 1643809800000
    }
  ],
  "count": 1
}
```

### Reminders

#### Create Reminder
```http
POST /api/reminders
```

**Body:**
```json
{
  "skillId": "reading",
  "message": "Time to read!",
  "scheduleType": "daily",
  "scheduleValue": "20:00",
  "enabled": true
}
```

**Schedule Types:**
- `daily`: scheduleValue should be time (e.g., "20:00")
- `weekly`: scheduleValue should be day+time (e.g., "monday 20:00")
- `monthly`: scheduleValue should be day of month+time (e.g., "15 20:00")
- `custom`: scheduleValue should be cron expression

## Error Responses

All errors follow this format:

```json
{
  "error": "Error type",
  "message": "Detailed error message"
}
```

**Common HTTP Status Codes:**
- `400 Bad Request`: Invalid input data
- `401 Unauthorized`: Missing or invalid API key
- `404 Not Found`: Skill or resource not found
- `429 Too Many Requests`: Rate limit exceeded
- `500 Internal Server Error`: Server error

## Rate Limiting

The API has rate limiting enabled:
- **Limit:** 100 requests per 15 minutes per IP
- **Headers:** Rate limit info in response headers

## CORS

CORS is enabled and configurable:
- **Default:** All origins allowed (`*`)
- **Configuration:** Set `SR_API_CORS_ORIGIN` environment variable
- **CLI:** Use `--cors` flag when starting server

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `SR_API_PORT` | Port for API server | `3000` |
| `SR_API_KEY` | Custom API key | Auto-generated |
| `SR_API_CORS_ORIGIN` | CORS origin setting | `*` |

## Integration Examples

### iOS Shortcuts

Use the HTTP request action to log entries:

```
Method: POST
URL: http://your-server:3000/api/skills/reading/log
Headers: X-API-Key: your-api-key
Body: {"value": 25, "notes": "Read during commute"}
```

### IFTTT/Zapier

Create webhooks that POST to your StaticRebel API when certain events occur.

### Custom Apps

The API is language-agnostic. Any system that can make HTTP requests can integrate with StaticRebel.

### Widget Dashboards

Use GET endpoints to fetch current stats and display them in dashboards or desktop widgets.

## OpenAPI Specification

Full OpenAPI 3.0 specification available at:
```
GET /api/docs
```

This returns the complete machine-readable API specification for code generation and testing tools.

## CLI Management

```bash
# Start API server
sr api start [--port 8080] [--cors "*"]

# Check server status
sr api status

# Get API key
sr api key

# Show help
sr api --help
```

## Security Considerations

1. **API Key Protection**: Keep your API key secret
2. **Network Security**: Use HTTPS in production
3. **CORS Configuration**: Restrict origins in production
4. **Rate Limiting**: Built-in protection against abuse
5. **Local Network**: API is designed for local/trusted network use

## Support

For issues with the API:
1. Check server logs for error details
2. Verify API key is correct
3. Ensure StaticRebel tracker data is accessible
4. Check network connectivity and firewall settings