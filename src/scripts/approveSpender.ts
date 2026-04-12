import { ethers } from 'ethers';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../../.env') });

const PRIVATE_KEY = process.env.PRIVATE_KEY!;
const RPC_URL = process.env.RPC_URL!;
const USDC_ADDR = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174';

const SPENDERS = [
    '0xC5d563A36AE78145C45a50134d48A1215220f80a',
    '0xd91E80cF2E7be2e162c6513ceD06f1dD0dA35296'
];

async function main() {
    const provider = new ethers.providers.JsonRpcProvider(RPC_URL);
    const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
    const usdc = new ethers.Contract(USDC_ADDR, [
        'function approve(address spender, uint256 amount) public returns (bool)',
        'function allowance(address owner, address spender) public view returns (uint256)'
    ], wallet);

    for (const spender of SPENDERS) {
        console.log("\n--- Checking Spender:", spender);
        const allowance = await usdc.allowance(wallet.address, spender);
        console.log("Current allowance:", allowance.toString());

        if (allowance.gt(ethers.utils.parseUnits('1000', 6))) {
            console.log("✅ Already approved!");
            continue;
        }

        console.log("Sending approval tx...");
        const tx = await usdc.approve(spender, ethers.constants.MaxUint256, {
            maxPriorityFeePerGas: ethers.utils.parseUnits('50', 'gwei'),
            maxFeePerGas: ethers.utils.parseUnits('300', 'gwei'),
            gasLimit: 100000
        });
        console.log("TX Hash:", tx.hash);
        await tx.wait();
        console.log("✅ Approval confirmed!");
    }
}

main();
