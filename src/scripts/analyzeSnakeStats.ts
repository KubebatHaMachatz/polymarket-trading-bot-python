import * as fs from 'fs';
import * as path from 'path';

const cacheFile = path.join(process.cwd(), 'trader_data_cache/0xfbb7fc19f80b26152fc5886b5eafa7d437f26f27_30d_2026-04-11.json');
const data = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
const trades = data.trades;

console.log('--- snake123 (0xfbb7...) Last 500 Trades ---');

const buySizes = trades.filter((t: any) => t.side === 'BUY').map((t: any) => t.usdcSize);
const avgBuy = buySizes.reduce((s: number, x: number) => s + x, 0) / buySizes.length;
const minBuy = Math.min(...buySizes);
const maxBuy = Math.max(...buySizes);

console.log('Average BUY size:', avgBuy.toFixed(2));
console.log('Min BUY size:', minBuy.toFixed(2));
console.log('Max BUY size:', maxBuy.toFixed(2));

const frequency = trades.length / ((trades[0].timestamp - trades[trades.length-1].timestamp) / (24*3600));
console.log('Daily Trade Frequency:', frequency.toFixed(2));

const pennyBets = buySizes.filter((s: number) => s < 10).length;
console.log('Bets under $10:', pennyBets, `(${((pennyBets/buySizes.length)*100).toFixed(1)}%)`);
