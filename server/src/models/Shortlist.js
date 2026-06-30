import mongoose from 'mongoose';

const prioritySchema = new mongoose.Schema(
  {
    key: { type: String, required: true },
    label: { type: String, required: true },
    weight: { type: Number, min: 1, max: 5, default: 3 },
  },
  { _id: false },
);

const noteSchema = new mongoose.Schema(
  {
    body: { type: String, required: true, trim: true },
    source: { type: String, trim: true },
  },
  { timestamps: true },
);

const shortlistSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    college: { type: mongoose.Schema.Types.ObjectId, ref: 'College', required: true },
    priorities: [prioritySchema],
    notes: [noteSchema],
    pros: [{ type: String, trim: true }],
    cons: [{ type: String, trim: true }],
    confidence: { type: Number, min: 0, max: 100, default: 50 },
    status: {
      type: String,
      enum: ['researching', 'shortlisted', 'rejected', 'selected'],
      default: 'shortlisted',
    },
    researchLinks: [
      {
        label: { type: String, required: true },
        type: { type: String, default: 'Other' },
        url: { type: String, required: true }
      }
    ],
  },
  { timestamps: true },
);

shortlistSchema.index({ user: 1, college: 1 }, { unique: true });

export const Shortlist = mongoose.model('Shortlist', shortlistSchema);
