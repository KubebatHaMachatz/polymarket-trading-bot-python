import * as fs from 'fs';
import * as path from 'path';

const cacheFile = path.join(process.cwd(), 'trader_data_cache/0xd5ccdf772f795547e299de57f47966e24de8dea4_30d_2026-04-10.json');
const data = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
const trades = data.trades;

const marketStats: Record<string, {buys: number, sells: number}> = {};

trades.forEach((t: any) => {
    if (!marketStats[t.asset]) marketStats[t.asset] = {buys: 0, sells: 0};
    if (t.side === 'BUY') marketStats[t.asset].buys++;
    else marketStats[t.asset].sells++;
});

const markets = Object.keys(marketStats);
console.log('Total unique markets:', markets.length);

const avgBuys = markets.reduce((sum, m) => sum + marketStats[m].buys, 0) / markets.length;
const maxBuys = Math.max(...markets.map(m => marketStats[m].buys));

console.log('Average BUYS per market:', avgBuys.toFixed(2));
console.log('Max BUYS in a single market:', maxBuys);

// Sort markets by most buys
const sorted = markets.sort((a,b) => marketStats[b].buys - marketStats[a].buys);
console.log('\nTop 5 Markets by Buy Frequency:');
sorted.slice(0, 5).forEach(m => {
    console.log(`${m}: ${marketStats[m].buys} buys, ${marketStats[m].sells} sells`);
});
