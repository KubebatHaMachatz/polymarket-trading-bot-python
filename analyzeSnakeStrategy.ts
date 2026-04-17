import * as fs from 'fs';
import * as path from 'path';

const cacheDir = path.join(process.cwd(), 'trader_data_cache');
const files = fs.readdirSync(cacheDir).filter(f => f.startsWith('0xfbb7fc19f80b26152fc5886b5eafa7d437f26f27'));
const latestFile = files.sort().reverse()[0];
const cacheFile = path.join(cacheDir, latestFile);
console.log('Using file:', latestFile);
const data = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
const trades = data.trades;

console.log('--- Snake123 Strategy Deep Dive ---');
console.log('Total Trades Analyzed:', trades.length);

// 1. Market Category Analysis
const marketCounts: {[key: string]: number} = {};
const marketKeywords: {[key: string]: string[]} = {
    'Weather': ['temperature', 'degrees', 'weather', 'rain', 'snow', 'high', 'low', 'celsius', 'fahrenheit'],
    'Crypto': ['bitcoin', 'btc', 'eth', 'solana', 'xrp', 'crypto', 'above', 'below', 'price', 'ath'],
    'Politics': ['election', 'trump', 'biden', 'president', 'nominee', 'senate', 'house'],
    'Sports': ['win', 'points', 'match', 'game', 'team', 'nba', 'nfl', 'soccer'],
};

const categorizedMarkets: {[key: string]: number} = {};
trades.forEach((t: any) => {
    const market = (t.market || 'Unknown').toLowerCase();
    let category = 'Other';
    for (const [cat, keywords] of Object.entries(marketKeywords)) {
        if (keywords.some(kw => market.includes(kw))) {
            category = cat;
            break;
        }
    }
    categorizedMarkets[category] = (categorizedMarkets[category] || 0) + 1;
});

console.log('\nMarket Category Distribution:');
Object.entries(categorizedMarkets).sort((a, b) => b[1] - a[1]).forEach(([cat, count]) => {
    console.log(`  - ${cat}: ${count} trades (${((count/trades.length)*100).toFixed(1)}%)`);
});

// 2. Side and Price Analysis
const buyTrades = trades.filter((t: any) => t.side === 'BUY');
const avgBuyPrice = buyTrades.reduce((sum: number, t: any) => sum + t.price, 0) / buyTrades.length;

console.log('\nPrice & Side Analysis:');
console.log('  - BUYS:', buyTrades.length);
console.log('  - SELLS:', trades.length - buyTrades.length);
console.log('  - Avg Buy Price:', avgBuyPrice.toFixed(4));

// 3. Size Analysis
const avgSize = trades.reduce((sum: number, t: any) => sum + (t.usdcSize || 0), 0) / trades.length;
console.log('  - Avg USDC Size per Trade: $', avgSize.toFixed(2));

// 4. "Lottery Ticket" Detection (Low Price Buys)
const lotteryTickets = buyTrades.filter((t: any) => t.price < 0.10);
console.log(`  - "Lottery" Buys (<$0.10): ${lotteryTickets.length} (${((lotteryTickets.length/buyTrades.length)*100).toFixed(1)}% of buys)`);

// 5. Holding Time (Approximation based on same market trade spacing)
// We group by market and asset to see entry/exit spacing
const marketActivity: {[key: string]: any[]} = {};
trades.forEach((t: any) => {
    const key = `${t.market}-${t.outcome}`;
    if (!marketActivity[key]) marketActivity[key] = [];
    marketActivity[key].push(t);
});

let totalHoldTime = 0;
let holdCount = 0;

Object.values(marketActivity).forEach(acts => {
    acts.sort((a, b) => a.timestamp - b.timestamp);
    for (let i = 0; i < acts.length - 1; i++) {
        if (acts[i].side === 'BUY' && acts[i+1].side === 'SELL') {
            totalHoldTime += (acts[i+1].timestamp - acts[i].timestamp);
            holdCount++;
        }
    }
});

if (holdCount > 0) {
    const avgHoldMinutes = (totalHoldTime / holdCount) / 60;
    console.log(`\nEstimated Avg Hold Time (Entry to Exit): ${avgHoldMinutes.toFixed(2)} minutes`);
} else {
    console.log('\nEstimated Avg Hold Time: Insufficient Buy/Sell pairs in sample');
}

// 6. Sample of Most Frequent Markets
console.log('\nTop 5 Most Traded Markets in Sample:');
Object.entries(marketActivity)
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 5)
    .forEach(([market, acts]) => {
        console.log(`  - ${market}: ${acts.length} trades`);
    });
