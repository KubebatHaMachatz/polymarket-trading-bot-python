import mongoose, { Schema } from 'mongoose';

/**
 * Mongoose schema for dry run positions.
 * Used to track "paper trading" positions when DRY_RUN_MODE is active.
 */
const dryRunPositionSchema = new Schema({
    followerWallet: { type: String, required: true, index: true },
    traderAddress: { type: String, required: true, index: true },
    asset: { type: String, required: true },
    conditionId: { type: String, required: true },
    size: { type: Number, required: true }, // Number of shares
    avgPrice: { type: Number, required: true }, // Average buy price
    totalCost: { type: Number, required: true }, // Total USDC invested
    slug: { type: String },
    title: { type: String },
    outcome: { type: String },
    lastPrice: { type: Number },
    updatedAt: { type: Date, default: Date.now }
}, { collection: 'dry_run_positions' });

// Compound index for finding a specific position for a specific bot and asset
dryRunPositionSchema.index({ followerWallet: 1, traderAddress: 1, conditionId: 1 }, { unique: true });

const DryRunPosition = mongoose.models?.DryRunPosition ?? mongoose.model('DryRunPosition', dryRunPositionSchema);

export { DryRunPosition };
export default DryRunPosition;
