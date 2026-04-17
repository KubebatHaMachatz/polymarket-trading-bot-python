import express from 'express';
import mongoose from 'mongoose';
import { DryRunPosition } from '../models/dryRunPosition';
import { DryRunWallet } from '../models/dryRunWallet';
import { getUserActivityModel } from '../models/userHistory';
import { ENV } from '../config/env';
import connectDB from '../config/db';

const app = express();
const PORT = 4000;

app.get('/', async (req, res) => {
    try {
        const wallets = await DryRunWallet.find();
        const positions = await DryRunPosition.find();
        
        // We'll show the last 50 simulated activities
        // Note: In our current logic, we mark simulated trades with bot:true in the main activity log
        const traderAddress = ENV.USER_ADDRESSES[0];
        const Activity = getUserActivityModel(traderAddress);
        const history = await Activity.find({ bot: true }).sort({ timestamp: -1 }).limit(50);

        const html = \`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Dry Run Dashboard</title>
            <style>
                body { font-family: sans-serif; background: #f4f7f6; margin: 20px; }
                .card { background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); margin-bottom: 20px; }
                table { width: 100%; border-collapse: collapse; margin-top: 10px; }
                th, td { text-align: left; padding: 12px; border-bottom: 1px solid #eee; }
                th { background: #fafafa; }
                .pos { color: green; }
                .neg { color: red; }
                .header { display: flex; justify-content: space-between; align-items: center; }
            </style>
        </head>
        <body>
            <div class="header">
                <h1>📈 Dry Run Dashboard</h1>
                <div>Status: <span style="color: green">● Live Simulation</span></div>
            </div>

            <div class="card">
                <h2>💰 Virtual Wallets</h2>
                <table>
                    <thead>
                        <tr><th>Follower</th><th>Cash Balance</th><th>Total Invested</th><th>Realized P&L</th></tr>
                    </thead>
                    <tbody>
                        \${wallets.map(w => \`
                            <tr>
                                <td>\${w.followerWallet}</td>
                                <td><strong>$\${w.balance.toFixed(2)}</strong></td>
                                <td>$\${w.totalInvested.toFixed(2)}</td>
                                <td class="\${w.totalRealizedPnl >= 0 ? 'pos' : 'neg'}">
                                    \${w.totalRealizedPnl >= 0 ? '+' : ''}\$\${w.totalRealizedPnl.toFixed(2)}
                                </td>
                            </tr>
                        \`).join('')}
                    </tbody>
                </table>
            </div>

            <div class="card">
                <h2>📂 Open Paper Positions (\${positions.length})</h2>
                <table>
                    <thead>
                        <tr><th>Market</th><th>Shares</th><th>Avg Price</th><th>Total Cost</th></tr>
                    </thead>
                    <tbody>
                        \${positions.map(p => \`
                            <tr>
                                <td>\${p.slug || p.conditionId}</td>
                                <td>\${p.size.toFixed(2)}</td>
                                <td>$\${p.avgPrice.toFixed(4)}</td>
                                <td>$\${p.totalCost.toFixed(2)}</td>
                            </tr>
                        \`).join('')}
                    </tbody>
                </table>
            </div>

            <div class="card">
                <h2>📜 Recent Activity</h2>
                <table>
                    <thead>
                        <tr><th>Time</th><th>Side</th><th>Market</th><th>Price</th><th>Size (USDC)</th></tr>
                    </thead>
                    <tbody>
                        \${history.map(h => \`
                            <tr>
                                <td>\${new Date(h.timestamp * 1000).toLocaleString()}</td>
                                <td style="font-weight: bold; color: \${h.side === 'BUY' ? 'blue' : 'orange'}">\${h.side}</td>
                                <td>\${h.slug || h.title}</td>
                                <td>$\${h.price?.toFixed(4)}</td>
                                <td>$\${h.usdcSize?.toFixed(2)}</td>
                            </tr>
                        \`).join('')}
                    </tbody>
                </table>
            </div>
        </body>
        </html>
        \`;
        res.send(html);
    } catch (err) {
        res.status(500).send(err.message);
    }
});

async function start() {
    await connectDB();
    app.listen(PORT, () => {
        console.log(\`✅ Dry Run Dashboard available at http://localhost:\${PORT}\`);
    });
}

start();
