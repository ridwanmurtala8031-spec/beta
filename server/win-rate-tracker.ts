/**
 * Win Rate Tracker
 * Tracks signals and outcomes to calculate win rates and best performing setups
 * Uses in-memory storage (can be integrated with main database)
 */

export interface SignalRecord {
  id: string;
  timestamp: number;
  symbol: string;
  entryPrice: number;
  takeProfitPrice: number;
  stopLossPrice: number;
  signalType: "STRONG-BUY" | "BUY" | "NEUTRAL" | "SELL" | "STRONG-SELL";
  confidence: number;
  confluencePercent: number;
  patternDetected: string | null;
  adxValue: number;
  rsiValue: number;
  macdSignal: string;
  exitPrice?: number;
  exitTime?: number;
  outcome?: "win" | "loss" | "breakeven";
  profitLoss?: number;
  profitLossPercent?: number;
  notes?: string;
}

export interface WinRateAnalysis {
  totalSignals: number;
  winningSignals: number;
  losingSignals: number;
  breakevenSignals: number;
  winRate: number; // percent
  averageWin: number; // percent
  averageLoss: number; // percent
  profitFactor: number; // total gains / total losses
  expectancy: number; // average profit per trade
  sharpeRatio: number; // risk-adjusted return
  topPatterns: Array<{ pattern: string; winRate: number; count: number }>;
  bestTimeframe: string;
  confidenceCorrelation: number; // does higher confidence = more wins?
}

class WinRateTracker {
  private signals: Map<string, SignalRecord> = new Map();
  private readonly MAX_SIGNALS = 10000; // Keep last 10k signals in memory

  /**
   * Record a new signal
   */
  recordSignal(signal: SignalRecord): void {
    this.signals.set(signal.id, signal);

    // Keep only last MAX_SIGNALS to prevent memory bloat
    if (this.signals.size > this.MAX_SIGNALS) {
      const oldestKey = Array.from(this.signals.entries())
        .sort((a, b) => a[1].timestamp - b[1].timestamp)[0][0];
      this.signals.delete(oldestKey);
    }
  }

  /**
   * Update signal with exit information
   */
  updateSignalExit(signalId: string, exitPrice: number, exitTime: number, notes?: string): void {
    const signal = this.signals.get(signalId);

    if (!signal) return;

    const profitLoss = exitPrice - signal.entryPrice;
    const profitLossPercent = (profitLoss / signal.entryPrice) * 100;

    let outcome: "win" | "loss" | "breakeven";
    if (profitLoss > 0.01) outcome = "win";
    else if (profitLoss < -0.01) outcome = "loss";
    else outcome = "breakeven";

    signal.exitPrice = exitPrice;
    signal.exitTime = exitTime;
    signal.outcome = outcome;
    signal.profitLoss = profitLoss;
    signal.profitLossPercent = profitLossPercent;
    signal.notes = notes;

    this.signals.set(signalId, signal);
  }

  /**
   * Get all signals for a symbol
   */
  getSignalsBySymbol(symbol: string): SignalRecord[] {
    return Array.from(this.signals.values())
      .filter(s => s.symbol === symbol)
      .sort((a, b) => b.timestamp - a.timestamp);
  }

  /**
   * Calculate comprehensive win rate analysis
   */
  analyzeWinRate(lookbackDays: number = 30): WinRateAnalysis {
    const cutoff = Date.now() - lookbackDays * 24 * 60 * 60 * 1000;

    const allSignals = Array.from(this.signals.values())
      .filter(s => s.timestamp > cutoff && s.outcome)
      .sort((a, b) => b.timestamp - a.timestamp);

    if (allSignals.length === 0) {
      return {
        totalSignals: 0,
        winningSignals: 0,
        losingSignals: 0,
        breakevenSignals: 0,
        winRate: 0,
        averageWin: 0,
        averageLoss: 0,
        profitFactor: 0,
        expectancy: 0,
        sharpeRatio: 0,
        topPatterns: [],
        bestTimeframe: "N/A",
        confidenceCorrelation: 0
      };
    }

    const winningSignals = allSignals.filter(s => s.outcome === "win").length;
    const losingSignals = allSignals.filter(s => s.outcome === "loss").length;
    const breakevenSignals = allSignals.filter(s => s.outcome === "breakeven").length;

    const wins = allSignals.filter(s => s.outcome === "win");
    const losses = allSignals.filter(s => s.outcome === "loss");

    const totalGains = wins.reduce((sum, s) => sum + (s.profitLossPercent || 0), 0);
    const totalLosses = losses.reduce((sum, s) => sum + Math.abs(s.profitLossPercent || 0), 0);

    const averageWin = wins.length > 0 ? totalGains / wins.length : 0;
    const averageLoss = losses.length > 0 ? totalLosses / losses.length : 0;
    const profitFactor = totalLosses > 0 ? totalGains / totalLosses : 999;
    const expectancy = (winningSignals / allSignals.length) * averageWin - (losingSignals / allSignals.length) * averageLoss;

    // Sharpe ratio approximation
    const returns = allSignals.map(s => s.profitLossPercent || 0);
    const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length;
    const stdDev = Math.sqrt(variance) || 1;
    const sharpeRatio = (avgReturn / stdDev) * Math.sqrt(252); // Annualized

    // Pattern analysis
    const patternStats: { [key: string]: { wins: number; count: number } } = {};
    allSignals.forEach(s => {
      if (s.patternDetected) {
        if (!patternStats[s.patternDetected]) {
          patternStats[s.patternDetected] = { wins: 0, count: 0 };
        }
        patternStats[s.patternDetected].count++;
        if (s.outcome === "win") patternStats[s.patternDetected].wins++;
      }
    });

    const topPatterns = Object.entries(patternStats)
      .map(([pattern, stats]) => ({
        pattern,
        winRate: Math.round((stats.wins / stats.count) * 100),
        count: stats.count
      }))
      .sort((a, b) => b.winRate - a.winRate)
      .slice(0, 5);

    // Confidence correlation
    const highConfidence = allSignals.filter(s => s.confidence >= 80);
    const lowConfidence = allSignals.filter(s => s.confidence < 80);
    const highWinRate = highConfidence.length > 0 ? (highConfidence.filter(s => s.outcome === "win").length / highConfidence.length) * 100 : 0;
    const lowWinRate = lowConfidence.length > 0 ? (lowConfidence.filter(s => s.outcome === "win").length / lowConfidence.length) * 100 : 0;
    const confidenceCorrelation = highWinRate - lowWinRate;

    return {
      totalSignals: allSignals.length,
      winningSignals,
      losingSignals,
      breakevenSignals,
      winRate: Math.round((winningSignals / allSignals.length) * 100),
      averageWin: Math.round(averageWin * 100) / 100,
      averageLoss: Math.round(averageLoss * 100) / 100,
      profitFactor: Math.round(profitFactor * 100) / 100,
      expectancy: Math.round(expectancy * 100) / 100,
      sharpeRatio: Math.round(sharpeRatio * 100) / 100,
      topPatterns,
      bestTimeframe: "1h", // Default, can be enhanced
      confidenceCorrelation: Math.round(confidenceCorrelation)
    };
  }

  /**
   * Format win rate stats for display
   */
  formatWinRateStats(analysis: WinRateAnalysis): string {
    if (analysis.totalSignals === 0) {
      return "<b>📊 Win Rate Stats</b>\nNo signals tracked yet.";
    }

    let message = `<b>📊 Win Rate Analysis (Last 30 Days)</b>

<b>📈 Performance</b>
└─ Win Rate: <b>${analysis.winRate}%</b> (${analysis.winningSignals}W / ${analysis.losingSignals}L / ${analysis.breakevenSignals}BE)
└─ Average Win: +${analysis.averageWin}%
└─ Average Loss: -${analysis.averageLoss}%
└─ Profit Factor: ${analysis.profitFactor}x
└─ Expectancy: ${analysis.expectancy}% per trade
└─ Sharpe Ratio: ${analysis.sharpeRatio}

<b>🎯 Top Performing Patterns</b>`;

    if (analysis.topPatterns.length > 0) {
      analysis.topPatterns.forEach(p => {
        message += `\n└─ ${p.pattern}: ${p.winRate}% WR (${p.count} trades)`;
      });
    } else {
      message += "\n└─ No patterns tracked yet";
    }

    message += `\n\n<b>💡 Insights</b>`;
    message += `\n└─ Confidence Correlation: ${analysis.confidenceCorrelation > 0 ? "✅" : "⚠️"} ${Math.abs(analysis.confidenceCorrelation)}%`;

    if (analysis.profitFactor > 2) {
      message += "\n└─ Setup is <b>PROFITABLE</b> - Keep trading this setup!";
    } else if (analysis.profitFactor > 1.5) {
      message += "\n└─ Setup is <b>POSITIVE</b> - Good setup, maintain discipline";
    } else if (analysis.profitFactor > 1) {
      message += "\n└─ Setup is <b>BREAKEVEN</b> - Consider refinements";
    } else {
      message += "\n└─ Setup is <b>NEGATIVE</b> - Rework your strategy";
    }

    return message;
  }
}

// Export singleton instance
export const winRateTracker = new WinRateTracker();

export default winRateTracker;
