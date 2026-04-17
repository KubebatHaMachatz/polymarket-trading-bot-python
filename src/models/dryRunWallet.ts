import mongoose, { Schema } from 'mongoose';

const dryRunWalletSchema = new Schema({
    followerWallet: { type: String, required: true, unique: true },
    balance: { type: Number, default: 1000.0 }, // The virtual USDC balance
    totalInvested: { type: Number, default: 0.0 },
    totalRealizedPnl: { type: Number, default: 0.0 },
    updatedAt: { type: Date, default: Date.now }
}, { collection: 'dry_run_wallets' });

const DryRunWallet = mongoose.models?.DryRunWallet ?? mongoose.model('DryRunWallet', dryRunWalletSchema);
export { DryRunWallet };
export default DryRunWallet;
