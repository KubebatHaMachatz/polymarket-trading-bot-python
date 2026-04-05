
import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';

/**
 * 📊 ADVANCED MULTI-STRATEGY BACKTESTER (v9)
 * Now includes Average Holding Time (Exposure Duration).
 */

const FILTERS = {
    minLeaderTradeUsd: [5, 50, 500],
    minMarket24hVol: [10000, 50000, 100000],
    maxPriceDeviation: [0.005, 0.01, 0.02] 
};

const TIME_FRAMES = [730, 365, 90]; 
const STARTING_BALANCE = 1000;
const COPY_SIZE_USD = 10;
const TRADER_CACHE_DIR = './trader_data_cache';
const TOP_TRADERS_FILE = 'top_traders_by_category.json';

interface HistoricalTrade {
    id: string; timestamp: number; asset: string; market: string;
    side: 'BUY' | 'SELL'; price: number; usdcSize: number;
    conditionId: string; outcome: string;
}

interface BacktestResult {
    trader: string; address: string; category: string; timeframe: number;
    minTrade: number; minVol: number; maxDev: number;
    executedCount: number; wins: number; losses: number;
    finalBalance: number; roi: number; annualRoi: number;
    avgHoldingDays: number;
}

if (!fs.existsSync(TRADER_CACHE_DIR)) fs.mkdirSync(TRADER_CACHE_DIR);

const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

async function fetchWithRetry(url: string, retries = 3): Promise<any> {
    for (let i = 0; i < retries; i++) {
        try {
            const res = await axios.get(url, { timeout: 10000 });
            return res.data;
        } catch (e) {
            if (i === retries - 1) return null;
            await delay(200 * (i + 1));
        }
    }
}

async function getTraderHistory(address: string): Promise<HistoricalTrade[]> {
    const cachePath = path.join(TRADER_CACHE_DIR, `${address}.json`);
    if (fs.existsSync(cachePath)) return JSON.parse(fs.readFileSync(cachePath, 'utf8'));
    return [];
}

const marketInfoCache: Record<string, any> = {};
async function getMarketInfo(conditionId: string): Promise<any> {
    if (marketInfoCache[conditionId] !== undefined) return marketInfoCache[conditionId];
    try {
        const url = `https://clob.polymarket.com/markets/${conditionId}`;
        const data = await fetchWithRetry(url);
        if (data) {
            marketInfoCache[conditionId] = data;
            return data;
        }
    } catch {}
    marketInfoCache[conditionId] = null;
    return null;
}

async function runSimulation(
    traderName: string, address: string, category: string, history: HistoricalTrade[],
    timeframeDays: number, minTrade: number, minVol: number, maxDev: number
): Promise<BacktestResult> {
    const cutoffTs = Math.floor(Date.now() / 1000) - (timeframeDays * 24 * 3600);
    let balance = STARTING_BALANCE;
    let wins = 0; let losses = 0; let executedCount = 0;
    
    const buyTrades = history.filter(t => t.side === 'BUY' && t.timestamp > cutoffTs);
    const holdingDurations: number[] = [];

    for (const trade of buyTrades) {
        if (trade.usdcSize < minTrade) continue;
        if (trade.usdcSize < (minVol / 100)) continue;

        const mInfo = await getMarketInfo(trade.conditionId);
        if (!mInfo || !mInfo.closed) continue;

        const winningToken = mInfo.tokens.find((t: any) => t.winner === true);
        if (!winningToken) continue;

        executedCount++;
        const res = winningToken.outcome;
        
        // Calculate holding time (Resolution Date - Buy Date)
        const resolutionTs = Math.floor(new Date(mInfo.end_date_iso).getTime() / 1000);
        const durationDays = (resolutionTs - trade.timestamp) / (24 * 3600);
        if (durationDays > 0) holdingDurations.push(durationDays);

        if (res.toLowerCase().trim() === trade.outcome.toLowerCase().trim()) {
            wins++;
            balance += COPY_SIZE_USD * (1 / trade.price - 1);
        } else {
            losses++;
            balance -= COPY_SIZE_USD;
        }
    }

    const roi = ((balance - STARTING_BALANCE) / STARTING_BALANCE) * 100;
    const annualRoi = (roi / timeframeDays) * 365;
    const avgHoldingDays = holdingDurations.length > 0 
        ? holdingDurations.reduce((a,b) => a+b, 0) / holdingDurations.length 
        : 0;

    return {
        trader: traderName, address, category, timeframe: timeframeDays,
        minTrade, minVol, maxDev, executedCount, wins, losses,
        finalBalance: balance, roi, annualRoi, avgHoldingDays
    };
}

function getLinks(address: string) {
    return `
        <a href="https://polymarket.com/profile/${address}" target="_blank" class="link-pm">PM</a>
        <a href="https://predictfolio.com/profile/${address}" target="_blank" class="link-pf">PF</a>
        <a href="https://polymarketanalytics.com/profile/${address}" target="_blank" class="link-pa">PA</a>
    `;
}

async function main() {
    console.log("🚀 STARTING GLOBAL BACKTEST MATRIX v9...");
    const topTradersData = JSON.parse(fs.readFileSync(TOP_TRADERS_FILE, 'utf8'));
    const results: BacktestResult[] = [];
    const categories = Object.keys(topTradersData);

    for (const cat of categories) {
        console.log(`📂 Category: ${cat}`);
        const traders = topTradersData[cat].slice(0, 5); 

        for (const trader of traders) {
            process.stdout.write(`  👤 ${trader.userName || trader.proxyWallet.slice(0,10)}: `);
            const history = await getTraderHistory(trader.proxyWallet);
            if (!history || history.length === 0) { console.log("Skip"); continue; }

            for (const days of TIME_FRAMES) {
                const seenSignatures = new Set<string>();

                for (const minTrade of FILTERS.minLeaderTradeUsd) {
                    for (const minVol of FILTERS.minMarket24hVol) {
                        for (const maxDev of FILTERS.maxPriceDeviation) {
                            const res = await runSimulation(
                                trader.userName || trader.proxyWallet.slice(0, 10),
                                trader.proxyWallet,
                                cat, history, days, minTrade, minVol, maxDev
                            );
                            
                            if (res.executedCount > 0) {
                                const sig = `${trader.proxyWallet}-${days}-${res.executedCount}-${res.roi.toFixed(4)}`;
                                if (!seenSignatures.has(sig)) {
                                    results.push(res);
                                    seenSignatures.add(sig);
                                }
                            }
                        }
                        process.stdout.write(".");
                    }
                }
            }
            console.log(" done");
        }
    }

    results.sort((a, b) => {
        if (a.category !== b.category) return a.category.localeCompare(b.category);
        return b.roi - a.roi;
    });

    let html = `
    <!DOCTYPE html>
    <html>
    <head>
        <title>Polymarket Backtest Results v9</title>
        <style>
            body { font-family: -apple-system, system-ui, sans-serif; background: #0f172a; color: #f8fafc; padding: 20px; line-height: 1.5; }
            h1 { color: #38bdf8; border-bottom: 2px solid #1e293b; padding-bottom: 10px; display: flex; justify-content: space-between; align-items: center; }
            h2 { color: #8b5cf6; margin-top: 40px; background: #1e293b; padding: 12px; border-radius: 8px; display: flex; justify-content: space-between; align-items: center; }
            table { width: 100%; border-collapse: collapse; margin-top: 10px; background: #1e293b; border-radius: 8px; overflow: hidden; }
            th, td { padding: 12px; text-align: left; border-bottom: 1px solid #334155; }
            th { background: #334155; color: #38bdf8; font-size: 0.75rem; text-transform: uppercase; }
            tr:hover { background: #334155; }
            .roi-pos { color: #4ade80; font-weight: bold; } .roi-neg { color: #f87171; }
            .filter-tag { padding: 2px 6px; background: #0ea5e9; border-radius: 4px; font-size: 0.7rem; margin-right: 4px; color: white; }
            .annual-roi { font-size: 0.95rem; color: #fbbf24; font-weight: 800; }
            .avg-time { font-size: 0.8rem; color: #94a3b8; }
            .links a { text-decoration: none; font-size: 0.7rem; padding: 2px 6px; border-radius: 4px; margin-left: 4px; font-weight: bold; }
            .link-pm { background: #2563eb; color: white; }
            .link-pf { background: #7c3aed; color: white; }
            .link-pa { background: #db2777; color: white; }
        </style>
    </head>
    <body>
        <h1>📊 Strategy Backtest Results v9 <span style="font-size: 1rem; color: #94a3b8;">Includes Avg Holding Time</span></h1>
    `;

    let currentCat = "";
    results.forEach(r => {
        if (r.category !== currentCat) {
            if (currentCat !== "") html += `</tbody></table>`;
            currentCat = r.category;
            html += `
            <h2>
                <span>📂 Category: ${currentCat}</span>
                <div class="links">
                    Verify Top Leaderboard: 
                    <a href="https://polymarket.com/leaderboard" target="_blank" class="link-pm">Polymarket</a>
                    <a href="https://predictfolio.com/leaderboard" target="_blank" class="link-pf">Predictfolio</a>
                </div>
            </h2>
            <table>
                <thead>
                    <tr>
                        <th>Trader & Links</th><th>Timeframe</th><th>Optimal Filters</th><th>Trades</th><th>W/L</th><th>Avg Hold</th><th>Total ROI</th><th>Annual ROI</th>
                    </tr>
                </thead>
                <tbody>`;
        }

        html += `
            <tr>
                <td>
                    <strong>${r.trader}</strong><br/>
                    <div class="links" style="margin-top:4px;">${getLinks(r.address)}</div>
                </td>
                <td>${r.timeframe}d</td>
                <td>
                    <span class="filter-tag">Trade >$${r.minTrade}</span>
                    <span class="filter-tag">Vol >$${r.minVol/1000}k</span>
                </td>
                <td>${r.executedCount}</td>
                <td>${r.wins}/${r.losses}</td>
                <td class="avg-time">${r.avgHoldingDays.toFixed(1)} days</td>
                <td class="${r.roi >= 0 ? 'roi-pos' : 'roi-neg'}">${r.roi.toFixed(2)}%</td>
                <td class="annual-roi">${r.annualRoi.toFixed(2)}%</td>
            </tr>
        `;
    });

    html += `</tbody></table></body></html>`;
    fs.writeFileSync('global_backtest_report.html', html);
    console.log("\n✅ BACKTEST COMPLETE! Open global_backtest_report.html");
}

main().catch(console.error);
