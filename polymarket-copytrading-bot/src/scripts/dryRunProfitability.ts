
import axios from 'axios';
import * as fs from 'fs';
import { ENV } from '../config/env';

/**
 * 🧪 DRY-RUN PROFITABILITY CALCULATOR
 * Calculates hypothetical USD profit for your specific wallet settings
 * using the most recent trades of your configured leader.
 */

const STARTING_BALANCE = 1000; // Updated capital
const COPY_SIZE = 5; // $5 per trade (Pilot mode)

async function fetchWithRetry(url: string, retries = 3): Promise<any> {
    for (let i = 0; i < retries; i++) {
        try {
            const res = await axios.get(url, { timeout: 10000 });
            return res.data;
        } catch (e) {
            if (i === retries - 1) return null;
            await new Promise(r => setTimeout(r, 200 * (i + 1)));
        }
    }
}

async function getMarketInfo(conditionId: string): Promise<any> {
    try {
        const url = `https://clob.polymarket.com/markets/${conditionId}`;
        return await fetchWithRetry(url);
    } catch { return null; }
}

async function runDryRun() {
    const leader = ENV.USER_ADDRESSES[0];
    if (!leader) {
        console.error("❌ No USER_ADDRESSES found in .env");
        return;
    }

    console.log(`\n🧪 DRY-RUN PROFITABILITY ANALYSIS`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`Leader: ${leader}`);
    console.log(`Config: $${COPY_SIZE} per trade | Start: $${STARTING_BALANCE}`);
    console.log(`Filters: MinTrade >$${ENV.MIN_LEADER_TRADE_USD} | MinVol >$${ENV.MIN_MARKET_24H_VOL/1000}k | Dev <${ENV.MAX_PRICE_DEVIATION*100}%\n`);

    // Fetch latest 50 activity items
    const url = `https://data-api.polymarket.com/activity?user=${leader}&type=TRADE&limit=50`;
    const activity = await fetchWithRetry(url);

    if (!activity || activity.length === 0) {
        console.log("No recent activity found for this leader.");
        return;
    }

    let balance = STARTING_BALANCE;
    let tradesProcessed = 0;
    let wins = 0;
    let losses = 0;
    let active = 0;

    const results = [];

    for (const trade of activity) {
        if (trade.side !== 'BUY') continue;

        // Apply Filters
        if (parseFloat(trade.usdcSize) < ENV.MIN_LEADER_TRADE_USD) continue;
        
        // Note: Real-time price deviation cannot be checked historically perfectly,
        // so we assume execution success for dry-run if other filters pass.

        const mInfo = await getMarketInfo(trade.conditionId);
        if (!mInfo) continue;

        tradesProcessed++;
        const tradePrice = parseFloat(trade.price);
        
        let status = "ACTIVE";
        let profit = 0;

        if (mInfo.closed) {
            const winningToken = mInfo.tokens.find((t: any) => t.winner === true);
            if (winningToken) {
                const won = winningToken.outcome.toLowerCase() === trade.outcome.toLowerCase();
                if (won) {
                    wins++;
                    profit = COPY_SIZE * (1 / tradePrice - 1);
                    status = "✅ WON";
                } else {
                    losses++;
                    profit = -COPY_SIZE;
                    status = "❌ LOST";
                }
                balance += profit;
            }
        } else {
            active++;
            status = "⏳ OPEN";
        }

        results.push({
            market: trade.slug?.substring(0, 30) + "...",
            price: tradePrice.toFixed(2),
            size: `$${parseFloat(trade.usdcSize).toFixed(0)}`,
            status,
            pnl: profit !== 0 ? `${profit > 0 ? '+' : ''}$${profit.toFixed(2)}` : '-'
        });
    }

    if (results.length > 0) {
        console.table(results);
        console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
        console.log(`Summary of Last ${results.length} Eligible Trades:`);
        console.log(`Wins: ${wins} | Losses: ${losses} | Open: ${active}`);
        console.log(`Final Dry-Run Balance: $${balance.toFixed(2)}`);
        console.log(`Total Return: ${(((balance - STARTING_BALANCE) / STARTING_BALANCE) * 100).toFixed(2)}%`);
        console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
    } else {
        console.log("No trades passed your .env filters in the last 50 activity items.");
    }
}

runDryRun().catch(console.error);
