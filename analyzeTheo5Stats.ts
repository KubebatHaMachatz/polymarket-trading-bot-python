import * as fs from 'fs';
import * as path from 'path';

const cacheFile = path.join(process.cwd(), 'trader_data_cache/0x8a4c97659ba8035a7d529de07a2dafdd361c9091_30d_2026-04-14.json');
const data = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
const trades = data.trades;

console.log('--- Theo5 (0x8a4c788f...) Last 500 Trades Analysis ---');

if (trades.length < 2) {
    console.log('Not enough trades to calculate frequency.');
    process.exit(0);
}

// Filter for BUY trades to see entry frequency
const buyTrades = trades.filter((t: any) => t.side === 'BUY');
console.log('Total Trades (BUY+SELL):', trades.length);
console.log('Total BUY Trades:', buyTrades.length);

// 1. Daily Trade Frequency
const firstTimestamp = trades[0].timestamp;
const lastTimestamp = trades[trades.length - 1].timestamp;
const timeSpanDays = (firstTimestamp - lastTimestamp) / (24 * 3600);

const totalFrequency = trades.length / timeSpanDays;
const buyFrequency = buyTrades.length / timeSpanDays;

console.log('Time span analyzed:', timeSpanDays.toFixed(2), 'days');
console.log('Daily TOTAL frequency (trades per day):', totalFrequency.toFixed(2));
console.log('Daily BUY frequency (new entries per day):', buyFrequency.toFixed(2));

// 2. Average time between trades (minutes)
const timeBetweenTotal = (timeSpanDays * 24 * 60) / trades.length;
const timeBetweenBuy = (timeSpanDays * 24 * 60) / buyTrades.length;

console.log('Average time between ANY trade:', timeBetweenTotal.toFixed(2), 'minutes');
console.log('Average time between BUY trades:', timeBetweenBuy.toFixed(2), 'minutes');

// 3. Distribution by hour of day (UTC)
const hourlyDistribution: {[key: number]: number} = {};
trades.forEach((t: any) => {
    const hour = new Date(t.timestamp * 1000).getUTCHours();
    hourlyDistribution[hour] = (hourlyDistribution[hour] || 0) + 1;
});

console.log('\nHourly Distribution (UTC):');
for (let i = 0; i < 24; i++) {
    const count = hourlyDistribution[i] || 0;
    if (count > 0) {
        console.log(`  ${i.toString().padStart(2, '0')}:00 - ${count} trades`);
    }
}
