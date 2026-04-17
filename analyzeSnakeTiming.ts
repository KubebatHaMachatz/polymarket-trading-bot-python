import * as fs from 'fs';
import * as path from 'path';

const cacheDir = path.join(process.cwd(), 'trader_data_cache');
const files = fs.readdirSync(cacheDir).filter(f => f.startsWith('0xfbb7fc19f80b26152fc5886b5eafa7d437f26f27'));
const latestFile = files.sort().reverse()[0];
const cacheFile = path.join(cacheDir, latestFile);
const data = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
const trades = data.trades;

console.log('--- Snake123 Timing & Market Analysis ---');

const timingStats = trades.map((t: any) => {
    // Extract date from market string (e.g., "April 14")
    const dateMatch = t.market.match(/(January|February|March|April|May|June|July|August|September|October|November|December)\s(\d+)/);
    if (!dateMatch) return null;

    const monthName = dateMatch[1];
    const day = parseInt(dateMatch[2]);
    const year = 2026; // Assuming 2026 based on logs
    
    const monthMap: any = { 'January': 0, 'February': 1, 'March': 2, 'April': 3, 'May': 4, 'June': 5, 'July': 6, 'August': 7, 'September': 8, 'October': 9, 'November': 10, 'December': 11 };
    
    // Target date at 00:00:00 of that day (UTC)
    const targetDate = new Date(Date.UTC(year, monthMap[monthName], day));
    const targetTs = targetDate.getTime() / 1000;
    
    // Difference in hours (Negative means trading BEFORE the day starts, Positive means trading DURING the day)
    const diffHours = (t.timestamp - targetTs) / 3600;
    
    return {
        market: t.market,
        price: t.price,
        diffHours: diffHours,
        hourOfDay: new Date(t.timestamp * 1000).getUTCHours()
    };
}).filter((x: any) => x !== null);

console.log('Total valid trades for timing:', timingStats.length);

const buckets = {
    'Days Before (< -24h)': 0,
    'Day Before (-24h to 0h)': 0,
    'Early Morning (0h to 6h)': 0,
    'Morning (6h to 12h)': 0,
    'Afternoon (12h to 18h)': 0,
    'Evening (18h to 24h)': 0,
    'After Day (> 24h)': 0
};

timingStats.forEach((s: any) => {
    if (s.diffHours < -24) buckets['Days Before (< -24h)']++;
    else if (s.diffHours < 0) buckets['Day Before (-24h to 0h)']++;
    else if (s.diffHours < 6) buckets['Early Morning (0h to 6h)']++;
    else if (s.diffHours < 12) buckets['Morning (6h to 12h)']++;
    else if (s.diffHours < 18) buckets['Afternoon (12h to 18h)']++;
    else if (s.diffHours < 24) buckets['Evening (18h to 24h)']++;
    else buckets['After Day (> 24h)']++;
});

console.log('\nTrade Timing Distribution (Relative to Target Day Start UTC):');
Object.entries(buckets).forEach(([label, count]) => {
    console.log(`  - ${label}: ${count} trades`);
});

const avgPriceByBucket: any = {};
timingStats.forEach((s: any) => {
    const bucket = s.diffHours < 0 ? 'Before Day' : 'During Day';
    if (!avgPriceByBucket[bucket]) avgPriceByBucket[bucket] = { sum: 0, count: 0 };
    avgPriceByBucket[bucket].sum += s.price;
    avgPriceByBucket[bucket].count++;
});

console.log('\nAvg Price by Timing:');
Object.entries(avgPriceByBucket).forEach(([bucket, data]: any) => {
    console.log(`  - ${bucket}: ${(data.sum / data.count).toFixed(4)}`);
});
