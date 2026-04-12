
import axios from 'axios';
import { Side } from '@polymarket/clob-client';
import { ENV } from '../config/env';
import { calculateOrderSize } from '../config/copyStrategy';
import { ethers } from 'ethers';

/**
 * TRADER AUDIT TOOL (PRECISION VERSION)
 * 
 * Supports command line overrides for actual bot parameters.
 */

// Command Line Arguments
const TARGET_TRADER = process.argv[2];
const DAYS_TO_AUDIT = parseInt(process.argv[3]) || 30;
const OVERRIDE_COPY_SIZE = process.argv[4] ? parseFloat(process.argv[4]) : undefined;
const OVERRIDE_MIN_LEADER_SIZE = process.argv[5] ? parseFloat(process.argv[5]) : undefined;

if (!TARGET_TRADER) {
    console.error("\x1b[31mError: Please provide a trader wallet address.\x1b[0m");
    console.log("Usage: npm run audit <wallet_address> [days_to_audit] [copy_size] [min_leader_size]");
    process.exit(1);
}

// Configuration Prep (Merge ENV with Overrides)
const auditConfig = { ...ENV.COPY_STRATEGY_CONFIG };
if (OVERRIDE_COPY_SIZE !== undefined) auditConfig.copySize = OVERRIDE_COPY_SIZE;

const minLeaderSize = OVERRIDE_MIN_LEADER_SIZE !== undefined 
    ? OVERRIDE_MIN_LEADER_SIZE 
    : (ENV.MIN_LEADER_TRADE_USD || 1000);

const STARTING_BALANCE = 700;
const SLIPPAGE_THRESHOLD = ENV.MAX_PRICE_DEVIATION || 0.005;
const MAX_COPY_PRICE = ENV.MAX_COPY_PRICE || 0.92;

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

interface AuditPosition {
    asset: string;
    outcome: string;
    shares: number;
    costBasis: number;
    market: string;
    conditionId: string;
}

const colors = {
    reset: "\x1b[0m",
    bright: "\x1b[1m",
    green: "\x1b[32m",
    red: "\x1b[31m",
    yellow: "\x1b[33m",
    cyan: "\x1b[36m",
    blue: "\x1b[34m",
    gray: "\x1b[90m"
};

async function fetchHistoricalTrades(user: string, days: number): Promise<HistoricalTrade[]> {
    let allTrades: HistoricalTrade[] = [];
    let offset = 0;
    const limit = 100;
    const sinceTimestamp = Math.floor((Date.now() - (days * 24 * 3600 * 1000)) / 1000);

    console.log(`${colors.cyan}Fetching trades for ${user} since ${new Date(sinceTimestamp * 1000).toLocaleDateString()}... ${colors.reset}`);

    while (true) {
        const url = `https://data-api.polymarket.com/activity?user=${user}&type=TRADE&limit=${limit}&offset=${offset}`;
        try {
            const response = await axios.get(url, { timeout: 10000 });
            const data = response.data;
            if (!data || data.length === 0) break;

            const mapped = data
                .filter((t: any) => t.timestamp >= sinceTimestamp)
                .map((t: any) => ({
                    id: t.id,
                    timestamp: t.timestamp,
                    asset: t.asset,
                    market: t.slug || t.market,
                    side: t.side,
                    price: parseFloat(t.price),
                    usdcSize: parseFloat(t.usdcSize),
                    size: parseFloat(t.size),
                    outcome: t.outcome,
                    conditionId: t.conditionId
                }));

            allTrades = allTrades.concat(mapped);
            if (data[data.length - 1].timestamp < sinceTimestamp) break;
            offset += limit;
            if (data.length < limit) break;
            process.stdout.write(colors.gray + ".");
            await new Promise(r => setTimeout(r, 50));
        } catch (error) {
            break;
        }
    }
    console.log(`\n${colors.green}✓ Found ${allTrades.length} total trades.${colors.reset}`);
    return allTrades.sort((a, b) => a.timestamp - b.timestamp);
}

async function getMarketInfo(conditionId: string, slug?: string) {
    let url = `https://gamma-api.polymarket.com/markets?condition_id=${conditionId}`;
    try {
        let response = await axios.get(url, { timeout: 5000 });
        if (Array.isArray(response.data) && response.data.length > 0) {
            const m = response.data.find((item: any) => item.conditionId === conditionId);
            if (m) return m;
        }
        if (slug) {
            url = `https://gamma-api.polymarket.com/markets?slug=${slug}`;
            response = await axios.get(url, { timeout: 5000 });
            if (Array.isArray(response.data) && response.data.length > 0) {
                return response.data[0];
            }
        }
    } catch {}
    return null;
}

async function getMarket24hVolume(conditionId: string): Promise<number> {
    const url = `https://gamma-api.polymarket.com/markets?condition_id=${conditionId}`;
    try {
        const response = await axios.get(url, { timeout: 5000 });
        if (Array.isArray(response.data)) {
            const m = response.data.find((item: any) => item.conditionId === conditionId);
            return m?.volume24hr ? parseFloat(m.volume24hr) : 0;
        }
    } catch {}
    return 0;
}

async function runAudit() {
    console.log(`\n${colors.bright}${colors.blue}╔══════════════════════════════════════════════════════════════════════════════╗`);
    console.log(`║ 🔍 TRADER AUDIT: ${TARGET_TRADER.slice(0, 20)}... ║`);
    console.log(`║ Period: Last ${DAYS_TO_AUDIT} Days | Copy: $${auditConfig.copySize} | Min Leader: $${minLeaderSize} ║`);
    console.log(`╚══════════════════════════════════════════════════════════════════════════════╝${colors.reset}\n`);

    const trades = await fetchHistoricalTrades(TARGET_TRADER, DAYS_TO_AUDIT);
    if (trades.length === 0) return;

    let executedCount = 0;
    let filteredHighPrice = 0;
    let filteredWashTrade = 0;
    let filteredSize = 0;
    let filteredLeaderMin = 0;

    let settledWins = 0;
    let settledLosses = 0;
    
    let cashBalance = STARTING_BALANCE;
    const activePositions = new Map<string, AuditPosition>();

    console.log(`${colors.cyan}Simulating copy strategy... ${colors.reset}`);

    for (let i = 0; i < trades.length; i++) {
        const trade = trades[i];
        if (i % 100 === 0) process.stdout.write(colors.gray + ".");

        const posKey = `${trade.asset}:${trade.outcome}`;
        let skipReason: string | null = null;

        if (trade.side === 'BUY') {
            // 1. Leader Minimum Size Check (Dynamic Override)
            if (trade.usdcSize < minLeaderSize) {
                filteredLeaderMin++;
                skipReason = "LEADER_MIN_SIZE";
            }
            // 2. High Price Ceiling
            else if (trade.price > MAX_COPY_PRICE) {
                filteredHighPrice++;
                skipReason = "HIGH_PRICE";
            } else {
                // 3. Wash Trade check
                const vol24h = await getMarket24hVolume(trade.conditionId);
                if (vol24h > 0 && (trade.usdcSize / vol24h) > 0.02) {
                    filteredWashTrade++;
                    skipReason = "WASH_TRADE";
                } else {
                    // 4. Follower Strategy Check (Size)
                    const calc = calculateOrderSize(auditConfig, trade.usdcSize, cashBalance);
                    if (calc.finalAmount <= 0) {
                        filteredSize++;
                        skipReason = "SIZE_FILTER";
                    }
                }
            }
        }

        if (skipReason) continue;

        executedCount++;
        
        if (trade.side === 'BUY') {
            const calc = calculateOrderSize(auditConfig, trade.usdcSize, cashBalance);
            const myUsdcAmount = calc.finalAmount;
            const myShares = myUsdcAmount / trade.price;

            if (!activePositions.has(posKey)) {
                activePositions.set(posKey, {
                    asset: trade.asset,
                    outcome: trade.outcome,
                    shares: 0,
                    costBasis: 0,
                    market: trade.market,
                    conditionId: trade.conditionId
                });
            }
            const p = activePositions.get(posKey)!;
            p.shares += myShares;
            p.costBasis += myUsdcAmount;
            cashBalance -= myUsdcAmount;
        } else {
            // SELL
            if (activePositions.has(posKey)) {
                const p = activePositions.get(posKey)!;
                if (p.shares > 0) {
                    const traderSharesSold = trade.usdcSize / trade.price;
                    const sharesToSell = Math.min(p.shares, traderSharesSold); 
                    
                    const costOfSharesSold = (sharesToSell / p.shares) * p.costBasis;
                    const revenue = sharesToSell * trade.price;
                    const pnl = revenue - costOfSharesSold;
                    
                    if (pnl > 0.01) settledWins++;
                    else if (pnl < -0.01) settledLosses++;
                    
                    cashBalance += revenue;
                    p.shares -= sharesToSell;
                    p.costBasis -= costOfSharesSold;
                    if (p.shares < 0.01) activePositions.delete(posKey);
                }
            }
        }
    }

    console.log(`\n${colors.cyan}Resolving open positions...${colors.reset}`);
    let openBetsCount = 0;
    let unrealizedValue = 0;
    const finalPositions: any[] = [];

    const activeEntries = Array.from(activePositions.values());
    for (let i = 0; i < activeEntries.length; i++) {
        const p = activeEntries[i];
        if (i % 5 === 0) process.stdout.write(colors.gray + ".");
        
        const m = await getMarketInfo(p.conditionId, p.market);
        let currentPrice = 0.5;
        let marketClosed = false;
        let winIndex = -1;
        let outcomes: string[] = [];

        if (m) {
            marketClosed = m.closed;
            const prices = m.outcomePrices ? JSON.parse(m.outcomePrices) : [];
            outcomes = m.outcomes ? JSON.parse(m.outcomes) : [];
            const idx = outcomes.findIndex((o: string) => o.toLowerCase() === p.outcome.toLowerCase());
            currentPrice = idx !== -1 ? parseFloat(prices[idx]) : 0.5;
            winIndex = prices.findIndex((pr: string) => parseFloat(pr) >= 0.99);
        }

        if (marketClosed && winIndex !== -1) {
            const winner = outcomes[winIndex];
            const isWin = (winner.toLowerCase() === p.outcome.toLowerCase());
            const finalValue = isWin ? p.shares : 0;
            
            cashBalance += finalValue;
            if (finalValue > p.costBasis) settledWins++;
            else settledLosses++;
        } else {
            openBetsCount++;
            const val = p.shares * currentPrice;
            unrealizedValue += val;
            finalPositions.push({
                market: p.market.slice(0, 25),
                outcome: p.outcome,
                shares: p.shares.toFixed(2),
                cost: p.costBasis.toFixed(2),
                price: currentPrice.toFixed(4),
                value: val.toFixed(2)
            });
        }
        await new Promise(r => setTimeout(r, 20));
    }

    const finalEquity = cashBalance + unrealizedValue;
    const totalNetProfit = finalEquity - STARTING_BALANCE;
    const totalSettled = settledWins + settledLosses;
    const winRate = totalSettled > 0 ? (settledWins / totalSettled) * 100 : 0;
    const openBetsPercent = executedCount > 0 ? (openBetsCount / executedCount) * 100 : 0;
    const roi = (totalNetProfit / STARTING_BALANCE) * 100;

    console.log("\n" + colors.bright + "OPEN POSITIONS SUMMARY:" + colors.reset);
    console.table(finalPositions);

    console.log("\n" + colors.bright + "SUMMARY REPORT (LAST " + DAYS_TO_AUDIT + " DAYS):" + colors.reset);
    console.table({
        "Analyzed Trades": trades.length,
        "Compatible Trades": executedCount,
        "Blocked: High Price": filteredHighPrice,
        "Blocked: Leader Min Size": filteredLeaderMin,
        "Blocked: Size/Balance": filteredSize,
        "Open Bets (Count)": openBetsCount,
        "Settled Events (Win/Loss)": totalSettled,
        "Win Rate (Settled)": winRate.toFixed(1) + "%",
        "Starting Capital": "$" + STARTING_BALANCE.toFixed(2),
        "Final Cash": "$" + cashBalance.toFixed(2),
        "Unrealized Value": "$" + unrealizedValue.toFixed(2),
        "Final Equity": "$" + finalEquity.toFixed(2),
        "Total Net Profit": "$" + totalNetProfit.toFixed(2),
        "ROI (%)": roi.toFixed(1) + "%",
        "Expected Monthly": "$" + ((totalNetProfit / DAYS_TO_AUDIT) * 30).toFixed(2)
    });

    console.log(`\n${colors.bright}AUDIT INSIGHTS:${colors.reset}`);
    const score = Math.max(0, Math.min(100, 50 + (winRate - 50) + (roi * 2)));
    console.log(`- Attractiveness Score: ${score.toFixed(0)}/100`);
    if (totalNetProfit > 0) console.log(`${colors.green}✓ Strategy is profitable with $${STARTING_BALANCE} budget.${colors.reset}`);
    else console.log(`${colors.red}✗ Strategy is net negative with $${STARTING_BALANCE} budget.${colors.reset}`);
}

runAudit().catch(console.error);
