import { ethers } from 'ethers';
import { ClobClient } from '@polymarket/clob-client';
import { SignatureType } from '@polymarket/order-utils';
import { ENV, FollowerWallet } from '../config/env';
import Logger from '../utils/logger';

const CLOB_HTTP_URL = ENV.CLOB_HTTP_URL;
const RPC_URL = ENV.RPC_URL;

const isGnosisSafe = async (address: string): Promise<boolean> => {
    try {
        const provider = new ethers.providers.JsonRpcProvider(RPC_URL);
        const code = await provider.getCode(address);
        return code !== '0x';
    } catch (error) {
        return false;
    }
};

export const createClobClientForWallet = async (follower: FollowerWallet): Promise<ClobClient> => {
    const chainId = 137;
    const host = CLOB_HTTP_URL as string;
    const key = follower.privateKey.startsWith('0x') ? follower.privateKey : `0x${follower.privateKey}`;
    const wallet = new ethers.Wallet(key);
    const isProxySafe = await isGnosisSafe(follower.address);
    const signatureType = isProxySafe ? SignatureType.POLY_GNOSIS_SAFE : SignatureType.EOA;

    Logger.info(`Initializing CLOB client for ${follower.address.slice(0, 8)}...`);
    
    let creds;
    // Strategy: Try to create a brand new key if it's a new wallet
    // We can't easily check if a wallet is "new", so we just try createApiKey directly
    // since we want this wallet to be clean anyway.
    try {
        Logger.info("Creating fresh API keys...");
        const initClient = new ClobClient(host, chainId, wallet, undefined, signatureType, isProxySafe ? follower.address : undefined);
        creds = await initClient.createApiKey();
        Logger.info(`Successfully created API key: ${creds.key.slice(0, 8)}...`);
        await new Promise(r => setTimeout(r, 2000));
    } catch (e: any) {
        Logger.info(`createApiKey failed, attempting to derive instead: ${e.message}`);
        try {
            const deriveClient = new ClobClient(host, chainId, wallet, undefined, signatureType, isProxySafe ? follower.address : undefined);
            creds = await deriveClient.deriveApiKey();
            Logger.info("Successfully derived existing API key");
        } catch (e2: any) {
            Logger.error("Failed both create and derive API key");
            throw new Error("Polymarket API Key initialization failed");
        }
    }

    if (!creds || !creds.key) {
        throw new Error("Could not initialize Polymarket API keys");
    }

    const client = new ClobClient(host, chainId, wallet, creds, signatureType, isProxySafe ? follower.address : undefined);
    (client as any).address = follower.address.toLowerCase();
    return client;
};

export const getClobClients = async (): Promise<ClobClient[]> => {
    const followers = ENV.FOLLOWER_WALLETS;
    const clients: ClobClient[] = [];
    for (const f of followers) {
        clients.push(await createClobClientForWallet(f));
    }
    return clients;
};

const createClobClient = async (): Promise<ClobClient> => {
    return createClobClientForWallet(ENV.FOLLOWER_WALLETS[0]);
};

export default createClobClient;
