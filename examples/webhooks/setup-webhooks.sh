#!/bin/bash

# StaticRebel Webhook Setup Script
# Quick setup for common webhook integrations

set -e

echo "🎣 StaticRebel Webhook Setup"
echo "============================"
echo ""

# Check if StaticRebel is available
if ! command -v sr &> /dev/null; then
    echo "❌ StaticRebel CLI not found. Please install StaticRebel first."
    echo "   Add 'sr' to your PATH or use: node enhanced.js"
    exit 1
fi

echo "✅ StaticRebel CLI found"
echo ""

# Function to add webhook
add_webhook() {
    local name="$1"
    local url="$2" 
    local event="$3"
    local secret="$4"
    
    echo "Adding webhook: $name"
    
    if [[ -n "$secret" ]]; then
        sr webhook add --name "$name" --url "$url" --event "$event" --secret "$secret"
    else
        sr webhook add --name "$name" --url "$url" --event "$event"
    fi
    
    echo "✅ Added: $name"
    echo ""
}

echo "Choose your webhook integration:"
echo ""
echo "1) Slack - Journal entry notifications"
echo "2) Discord - Streak milestone celebrations" 
echo "3) Zapier - Goal completion automation"
echo "4) IFTTT - Smart home triggers"
echo "5) Custom webhook"
echo "0) Exit"
echo ""

read -p "Enter your choice (0-5): " choice

case $choice in
    1)
        echo ""
        echo "🎯 Slack Integration Setup"
        echo "------------------------"
        echo "1. Go to your Slack workspace settings"
        echo "2. Navigate to Apps > Incoming Webhooks"
        echo "3. Click 'Add to Slack' and select a channel"
        echo "4. Copy the webhook URL"
        echo ""
        read -p "Enter your Slack webhook URL: " slack_url
        
        if [[ "$slack_url" =~ ^https?:// ]]; then
            add_webhook "Slack Journal Notifications" "$slack_url" "entry_logged"
        else
            echo "❌ Invalid URL format"
        fi
        ;;
        
    2)
        echo ""
        echo "🎮 Discord Integration Setup"
        echo "---------------------------"
        echo "1. Go to your Discord server settings"
        echo "2. Navigate to Integrations > Webhooks"
        echo "3. Click 'Create Webhook'"
        echo "4. Choose channel and copy the webhook URL"
        echo ""
        read -p "Enter your Discord webhook URL: " discord_url
        
        if [[ "$discord_url" =~ ^https?:// ]]; then
            add_webhook "Discord Streak Celebrations" "$discord_url" "streak_milestone"
        else
            echo "❌ Invalid URL format"
        fi
        ;;
        
    *)
        echo "❌ Invalid choice or feature not yet implemented in this simplified setup script."
        echo ""
        echo "Use the CLI directly:"
        echo "  sr webhook add --name \"My Webhook\" --url \"https://...\" --event \"entry_logged\""
        ;;
esac

echo ""
echo "🎉 Setup complete! Use 'sr webhook help' for more options."