
import axios from 'axios';
import { Side } from '@polymarket/clob-client';
import { ENV } from '../config/env';

/**
 * BACKTEST SIMULATOR FOR POLYMARKET
 * 
 * Trader: LucasMeow (0x7f3c8979d0afa00007bae4747d5347122af05613)
 * Budget: $700
 * Position Size: $5
 */

// Configuration Constants
const TARGET_TRADER = "0x7f3c8979d0afa00007bae4747d5347122af05613";
const STARTING_BALANCE = 700;
const POSITION_SIZE_USD = 5;
const MAX_COPY_PRICE = 0.92;
const SLIPPAGE_THRESHOLD = 0.005; // 0.5%

// Command Line Arguments
const TRADE_COUNT = parseInt(process.argv[2]) || 100;

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

interface BacktestStats {
    totalAnalyzed: number;
    executed: number;
    filteredHighPrice: number;
    filteredWashTrade: number;
    filteredSlippage: number;
    wins: number;
    losses: number;
    finalBalance: number;
    maxDrawdown: number;
}

// Utility for console colors
const colors = {
    reset: "\x1b[0m",
    bright: "\x1b[1m",
    green: "\x1b[32m",
    red: "\x1b[31m",
    yellow: "\x1b[33m",
    cyan: "\x1b[36m",
    gray: "\x1b[90m"
};

/**
 * Fetches historical trades for a user.
 */
async function fetchHistoricalTrades(user: string, count: number): Promise<HistoricalTrade[]> {
    console.log(`${colors.cyan}Fetching ${count} historical trades for ${user}...${colors.reset}`);
    let allTrades: HistoricalTrade[] = [];
    let offset = 0;
    const limit = 100;

    while (allTrades.length < count) {
        const url = `https://data-api.polymarket.com/activity?user=${user}&type=TRADE&limit=${limit}&offset=${offset}`;
        try {
            const response = await axios.get(url, { timeout: 10000 });
            const data = response.data;
            if (!data || data.length === 0) break;

            const mapped = data.map((t: any) => ({
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
            offset += limit;
            if (data.length < limit) break;
            
            // Basic rate limit handling
            await new Promise(r => setTimeout(r, 200));
        } catch (error) {
            console.error(`Error fetching trades at offset ${offset}:`, error);
            break;
        }
    }

    return allTrades.slice(0, count).sort((a, b) => a.timestamp - b.timestamp);
}

/**
 * Fetches historical volume and price bounds for a specific minute.
 */
async function getMarketActivity(asset: string, timestamp: number): Promise<{ volume: number, high: number, low: number }> {
    const start = timestamp;
    const end = timestamp + 60;
    const url = `https://clob.polymarket.com/prices-history?market=${asset}&startTs=${start}&endTs=${end}&fidelity=1`;
    
    try {
        const response = await axios.get(url, { timeout: 5000 });
        const history = response.data; 
        
        if (!history || history.length === 0) return { volume: 0, high: 0, low: 0 };

        const prices = history.map((h: any) => parseFloat(h.p || h.price || 0));
        return {
            volume: 0, 
            high: Math.max(...prices),
            low: Math.min(...prices)
        };
    } catch {
        return { volume: 0, high: 0, low: 0 };
    }
}

/**
 * Fetches 24h market data for volume check fallback.
 */
async function getMarket24hVolume(conditionId: string): Promise<number> {
    const url = `https://gamma-api.polymarket.com/markets?condition_id=${conditionId}`;
    try {
        const response = await axios.get(url, { timeout: 5000 });
        if (response.data && response.data.length > 0) {
            return parseFloat(response.data[0].volume24hr || "0");
        }
    } catch {}
    return 0;
}

/**
 * Checks the final resolution of a market.
 */
async function getMarketResolution(conditionId: string): Promise<string | null> {
    const url = `https://gamma-api.polymarket.com/markets?condition_id=${conditionId}`;
    try {
        const response = await axios.get(url, { timeout: 5000 });
        if (response.data && response.data.length > 0) {
            const m = response.data[0];
            if (m.closed && m.resolution) return m.resolution;
        }
    } catch {}
    return null;
}

async function runBacktest() {
    console.log(`${colors.bright}${colors.cyan}--- POLYMARKET BACKTEST SIMULATOR ---${colors.reset}`);
    console.log(`${colors.gray}Target: ${TARGET_TRADER} | Budget: $${STARTING_BALANCE} | Trade: $${POSITION_SIZE_USD}${colors.reset}\n`);

    const trades = await fetchHistoricalTrades(TARGET_TRADER, TRADE_COUNT);
    if (trades.length === 0) {
        console.log(`${colors.red}No trades found to analyze.${colors.reset}`);
        return;
    }

    const stats: BacktestStats = {
        totalAnalyzed: trades.length,
        executed: 0,
        filteredHighPrice: 0,
        filteredWashTrade: 0,
        filteredSlippage: 0,
        wins: 0,
        losses: 0,
        finalBalance: STARTING_BALANCE,
        maxDrawdown: 0
    };

    let peakBalance = STARTING_BALANCE;
    const logs: any[] = [];

    for (const trade of trades) {
        let skipReason: string | null = null;
        let skipData: string = "";
        const leaderInfo = `${trade.size.toFixed(2)} shares @ $${trade.price.toFixed(4)} (Total: $${trade.usdcSize.toFixed(2)})`;

        // 1. Inverse Bond Check
        if (trade.side === 'BUY' && trade.price > MAX_COPY_PRICE) {
            stats.filteredHighPrice++;
            skipReason = "HIGH_PRICE";
            skipData = `Price $${trade.price.toFixed(4)} > $${MAX_COPY_PRICE}`;
        }

        // 2. Wash Trade Check
        if (!skipReason) {
            const vol24h = await getMarket24hVolume(trade.conditionId);
            const dominance = vol24h > 0 ? (trade.usdcSize / vol24h) : 0;
            if (vol24h > 0 && dominance > 0.02) {
                stats.filteredWashTrade++;
                skipReason = "WASH_TRADE";
                skipData = `Leader $${trade.usdcSize.toFixed(2)} is ${(dominance * 100).toFixed(2)}% of 24h Vol ($${vol24h.toFixed(2)})`;
            }
        }

        // 3. Slippage Simulation
        let slippageData = "";
        if (!skipReason && trade.side === 'BUY') {
            const activity = await getMarketActivity(trade.asset, trade.timestamp);
            if (activity.high > 0) {
                const deviation = (activity.high - trade.price) / trade.price;
                slippageData = `Minute High: $${activity.high.toFixed(4)}, Dev: ${(deviation * 100).toFixed(2)}%`;
                if (deviation > SLIPPAGE_THRESHOLD) {
                    stats.filteredSlippage++;
                    skipReason = "SLIPPAGE";
                    skipData = slippageData;
                }
            } else {
                slippageData = "No minute data";
            }
        }

        if (skipReason) {
            logs.push({
                timestamp: new Date(trade.timestamp * 1000).toISOString(),
                market: trade.market.slice(0, 30),
                side: trade.side,
                leaderTrade: leaderInfo,
                status: `FILTERED: ${skipReason}`,
                reasonData: skipData
            });
            continue;
        }

        // EXECUTE TRADE
        stats.executed++;
        const resolution = await getMarketResolution(trade.conditionId);
        
        let result = "PENDING";
        let balanceChange = "$0.00";
        if (resolution) {
            if (resolution === trade.outcome) {
                stats.wins++;
                const profit = POSITION_SIZE_USD * (1 / trade.price - 1);
                stats.finalBalance += profit;
                result = "WIN";
                balanceChange = `+$${profit.toFixed(2)}`;
            } else {
                stats.losses++;
                stats.finalBalance -= POSITION_SIZE_USD;
                result = "LOSS";
                balanceChange = `-$${POSITION_SIZE_USD.toFixed(2)}`;
            }
        }

        if (stats.finalBalance > peakBalance) peakBalance = stats.finalBalance;
        const drawdown = peakBalance - stats.finalBalance;
        if (drawdown > stats.maxDrawdown) stats.maxDrawdown = drawdown;

        logs.push({
            timestamp: new Date(trade.timestamp * 1000).toISOString(),
            market: trade.market.slice(0, 30),
            side: trade.side,
            leaderTrade: leaderInfo,
            status: "EXECUTED",
            result: result,
            pnl: balanceChange,
            balance: `$${stats.finalBalance.toFixed(2)}`,
            slippageInfo: slippageData
        });

        // Throttle to avoid rate limits
        await new Promise(r => setTimeout(r, 100));
    }

    console.log("\n" + colors.bright + "SIMULATION LOGS:" + colors.reset);
    console.table(logs);

    console.log("\n" + colors.bright + "BACKTEST SUMMARY REPORT" + colors.reset);
    const summary = {
        "Total Trades Analyzed": stats.totalAnalyzed,
        "Trades Executed": stats.executed,
        "Win Rate (Executed)": stats.executed > 0 ? `${((stats.wins / (stats.wins + stats.losses)) * 100).toFixed(2)}%` : "N/A",
        "Filtered: High Price": stats.filteredHighPrice,
        "Filtered: Wash Trade": stats.filteredWashTrade,
        "Filtered: Slippage": stats.filteredSlippage,
        "Starting Balance": `$${STARTING_BALANCE}`,
        "Final Balance": `$${stats.finalBalance.toFixed(2)}`,
        "Total ROI": `${(((stats.finalBalance - STARTING_BALANCE) / STARTING_BALANCE) * 100).toFixed(2)}%`,
        "Max Drawdown": `$${stats.maxDrawdown.toFixed(2)}`
    };
    console.table(summary);
}

runBacktest().catch(console.error);
