import mongoose from 'mongoose';

const decisionSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    selectedCollege: { type: mongoose.Schema.Types.ObjectId, ref: 'College' },
    selectedCollegeSnapshot: {
      name: { type: String, trim: true },
      shortName: { type: String, trim: true },
      program: { type: String, trim: true },
      quota: { type: String, trim: true },
      seatType: { type: String, trim: true },
      gender: { type: String, trim: true },
      openingRank: { type: Number },
      closingRank: { type: Number },
      probability: { type: Number },
      source: { type: String, default: 'college' },
    },
    finalScore: { type: Number, min: 0, max: 100, required: true },
    confidence: { type: Number, min: 0, max: 100, required: true },
    reasons: [{ type: String, trim: true }],
    decisionDate: { type: Date, default: Date.now },
    reviewDueAt: { type: Date, required: true },
  },
  { timestamps: true },
);

export const Decision = mongoose.model('Decision', decisionSchema);
