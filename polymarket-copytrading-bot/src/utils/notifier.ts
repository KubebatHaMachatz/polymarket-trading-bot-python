import axios from 'axios';
import { ENV } from '../config/env';
import Logger from './logger';

/**
 * Notifier utility for sending alerts to Telegram and Discord.
 */
class Notifier {
    /**
     * Sends a message to configured notification channels.
     * @param message - The message to send.
     */
    static async notify(message: string): Promise<void> {
        // Send to Telegram if configured
        if (ENV.TELEGRAM_TOKEN && ENV.TELEGRAM_CHAT_ID) {
            Logger.info(`Sending Telegram notification to chat ${ENV.TELEGRAM_CHAT_ID}...`);
            try {
                const url = `https://api.telegram.org/bot${ENV.TELEGRAM_TOKEN}/sendMessage`;
                const response = await axios.post(url, {
                    chat_id: ENV.TELEGRAM_CHAT_ID,
                    text: message,
                    parse_mode: 'HTML',
                });
                Logger.info(`Telegram notification sent successfully: ${response.status}`);
            } catch (error: any) {
                const errorData = error.response?.data;
                const description = errorData?.description || error.message;
                Logger.error(`Error sending Telegram notification: ${description}`);
            }
        }

        // Send to Discord if configured
        if (ENV.DISCORD_WEBHOOK_URL) {
            try {
                await axios.post(ENV.DISCORD_WEBHOOK_URL, {
                    content: message,
                });
            } catch (error) {
                Logger.error(`Error sending Discord notification: ${error}`);
            }
        }
    }

    /**
     * Notify about service startup.
     */
    static async notifyStartup(traders: string[], wallet: string): Promise<void> {
        const maskedWallet = `${wallet.slice(0, 6)}...${wallet.slice(-4)}`;
        const message = `🚀 <b>Polymarket Bot Started</b>\n\n` +
            `💼 <b>Wallet:</b> <code>${maskedWallet}</code>\n` +
            `📊 <b>Tracking:</b> ${traders.length} trader(s)\n` +
            `🕒 <b>Time:</b> ${new Date().toLocaleString()}`;
        await this.notify(message);
    }

    /**
     * Notify about a trade action (BUY/SELL).
     */
    static async notifyTrade(side: string, amount: number, price: number, market: string, trader: string): Promise<void> {
        const emoji = side === 'BUY' ? '🟢' : '🔴';
        const maskedTrader = `${trader.slice(0, 6)}...${trader.slice(-4)}`;
        const message = `${emoji} <b>Trade Executed: ${side}</b>\n\n` +
            `📈 <b>Market:</b> ${market}\n` +
            `💰 <b>Amount:</b> $${amount.toFixed(2)}\n` +
            `🏷️ <b>Price:</b> $${price.toFixed(4)}\n` +
            `👤 <b>Copying:</b> <code>${maskedTrader}</code>`;
        await this.notify(message);
    }

    /**
     * Notify about a filtered/skipped trade.
     */
    static async notifyFiltered(reason: string, market: string, trader: string, amount?: number): Promise<void> {
        const maskedTrader = `${trader.slice(0, 6)}...${trader.slice(-4)}`;
        let message = `⚠️ <b>Trade Ignored</b>\n\n` +
            `📈 <b>Market:</b> ${market}\n` +
            `👤 <b>Trader:</b> <code>${maskedTrader}</code>\n` +
            `🚫 <b>Reason:</b> ${reason}`;
        
        if (amount) {
            message += `\n💰 <b>Leader Amount:</b> $${amount.toFixed(2)}`;
        }
        
        await this.notify(message);
    }
}

export default Notifier;
