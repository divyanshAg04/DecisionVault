import mongoose from 'mongoose';

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    examTrack: {
      type: String,
      enum: ['JEE', 'CUET', 'NEET', 'GATE', 'CAT', 'Other'],
      default: 'JEE',
    },
    targetYear: { type: Number, default: 2027 },
    journey: { type: String, default: '' },
    exam: { type: String, default: '' },
    scoreType: { type: String, default: '' },
    score: { type: String, default: '' },
    category: { type: String, default: 'General' },
    homeState: { type: String, default: '' },
    preferredBranches: { type: String, default: '' },
    stream: { type: String, default: '' },
    budget: { type: String, default: '' },
    targetExam: { type: String, default: '' },
    scorecardName: { type: String, default: '' },
    scorecardBase64: { type: String, default: '' },
  },
  { timestamps: true },
);

export const User = mongoose.model('User', userSchema);
