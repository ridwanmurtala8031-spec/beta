# 🔧 Troubleshooting Guide - Coin Hunter Bot

## Quick Diagnostics

Run this to check your setup:

```bash
node diagnose.js
```

This will check:
- ✅ .env file
- ✅ Node.js version
- ✅ npm installation
- ✅ Environment variables
- ✅ Dependencies
- ✅ Port availability

---

## Common Issues & Solutions

### ❌ "Error: TELEGRAM_BOT_TOKEN is missing"

**Symptoms:**
```
CRITICAL: TELEGRAM_BOT_TOKEN is not set
```

**Solution:**
1. Open `.env` file
2. Add your bot token from [BotFather](https://t.me/botfather):
   ```
   TELEGRAM_BOT_TOKEN=8045411808:AAHWzrFrEUUWJvgPycoKM0u4XRuH_Uq5Fd8
   ```
3. Save and restart

**Get a Bot Token:**
- Go to Telegram and message [@BotFather](https://t.me/botfather)
- Send `/newbot`
- Follow the prompts to create your bot
- Copy the token provided

---

### ❌ "Error: SESSION_SECRET is not set"

**Symptoms:**
```
[security] CRITICAL: SESSION_SECRET is not set
Wallet encryption will fail!
```

**Solution:**
1. Open `.env` file
2. Add SESSION_SECRET (must be 32+ characters):
   ```
   SESSION_SECRET=my-secret-key-that-is-at-least-32-characters-long
   ```
3. Save and restart

**⚠️ IMPORTANT:**
- Keep this secret! Never share it.
- If you change it, old wallets become unreadable
- Use the same SESSION_SECRET across deployments

---

### ❌ "Error: AI Client not initialized"

**Symptoms:**
```
AI reasoning error: AI Client not initialized
```

**Solution:**
Add ONE of these AI API keys to `.env`:

**Option 1: OpenRouter (Recommended)**
```
OPENROUTER_API_KEY=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
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
```

**Option 2: OpenAI Direct**
```
OPENAI_API_KEY=sk-proj-your-key-here
```

**Option 3: Custom/Replit**
```
AI_INTEGRATIONS_OPENAI_API_KEY=your-key-here
AI_INTEGRATIONS_OPENAI_BASE_URL=https://your-custom-url/v1
```

Then restart the bot.

---

### ❌ "Error: Port 5000 already in use"

**Symptoms:**
```
Error: listen EADDRINUSE: address already in use :::5000
```

**Solution:**

**Linux/macOS:**
```bash
# Find process using port 5000
lsof -i :5000

# Kill it
lsof -ti:5000 | xargs kill -9
```

**Windows:**
```bash
# Find process
netstat -ano | findstr :5000

# Kill it (replace PID with the number from above)
taskkill /PID <PID> /F
```

Then restart the bot.

---

### ❌ "npm: command not found"

**Symptoms:**
```
-bash: npm: command not found
```

**Solution:**
1. Install Node.js from [nodejs.org](https://nodejs.org/)
2. Verify installation: `node --version` (should be 18+)
3. Verify npm: `npm --version`
4. Try again

---

### ❌ "Node version too old"

**Symptoms:**
```
Node.js v16.x.x is too old (need 18+)
```

**Solution:**
1. Update Node.js from [nodejs.org](https://nodejs.org/)
2. Verify: `node --version` (should show v18 or higher)
3. Try again

---

### ❌ "Cannot find module 'express'"

**Symptoms:**
```
Error: Cannot find module 'express'
at Module._load...
```

**Solution:**
Install dependencies:
```bash
npm install
```

This happens if:
- `node_modules` is missing
- Dependencies weren't installed properly

---

### ❌ "Error: ENOENT: no such file or directory, open '.env'"

**Symptoms:**
```
Error: ENOENT: no such file or directory, open '.env'
```

**Solution:**
1. Copy template: `cp .env.example .env`
2. Edit `.env` with your credentials
3. Save and try again

---

### ❌ "Error: TypeScript compilation failed"

**Symptoms:**
```
error TS2307: Cannot find module '...'
```

**Solution:**
1. Verify all imports are correct
2. Run: `npm run check` to see all errors
3. Ensure `node_modules` is installed: `npm install`
4. Restart: `npm run dev`

---

### ❌ "Database locked" or "SQLITE_IOERR"

**Symptoms:**
```
Error: database is locked
or
SQLITE_IOERR error
```

**Solution:**
1. Ensure only ONE bot instance is running
2. Check for stuck processes: `ps aux | grep tsx`
3. Kill stray processes: `pkill -f "tsx server/index.ts"`
4. Delete `local.db` if corrupted: `rm local.db`
5. Restart the bot

---

### ❌ ".env file is empty/blank"

**Symptoms:**
Bot starts but accepts no commands, or crashes immediately

**Solution:**
1. Make sure `.env` has content (not empty)
2. Use `.env.example` as template: `cp .env.example .env`
3. Add your actual credentials
4. Verify file is readable: `cat .env`

---

### ⚠️ "warnings about deprecated packages"

**Symptoms:**
```
npm WARN deprecated ...
```

**Solution:**
These are usually safe during development. Proceed normally:
```bash
npm install  # finish normally
npm run dev  # start bot
```

---

## Detailed Startup Process

If the launcher doesn't work, try step-by-step:

```bash
# 1. Navigate to project
cd coin-hunter-beta-finalzip-1

# 2. Copy config template
cp .env.example .env

# 3. Edit with your tokens
nano .env
# OR
code .env

# 4. Install dependencies
npm install

# 5. Verify setup
node diagnose.js

# 6. Start bot
npm run dev
```

---

## Expected Logs on Startup

When the bot starts correctly, you should see:

```
╔════════════════════════════════════════════════════════════════╗
║                    COIN HUNTER BOT LAUNCHER                   ║
╚════════════════════════════════════════════════════════════════╝

Step 1: Checking environment configuration...
✅ TELEGRAM_BOT_TOKEN configured (8045411808:...)
✅ SESSION_SECRET configured (37 chars)
✅ AI Provider: OpenRouter

Step 2: Checking Node.js...
✅ Node.js v20.x.x

Step 3: Checking dependencies...
✅ Dependencies already installed

Step 4: Checking port 5000...
✅ Port 5000 is available

═══════════════════════════════════════════════════════════════════
  ✅ All checks passed! Starting bot...
═══════════════════════════════════════════════════════════════════

[TIME] [express] serving on port 5000
[TIME] [telegram] Initializing Telegram bot...
[TIME] [telegram] Telegram bot setup complete
[TIME] [db] Using SQLite (file:local.db) as primary database
[TIME] [db] Migrations complete
```

---

## Testing Bot Connection

Once started, send messages to your Telegram bot:

```
/start        → Should show welcome menu
/help         → Should show command list
/ai hello     → AI should respond
```

---

## Still Having Issues?

Please provide:
1. Your OS (Windows, macOS, Linux)
2. Node.js version: `node --version`
3. The exact error message
4. Steps you took before the error

Then run:
```bash
node diagnose.js 2>&1 > diagnostic-report.txt
```

And share the contents of `diagnostic-report.txt`.

---

## Support Resources

- **Telegram Bot Help**: [@BotFather](https://t.me/botfather)
- **Node.js Issues**: [nodejs.org](https://nodejs.org/)
- **npm Help**: `npm help` or [npmjs.com](https://www.npmjs.com/)
- **This Project**: Check `SETUP.md` and `QUICKSTART.md`

---

**Last Resort**: Delete everything and fresh start:
```bash
rm -rf node_modules local.db .env
npm install
cp .env.example .env
# Edit .env with your tokens
npm run dev
```

Good luck! 🚀
