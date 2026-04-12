import * as fs from 'fs';
import * as path from 'path';

const traderAddress = '0xd5ccdf772f795547e299de57f47966e24de8dea4';
const cacheFile = path.join(process.cwd(), 'trader_data_cache/0xd5ccdf772f795547e299de57f47966e24de8dea4_30d_2026-04-10.json');

if (!fs.existsSync(cacheFile)) {
    console.error('Cache file not found at ' + cacheFile);
    process.exit(1);
}

const data = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
const trades = data.trades;

// Daily trade count
const dailyTrades: Record<string, number> = {};
const uniqueMarkets = new Set();
const activeMarketsByDay: Record<string, Set<string>> = {};

trades.forEach((t: any) => {
    const date = new Date(t.timestamp * 1000).toISOString().split('T')[0];
    dailyTrades[date] = (dailyTrades[date] || 0) + 1;
    uniqueMarkets.add(t.asset);
    
    if (!activeMarketsByDay[date]) activeMarketsByDay[date] = new Set();
    activeMarketsByDay[date].add(t.asset);
});

const dates = Object.keys(dailyTrades);
const avgTradesPerDay = trades.length / dates.length;
const avgMarketsPerDay = dates.reduce((sum, d) => sum + activeMarketsByDay[d].size, 0) / dates.length;

console.log('--- Tsybka Analysis (Last 30 Days) ---');
console.log('Total Trades:', trades.length);
console.log('Days Active:', dates.length);
console.log('Unique Markets Total:', uniqueMarkets.size);
console.log('Average Trades/Day:', avgTradesPerDay.toFixed(2));
console.log('Average Unique Markets/Day:', avgMarketsPerDay.toFixed(2));

const TEST_SIZE = 25;
const dailyCapitalUsedAt25 = avgMarketsPerDay * TEST_SIZE;
const turnoverDays = 1000 / dailyCapitalUsedAt25;

console.log(`Daily Capital Commitment (at $${TEST_SIZE}/market): $${dailyCapitalUsedAt25.toFixed(2)}`);
console.log(`Days until $1000 is fully committed (assuming no exits): ${turnoverDays.toFixed(2)}`);

// Peak concurrency check
let maxConcurrency = 0;
const sortedTrades = [...trades].sort((a,b) => a.timestamp - b.timestamp);

const windowSize = 24 * 60 * 60;
for (let i = 0; i < sortedTrades.length; i++) {
    const startTime = sortedTrades[i].timestamp;
    const windowMarkets = new Set();
    for (let j = i; j < sortedTrades.length; j++) {
        if (sortedTrades[j].timestamp - startTime > windowSize) break;
        windowMarkets.add(sortedTrades[j].asset);
    }
    maxConcurrency = Math.max(maxConcurrency, windowMarkets.size);
}

console.log('Peak Unique Markets in 24h Window:', maxConcurrency);
console.log(`Max Capital committed at peak (at $${TEST_SIZE}/market): $${maxConcurrency * TEST_SIZE}`);

// Calculate recommendation
// We want to be able to handle at least 20 concurrent markets without running out of cash
const recommendation = 1000 / 25; // This is if we want to follow 40 unique markets
const targetConcurrency = 30; // Safety buffer
const recommendedSize = Math.floor(1000 / targetConcurrency);

console.log('\n--- Recommendation ---');
console.log(`Recommended FIXED_SIZE: $${recommendedSize}`);
console.log(`With $${recommendedSize}, you can support ~${targetConcurrency} unique markets simultaneously.`);
