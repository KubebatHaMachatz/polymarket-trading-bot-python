
import axios from 'axios';
import * as fs from 'fs';
import { Side } from '@polymarket/clob-client';
import { ENV } from '../config/env';

/**
 * FINAL PORTFOLIO AUDIT
 * 
 * Runs full 365-day backtests on the discovered high-velocity scalpers.
 */

const DAYS = 365;
const STARTING_BALANCE = 700;
const COPY_SIZE = 5;
const MAX_PRICE = 0.75;

const TARGET_TRADERS = [
    "0x3cf3e8d5427aed066a7a5926980600f6c3cf87b3", // 50Whence
    "0xc851cd9bee7d262afd78674f861f9f576a12cd2a", // betwick
    "0x7c3db723f1d4d8cb9c550095203b686cb11e5c6b", // Car
    "0x0b9cae2b0dfe7a71c413e0604eaac1c352f87e44", // geniusMC
    "0xe1e7036279433715711a65fc3254a8af558c5fb6", // 0xPolymath
    "0xae5b31e2ca93121383a914df2385af05e9150a8c", // RexRegum
    "0x48afe8fbde091ff3e616901dc92ef20862c289cc", // heresjimmy
    "0x3f82652df61a99232fc67e7e3c0d6e0c212f00b4", // Julia2020
    "0xdc9e0ee3d430b799b3f929505f23e25fa1a0ba88", // Dr.Damnboy
    "0x0cb10c40b0776e9ee8cef970af85724654dda76c"  // ninjaslashed
];

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

async function fetchHistory(user: string): Promise<any[]> {
    let allTrades: any[] = [];
    let offset = 0;
    const sinceTimestamp = Math.floor((Date.now() - (DAYS * 24 * 3600 * 1000)) / 1000);

    while (allTrades.length < 500) { 
        const url = `https://data-api.polymarket.com/activity?user=${user}&type=TRADE&limit=100&offset=${offset}`;
        try {
            const response = await axios.get(url, { timeout: 10000 });
            if (!response.data || response.data.length === 0) break;
            const mapped = response.data
                .filter((t: any) => t.timestamp >= sinceTimestamp)
                .map((t: any) => ({
                    ...t, price: parseFloat(t.price), usdcSize: parseFloat(t.usdcSize)
                }));
            allTrades = allTrades.concat(mapped);
            if (response.data[response.data.length - 1].timestamp < sinceTimestamp) break;
            offset += 100;
        } catch { break; }
    }
    return allTrades.sort((a, b) => a.timestamp - b.timestamp);
}

async function runSimulation(trades: any[]) {
    let cash = STARTING_BALANCE;
    const activePositions = new Map<string, { shares: number, cost: number, conditionId: string, outcome: string }>();
    let realizedPnl = 0;
    let executed = 0;

    for (const t of trades) {
        const key = `${t.asset}:${t.outcome}`;
        if (t.side === 'BUY') {
            if (t.price > MAX_PRICE) continue;
            const myUsdc = Math.min(cash, COPY_SIZE);
            if (myUsdc <= 0) continue;
            executed++;
            const myShares = myUsdc / t.price;
            if (!activePositions.has(key)) activePositions.set(key, { shares: 0, cost: 0, conditionId: t.conditionId, outcome: t.outcome });
            const p = activePositions.get(key)!;
            p.shares += myShares;
            p.cost += myUsdc;
            cash -= myUsdc;
        } else {
            const p = activePositions.get(key);
            if (p && p.shares > 0) {
                const traderSharesSold = t.size ? parseFloat(t.size) : (t.usdcSize / t.price);
                const sellShares = Math.min(p.shares, traderSharesSold);
                const costBasisOfSold = (sellShares / p.shares) * p.cost;
                const revenue = sellShares * t.price;
                realizedPnl += (revenue - costBasisOfSold);
                cash += revenue;
                p.shares -= sellShares;
                p.cost -= costBasisOfSold;
                if (p.shares < 0.01) activePositions.delete(key);
            }
        }
    }

    let unrealized = 0;
    for (const p of activePositions.values()) {
        const m = await getCachedMarketInfo(p.conditionId);
        if (m?.closed) {
            const prices = m.outcomePrices ? JSON.parse(m.outcomePrices) : [];
            const outcomes = m.outcomes ? JSON.parse(m.outcomes) : [];
            const winIdx = prices.findIndex((pr: string) => parseFloat(pr) >= 0.98);
            if (winIdx !== -1 && outcomes[winIdx].toLowerCase() === p.outcome.toLowerCase()) {
                realizedPnl += (p.shares - p.cost);
            } else {
                realizedPnl -= p.cost;
            }
        } else {
            unrealized += (p.shares - p.cost);
        }
    }

    const totalNetProfit = realizedPnl + unrealized;
    return {
        profit: totalNetProfit,
        trades: executed
    };
}

async function main() {
    console.log(`\x1b[36mRunning Portfolio Audit on Top 10 Scalper Candidates...\x1b[0m\n`);
    const results: any[] = [];

    for (let i = 0; i < TARGET_TRADERS.length; i++) {
        const addr = TARGET_TRADERS[i];
        process.stdout.write(`[${i+1}/10] Auditing ${addr.slice(0,10)}... `);
        const trades = await fetchHistory(addr);
        if (trades.length === 0) { console.log("No trades."); continue; }

        const res = await runSimulation(trades);
        results.push({
            Trader: addr,
            "Total Trades": trades.length,
            "Copies": res.trades,
            "Net Profit": res.profit,
            "ROI": ((res.profit / STARTING_BALANCE) * 100).toFixed(2) + "%"
        });
        console.log("Done.");
        await new Promise(r => setTimeout(r, 100));
    }

    results.sort((a, b) => b["Net Profit"] - a["Net Profit"]);
    
    console.log("\n\x1b[1mFINAL PORTFOLIO SELECTION (365 DAYS, $700 BUDGET, $5 TRADES):\x1b[0m");
    console.table(results.map(r => ({
        ...r,
        "Net Profit": `$${r["Net Profit"].toFixed(2)}`
    })));
}

main().catch(console.error);
