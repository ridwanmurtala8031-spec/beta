# Set environment variables for Windows PowerShell
$envFile = ".env"

if (Test-Path $envFile) {
    Write-Host "✅ Loading environment variables from .env" -ForegroundColor Green
    Get-Content $envFile | ForEach-Object {
        if ($_ -notmatch '^\s*#' -and $_.Trim() -ne '') {
            $key, $value = $_ -split '=', 2
            $key = $key.Trim()
            $value = $value.Trim()
            if ($key -and $value) {
                [Environment]::SetEnvironmentVariable($key, $value, "Process")
            }
        }
    }
} else {
    Write-Host "⚠️  Warning: .env file not found. Please create it using .env.example as a template." -ForegroundColor Yellow
    exit 1
}

# Check critical environment variables
if (-not $env:TELEGRAM_BOT_TOKEN) {
    Write-Host "❌ Error: TELEGRAM_BOT_TOKEN is not set" -ForegroundColor Red
    exit 1
}

if (-not $env:SESSION_SECRET) {
    Write-Host "❌ Error: SESSION_SECRET is not set" -ForegroundColor Red
    exit 1
}

if (-not $env:OPENROUTER_API_KEY -and -not $env:OPENAI_API_KEY -and -not $env:AI_INTEGRATIONS_OPENAI_API_KEY) {
    Write-Host "⚠️  Warning: No AI API key found. AI features will be disabled." -ForegroundColor Yellow
}

Write-Host "🚀 Starting Coin Hunter Bot..." -ForegroundColor Green
Write-Host ""
Write-Host "Configuration:" -ForegroundColor Cyan
Write-Host "  - Telegram Bot Token: $($env:TELEGRAM_BOT_TOKEN.Substring(0, 20))..."
Write-Host "  - AI Provider: $(if ($env:OPENROUTER_API_KEY) { 'OpenRouter' } else { 'OpenAI/Custom' })"
Write-Host "  - Solana RPC: $($env:SOLANA_RPC_URL)"
Write-Host ""

# Install dependencies if needed
if (-not (Test-Path "node_modules")) {
    Write-Host "📦 Installing dependencies..." -ForegroundColor Yellow
    npm install
}

# Start the development server
Write-Host "Starting server on port 5000..." -ForegroundColor Green
npm run dev
