#!/bin/bash
set -a
source /workspaces/Coinhunter/coin-hunter-beta-finalzip-1/.env
set +a

cd /workspaces/Coinhunter/coin-hunter-beta-finalzip-1

echo "═══════════════════════════════════════════════════════════════"
echo "🚀 Coin Hunter Bot - Telegram SMC Trading Terminal"
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo "🔐 Configuration:"
echo "   Bot Token: ${TELEGRAM_BOT_TOKEN:0:25}..."
echo "   AI Provider: OpenRouter"
echo "   Solana RPC: $SOLANA_RPC_URL"
echo "   Environment: $NODE_ENV"
echo ""
echo "📦 Installing/Verifying dependencies..."

npm install --silent 2>&1 | tail -5

echo ""
echo "🟢 Starting Bot Server..."
echo "   Port: 5000"
echo "   Telegram Bot: Ready for commands"
echo ""
echo "═══════════════════════════════════════════════════════════════"
echo ""

npm run dev
