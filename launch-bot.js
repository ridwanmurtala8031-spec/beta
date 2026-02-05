#!/usr/bin/env node

/**
 * Coin Hunter Bot - Launcher
 * Starts the bot with full diagnostics
 */

import fs from 'fs';
import path from 'path';
import { execSync, spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSection(title) {
  log(`\n${'═'.repeat(64)}`, 'cyan');
  log(`  ${title}`, 'cyan');
  log(`${'═'.repeat(64)}\n`, 'cyan');
}

const PROJECT_ROOT = __dirname;
const ENV_FILE = path.join(PROJECT_ROOT, '.env');

logSection('🚀 COIN HUNTER BOT LAUNCHER');

// Step 1: Check .env
log('Step 1: Checking environment configuration...', 'blue');
if (!fs.existsSync(ENV_FILE)) {
  log('❌ ERROR: .env file not found!', 'red');
  log('\nQuick fix:', 'yellow');
  log('  cp .env.example .env', 'yellow');
  log('  Edit .env and add your tokens\n', 'yellow');
  log('Required tokens:', 'yellow');
  log('  - TELEGRAM_BOT_TOKEN (from @BotFather on Telegram)', 'yellow');
  log('  - OPENROUTER_API_KEY or OPENAI_API_KEY (for AI)', 'yellow');
  log('  - SESSION_SECRET (32+ characters)\n', 'yellow');
  process.exit(1);
}

// Load and validate .env
const envContent = fs.readFileSync(ENV_FILE, 'utf-8');
const envVars = {};

envContent.split('\n').forEach(line => {
  if (!line.trim().startsWith('#') && line.includes('=')) {
    const [key, ...valueParts] = line.split('=');
    envVars[key.trim()] = valueParts.join('=').trim();
  }
});

// Validate critical vars
let valid = true;

if (!envVars['TELEGRAM_BOT_TOKEN'] || envVars['TELEGRAM_BOT_TOKEN'] === '') {
  log('❌ TELEGRAM_BOT_TOKEN is empty or missing', 'red');
  valid = false;
} else {
  log(`✅ TELEGRAM_BOT_TOKEN configured (${envVars['TELEGRAM_BOT_TOKEN'].substring(0, 25)}...)`, 'green');
}

if (!envVars['SESSION_SECRET'] || envVars['SESSION_SECRET'].length < 32) {
  log('❌ SESSION_SECRET is missing or too short (need 32+ chars)', 'red');
  valid = false;
} else {
  log(`✅ SESSION_SECRET configured (${envVars['SESSION_SECRET'].length} chars)`, 'green');
}

const hasAI = envVars['OPENROUTER_API_KEY'] || envVars['OPENAI_API_KEY'] || envVars['AI_INTEGRATIONS_OPENAI_API_KEY'];
if (!hasAI) {
  log('⚠️  WARNING: No AI API key found - AI features disabled', 'yellow');
} else {
  const provider = envVars['OPENROUTER_API_KEY'] ? 'OpenRouter' : envVars['OPENAI_API_KEY'] ? 'OpenAI' : 'Custom';
  log(`✅ AI Provider: ${provider}`, 'green');
}

if (!valid) {
  log('\n❌ Configuration incomplete. Please fix the errors above.', 'red');
  process.exit(1);
}

// Step 2: Check Node.js
log('\nStep 2: Checking Node.js...', 'blue');
try {
  const nodeVersion = execSync('node --version', { encoding: 'utf-8' }).trim();
  const nodeNum = parseInt(nodeVersion.match(/\d+/)[0]);
  if (nodeNum < 18) {
    log(`❌ Node.js ${nodeVersion} is too old (need 18+)`, 'red');
    process.exit(1);
  }
  log(`✅ Node.js ${nodeVersion}`, 'green');
} catch (e) {
  log('❌ Node.js not found. Install from https://nodejs.org/', 'red');
  process.exit(1);
}

// Step 3: Install dependencies
log('\nStep 3: Checking dependencies...', 'blue');
if (!fs.existsSync(path.join(PROJECT_ROOT, 'node_modules'))) {
  log('📦 Installing npm packages (this may take 2-3 minutes)...', 'yellow');
  try {
    execSync('npm install', {
      cwd: PROJECT_ROOT,
      stdio: 'inherit'
    });
    log('✅ Dependencies installed', 'green');
  } catch (e) {
    log('❌ Failed to install dependencies', 'red');
    log('Try manually: npm install', 'yellow');
    process.exit(1);
  }
} else {
  log('✅ Dependencies already installed', 'green');
}

// Step 4: Check port
log('\nStep 4: Checking port 5000...', 'blue');
try {
  execSync('lsof -ti:5000 2>/dev/null', { stdio: 'ignore' });
  log('⚠️  Port 5000 is already in use', 'yellow');
  log('   Kill it with: lsof -ti:5000 | xargs kill -9', 'yellow');
  process.exit(1);
} catch (e) {
  log('✅ Port 5000 is available', 'green');
}

// Step 5: Start bot
logSection('✅ All checks passed! Starting bot...');

log('Bot is running on http://localhost:5000', 'green');
log('Send commands to your Telegram bot:', 'cyan');
log('  /start     - Open main menu', 'cyan');
log('  /help      - Show help', 'cyan');
log('  /ai hello  - Test AI\n', 'cyan');

log('Press Ctrl+C to stop\n', 'yellow');

try {
  // Set environment variables from .env file
  process.env.NODE_ENV = envVars['NODE_ENV'] || 'development';
  Object.keys(envVars).forEach(key => {
    process.env[key] = envVars[key];
  });

  // Start the bot
  const result = spawnSync('npm', ['run', 'dev'], {
    cwd: PROJECT_ROOT,
    stdio: 'inherit',
    shell: true
  });

  process.exit(result.status || 0);
} catch (e) {
  log(`\n❌ Error starting bot: ${e.message}`, 'red');
  process.exit(1);
}

