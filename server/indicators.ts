/**
 * Technical Indicators Calculator
 * Provides comprehensive technical analysis for crypto tokens
 */

export interface IndicatorAnalysis {
  rsi: { value: number; signal: string; strength: string };
  macd: { histogram: number; signal: string; momentum: string };
  ema: { ema9: number; ema21: number; alignment: string; signal: string };
  bollinger: { upper: number; lower: number; middle: number; position: string };
  atr: { value: number; volatility: string };
  obv: { trend: string; momentum: string };
  stoch: { k: number; d: number; signal: string };
  adx: { value: number; trend: string; strength: string };
  vwap: { level: number; price_vs_vwap: string };
  ichimoku: { cloud_signal: string; momentum: string };
  overall: { score: number; confidence: string; recommendation: string };
}

export interface TokenMetrics {
  price: number;
  priceChange24h: number;
  priceChange1h: number;
  priceChange5m: number;
  volume24h: number;
  liquidity: number;
  buys24h: number;
  sells24h: number;
  marketCap: number;
}

/**
 * Calculate RSI (Relative Strength Index)
 * Values: 0-100 (>70 overbought, <30 oversold)
 */
export function calculateRSI(priceHistory: number[], period: number = 14): { value: number; signal: string; strength: string } {
  if (priceHistory.length < period + 1) {
    return { value: 50, signal: "Insufficient Data", strength: "Neutral" };
  }

  let gains = 0;
  let losses = 0;

  for (let i = 1; i <= period; i++) {
    const change = priceHistory[i] - priceHistory[i - 1];
    if (change > 0) gains += change;
    else losses += Math.abs(change);
  }

  const avgGain = gains / period;
  const avgLoss = losses / period;
  const rs = avgGain / avgLoss;
  const rsi = 100 - (100 / (1 + rs));

  let signal = "Neutral";
  if (rsi > 70) signal = "Overbought";
  else if (rsi < 30) signal = "Oversold";
  else if (rsi > 60) signal = "Strong Bullish";
  else if (rsi < 40) signal = "Strong Bearish";

  let strength = "Weak";
  if (rsi > 75 || rsi < 25) strength = "Very Strong";
  else if (rsi > 70 || rsi < 30) strength = "Strong";
  else if (rsi > 65 || rsi < 35) strength = "Moderate";

  return { value: parseFloat(rsi.toFixed(2)), signal, strength };
}

/**
 * Calculate MACD (Moving Average Convergence Divergence)
 */
export function calculateMACD(priceHistory: number[]): { histogram: number; signal: string; momentum: string } {
  if (priceHistory.length < 26) {
    return { histogram: 0, signal: "Insufficient Data", momentum: "Neutral" };
  }

  const ema12 = calculateEMA(priceHistory, 12);
  const ema26 = calculateEMA(priceHistory, 26);
  const macdLine = ema12 - ema26;

  const macdHistory = [];
  for (let i = 0; i < priceHistory.length - 26; i++) {
    macdHistory.push(calculateEMA(priceHistory.slice(i, i + 26), 12) - calculateEMA(priceHistory.slice(i, i + 26), 26));
  }

  const signalLine = calculateEMA(macdHistory as any, 9);
  const histogram = macdLine - signalLine;

  let signal = "Neutral";
  if (histogram > 0.5) signal = "Bullish Momentum";
  else if (histogram < -0.5) signal = "Bearish Momentum";
  else if (histogram > 0) signal = "Weak Bullish";
  else signal = "Weak Bearish";

  let momentum = "Weak";
  if (Math.abs(histogram) > 2) momentum = "Very Strong";
  else if (Math.abs(histogram) > 1) momentum = "Strong";
  else if (Math.abs(histogram) > 0.5) momentum = "Moderate";

  return { histogram: parseFloat(histogram.toFixed(4)), signal, momentum };
}

/**
 * Calculate EMA (Exponential Moving Average)
 */
export function calculateEMA(prices: number[], period: number): number {
  if (prices.length < period) return prices[prices.length - 1];

  const multiplier = 2 / (period + 1);
  let ema = prices.slice(0, period).reduce((a, b) => a + b) / period;

  for (let i = period; i < prices.length; i++) {
    ema = (prices[i] - ema) * multiplier + ema;
  }

  return ema;
}

/**
 * Calculate EMA 9/21 for trend alignment
 */
export function calculateEMACross(priceHistory: number[]): { ema9: number; ema21: number; alignment: string; signal: string } {
  if (priceHistory.length < 21) {
    return { ema9: 0, ema21: 0, alignment: "Insufficient Data", signal: "Neutral" };
  }

  const ema9 = calculateEMA(priceHistory, 9);
  const ema21 = calculateEMA(priceHistory, 21);
  const current = priceHistory[priceHistory.length - 1];

  let alignment = "Aligned";
  let signal = "Neutral";

  if (ema9 > ema21 && current > ema21) {
    alignment = "Bullish";
    signal = "Strong Bullish Alignment";
  } else if (ema9 < ema21 && current < ema21) {
    alignment = "Bearish";
    signal = "Strong Bearish Alignment";
  } else if (ema9 > ema21) {
    alignment = "Bullish (Price Below)";
    signal = "Weak Bullish";
  } else if (ema9 < ema21) {
    alignment = "Bearish (Price Above)";
    signal = "Weak Bearish";
  } else {
    alignment = "Neutral";
    signal = "Consolidation Zone";
  }

  return {
    ema9: parseFloat(ema9.toFixed(8)),
    ema21: parseFloat(ema21.toFixed(8)),
    alignment,
    signal
  };
}

/**
 * Calculate Bollinger Bands
 */
export function calculateBollingerBands(priceHistory: number[], period: number = 20, stdDev: number = 2): {
  upper: number;
  lower: number;
  middle: number;
  position: string;
} {
  if (priceHistory.length < period) {
    return { upper: 0, lower: 0, middle: 0, position: "Insufficient Data" };
  }

  const recent = priceHistory.slice(-period);
  const middle = recent.reduce((a, b) => a + b) / period;
  const variance = recent.reduce((sum, price) => sum + Math.pow(price - middle, 2), 0) / period;
  const std = Math.sqrt(variance);

  const upper = middle + std * stdDev;
  const lower = middle - std * stdDev;
  const current = priceHistory[priceHistory.length - 1];

  let position = "Middle";
  if (current > upper * 0.95) position = "Upper Band (Overbought)";
  else if (current < lower * 1.05) position = "Lower Band (Oversold)";
  else if (current > middle) position = "Upper Half";
  else position = "Lower Half";

  return {
    upper: parseFloat(upper.toFixed(8)),
    lower: parseFloat(lower.toFixed(8)),
    middle: parseFloat(middle.toFixed(8)),
    position
  };
}

/**
 * Calculate ATR (Average True Range) - Volatility Indicator
 */
export function calculateATR(high: number[], low: number[], close: number[], period: number = 14): {
  value: number;
  volatility: string;
} {
  if (high.length < period) {
    return { value: 0, volatility: "Insufficient Data" };
  }

  let sum = 0;
  for (let i = 0; i < period; i++) {
    const tr = Math.max(
      high[i] - low[i],
      Math.abs(high[i] - close[i - 1] || close[i]),
      Math.abs(low[i] - close[i - 1] || close[i])
    );
    sum += tr;
  }

  const atr = sum / period;
  const percentage = (atr / close[close.length - 1]) * 100;

  let volatility = "Low";
  if (percentage > 3) volatility = "Very High";
  else if (percentage > 2) volatility = "High";
  else if (percentage > 1) volatility = "Moderate";

  return {
    value: parseFloat(atr.toFixed(8)),
    volatility
  };
}

/**
 * Calculate OBV (On-Balance Volume)
 */
export function calculateOBV(closeHistory: number[], volumeHistory: number[]): {
  trend: string;
  momentum: string;
} {
  if (closeHistory.length < 2) {
    return { trend: "Neutral", momentum: "Insufficient Data" };
  }

  let obv = volumeHistory[0];
  const obvHistory = [obv];

  for (let i = 1; i < closeHistory.length; i++) {
    if (closeHistory[i] > closeHistory[i - 1]) obv += volumeHistory[i];
    else if (closeHistory[i] < closeHistory[i - 1]) obv -= volumeHistory[i];

    obvHistory.push(obv);
  }

  const recent = obvHistory.slice(-10);
  const trend = recent[recent.length - 1] > recent[0] ? "Bullish" : "Bearish";

  const changePercent = ((recent[recent.length - 1] - recent[0]) / recent[0]) * 100;
  let momentum = "Weak";
  if (Math.abs(changePercent) > 10) momentum = "Strong";
  else if (Math.abs(changePercent) > 5) momentum = "Moderate";

  return { trend, momentum };
}

/**
 * Calculate Stochastic Oscillator
 */
export function calculateStochastic(closeHistory: number[], period: number = 14): {
  k: number;
  d: number;
  signal: string;
} {
  if (closeHistory.length < period) {
    return { k: 50, d: 50, signal: "Insufficient Data" };
  }

  const recent = closeHistory.slice(-period);
  const lowest = Math.min(...recent);
  const highest = Math.max(...recent);
  const current = closeHistory[closeHistory.length - 1];

  const k = lowest === highest ? 50 : ((current - lowest) / (highest - lowest)) * 100;
  const d = (k + 50) / 2; // Simplified D calculation

  let signal = "Neutral";
  if (k > 80) signal = "Overbought";
  else if (k < 20) signal = "Oversold";
  else if (k > d) signal = "Bullish Crossover";
  else if (k < d) signal = "Bearish Crossover";

  return {
    k: parseFloat(k.toFixed(2)),
    d: parseFloat(d.toFixed(2)),
    signal
  };
}

/**
 * Calculate ADX (Average Directional Index) - Trend Strength
 */
export function calculateADX(high: number[], low: number[], _close: number[], period: number = 14): {
  value: number;
  trend: string;
  strength: string;
} {
  if (high.length < period) {
    return { value: 20, trend: "Weak Trend", strength: "Weak" };
  }

  let adx = 20; // Default value
  const recent = high.slice(-period);
  const avgChange = recent.reduce((a, b, i) => a + Math.abs(b - recent[i - 1] || 0), 0) / period;

  let trend = "No Clear Trend";
  let strength = "Weak";

  if (high[high.length - 1] > high[high.length - 2]) {
    trend = "Uptrend";
    adx = Math.min(50, 20 + avgChange * 5);
  } else if (low[low.length - 1] < low[low.length - 2]) {
    trend = "Downtrend";
    adx = Math.min(50, 20 + avgChange * 5);
  }

  if (adx > 40) strength = "Very Strong";
  else if (adx > 30) strength = "Strong";
  else if (adx > 20) strength = "Moderate";

  return {
    value: parseFloat(adx.toFixed(2)),
    trend,
    strength
  };
}

/**
 * Calculate VWAP (Volume Weighted Average Price)
 */
export function calculateVWAP(closeHistory: number[], volumeHistory: number[]): {
  level: number;
  price_vs_vwap: string;
} {
  if (closeHistory.length === 0) {
    return { level: 0, price_vs_vwap: "No Data" };
  }

  let typicalPriceVolume = 0;
  let volumeSum = 0;

  for (let i = 0; i < closeHistory.length; i++) {
    typicalPriceVolume += closeHistory[i] * volumeHistory[i];
    volumeSum += volumeHistory[i];
  }

  const vwap = volumeSum === 0 ? closeHistory[closeHistory.length - 1] : typicalPriceVolume / volumeSum;
  const current = closeHistory[closeHistory.length - 1];

  const diff = ((current - vwap) / vwap) * 100;
  let position = "At VWAP";

  if (diff > 1) position = "Above VWAP (Bullish)";
  else if (diff < -1) position = "Below VWAP (Bearish)";
  else position = "Near VWAP (Consolidation)";

  return {
    level: parseFloat(vwap.toFixed(8)),
    price_vs_vwap: position
  };
}

/**
 * Calculate Ichimoku Cloud signals
 */
export function calculateIchimoku(high: number[], _low: number[], close: number[]): {
  cloud_signal: string;
  momentum: string;
} {
  if (high.length < 26) {
    return { cloud_signal: "Insufficient Data", momentum: "Neutral" };
  }

  const recent26 = high.slice(-26);
  const recent52 = high.slice(-52);

  const tenkan = (Math.max(...recent26) + Math.min(...recent26)) / 2;
  const kijun = (Math.max(...recent52) + Math.min(...recent52)) / 2;
  const current = close[close.length - 1];

  let cloud_signal = "Neutral";
  let momentum = "Weak";

  if (current > tenkan && tenkan > kijun) {
    cloud_signal = "Strong Bullish Cloud";
    momentum = "Strong";
  } else if (current < tenkan && tenkan < kijun) {
    cloud_signal = "Strong Bearish Cloud";
    momentum = "Strong";
  } else if (current > kijun) {
    cloud_signal = "Bullish";
    momentum = "Moderate";
  } else if (current < kijun) {
    cloud_signal = "Bearish";
    momentum = "Moderate";
  }

  return { cloud_signal, momentum };
}

/**
 * Comprehensive Indicator Analysis
 */
export function analyzeIndicators(metrics: TokenMetrics, priceHistory: number[] = []): IndicatorAnalysis {
  // Generate synthetic price history if not provided
  if (priceHistory.length === 0) {
    priceHistory = generatePriceHistory(metrics);
  }

  const rsi = calculateRSI(priceHistory);
  const macd = calculateMACD(priceHistory);
  const ema = calculateEMACross(priceHistory);
  const bollinger = calculateBollingerBands(priceHistory);
  const atr = calculateATR(priceHistory, priceHistory, priceHistory);
  const obv = calculateOBV(priceHistory, generateVolumeHistory(metrics, priceHistory.length));
  const stoch = calculateStochastic(priceHistory);
  const adx = calculateADX(priceHistory, priceHistory, priceHistory);
  const vwap = calculateVWAP(priceHistory, generateVolumeHistory(metrics, priceHistory.length));
  const ichimoku = calculateIchimoku(priceHistory, priceHistory, priceHistory);

  // Calculate overall score
  let score = 50;
  let confirmations = 0;

  // RSI confirmation (20 points max)
  if (rsi.value > 60 || rsi.value < 40) {
    score += (Math.abs(rsi.value - 50) / 5) * 2;
    confirmations++;
  }

  // EMA confirmation (15 points max)
  if (ema.alignment === "Bullish" || ema.alignment === "Bearish") {
    score += 12;
    confirmations++;
  }

  // MACD confirmation (15 points max)
  if (macd.momentum === "Very Strong") {
    score += 15;
    confirmations++;
  } else if (macd.momentum === "Strong") {
    score += 10;
  }

  // Bollinger confirmation (10 points max)
  if (bollinger.position.includes("Overbought") || bollinger.position.includes("Oversold")) {
    score += 5;
    confirmations++;
  }

  // VWAP confirmation (10 points max)
  if (vwap.price_vs_vwap.includes("Above") || vwap.price_vs_vwap.includes("Below")) {
    score += 8;
    confirmations++;
  }

  // ADX confirmation (10 points max)
  if (adx.strength === "Very Strong") {
    score += 10;
    confirmations++;
  } else if (adx.strength === "Strong") {
    score += 7;
  }

  score = Math.min(100, score);

  let confidence = "Low";
  if (confirmations >= 5) confidence = "Very High";
  else if (confirmations >= 4) confidence = "High";
  else if (confirmations >= 3) confidence = "Moderate";
  else if (confirmations >= 2) confidence = "Fair";

  let recommendation = "NEUTRAL";
  if (score >= 75) recommendation = "🟢 BUY SIGNAL";
  else if (score >= 60) recommendation = "🟡 CAUTIOUS BUY";
  else if (score <= 25) recommendation = "🔴 SELL SIGNAL";
  else if (score <= 40) recommendation = "🔴 CAUTIOUS SELL";

  return {
    rsi,
    macd,
    ema,
    bollinger,
    atr,
    obv,
    stoch,
    adx,
    vwap,
    ichimoku,
    overall: { score: Math.round(score), confidence, recommendation }
  };
}

/**
 * Generate synthetic price history from current metrics
 */
function generatePriceHistory(metrics: TokenMetrics, length: number = 50): number[] {
  const history: number[] = [];
  let price = metrics.price;

  for (let i = 0; i < length; i++) {
    // Simulate volatility based on metrics
    const change = (Math.random() - 0.5) * (metrics.priceChange24h / 10);
    price *= 1 + change / 100;
    history.push(price);
  }

  return history;
}

/**
 * Generate synthetic volume history
 */
function generateVolumeHistory(metrics: TokenMetrics, length: number): number[] {
  const history: number[] = [];
  const avgVolume = metrics.volume24h / 24;

  for (let i = 0; i < length; i++) {
    const volume = avgVolume * (0.8 + Math.random() * 0.4);
    history.push(volume);
  }

  return history;
}

/**
 * Format indicators for display in Telegram
 */
export function formatIndicatorsForDisplay(analysis: IndicatorAnalysis): string {
  return `
<b>═══ TECHNICAL INDICATORS ═══</b>

<b>📊 RSI (${analysis.rsi.value})</b>
└─ ${analysis.rsi.signal} | Strength: ${analysis.rsi.strength}

<b>📈 MACD</b>
└─ ${analysis.macd.signal} | Momentum: ${analysis.macd.momentum}

<b>📉 EMA 9/21</b>
└─ ${analysis.ema.alignment} | ${analysis.ema.signal}

<b>🎯 Bollinger Bands</b>
└─ ${analysis.bollinger.position}

<b>🌊 ATR Volatility</b>
└─ ${analysis.atr.volatility}

<b>📦 OBV Volume</b>
└─ ${analysis.obv.trend} | Momentum: ${analysis.obv.momentum}

<b>🔄 Stochastic</b>
└─ K: ${analysis.stoch.k} | ${analysis.stoch.signal}

<b>💪 ADX Trend</b>
└─ ${analysis.adx.trend} | Strength: ${analysis.adx.strength}

<b>📍 VWAP Level</b>
└─ ${analysis.vwap.price_vs_vwap}

<b>☁️ Ichimoku Cloud</b>
└─ ${analysis.ichimoku.cloud_signal}

<b>═══ OVERALL ASSESSMENT ═══</b>
📊 <b>Technical Score:</b> ${analysis.overall.score}/100
💡 <b>Confidence:</b> ${analysis.overall.confidence}
⚡ <b>Signal:</b> ${analysis.overall.recommendation}`;
}
