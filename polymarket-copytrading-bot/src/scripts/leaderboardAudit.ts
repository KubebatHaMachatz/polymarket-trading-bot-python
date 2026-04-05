
import axios from 'axios';
import { Side } from '@polymarket/clob-client';
import { ENV } from '../config/env';

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

async function getCachedMarketInfo(conditionId: string) {
    if (marketCache.has(conditionId)) return marketCache.get(conditionId);
    try {
        const res = await axios.get(`https://gamma-api.polymarket.com/markets?condition_id=${conditionId}`, { timeout: 3000 });
        const data = res.data?.find((m: any) => m.conditionId === conditionId) || res.data?.[0];
        marketCache.set(conditionId, data);
        return data;
    } catch { return null; }
}

async function fetchDiscoveryTraders(): Promise<string[]> {
    console.log(`\x1b[36mDiscovering active leaderboard traders...\x1b[0m`);
    const traders = new Set<string>();
    
    const known = [
        "0x7f3c8979d0afa00007bae4747d5347122af05613", // LucasMeow
        "0x7c3db723f1d4d8cb9c550095203b686cb11e5c6b",
        "0x6bab41a0dc40d6dd4c1a915b8c01969479fd1292",
        "0xa4b366ad22fc0d06f1e934ff468e8922431a87b8",
        "0x11577e174308dd2960ae18ccb3ca3c06a79f95e1"
    ];
    known.forEach(a => traders.add(a.toLowerCase()));

    try {
        // Fetch most active markets
        const eventsRes = await axios.get('https://gamma-api.polymarket.com/events?limit=20&active=true');
        for (const event of eventsRes.data) {
            for (const market of event.markets || []) {
                try {
                    const tradesUrl = `https://data-api.polymarket.com/trades?market=${market.conditionId}&limit=50`;
                    const tRes = await axios.get(tradesUrl, { timeout: 3000 });
                    tRes.data.forEach((t: any) => {
                        if (t.owner) traders.add(t.owner.toLowerCase());
                    });
                } catch {}
                if (traders.size >= 50) break;
            }
            if (traders.size >= 50) break;
        }
    } catch (e) {
        console.log("Discovery partial, using found set.");
    }

    return Array.from(traders).slice(0, 50);
}

async function fetchHistory(user: string): Promise<HistoricalTrade[]> {
    let allTrades: HistoricalTrade[] = [];
    let offset = 0;
    const sinceTimestamp = Math.floor((Date.now() - (DAYS * 24 * 3600 * 1000)) / 1000);

    while (allTrades.length < 300) { 
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
        } catch { break; }
    }
    return allTrades.sort((a, b) => a.timestamp - b.timestamp);
}

async function runSimulation(trades: HistoricalTrade[], copySize: number, minLeaderSize: number, useCeiling: boolean) {
    let cash = STARTING_BALANCE;
    const activePositions = new Map<string, { shares: number, cost: number, conditionId: string, outcome: string }>();
    let realizedPnl = 0;
    let executed = 0;

    for (const t of trades) {
        const key = `${t.asset}:${t.outcome}`;
        if (t.side === 'BUY') {
            if ((useCeiling && t.price > 0.92) || t.usdcSize < minLeaderSize) continue;
            
            const myUsdc = Math.min(cash, copySize);
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
                const traderSharesSold = t.usdcSize / t.price;
                const sharesToSell = Math.min(p.shares, traderSharesSold);
                const costBasisOfSold = (sharesToSell / p.shares) * p.cost;
                realizedPnl += (sharesToSell * t.price - costBasisOfSold);
                cash += (sharesToSell * t.price);
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
                realizedPnl += (p.shares - p.cost);
            } else {
                realizedPnl -= p.cost;
            }
        } else {
            // Projected Win logic for top traders
            unrealizedNet += (p.shares - p.cost);
        }
    }

    return { profit: realizedPnl + unrealizedNet, trades: executed };
}

async function main() {
    const traders = await fetchDiscoveryTraders();
    const combos = [
        [5, 1000], [2, 1000], [5, 500], [5, 100]
    ];

    const results: any[] = [];
    console.log(`\x1b[1mStarting High-Fidelity Audit on ${traders.length} discovered traders...\x1b[0m`);

    for (let i = 0; i < traders.length; i++) {
        const addr = traders[i];
        process.stdout.write(`[${i+1}/${traders.length}] Auditing ${addr.slice(0,10)}... `);
        const trades = await fetchHistory(addr);
        if (trades.length === 0) { console.log("No trades."); continue; }

        for (const [size, min] of combos) {
            // Run with and without ceiling
            for (const ceiling of [true, false]) {
                const sim = await runSimulation(trades, size, min, ceiling);
                if (sim.trades === 0) continue;
                
                results.push({
                    Trader: addr.slice(0, 12) + "...",
                    "Copy $": `$${size}`,
                    "Min Ldr $": `$${min}`,
                    "Ceiling": ceiling ? "0.92" : "None",
                    "Trades": sim.trades,
                    "Projected Profit": sim.profit,
                    "ROI": (sim.profit / STARTING_BALANCE * 100).toFixed(2) + "%"
                });
            }
        }
        console.log("Done.");
        await new Promise(r => setTimeout(r, 100));
    }

    results.sort((a, b) => b["Projected Profit"] - a["Projected Profit"]);
    
    const displayResults = results.slice(0, 50).map(r => ({
        ...r,
        "Projected Profit": `$${r["Projected Profit"].toFixed(2)}`
    }));

    console.log("\n\x1b[1mTOP 50 PROFITABLE STRATEGIES (PROJECTED):\x1b[0m");
    console.table(displayResults);
}

main().catch(console.error);
