import { ClobClient } from '@polymarket/clob-client';
import { UserActivityInterface } from '../../interfaces/User';
import * as ExecutionEngine from '../../services/ExecutionEngine';
import * as OrderValidator from '../../services/OrderValidator';
import { addToAggregationBuffer, getReadyAggregatedTrades } from '../../services/TradeAggregator';
import { calculateOrderSize, CopyStrategy } from '../../config/copyStrategy';
import { ErrorHandler } from '../../utils/errorHandler';
import postOrder from '../../utils/postOrder';
import { getUserActivityModel } from '../../models/userHistory';

// Mock all external dependencies EXCEPT ExecutionEngine and OrderValidator
jest.mock('@polymarket/clob-client');
jest.mock('../../utils/postOrder');
jest.mock('../../utils/logger');
jest.mock('../../models/userHistory');
jest.mock('../../utils/errorHandler');

// Mock environment
jest.mock('../../config/env', () => ({
    ENV: {
        MIN_LEADER_TRADE_USD: 1,
        MIN_MARKET_24H_VOL: 1,
        MAX_PRICE_DEVIATION: 0.1,
        MAX_COPY_PRICE: 0.99,
        RETRY_LIMIT: 3,
        TRADE_AGGREGATION_WINDOW_SECONDS: 1,
        COPY_STRATEGY_CONFIG: {
            strategy: 'PERCENTAGE',
            copySize: 10,
        },
    },
}));

// Mock chalk
jest.mock('chalk', () => ({
    red: (s: string) => s,
    green: (s: string) => s,
    yellow: (s: string) => s,
    blue: (s: string) => s,
    cyan: (s: string) => s,
    magenta: (s: string) => s,
    gray: (s: string) => s,
    dim: (s: string) => s,
    bold: (s: string) => s,
    underline: (s: string) => s,
}));

describe('Trade Flow Integration Tests', () => {
    let mockClobClient: jest.Mocked<ClobClient>;
    let validateTradeSpy: jest.SpyInstance;

    beforeEach(() => {
        jest.clearAllMocks();
        mockClobClient = new ClobClient("" as any, 137 as any) as jest.Mocked<ClobClient>;
        validateTradeSpy = jest.spyOn(OrderValidator, 'validateTrade').mockResolvedValue({
            isValid: true,
            myBalance: 1000,
            userBalance: 5000,
        } as any);
    });

    afterEach(() => {
        validateTradeSpy.mockRestore();
    });

    describe('Single Trade Execution Flow', () => {
        it('should execute a valid trade successfully', async () => {
            (ErrorHandler.withErrorHandling as jest.Mock).mockImplementation((fn: () => any) => fn());
            const mockTrade: UserActivityInterface = {
                _id: 'trade1' as any,
                proxyWallet: '0xproxy',
                timestamp: Date.now(),
                conditionId: 'cond1',
                type: 'trade',
                size: 100,
                usdcSize: 100,
                transactionHash: '0xhash',
                price: 1.0,
                asset: 'asset1',
                side: 'BUY',
                outcomeIndex: 0,
                title: 'Test Market',
                slug: 'test-market',
                icon: 'icon',
                eventSlug: 'event',
                outcome: 'outcome',
                name: 'Test User',
                pseudonym: 'testuser',
                bio: 'bio',
                profileImage: 'image',
                profileImageOptimized: 'optimized',
                bot: false,
                botExcutedTime: 0,
            };

            // Mock database operations
            const mockModel = {
                updateOne: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue({}) }),
                findById: jest.fn().mockReturnValue({ select: jest.fn().mockReturnValue({ lean: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue({}) }) }) }),
            };
            (getUserActivityModel as jest.Mock).mockReturnValue(mockModel);

            await ExecutionEngine.executeTrade(mockClobClient, mockTrade, '0xuser');

            expect(validateTradeSpy).toHaveBeenCalled();
            expect(postOrder).toHaveBeenCalled();
        });

        it('should handle validation failure', async () => {
            validateTradeSpy.mockResolvedValue({
                isValid: false,
                reason: 'Insufficient balance',
            });

            const mockTrade: UserActivityInterface = {
                _id: 'trade1' as any,
                proxyWallet: '0xproxy',
                timestamp: Date.now(),
                conditionId: 'cond1',
                type: 'trade',
                size: 100,
                usdcSize: 100,
                transactionHash: '0xhash',
                price: 1.0,
                asset: 'asset1',
                side: 'BUY',
                outcomeIndex: 0,
                title: 'Test Market',
                slug: 'test-market',
                icon: 'icon',
                eventSlug: 'event',
                outcome: 'outcome',
                name: 'Test User',
                pseudonym: 'testuser',
                bio: 'bio',
                profileImage: 'image',
                profileImageOptimized: 'optimized',
                bot: false,
                botExcutedTime: 0,
            };

            const mockModel = {
                updateOne: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue({}) }),
            };
            (getUserActivityModel as jest.Mock).mockReturnValue(mockModel);

            (ErrorHandler.withErrorHandling as jest.Mock).mockImplementation((fn: () => any) => fn());

            await ExecutionEngine.executeTrade(mockClobClient, mockTrade, '0xuser');

            expect(validateTradeSpy).toHaveBeenCalled();
            expect(mockModel.updateOne).toHaveBeenCalled();
        });
    });

    describe('Trade Aggregation Flow', () => {
        it('should aggregate and execute multiple trades', async () => {
            const trades = [
                {
                    userAddress: '0xuser',
                    conditionId: 'cond1',
                    asset: 'asset1',
                    side: 'BUY',
                    usdcSize: 50,
                    price: 1.0,
                    _id: 'trade1' as any,
                },
                {
                    userAddress: '0xuser',
                    conditionId: 'cond1',
                    asset: 'asset1',
                    side: 'BUY',
                    usdcSize: 75,
                    price: 1.1,
                    _id: 'trade2' as any,
                },
            ];

            // Add trades to aggregation
            trades.forEach(trade => addToAggregationBuffer(trade as any));

            // Wait for aggregation window to pass
            await new Promise(resolve => setTimeout(resolve, 1100)); // Buffer is flushed every 1s in some configs, or 60s in ENV. 
            // In our mocked ENV it is 60s. Let's use fake timers properly or shorten it.

            // Mock validation and execution
            validateTradeSpy.mockResolvedValue({
                isValid: true,
                myBalance: 1000,
                userBalance: 5000,
            });

            (postOrder as jest.Mock).mockResolvedValue(undefined);

            const mockModel = {
                updateOne: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue({}) }),
            };
            (getUserActivityModel as jest.Mock).mockReturnValue(mockModel);

            (ErrorHandler.withErrorHandling as jest.Mock).mockImplementation((fn: () => any) => fn());

            const aggregatedTrades = await getReadyAggregatedTrades();
            await ExecutionEngine.executeAggregatedTrades(mockClobClient, aggregatedTrades);

            expect(aggregatedTrades).toHaveLength(1);
            expect(aggregatedTrades[0].totalUsdcSize).toBe(125);
            expect(postOrder).toHaveBeenCalledTimes(1);
        });
    });

    describe('Order Size Calculation Integration', () => {
        it('should integrate with copy strategy configuration', () => {
            const config = {
                strategy: CopyStrategy.PERCENTAGE,
                copySize: 10.0,
                maxOrderSizeUSD: 100.0,
                minOrderSizeUSD: 1.0,
            };

            const result = calculateOrderSize(config, 200.0, 500.0, 0);

            expect(result.baseAmount).toBe(20.0); // 10% of 200
            expect(result.finalAmount).toBe(20.0);
            expect(result.strategy).toBe('PERCENTAGE');
            expect(result.cappedByMax).toBe(false);
            expect(result.reducedByBalance).toBe(false);
            expect(result.belowMinimum).toBe(false);
        });

        it('should handle balance constraints', () => {
            const config = {
                strategy: CopyStrategy.PERCENTAGE,
                copySize: 50.0,
                maxOrderSizeUSD: 1000.0,
                minOrderSizeUSD: 1.0,
            };

            const result = calculateOrderSize(config, 200.0, 50.0, 0); // Low balance

            expect(result.finalAmount).toBe(49.5); // 50 * 0.99
            expect(result.reducedByBalance).toBe(true);
        });
    });
});
