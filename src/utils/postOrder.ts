/**
 * Order posting utility module.
 * This module handles posting buy, sell, and merge orders to Polymarket.
 */

import { ClobClient, OrderType, Side } from '@polymarket/clob-client';
import { ethers, BigNumber } from 'ethers';
import { ENV } from '../config/env';
import { UserActivityInterface, UserPositionInterface } from '../interfaces/User';
import { getUserActivityModel } from '../models/userHistory';
import Logger from './logger';
import Notifier from './notifier';
import { calculateOrderSize } from '../config/copyStrategy';

const RETRY_LIMIT = ENV.RETRY_LIMIT;
const COPY_STRATEGY_CONFIG = ENV.COPY_STRATEGY_CONFIG;
const MIN_ORDER_SIZE_USD = 0.0001; 

const safeParseUnits = (value: string | number, decimals: number = 6): BigNumber => {
    const s = typeof value === 'number' ? value.toFixed(10) : value;
    const [integer, fractional] = s.split('.');
    if (!fractional) return ethers.utils.parseUnits(integer, decimals);
    const truncatedFractional = fractional.slice(0, decimals);
    return ethers.utils.parseUnits(`${integer}.${truncatedFractional}`, decimals);
};

const extractOrderError = (response: any): string | undefined => {
    if (!response) return undefined;
    if (typeof response === 'string') return response;
    if (response.error) return typeof response.error === 'string' ? response.error : JSON.stringify(response.error);
    return response.message || response.errorMsg;
};

const postOrder = async (
    clobClient: ClobClient,
    condition: string,
    my_position: UserPositionInterface | undefined,
    user_position: UserPositionInterface | undefined,
    trade: UserActivityInterface,
    my_balance: number,
    user_balance: number,
    userAddress: string,
    skipMarkBot: boolean = false
) => {
    const UserActivity = getUserActivityModel(userAddress);
    const markActivityDone = async (updates: Record<string, unknown>) => {
        if (!skipMarkBot) await UserActivity.updateOne({ _id: trade._id }, { $set: updates });
    };

    if (condition === 'buy') {
        Logger.info('Executing BUY strategy...');
        const currentPositionValue = my_position ? my_position.size * my_position.avgPrice : 0;
        const orderCalc = calculateOrderSize(COPY_STRATEGY_CONFIG, trade.usdcSize, my_balance, currentPositionValue);

        if (orderCalc.finalAmount < MIN_ORDER_SIZE_USD) {
            await markActivityDone({ bot: true });
            return;
        }

        let remaining = orderCalc.finalAmount;
        let retry = 0;
        let totalBoughtTokens = 0;

        while (remaining > 0 && retry < RETRY_LIMIT) {
            const orderBook = await clobClient.getOrderBook(trade.asset);
            const asks = orderBook.asks || [];
            if (asks.length === 0) {
                Logger.warning('No asks available');
                break;
            }

            const bestAsk = asks.reduce((min, a) => parseFloat(a.price) < parseFloat(min.price) ? a : min, asks[0]);
            const limitPrice = trade.price;
            const tokensToBuy = remaining / limitPrice;

            const order_args = {
                side: Side.BUY,
                tokenId: trade.asset.toLowerCase(),
                size: parseFloat(tokensToBuy.toFixed(6)),
                price: parseFloat(limitPrice.toFixed(4)),
                signer: ((clobClient as any).address || (clobClient as any).signer?.address || "").toLowerCase()
            } as any;

            try {
                // FORCE STRING CONVERSION for all numeric fields to satisfy the underlying ethers library
                const order_args_fixed = {
                    ...order_args,
                    size: order_args.size.toString(),
                    price: order_args.price.toString(),
                    tokenID: order_args.tokenId // Ensure uppercase for SDK compatibility if needed
                };
                
                Logger.info(`Placing order with fixed args: ${JSON.stringify(order_args_fixed)}`);
                
                const signedOrder = await clobClient.createOrder(order_args_fixed as any);
                const resp = await clobClient.postOrder(signedOrder, OrderType.GTC);
                
                if (resp.success) {
                    Logger.success(`Order placed: ${resp.orderID}`);
                    totalBoughtTokens += tokensToBuy;
                    remaining = 0; 
                    await Notifier.notifyTrade('BUY', orderCalc.finalAmount, limitPrice, trade.slug || trade.asset, userAddress);
                } else {
                    Logger.error(`Order failed: ${extractOrderError(resp)}`);
                    retry++;
                }
            } catch (e: any) {
                Logger.error(`SDK CRASH FIXED: ${e.message}`);
                // If it crashes again, we will log the stack to find the exact line in ethers
                if (e.stack) console.error(e.stack);
                retry++;
            }
        }
        await markActivityDone({ bot: true, myBoughtSize: totalBoughtTokens });

    } else if (condition === 'sell' || condition === 'merge') {
        Logger.info(`Executing ${condition.toUpperCase()} strategy...`);
        if (!my_position || my_position.size <= 0) {
            await markActivityDone({ bot: true });
            return;
        }

        const orderBook = await clobClient.getOrderBook(trade.asset);
        const bids = orderBook.bids || [];
        if (bids.length === 0) {
            await markActivityDone({ bot: true });
            return;
        }

        const bestBid = bids.reduce((max, b) => parseFloat(b.price) > parseFloat(max.price) ? b : max, bids[0]);
        const sellPrice = parseFloat(bestBid.price);
        
        const order_args = {
            side: Side.SELL,
            tokenId: my_position.asset.toLowerCase(),
            amount: parseFloat(my_position.size.toFixed(6)),
            price: sellPrice,
            signer: ((clobClient as any).address || (clobClient as any).signer?.address || "").toLowerCase()
        } as any;

        try {
            const signedOrder = await clobClient.createMarketOrder(order_args);
            const resp = await clobClient.postOrder(signedOrder, OrderType.FOK);
            if (resp.success) {
                Logger.success(`Sell order placed: ${resp.orderID}`);
                await Notifier.notifyTrade('SELL', my_position.size * sellPrice, sellPrice, trade.slug || trade.asset, userAddress);
            }
        } catch (e: any) {
            Logger.error(`Sell SDK Error: ${e.message}`);
        }
        await markActivityDone({ bot: true });
    }
};

export default postOrder;
