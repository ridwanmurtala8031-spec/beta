# 🚀 Coin Hunter Bot

**Telegram-based SMC Trading Terminal for Solana**

## Quick Start (3 Steps)

### 1️⃣ Configure
```bash
cp .env.example .env
# Edit .env and add your tokens
```

### 2️⃣ Install
```bash
npm install
```

### 3️⃣ Start
```bash
node launch-bot.js
# OR
npm run dev
```

---

## 📋 Need Help?

- **Getting Started**: See [QUICKSTART.md](QUICKSTART.md)
- **Full Setup**: See [SETUP.md](SETUP.md)
- **Issues?**: See [TROUBLESHOOTING.md](TROUBLESHOOTING.md)
- **Run Diagnostics**: `node diagnose.js`

---

## 🔐 Environment Variables

```env
TELEGRAM_BOT_TOKEN=your-bot-token
OPENROUTER_API_KEY=your-ai-key
SESSION_SECRET=your-32-char-secret
```

---

## 📦 Tech Stack

- **Backend**: Node.js + Express + TypeScript
- **Database**: SQLite + Drizzle ORM
- **AI**: OpenRouter / OpenAI
- **Blockchain**: Solana Web3.js + Jupiter DEX
- **Bot**: Telegram Bot API

---

## 🎯 Core Features

- ✅ SMC (Smart Money Concepts) signal generation
- ✅ Multi-timeframe technical analysis  
- ✅ AI-powered market insights
- ✅ Solana token trading via Jupiter
- ✅ Wallet management & encryption
- ✅ Telegram bot interface
- ✅ Signal distribution to groups/topics

---

## 📁 Structure

```
├── server/          # Backend services
├── shared/          # Database schema
├── client/          # React frontend (optional)
├── .env             # Your secrets (never commit!)
├── package.json     # Dependencies
└── local.db         # SQLite database
```

---

## 🚨 Troubleshooting

**Error starting?**
```bash
node diagnose.js
```

**Can't find .env?**
```bash
cp .env.example .env
```

**Port 5000 in use?**
```bash
lsof -ti:5000 | xargs kill -9
```

**More help?** → See [TROUBLESHOOTING.md](TROUBLESHOOTING.md)

---

## 📖 Documentation

| File | Purpose |
|------|---------|
| [QUICKSTART.md](QUICKSTART.md) | 3-step quick start |
| [SETUP.md](SETUP.md) | Complete setup guide |
| [TROUBLESHOOTING.md](TROUBLESHOOTING.md) | Common issues & fixes |

---

## ⚠️ Security

- Never commit `.env` to Git
- Keep `SESSION_SECRET` secret
- Use strong, unique API keys
- Change `SESSION_SECRET` carefully (breaks old wallets)

---

## 🤔 What's Not Working?

If the bot isn't starting, run diagnostics:

```bash
node diagnose.js
```

This checks:
- ✅ Environment variables
- ✅ Node.js version
- ✅ Dependencies installed
- ✅ Port availability
- ✅ Configuration

---

## 📞 Need Support?

1. Run `node diagnose.js` and share the output
2. Check [TROUBLESHOOTING.md](TROUBLESHOOTING.md)
3. Verify all environment variables are set
4. Ensure Node.js 18+ is installed

---

**Happy trading!** 📈🚀
