#!/usr/bin/env node

/**
 * Coin Hunter Bot - Diagnostic Tool
 * Identifies common configuration and setup issues
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
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

function check(condition, successMsg, errorMsg) {
  if (condition) {
    log(`✅ ${successMsg}`, 'green');
    return true;
  } else {
    log(`❌ ${errorMsg}`, 'red');
    return false;
  }
}

async function runDiagnostics() {
  log(`
╔════════════════════════════════════════════════════════════════╗
║                    DIAGNOSTIC REPORT                          ║
║              Coin Hunter Bot Configuration Check              ║
╚════════════════════════════════════════════════════════════════╝
`, 'cyan');

  let allChecks = true;

  // 1. Check .env file
  log('\n📋 Configuration Files', 'blue');
  const envExists = check(
    fs.existsSync('.env'),
    '.env file exists',
    '.env file NOT found - Create it from .env.example'
  );
  allChecks = allChecks && envExists;

  check(
    fs.existsSync('.env.example'),
    '.env.example template exists',
    '.env.example NOT found'
  );

  // 2. Check package files
  log('\n📦 Project Files', 'blue');
  const packageJsonExists = check(
    fs.existsSync('package.json'),
    'package.json exists',
    'package.json NOT found'
  );
  allChecks = allChecks && packageJsonExists;

  check(
    fs.existsSync('tsconfig.json'),
    'tsconfig.json exists',
    'tsconfig.json NOT found'
  );

  check(
    fs.existsSync('server/index.ts'),
    'server/index.ts exists',
    'server/index.ts NOT found'
  );

  check(
    fs.existsSync('shared/schema.ts'),
    'shared/schema.ts exists',
    'shared/schema.ts NOT found'
  );

  // 3. Check Node.js
  log('\n🔧 Node.js Environment', 'blue');
  try {
    const nodeVersion = execSync('node --version', { encoding: 'utf-8' }).trim();
    const nodeVersionNum = parseInt(nodeVersion.match(/\d+/)[0]);
    check(
      nodeVersionNum >= 18,
      `Node.js version: ${nodeVersion} (required: 18+)`,
      `Node.js version too old: ${nodeVersion} (required: 18+)`
    );
  } catch (e) {
    log('❌ Node.js not found', 'red');
    allChecks = false;
  }

  try {
    const npmVersion = execSync('npm --version', { encoding: 'utf-8' }).trim();
    check(
      true,
      `npm version: ${npmVersion}`,
      'npm NOT found'
    );
  } catch (e) {
    log('❌ npm not found', 'red');
    allChecks = false;
  }

  // 4. Check environment variables
  log('\n🔐 Environment Variables', 'blue');
  
  const envContent = fs.readFileSync('.env', 'utf-8');
  const envVars = {};
  
  envContent.split('\n').forEach(line => {
    if (!line.trim().startsWith('#') && line.includes('=')) {
      const [key, ...valueParts] = line.split('=');
      envVars[key.trim()] = valueParts.join('=').trim();
    }
  });

  const botTokenExists = check(
    envVars['TELEGRAM_BOT_TOKEN'] && envVars['TELEGRAM_BOT_TOKEN'].length > 0,
    `TELEGRAM_BOT_TOKEN set (${envVars['TELEGRAM_BOT_TOKEN']?.substring(0, 20)}...)`,
    'TELEGRAM_BOT_TOKEN NOT set or empty'
  );
  allChecks = allChecks && botTokenExists;

  const sessionSecretExists = check(
    envVars['SESSION_SECRET'] && envVars['SESSION_SECRET'].length >= 32,
    `SESSION_SECRET set (length: ${envVars['SESSION_SECRET']?.length})`,
    'SESSION_SECRET NOT set or too short (min 32 chars)'
  );
  allChecks = allChecks && sessionSecretExists;

  const aiKeyExists = check(
    envVars['OPENROUTER_API_KEY'] || envVars['OPENAI_API_KEY'] || envVars['AI_INTEGRATIONS_OPENAI_API_KEY'],
    `AI API Key found (${envVars['OPENROUTER_API_KEY'] ? 'OpenRouter' : envVars['OPENAI_API_KEY'] ? 'OpenAI' : 'Custom'})`,
    'No AI API key found (OPENROUTER_API_KEY, OPENAI_API_KEY, or AI_INTEGRATIONS_OPENAI_API_KEY)'
  );

  check(
    envVars['SOLANA_RPC_URL'] && envVars['SOLANA_RPC_URL'].length > 0,
    `SOLANA_RPC_URL set (${envVars['SOLANA_RPC_URL']?.substring(0, 30)}...)`,
    'SOLANA_RPC_URL not set (will use defaults)'
  );

  // 5. Check dependencies
  log('\n📚 Dependencies', 'blue');
  const nodeModulesExists = check(
    fs.existsSync('node_modules'),
    'node_modules directory exists',
    'node_modules directory NOT found - Run: npm install'
  );

  if (!nodeModulesExists) {
    log('\n⚠️  Installing dependencies...', 'yellow');
    try {
      execSync('npm install --silent', { stdio: 'inherit' });
      log('✅ Dependencies installed', 'green');
    } catch (e) {
      log('❌ Failed to install dependencies', 'red');
      allChecks = false;
    }
  }

  // 6. Check database
  log('\n🗄️  Database', 'blue');
  check(
    fs.existsSync('local.db'),
    'SQLite database exists (local.db)',
    'SQLite database NOT found (will be created on first run)'
  );

  check(
    fs.existsSync('migrations') || !fs.existsSync('local.db'),
    'Migrations directory exists or DB is new',
    'Migrations missing'
  );

  // 7. Port check
  log('\n🔌 Network', 'blue');
  try {
    execSync('lsof -i :5000', { stdio: 'ignore' });
    log('⚠️  Port 5000 is already in use', 'yellow');
  } catch (e) {
    log('✅ Port 5000 is available', 'green');
  }

  // 8. Summary
  log('\n' + '═'.repeat(64), 'cyan');
  
  if (allChecks) {
    log('✅ All checks passed! You can start the bot with:', 'green');
    log('\n   node launch-bot.js', 'cyan');
    log('   OR', 'cyan');
    log('   npm run dev\n', 'cyan');
  } else {
    log('❌ Some checks failed. Please fix the issues above.', 'red');
    log('\nCommon fixes:', 'yellow');
    log('  1. Create .env file: cp .env.example .env', 'yellow');
    log('  2. Edit .env with your tokens', 'yellow');
    log('  3. Install dependencies: npm install', 'yellow');
    log('  4. Check Node.js version: node --version (need 18+)\n', 'yellow');
  }

  log('═'.repeat(64) + '\n', 'cyan');
  process.exit(allChecks ? 0 : 1);
}

runDiagnostics().catch(err => {
  log(`\n❌ Diagnostic error: ${err.message}`, 'red');
  process.exit(1);
});
