import axios from 'axios';
import fs from 'fs';
import path from 'path';

const address = process.argv[2];
const days = parseInt(process.argv[3] || '30');

if (!address) {
    console.log('Usage: ts-node fetchSpecificTrader.ts <address> [days]');
    process.exit(1);
}

async function fetchTrades(trader: string) {
    console.log('🚀 Fetching trades for ' + trader + '...');
    try {
        const response = await axios.get('https://data-api.polymarket.com/activity?user=' + trader + '&type=TRADE&limit=1000');
        return response.data;
    } catch (e) {
        console.error('API Error:', e);
        return [];
    }
}

async function main() {
    const trades = await fetchTrades(address);
    if (!trades || trades.length === 0) {
        console.log('No trades found.');
        return;
    }
    
    const today = new Date().toISOString().split('T')[0];
    const cacheDir = path.join(process.cwd(), 'trader_data_cache');
    if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });
    
    const cacheFile = path.join(cacheDir, address + '_' + days + 'd_' + today + '.json');
    
    const payload = {
        traderAddress: address,
        fetchedAt: new Date().toISOString(),
        totalTrades: trades.length,
        trades: trades.map((t: any) => ({
            timestamp: t.timestamp,
            asset: t.asset,
            market: t.title || t.slug || 'Unknown',
            slug: t.slug,
            eventSlug: t.eventSlug,
            side: t.side,
            price: t.price,
            usdcSize: t.usdcSize,
            outcome: t.outcome
        }))
    };
    
    fs.writeFileSync(cacheFile, JSON.stringify(payload, null, 2));
    console.log('✅ Saved ' + trades.length + ' trades to ' + cacheFile);
}

main();
