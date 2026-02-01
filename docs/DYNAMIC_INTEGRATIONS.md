# Dynamic Integrations - Making StaticRebel Infinitely Extensible

The Dynamic Integration System allows you to add any API or service to StaticRebel using simple JSON configuration. The LLM automatically figures out how to use your integrations based on natural language requests.

## 🚀 Quick Start

1. **Create an integration**: `sr integration add`
2. **List integrations**: `sr integration list`  
3. **Test integration**: `sr integration test <id>`
4. **Use natural language**: `"Post this to my blog"`

## 📋 Integration Definition Format

Integrations are defined in JSON with this structure:

```json
{
  "id": "unique-integration-id",
  "name": "Human Readable Name",
  "description": "What this integration does",
  "baseUrl": "https://api.example.com",
  "authentication": {
    "type": "api_key|bearer|basic|oauth|none",
    "header": "X-API-Key",
    "envVar": "MY_API_KEY"
  },
  "capabilities": [
    "create posts",
    "read data", 
    "send notifications"
  ],
  "responseFormat": "json|xml|text|html",
  "actions": [
    {
      "name": "action_name",
      "description": "What this action does",
      "method": "GET|POST|PUT|DELETE|PATCH",
      "endpoint": "/path/to/endpoint",
      "parameters": {
        "param_name": {
          "type": "string|number|boolean|object|array",
          "required": true|false,
          "description": "Parameter description"
        }
      },
      "responseFormat": "json",
      "testRequest": "Example request for testing"
    }
  ]
}
```

## 🔐 Authentication Types

### API Key
```json
{
  "authentication": {
    "type": "api_key",
    "header": "X-API-Key",        // Header name
    "envVar": "MY_API_KEY"        // Environment variable
  }
}
```

**Alternative**: Query parameter
```json
{
  "authentication": {
    "type": "api_key",
    "query": "api_key",           // Query parameter name
    "envVar": "MY_API_KEY"
  }
}
```

### Bearer Token
```json
{
  "authentication": {
    "type": "bearer",
    "envVar": "MY_TOKEN"          // Sets Authorization: Bearer <token>
  }
}
```

### Basic Auth
```json
{
  "authentication": {
    "type": "basic",
    "usernameEnvVar": "MY_USERNAME",
    "passwordEnvVar": "MY_PASSWORD"
  }
}
```

### OAuth
```json
{
  "authentication": {
    "type": "oauth",
    "clientId": "CLIENT_ID_ENV_VAR",
    "clientSecret": "CLIENT_SECRET_ENV_VAR"
  }
}
```

### No Authentication
```json
{
  "authentication": {
    "type": "none"
  }
}
```

## ⚡ Action Parameters

The LLM automatically extracts parameters from user requests based on your parameter definitions:

```json
{
  "parameters": {
    "title": {
      "type": "string",
      "required": true,
      "description": "Post title - extracted from user's message"
    },
    "content": {
      "type": "string", 
      "required": true,
      "description": "Post content - main body text"
    },
    "status": {
      "type": "string",
      "required": false,
      "description": "Publication status: draft, publish, private"
    },
    "tags": {
      "type": "array",
      "required": false, 
      "description": "List of tags for the post"
    },
    "metadata": {
      "type": "object",
      "required": false,
      "description": "Additional structured data"
    }
  }
}
```

### Parameter Types
- `string` - Text values
- `number` - Numeric values  
- `boolean` - true/false values
- `array` - Lists of values
- `object` - Complex nested data

## 📁 Where to Save Integrations

### Option 1: Individual Files (Recommended)
Save in `integrations/` directory as `<id>.json`:
```bash
integrations/
├── my-blog.json
├── crm-system.json  
└── notification-service.json
```

### Option 2: Configuration File
Add to `integrations.json`:
```json
{
  "integrations": {
    "my-blog": { /* integration definition */ },
    "crm-system": { /* integration definition */ }
  }
}
```

## 🎯 Natural Language Usage

Once defined, use integrations with natural language:

```bash
# Blog posting
"Post this article to my blog: [content]"
"Publish this draft to WordPress"
"Create a new blog post about AI"

# Data retrieval  
"Get my latest customer data"
"Fetch recent orders from the CRM"
"Check my analytics"

# Notifications
"Send this alert to Slack"
"Notify the team about this update"  
"Ping the webhook with this data"
```

The LLM automatically:
1. **Selects** the right integration based on your request
2. **Extracts** parameters from your message
3. **Constructs** the API call
4. **Executes** the request
5. **Parses** and presents the response

## 📝 Complete Examples

### WordPress Blog Integration

```json
{
  "id": "wordpress-blog",
  "name": "WordPress Blog",
  "description": "Create and manage WordPress blog posts via REST API", 
  "baseUrl": "https://yourblog.com/wp-json/wp/v2",
  "authentication": {
    "type": "basic",
    "usernameEnvVar": "WP_USERNAME",
    "passwordEnvVar": "WP_APP_PASSWORD"
  },
  "capabilities": [
    "create blog posts",
    "publish articles", 
    "manage content"
  ],
  "actions": [
    {
      "name": "create_post",
      "description": "Create a new blog post",
      "method": "POST", 
      "endpoint": "/posts",
      "parameters": {
        "title": {
          "type": "string",
          "required": true,
          "description": "Post title"
        },
        "content": {
          "type": "string",
          "required": true, 
          "description": "Post content (HTML)"
        },
        "status": {
          "type": "string",
          "required": false,
          "description": "Post status: draft, publish, private"
        }
      }
    }
  ]
}
```

### Slack Notifications

```json
{
  "id": "slack-webhooks",
  "name": "Slack Notifications", 
  "description": "Send messages to Slack via webhooks",
  "authentication": { "type": "none" },
  "capabilities": ["send notifications", "alert teams"],
  "actions": [
    {
      "name": "send_message",
      "description": "Send message to Slack channel",
      "method": "POST",
      "endpoint": "", 
      "parameters": {
        "webhook_url": {
          "type": "string",
          "required": true,
          "description": "Slack webhook URL"
        },
        "text": {
          "type": "string", 
          "required": true,
          "description": "Message text"
        },
        "channel": {
          "type": "string",
          "required": false,
          "description": "Channel to post to"
        }
      }
    }
  ]
}
```

### Generic REST API

```json
{
  "id": "generic-api",
  "name": "Generic REST API",
  "description": "Template for any REST API service",
  "baseUrl": "https://api.example.com",
  "authentication": {
    "type": "api_key",
    "header": "X-API-Key",
    "envVar": "API_KEY"
  },
  "actions": [
    {
      "name": "get_data", 
      "description": "Retrieve data",
      "method": "GET",
      "endpoint": "/data",
      "parameters": {
        "limit": {
          "type": "number",
          "required": false,
          "description": "Number of items to return"
        }
      }
    },
    {
      "name": "create_item",
      "description": "Create new item",
      "method": "POST", 
      "endpoint": "/items",
      "parameters": {
        "name": {
          "type": "string",
          "required": true,
          "description": "Item name"
        }
      }
    }
  ]
}
```

## 🧪 Testing Integrations

Test individual integrations:
```bash
# Test all actions
sr integration test wordpress-blog

# Test specific action
sr integration test wordpress-blog create_post

# View integration details
sr integration info wordpress-blog
```

## 🔧 CLI Commands

```bash
# Interactive wizard to create integration
sr integration add

# List all available integrations
sr integration list

# Test an integration
sr integration test <id> [action]

# Show integration details
sr integration info <id>

# Remove an integration
sr integration remove <id>

# Create example integrations
sr integration example rest     # Generic REST API
sr integration example webhook  # Webhook template
```

## 🔄 Hot Reloading

Integrations are automatically reloaded when:
- JSON files in `integrations/` change
- `integrations.json` config file is modified
- New integration files are added

No restart required! 

## 🌟 Best Practices

### 1. Descriptive Names and Descriptions
```json
{
  "name": "WordPress Blog",
  "description": "Create and manage WordPress blog posts via REST API"
}
```

Good descriptions help the LLM select the right integration.

### 2. Comprehensive Capabilities
```json
{
  "capabilities": [
    "create blog posts",
    "publish articles", 
    "schedule posts",
    "manage drafts",
    "update existing posts"
  ]
}
```

List everything the integration can do.

### 3. Clear Parameter Descriptions
```json
{
  "title": {
    "type": "string",
    "required": true, 
    "description": "Post title - will be extracted from user's message"
  }
}
```

Help the LLM understand what each parameter represents.

### 4. Meaningful Test Requests
```json
{
  "testRequest": "Create a test blog post with title 'Hello World'"
}
```

Provide realistic test examples.

### 5. Environment Variables
Always use environment variables for sensitive data:
```bash
export WP_USERNAME="your-username"
export WP_APP_PASSWORD="your-app-password"  
export SLACK_WEBHOOK_URL="https://hooks.slack.com/..."
```

## 🔍 Troubleshooting

### Integration Not Found
- Check the JSON syntax with a validator
- Ensure the file is in the right location
- Verify the integration ID is unique

### Authentication Errors
- Double-check environment variable names
- Verify the credentials are correct
- Check if the service requires specific headers

### LLM Not Selecting Integration
- Improve the description and capabilities
- Add more specific action descriptions
- Test with more explicit language

### API Calls Failing
- Verify the base URL and endpoints
- Check parameter names and types
- Test the API manually first

## 💡 Advanced Features

### Dynamic Endpoints
Use parameter substitution in endpoints:
```json
{
  "endpoint": "/posts/{id}",
  "parameters": {
    "id": {
      "type": "string",
      "required": true,
      "description": "Post ID to update"
    }
  }
}
```

### Custom Headers
Add custom headers for specific actions:
```json
{
  "actions": [
    {
      "name": "upload_file",
      "headers": {
        "Content-Type": "multipart/form-data"
      }
    }
  ]
}
```

### Response Format Hints
Help the LLM parse responses:
```json
{
  "responseFormat": "json",  // json, xml, text, html
  "actions": [
    {
      "name": "get_xml_data",
      "responseFormat": "xml"  // Override for specific action
    }
  ]
}
```

## 🚀 Getting Started

1. **Start Simple**: Begin with a basic GET endpoint
2. **Test Early**: Use `sr integration test` frequently
3. **Iterate**: Add more actions as you understand the API
4. **Use Natural Language**: Try different phrasings to see how the LLM interprets them

The Dynamic Integration System makes StaticRebel infinitely extensible. Any API, any service, any workflow - just describe it in JSON and start using natural language to interact with it!

## 📚 More Examples

Check the `integrations/` directory for more complete examples:
- WordPress blog management
- Generic REST API template  
- Webhook notifications
- And more!

---

**Ready to extend StaticRebel?** Start with `sr integration add` and make any service part of your AI assistant! 🤖✨