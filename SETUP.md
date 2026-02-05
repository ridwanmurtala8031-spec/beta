# 🚀 Coin Hunter Bot - Setup & Launch Guide

## Prerequisites

- **Node.js 18+** (for TypeScript compilation and running the bot)
- **npm** (comes with Node.js)
- **Telegram Bot Token** from [@BotFather](https://t.me/botfather)
- **AI API Key** (OpenRouter or OpenAI)
- **Solana RPC Endpoint** (optional; defaults to public mainnet)

## Environment Variables

All environment variables are configured in the `.env` file. A template is provided in `.env.example`.

### Critical Variables (Required)

1. **`TELEGRAM_BOT_TOKEN`**
   - Your Telegram Bot API token from [@BotFather](https://t.me/botfather)
   - Format: `[BOT_ID]:[BOT_TOKEN]`
   - Example: `8420990989:AAFbmZJEwUN__SDScJU2udqgi3sZHqw7-yc`

2. **`SESSION_SECRET`**
   - Master encryption key for wallet private keys
   - Must be at least 32 characters long
   - Keep this **absolutely secret** — if changed, old wallets become unreadable
   - Example: `coin-hunter-trading-bot-session-secret-min-32-chars`

### AI Integration (One Required)

Choose ONE of the following AI providers:

#### Option 1: OpenRouter (Recommended)
```
OPENROUTER_API_KEY=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
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
```

#### Option 2: OpenAI Direct
```
OPENAI_API_KEY=your-openai-api-key-here
```

#### Option 3: AI Integrations (Replit/Custom)
```
AI_INTEGRATIONS_OPENAI_API_KEY=your-customapi-key-here
AI_INTEGRATIONS_OPENAI_BASE_URL=https://your-custom-base-url/v1
```

### Optional Variables

- **`SOLANA_RPC_URL`** - Solana RPC endpoint (defaults to `https://api.mainnet-beta.solana.com`)
- **`SUPABASE_URL`** - Supabase project URL for data backup
- **`SUPABASE_ANON_KEY`** - Supabase anonymous key
- **`SUPABASE_SERVICE_ROLE_KEY`** - Supabase service role key (required for backups)
- **`DATABASE_URL`** - PostgreSQL connection string (if not using SQLite)
- **`CRYPTOPANIC_API_KEY`** - For crypto sentiment analysis (defaults to public key)
- **`NODE_ENV`** - `development` or `production` (defaults to `development`)

## Setup Instructions

### 1. Install Dependencies

```bash
cd coin-hunter-beta-finalzip-1
npm install
```

### 2. Configure Environment Variables

```bash
# Copy the template
cp .env.example .env

# Edit the .env file with your credentials
nano .env
```

Add your credentials:
- Telegram Bot Token (from [@BotFather](https://t.me/botfather))
- AI API Key (OpenRouter or OpenAI)
- SESSION_SECRET (keep it secret!)

### 3. Create Required Directories

The bot will automatically create:
- `./migrations/` - Database migration files
- `./client/dist/` - Built frontend files

## Running the Bot

### Option 1: Using Start Scripts (Recommended)

**Linux/macOS:**
```bash
chmod +x start.sh
./start.sh
```

**Windows (PowerShell):**
```powershell
.\start.ps1
```

### Option 2: Manual Start

```bash
npm run dev
```

### Option 3: Production Build

```bash
npm run build
npm start
```

## Verification Checklist

After starting the bot, verify:

✅ **Database** - Check for `local.db` in the project root
```bash
ls -la local.db
```

✅ **Telegram Connection** - Send `/start` to your bot
```
Expected: Bot responds with welcome menu
```

✅ **AI Integration** - Try `/ai Hello`
```
Expected: Bot responds with AI-generated message
```

✅ **Logs** - Check stdout for initialization messages
```
Expected messages:
  - "Telegram bot setup complete"
  - "Using SQLite (file:local.db) as primary database"
  - "SMC Worker AI initialized with OpenRouter API"
```

## API Endpoints (for Frontend)

Once running, the bot exposes these endpoints on port 5000:

- **GET** `/` - Serves the React frontend
- **GET** `/api/health` - Health check
- **Static Files** - `/assets`, `/js`, `/css` (from built React app)

## Database

### SQLite (Default)
- **File**: `./local.db`
- **ORM**: Drizzle
- **Migrations**: Auto-applied on startup
- **Backup**: Optional (see Supabase backup section)

### PostgreSQL (Optional)
Set `DATABASE_URL` environment variable to connect to PostgreSQL instead of SQLite.

## Troubleshooting

### Issue: `TELEGRAM_BOT_TOKEN is missing`
**Solution**: Add `TELEGRAM_BOT_TOKEN` to `.env` file

### Issue: `SESSION_SECRET is not set`
**Solution**: Add `SESSION_SECRET` to `.env` file (must be ≥32 characters)

### Issue: `AI Client not initialized`
**Solution**: Add one of the AI API keys (OpenRouter or OpenAI) to `.env`

### Issue: Port 5000 already in use
**Solution**: Kill the process using port 5000
```bash
# Linux/macOS
lsof -ti:5000 | xargs kill -9

# Windows
netstat -ano | findstr :5000
taskkill /PID <PID> /F
```

### Issue: Database locked
**Solution**: Ensure only one instance of the bot is running

### Issue: Wallet encryption fails
**Solution**: Verify `SESSION_SECRET` is set and consistent

## Development Commands

```bash
# Development server (auto-reload on file changes)
npm run dev

# Type checking
npm run check

# Database migrations
npm run db:push

# Build frontend
npm run build

# Production server
npm start
```

## Docker Deployment (Optional)

Create a `Dockerfile`:
```dockerfile
FROM node:20-alpine

WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .

ENV NODE_ENV=production
EXPOSE 5000

CMD ["npm", "start"]
```

Build and run:
```bash
docker build -t coinhunter-bot .
docker run -e TELEGRAM_BOT_TOKEN=xxx -e ORDER_API_KEY=yyy -p 5000:5000 coinhunter-bot
```

## Support

For issues or questions:
1. Check the logs: `npm run dev` (verbose output)
2. Review `.env.example` for all available options
3. Ensure all critical env vars are set
4. Check Node.js version: `node --version` (should be ≥18)

## Security Best Practices

⚠️ **CRITICAL**: Never commit `.env` to version control!

```bash
# Add to .gitignore (already included)
echo ".env" >> .gitignore
```

✅ Always use different credentials for different environments
✅ Rotate your SESSION_SECRET periodically
✅ Keep your TELEGRAM_BOT_TOKEN private
✅ Use strong, unique API keys
✅ Enable 2FA on all service accounts

---

**Happy trading! 🚀📈**
