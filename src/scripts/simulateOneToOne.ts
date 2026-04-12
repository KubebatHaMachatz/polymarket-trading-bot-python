import * as fs from 'fs';
import * as path from 'path';

const TRADER = '0xfbb7fc19f80b26152fc5886b5eafa7d437f26f27';
const cacheFile = path.join(process.cwd(), 'trader_data_cache/0xfbb7fc19f80b26152fc5886b5eafa7d437f26f27_30d_2026-04-11.json');
const data = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
const trades = data.trades.sort((a: any, b: any) => a.timestamp - b.timestamp);

let capital = 1000;
const positions = new Map<string, {shares: number, cost: number}>();
let totalPnL = 0;
let tradesCount = 0;

console.log(`🚀 1-to-1 Simulation for ${TRADER}`);
console.log(`Starting Capital: $${capital}`);

for (const t of trades) {
    const key = t.asset;
    if (t.side === 'BUY') {
        if (capital >= t.usdcSize) {
            const shares = t.usdcSize / t.price;
            const pos = positions.get(key) || {shares: 0, cost: 0};
            pos.shares += shares;
            pos.cost += t.usdcSize;
            positions.set(key, pos);
            capital -= t.usdcSize;
            tradesCount++;
        }
    } else {
        const pos = positions.get(key);
        if (pos && pos.shares > 0) {
            // Snake often sells partially. We follow his USDC size or our remaining shares
            const traderSellShares = t.usdcSize / t.price;
            // Since we don't know his total shares, we'll just sell the same USDC amount if we have the shares
            const sharesToSell = Math.min(pos.shares, traderSellShares);
            const proceeds = sharesToSell * t.price;
            pos.shares -= sharesToSell;
            capital += proceeds;
            tradesCount++;
            if (pos.shares <= 0) positions.delete(key);
        }
    }
}

let unrealized = 0;
positions.forEach((pos, key) => {
    // Estimate current value at last known price (from trades)
    const lastTrade = trades.reverse().find((t: any) => t.asset === key);
    if (lastTrade) {
        unrealized += pos.shares * lastTrade.price;
    }
});

console.log('--- Results ---');
console.log('Total Trades Processed:', tradesCount);
console.log('Final Cash:', capital.toFixed(2));
console.log('Unrealized Value:', unrealized.toFixed(2));
console.log('Total Portfolio Value:', (capital + unrealized).toFixed(2));
console.log('ROI:', (((capital + unrealized - 1000) / 1000) * 100).toFixed(2) + '%');
