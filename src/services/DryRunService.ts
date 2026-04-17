import { DryRunPosition } from '../models/dryRunPosition';
import { DryRunWallet } from '../models/dryRunWallet';
import { UserActivityInterface } from '../interfaces/User';
import { ENV } from '../config/env';
import { calculateOrderSize } from '../config/copyStrategy';
import Logger from '../utils/logger';
import Notifier from '../utils/notifier';

export class DryRunService {
    /**
     * Get or initialize virtual wallet
     */
    static async getWallet(followerWallet: string): Promise<any> {
        let wallet = await DryRunWallet.findOne({ followerWallet });
        if (!wallet) {
            wallet = await DryRunWallet.create({ followerWallet, balance: 1000.0 });
            Logger.info(`[DRY RUN] Initialized virtual wallet for ${followerWallet} with $1000.00`);
        }
        return wallet;
    }

    static async simulateTrade(
        trade: UserActivityInterface,
        traderAddress: string,
        followerWallet: string
    ): Promise<void> {
        const wallet = await this.getWallet(followerWallet);
        
        if (trade.side === 'BUY') {
            await this.simulateBuy(trade, traderAddress, followerWallet, wallet);
        } else {
            await this.simulateSell(trade, traderAddress, followerWallet, wallet);
        }
    }

    private static async simulateBuy(
        trade: UserActivityInterface,
        traderAddress: string,
        followerWallet: string,
        wallet: any
    ): Promise<void> {
        const orderCalc = calculateOrderSize(
            ENV.COPY_STRATEGY_CONFIG,
            trade.usdcSize || 0,
            wallet.balance,
            0 
        );

        if (orderCalc.finalAmount <= 0) {
            Logger.info(`[DRY RUN] Skipping BUY: ${orderCalc.reasoning}`);
            return;
        }

        const tokensToBuy = orderCalc.finalAmount / trade.price;
        
        try {
            let position = await DryRunPosition.findOne({
                followerWallet,
                traderAddress,
                conditionId: trade.conditionId
            });

            if (position) {
                const totalShares = position.size + tokensToBuy;
                const totalCost = position.totalCost + orderCalc.finalAmount;
                position.avgPrice = totalCost / totalShares;
                position.size = totalShares;
                position.totalCost = totalCost;
                position.lastPrice = trade.price;
                position.updatedAt = new Date();
                await position.save();
            } else {
                await DryRunPosition.create({
                    followerWallet,
                    traderAddress,
                    asset: trade.asset,
                    conditionId: trade.conditionId,
                    size: tokensToBuy,
                    avgPrice: trade.price,
                    totalCost: orderCalc.finalAmount,
                    slug: trade.slug,
                    title: trade.title,
                    outcome: trade.outcome,
                    lastPrice: trade.price
                });
            }

            // Update Virtual Wallet
            wallet.balance -= orderCalc.finalAmount;
            wallet.totalInvested += orderCalc.finalAmount;
            wallet.updatedAt = new Date();
            await wallet.save();

            Logger.success(`[DRY RUN] Simulated BUY: ${tokensToBuy.toFixed(2)} shares. Virtual Balance: $${wallet.balance.toFixed(2)}`);
            await Notifier.notifyTrade('BUY', orderCalc.finalAmount, trade.price, trade.slug || trade.asset, traderAddress);
        } catch (error: any) {
            Logger.error(`[DRY RUN] Failed to record simulated BUY: ${error.message}`);
        }
    }

    private static async simulateSell(
        trade: UserActivityInterface,
        traderAddress: string,
        followerWallet: string,
        wallet: any
    ): Promise<void> {
        try {
            const position = await DryRunPosition.findOne({
                followerWallet,
                traderAddress,
                conditionId: trade.conditionId
            });

            if (!position || position.size <= 0) {
                Logger.info(`[DRY RUN] Skipping SELL: No existing position for ${trade.slug || trade.asset}`);
                return;
            }

            const exitValue = position.size * trade.price;
            const pnl = exitValue - position.totalCost;

            // Update Virtual Wallet
            wallet.balance += exitValue;
            wallet.totalRealizedPnl += pnl;
            wallet.updatedAt = new Date();
            await wallet.save();

            await DryRunPosition.deleteOne({ _id: position._id });

            Logger.success(`[DRY RUN] Simulated SELL: Exited ${trade.slug || trade.asset}. PnL: $${pnl.toFixed(2)}. Virtual Balance: $${wallet.balance.toFixed(2)}`);
            await Notifier.notifyTrade('SELL', exitValue, trade.price, trade.slug || trade.asset, traderAddress);
        } catch (error: any) {
            Logger.error(`[DRY RUN] Failed to record simulated SELL: ${error.message}`);
        }
    }
}
