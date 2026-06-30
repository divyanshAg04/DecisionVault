import mongoose from 'mongoose';

const cutoffSchema = new mongoose.Schema(
  {
    institute: { type: String, required: true, index: true },
    program: { type: String, required: true, index: true },
    quota: { type: String, required: true, index: true },
    seatType: { type: String, required: true, index: true },
    gender: { type: String, required: true, index: true },
    openingRank: { type: Number, required: true },
    closingRank: { type: Number, required: true, index: true },
  },
  { timestamps: true }
);

// Compounded index for lightning-fast matching queries
cutoffSchema.index({ seatType: 1, gender: 1, quota: 1, closingRank: 1 });

export const Cutoff = mongoose.model('Cutoff', cutoffSchema);
