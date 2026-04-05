
import axios from 'axios';
import { Side } from '@polymarket/clob-client';
import { ENV } from '../config/env';

const TARGET_TRADER = "0x7f3c8979d0afa00007bae4747d5347122af05613";
const DAYS = 365;
const STARTING_BALANCE = 700;

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

async function fetchTrades(user: string, days: number): Promise<HistoricalTrade[]> {
    let allTrades: HistoricalTrade[] = [];
    let offset = 0;
    const sinceTimestamp = Math.floor((Date.now() - (days * 24 * 3600 * 1000)) / 1000);
    console.log(`\x1b[36mFetching history for RELAXED batch audit...\x1b[0m`);

    while (true) {
        const url = `https://data-api.polymarket.com/activity?user=${user}&type=TRADE&limit=100&offset=${offset}`;
        try {
            const response = await axios.get(url, { timeout: 10000 });
            if (!response.data || response.data.length === 0) break;
            const mapped = response.data
                .filter((t: any) => t.timestamp >= sinceTimestamp)
                .map((t: any) => ({
                    id: t.id, timestamp: t.timestamp, asset: t.asset, market: t.slug || t.market,
                    side: t.side, price: parseFloat(t.price), usdcSize: parseFloat(t.usdcSize),
                    size: parseFloat(t.size), outcome: t.outcome, conditionId: t.conditionId
                }));
            allTrades = allTrades.concat(mapped);
            if (response.data[response.data.length - 1].timestamp < sinceTimestamp) break;
            offset += 100;
            process.stdout.write(".");
        } catch { break; }
    }
    console.log(`\n✓ Fetched ${allTrades.length} trades.\n`);
    return allTrades.sort((a, b) => a.timestamp - b.timestamp);
}

async function getCachedMarketInfo(conditionId: string) {
    if (marketCache.has(conditionId)) return marketCache.get(conditionId);
    try {
        const res = await axios.get(`https://gamma-api.polymarket.com/markets?condition_id=${conditionId}`, { timeout: 3000 });
        const data = res.data?.find((m: any) => m.conditionId === conditionId) || res.data?.[0];
        marketCache.set(conditionId, data);
        return data;
    } catch { return null; }
}

async function runSimulation(trades: HistoricalTrade[], copySize: number, minLeaderSize: number, maxPrice: number) {
    let cash = STARTING_BALANCE;
    const activePositions = new Map<string, { shares: number, cost: number, conditionId: string, outcome: string, market: string }>();
    let totalRealizedPnl = 0;
    let executed = 0;

    for (const t of trades) {
        const key = `${t.asset}:${t.outcome}`;
        if (t.side === 'BUY') {
            if (t.price > maxPrice || t.usdcSize < minLeaderSize) continue;
            const myUsdc = Math.min(cash, copySize);
            if (myUsdc <= 0) continue;
            executed++;
            const myShares = myUsdc / t.price;
            if (!activePositions.has(key)) activePositions.set(key, { shares: 0, cost: 0, conditionId: t.conditionId, outcome: t.outcome, market: t.market });
            const p = activePositions.get(key)!;
            p.shares += myShares;
            p.cost += myUsdc;
            cash -= myUsdc;
        } else {
            const p = activePositions.get(key);
            if (p && p.shares > 0) {
                const traderSharesSold = t.usdcSize / t.price;
                const sharesToSell = Math.min(p.shares, traderSharesSold);
                const costBasisOfSold = (sharesToSell / p.shares) * p.cost;
                const revenue = sharesToSell * t.price;
                totalRealizedPnl += (revenue - costBasisOfSold);
                cash += revenue;
                p.shares -= sharesToSell;
                p.cost -= costBasisOfSold;
                if (p.shares < 0.01) activePositions.delete(key);
            }
        }
    }

    let unrealizedNet = 0;
    for (const p of activePositions.values()) {
        const m = await getCachedMarketInfo(p.conditionId);
        if (m?.closed) {
            const prices = m.outcomePrices ? JSON.parse(m.outcomePrices) : [];
            const outcomes = m.outcomes ? JSON.parse(m.outcomes) : [];
            const winIdx = prices.findIndex((pr: string) => parseFloat(pr) >= 0.98);
            if (winIdx !== -1 && outcomes[winIdx].toLowerCase() === p.outcome.toLowerCase()) {
                totalRealizedPnl += (p.shares - p.cost);
            } else {
                totalRealizedPnl -= p.cost;
            }
        } else {
            unrealizedNet += (p.shares - p.cost);
        }
    }

    const totalPotentialProfit = totalRealizedPnl + unrealizedNet;
    const finalEquity = STARTING_BALANCE + totalPotentialProfit;

    return {
        "Copy $": `$${copySize}`,
        "Min Leader $": `$${minLeaderSize}`,
        "Max Price": maxPrice,
        "Trades": executed,
        "Net Profit": `$${totalPotentialProfit.toFixed(2)}`,
        "ROI": `${((totalPotentialProfit / STARTING_BALANCE) * 100).toFixed(2)}%`
    };
}

async function main() {
    const trades = await fetchTrades(TARGET_TRADER, DAYS);
    const results = [];
    const combos = [
        [5, 1000, 0.92], [5, 1000, 0.95],
        [5, 500, 0.92],  [5, 500, 0.95],
        [5, 250, 0.92],  [5, 250, 0.95],
        [10, 1000, 0.92], [10, 1000, 0.95],
        [10, 500, 0.95]
    ];

    console.log(`\x1b[1mRunning relaxed batch simulations...\x1b[0m`);
    for (const [size, min, max] of combos) {
        process.stdout.write(`Testing $${size} copy / $${min} min / ${max} max price... `);
        const res = await runSimulation(trades, size, min, max);
        results.push(res);
        console.log(`ROI: ${res["ROI"]}`);
    }

    console.log("\n\x1b[1mFINAL BATCH AUDIT RESULTS (365 DAYS, $700 BUDGET):\x1b[0m");
    console.table(results);
}

main().catch(console.error);
