import mongoose from 'mongoose';

const invitationSchema = new mongoose.Schema(
  {
    sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    inviteeEmail: { type: String, required: true, lowercase: true, trim: true },
    role: { type: String, enum: ['viewer', 'editor'], default: 'viewer' },
    status: { type: String, enum: ['pending', 'accepted', 'declined'], default: 'pending' },
  },
  { timestamps: true }
);

// Prevent duplicate pending invitations for the same email from the same sender
invitationSchema.index({ sender: 1, inviteeEmail: 1, status: 1 });

export const Invitation = mongoose.model('Invitation', invitationSchema);
