import mongoose from 'mongoose';

// Mock dependencies
jest.mock('../../utils/logger', () => ({
    __esModule: true,
    default: {
        info: jest.fn(),
    },
}));

const mockUpdateOne = jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue({}) });
jest.mock('../../models/userHistory', () => ({
    getUserActivityModel: jest.fn(() => ({
        updateOne: mockUpdateOne,
    })),
}));

jest.mock('../../utils/errorHandler', () => ({
    ErrorHandler: {
        withErrorHandling: jest.fn((fn: () => any) => fn()),
        handle: jest.fn(),
    },
}));

// Mock environment
jest.mock('../../config/env', () => ({
    ENV: {
        TRADE_AGGREGATION_WINDOW_SECONDS: 60,
    },
}));

describe('TradeAggregator', () => {
    let TradeAggregator: any;

    beforeEach(() => {
        jest.clearAllMocks();
        jest.resetModules();
        TradeAggregator = require('../../services/TradeAggregator');
    });

    const createMockTrade = (overrides: any = {}): any => ({
        _id: new mongoose.Types.ObjectId(),
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
        userAddress: '0x123',
        ...overrides,
    });

    describe('addToAggregationBuffer', () => {
        it('should create new aggregation for first trade', () => {
            const trade = createMockTrade();
            TradeAggregator.addToAggregationBuffer(trade);
            expect(TradeAggregator.getAggregationBufferSize()).toBe(1);
        });

        it('should aggregate multiple trades with same key', async () => {
            jest.useFakeTimers();
            const trade1 = createMockTrade({ usdcSize: 100, price: 1.0 });
            const trade2 = createMockTrade({ usdcSize: 50, price: 1.1 });

            TradeAggregator.addToAggregationBuffer(trade1);
            TradeAggregator.addToAggregationBuffer(trade2);

            expect(TradeAggregator.getAggregationBufferSize()).toBe(1);

            jest.advanceTimersByTime(65 * 1000);
            const readyTrades = await TradeAggregator.getReadyAggregatedTrades();
            expect(readyTrades).toHaveLength(1);
            expect(readyTrades[0].totalUsdcSize).toBe(150);
            expect(readyTrades[0].trades).toHaveLength(2);
            jest.useRealTimers();
        });

        it('should calculate weighted average price correctly', async () => {
            jest.useFakeTimers();
            const trade1 = createMockTrade({ usdcSize: 100, price: 1.0 });
            const trade2 = createMockTrade({ usdcSize: 200, price: 1.5 });

            TradeAggregator.addToAggregationBuffer(trade1);
            TradeAggregator.addToAggregationBuffer(trade2);

            jest.advanceTimersByTime(65 * 1000);
            const readyTrades = await TradeAggregator.getReadyAggregatedTrades();
            expect(readyTrades[0].averagePrice).toBeCloseTo(1.3333, 4);
            jest.useRealTimers();
        });

        it('should handle different aggregation keys separately', () => {
            const trade1 = createMockTrade({ userAddress: '0x123' });
            const trade2 = createMockTrade({ userAddress: '0x456' });

            TradeAggregator.addToAggregationBuffer(trade1);
            TradeAggregator.addToAggregationBuffer(trade2);

            expect(TradeAggregator.getAggregationBufferSize()).toBe(2);
        });
    });

    describe('getReadyAggregatedTrades', () => {
        beforeEach(() => {
            jest.useFakeTimers();
        });

        afterEach(() => {
            jest.useRealTimers();
        });

        it('should return empty array when no trades are ready', async () => {
            const trade = createMockTrade();
            TradeAggregator.addToAggregationBuffer(trade);

            jest.advanceTimersByTime(30 * 1000);
            const readyTrades = await TradeAggregator.getReadyAggregatedTrades();
            expect(readyTrades).toHaveLength(0);
        });

        it('should return trades when window time has passed', async () => {
            const trade = createMockTrade();
            TradeAggregator.addToAggregationBuffer(trade);

            jest.advanceTimersByTime(65 * 1000);
            const readyTrades = await TradeAggregator.getReadyAggregatedTrades();
            expect(readyTrades).toHaveLength(1);
            expect(readyTrades[0].userAddress).toBe('0x123');
        });

        it('should skip aggregations below minimum size', async () => {
            const trade = createMockTrade({ usdcSize: 0.5 });
            TradeAggregator.addToAggregationBuffer(trade);

            jest.advanceTimersByTime(65 * 1000);
            const readyTrades = await TradeAggregator.getReadyAggregatedTrades();
            expect(readyTrades).toHaveLength(0);
            expect(TradeAggregator.getAggregationBufferSize()).toBe(0);
        });

        it('should mark individual trades as processed when skipping small aggregations', async () => {
            const trade = createMockTrade({ usdcSize: 0.5, _id: 'trade1' });
            TradeAggregator.addToAggregationBuffer(trade);

            jest.advanceTimersByTime(65 * 1000);
            const readyTrades = await TradeAggregator.getReadyAggregatedTrades();

            expect(readyTrades).toHaveLength(0);
            expect(mockUpdateOne).toHaveBeenCalledWith(
                { _id: 'trade1' },
                { bot: true }
            );
        });

        it('should handle multiple ready aggregations', async () => {
            const trade1 = createMockTrade({ userAddress: '0x123', conditionId: 'cond1' });
            const trade2 = createMockTrade({ userAddress: '0x456', conditionId: 'cond2' });

            TradeAggregator.addToAggregationBuffer(trade1);
            TradeAggregator.addToAggregationBuffer(trade2);

            jest.advanceTimersByTime(65 * 1000);
            const readyTrades = await TradeAggregator.getReadyAggregatedTrades();
            expect(readyTrades).toHaveLength(2);
        });
    });
});
