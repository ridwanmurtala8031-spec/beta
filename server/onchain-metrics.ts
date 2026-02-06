/**
 * On-Chain Metrics Module
 * Advanced Solana blockchain analysis for token risk assessment
 */

export interface OnChainMetrics {
  holderDistribution: {
    topHolderPercent: number; // % held by top 10
    concentration: "low" | "medium" | "high" | "critical";
    rugRiskScore: number; // 0-100
  };
  liquidityAnalysis: {
    liquidityLocked: number; // % locked
    liquidityTrend: "increasing" | "stable" | "decreasing";
    liquidityScore: number; // 0-100
  };
  volumeAnalysis: {
    volume24h: number;
    volumeTrend: number; // % change
    volumeQuality: "low" | "medium" | "high";
  };
  transactionAnalysis: {
    buySellRatio: number;
    whaleActivity: "buying" | "selling" | "neutral";
    buyerCount: number;
    sellerCount: number;
  };
  smartMoneySignals: {
    whaleAccumulation: boolean;
    institutionalActivity: boolean;
    tradingBotActivity: boolean;
    tradeSize: "micro" | "small" | "medium" | "large" | "whale";
  };
  communityScore: number; // 0-100 combined
  overallRiskScore: number; // 0-100 (0=safest, 100=highest risk)
}

export interface HolderAnalysis {
  totalHolders: number;
  top10Percent: number;
  top50Percent: number;
  dilution: number; // % distributed
  concentration: "decentralized" | "balanced" | "concentrated" | "danger" | "extreme";
  rugRiskLevel: "low" | "medium" | "high" | "critical";
}

export interface ExchangeFlows {
  inflow24h: number;
  outflow24h: number;
  netFlow: number;
  flowTrend: "bullish" | "bearish" | "neutral";
  whaleMovement: "accumulating" | "distributing" | "neutral";
}

/**
 * Analyze Holder Distribution
 * Higher concentration = higher rug pull risk
 */
export function analyzeHolderDistribution(holders: Array<{ address: string; balance: number }>): HolderAnalysis {
  if (holders.length === 0) {
    return {
      totalHolders: 0,
      top10Percent: 0,
      top50Percent: 0,
      dilution: 0,
      concentration: "decentralized",
      rugRiskLevel: "medium"
    };
  }

  const totalSupply = holders.reduce((sum, h) => sum + h.balance, 0);
  const sortedByBalance = holders.sort((a, b) => b.balance - a.balance);

  // Top 10 holders
  const top10 = sortedByBalance.slice(0, 10).reduce((sum, h) => sum + h.balance, 0);
  const top10Percent = (top10 / totalSupply) * 100;

  // Top 50 holders
  const top50 = sortedByBalance.slice(0, 50).reduce((sum, h) => sum + h.balance, 0);
  const top50Percent = (top50 / totalSupply) * 100;

  // Determine concentration level
  let concentration: "decentralized" | "balanced" | "concentrated" | "danger" | "extreme";
  if (top10Percent < 20) concentration = "decentralized";
  else if (top10Percent < 40) concentration = "balanced";
  else if (top10Percent < 60) concentration = "concentrated";
  else if (top10Percent < 80) concentration = "danger";
  else concentration = "extreme";

  // Rug risk assessment
  let rugRiskLevel: "low" | "medium" | "high" | "critical" = "low";
  if (top10Percent > 50) rugRiskLevel = "critical"; // Single entity controls >50%
  else if (top10Percent > 40) rugRiskLevel = "high"; // High concentration
  else if (top10Percent > 30) rugRiskLevel = "medium"; // Moderate risk
  else rugRiskLevel = "low"; // Safe distribution

  const dilution = (holders.length / 10000) * 100; // Estimate

  return {
    totalHolders: holders.length,
    top10Percent: Math.round(top10Percent * 100) / 100,
    top50Percent: Math.round(top50Percent * 100) / 100,
    dilution: Math.round(dilution * 100) / 100,
    concentration,
    rugRiskLevel
  };
}

/**
 * Analyze Exchange Inflows/Outflows
 * Helps identify whale accumulation vs distribution
 */
export function analyzeExchangeFlows(
  exchangeInflow: number,
  exchangeOutflow: number
): ExchangeFlows {
  const netFlow = exchangeOutflow - exchangeInflow;

  // Positive net flow (outflow > inflow) = bullish (consolidation)
  // Negative net flow (inflow > outflow) = bearish (distribution)

  let flowTrend: "bullish" | "bearish" | "neutral" = "neutral";
  let whaleMovement: "accumulating" | "distributing" | "neutral" = "neutral";

  if (netFlow > exchangeInflow * 0.5) {
    flowTrend = "bullish";
    whaleMovement = "accumulating"; // More tokens leaving exch = holders buying
  } else if (netFlow < -exchangeInflow * 0.5) {
    flowTrend = "bearish";
    whaleMovement = "distributing"; // More tokens entering exch = sellers selling
  } else {
    flowTrend = "neutral";
    whaleMovement = "neutral";
  }

  return {
    inflow24h: Math.round(exchangeInflow),
    outflow24h: Math.round(exchangeOutflow),
    netFlow: Math.round(netFlow),
    flowTrend,
    whaleMovement
  };
}

/**
 * Score Token Liquidity
 * Locked liquidity + trend = safety
 */
export function scoreLiquidity(
  totalLiquidity: number,
  lockedLiquidity: number,
  liquidityHistory: number[] // last 7 days
): { score: number; locked: number; trend: "increasing" | "stable" | "decreasing" } {
  const lockedPercent = (lockedLiquidity / totalLiquidity) * 100;

  // Locked liquidity: 80%+ = excellent, 60%+ = good, <40% = risk
  let liquidityScore = 50;
  if (lockedPercent >= 80) liquidityScore = 90;
  else if (lockedPercent >= 60) liquidityScore = 75;
  else if (lockedPercent >= 40) liquidityScore = 50;
  else liquidityScore = 25;

  // Trend analysis
  let trend: "increasing" | "stable" | "decreasing" = "stable";
  if (liquidityHistory.length >= 2) {
    const recent = liquidityHistory.slice(-3);
    const avg = recent.reduce((a, b) => a + b) / recent.length;
    const previous = liquidityHistory[liquidityHistory.length - 4] || liquidityHistory[0];

    if (avg > previous * 1.05) trend = "increasing";
    else if (avg < previous * 0.95) trend = "decreasing";
  }

  // Apply trend adjustment
  if (trend === "increasing") liquidityScore += 10;
  else if (trend === "decreasing") liquidityScore -= 10;

  liquidityScore = Math.min(100, Math.max(0, liquidityScore));

  return {
    score: liquidityScore,
    locked: Math.round(lockedPercent),
    trend
  };
}

/**
 * Analyze Transaction Patterns
 * Buy/sell ratio, whale activity detection
 */
export function analyzeTransactionPatterns(
  buys: number,
  sells: number,
  avgBuySize: number,
  avgSellSize: number,
  whaleThreshold: number = 100000 // SOL value
): any {
  const ratio = buys > 0 ? sells / buys : 1;
  const volumeWeightedRatio = (sells * avgSellSize) / (buys * avgBuySize);

  let buySellSignal = "neutral";
  if (ratio < 0.8) buySellSignal = "bullish"; // More buys
  else if (ratio > 1.2) buySellSignal = "bearish"; // More sells

  // Whale activity
  const whaleSize = Math.max(avgBuySize, avgSellSize);
  let whaleActivity = "neutral";
  if (avgBuySize > whaleThreshold) whaleActivity = "buying";
  else if (avgSellSize > whaleThreshold) whaleActivity = "selling";

  return {
    buySellRatio: Math.round(ratio * 100) / 100,
    volumeWeightedRatio: Math.round(volumeWeightedRatio * 100) / 100,
    signal: buySellSignal,
    whaleActivity,
    avgBuySize: Math.round(avgBuySize),
    avgSellSize: Math.round(avgSellSize),
    whaleSize: Math.round(whaleSize)
  };
}

/**
 * Detect Smart Money Signals
 * Whale accumulation, bot activity, institutional movement
 */
export function detectSmartMoneySignals(
  transactionSizes: number[],
  buyVolume: number,
  sellVolume: number,
  priceAction: "up" | "down" | "neutral"
): any {
  const avgSize = transactionSizes.reduce((a, b) => a + b, 0) / transactionSizes.length;
  const largeTransactions = transactionSizes.filter(t => t > avgSize * 2).length;
  const largeRatio = largeTransactions / transactionSizes.length;

  let whaleAccumulation = false;
  let institutionalActivity = false;
  let tradingBotActivity = false;
  let tradeSize: "micro" | "small" | "medium" | "large" | "whale" = "small";

  // Whale Accumulation: Large buys on dips
  if (priceAction === "down" && buyVolume > sellVolume && largeRatio > 0.3) {
    whaleAccumulation = true;
  }

  // Institutional Activity: Consistent large transactions
  if (largeRatio > 0.4) {
    institutionalActivity = true;
  }

  // Trading Bot Activity: Many small transactions at regular intervals
  const smallTransactions = transactionSizes.filter(t => t < avgSize * 0.5).length;
  if (smallTransactions > transactionSizes.length * 0.5 && largeRatio < 0.2) {
    tradingBotActivity = true;
  }

  // Classify trade size
  const avgPercent = (avgSize / (buyVolume + sellVolume)) * 100;
  if (avgPercent < 0.01) tradeSize = "micro";
  else if (avgPercent < 0.1) tradeSize = "small";
  else if (avgPercent < 0.5) tradeSize = "medium";
  else if (avgPercent < 2) tradeSize = "large";
  else tradeSize = "whale";

  return {
    whaleAccumulation,
    institutionalActivity,
    tradingBotActivity,
    tradeSize,
    largeTransactionRatio: Math.round(largeRatio * 100)
  };
}

/**
 * Generate Complete On-Chain Analysis
 */
export function analyzeOnChain(data: {
  holders?: Array<{ address: string; balance: number }>;
  exchangeInflow?: number;
  exchangeOutflow?: number;
  totalLiquidity?: number;
  lockedLiquidity?: number;
  liquidityHistory?: number[];
  buyVolume?: number;
  sellVolume?: number;
  buys?: number;
  sells?: number;
  avgBuySize?: number;
  avgSellSize?: number;
  transactionSizes?: number[];
  priceAction?: "up" | "down" | "neutral";
  topHolderPercent?: number;
}): OnChainMetrics {
  // Holder analysis
  const holderAnalysis = analyzeHolderDistribution(data.holders || []);
  let rugRiskScore = 50;
  switch (holderAnalysis.rugRiskLevel) {
    case "low":
      rugRiskScore = 20;
      break;
    case "medium":
      rugRiskScore = 50;
      break;
    case "high":
      rugRiskScore = 75;
      break;
    case "critical":
      rugRiskScore = 95;
      break;
  }

  // Liquidity analysis
  const liquidityData = scoreLiquidity(
    data.totalLiquidity || 0,
    data.lockedLiquidity || 0,
    data.liquidityHistory || []
  );

  // Volume analysis
  const volumeTrend = data.buyVolume && data.sellVolume ? ((data.buyVolume - data.sellVolume) / data.buyVolume) * 100 : 0;
  let volumeQuality: "low" | "medium" | "high" = "medium";
  if (Math.abs(volumeTrend) > 30) volumeQuality = "high";
  else if (Math.abs(volumeTrend) > 10) volumeQuality = "medium";
  else volumeQuality = "low";

  // Transaction analysis
  const txAnalysis = analyzeTransactionPatterns(
    data.buys || 0,
    data.sells || 0,
    data.avgBuySize || 0,
    data.avgSellSize || 0
  );

  // Smart money signals
  const smartMoney = detectSmartMoneySignals(
    data.transactionSizes || [],
    data.buyVolume || 0,
    data.sellVolume || 0,
    data.priceAction || "neutral"
  );

  // Community score (0-100)
  let communityScore = 50;
  if (holderAnalysis.rugRiskLevel === "low") communityScore += 20;
  if (liquidityData.score > 70) communityScore += 15;
  if (txAnalysis.signal === "bullish") communityScore += 10;
  if (smartMoney.whaleAccumulation) communityScore += 10;
  communityScore = Math.min(100, communityScore);

  // Overall risk score (0-100, where 0 = safe, 100 = very risky)
  let overallRiskScore = (rugRiskScore + (100 - liquidityData.score) + (50 - communityScore)) / 3;
  overallRiskScore = Math.round(overallRiskScore);

  // Map holder concentration to on-chain metric concentration
  let metricConcentration: "low" | "high" | "medium" | "critical";
  switch (holderAnalysis.concentration) {
    case "decentralized":
      metricConcentration = "low";
      break;
    case "balanced":
      metricConcentration = "medium";
      break;
    case "concentrated":
    case "danger":
      metricConcentration = "high";
      break;
    case "extreme":
      metricConcentration = "critical";
      break;
  }

  return {
    holderDistribution: {
      topHolderPercent: holderAnalysis.top10Percent,
      concentration: metricConcentration,
      rugRiskScore
    },
    liquidityAnalysis: {
      liquidityLocked: liquidityData.locked,
      liquidityTrend: liquidityData.trend,
      liquidityScore: liquidityData.score
    },
    volumeAnalysis: {
      volume24h: (data.buyVolume || 0) + (data.sellVolume || 0),
      volumeTrend: Math.round(volumeTrend),
      volumeQuality
    },
    transactionAnalysis: {
      buySellRatio: txAnalysis.buySellRatio,
      whaleActivity: txAnalysis.whaleActivity,
      buyerCount: data.buys || 0,
      sellerCount: data.sells || 0
    },
    smartMoneySignals: {
      whaleAccumulation: smartMoney.whaleAccumulation,
      institutionalActivity: smartMoney.institutionalActivity,
      tradingBotActivity: smartMoney.tradingBotActivity,
      tradeSize: smartMoney.tradeSize
    },
    communityScore,
    overallRiskScore
  };
}

/**
 * Format on-chain analysis for Telegram display
 */
export function formatOnChainAnalysis(metrics: OnChainMetrics): string {
  const riskEmoji = metrics.overallRiskScore < 30 ? "🟢" : metrics.overallRiskScore < 60 ? "🟡" : "🔴";

  return `
<b>═══ ON-CHAIN ANALYSIS ═══</b>

<b>👥 Holder Distribution</b>
└─ Top 10: ${metrics.holderDistribution.topHolderPercent}%
└─ Concentration: ${metrics.holderDistribution.concentration}
└─ Rug Risk: ${metrics.holderDistribution.rugRiskScore}/100

<b>💧 Liquidity</b>
└─ Locked: ${metrics.liquidityAnalysis.liquidityLocked}%
└─ Trend: ${metrics.liquidityAnalysis.liquidityTrend}
└─ Score: ${metrics.liquidityAnalysis.liquidityScore}/100

<b>📊 Volume & Transactions</b>
└─ Buy/Sell: ${metrics.transactionAnalysis.buySellRatio}
└─ Whale Activity: ${metrics.transactionAnalysis.whaleActivity}
└─ Buyers: ${metrics.transactionAnalysis.buyerCount} | Sellers: ${metrics.transactionAnalysis.sellerCount}

<b>🎯 Smart Money Signals</b>
└─ Whale Accumulating: ${metrics.smartMoneySignals.whaleAccumulation ? "YES ✅" : "NO ❌"}
└─ Institutional: ${metrics.smartMoneySignals.institutionalActivity ? "YES ✅" : "NO ❌"}
└─ Bot Activity: ${metrics.smartMoneySignals.tradingBotActivity ? "YES ✅" : "NO ❌"}

<b>═══ OVERALL ASSESSMENT ═══</b>
${riskEmoji} <b>Community Score:</b> ${metrics.communityScore}/100
${riskEmoji} <b>Risk Level:</b> ${metrics.overallRiskScore}/100`;
}
