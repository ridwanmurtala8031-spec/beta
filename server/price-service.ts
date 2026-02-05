import axios from "axios";
import { log } from "./index.js";

interface PriceData {
  price: string;
  change24h: number;
  high24h: string;
  low24h: string;
  volume24h: number;
  quote: string;
  source: string;
}

export async function fetchPriceData(symbol: string): Promise<PriceData | null> {
  const parts = symbol.split('/');
  const base = parts[0].toLowerCase();
  const quote = parts[1]?.toUpperCase() || 'USDT';
  const pair = `${base.toUpperCase()}/${quote}`;

  // 1. Binance (High rate limit)
  try {
    const binanceSymbol = `${base}${quote}`.toUpperCase();
    const res = await axios.get(`https://api.binance.com/api/v3/ticker/price?symbol=${binanceSymbol}`, { timeout: 5000 });
    const d: any = res.data;
    if (d && d.price) {
      const price = parseFloat(d.price);
      return {
        price: price.toString(),
        change24h: 0,
        high24h: price.toString(),
        low24h: price.toString(),
        volume24h: 0,
        quote: quote,
        source: 'Binance'
      };
    }
  } catch (e) { /* silent fail for fallback */ }

  // 2. CryptoCompare (Alternative reliable source)
  try {
    const res = await axios.get(`https://min-api.cryptocompare.com/data/price?fsym=${base.toUpperCase()}&tsyms=${quote.toUpperCase()}`, { timeout: 5000 });
    const d: any = res.data;
    if (d && d[quote.toUpperCase()]) {
      const price = d[quote.toUpperCase()];
      return {
        price: price.toString(),
        change24h: 0,
        high24h: price.toString(),
        low24h: price.toString(),
        volume24h: 0,
        quote: quote,
        source: 'CryptoCompare'
      };
    }
  } catch (e) { /* silent fail for fallback */ }

  // 3. Yahoo Finance (Reliable for Forex and Crypto)
  try {
    let yahooSymbol = `${base.toUpperCase()}-${quote.toUpperCase()}`;
    if (['EUR', 'GBP', 'JPY', 'AUD', 'CAD', 'CHF', 'NZD'].includes(base.toUpperCase())) {
      yahooSymbol = `${base.toUpperCase()}${quote.toUpperCase()}=X`;
    }
    
    const res = await axios.get(`https://query1.finance.yahoo.com/v8/finance/chart/${yahooSymbol}?interval=1m&range=1d`, { 
      timeout: 8000, 
      headers: { 'User-Agent': 'Mozilla/5.0' } 
    });
    
    const d: any = res.data;
    if (d?.chart?.result?.[0]) {
      const meta = d.chart.result[0].meta;
      const price = meta.regularMarketPrice;
      return {
        price: price.toString(),
        change24h: 0,
        high24h: price.toString(),
        low24h: price.toString(),
        volume24h: 0,
        quote: quote,
        source: 'Yahoo Finance'
      };
    }
  } catch (e) { /* silent fail */ }

  // 4. CoinGecko (Fallback)
  try {
    const cgRes = await axios.get(`https://api.coingecko.com/api/v3/simple/price?ids=${base}&vs_currencies=usd&include_24hr_vol=true&include_24hr_change=true`, { timeout: 5000 });
    const cgData: any = cgRes.data || {};
    let data = cgData[base];
    
    if (!data) {
      const searchRes = await axios.get(`https://api.coingecko.com/api/v3/search?query=${base}`, { timeout: 5000 });
      const sdata: any = searchRes.data || {};
      const coinId = sdata?.coins?.[0]?.id;
      if (coinId) {
        const priceRes = await axios.get(`https://api.coingecko.com/api/v3/simple/price?ids=${coinId}&vs_currencies=usd&include_24hr_vol=true&include_24hr_change=true`, { timeout: 5000 });
        const pdata: any = priceRes.data || {};
        data = pdata[coinId];
      }
    }

    if (data) {
      return {
        price: (data.usd ?? data.usd_price ?? 0).toString(),
        change24h: data.usd_24h_change || 0,
        high24h: ((data.usd ?? 0) * 1.02).toString(),
        low24h: ((data.usd ?? 0) * 0.98).toString(),
        volume24h: data.usd_24h_vol || 0,
        quote: quote,
        source: 'CoinGecko'
      };
    }
  } catch (e) { log(`CoinGecko failed for ${base}: ${e}`, "price-service"); }

  // 5. DIA (Fallback)
  try {
    const symUpper = base.toUpperCase();
    const res = await axios.get(`https://api.diadata.org/v1/quotation/${symUpper}`, { timeout: 5000 });
    const d: any = res.data || {};
    if (d && d.Price) {
      return {
        price: d.Price.toString(),
        change24h: d.PricePercentageChange24h || 0,
        high24h: (d.Price * 1.02).toString(),
        low24h: (d.Price * 0.98).toString(),
        volume24h: d.Volume24h || 0,
        quote: quote,
        source: 'DIA'
      };
    }
  } catch (e) { log(`DIA failed for ${base}: ${e}`, "price-service"); }

  return null;
}
