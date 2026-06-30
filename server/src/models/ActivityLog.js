import mongoose from 'mongoose';

const activityLogSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    action: {
      type: String,
      enum: ['shortlist_add', 'shortlist_remove', 'priority_update', 'note_add', 'link_add', 'decision_confirm', 'reflection_add'],
      required: true,
    },
    details: { type: String, required: true },
  },
  { timestamps: true },
);

export const ActivityLog = mongoose.model('ActivityLog', activityLogSchema);
