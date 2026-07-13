import express from 'express';
import { z } from 'zod';
import { requireAuth, requireVerifiedEmail } from '../middleware/auth.js';
import { Invitation } from '../models/Invitation.js';
import { User } from '../models/User.js';
import { Shortlist } from '../models/Shortlist.js';
import { logActivity } from '../utils/activityLogger.js';
import { sendCollaborationInviteEmail } from '../utils/mailer.js';

const router = express.Router();

const inviteSchema = z.object({
  email: z.string().email().toLowerCase().trim(),
  role: z.enum(['viewer', 'editor']).default('viewer'),
});

const responseSchema = z.object({
  accept: z.boolean(),
});

router.use(requireAuth);

// All mutation routes require email verification
router.use((req, res, next) => {
  if (req.method !== 'GET') {
    return requireVerifiedEmail(req, res, next);
  }
  return next();
});

// POST /invite - Send collaborator invite
router.post('/invite', async (req, res, next) => {
  try {
    const { email, role } = inviteSchema.parse(req.body);

    if (email === req.user.email.toLowerCase()) {
      return res.status(400).json({ message: 'You cannot invite yourself' });
    }

    // Check if invitation already exists with pending or accepted status
    const existing = await Invitation.findOne({
      sender: req.user._id,
      inviteeEmail: email,
      status: { $in: ['pending', 'accepted'] },
    });

    if (existing) {
      return res.status(400).json({ message: 'An active or pending invitation already exists for this email' });
    }

    // Delete any previous declined invitations to avoid duplicate keys or confusion
    await Invitation.deleteMany({
      sender: req.user._id,
      inviteeEmail: email,
      status: 'declined',
    });

    const invitation = await Invitation.create({
      sender: req.user._id,
      inviteeEmail: email,
      role,
    });

    // Send invitation email
    const clientUrl = process.env.CLIENT_ORIGIN || 'http://localhost:5173/';
    await sendCollaborationInviteEmail(email, req.user.name, role, clientUrl);

    // Log activity
    await logActivity(
      req.user._id,
      'collaborator_invite',
      `Invited ${email} to collaborate as a ${role}`
    );

    return res.status(201).json({ invitation });
  } catch (error) {
    return next(error);
  }
});

// GET /invitations - List sent and received invitations
router.get('/invitations', async (req, res, next) => {
  try {
    const sentInvites = await Invitation.find({ sender: req.user._id }).lean();
    const sent = [];
    
    for (const invite of sentInvites) {
      const inviteeUser = await User.findOne({ email: invite.inviteeEmail }).select('name email');
      sent.push({
        _id: invite._id,
        inviteeEmail: invite.inviteeEmail,
        inviteeName: inviteeUser ? inviteeUser.name : null,
        role: invite.role,
        status: invite.status,
        createdAt: invite.createdAt,
      });
    }

    const received = await Invitation.find({ inviteeEmail: req.user.email.toLowerCase() })
      .populate('sender', 'name email')
      .lean();

    return res.json({ sent, received });
  } catch (error) {
    return next(error);
  }
});

// POST /invitations/:inviteId/respond - Accept or decline invitation
router.post('/invitations/:inviteId/respond', async (req, res, next) => {
  try {
    const { accept } = responseSchema.parse(req.body);

    const invitation = await Invitation.findOne({
      _id: req.params.inviteId,
      inviteeEmail: req.user.email.toLowerCase(),
    });

    if (!invitation) {
      return res.status(404).json({ message: 'Invitation not found' });
    }

    if (invitation.status !== 'pending') {
      return res.status(400).json({ message: 'Invitation has already been processed' });
    }

    invitation.status = accept ? 'accepted' : 'declined';
    await invitation.save();

    if (accept) {
      // Sync collaborator directly inside the owner's shortlists
      await Shortlist.updateMany(
        { user: invitation.sender },
        { $addToSet: { collaborators: { user: req.user._id, role: invitation.role } } }
      );
    }

    const inviter = await User.findById(invitation.sender);
    const inviterName = inviter ? inviter.name : 'Another user';

    // Log activity
    await logActivity(
      req.user._id,
      'collaborator_accept',
      `${accept ? 'Accepted' : 'Declined'} collaboration invite from ${inviterName}`
    );

    return res.json({ invitation });
  } catch (error) {
    return next(error);
  }
});

// GET /shares - Get accepted workspace shares
router.get('/shares', async (req, res, next) => {
  try {
    const shares = await Invitation.find({
      inviteeEmail: req.user.email.toLowerCase(),
      status: 'accepted',
    })
      .populate('sender', 'name email')
      .lean();

    return res.json({ shares });
  } catch (error) {
    return next(error);
  }
});

// DELETE /shares/:shareId - Revoke or leave collaboration workspace
router.delete('/shares/:shareId', async (req, res, next) => {
  try {
    const invitation = await Invitation.findOne({
      _id: req.params.shareId,
      $or: [
        { sender: req.user._id },
        { inviteeEmail: req.user.email.toLowerCase() },
      ],
    });

    if (!invitation) {
      return res.status(404).json({ message: 'Collaboration share not found' });
    }

    await Invitation.deleteOne({ _id: invitation._id });

    // Remove collaborator from owner's shortlists
    const collaboratorUser = await User.findOne({ email: invitation.inviteeEmail });
    if (collaboratorUser) {
      await Shortlist.updateMany(
        { user: invitation.sender },
        { $pull: { collaborators: { user: collaboratorUser._id } } }
      );
    }

    // Log activity
    if (invitation.sender.toString() === req.user._id.toString()) {
      await logActivity(
        req.user._id,
        'collaborator_revoke',
        `Revoked collaboration access for ${invitation.inviteeEmail}`
      );
    } else {
      const owner = await User.findById(invitation.sender);
      const ownerName = owner ? owner.name : 'Unknown';
      await logActivity(
        req.user._id,
        'collaborator_revoke',
        `Left collaboration workspace of ${ownerName}`
      );
    }

    return res.status(204).send();
  } catch (error) {
    return next(error);
  }
});

export default router;
