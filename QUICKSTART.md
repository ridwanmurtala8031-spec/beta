# 🚀 Coin Hunter Bot - Quick Start

## ⚡ Get Started in 3 Steps

### Step 1: Configure Environment Variables

```bash
# Copy example config
cp .env.example .env

# Edit .env with your credentials
nano .env
# OR
code .env
```

**Required Variables:**
```env
TELEGRAM_BOT_TOKEN=your_bot_token_here
SESSION_SECRET=your_secret_key_min_32_chars
OPENROUTER_API_KEY=your_ai_key_here
```

### Step 2: Install Dependencies

```bash
npm install
```

### Step 3: Start the Bot

**Option A - Using Launch Script (Recommended):**
```bash
node launch-bot.js
```

**Option B - Using npm:**
```bash
npm run dev
```

**Option C - Using Shell Script (Linux/macOS):**
```bash
chmod +x start.sh
./start.sh
```

---

## 📋 Configuration Checklist

- [ ] Created `.env` file from `.env.example`
- [ ] Set `TELEGRAM_BOT_TOKEN` (from @BotFather)
- [ ] Set `SESSION_SECRET` (32+ characters)
- [ ] Set `OPENROUTER_API_KEY` or `OPENAI_API_KEY`
- [ ] Reviewed `SOLANA_RPC_URL` (optional, defaults to mainnet)

---

## ✅ Verify Bot is Running

Once started, the bot will:

1. **Initialize Database**
   - Creates/updates SQLite database (`local.db`)
   - Runs migrations automatically

2. **Connect Telegram**
   - Bot starts polling for messages
   - Ready to receive commands

3. **Load AI**
   - Initializes OpenRouter/OpenAI client
   - Ready for market analysis

### Test Commands

Send these to your bot on Telegram:

```
/start           → Shows main menu
/help            → Shows command guide
/bind crypto     → Bind to crypto signals
/ai Hello        → Test AI integration
```

---

## 🎯 Available Commands

| Command | Purpose |
|---------|---------|
| `/start` | Open main trading dashboard |
| `/help` | Show command guide |
| `/menu` | Back to main menu |
| `/bind [market]` | Bind group to signals (crypto/forex/ai) |
| `/unbind [market]` | Unbind from signals |
| `/ai [query]` | Ask AI specialist |
| `/analyze [pair]` | Deep institutional analysis |
| `/setup [pair]` | Find neutral setup |
| `/settings` | Configure preferences |
| `/history` | View trade history |
| `/withdraw` | Withdraw SOL |

---

## 📁 Project Structure

```
coin-hunter-beta-finalzip-1/
├── server/                 # Backend (Node.js + Express)
│   ├── index.ts           # Main server entry point
│   ├── telegram.ts        # Telegram bot commands
│   ├── signals-worker.ts  # Signal generation engine
│   ├── solana.ts          # Jupiter DEX integration
│   ├── storage.ts         # Database layer
│   ├── ai.ts              # AI analysis
│   └── price-service.ts   # Price fetching
├── shared/
│   └── schema.ts          # Database schema (Drizzle ORM)
├── client/                # React frontend
│   └── src/
├── .env                   # Environment variables (SECRET!)
├── package.json           # Dependencies
├── tsconfig.json          # TypeScript config
└── vite.config.ts         # Vite build config
```

---

## 🔧 Development Commands

```bash
# Development (auto-reload)
npm run dev

# Type checking
npm run check

# Build frontend
npm run build

# Database migrations
npm run db:push

# Production server
npm start
```

---

## 🐛 Troubleshooting

### "TELEGRAM_BOT_TOKEN is missing"
→ Add token to `.env` file from [@BotFather](https://t.me/botfather)

### "SESSION_SECRET is not set"
→ Add a secret string (32+ chars) to `.env`

### "AI Client not initialized"
→ Add OpenRouter or OpenAI API key to `.env`

### "Port 5000 already in use"
```bash
# Kill process on port 5000
lsof -ti:5000 | xargs kill -9  # macOS/Linux
netstat -ano | findstr :5000    # Windows
```

### "Database locked"
→ Ensure only one bot instance is running

---

## 📚 Full Documentation

See `SETUP.md` for complete setup guide with:
- All environment variables explained
- Security best practices
- Database configuration
- Deployment options
- Support & troubleshooting

---

## 🚦 Status Indicators

When running, watch for these logs:

```
✅ Telegram bot setup complete
✅ Using SQLite (file:local.db) as primary database
✅ SMC Worker AI initialized with OpenRouter API
✅ serving on port 5000
```

---

## 🎨 Default Ports

| Service | Port |
|---------|------|
| Bot Server | 5000 |
| Frontend | 3000 (dev) |
| Database | local.db |

---

## 💡 Tips

- **Never share your `.env` file** - it contains secrets!
- **Keep SESSION_SECRET safe** - changing it breaks wallet encryption
- **Use `.env.example` as template** for new deployments
- **Check logs regularly** for errors and warnings
- **Monitor port 5000** to ensure bot is responding

---

**Ready to trade? Send `/start` to your Telegram bot! 📈🚀**

For more help: See `SETUP.md` or check the logs during startup.
