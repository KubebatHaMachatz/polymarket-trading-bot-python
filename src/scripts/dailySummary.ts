import mongoose from 'mongoose';
import * as dotenv from 'dotenv';
import path from 'path';
import Notifier from '../utils/notifier';
import { getCopyExecutionModel } from '../models/copyExecution';
import { ENV } from '../config/env';

async function generateSummary() {
    console.log("Generating 24h Summary...");
    try {
        await mongoose.connect(process.env.MONGO_URI!);
        const CopyExecution = getCopyExecutionModel();
        
        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        
        const trades = await CopyExecution.find({
            timestamp: { $gte: oneDayAgo },
            status: 'success'
        });

        const totalTrades = trades.length;
        const totalInvested = trades.reduce((sum, t) => sum + (t.usdcSize || 0), 0);
        
        // This is a simplified summary since we don't always know resolution immediately
        const message = `📊 <b>Daily Snake123 Summary</b>\n\n` +
            `⏱ <b>Last 24 Hours:</b>\n` +
            `✅ <b>Trades Copied:</b> ${totalTrades}\n` +
            `💰 <b>Capital Deployed:</b> $${totalInvested.toFixed(2)}\n\n` +
            `🎰 <i>Most trades are buy-and-hold lottery tickets. Actual profit appears on market resolution.</i>`;

        await Notifier.notify(message);
        console.log("Summary sent to Telegram");
        await mongoose.disconnect();
    } catch (e) {
        console.error("Summary failed", e);
    }
}

generateSummary();
