import axios from 'axios';
import fs from 'fs';
import path from 'path';

// --- CONFIGURATION ---
const TRADER_ADDRESS = '0x8a4c788f043023b8b28a762216d037e9f148532b';
const HISTORY_DAYS = 365;
const STARTING_CAPITAL = 1000;
const FIXED_COPY_SIZE = 25.0;     // Our BUY size
const MIN_LEADER_BUY_USD = 50.0;   // Leader must BUY at least this much
const MIN_ORDER_SIZE_USD = 1.0;    // Polymarket minimum

// Colors for output
const green = (t: string) => `\x1b[32m${t}\x1b[0m`;
const red = (t: string) => `\x1b[31m${t}\x1b[0m`;
const cyan = (t: string) => `\x1b[36m${t}\x1b[0m`;
const yellow = (t: string) => `\x1b[33m${t}\x1b[0m`;
const bold = (t: string) => `\x1b[1m${t}\x1b[0m`;

interface Trade {
    timestamp: number;
    side: 'BUY' | 'SELL';
    price: number;
    usdcSize: number;
    size: number;
    asset: string;
    market: string;
    outcome: string;
}

interface Position {
    shares: number;
    invested: number;
    market: string;
    outcome: string;
}

async function fetchHistory(): Promise<Trade[]> {
    const cacheDir = path.join(process.cwd(), 'trader_data_cache');
    const cacheFile = path.join(cacheDir, `${TRADER_ADDRESS}_365d_backtest.json`);

    if (fs.existsSync(cacheFile)) {
        console.log(cyan('📦 Loading cached 365d activity...'));
        return JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
    }

    console.log(cyan(`📊 Fetching 365 days of activity for ${TRADER_ADDRESS}...`));
    const since = Math.floor((Date.now() - 365 * 24 * 60 * 60 * 1000) / 1000);
    let allTrades: Trade[] = [];
    let offset = 0;
    let hasMore = true;

    while (hasMore) {
        try {
            const res = await axios.get(`https://data-api.polymarket.com/activity?user=${TRADER_ADDRESS}&type=TRADE&limit=100&offset=${offset}`);
            const trades = res.data;
            if (!trades || trades.length === 0) break;

            const filtered = trades.map((t: any) => ({
                timestamp: t.timestamp,
                side: t.side,
                price: t.price,
                usdcSize: t.usdcSize,
                size: t.size,
                asset: t.asset,
                market: t.slug || t.market,
                outcome: t.outcome
            })).filter((t: any) => t.timestamp >= since);

            allTrades.push(...filtered);
            console.log(`  Fetched ${allTrades.length} trades...`);

            if (trades.length < 100 || filtered.length < trades.length) hasMore = false;
            offset += 100;
            await new Promise(r => setTimeout(r, 100)); // Rate limit safety
        } catch (e) {
            console.error('Error fetching:', e);
            break;
        }
    }

    const sorted = allTrades.sort((a, b) => a.timestamp - b.timestamp);
    if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir);
    fs.writeFileSync(cacheFile, JSON.stringify(sorted, null, 2));
    return sorted;
}

async function runSimulation(trades: Trade[]) {
    console.log(bold('\n🚀 STARTING BACKTEST (365 DAYS)'));
    console.log(cyan('Logic: BUY only if Leader > $50 | SELL always mirrored | Fixed $25 per copy\n'));

    let capital = STARTING_CAPITAL;
    let totalRealizedPnl = 0;
    let copiedCount = 0;
    let skippedCount = 0;
    const positions = new Map<string, Position>();

    for (const t of trades) {
        const key = `${t.asset}:${t.outcome}`;

        if (t.side === 'BUY') {
            // NEW LOGIC: Only BUY if leader trade is large enough
            if (t.usdcSize < MIN_LEADER_BUY_USD) {
                skippedCount++;
                continue;
            }

            let myOrderSize = FIXED_COPY_SIZE;
            if (myOrderSize > capital) myOrderSize = capital;
            if (myOrderSize < MIN_ORDER_SIZE_USD) {
                skippedCount++;
                continue;
            }

            const shares = myOrderSize / t.price;
            if (!positions.has(key)) {
                positions.set(key, { shares: 0, invested: 0, market: t.market, outcome: t.outcome });
            }
            const pos = positions.get(key)!;
            pos.shares += shares;
            pos.invested += myOrderSize;
            capital -= myOrderSize;
            copiedCount++;

        } else if (t.side === 'SELL') {
            if (positions.has(key)) {
                const pos = positions.get(key)!;
                if (pos.shares <= 0) continue;

                const exitValue = pos.shares * t.price;
                const pnl = exitValue - pos.invested;
                
                totalRealizedPnl += pnl;
                capital += exitValue;
                positions.delete(key);
                copiedCount++;
            }
        }
    }

    // Report
    console.log(bold('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
    console.log(`Trader:           ${yellow(TRADER_ADDRESS)}`);
    console.log(`History:          ${HISTORY_DAYS} Days`);
    console.log(`Total Trades:     ${trades.length}`);
    console.log(`Copied:           ${copiedCount}`);
    console.log(`Skipped (BUY):    ${skippedCount}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`Starting Capital: ${green('$' + STARTING_CAPITAL.toFixed(2))}`);
    
    const unrealizedValue = Array.from(positions.values()).reduce((s, p) => s + (p.shares * 0.5), 0);
    const finalValue = capital + unrealizedValue;
    const totalPnl = finalValue - STARTING_CAPITAL;

    console.log(`Realized P&L:     ${totalRealizedPnl >= 0 ? green('+$' + totalRealizedPnl.toFixed(2)) : red('-$' + Math.abs(totalRealizedPnl).toFixed(2))}`);
    console.log(`Current Cash:     $${capital.toFixed(2)}`);
    console.log(`Open Positions:   ${positions.size}`);
    console.log(`Est. Total ROI:   ${((totalPnl/STARTING_CAPITAL)*100).toFixed(2)}%`);
    console.log(bold('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n'));
}

async function main() {
    try {
        const trades = await fetchHistory();
        await runSimulation(trades);
    } catch (e) {
        console.error(e);
    }
}

main();
