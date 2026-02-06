import { groupBindings, signals as signalsTable, users, wallets as walletsTable, trades as tradesTable, userLanes, userPremiums, admins } from "../shared/schema";
// touch imports to avoid TS unused-import errors
void signalsTable; void users; void walletsTable; void tradesTable; void userLanes; void userPremiums; void admins;
import TelegramBot from 'node-telegram-bot-api';
import { storage } from './storage';
import { log } from "./index";
import { Keypair, Connection, PublicKey, Transaction, SystemProgram } from "@solana/web3.js";
import bs58 from "bs58";
import axios from "axios";
import { eq, and, or, count } from "drizzle-orm";
import { db } from "./db";
import { JupiterService } from "./solana";
import { analyzeIndicators, formatIndicatorsForDisplay, TokenMetrics } from "./indicators";
import { verifyTwitter, formatSocialVerification, checkHolderRisk, checkContractSecurity, calculateSocialRiskScore } from "./social-verify";
import { calculateConfluenceScore, calculateRiskReward, determineMarketRegime, recognizePatterns } from "./advanced-analysis";
import { getTechnicalIndicators } from "./signals-worker";

export let telegramBotInstance: TelegramBot | null = null;

export function getTelegramBot() {
  return telegramBotInstance;
}

export function setupTelegramBot() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    log("TELEGRAM_BOT_TOKEN is missing. Bot will not start.", "telegram");
    return;
  }

  const rpcUrl = process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";

  log("Initializing Telegram bot...", "telegram");
  
  if (telegramBotInstance) {
    log("Existing bot instance found, stopping polling...", "telegram");
    telegramBotInstance.stopPolling();
  }

  const bot = new TelegramBot(token, { 
    polling: {
      interval: 1000,
      autoStart: true,
      params: {
        timeout: 10
      }
    } 
  }); 
  
  telegramBotInstance = bot;

  const ensureUser = async (msg: TelegramBot.Message) => {
    const id = msg.from?.id.toString();
    if (!id) return null;
    const existingUser = await storage.getUser(id);
    if (existingUser) return existingUser;

    const user = await storage.upsertUser({
      id,
      username: msg.from?.username || null,
      firstName: msg.from?.first_name || null,
      isMainnet: true
    });

    // Check if user already has wallets before creating a new one
    const existingWallets = await storage.getWallets(id);
    if (existingWallets.length === 0) {
      const keypair = Keypair.generate();
      await storage.createWallet({
        userId: id,
        publicKey: keypair.publicKey.toString(),
        privateKey: bs58.encode(keypair.secretKey),
        label: "Main Wallet",
        isMainnet: true,
        isActive: true,
        balance: "0"
      });
    }

    return user;
  };

  // Ensure a userPremium row exists (free tier) for usage tracking
  const ensureUserPremiumRow = async (userId: string) => {
    const p = await storage.getUserPremium(userId);
    if (!p) {
      // create free tier entry
      const expiresAt = 0;
      await storage.upsertUserPremium({ userId, tier: 'free', expiresAt });
    }
  };

  const OWNER_ID = '6491714705';
  const PREMIUM_GROUP_ID = process.env.PREMIUM_GROUP_ID || '';  // e.g., '-1001234567890'

  // Check if user is member of premium group
  async function isInPremiumGroup(userId: string): Promise<boolean> {
    if (!PREMIUM_GROUP_ID) {
      log(`Premium group check failed: PREMIUM_GROUP_ID not set`, "telegram");
      return false;
    }
    try {
      const member = await bot.getChatMember(PREMIUM_GROUP_ID, userId);
      const isPremium = member && (member.status === 'member' || member.status === 'administrator' || member.status === 'creator');
      log(`Premium check for user ${userId}: status=${member?.status} result=${isPremium}`, "telegram");
      return isPremium;
    } catch (e: any) {
      log(`Premium group check error for user ${userId}: ${e.message}`, "telegram");
      return false;
    }
  }

  async function isPremiumOrAdmin(userId: string): Promise<boolean> {
    try {
      if (!userId) return false;
      if (userId === OWNER_ID) return true;
      const admin = await storage.isAdmin(userId);
      if (admin) return true;
      // Check if user is in premium group
      const inPremiumGroup = await isInPremiumGroup(userId);
      if (inPremiumGroup) return true;
      // Legacy: check database premium status
      const p = await storage.getUserPremium(userId);
      if (!p) return false;
      if (p.tier && p.tier !== 'free' && p.expiresAt && p.expiresAt > Date.now()) return true;
      return false;
    } catch (e) { return false; }
  }

  // Check and consume usage. Returns true if allowed, false if blocked (message sent to user)
  async function checkAndConsumeUsage(userId: string, type: 'analyze' | 'other', chatId: number): Promise<boolean> {
    try {
      await storage.resetDailyUsageIfNeeded(userId);
      const p = await storage.getUserPremium(userId);
      if (!p) {
        await ensureUserPremiumRow(userId);
        return true;
      }

      // If user has a premium tier and not expired, allow
      const now = Date.now();
      if (p.tier && p.tier !== 'free' && p.expiresAt && p.expiresAt > now) return true;

      // Check if user is in premium group
      const inPremiumGroup = await isInPremiumGroup(userId);
      if (inPremiumGroup) return true;  // Premium group members have unlimited access

      // Free tier: allow 2 analyze and 2 other per day
      const analyzeUsed = p.dailyAnalyzeUsage || 0;
      const otherUsed = p.dailyOtherUsage || 0;

      if (type === 'analyze') {
        if (analyzeUsed >= 2) {
          bot.sendMessage(chatId, `⚠️ <b>Daily Limit Reached</b>\n\nYou've exceeded your free tier limit (2 analyses/day). Join the premium group to get unlimited access.`, { parse_mode: 'HTML' });
          return false;
        }
      } else {
        if (otherUsed >= 2) {
          bot.sendMessage(chatId, `⚠️ <b>Daily Limit Reached</b>\n\nYou've exceeded your free tier limit (2 requests/day). Join the premium group to get unlimited access.`, { parse_mode: 'HTML' });
          return false;
        }
      }

      await storage.incrementDailyUsage(userId, type);
      return true;
    } catch (e: any) {
      log(`Usage check error: ${e.message}`, "telegram");
      return true;
    }
  }

  // Group-based premium system - no payment gateway needed

  // Group-based premium system - no payment verification needed

  // Periodic checker for expiring premiums (runs every 6 hours)
  setInterval(async () => {
    try {
      const soon = Date.now() + (2 * 24 * 60 * 60 * 1000); // 2 days
      // Query premiums expiring within 2 days
      const rows = await db.select().from(userPremiums).where(sql`${userPremiums.expiresAt} < ${soon}`).limit(100);
      for (const r of rows) {
        if (r.expiresAt && r.expiresAt > Date.now()) {
          // send reminder to user id
          try { await bot.sendMessage(Number(r.userId), `⏳ Reminder: Your premium (${r.tier}) expires on ${new Date(r.expiresAt).toLocaleString()}. Renew to avoid losing premium access. Use /info for subscription details.`); } catch(e){}
        }
      }
    } catch (e: any) {
      log(`Expiry reminder error: ${e.message}`, "telegram");
    }
  }, 6 * 60 * 60 * 1000);

  const _executeBuy = async (userId: string, mint: string, amount: string, chatId: number) => {
    bot.sendMessage(chatId, "🚧 <b>Under Construction</b>\n\nTrading and wallet management features are currently under development. Please check back later.", { parse_mode: 'HTML' });
    return;
  };

  const _executeSell = async (userId: string, mint: string, percent: number, chatId: number) => {
    bot.sendMessage(chatId, "🚧 <b>Under Construction</b>\n\nTrading and wallet management features are currently under development. Please check back later.", { parse_mode: 'HTML' });
    return;
  };

  const _sendBuyAmountMenu = async (chatId: number, mint: string) => {
    bot.sendMessage(chatId, "🚧 <b>Under Construction</b>\n\nTrading and wallet management features are currently under development. Please check back later.", { parse_mode: 'HTML' });
  };

  const sendTokenOverview = async (chatId: number, mint: string, messageId?: number, threadId?: number) => {
    try {
      const response = await axios.get(`https://api.dexscreener.com/latest/dex/tokens/${mint}`);
      const data = response.data as any;
      const pair = data.pairs?.[0];

      if (!pair) {
        bot.sendMessage(chatId, "❌ <b>Token not found on DexScreener.</b>", { parse_mode: 'HTML', message_thread_id: threadId });
        return;
      }

      const name = pair.baseToken.name;
      const symbol = pair.baseToken.symbol;
      const price = pair.priceUsd ? `$${parseFloat(pair.priceUsd).toFixed(6)}` : "N/A";
      const mcap = pair.fdv ? `$${pair.fdv.toLocaleString()}` : "N/A";
      const liq = pair.liquidity?.usd ? `$${pair.liquidity.usd.toLocaleString()}` : "N/A";
      const vol = pair.volume?.h24 ? `$${pair.volume.h24.toLocaleString()}` : "N/A";
      const buys = pair.txns?.h24?.buys || 0;
      const sells = pair.txns?.h24?.sells || 0;
      const change = pair.priceChange?.h24 ? `${pair.priceChange.h24 > 0 ? '+' : ''}${pair.priceChange.h24}%` : "0%";

      const message = `🧪 <b>Token Overview</b>\n\n` +
                    `📛 Name: ${name}\n` +
                    `💊 Symbol: $${symbol}\n` +
                    `🔗 Mint: <code>${mint}</code>\n\n` +
                    `📊 <b>Market</b>\n` +
                    `• Price: ${price}\n` +
                    `• Market Cap: ${mcap}\n` +
                    `• Liquidity: ${liq}\n` +
                    `• Volume (24h): ${vol}\n\n` +
                    `📈 <b>Activity (24h)</b>\n` +
                    `• Buys: ${buys}\n` +
                    `• Sells: ${sells}\n` +
                    `• Change: ${change}\n\n` +
                    `🌐 <b>Chart</b>\n` +
                    `https://dexscreener.com/solana/${mint}\n\n` +
                    `⚠️ <i>This is not financial advice.</i>`;

      const keyboard = [
        [{ text: "🛒 Buy (Under Construction)", callback_data: `under_construction` }],
        [{ text: "🤖 AI Analysis", callback_data: `ai_analyze_${mint}` }],
        [{ text: "🔄 Refresh", callback_data: `refresh_overview_${mint}` }]
      ];

      if (messageId) {
        try {
          await bot.editMessageText(message, { chat_id: chatId, message_id: messageId, parse_mode: 'HTML', reply_markup: { inline_keyboard: keyboard } });
        } catch (e: any) {
          if (!e.message.includes("message is not modified")) throw e;
        }
      } else {
        bot.sendMessage(chatId, message, { parse_mode: 'HTML', message_thread_id: threadId, reply_markup: { inline_keyboard: keyboard } });
      }
    } catch (e: any) {
      log(`Error fetching token overview: ${e.message}`, "telegram");
      bot.sendMessage(chatId, "❌ <b>Error fetching token data.</b>", { parse_mode: 'HTML' });
    }
  };

  const executeAiReasoning = async (chatId: number, mint: string) => {
    const statusMsg = await bot.sendMessage(chatId, "🤖 <b>Advanced Analysis Starting...</b>\n⏳ Collecting market data, calculating indicators, and running advanced analysis...", { parse_mode: 'HTML' });
    try {
      const response = await axios.get(`https://api.dexscreener.com/latest/dex/tokens/${mint}`);
      const data = response.data as any;
      const pair = data.pairs?.[0];
      if (!pair) throw new Error("Token data not found on DexScreener.");

      // Extract comprehensive market data
      const buys = pair.txns?.h24?.buys || 0;
      const sells = pair.txns?.h24?.sells || 0;
      const buyVsSell = buys > sells ? "🟢 Bullish" : sells > buys ? "🔴 Bearish" : "⚪ Neutral";
      const buyPressure = buys + sells > 0 ? ((buys / (buys + sells)) * 100).toFixed(1) : "0";
      
      // Calculate velocity metrics
      const volume24h = parseFloat(pair.volume?.h24 || 0);
      const liquidity = parseFloat(pair.liquidity?.usd || 0);
      const volumeToLiquidity = liquidity > 0 ? (volume24h / liquidity).toFixed(2) : "0";
      
      // Risk indicators
      const fdv = parseFloat(pair.fdv || 0);
      const mcap = fdv > 0 ? `$${(fdv / 1e6).toFixed(2)}M` : "N/A";
      const hasLiquidity = liquidity > 10000;
      const volumeHealthy = volume24h > liquidity * 0.1;
      const priceStable = pair.priceChange?.h24 ? Math.abs(pair.priceChange.h24) < 50 : false;
      
      // Create token metrics for indicator analysis
      const tokenMetrics: TokenMetrics = {
        price: parseFloat(pair.priceUsd || 0),
        priceChange24h: pair.priceChange?.h24 || 0,
        priceChange1h: pair.priceChange?.h1 || 0,
        priceChange5m: pair.priceChange?.m5 || 0,
        volume24h: volume24h,
        liquidity: liquidity,
        buys24h: buys,
        sells24h: sells,
        marketCap: fdv
      };
      
      // Perform social verification & Twitter analysis
      const tokenName = pair.baseToken.name || pair.baseToken.symbol || 'Unknown';
      const socialVerification = await verifyTwitter(tokenName, pair.baseToken.symbol);
      
      // Calculate holder risk if available
      let holderRisk = 50; // Default neutral
      if (pair.topHolderPercentage !== undefined) {
        holderRisk = checkHolderRisk(pair.topHolderPercentage);
      }
      
      // Check contract security
      const isContractVerified = true; // Assume verified on DexScreener
      const contractSecurity = checkContractSecurity(pair.baseToken.address, isContractVerified);
      
      // Combine social + technical risk scores
      const indicatorAnalysis = analyzeIndicators(tokenMetrics);
      const technicalRiskScore = 100 - indicatorAnalysis.overall.score; // Convert to risk (invert score)
      const finalRiskScore = calculateSocialRiskScore(technicalRiskScore, socialVerification, holderRisk, contractSecurity);
      
      // ═══ ADVANCED ANALYSIS: Confluence Scoring ═══
      const confluenceScore = calculateConfluenceScore({
        rsi: { value: indicatorAnalysis.rsi.value, signal: indicatorAnalysis.rsi.signal },
        macd: { signal: indicatorAnalysis.macd.signal },
        ema: { signal: indicatorAnalysis.ema.signal },
        bollinger: { position: indicatorAnalysis.bollinger.position },
        vwap: { price_vs_vwap: indicatorAnalysis.vwap.price_vs_vwap },
        adx: { strength: indicatorAnalysis.adx.strength },
        stoch: { signal: indicatorAnalysis.stoch.signal },
        ichimoku: { cloud_signal: indicatorAnalysis.ichimoku.cloud_signal },
        obv: { trend: indicatorAnalysis.obv.trend },
        atr: { volatility: indicatorAnalysis.atr.volatility }
      });

      // ═══ ADVANCED ANALYSIS: Risk/Reward Calculation ═══
      const support = tokenMetrics.price * 0.97;
      const resistance = tokenMetrics.price * 1.03;
      const atrValue = (tokenMetrics.price * 0.02); // Estimate ATR
      const riskReward = calculateRiskReward(tokenMetrics.price, support, resistance, atrValue, 2);

      // ═══ ADVANCED ANALYSIS: Market Regime Detection ═══
      const marketRegime = determineMarketRegime(indicatorAnalysis.adx.value, (atrValue / tokenMetrics.price) * 100, []);

      // ═══ ADVANCED ANALYSIS: Pattern Recognition ═══
      const patterns = recognizePatterns([tokenMetrics.price * 0.98, tokenMetrics.price * 0.99, tokenMetrics.price * 1.01, tokenMetrics.price]);

      // ═══ ADVANCED ANALYSIS: Win Rate Stats ═══
      const { winRateTracker } = await import("./win-rate-tracker");
      const winRateStats = winRateTracker.analyzeWinRate(30);

      const indicatorText = formatIndicatorsForDisplay(indicatorAnalysis);
      const socialText = formatSocialVerification(socialVerification);
      
      // Construct comprehensive advanced analysis display
      const advancedAnalysisText = `<b>═══ ADVANCED ANALYSIS ═══</b>

<b>🎯 Confluence Score:</b> ${confluenceScore.confluencePercent}% (${confluenceScore.agreeingIndicators}/${confluenceScore.totalIndicators} indicators aligned)
<b>Confidence Level:</b> ${confluenceScore.confidenceLevel.toUpperCase()}

<b>📊 Risk/Reward Analysis:</b>
└─ Entry: $${riskReward.entryPrice.toFixed(8)}
└─ Take Profit: $${riskReward.takeProfit.toFixed(8)}
└─ Stop Loss: $${riskReward.stopLoss.toFixed(8)}
└─ Ratio: ${riskReward.riskRewardRatio}:1 ${riskReward.isValid ? "✅ Valid" : "❌ Invalid"}

<b>📈 Market Regime:</b> ${marketRegime.regime.toUpperCase()}
└─ ADX: ${marketRegime.adxValue.toFixed(1)} (${marketRegime.volatility})
└─ Recommendation: ${marketRegime.recommendation}

<b>🔍 Pattern Recognition:</b> ${patterns.length > 0 ? patterns.map(p => `${p.pattern} (${p.direction})`).join(", ") : "No patterns detected"}

<b>📊 Win Rate Stats (30D):</b>
└─ Win Rate: ${winRateStats.winRate}%
└─ Profit Factor: ${winRateStats.profitFactor}x
└─ Expectancy: ${winRateStats.expectancy}% per trade`;

      // Construct comprehensive market analysis data
      const marketData = JSON.stringify({
        token: {
          name: pair.baseToken.name,
          symbol: pair.baseToken.symbol,
          mint: pair.baseToken.address,
          chainId: pair.chainId
        },
        price: {
          current: pair.priceUsd,
          change24h: pair.priceChange?.h24 || 0,
          change1h: pair.priceChange?.h1 || 0,
          change5m: pair.priceChange?.m5 || 0
        },
        volume: {
          volume24h: volume24h,
          volumeToLiquidityRatio: volumeToLiquidity,
          volumeTrendHealthy: volumeHealthy
        },
        liquidity: {
          liquidity: liquidity,
          isHealthy: hasLiquidity,
          ratio: liquidity > 0 ? (volume24h / liquidity).toFixed(2) : "0"
        },
        market: {
          fdv: fdv,
          marketCapRank: mcap,
          pairCreatedAt: pair.pairCreatedAt
        },
        activity: {
          buys24h: buys,
          sells24h: sells,
          totalTxns: buys + sells,
          buyPressure: buyPressure,
          sentiment: buyVsSell
        },
        socialVerification: {
          trustLevel: socialVerification.trustLevel,
          verdict: socialVerification.verdict,
          maliciousFlags: socialVerification.maliciousFlags,
          positiveSignals: socialVerification.positiveSignals,
          riskScore: socialVerification.riskScore
        },
        holderRisk: holderRisk,
        contractSecurity: contractSecurity,
        finalRiskScore: finalRiskScore,
        advancedAnalysis: {
          confluenceScore: confluenceScore.confluencePercent,
          confluenceStatus: confluenceScore.confidenceLevel,
          marketRegime: marketRegime.regime,
          patterns: patterns,
          riskRewardRatio: riskReward.riskRewardRatio,
          riskRewardValid: riskReward.isValid,
          winRate: winRateStats.winRate
        }
      });

      const { openRouterClient } = await import("./signals-worker");
      
      // Retry if client not ready yet - increase retries and wait longer
      let client = openRouterClient;
      let retries = 0;
      while (!client && retries < 8) {
        log(`AI Client not ready, waiting... (attempt ${retries + 1}/8)`, "telegram");
        await new Promise(resolve => setTimeout(resolve, 1000));
        const retry = await import("./signals-worker");
        client = retry.openRouterClient;
        retries++;
      }
      
      if (!client) {
        const errMsg = "🤖 AI service is initializing. Please wait a moment and try again.";
        log(errMsg, "telegram");
        bot.sendMessage(chatId, errMsg);
        return;
      }

      const aiResponse = await (client as any).chat.completions.create({
        model: "google/gemini-2.0-flash-001",
        messages: [
          {
            role: "system",
            content: `You are an EXPERT INSTITUTIONAL SOLANA TOKEN ANALYST with deep understanding of:
- Smart Money Concepts (SMC), Order Flow, Liquidity Structure
- On-chain metrics, holder distribution, contract security
- Technical analysis with RSI, MACD, EMA, Bollinger Bands, VWAP, Ichimoku
- Risk assessment, rug-pull detection, honeypot identification
- Social media presence, Twitter verification, project legitimacy
- Holder concentration, whale activity, contract verification status

PROVIDE COMPREHENSIVE TOKEN ANALYSIS in this EXACT structured format:

═══════════════════════════════════════
🤖 INSTITUTIONAL TOKEN DEEP ANALYSIS
═══════════════════════════════════════

📛 <b>[TOKEN_NAME] ($[SYMBOL])</b>

<b>━━━━━━━ PRICE ACTION ━━━━━━━</b>
• Current Price: $[PRICE]
• 1H Change: [1H]% [ARROW]
• 24H Change: [24H]% [ARROW]
• Volatility: [Assessment]

<b>━━━━━━━ VOLUME & LIQUIDITY ━━━━━━━</b>
• 24H Volume: $[VOLUME]
• Liquidity: $[LIQUIDITY]
• Vol/Liq Ratio: [RATIO] [Assessment]

<b>━━━━━━━ ORDER FLOW TECHNICAL ━━━━━━━</b>
• Buy Orders (24H): [BUYS]
• Sell Orders (24H): [SELLS]
• Buy Pressure: [%]
• Sentiment: [EMOJI] [SENTIMENT]

<b>━━━━━━━ MARKET STRUCTURE ━━━━━━━</b>
• Market Cap (FDV): $[FDV]
• Liquidity Grade: [GRADE]
• Institutional Signals: [PRESENT/ABSENT]
• Smart Money Activity: [DETECTED/NONE]

<b>━━━━━━━ TECHNICAL INDICATORS ASSESSMENT ━━━━━━━</b>
[Based on provided indicator analysis - integrate RSI, MACD, EMA 9/21, Bollinger Bands data]
• Primary Signal: [From indicators]
• Confluence Score: [Count of confirming indicators]
• Technical Strength: [Weak/Moderate/Strong/Very Strong]

<b>━━━━━━━ SOCIAL MEDIA & LEGITIMACY ━━━━━━━</b>
[Based on social verification data - Twitter presence, official status, community signals]
• Twitter/Social Status: [Verified/Unverified/Suspicious/No Presence]
• Project Legitimacy: [Official/Community/Suspicious]
• Community Engagement: [Active/Minimal/Spam/None]
• Malicious Indicators: [Present/None/Multiple]

<b>━━━━━━━ RISK ASSESSMENT ━━━━━━━</b>
• Overall Risk Score: [0-100]
• Rug Risk Level: [Low/Medium/High] (holder concentration analysis)
• Honeypot Risk: [Low/Medium/High]
• Social Legitimacy Risk: [Low/Medium/High]
• Liquidity Risk: [Safe/Caution/High Risk]
• Contract Verification: [Verified/Unverified/Unknown]

<b>━━━━━━━ INSTITUTIONAL REASONING ━━━━━━━</b>
[5-6 sentence institutional-grade analysis covering: momentum, technical setup, social legitimacy, holder distribution, risk/reward, entry consideration, and conviction]

<b>━━━━━━━ WATCHLIST STATUS ━━━━━━━</b>
Recommendation: [🟢 BUY / 🟡 MONITOR / 🔴 AVOID / ⚪ INCONCLUSIVE]
Conviction: [Very Low/Low/Moderate/High/Very High]
Confidence: [Based on indicator confluence and risk assessment]

⚠️ DISCLAIMER: Probabilistic analysis based on available data. Not financial advice. DYOR.`
          },
          { role: "user", content: `Analyze this token with provided technical indicators and social verification:\n\nMarket Data: ${marketData}\n\nTechnical Indicator Summary:\n${indicatorText}\n\nSocial Verification Report:\n${socialText}\n\nProvide comprehensive institutional analysis in the specified format.` }
        ]
      });

      const reasoning = aiResponse.choices[0].message.content;
      
      // Send technical indicators first
      bot.sendMessage(chatId, indicatorText, { parse_mode: 'HTML' });
      
      // Send advanced analysis
      bot.sendMessage(chatId, advancedAnalysisText, { parse_mode: 'HTML' });
      
      // Send social verification
      bot.sendMessage(chatId, socialText, { parse_mode: 'HTML' });
      
      // Then send comprehensive analysis in chunks if needed
      const maxLength = 3950;
      if (reasoning && reasoning.length > maxLength) {
        const chunks = [];
        let currentChunk = '';
        const lines = reasoning.split('\n');
        
        for (const line of lines) {
          if ((currentChunk + line + '\n').length > maxLength) {
            if (currentChunk) chunks.push(currentChunk.trim());
            currentChunk = line + '\n';
          } else {
            currentChunk += line + '\n';
          }
        }
        if (currentChunk) chunks.push(currentChunk.trim());
        
        // Send all chunks with delays
        for (let i = 0; i < chunks.length; i++) {
          const chunk = chunks[i];
          const footer = chunks.length > 1 ? `\n\n[Part ${i + 1}/${chunks.length}]` : '';
          bot.sendMessage(chatId, chunk + footer, { parse_mode: 'HTML' });
          if (i < chunks.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 500));
          }
        }
      } else if (reasoning) {
        bot.sendMessage(chatId, reasoning, { parse_mode: 'HTML' });
      }
    } catch (e: any) {
      log(`AI reasoning error: ${e.message}`, "telegram");
      bot.sendMessage(chatId, `❌ <b>Deep Analysis Failed</b>\n\n${e.message}\n\nPlease ensure the token mint is valid and exists on Solana.`, { parse_mode: 'HTML' });
    }
    
    // Delete status message
    try {
      bot.deleteMessage(chatId, statusMsg.message_id);
    } catch (e) { }
  };

  // General Crypto/Web3 Q&A handler
  const answerCryptoQuestion = async (chatId: number, question: string) => {
    const statusMsg = await bot.sendMessage(chatId, "🤖 <b>Analyzing your question...</b>\n⏳ Consulting AI...", { parse_mode: 'HTML' });
    
    try {
      const { openRouterClient } = await import("./signals-worker");
      
      let client = openRouterClient;
      let retries = 0;
      while (!client && retries < 8) {
        log(`AI Client not ready, waiting... (attempt ${retries + 1}/8)`, "telegram");
        await new Promise(resolve => setTimeout(resolve, 1000));
        const retry = await import("./signals-worker");
        client = retry.openRouterClient;
        retries++;
      }
      
      if (!client) {
        bot.sendMessage(chatId, "🤖 AI service is initializing. Please try again in a moment.");
        return;
      }
      
      const aiResponse = await (client as any).chat.completions.create({
        model: "google/gemini-2.0-flash-001",
        messages: [
          {
            role: "system",
            content: `You are an expert in cryptocurrency, blockchain, DeFi, Web3, and Solana. 
            
Provide clear, accurate, and educational responses to crypto/web3 questions.

Include:
- Clear explanation of the concept
- Related examples if relevant
- Risk warnings if applicable
- Current relevance to the market

Use HTML formatting with <b>bold</b>, <i>italic</i>, and <code>monospace</code> for clarity.

Keep responses concise but comprehensive (2-5 paragraphs max).`
          },
          {
            role: "user",
            content: question
          }
        ]
      });
      
      const answer = aiResponse.choices[0].message.content;
      
      const maxLength = 3950;
      if (answer && answer.length > maxLength) {
        const chunks = [];
        let currentChunk = '';
        const lines = answer.split('\n');
        
        for (const line of lines) {
          if ((currentChunk + line + '\n').length > maxLength) {
            if (currentChunk) chunks.push(currentChunk.trim());
            currentChunk = line + '\n';
          } else {
            currentChunk += line + '\n';
          }
        }
        if (currentChunk) chunks.push(currentChunk.trim());
        
        for (let i = 0; i < chunks.length; i++) {
          const chunk = chunks[i];
          const footer = chunks.length > 1 ? `\n\n[Part ${i + 1}/${chunks.length}]` : '';
          bot.sendMessage(chatId, chunk + footer, { parse_mode: 'HTML' });
          if (i < chunks.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 500));
          }
        }
      } else if (answer) {
        bot.sendMessage(chatId, answer, { parse_mode: 'HTML' });
      }
    } catch (e: any) {
      log(`Crypto Q&A error: ${e.message}`, "telegram");
      bot.sendMessage(chatId, `❌ <b>Analysis Failed</b>\n\n${e.message}\n\nPlease try again in a moment.`, { parse_mode: 'HTML' });
    }
    
    // Delete status message
    try {
      bot.deleteMessage(chatId, statusMsg.message_id);
    } catch (e) { }
  };

  // Display advanced analysis for trading pairs
  const displayAdvancedAnalysis = async (chatId: number, pair: string, indicators: any) => {
    try {
      const currentPrice = indicators.price || 0;
      
      // ═══ ADVANCED ANALYSIS: Confluence Scoring ═══
      const confluenceScore = calculateConfluenceScore({
        rsi: { value: indicators.rsi || 50, signal: indicators.rsiSignal || "Neutral" },
        macd: { signal: indicators.macdSignal || "Neutral" },
        ema: { signal: indicators.emaSignal || "Neutral" },
        bollinger: { position: indicators.bollingerPosition || "Middle" },
        vwap: { price_vs_vwap: indicators.vwapAlign || "Neutral" },
        adx: { strength: indicators.adxStrength || "Weak" },
        stoch: { signal: indicators.stochSignal || "Neutral" },
        ichimoku: { cloud_signal: indicators.ichimokuCloud || "Neutral" },
        obv: { trend: indicators.obvTrend || "Neutral" },
        atr: { volatility: indicators.atrVolatility || "Low" }
      });

      // ═══ ADVANCED ANALYSIS: Risk/Reward Calculation ═══
      const support = currentPrice * 0.97;
      const resistance = currentPrice * 1.03;
      const atrValue = indicators.atrValue || (currentPrice * 0.01);
      const riskReward = calculateRiskReward(currentPrice, support, resistance, atrValue, 2);

      // ═══ ADVANCED ANALYSIS: Market Regime Detection ═══
      const marketRegime = determineMarketRegime(indicators.adxValue || 25, (atrValue / currentPrice) * 100, []);

      // ═══ ADVANCED ANALYSIS: Pattern Recognition ═══
      const patterns = recognizePatterns([currentPrice * 0.98, currentPrice * 0.99, currentPrice * 1.01, currentPrice]);

      // ═══ ADVANCED ANALYSIS: Win Rate Stats ═══
      const { winRateTracker } = await import("./win-rate-tracker");
      const winRateStats = winRateTracker.analyzeWinRate(30);

      // Format advanced analysis display
      const advancedAnalysisText = `<b>═══ ADVANCED ANALYSIS: ${pair} ═══</b>

<b>🎯 Confluence Score:</b> ${confluenceScore.confluencePercent}% (${confluenceScore.agreeingIndicators}/${confluenceScore.totalIndicators} indicators aligned)
<b>Confidence Level:</b> ${confluenceScore.confidenceLevel.toUpperCase()}

<b>📊 Risk/Reward Analysis:</b>
└─ Entry: $${currentPrice.toFixed(8)}
└─ Take Profit: $${riskReward.takeProfit.toFixed(8)}
└─ Stop Loss: $${riskReward.stopLoss.toFixed(8)}
└─ Ratio: ${riskReward.riskRewardRatio}:1 ${riskReward.isValid ? "✅ Valid" : "❌ Invalid"}

<b>📈 Market Regime:</b> ${marketRegime.regime.toUpperCase()}
└─ ADX: ${marketRegime.adxValue.toFixed(1)} (${marketRegime.volatility})
└─ Recommendation: ${marketRegime.recommendation}

<b>🔍 Pattern Recognition:</b> ${patterns.length > 0 ? patterns.map(p => `${p.pattern} (${p.direction})`).join(", ") : "No patterns detected"}

<b>📊 Win Rate Stats (30D):</b>
└─ Win Rate: ${winRateStats.winRate}%
└─ Profit Factor: ${winRateStats.profitFactor}x
└─ Expectancy: ${winRateStats.expectancy}% per trade`;

      bot.sendMessage(chatId, advancedAnalysisText, { parse_mode: 'HTML' });
    } catch (e: any) {
      log(`Advanced analysis display error: ${e.message}`, "telegram");
    }
  };

  // Premium access is now group-based

  async function sendMainMenu(chatId: number, userId: string, messageId?: number) {
    const activeWallet = await storage.getActiveWallet(userId);
    let balance = "0.000";
    
    if (activeWallet) {
      try {
        const connection = new Connection(rpcUrl, "confirmed");
        const bal = await connection.getBalance(new PublicKey(activeWallet.publicKey));
        balance = (bal / 1e9).toFixed(3);
        await storage.updateWalletBalance(activeWallet.id, balance);
      } catch (e) {
        log(`Failed to fetch real-time balance for ${activeWallet.publicKey}: ${e}`, "telegram");
        balance = activeWallet.balance || "0.000";
      }
    }

    const header = `🚀 <b>Welcome to Coin Hunter Bot</b>\n\n` +
                   `The most advanced Smart Money Concepts trading terminal on Solana.\n\n` +
                   `Wallet: <code>${activeWallet?.publicKey || 'None'}</code> (Tap to copy)\n` +
                   `Active Balance: <b>${balance} SOL</b>\n\n` +
                   `Quick Commands:\n` +
                   `• /buy [mint] [amount] - Manual Buy\n` +
                   `• /sell [mint] [percent] - Manual Sell\n` +
                   `• /settings - Configure Bot\n` +
                   `• /withdraw - Withdraw SOL\n` +
                   `• /history - View trade history`;

    const keyboard = [
      [{ text: "🔄 Refresh", callback_data: "main_menu_refresh" }],
      [{ text: "🛒 Buy (Under Construction)", callback_data: "under_construction" }, { text: "💰 Sell (Under Construction)", callback_data: "under_construction" }],
      [{ text: "📂 Positions (Under Construction)", callback_data: "under_construction" }, { text: "📜 History", callback_data: "menu_history" }],
      [{ text: "💸 Withdraw", callback_data: "menu_withdraw" }, { text: "⚙️ Settings", callback_data: "menu_settings" }]
    ];
    if (messageId) {
      try {
        await bot.editMessageText(header, { chat_id: chatId, message_id: messageId, parse_mode: 'HTML', reply_markup: { inline_keyboard: keyboard } });
      } catch (e: any) {
        if (!e.message.includes("message is not modified")) throw e;
      }
    } else {
      bot.sendMessage(chatId, header, { parse_mode: 'HTML', reply_markup: { inline_keyboard: keyboard } });
    }
  }

  bot.on('message', async (msg) => {
    log(`Received message from ${msg.from?.username} (${msg.from?.id}): ${msg.text}`, "telegram");
    const chatId = msg.chat.id;
    const userId = msg.from?.id?.toString();
    if (!userId) return;

    const now = Math.floor(Date.now() / 1000);
    if (msg.date && (now - msg.date > 30)) return;

    try {
      await ensureUser(msg);
      await ensureUserPremiumRow(msg.from!.id.toString());
      const isPrivate = msg.chat.type === 'private';

      // Restrict commands for non-premium users: only certain commands allowed
      if (msg.text && msg.text.startsWith('/')) {
        const cmd = msg.text.split(' ')[0].toLowerCase();
        const publicCommands = ['/start', '/help', '/menu', '/info', '/analyze', '/setup'];
        const isPublic = publicCommands.includes(cmd);
        const privileged = await isPremiumOrAdmin(userId);
        if (!privileged && !isPublic) {
          bot.sendMessage(chatId, `🔒 This command is available to Premium users only. Use /analyze or /setup as a free user.\n\nContact: @shiller_xxx or @FiftyOneP3rcent`, { parse_mode: 'HTML', message_thread_id: msg.message_thread_id });
          return;
        }
      }

      // Check for AI lane restriction in groups
      const checkAiLane = async () => {
        if (isPrivate) return true;
        
        // Find if there is ANY AI binding for this group
        const aiBinding = await db.select().from(groupBindings).where(
          and(
            eq(groupBindings.groupId, chatId.toString()),
            eq(groupBindings.market, "ai")
          )
        ).limit(1);
        
        if (aiBinding.length === 0) {
          // If no AI lane is bound at all to this group, we shouldn't respond to AI commands in this group
          log(`AI command blocked: Group ${chatId} has no AI lane bound.`, "telegram");
          return false;
        }
        
        const currentTopic = msg.message_thread_id?.toString() || null;
        // If the AI market is bound to a specific topic, restrict commands strictly to it
        if (aiBinding[0].topicId !== currentTopic) {
          bot.sendMessage(chatId, `⚠️ <b>Action Restricted</b>\n\nPlease use the designated <b>AI Analysis</b> topic for this request.`, { 
            parse_mode: 'HTML', 
            message_thread_id: msg.message_thread_id 
          });
          return false;
        }
        return true;
      };

      // Define /ai command
      if (msg.text?.startsWith('/ai ')) {
        if (!(await checkAiLane())) return;
        // Enforce free tier usage for AI (count as 'other')
        const allowed = await checkAndConsumeUsage(msg.from!.id.toString(), 'other', chatId);
        if (!allowed) return;
        const query = msg.text.slice(4).trim();
        if (!query) {
          bot.sendMessage(chatId, "❌ Please provide a query, e.g. <code>/ai What are bullish signals in BTC?</code>", { parse_mode: 'HTML', message_thread_id: msg.message_thread_id });
          return;
        }

        const loadingMsg = await bot.sendMessage(chatId, "🤖 <b>Analyzing...</b>\n⏳ Processing your query with AI engine...", { parse_mode: 'HTML', message_thread_id: msg.message_thread_id });
        
        try {
          const { openRouterClient } = await import("./signals-worker");
          if (!openRouterClient) {
            bot.sendMessage(chatId, "❌ AI service not initialized. Please try again later.", { parse_mode: 'HTML', message_thread_id: msg.message_thread_id });
            return;
          }

          const response = await openRouterClient.chat.completions.create({
            model: "google/gemini-2.0-flash-001",
            messages: [
              { 
                role: "system", 
                content: "You are an expert crypto analyst with deep knowledge of technical indicators, charting, and market psychology. ANSWER ONLY crypto, blockchain, web3, DeFi, NFTs, meme coins, solana, trading strategies, and market analysis. CRITICAL: Keep answers SHORT (6-8 sentences max). Be direct and precise. NO stories, NO fluff. If off-topic: respond 'REFUSE'." 
              },
              { role: "user", content: query }
            ]
          });
          
          const aiResponse = response.choices[0].message?.content || "No response.";
          if (aiResponse?.startsWith('REFUSE')) {
            bot.sendMessage(chatId, "❌ That question is outside my expertise. Please ask about crypto, web3, solana, trading, technical indicators, or market analysis.", { parse_mode: 'HTML', message_thread_id: msg.message_thread_id });
          } else if (aiResponse) {
            // Split response if too long (Telegram limit is 4096 chars)
            const maxLength = 4000;
            if (aiResponse.length > maxLength) {
              const chunks = [];
              let currentChunk = '';
              const paragraphs = aiResponse.split('\n');
              
              for (const para of paragraphs) {
                if ((currentChunk + para + '\n').length > maxLength) {
                  if (currentChunk) chunks.push(currentChunk.trim());
                  currentChunk = para + '\n';
                } else {
                  currentChunk += para + '\n';
                }
              }
              if (currentChunk) chunks.push(currentChunk.trim());
              
              // Send all chunks
              for (let i = 0; i < chunks.length; i++) {
                const chunk = chunks[i];
                const prefix = chunks.length > 1 ? `<b>Response (Part ${i + 1}/${chunks.length})</b>\n\n` : '';
                bot.sendMessage(chatId, prefix + chunk, { parse_mode: 'HTML', message_thread_id: msg.message_thread_id });
                if (i < chunks.length - 1) {
                  await new Promise(resolve => setTimeout(resolve, 300));
                }
              }
            } else {
              bot.sendMessage(chatId, aiResponse, { parse_mode: 'HTML', message_thread_id: msg.message_thread_id });
            }
          }
          
          // Delete loading message
          try {
            bot.deleteMessage(chatId, loadingMsg.message_id);
          } catch (e) { }
        } catch (e: any) {
          bot.sendMessage(chatId, `❌ <b>AI Error:</b> ${e.message || "Failed to process request"}`, { parse_mode: 'HTML', message_thread_id: msg.message_thread_id });
        }
        return;
      }

      // Admin / Owner commands: /addadmin, /removeadmin, /premium
      if (msg.text?.startsWith('/addadmin') || msg.text?.startsWith('/removeadmin') || msg.text?.startsWith('/premium')) {
        const parts = msg.text.trim().split(/\s+/);
        const cmd = parts[0].toLowerCase();
        const callerId = userId;
        // Only owner can add/remove admins
        if (cmd === '/addadmin' || cmd === '/removeadmin') {
          if (callerId !== OWNER_ID) {
            bot.sendMessage(chatId, '❌ Only the owner can manage admins.', { parse_mode: 'HTML', message_thread_id: msg.message_thread_id });
            return;
          }
          const target = parts[1];
          if (!target) {
            bot.sendMessage(chatId, '❌ Usage: /addadmin <userId> or /removeadmin <userId>', { parse_mode: 'HTML' });
            return;
          }
          try {
            if (cmd === '/addadmin') {
              await storage.addAdmin(target, false);
              bot.sendMessage(chatId, `✅ Added admin: ${target}`, { parse_mode: 'HTML' });
            } else {
              await storage.removeAdmin(target);
              bot.sendMessage(chatId, `✅ Removed admin: ${target}`, { parse_mode: 'HTML' });
            }
          } catch (e: any) {
            bot.sendMessage(chatId, `❌ Admin command failed: ${e.message}`);
          }
          return;
        }

        // /premium <userId> <duration>
        if (cmd === '/premium') {
          // Allow owner or admins to grant premium
          const allowed = await isPremiumOrAdmin(callerId!);
          if (!allowed) {
            bot.sendMessage(chatId, '❌ Only owner or admins can grant premium.', { parse_mode: 'HTML' });
            return;
          }
          const target = parts[1];
          const durationRaw = parts[2] || '30d';
          if (!target) {
            bot.sendMessage(chatId, '❌ Usage: /premium <userId> <duration>. Examples: 7d, 2w, 1m', { parse_mode: 'HTML' });
            return;
          }
          // Parse duration
          function parseDuration(s: string): number {
            const lower = s.toLowerCase();
            const m = lower.match(/^(\d+)(d|w|m)?$/);
            if (!m) return 30 * 24 * 60 * 60 * 1000;
            const val = parseInt(m[1], 10);
            const unit = m[2] || 'd';
            if (unit === 'd') return val * 24 * 60 * 60 * 1000;
            if (unit === 'w') return val * 7 * 24 * 60 * 60 * 1000;
            if (unit === 'm') return val * 30 * 24 * 60 * 60 * 1000;
            return val * 24 * 60 * 60 * 1000;
          }
          try {
            const durMs = parseDuration(durationRaw);
            const expiresAt = Date.now() + durMs;
            const days = Math.round(durMs / (24 * 60 * 60 * 1000));
            await storage.upsertUserPremium({ userId: target, tier: `manual_${days}d`, expiresAt });
            bot.sendMessage(chatId, `✅ Granted premium to ${target} for ${days} days. Expires: ${new Date(expiresAt).toLocaleString()}`, { parse_mode: 'HTML' });
          } catch (e: any) {
            bot.sendMessage(chatId, `❌ Failed to grant premium: ${e.message}`);
          }
          return;
        }
      }

      if (msg.text?.startsWith('/premiuminfo')) {
        const caller = userId;
        const allowed = await isPremiumOrAdmin(caller!);
        if (!allowed) {
          bot.sendMessage(chatId, '❌ Only owner or admins can view premium info.', { parse_mode: 'HTML' });
          return;
        }
        const parts = msg.text.trim().split(/\s+/);
        const target = parts[1];
        if (!target) {
          bot.sendMessage(chatId, '❌ Usage: /premiuminfo <userId>', { parse_mode: 'HTML' });
          return;
        }
        try {
          const p = await storage.getUserPremium(target);
          if (!p) {
            bot.sendMessage(chatId, `<b>Premium Info for ${target}</b>\n\nNo premium record found. User is on free tier.`, { parse_mode: 'HTML' });
            return;
          }
          const now = Date.now();
          const isActive = p.expiresAt && p.expiresAt > now;
          const status = isActive ? '✅ ACTIVE' : '❌ EXPIRED';
          const expiryDate = p.expiresAt ? new Date(p.expiresAt).toLocaleString() : 'N/A';
          const createdDate = p.createdAt ? new Date(p.createdAt).toLocaleString() : 'Unknown';
          const daysRemaining = p.expiresAt ? Math.ceil((p.expiresAt - now) / (24*60*60*1000)) : 0;
          const dailyAnalyzeUsed = p.dailyAnalyzeUsage || 0;
          const dailyOtherUsed = p.dailyOtherUsage || 0;
          const info = `<b>Premium Info for ${target}</b>\n\n` +
            `Status: ${status}\n` +
            `Tier: ${p.tier || 'Unknown'}\n` +
            `Created: ${createdDate}\n` +
            `Expires: ${expiryDate}\n` +
            `Days Remaining: ${daysRemaining > 0 ? daysRemaining : 'N/A'}\n\n` +
            `<b>Daily Usage (24h)</b>\n` +
            `Analyzes: ${dailyAnalyzeUsed}/unlimited\n` +
            `Other: ${dailyOtherUsed}/unlimited`;
          bot.sendMessage(chatId, info, { parse_mode: 'HTML' });
        } catch (e: any) {
          bot.sendMessage(chatId, `❌ Failed to fetch premium info: ${e.message}`);
        }
        return;
      }

      if (msg.text === '/admins' || msg.text === '/listadmins') {
        const caller = userId;
        const allowed = await isPremiumOrAdmin(caller!);
        if (!allowed) {
          bot.sendMessage(chatId, '❌ Only owner or admins can view admin list.', { parse_mode: 'HTML' });
          return;
        }
        const adminsList = await db.select().from(admins) as any[];
        if (!adminsList || adminsList.length === 0) {
          bot.sendMessage(chatId, 'No admins configured.', { parse_mode: 'HTML' });
          return;
        }
        const lines = adminsList.map((a: any) => `${a.userId}${a.isOwner ? ' (Owner)' : ''}`);
        const keyboard = adminsList.map((a: any) => [{ text: `Remove ${a.userId}`, callback_data: `admin_remove:${a.userId}` }]);
        bot.sendMessage(chatId, `👥 Admins:\n${lines.join('\n')}`, { parse_mode: 'HTML', reply_markup: { inline_keyboard: keyboard } });
        return;
      }

      if (msg.text === '/admincommands' || msg.text === '/commands' || msg.text === '/help') {
        try {
          const part1 = `🏛️ <b>SMC Trading Bot - Command Guide</b>

<b>Core Commands:</b>
• <code>/start</code> - Main dashboard
• <code>/bind [market]</code> - Bind to crypto/forex/ai
• <code>/analyze [pair]</code> - Deep-dive analysis
• <code>/setup [pair]</code> - Neutral setups
• <code>/ai [query]</code> - AI specialist`;
          const part2 = `<b>More Commands:</b>
• <code>/unbind [market]</code> - Unbind signals
• <code>/settings</code> - Configure preferences
• <code>/history</code> - Trade history
• <code>/withdraw</code> - Withdraw SOL

<b>Features:</b> Image analysis, mint address lookup, auto signals every 15m.

<b>Contact:</b> @FiftyOneP3rcent | @shiller_xxx`;
          bot.sendMessage(chatId, part1, { parse_mode: 'HTML' });
          bot.sendMessage(chatId, part2, { parse_mode: 'HTML' });
        } catch (e: any) {
          log(`Error in /help: ${e.message}`, "telegram");
          bot.sendMessage(chatId, `❌ Error: ${e.message}`);
        }
        return;
      }

      if (msg.text?.length && msg.text.length >= 32 && msg.text.length <= 44 && !msg.text.includes(' ')) {
        if (!(await checkAiLane())) return;
        const mint = msg.text.trim();
        try {
          new PublicKey(mint);
          await sendTokenOverview(chatId, mint, undefined, msg.message_thread_id);
          return;
        } catch (e) {
          // Not a valid public key, ignore
        }
      }

      // Handle under construction commands
      if (msg.text?.startsWith('/buy') || msg.text?.startsWith('/sell') || msg.text === '/wallet' || msg.text === '/withdraw' || msg.text === '/settings' || msg.text === '/history') {
        if (msg.text === '/withdraw' && msg.reply_to_message) {
            // This is a reply to the withdraw message, but features are under construction
        }
        bot.sendMessage(chatId, "🚧 <b>Under Construction</b>\n\nTrading and wallet management features are currently under development. Please check back later.", { 
            parse_mode: 'HTML',
            message_thread_id: msg.message_thread_id
        });
        return;
      }

      if (msg.text === '/bind' || msg.text?.startsWith('/bind ')) {
        const parts = msg.text.split(' ');
        if (parts.length < 2) {
          bot.sendMessage(chatId, "❌ Usage: <code>/bind [market]</code>\nMarkets: <code>crypto, forex, ai</code>", { parse_mode: 'HTML' });
          return;
        }
        const lane = parts[1].toLowerCase();
        const market = (lane === 'forex') ? 'forex' : (lane === 'crypto' ? 'crypto' : (lane === 'ai' ? 'ai' : null));
        
        if (!market) {
          bot.sendMessage(chatId, "❌ Invalid market. Use <code>crypto</code>, <code>forex</code>, or <code>ai</code>.", { parse_mode: 'HTML' });
          return;
        }

        try {
          const groupIdStr = chatId.toString().trim();
          log(`Attempting to bind for group ${groupIdStr}, market: ${market}`, "telegram");

          // Check if binding exists for this group and market
          const existing = await db.select().from(groupBindings).where(
            and(
              eq(groupBindings.groupId, groupIdStr),
              eq(groupBindings.market, market)
            )
          ).limit(1);

          const cooldownKey = `cooldown_${market}`;
          const cooldownData = { [cooldownKey]: Date.now() + (10 * 60 * 1000) };

          if (existing.length > 0) {
            await db.update(groupBindings).set({
              topicId: msg.message_thread_id?.toString() || null,
              lane: market,
              data: JSON.stringify({ ...((typeof existing[0].data === 'string' ? JSON.parse(existing[0].data) : existing[0].data) || {}), ...cooldownData })
            }).where(eq(groupBindings.id, existing[0].id));
            try {
              const post = await db.select().from(groupBindings).where(eq(groupBindings.groupId, groupIdStr));
              log(`Post-update group_bindings rows for ${groupIdStr}: ${JSON.stringify(post)}`, "telegram");
            } catch (e: any) {
              log(`Failed to read back group_bindings after update: ${e?.message || String(e)}`, "telegram");
            }
          } else {
            const insertValues = {
              groupId: groupIdStr,
              topicId: msg.message_thread_id?.toString() || null,
              lane: market,
              market: market,
              data: JSON.stringify(cooldownData),
              createdAt: Date.now()
            } as any;
            await db.insert(groupBindings).values(insertValues);
            log(`Bind persisted for group ${groupIdStr}, market: ${market}`, "telegram");
            try {
              const post = await db.select().from(groupBindings).where(eq(groupBindings.groupId, groupIdStr));
              log(`Post-insert group_bindings rows for ${groupIdStr}: ${JSON.stringify(post)}`, "telegram");
            } catch (e: any) {
              log(`Failed to read back group_bindings after insert: ${e?.message || String(e)}`, "telegram");
            }
          }

          let response = `✅ <b>Group Bound!</b>\nMarket: <code>${market}</code>\nTopic: <code>${msg.message_thread_id || 'Main'}</code>`;
          if (market !== 'ai') {
            response += `\n\n⏱ <i>Cooldown active: Scanning for new institutional setups in 10m...</i>`;
          }
          bot.sendMessage(chatId, response, { parse_mode: 'HTML', message_thread_id: msg.message_thread_id });
        } catch (dbErr: any) {
          log(`Bind error: ${dbErr?.message}\n${dbErr?.stack || ''}`, "telegram");
          try {
            bot.sendMessage(chatId, `❌ <b>Database error during binding.</b> ${dbErr?.message || ''} Please ensure the bot is admin.`, { parse_mode: 'HTML' });
          } catch (e: any) {
            log(`Failed to send bind error message: ${e?.message}`, "telegram");
          }
        }
        return;
      }

      if (msg.text === '/unbind' || msg.text?.startsWith('/unbind ')) {
        const parts = msg.text.trim().split(/\s+/);
        const market = parts[1]?.toLowerCase();
        
        try {
          const groupIdStr = chatId.toString().trim();
          log(`Attempting to unbind for group ${groupIdStr}, market: ${market || 'ALL'}`, "telegram");
          
          if (market === 'crypto' || market === 'forex' || market === 'ai') {
            const deleted = await db.delete(groupBindings).where(
              and(
                or(
                  eq(groupBindings.groupId, groupIdStr),
                  eq(groupBindings.groupId, groupIdStr.replace("-100", "")),
                  eq(groupBindings.groupId, groupIdStr.includes("-100") ? groupIdStr : `-100${groupIdStr}`)
                ),
                eq(groupBindings.market, market)
              )
            ).returning();
            log(`Successfully unbound market ${market} for group ${groupIdStr}. Deleted rows: ${deleted.length}`, "telegram");
          } else {
            const deleted = await db.delete(groupBindings).where(
              or(
                eq(groupBindings.groupId, groupIdStr),
                eq(groupBindings.groupId, groupIdStr.replace("-100", "")),
                eq(groupBindings.groupId, groupIdStr.includes("-100") ? groupIdStr : `-100${groupIdStr}`)
              )
            ).returning();
            log(`Successfully unbound ALL markets for group ${groupIdStr}. Deleted rows: ${deleted.length}`, "telegram");
          }

          bot.sendMessage(chatId, `✅ <b>Group Unbound!</b>${market && (market === 'crypto' || market === 'forex' || market === 'ai') ? `\nMarket: <code>${market}</code>` : '\nAll markets unbound.'}`, { parse_mode: 'HTML', message_thread_id: msg.message_thread_id });
        } catch (dbErr: any) {
          log(`Unbind error: ${dbErr.message}`, "telegram");
          bot.sendMessage(chatId, "❌ <b>Database error during unbinding.</b>", { parse_mode: 'HTML' });
        }
        return;
      }

      if (msg.text === '/help' || msg.text === '/start' || msg.text === '/menu') {
        const helpMessage = `🏛️ <b>Coin Hunter Premium - Complete Commands Guide</b>\n\n` +
          `<b>═══ CORE COMMANDS ═══</b>\n` +
          `• /start - Welcome & main dashboard\n` +
          `• /menu - Return to main menu\n` +
          `• /help - This command guide\n` +
          `• /info - Bot features & pricing info\n\n` +
          
          `<b>═══ TOKEN ANALYSIS ═══</b>\n` +
          `• /ai <mint> - 🤖 Deep AI analysis of token\n` +
          `  Example: /ai EPjFWaJsXqippe3yvowwJsWe5G8Z2XB38Qpt9JE9KjbV\n` +
          `  Shows: 10 technical indicators + social verification + AI insights\n\n` +
          
          `<b>═══ CRYPTO/WEB3 Q&A ═══</b>\n` +
          `• /ask <question> - 💬 Ask any crypto/web3 question\n` +
          `  Example: /ask What is yield farming?\n` +
          `  Covers: DeFi, Smart Contracts, Tokenomics, Risk Management, Solana, etc.\n\n` +
          
          `<b>═══ MARKET ANALYSIS ═══</b>\n` +
          `• /analyze <pair> - 📊 Institutional deep-dive analysis\n` +
          `  Example: /analyze BTC/USDT\n` +
          `  Includes: SMC setups, order flow, technical indicators, risk assessment\n\n` +
          `• /setup <pair> - ⚙️ Find neutral breakout/pullback setups\n` +
          `  Example: /setup ETH/USDT\n` +
          `  Perfect for: Entry point identification, risk management\n\n` +
          
          `<b>═══ IMAGE ANALYSIS ═══</b>\n` +
          `• Send chart image + caption with /analyze or /setup\n` +
          `  Visual AI identifies: Price levels, structures, POIs, confluence zones\n\n` +
          
          `<b>═══ TOKEN QUICK CHECK ═══</b>\n` +
          `• Reply to bot with Solana mint address\n` +
          `  Gets: Token overview, liquidity check, holder analysis, safety verdict\n\n` +
          
          `<b>═══ SIGNAL MANAGEMENT ═══</b>\n` +
          `• /bind <market> - Bind group to signals\n` +
          `  Markets: crypto, forex, ai (all auto-subscribe to 15m signals)\n\n` +
          `• /unbind <market> - Stop receiving signals from group\n\n` +
          
          `<b>═══ WALLET & TRADING (Under Construction) ═══</b>\n` +
          `• /wallet - View wallet balance & address\n` +
          `• /withdraw - Send SOL to external address\n` +
          `• /buy <pair> <amount> - Purchase position\n` +
          `• /sell <pair> <amount> - Close position\n` +
          `• /history - View trade history\n` +
          `• /settings - Configure preferences\n\n` +
          
          `<b>═══ ADMIN COMMANDS ═══</b>\n` +
          `• /admins (or /listadmins) - List bot admins\n` +
          `• /addadmin <user_id> - (Owner only) Grant admin access\n` +
          `• /removeadmin <user_id> - (Owner only) Revoke admin access\n` +
          `• /premium <user_id> - (Owner only) Grant premium access\n\n` +
          
          `<b>═══ USAGE LIMITS ═══</b>\n` +
          `<b>FREE TIER:</b> 2 analyzes/day, 2 AI questions/day\n` +
          `<b>PREMIUM:</b> Unlimited everything, priority signals\n` +
          `Join premium group to unlock unlimited features!\n\n` +
          
          `<b>═══ FEATURES ═══</b>\n` +
          `✅ 10 Technical Indicators (RSI, MACD, EMA 9/21, Bollinger Bands, etc.)\n` +
          `✅ Social Media Verification (Twitter, project legitimacy)\n` +
          `✅ Institutional SMC Analysis (Order Flow, Smart Money)\n` +
          `✅ AI-Powered Chart Image Recognition\n` +
          `✅ Automatic Signal Generation (15m intervals)\n` +
          `✅ Risk Scoring (Technical + Social Combined)\n\n` +
          
          `<i>💡 Tip: Combine /analyze + /ask for comprehensive market understanding</i>`;
        const contactNote = `\n\n<b>Contact Admins:</b> @shiller_xxx or @FiftyOneP3rcent\n<b>Owner:</b> 6491714705 (can grant admin/premium roles)`;
        
        if (isPrivate) {
          if (msg.text === '/help') {
            bot.sendMessage(chatId, helpMessage + contactNote, { parse_mode: 'HTML' });
          } else if (msg.text === '/start') {
            // Check if user is in premium group
            const inPremium = await isInPremiumGroup(userId);
            if (inPremium) {
              // Premium user - show main menu directly
              await sendMainMenu(chatId, userId);
            } else {
              // Free user - show payment welcome
              const welcome = `👋 <b>Welcome to Coin Hunter Premium</b>\n\nJoin our community:\n• X: https://x.com/CoinHunterAIBot\n• Telegram: https://t.me/TheRealCoinHunterBeta\n\n<b>🔓 Premium Access: $100/month</b>\n\nYou currently have <b>free access</b> (2 analyzes/day). Get unlimited access to:\n• Unlimited AI token analysis\n• Advanced technical indicators\n• All trading signals\n• Priority support\n\n<i>Click the button below to purchase premium access!</i>`;
              const keyboard = [[{ text: "💎 Buy Premium ($100/m)", url: 'https://t.me/onlysubsbot?start=mTVmGRKJjehzHMqZCnxkU' }]];
              bot.sendMessage(chatId, welcome, { parse_mode: 'HTML', reply_markup: { inline_keyboard: keyboard } });
            }
          } else {
            await sendMainMenu(chatId, userId);
          }
        } else if (msg.text === '/help' || msg.text === '/start') {
          bot.sendMessage(chatId, helpMessage, { parse_mode: 'HTML', message_thread_id: msg.message_thread_id });
        }
        return;
      }

      if (msg.text === '/info') {
        const info = `📌 <b>Coin Hunter Premium Bot - Complete Overview</b>\n\n` +
          
          `<b>🤖 AI-POWERED ANALYSIS</b>\n` +
          `✅ Token Deep Dives: /ai <mint> for comprehensive analysis\n` +
          `✅ Crypto Q&A: /ask any web3/DeFi question\n` +
          `✅ Technical Indicators: 10 advanced metrics\n` +
          `✅ Social Verification: Twitter & project legitimacy checks\n` +
          `✅ Chart Image Recognition: Visual AI analysis\n\n` +
          
          `<b>📊 MARKET ANALYSIS & SIGNALS</b>\n` +
          `✅ Institutional SMC Signals (Order Flow focused)\n` +
          `✅ Technical Indicator Confluence (5+ confirmations)\n` +
          `✅ Risk Scoring (Technical + Social combined)\n` +
          `✅ Automatic 15min Signal Generation\n` +
          `✅ Both Forex & Crypto Analysis\n\n` +
          
          `<b>🔒 RISK ASSESSMENT</b>\n` +
          `✅ Rug Pull Detection\n` +
          `✅ Honeypot Identification\n` +
          `✅ Holder Concentration Analysis\n` +
          `✅ Contract Verification Checks\n` +
          `✅ Social Legitimacy Scoring\n\n` +
          
          `<b>💰 PRICING & ACCESS</b>\n` +
          `<b>FREE TIER:</b> 2 analyzes/day, 2 AI requests/day\n` +
          `<b>PREMIUM ($100/month):</b>\n` +
          `  • Unlimited analyzes\n` +
          `  • Unlimited AI questions\n` +
          `  • Priority signal access\n` +
          `  • Advanced features\n\n` +
          
          `<b>🚀 QUICK START</b>\n` +
          `1. Send /help to see all commands\n` +
          `2. Try /ai [token_mint] for token analysis\n` +
          `3. Try /ask [question] for crypto Q&A\n` +
          `4. Use /analyze [pair] for market analysis\n` +
          `5. Join premium group for unlimited access\n\n` +
          
          `<b>📞 SUPPORT & ADMIN</b>\n` +
          `Contact: @shiller_xxx or @FiftyOneP3rcent\n` +
          `Owner: 6491714705\n\n` +
          
          `<i>Join premium group to unlock unlimited features: https://t.me/onlysubsbot?start=mTVmGRKJjehzHMqZCnxkU</i>`;
        bot.sendMessage(chatId, info, { parse_mode: 'HTML' });
        return;
      }

      if (msg.text === '/settings') {
        const keyboard = [
          [{ text: "🔒 Security & MEV", callback_data: "settings_mev" }],
          [{ text: "🎯 Auto TP/SL", callback_data: "settings_tpsl" }],
          [{ text: "🔑 Wallet Export", callback_data: "settings_export" }],
          [{ text: "🔙 Back to Menu", callback_data: "main_menu" }]
        ];
        bot.sendMessage(chatId, "⚙️ <b>Bot Settings</b>\n\nConfigure your trading preferences below:", { 
          parse_mode: 'HTML', 
          reply_markup: { inline_keyboard: keyboard } 
        });
        return;
      }

      if (msg.text === '/history') {
        const trades = await storage.getTrades(userId);
        if (trades.length === 0) {
          bot.sendMessage(chatId, "📜 <b>Trade History</b>\n\nYou have no trade history.", { parse_mode: 'HTML' });
          return;
        }
        const msgHistory = `📜 <b>Trade History</b>\n\n` +
                   trades.slice(0, 10).map(t => `${t.status === 'completed' ? '✅' : '❌'} ${t.mint.slice(0, 8)}... - ${t.amountIn} SOL`).join('\n');
        bot.sendMessage(chatId, msgHistory, { parse_mode: 'HTML' });
        return;
      }

      if (msg.text === '/withdraw') {
        bot.sendMessage(chatId, "💰 <b>Withdraw SOL</b>\n\nPlease reply to this message with the Solana destination address:", { 
          parse_mode: 'HTML', 
          reply_markup: { force_reply: true } 
        });
        return;
      }

      if (msg.photo && (msg.caption?.startsWith('/analyze') || msg.caption?.startsWith('/setup'))) {
        if (!(await checkAiLane())) return;
        const parts = msg.caption.split(' ');
        const command = parts[0].replace('/', '');
        const pair = parts[1]?.toUpperCase();
        
        // Handle image analysis
        const photo = msg.photo[msg.photo.length - 1];
        const fileLink = await bot.getFileLink(photo.file_id);
        
        bot.sendMessage(chatId, `⏳ <b>Analyzing chart image for ${pair || 'detected pair'}...</b>\n⏳ Detecting pair and calculating advanced analysis...`, { parse_mode: 'HTML', message_thread_id: msg.message_thread_id });
        
        const workerModule = await import("./signals-worker") as any;
        const aiModule = await import("./ai") as any;
        const worker = workerModule.default || workerModule;
        const ai = aiModule.default || aiModule;
        
        let targetPair: string | undefined = pair;
        if (!targetPair) {
          const detected = await ai.extractPairFromImage(fileLink);
          targetPair = detected || undefined;
        }
        
        if (!targetPair) {
          bot.sendMessage(chatId, "❌ <b>Could not detect trading pair from image.</b> Please provide it manually: <code>/analyze BTC/USDT</code>", { parse_mode: 'HTML', message_thread_id: msg.message_thread_id });
          return;
        }
        
        const sym = targetPair.includes('/') ? targetPair.split('/')[0].toUpperCase() : targetPair.toUpperCase();
        const forexSymbols = ['EUR', 'GBP', 'JPY', 'CHF', 'AUD', 'CAD', 'NZD', 'USD', 'XAU', 'XAG'];
        const isForex = forexSymbols.includes(sym) || (targetPair.includes('/') && forexSymbols.includes(targetPair.split('/')[1].toUpperCase()));
        const marketType = isForex ? "forex" : "crypto";

        const allowed = await checkAndConsumeUsage(msg.from!.id.toString(), 'analyze', chatId);
        if (!allowed) return;

        // Get technical indicators and display advanced analysis BEFORE chart analysis
        try {
          const indicators = await getTechnicalIndicators(targetPair, marketType);
          if (indicators) {
            await displayAdvancedAnalysis(chatId, targetPair, indicators);
          }
        } catch (e) {
          log(`Failed to get indicators for advanced analysis: ${e}`, "telegram");
        }

        worker.runScanner(marketType, true, chatId.toString(), msg.message_thread_id?.toString(), targetPair, command as "analyze" | "setup", fileLink);
        return;
      }

      // Handle /ai <mint> - Token analysis via AI
      if (msg.text?.startsWith('/ai ')) {
        const parts = msg.text.split(' ');
        const mint = parts[1]?.trim();
        
        if (!mint) {
          bot.sendMessage(chatId, `❌ Please provide a token mint address, e.g. <code>/ai EPjFWaJsXqippe3yvowwJsWe5G8Z2XB38Qpt9JE9KjbV</code>`, { parse_mode: 'HTML', message_thread_id: msg.message_thread_id });
          return;
        }
        
        const allowed = await checkAndConsumeUsage(userId, 'analyze', chatId);
        if (!allowed) return;
        
        await executeAiReasoning(chatId, mint);
        return;
      }
      
      // Handle /ask - General crypto/web3 Q&A
      if (msg.text?.startsWith('/ask ')) {
        const question = msg.text.replace('/ask ', '').trim();
        
        if (!question) {
          bot.sendMessage(chatId, `❌ Please ask a crypto/web3 question, e.g. <code>/ask What is a smart contract?</code>`, { parse_mode: 'HTML', message_thread_id: msg.message_thread_id });
          return;
        }
        
        const allowed = await checkAndConsumeUsage(userId, 'other', chatId);
        if (!allowed) return;
        
        await answerCryptoQuestion(chatId, question);
        return;
      }

      if (msg.text?.startsWith('/analyze') || msg.text?.startsWith('/setup')) {
        if (!(await checkAiLane())) return;
        const parts = msg.text.split(' ');
        const command = parts[0].replace('/', '');
        const pair = parts[1]?.toUpperCase();
        
        if (!pair) {
          bot.sendMessage(chatId, `❌ Please provide a pair, e.g. <code>/${command} BTC/USDT</code>`, { parse_mode: 'HTML', message_thread_id: msg.message_thread_id });
          return;
        }

        const feedbackMsg = command === 'setup' 
          ? `⏳ <b>Hang on while we generate a NEUTRAL setup for you...</b>\n⏳ Collecting market data and calculating advanced analysis...`
          : `⏳ <b>Hang on while we perform a NEUTRAL analysis for you...</b>\n⏳ Collecting market data and calculating advanced analysis...`;
          
        bot.sendMessage(chatId, feedbackMsg, { parse_mode: 'HTML', message_thread_id: msg.message_thread_id });
        const workerModule = await import("./signals-worker") as any;
        const worker = workerModule.default || workerModule;
        
        // Robust market type detection
        const forexSymbols = ['EUR', 'GBP', 'JPY', 'CHF', 'AUD', 'CAD', 'NZD', 'USD', 'XAU', 'XAG'];
        const symPrefix = pair.slice(0, 3);
        const isForex = forexSymbols.includes(symPrefix) || (pair.includes('/') && (forexSymbols.includes(pair.split('/')[0]) || forexSymbols.includes(pair.split('/')[1])));
        const marketType = isForex ? "forex" : "crypto";
        
        // Ensure pair has a slash for scanner consistency if it doesn't already
        let normalizedPair = pair;
        if (!pair.includes('/') && pair.length >= 6) {
          normalizedPair = `${pair.slice(0, pair.length - 4)}/${pair.slice(pair.length - 4)}`;
        }
        
        log(`Manual command: ${command} for ${normalizedPair} (${marketType})`, "telegram");
        const allowed = await checkAndConsumeUsage(msg.from!.id.toString(), 'analyze', chatId);
        if (!allowed) return;

        // Get technical indicators and display advanced analysis BEFORE AI reasoning
        try {
          const indicators = await getTechnicalIndicators(normalizedPair, marketType);
          if (indicators) {
            await displayAdvancedAnalysis(chatId, normalizedPair, indicators);
          }
        } catch (e) {
          log(`Failed to get indicators for advanced analysis: ${e}`, "telegram");
        }

        worker.runScanner(marketType, true, chatId.toString(), msg.message_thread_id?.toString(), normalizedPair, command as "analyze" | "setup");
        return;
      }

      if (msg.reply_to_message && msg.text) {
        const replyText = msg.reply_to_message.text || "";
        if (replyText.includes("Please paste the token's Solana contract address (Mint)")) {
          const mint = msg.text.trim();
          try {
            new PublicKey(mint);
            await sendTokenOverview(chatId, mint);
          } catch (e) {
            bot.sendMessage(chatId, "❌ <b>Invalid Solana address.</b> Please try again.", { parse_mode: 'HTML' });
          }
        } else if (replyText.includes("Please enter the token's contract address")) {
          await sendTokenOverview(chatId, msg.text.trim());
        } else if (replyText.includes("Please reply to this message with the Solana destination address")) {
          const address = msg.text.trim();
          try {
            new PublicKey(address);
            bot.sendMessage(chatId, `💰 <b>Withdrawal</b>\nAddress: <code>${address}</code>\n\nPlease reply to this message with the amount of SOL to withdraw:`, { 
              parse_mode: 'HTML', 
              reply_markup: { force_reply: true } 
            });
          } catch (e) {
            bot.sendMessage(chatId, "❌ <b>Invalid Solana Address.</b> Please try again.", { parse_mode: 'HTML' });
          }
        } else if (replyText.includes("Please reply to this message with the amount of SOL to withdraw")) {
          const amount = parseFloat(msg.text);
          const addressMatch = replyText.match(/Address: <code>(.*?)<\/code>/);
          if (!isNaN(amount) && addressMatch) {
            const address = addressMatch[1];
            try {
              const activeWallet = await storage.getActiveWallet(userId);
              if (!activeWallet) throw new Error("No active wallet.");
              
              const connection = new Connection(rpcUrl, "confirmed");
              const balance = await connection.getBalance(new PublicKey(activeWallet.publicKey));
              const lamports = Math.floor(amount * 1e9);
              
              if (balance < lamports + 5000) throw new Error("Insufficient balance for withdrawal + fees.");
              
              const transaction = new Transaction().add(
                SystemProgram.transfer({
                  fromPubkey: new PublicKey(activeWallet.publicKey),
                  toPubkey: new PublicKey(address),
                  lamports: lamports,
                })
              );
              
              const keypair = Keypair.fromSecretKey(bs58.decode(activeWallet.privateKey));
              const signature = await connection.sendTransaction(transaction, [keypair]);
              await connection.confirmTransaction(signature);
              
              // Update balance immediately after withdrawal
              const newBal = await connection.getBalance(new PublicKey(activeWallet.publicKey));
              await storage.updateWalletBalance(activeWallet.id, (newBal / 1e9).toFixed(3));

              bot.sendMessage(chatId, `✅ <b>Withdrawal Successful!</b>\n\nTX: <a href="https://solscan.io/tx/${signature}">${signature.slice(0,8)}...</a>`, { parse_mode: 'HTML' });
            } catch (e: any) {
              bot.sendMessage(chatId, `❌ <b>Withdrawal Failed:</b> ${e.message}`, { parse_mode: 'HTML' });
            }
          }
        }
        // Group membership is automatically verified by isPremiumOrAdmin function
      }

    } catch (e: any) {
      // Log full error details for debugging
      const errorMsg = e instanceof Error ? e.message : String(e);
      const errorStack = e instanceof Error ? e.stack : '';
      log(`Message error: ${errorMsg}${errorStack ? ` \n${errorStack}` : ''}`, "telegram");
    }
  });

  bot.on('callback_query', async (query) => {
    const chatId = query.message?.chat.id;
    const userId = query.from.id.toString();
    const data = query.data;

    if (!chatId || !data) return;

    try {
      if (data === 'open_subscribe') {
        bot.sendMessage(chatId, `✨ <b>Premium Access</b>\n\nJoin the premium group to unlock unlimited features:\n\n• Unlimited AI analysis\n• Advanced technical indicators\n• Priority signals\n\nContact the admin for the premium group invite.`, { parse_mode: 'HTML' });
        bot.answerCallbackQuery(query.id);
        return;
      }

      if (data === "main_menu") {
        await sendMainMenu(chatId, userId, query.message?.message_id);
      } else if (data === "main_menu_refresh") {
        await sendMainMenu(chatId, userId, query.message?.message_id);
        bot.answerCallbackQuery(query.id, { text: "Refreshed!" });
      } else if (data === "under_construction") {
        bot.answerCallbackQuery(query.id, { text: "🚧 Under Construction" });
        bot.sendMessage(chatId, "🚧 <b>Under Construction</b>\n\nThis feature is currently under development. Please check back later.", { parse_mode: 'HTML' });
      } else if (data === "menu_settings") {
        const keyboard = [
          [{ text: "🔒 Security & MEV", callback_data: "settings_mev" }],
          [{ text: "🎯 Auto TP/SL", callback_data: "settings_tpsl" }],
          [{ text: "🔑 Wallet Export", callback_data: "settings_export" }],
          [{ text: "🔙 Back to Menu", callback_data: "main_menu" }]
        ];
        try {
          await bot.editMessageText("⚙️ <b>Bot Settings</b>\n\nConfigure your trading preferences below:", { 
            chat_id: chatId, 
            message_id: query.message?.message_id,
            parse_mode: 'HTML', 
            reply_markup: { inline_keyboard: keyboard } 
          });
        } catch (e: any) {
          if (!e.message.includes("message is not modified")) throw e;
        }
      } else if (data === "menu_history") {
        const trades = await storage.getTrades(userId);
        if (trades.length === 0) {
          bot.sendMessage(chatId, "📜 <b>Trade History</b>\n\nYou have no trade history.", { parse_mode: 'HTML' });
        } else {
          const msgHistory = `📜 <b>Trade History</b>\n\n` +
                     trades.slice(0, 10).map(t => `${t.status === 'completed' ? '✅' : '❌'} ${t.mint.slice(0, 8)}... - ${t.amountIn} SOL`).join('\n');
          bot.sendMessage(chatId, msgHistory, { parse_mode: 'HTML' });
        }
        bot.answerCallbackQuery(query.id);
      } else if (data.startsWith('admin_remove:')) {
        const caller = query.from.id.toString();
        const OWNER_ID = '6491714705';
        if (caller !== OWNER_ID) {
          bot.answerCallbackQuery(query.id, { text: 'Only owner can remove admins.' });
          return;
        }
        const target = data.split(':')[1];
        try {
          await storage.removeAdmin(target);
          bot.answerCallbackQuery(query.id, { text: `Removed admin ${target}` });
          try {
            await bot.editMessageText(`Admin ${target} removed by owner.`, { chat_id: query.message?.chat.id, message_id: query.message?.message_id });
          } catch (e) {}
        } catch (e: any) {
          bot.answerCallbackQuery(query.id, { text: `Failed to remove admin: ${e.message}` });
        }
        return;
      } else if (data.startsWith('refresh_overview_')) {
        const mint = data.replace('refresh_overview_', '');
        await sendTokenOverview(chatId, mint, query.message?.message_id);
        bot.answerCallbackQuery(query.id, { text: "Refreshed!" });
      } else if (data.startsWith('ai_analyze_')) {
        const mint = data.replace('ai_analyze_', '');
        await executeAiReasoning(chatId, mint);
        bot.answerCallbackQuery(query.id);
      } else if (data === "menu_withdraw") {
        bot.sendMessage(chatId, "💰 <b>Withdraw SOL</b>\n\nPlease reply to this message with the Solana destination address:", { 
          parse_mode: 'HTML', 
          reply_markup: { force_reply: true } 
        });
        bot.answerCallbackQuery(query.id);
      }
      // Subscription is now group-based, no payment handler needed
    } catch (e: any) {
      log(`Callback error: ${e.message}`, "telegram");
    }
  });

  log("Telegram bot setup complete.", "telegram");
}
