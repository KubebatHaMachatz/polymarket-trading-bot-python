
import axios from 'axios';
import { Side } from '@polymarket/clob-client';
import { ENV } from '../config/env';

const STARTING_BALANCE = 700;
const COPY_SIZE = 10; // Slightly higher conviction for cheaper bets

interface HistoricalTrade {
    id: string;
    timestamp: number;
    asset: string;
    market: string;
    side: 'BUY' | 'SELL';
    price: number;
    usdcSize: number;
    size: number;
    outcome: string;
    conditionId: string;
}

const marketCache = new Map<string, any>();

async function getCachedMarketInfo(conditionId: string) {
    if (marketCache.has(conditionId)) return marketCache.get(conditionId);
    try {
        const res = await axios.get(`https://gamma-api.polymarket.com/markets?condition_id=${conditionId}`, { timeout: 3000 });
        const data = res.data?.find((m: any) => m.conditionId === conditionId) || res.data?.[0];
        marketCache.set(conditionId, data);
        return data;
    } catch { return null; }
}

async function fetchScalperCandidates(): Promise<string[]> {
    console.log(`\x1b[36mAnalyzing known active traders for scalping potential...\x1b[0m`);
    const known = [
        "0x11577e174308dd2960ae18ccb3ca3c06a79f95e1",
        "0x7f3c8979d0afa00007bae4747d5347122af05613",
        "0x7c3db723f1d4d8cb9c550095203b686cb11e5c6b",
        "0x6bab41a0dc40d6dd4c1a915b8c01969479fd1292",
        "0xa4b366ad22fc0d06f1e934ff468e8922431a87b8",
        "0x91430cad2d3975766499717fa0d66a78d814e5c5",
        "0x2745c38ff0617cb345c1d2df19b4f74ea777508e",
        "0xee483d462c5ef89bfb5e7662abb62714354a0f6f",
        "0x8BD6C3D7a57D650A1870dd338234f90051fe9918",
        "0x024b68f77bfc019341ee3db8f57c103334e4b943"
    ];
    return known.map(a => a.toLowerCase());
}

async function analyzeTrader(addr: string): Promise<any> {
    const url = `https://data-api.polymarket.com/activity?user=${addr}&type=TRADE&limit=200`;
    try {
        const res = await axios.get(url);
        const trades = res.data;
        if (!trades || trades.length < 20) return null;

        const buyPrices = trades.filter((t: any) => t.side === 'BUY').map((t: any) => parseFloat(t.price));
        const sellCount = trades.filter((t: any) => t.side === 'SELL').length;
        const avgBuyPrice = buyPrices.reduce((a:any, b:any) => a + b, 0) / buyPrices.length;
        
        // Scalper Profile: Avg Price < 0.70 AND Sells > 15% of total trades
        if (avgBuyPrice < 0.70 && (sellCount / trades.length) > 0.15) {
            return {
                address: addr,
                avgPrice: avgBuyPrice,
                sellRatio: (sellCount / trades.length * 100).toFixed(1) + "%",
                trades: trades.length
            };
        }
    } catch { return null; }
    return null;
}

async function runSimulation(user: string) {
    const url = `https://data-api.polymarket.com/activity?user=${user}&type=TRADE&limit=200`;
    const res = await axios.get(url);
    const trades = res.data.map((t: any) => ({
        ...t, price: parseFloat(t.price), usdcSize: parseFloat(t.usdcSize)
    })).reverse(); // Chronological

    let cash = STARTING_BALANCE;
    const positions = new Map<string, { shares: number, cost: number, conditionId: string }>();
    let realizedPnl = 0;

    for (const t of trades) {
        const key = `${t.asset}:${t.outcome}`;
        if (t.side === 'BUY') {
            if (t.price > 0.75) continue; // Skip high price for scalping
            const myUsdc = Math.min(cash, COPY_SIZE);
            if (myUsdc <= 0) continue;
            
            const myShares = myUsdc / t.price;
            if (!positions.has(key)) positions.set(key, { shares: 0, cost: 0, conditionId: t.conditionId });
            const p = positions.get(key)!;
            p.shares += myShares;
            p.cost += myUsdc;
            cash -= myUsdc;
        } else {
            const p = positions.get(key);
            if (p && p.shares > 0) {
                const sellShares = Math.min(p.shares, t.usdcSize / t.price);
                const revenue = sellShares * t.price;
                const costBasis = (sellShares / p.shares) * p.cost;
                realizedPnl += (revenue - costBasis);
                cash += revenue;
                p.shares -= sellShares;
                p.cost -= costBasis;
                if (p.shares < 0.01) positions.delete(key);
            }
        }
    }

    // Value remaining positions at current market price
    let unrealized = 0;
    for (const p of positions.values()) {
        const m = await getCachedMarketInfo(p.conditionId);
        const prices = m?.outcomePrices ? JSON.parse(m.outcomePrices) : [];
        const winIdx = prices.findIndex((pr: string) => parseFloat(pr) >= 0.98);
        if (m?.closed && winIdx !== -1) {
            // Assume market resolved
            unrealized += (p.shares - p.cost);
        } else {
            // Just use cost basis for unresolved to be conservative in scalping
            unrealized += 0; 
        }
    }

    return realizedPnl + unrealized;
}

async function main() {
    const candidates = await fetchScalperCandidates();
    const scalpers: any[] = [];

    console.log(`Analyzing ${candidates.length} candidates...`);
    for (const addr of candidates) {
        const profile = await analyzeTrader(addr);
        if (profile) {
            const profit = await runSimulation(addr);
            scalpers.push({ ...profile, "Backtest Profit": `$${profit.toFixed(2)}`, score: profit });
        }
    }

    scalpers.sort((a, b) => b.score - a.score);
    console.log(`\n\x1b[1mTOP SCALPING STRATEGIES (MAX PRICE 0.75, $700 BUDGET):\x1b[0m`);
    console.table(scalpers.map(s => ({ 
        Trader: s.address.slice(0,12) + "...", 
        "Avg Entry": s.avgPrice.toFixed(2), 
        "Exit Freq": s.sellRatio,
        "Backtest Profit": s["Backtest Profit"]
    })));
}

main().catch(console.error);
