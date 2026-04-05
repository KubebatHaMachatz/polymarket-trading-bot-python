
import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';

/**
 * EXPORT LEADERBOARD SCRIPT
 * 
 * Fetches the top 1000 traders from each major category on Polymarket.
 */

const CATEGORIES = [
    'OVERALL',
    'POLITICS',
    'CRYPTO',
    'SPORTS',
    'CULTURE',
    'ECONOMICS',
    'TECH',
    'FINANCE',
    'WEATHER',
    'MENTIONS'
];

const LIMIT_PER_REQUEST = 50;
const MAX_TRADERS_PER_CATEGORY = 1000;
const OUTPUT_FILE = 'top_traders_by_category.json';

interface LeaderboardEntry {
    rank: string;
    proxyWallet: string;
    userName: string;
    pnl: number;
    vol: number;
    category?: string;
}

const colors = {
    reset: "\x1b[0m",
    bright: "\x1b[1m",
    cyan: "\x1b[36m",
    green: "\x1b[32m",
    yellow: "\x1b[33m",
    gray: "\x1b[90m"
};

async function fetchLeaderboard(category: string, limit: number, offset: number): Promise<LeaderboardEntry[]> {
    const url = `https://data-api.polymarket.com/v1/leaderboard?category=${category}&timePeriod=ALL&orderBy=PNL&limit=${limit}&offset=${offset}`;
    try {
        const response = await axios.get(url, {
            timeout: 10000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        });
        return response.data || [];
    } catch (error: any) {
        console.error(`\nError fetching ${category} at offset ${offset}: ${error.message}`);
        return [];
    }
}

async function main() {
    console.log(`${colors.bright}${colors.cyan}📊 POLYMARKET LEADERBOARD EXPORTER${colors.reset}`);
    console.log(`${colors.gray}Target: Top ${MAX_TRADERS_PER_CATEGORY} traders in each category${colors.reset}\n`);

    const allResults: Record<string, LeaderboardEntry[]> = {};
    let grandTotal = 0;

    for (const category of CATEGORIES) {
        console.log(`${colors.yellow}Processing category: ${category}...${colors.reset}`);
        const categoryTraders: LeaderboardEntry[] = [];
        
        for (let offset = 0; offset < MAX_TRADERS_PER_CATEGORY; offset += LIMIT_PER_REQUEST) {
            process.stdout.write(colors.gray + ".");
            const batch = await fetchLeaderboard(category, LIMIT_PER_REQUEST, offset);
            
            if (batch.length === 0) break;
            
            batch.forEach(t => {
                categoryTraders.push({
                    ...t,
                    category: category
                });
            });

            if (batch.length < LIMIT_PER_REQUEST) break;

            // Small delay to be polite to the API
            await new Promise(r => setTimeout(r, 200));
        }

        allResults[category] = categoryTraders;
        grandTotal += categoryTraders.length;
        console.log(`\n${colors.green}✓ Collected ${categoryTraders.length} traders for ${category}${colors.reset}\n`);
    }

    // Save to file
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(allResults, null, 2));
    
    // Generate HTML Report
    const htmlFile = 'leaderboard_report.html';
    let htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
        <title>Polymarket Leaderboard Report</title>
        <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; background-color: #121212; color: #e0e0e0; padding: 20px; }
            h1 { color: #bb86fc; }
            h2 { color: #03dac6; margin-top: 40px; border-bottom: 1px solid #333; padding-bottom: 10px; }
            table { width: 100%; border-collapse: collapse; margin-top: 10px; background-color: #1e1e1e; border-radius: 8px; overflow: hidden; }
            th, td { padding: 12px 15px; text-align: left; border-bottom: 1px solid #333; }
            th { background-color: #2c2c2c; color: #bb86fc; text-transform: uppercase; font-size: 0.85rem; letter-spacing: 1px; }
            tr:hover { background-color: #2a2a2c; }
            .pnl-pos { color: #4caf50; font-weight: bold; }
            .pnl-neg { color: #cf6679; font-weight: bold; }
            .stat-box { display: inline-block; background: #2c2c2c; padding: 15px 25px; border-radius: 10px; margin-right: 20px; border: 1px solid #333; }
            .stat-val { font-size: 1.5rem; font-weight: bold; color: #03dac6; display: block; }
            .stat-label { font-size: 0.8rem; color: #999; text-transform: uppercase; }
        </style>
    </head>
    <body>
        <h1>📊 Polymarket Leaderboard Export</h1>
        <div style="margin-bottom: 30px;">
            <div class="stat-box"><span class="stat-label">Total Traders</span><span class="stat-val">${grandTotal.toLocaleString()}</span></div>
            <div class="stat-box"><span class="stat-label">Categories</span><span class="stat-val">${CATEGORIES.length}</span></div>
            <div class="stat-box"><span class="stat-label">Export Date</span><span class="stat-val">${new Date().toLocaleDateString()}</span></div>
        </div>
    `;

    for (const [category, traders] of Object.entries(allResults)) {
        htmlContent += `<h2>${category} (Top ${traders.length})</h2>`;
        htmlContent += `
        <table>
            <thead>
                <tr>
                    <th>Rank</th>
                    <th>User Name</th>
                    <th>Proxy Wallet</th>
                    <th>PnL</th>
                    <th>Volume</th>
                </tr>
            </thead>
            <tbody>
        `;
        
        traders.forEach(t => {
            htmlContent += `
                <tr>
                    <td>${t.rank}</td>
                    <td style="font-weight: bold;">${t.userName || '<em>Anonymous</em>'}</td>
                    <td style="font-family: monospace; color: #aaa;">${t.proxyWallet}</td>
                    <td class="${t.pnl >= 0 ? 'pnl-pos' : 'pnl-neg'}">$${t.pnl.toLocaleString(undefined, {maximumFractionDigits: 2})}</td>
                    <td>$${t.vol.toLocaleString(undefined, {maximumFractionDigits: 0})}</td>
                </tr>
            `;
        });
        
        htmlContent += `</tbody></table>`;
    }

    htmlContent += `</body></html>`;
    fs.writeFileSync(htmlFile, htmlContent);
    
    console.log(`${colors.bright}${colors.green}🎉 DONE!${colors.reset}`);
    console.log(`Total unique categories: ${CATEGORIES.length}`);
    console.log(`Total traders exported: ${grandTotal}`);
    console.log(`JSON saved to: ${colors.bright}${OUTPUT_FILE}${colors.reset}`);
    console.log(`HTML report saved to: ${colors.bright}${htmlFile}${colors.reset}\n`);

    // Print a quick preview of counts
    console.log("Category Summary:");
    const summary = Object.entries(allResults).map(([cat, list]) => ({
        Category: cat,
        Count: list.length,
        "Top PnL": list.length > 0 ? `$${list[0].pnl.toLocaleString(undefined, {maximumFractionDigits: 0})}` : 'N/A'
    }));
    console.table(summary);
}

main().catch(console.error);
