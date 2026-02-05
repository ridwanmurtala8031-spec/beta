#!/bin/bash

# Load environment variables from .env file
if [ -f .env ]; then
  export $(cat .env | grep -v '^#' | xargs)
  echo "✅ Environment variables loaded from .env"
else
  echo "⚠️  Warning: .env file not found. Please create it using .env.example as a template."
  exit 1
fi

# Check critical environment variables
if [ -z "$TELEGRAM_BOT_TOKEN" ]; then
  echo "❌ Error: TELEGRAM_BOT_TOKEN is not set"
  exit 1
fi

if [ -z "$SESSION_SECRET" ]; then
  echo "❌ Error: SESSION_SECRET is not set"
  exit 1
fi

if [ -z "$OPENROUTER_API_KEY" ] && [ -z "$OPENAI_API_KEY" ] && [ -z "$AI_INTEGRATIONS_OPENAI_API_KEY" ]; then
  echo "⚠️  Warning: No AI API key found. AI features will be disabled."
fi

echo "🚀 Starting Coin Hunter Bot..."
echo ""
echo "Configuration:"
echo "  - Telegram Bot Token: ${TELEGRAM_BOT_TOKEN:0:20}..."
echo "  - AI Provider: $([ -n "$OPENROUTER_API_KEY" ] && echo 'OpenRouter' || echo 'OpenAI/Custom')"
echo "  - Solana RPC: $SOLANA_RPC_URL"
echo ""

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
  echo "📦 Installing dependencies..."
  npm install
fi

# Start the development server
echo "Starting server on port 5000..."
npm run dev
