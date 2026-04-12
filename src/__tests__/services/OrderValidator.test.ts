
import { validateTrade } from '../../services/OrderValidator';
import { ENV } from '../../config/env';
import fetchData from '../../utils/fetchData';
import getMyBalance from '../../utils/getMyBalance';
import mongoose from 'mongoose';

// Mock environment
jest.mock('../../config/env', () => ({
    ENV: {
        MIN_LEADER_TRADE_USD: 1000,
        MIN_MARKET_24H_VOL: 100000,
        MAX_PRICE_DEVIATION: 0.005,
        MAX_COPY_PRICE: 0.92,
        PROXY_WALLET: '0xproxy',
        COPY_STRATEGY_CONFIG: {
            strategy: 'PERCENTAGE',
            copySize: 10,
        },
    },
}));
jest.mock('../../utils/logger', () => ({
    __esModule: true,
    default: {
        info: jest.fn(),
        error: jest.fn(),
        warning: jest.fn(),
        debug: jest.fn(),
        header: jest.fn(),
        separator: jest.fn(),
    },
}));

// Mock CircuitBreaker
jest.mock('../../utils/circuitBreaker', () => ({
    CircuitBreakerRegistry: {
        getBreaker: jest.fn(() => ({
            execute: jest.fn((fn) => fn()),
        })),
    },
}));

const mockClobClient = {
    getOrderBook: jest.fn(),
} as any;

jest.mock('../../utils/fetchData', () => jest.fn());
jest.mock('../../utils/getMyBalance');

describe('OrderValidator', () => {
    const traderAddress = '0x1234567890123456789012345678901234567890';
    const proxyWallet = '0x0987654321098765432109876543210987654321';

    const baseTrade = {
        _id: new mongoose.Types.ObjectId(),
        usdcSize: 2000,
        price: 0.5,
        side: 'BUY',
        asset: '0xasset',
        conditionId: '0xcond',
        slug: 'test-market',
    };

    beforeEach(() => {
        jest.clearAllMocks();
        // Setup default mocks
        (fetchData as jest.Mock).mockImplementation((url) => {
            if (url.includes('gamma-api.polymarket.com/markets')) {
                return Promise.resolve([{ volume24hr: '1000000' }]);
            }
            if (url.includes('data-api.polymarket.com/positions')) {
                return Promise.resolve([]);
            }
            return Promise.resolve([]);
        });
        (getMyBalance as jest.Mock).mockResolvedValue(100000);
        mockClobClient.getOrderBook.mockResolvedValue({
            asks: [{ price: '0.5', size: '1000' }],
            bids: [{ price: '0.49', size: '1000' }],
        });
    });

    it('should validate a normal trade successfully', async () => {
        const result = await validateTrade(baseTrade as any, traderAddress, proxyWallet, mockClobClient);
        expect(result.isValid).toBe(true);
    });

    describe('Inverse Bond Ceiling (MAX_COPY_PRICE)', () => {
        it('should reject BUY if best ask exceeds MAX_COPY_PRICE', async () => {
            mockClobClient.getOrderBook.mockResolvedValue({
                asks: [{ price: '0.93', size: '1000' }],
            });

            const result = await validateTrade(baseTrade as any, traderAddress, proxyWallet, mockClobClient);
            expect(result.isValid).toBe(false);
            expect(result.reason).toContain('exceeds');
            expect(result.reason).toContain('ceiling');
        });

        it('should allow BUY if best ask is exactly MAX_COPY_PRICE', async () => {
            mockClobClient.getOrderBook.mockResolvedValue({
                asks: [{ price: '0.92', size: '1000' }],
            });

            const trade = { ...baseTrade, price: 0.92 };
            const result = await validateTrade(trade as any, traderAddress, proxyWallet, mockClobClient);
            if (!result.isValid) console.log(`DEBUG FAILURE: ${result.reason}`);
            expect(result.isValid).toBe(true);
        });
    });

    describe('Slippage Guard (MAX_PRICE_DEVIATION)', () => {
        it('should reject BUY if price moved up more than 0.5%', async () => {
            const leaderPrice = 0.5;
            // 0.5 * 1.005 = 0.5025. 0.503 is > 0.5%
            mockClobClient.getOrderBook.mockResolvedValue({
                asks: [{ price: '0.503', size: '1000' }],
            });

            const trade = { ...baseTrade, price: leaderPrice };
            const result = await validateTrade(trade as any, traderAddress, proxyWallet, mockClobClient);
            expect(result.isValid).toBe(false);
            expect(result.reason).toContain('Price deviation too high');
        });

        it('should allow BUY if price moved up exactly 0.5%', async () => {
            const leaderPrice = 0.5;
            // 0.5 * 1.005 = 0.5025
            mockClobClient.getOrderBook.mockResolvedValue({
                asks: [{ price: '0.5025', size: '1000' }],
            });

            const trade = { ...baseTrade, price: leaderPrice };
            const result = await validateTrade(trade as any, traderAddress, proxyWallet, mockClobClient);
            expect(result.isValid).toBe(true);
        });
    });

    describe('Market Dominance (Wash Trade Detection)', () => {
        it('should reject if leader trade is > 2% of 24h volume', async () => {
            const vol24h = 50000;
            const leaderTradeSize = 1500; // 3% of 24h vol
            
            (fetchData as jest.Mock).mockImplementation((url) => {
                if (url.includes('gamma-api.polymarket.com/markets')) {
                    return Promise.resolve([{ volume24hr: vol24h.toString() }]);
                }
                return Promise.resolve([]);
            });

            // Set small MIN_MARKET_24H_VOL to pass first check
            const trade = { ...baseTrade, usdcSize: leaderTradeSize };
            const originalMinVol = ENV.MIN_MARKET_24H_VOL;
            (ENV as any).MIN_MARKET_24H_VOL = 10000;
            
            const result = await validateTrade(trade as any, traderAddress, proxyWallet, mockClobClient);
            (ENV as any).MIN_MARKET_24H_VOL = originalMinVol;
            
            expect(result.isValid).toBe(false);
            expect(result.reason).toContain('Potential Wash Trade');
        });

        it('should allow if leader trade is < 2% of 24h volume', async () => {
            const vol24h = 1000000;
            const leaderTradeSize = 10000; // 1% of 24h vol
            
            (fetchData as jest.Mock).mockImplementation((url) => {
                if (url.includes('gamma-api.polymarket.com/markets')) {
                    return Promise.resolve([{ volume24hr: vol24h.toString() }]);
                }
                return Promise.resolve([]);
            });

            const trade = { ...baseTrade, usdcSize: leaderTradeSize };
            const result = await validateTrade(trade as any, traderAddress, proxyWallet, mockClobClient);
            expect(result.isValid).toBe(true);
        });
    });
});
