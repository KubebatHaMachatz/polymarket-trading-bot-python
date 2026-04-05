
import { ethers } from 'ethers';
import { AssetType, ClobClient, OrderType, Side } from '@polymarket/clob-client';
import { SignatureType } from '@polymarket/order-utils';
import { ENV } from '../config/env';

/**
 * SELL ALL POSITIONS SCRIPT
 * 
 * Sells 100% of all current positions in the proxy wallet.
 */

const PROXY_WALLET = ENV.PROXY_WALLET;
const PRIVATE_KEY = ENV.PRIVATE_KEY;
const CLOB_HTTP_URL = ENV.CLOB_HTTP_URL;
const RPC_URL = ENV.RPC_URL;
const POLYGON_CHAIN_ID = 137;
const RETRY_LIMIT = ENV.RETRY_LIMIT;

interface Position {
    asset: string;
    conditionId: string;
    size: number;
    avgPrice: number;
    currentValue: number;
    title: string;
    outcome: string;
}

const isGnosisSafe = async (address: string, provider: ethers.providers.JsonRpcProvider): Promise<boolean> => {
    try {
        const code = await provider.getCode(address);
        return code !== '0x';
    } catch { return false; }
};

const createClobClient = async (provider: ethers.providers.JsonRpcProvider): Promise<ClobClient> => {
    const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
    const isProxySafe = await isGnosisSafe(PROXY_WALLET, provider);
    const signatureType = isProxySafe ? SignatureType.POLY_GNOSIS_SAFE : SignatureType.EOA;

    console.log(`Wallet type: ${isProxySafe ? 'Gnosis Safe' : 'EOA'}`);

    let clobClient = new ClobClient(
        CLOB_HTTP_URL,
        POLYGON_CHAIN_ID,
        wallet,
        undefined,
        signatureType,
        isProxySafe ? PROXY_WALLET : undefined
    );

    let creds = await clobClient.createApiKey();
    if (!creds.key) creds = await clobClient.deriveApiKey();

    return new ClobClient(
        CLOB_HTTP_URL,
        POLYGON_CHAIN_ID,
        wallet,
        creds,
        signatureType,
        isProxySafe ? PROXY_WALLET : undefined
    );
};

const fetchPositions = async (): Promise<Position[]> => {
    const url = `https://data-api.polymarket.com/positions?user=${PROXY_WALLET}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed to fetch positions: ${response.statusText}`);
    return response.json();
};

const sellEntirePosition = async (clobClient: ClobClient, position: Position) => {
    let remaining = position.size;
    let retry = 0;

    console.log(`\n🔄 Selling 100% of: ${position.title} (${position.size.toFixed(2)} tokens)`);

    while (remaining > 0.1 && retry < RETRY_LIMIT) {
        try {
            const orderBook = await clobClient.getOrderBook(position.asset);
            if (!orderBook.bids || orderBook.bids.length === 0) {
                console.log('❌ No bids available for this market.');
                break;
            }

            const maxPriceBid = orderBook.bids.reduce((max, bid) => parseFloat(bid.price) > parseFloat(max.price) ? bid : max, orderBook.bids[0]);
            let orderAmount = Math.min(remaining, parseFloat(maxPriceBid.size));

            const orderArgs = {
                side: Side.SELL,
                tokenID: position.asset,
                amount: orderAmount,
                price: parseFloat(maxPriceBid.price),
            };

            console.log(`📤 Order: ${orderAmount.toFixed(2)} tokens @ $${orderArgs.price}`);
            const signedOrder = await clobClient.createMarketOrder(orderArgs);
            const resp = await clobClient.postOrder(signedOrder, OrderType.FOK);

            if (resp.success === true) {
                console.log(`✅ SUCCESS: Sold ${orderAmount.toFixed(2)} tokens.`);
                remaining -= orderAmount;
                retry = 0;
            } else {
                retry++;
                console.log(`⚠️ Attempt ${retry} failed.`);
                await new Promise(r => setTimeout(r, 1000));
            }
        } catch (error) {
            retry++;
            console.error(`❌ Error: ${error}`);
        }
    }
};

async function main() {
    console.log('🚀 SELL ALL POSITIONS');
    console.log('═══════════════════════════════════════════════\n');

    try {
        const provider = new ethers.providers.JsonRpcProvider(RPC_URL);
        const clobClient = await createClobClient(provider);
        const positions = await fetchPositions();

        if (positions.length === 0) {
            console.log('✅ No open positions found.');
            return;
        }

        console.log(`Found ${positions.length} positions. Starting liquidation...\n`);

        for (const pos of positions) {
            await sellEntirePosition(clobClient, pos);
        }

        console.log('\n✅ ALL POSITIONS PROCESSED!');
    } catch (error) {
        console.error('\n❌ Fatal error:', error);
    }
}

main();
