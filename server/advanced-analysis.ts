/**
 * Advanced Analysis System
 * Confluence, Multi-Timeframe, Risk/Reward, Divergence, Patterns, Win Rate Tracking
 */

export interface TimeframeData {
  timeframe: string; // "5m" | "15m" | "1h" | "4h" | "1d"
  rsi: number;
  macdSignal: string;
  trendDirection: "up" | "down" | "neutral";
  strength: number; // 0-100
}

export interface ConfluenceScore {
  totalIndicators: number;
  agreeingIndicators: number;
  confluencePercent: number;
  bullishCount: number;
  bearishCount: number;
  confidenceLevel: "very-low" | "low" | "moderate" | "high" | "very-high";
  tradeable: boolean; // true if >= 60% confluence
}

export interface RiskRewardSetup {
  entryPrice: number;
  takeProfit: number;
  stopLoss: number;
  riskRewardRatio: number; // TP / SL (should be >= 2:1)
  isValid: boolean; // true if R:R >= 2:1
  positionSize: number; // calculated based on risk
  potentialGain: number; // %
  potentialLoss: number; // %
}

export interface DivergenceSignal {
  type: "bullish" | "bearish" | "none";
  indicator: "rsi" | "macd" | "price";
  strength: "weak" | "moderate" | "strong";
  description: string;
}

export interface MarketRegime {
  regime: "trending" | "ranging" | "breakout" | "reversal";
  adxValue: number;
  volatility: "low" | "medium" | "high" | "extreme";
  recommendation: string; // trading style advice
}

export interface PatternSignal {
  pattern: string; // "triangle" | "flag" | "wedge" | "cup_handle" | "double_top" | "double_bottom"
  confidence: number; // 0-100
  direction: "bullish" | "bearish";
  breakoutLevel: number;
}

export interface SmartEntry {
  shouldEnter: boolean;
  reason: string;
  entryType: "immediate" | "candle-confirmation" | "support-bounce" | "breakout";
  entryPrice: number;
  entryWaitTime: number; // minutes to wait before entering
}

export interface WinRateStats {
  totalSignals: number;
  winningSignals: number;
  losingSignals: number;
  winRate: number; // percent
  averageWin: number; // percent profit
  averageLoss: number; // percent loss
  profitFactor: number; // total wins / total losses
  bestPatterns: string[]; // highest win rate patterns
}

export interface AdvancedAnalysisResult {
  confluence: ConfluenceScore;
  multiTimeframe: TimeframeData[];
  timeframeAlignment: string; // "strong-bullish" | "bullish" | "neutral" | "bearish" | "strong-bearish"
  riskReward: RiskRewardSetup;
  divergence: DivergenceSignal;
  marketRegime: MarketRegime;
  patternSignals: PatternSignal[];
  smartEntry: SmartEntry;
  onChainMetrics: {
    holderConcentration: number; // % (higher = more risk)
    rugRiskScore: number; // 0-100 (higher = more risk)
    communityScore: number; // 0-100 (higher = better)
  };
  winRateData: WinRateStats;
  finalSignal: {
    signal: "STRONG-BUY" | "BUY" | "NEUTRAL" | "SELL" | "STRONG-SELL" | "SKIP";
    confidence: number; // 0-100
    reason: string;
  };
}

/**
 * Calculate Confluence Score (% of indicators agreeing)
 */
export function calculateConfluenceScore(indicators: {
  rsi: { value: number; signal: string };
  macd: { signal: string };
  ema: { signal: string };
  bollinger: { position: string };
  vwap: { price_vs_vwap: string };
  adx: { strength: string };
  stoch: { signal: string };
  ichimoku: { cloud_signal: string };
  obv: { trend: string };
  atr: { volatility: string };
}): ConfluenceScore {
  let bullishCount = 0;
  let bearishCount = 0;
  let totalSignals = 0;

  const bullishSignals = [
    indicators.rsi.signal.includes("Bullish"),
    indicators.macd.signal.includes("Bullish"),
    indicators.ema.signal.includes("Bullish"),
    indicators.bollinger.position.includes("Lower"),
    indicators.vwap.price_vs_vwap.includes("Above"),
    indicators.stoch.signal.includes("Bullish"),
    indicators.ichimoku.cloud_signal.includes("Bullish"),
    indicators.obv.trend === "Bullish",
  ];

  const bearishSignals = [
    indicators.rsi.signal.includes("Bearish"),
    indicators.macd.signal.includes("Bearish"),
    indicators.ema.signal.includes("Bearish"),
    indicators.bollinger.position.includes("Upper"),
    indicators.vwap.price_vs_vwap.includes("Below"),
    indicators.stoch.signal.includes("Bearish"),
    indicators.ichimoku.cloud_signal.includes("Bearish"),
    indicators.obv.trend === "Bearish",
  ];

  bullishCount = bullishSignals.filter(Boolean).length;
  bearishCount = bearishSignals.filter(Boolean).length;
  totalSignals = bullishCount + bearishCount;

  const confluencePercent = totalSignals > 0 ? Math.max(bullishCount, bearishCount) / totalSignals * 100 : 50;

  let confidenceLevel: "very-low" | "low" | "moderate" | "high" | "very-high" = "very-low";
  if (confluencePercent >= 90) confidenceLevel = "very-high";
  else if (confluencePercent >= 75) confidenceLevel = "high";
  else if (confluencePercent >= 60) confidenceLevel = "moderate";
  else if (confluencePercent >= 40) confidenceLevel = "low";

  return {
    totalIndicators: 10,
    agreeingIndicators: Math.max(bullishCount, bearishCount),
    confluencePercent: Math.round(confluencePercent),
    bullishCount,
    bearishCount,
    confidenceLevel,
    tradeable: confluencePercent >= 60
  };
}

/**
 * Detect Divergences (Price vs Indicators)
 */
export function detectDivergence(priceHistory: number[], rsiHistory: number[]): DivergenceSignal {
  if (priceHistory.length < 5) {
    return { type: "none", indicator: "price", strength: "weak", description: "Insufficient data" };
  }

  const recentPrice = priceHistory.slice(-5);
  const recentRSI = rsiHistory.slice(-5);

  // Bullish Divergence: Price makes new low but RSI doesn't
  const priceNewLow = recentPrice[recentPrice.length - 1] < Math.min(...recentPrice.slice(0, -1));
  const rsiNotLow = recentRSI[recentRSI.length - 1] > Math.min(...recentRSI.slice(0, -1)) + 5;

  if (priceNewLow && rsiNotLow) {
    return {
      type: "bullish",
      indicator: "rsi",
      strength: "strong",
      description: "Price makes new low but RSI diverges - potential reversal"
    };
  }

  // Bearish Divergence: Price makes new high but RSI doesn't
  const priceNewHigh = recentPrice[recentPrice.length - 1] > Math.max(...recentPrice.slice(0, -1));
  const rsiNotHigh = recentRSI[recentRSI.length - 1] < Math.max(...recentRSI.slice(0, -1)) - 5;

  if (priceNewHigh && rsiNotHigh) {
    return {
      type: "bearish",
      indicator: "rsi",
      strength: "strong",
      description: "Price makes new high but RSI diverges - potential reversal"
    };
  }

  return { type: "none", indicator: "price", strength: "weak", description: "No divergence detected" };
}

/**
 * Determine Market Regime (Trending vs Ranging)
 */
export function determineMarketRegime(adxValue: number, atrPercent: number, priceHistory: number[]): MarketRegime {
  let regime: "trending" | "ranging" | "breakout" | "reversal" = "ranging";
  let volatility: "low" | "medium" | "high" | "extreme" = "medium";

  // Volatility classification
  if (atrPercent > 3) volatility = "extreme";
  else if (atrPercent > 2) volatility = "high";
  else if (atrPercent > 1) volatility = "medium";
  else volatility = "low";

  // ADX > 25 = trending, < 25 = ranging
  if (adxValue > 25) {
    regime = "trending";

    // Check if near breakout (recent price movement)
    const recent = priceHistory.slice(-5);
    const range = Math.max(...recent) - Math.min(...recent);
    const avgPrice = recent.reduce((a, b) => a + b) / recent.length;
    if (range / avgPrice > 0.02) regime = "breakout"; // >2% move in 5 candles
  } else {
    regime = "ranging";

    // Check for reversal signals (oversold/overbought + divergence)
    const recentHigh = Math.max(...priceHistory.slice(-10));
    const recentLow = Math.min(...priceHistory.slice(-10));
    if (Math.abs(recentHigh - recentLow) / recentLow < 0.01) {
      regime = "reversal"; // tight consolidation = reversal imminent
    }
  }

  let recommendation = "Hold";
  switch (regime) {
    case "trending":
      recommendation = adxValue > 30 ? "Follow the trend, use breakouts" : "Trade with trend confirmation";
      break;
    case "ranging":
      recommendation = "Trade support/resistance bounces, avoid breakouts";
      break;
    case "breakout":
      recommendation = "Enter on breakout with stop behind support/resistance";
      break;
    case "reversal":
      recommendation = "Watch for reversal setup, take divergence signals seriously";
      break;
  }

  return { regime, adxValue, volatility, recommendation };
}

/**
 * Recognize Chart Patterns
 */
export function recognizePatterns(priceHistory: number[]): PatternSignal[] {
  const patterns: PatternSignal[] = [];

  if (priceHistory.length < 10) return patterns;

  const recent = priceHistory.slice(-20);
  const current = recent[recent.length - 1];

  // Triangle Pattern: Decreasing highs and increasing lows
  const recentHighs = [];
  const recentLows = [];
  for (let i = 0; i < recent.length - 1; i++) {
    if (recent[i] > (recent[i - 1] || 0) && recent[i] > (recent[i + 1] || 0)) recentHighs.push(recent[i]);
    if (recent[i] < (recent[i - 1] || 0) && recent[i] < (recent[i + 1] || 0)) recentLows.push(recent[i]);
  }

  if (recentHighs.length >= 2 && recentLows.length >= 2) {
    const highsDecreasing = recentHighs[recentHighs.length - 1] < recentHighs[0];
    const lowsIncreasing = recentLows[recentLows.length - 1] > recentLows[0];

    if (highsDecreasing && lowsIncreasing) {
      const direction = current > (recentHighs[recentHighs.length - 1] + recentLows[recentLows.length - 1]) / 2 ? "bullish" : "bearish";
      patterns.push({
        pattern: "triangle",
        confidence: 75,
        direction: direction as any,
        breakoutLevel: direction === "bullish" ? recentHighs[recentHighs.length - 1] * 1.01 : recentLows[recentLows.length - 1] * 0.99
      });
    }
  }

  // Cup & Handle Pattern: U-shaped recovery
  if (recent.length >= 8) {
    const mid = Math.floor(recent.length / 2);
    const leftHalf = recent.slice(0, mid);
    const rightHalf = recent.slice(mid);

    const leftLow = Math.min(...leftHalf);
    const rightLow = Math.min(...rightHalf);
    const handle = Math.max(...rightHalf.slice(-3));

    if (leftLow < current && rightLow > leftLow && handle < Math.max(...leftHalf)) {
      patterns.push({
        pattern: "cup_handle",
        confidence: 80,
        direction: "bullish",
        breakoutLevel: Math.max(...leftHalf) * 1.01
      });
    }
  }

  // Double Bottom Pattern
  const sortedLows = [...recent].sort((a, b) => a - b);
  if (sortedLows[0] === sortedLows[1] && sortedLows[0] < sortedLows[2] * 0.98) {
    patterns.push({
      pattern: "double_bottom",
      confidence: 70,
      direction: "bullish",
      breakoutLevel: sortedLows[2] * 1.01
    });
  }

  return patterns;
}

/**
 * Smart Entry Rules
 */
export function determineSmartEntry(
  indicators: any,
  priceHistory: number[],
  patterns: PatternSignal[]
): SmartEntry {
  const current = priceHistory[priceHistory.length - 1];
  const previous = priceHistory[priceHistory.length - 2];
  const candleClosedAboveLevel = current > previous;

  // Immediate entry: Only if very high confluence (80%+)
  // and pattern confirmed
  if (indicators.overall.score >= 80 && patterns.length > 0) {
    return {
      shouldEnter: true,
      reason: "High confluence + pattern confirmation",
      entryType: "immediate",
      entryPrice: current,
      entryWaitTime: 0
    };
  }

  // Candle Confirmation: Wait for candle close above resistance
  if (indicators.overall.score >= 70 && !candleClosedAboveLevel) {
    return {
      shouldEnter: true,
      reason: "Wait for candle confirmation above level",
      entryType: "candle-confirmation",
      entryPrice: current * 1.005, // slightly above current
      entryWaitTime: 5 // 5 minutes typically
    };
  }

  // Support Bounce Entry
  if (indicators.bollinger && indicators.bollinger.position.includes("Lower")) {
    return {
      shouldEnter: true,
      reason: "Watch for bounce from lower Bollinger band",
      entryType: "support-bounce",
      entryPrice: indicators.bollinger.lower,
      entryWaitTime: 0
    };
  }

  // Breakout Entry: On pattern breakout
  if (patterns.length > 0 && indicators.overall.score >= 60) {
    return {
      shouldEnter: true,
      reason: `Pattern breakout setup detected`,
      entryType: "breakout",
      entryPrice: patterns[0].breakoutLevel,
      entryWaitTime: 0
    };
  }

  return {
    shouldEnter: false,
    reason: "No high-confidence entry setup detected",
    entryType: "immediate",
    entryPrice: current,
    entryWaitTime: 0
  };
}

/**
 * Calculate Risk/Reward Setup
 */
export function calculateRiskReward(
  entryPrice: number,
  support: number,
  resistance: number,
  atrValue: number,
  accountRisk: number = 2 // risk 2% of account per trade
): RiskRewardSetup {
  const minRiskDistance = atrValue * 1.5; // SL 1.5 ATR below entry
  const minRewardDistance = atrValue * 3; // TP at least 3 ATR above entry

  let stopLoss = entryPrice - minRiskDistance;
  if (stopLoss > support) stopLoss = support * 0.99; // Just below support

  let takeProfit = entryPrice + minRewardDistance;
  if (takeProfit < resistance) takeProfit = resistance * 1.01; // Just above resistance

  const riskAmount = entryPrice - stopLoss;
  const rewardAmount = takeProfit - entryPrice;
  const riskRewardRatio = rewardAmount / riskAmount;

  // Position size calculation: risk 2% per trade
  const positionSize = accountRisk / (riskAmount / entryPrice) * 100;

  return {
    entryPrice,
    takeProfit: parseFloat(takeProfit.toFixed(8)),
    stopLoss: parseFloat(stopLoss.toFixed(8)),
    riskRewardRatio: parseFloat(riskRewardRatio.toFixed(2)),
    isValid: riskRewardRatio >= 2,
    positionSize: parseFloat(positionSize.toFixed(2)),
    potentialGain: parseFloat(((rewardAmount / entryPrice) * 100).toFixed(2)),
    potentialLoss: parseFloat(((riskAmount / entryPrice) * 100).toFixed(2))
  };
}

/**
 * Multi-Timeframe Analysis
 */
export function analyzeMultiTimeframe(timeframes: TimeframeData[]): string {
  if (timeframes.length === 0) return "neutral";

  const bullish = timeframes.filter(tf => tf.trendDirection === "up").length;
  const bearish = timeframes.filter(tf => tf.trendDirection === "down").length;

  // For alignment, all timeframes should agree
  if (bullish === timeframes.length) return "strong-bullish";
  if (bearish === timeframes.length) return "strong-bearish";
  if (bullish > bearish + 1) return "bullish";
  if (bearish > bullish + 1) return "bearish";

  return "neutral";
}

/**
 * Calculate Win Rate Stats
 */
export function calculateWinRateStats(tradingHistory: Array<{
  pattern?: string;
  entry: number;
  exit: number;
  won: boolean;
}>): WinRateStats {
  if (tradingHistory.length === 0) {
    return {
      totalSignals: 0,
      winningSignals: 0,
      losingSignals: 0,
      winRate: 0,
      averageWin: 0,
      averageLoss: 0,
      profitFactor: 0,
      bestPatterns: []
    };
  }

  const winning = tradingHistory.filter(t => t.won);
  const losing = tradingHistory.filter(t => !t.won);

  const totalWins = winning.reduce((sum, t) => sum + ((t.exit - t.entry) / t.entry * 100), 0);
  const totalLosses = losing.reduce((sum, t) => sum + ((t.exit - t.entry) / t.entry * 100), 0);

  const patternWinRates: { [key: string]: number } = {};
  tradingHistory.forEach(t => {
    if (t.pattern) {
      if (!patternWinRates[t.pattern]) patternWinRates[t.pattern] = 0;
      patternWinRates[t.pattern] += t.won ? 1 : 0;
    }
  });

  const bestPatterns = Object.entries(patternWinRates)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(p => p[0]);

  return {
    totalSignals: tradingHistory.length,
    winningSignals: winning.length,
    losingSignals: losing.length,
    winRate: Math.round((winning.length / tradingHistory.length) * 100),
    averageWin: winning.length > 0 ? totalWins / winning.length : 0,
    averageLoss: losing.length > 0 ? totalLosses / losing.length : 0,
    profitFactor: Math.abs(totalWins / (totalLosses || 1)),
    bestPatterns
  };
}

/**
 * Generate Final Trading Signal with All Analysis
 */
export function generateFinalSignal(result: Partial<AdvancedAnalysisResult>): {
  signal: "STRONG-BUY" | "BUY" | "NEUTRAL" | "SELL" | "STRONG-SELL" | "SKIP";
  confidence: number;
  reason: string;
} {
  const checks = {
    confluencePass: result.confluence?.confluencePercent || 0 >= 60,
    timeframePass: result.timeframeAlignment === "strong-bullish" || result.timeframeAlignment === "bullish",
    riskRewardPass: result.riskReward?.isValid || false,
    entryReady: result.smartEntry?.shouldEnter || false,
    regimeAccepts: result.marketRegime?.regime !== "ranging" || false
  };

  const passedChecks = Object.values(checks).filter(Boolean).length;
  const confidence = Math.round((passedChecks / Object.values(checks).length) * 100);

  if (!checks.confluencePass || !checks.riskRewardPass) {
    return { signal: "SKIP", confidence: 0, reason: "Failed confluence or risk/reward filters" };
  }

  if (passedChecks === 5) {
    return { signal: "STRONG-BUY", confidence, reason: "All checks passed - ideal setup" };
  }

  if (passedChecks >= 4) {
    return { signal: "BUY", confidence, reason: "Most checks passed - good setup" };
  }

  if (passedChecks >= 3) {
    return { signal: "NEUTRAL", confidence, reason: "Mixed signals - use caution" };
  }

  return { signal: "SKIP", confidence, reason: "Insufficient confluent signals" };
}
