import mongoose from 'mongoose';

const reflectionSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    decision: { type: mongoose.Schema.Types.ObjectId, ref: 'Decision', required: true },
    satisfaction: { type: Number, min: 1, max: 10, required: true },
    placementDataAccurate: { type: Boolean, default: false },
    wouldChooseAgain: { type: Boolean, default: false },
    biggestSurprise: { type: String, trim: true },
    biggestRegret: { type: String, trim: true },
  },
  { timestamps: true },
);

export const Reflection = mongoose.model('Reflection', reflectionSchema);
