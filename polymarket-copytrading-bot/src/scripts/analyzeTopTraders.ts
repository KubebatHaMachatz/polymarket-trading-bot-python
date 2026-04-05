
import axios from 'axios';
import * as fs from 'fs';
import { calculateOrderSize } from '../config/copyStrategy';
import { ENV } from '../config/env';

const INPUT_FILE = 'top_traders_by_category.json';
const STARTING_BALANCE = 700;
const COPY_SIZE = 5;

interface LeaderboardEntry {
    proxyWallet: string;
    userName: string;
    pnl: number;
    vol: number;
    category: string;
}

const colors = {
    reset: "\x1b[0m",
    bright: "\x1b[1m",
    cyan: "\x1b[36m",
    green: "\x1b[32m",
    yellow: "\x1b[33m",
    red: "\x1b[31m",
    gray: "\x1b[90m"
};

async function analyzeTrader(addr: string): Promise<any> {
    const url = `https://data-api.polymarket.com/activity?user=${addr}&type=TRADE&limit=50`;
    try {
        const res = await axios.get(url, { 
            timeout: 5000,
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        const trades = res.data;
        if (!trades || trades.length < 10) return null;

        const buys = trades.filter((t: any) => t.side === 'BUY');
        const sells = trades.filter((t: any) => t.side === 'SELL');
        
        if (buys.length === 0) return null;

        const avgBuyPrice = buys.reduce((a:any, b:any) => a + parseFloat(b.price), 0) / buys.length;
        const sellRatio = sells.length / trades.length;
        
        // High Velocity Profile: Low price + frequent exits
        if (avgBuyPrice < 0.75 && sellRatio > 0.15) {
            return {
                avgPrice: avgBuyPrice,
                exitFreq: (sellRatio * 100).toFixed(1) + "%",
                activityLevel: trades.length
            };
        }
    } catch { return null; }
    return null;
}

async function main() {
    if (!fs.existsSync(INPUT_FILE)) {
        console.error(`${colors.red}Error: ${INPUT_FILE} not found. Run 'npm run export-leaderboard' first.${colors.reset}`);
        return;
    }

    console.log(`${colors.bright}${colors.cyan}🔍 ANALYZING TOP TRADERS FOR SCALPING POTENTIAL${colors.reset}`);
    const data: Record<string, LeaderboardEntry[]> = JSON.parse(fs.readFileSync(INPUT_FILE, 'utf8'));
    
    const candidates: any[] = [];
    const tradersToProcess: LeaderboardEntry[] = [];

    // Take top 50 from each category to stay within reasonable rate limits
    Object.values(data).forEach(list => {
        tradersToProcess.push(...list.slice(0, 50));
    });

    console.log(`Processing ${tradersToProcess.length} candidates from 10 categories...`);

    for (let i = 0; i < tradersToProcess.length; i++) {
        const t = tradersToProcess[i];
        if (i % 10 === 0) process.stdout.write(colors.gray + ".");
        
        const profile = await analyzeTrader(t.proxyWallet);
        if (profile) {
            candidates.push({
                Trader: t.userName || t.proxyWallet.slice(0, 10) + "...",
                Category: t.category,
                "Total PnL": `$${t.pnl.toLocaleString(undefined, {maximumFractionDigits: 0})}`,
                "Avg Entry": profile.avgPrice.toFixed(2),
                "Exit Freq": profile.exitFreq,
                address: t.proxyWallet
            });
        }
        
        // Rate limiting
        if (i % 5 === 0) await new Promise(r => setTimeout(r, 100));
    }

    console.log("\n");
    candidates.sort((a, b) => parseFloat(a["Avg Entry"]) - parseFloat(b["Avg Entry"]));

    // Generate HTML Report
    const htmlFile = 'scalper_analysis_report.html';
    let htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
        <title>Scalper Analysis Report</title>
        <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; background-color: #121212; color: #e0e0e0; padding: 20px; }
            h1 { color: #03dac6; }
            p { color: #999; margin-bottom: 30px; }
            table { width: 100%; border-collapse: collapse; background-color: #1e1e1e; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 15px rgba(0,0,0,0.5); }
            th, td { padding: 15px; text-align: left; border-bottom: 1px solid #333; }
            th { background-color: #2c2c2c; color: #03dac6; text-transform: uppercase; font-size: 0.8rem; letter-spacing: 1px; }
            tr:hover { background-color: #2a2a2c; }
            .high-velocity { color: #bb86fc; font-weight: bold; }
            .low-price { color: #03dac6; font-weight: bold; }
            .address { font-family: monospace; color: #777; font-size: 0.9rem; }
            .copy-btn { background: #333; color: #eee; border: none; padding: 5px 10px; border-radius: 4px; cursor: pointer; font-size: 0.7rem; }
            .copy-btn:hover { background: #444; }
        </style>
    </head>
    <body>
        <h1>🎯 Top Potential Scalpers Discovery</h1>
        <p>Analyzed top 50 traders from each of the 10 major categories. Filtered for high capital velocity (Exit Freq > 15%) and low entry prices (< $0.75).</p>
        
        <table>
            <thead>
                <tr>
                    <th>Trader</th>
                    <th>Category</th>
                    <th>Total PnL</th>
                    <th>Avg Entry Price</th>
                    <th>Exit Frequency</th>
                    <th>Wallet Address</th>
                </tr>
            </thead>
            <tbody>
    `;

    candidates.forEach(c => {
        htmlContent += `
            <tr>
                <td style="font-weight: bold;">${c.Trader}</td>
                <td style="color: #aaa;">${c.Category}</td>
                <td style="color: #4caf50;">${c["Total PnL"]}</td>
                <td class="low-price">$${c["Avg Entry"]}</td>
                <td class="high-velocity">${c["Exit Freq"]}</td>
                <td>
                    <span class="address">${c.address}</span>
                </td>
            </tr>
        `;
    });

    htmlContent += `
            </tbody>
        </table>
        <div style="margin-top: 40px; padding: 20px; background: #1e1e1e; border-left: 4px solid #bb86fc;">
            <h3 style="color: #bb86fc; margin-top: 0;">💡 Strategy Recommendation</h3>
            <p style="margin-bottom: 0; color: #e0e0e0;">For a <strong>$700 budget</strong>, focus on traders with <strong>Avg Entry &lt; $0.30</strong> and <strong>Exit Freq &gt; 50%</strong>. This ensures your capital is recycled quickly and provides the highest possible leverage per trade.</p>
        </div>
    </body>
    </html>
    `;
    fs.writeFileSync(htmlFile, htmlContent);

    console.log(`${colors.bright}TOP DISCOVERED SCALPERS (Sorted by Entry Price):${colors.reset}`);
    console.table(candidates.slice(0, 40));
    
    console.log(`\n${colors.green}✓ HTML report saved to: ${colors.bright}${htmlFile}${colors.reset}`);
}

main().catch(console.error);
