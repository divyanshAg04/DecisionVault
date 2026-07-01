import mongoose from 'mongoose';

const researchLinkSchema = new mongoose.Schema(
  {
    label: { type: String, required: true, trim: true },
    type: {
      type: String,
      enum: ['Official', 'Placement PDF', 'YouTube', 'Reddit', 'Senior Note', 'Article', 'Other'],
      default: 'Other',
    },
    url: { type: String, required: true, trim: true },
  },
  { _id: false },
);

const collegeSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    shortName: { type: String, required: true, trim: true },
    type: { type: String, required: true, trim: true },
    branch: { type: String, required: true, trim: true },
    state: { type: String, required: true, trim: true },
    city: { type: String, required: true, trim: true },
    fees: { type: Number, required: true },
    avgPackage: { type: Number, required: true },
    medianPackage: { type: Number, required: true },
    placementRate: { type: Number, required: true },
    nirfRank: { type: Number, required: true },
    hostel: { type: Boolean, default: false },
    cutoff: { type: Number, required: true },
    distanceKm: { type: Number, required: true },
    campusLife: { type: Number, required: true },
    faculty: { type: Number, required: true },
    research: { type: Number, required: true },
    roi: { type: Number, required: true },
    tags: [{ type: String, trim: true }],
    pros: [{ type: String, trim: true }],
    cons: [{ type: String, trim: true }],
    researchLinks: [researchLinkSchema],
    cutoffSnapshot: {
      program: { type: String, trim: true },
      quota: { type: String, trim: true },
      seatType: { type: String, trim: true },
      gender: { type: String, trim: true },
      openingRank: Number,
      closingRank: Number,
      probability: Number,
      source: { type: String, trim: true },
    },
  },
  { timestamps: true },
);

collegeSchema.index({
  name: 'text',
  shortName: 'text',
  branch: 'text',
  state: 'text',
  city: 'text',
  tags: 'text',
});

export const College = mongoose.model('College', collegeSchema);
