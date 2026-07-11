import express from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { Invitation } from '../models/Invitation.js';
import { Shortlist } from '../models/Shortlist.js';
import { Decision } from '../models/Decision.js';
import { User } from '../models/User.js';
import { sendCollaborationInviteEmail } from '../utils/mailer.js';
import { logActivity } from '../utils/activityLogger.js';

const router = express.Router();
router.use(requireAuth);

const inviteSchema = z.object({
  email: z.string().email().toLowerCase().trim(),
  role: z.enum(['viewer', 'editor']).default('viewer'),
});

const respondSchema = z.object({
  accept: z.boolean(),
});

// POST send invite
router.post('/invite', async (req, res, next) => {
  try {
    const { email, role } = inviteSchema.parse(req.body);

    if (email === req.user.email.toLowerCase()) {
      return res.status(400).json({ message: 'You cannot invite yourself to collaborate' });
    }

    // Check if duplicate pending invite exists
    let invitation = await Invitation.findOne({
      sender: req.user._id,
      inviteeEmail: email,
      status: 'pending',
    });

    if (invitation) {
      // Update role if changed
      invitation.role = role;
      await invitation.save();
    } else {
      // Save new invitation
      invitation = await Invitation.create({
        sender: req.user._id,
        inviteeEmail: email,
        role,
        status: 'pending',
      });
    }

    // Send email
    const clientOrigin = process.env.CLIENT_ORIGIN || 'http://localhost:5173';
    const registerLink = `${clientOrigin}?invite=pending`;
    
    try {
      await sendCollaborationInviteEmail(email, req.user.name, role, registerLink);
    } catch (mailErr) {
      console.error('Failed to send invite email:', mailErr);
      // Don't fail the request, just log it. Ethereal mailer is mockable in tests
    }

    await logActivity(
      req.user._id,
      'collaborator_invite',
      `Sent ${role} invitation to ${email}`
    );

    return res.status(201).json({ invitation });
  } catch (error) {
    return next(error);
  }
});

// GET all invitations (sent and received)
router.get('/invitations', async (req, res, next) => {
  try {
    const received = await Invitation.find({
      inviteeEmail: req.user.email.toLowerCase(),
      status: 'pending',
    }).populate('sender', 'name email');

    const sent = await Invitation.find({
      sender: req.user._id,
    });

    return res.json({ sent, received });
  } catch (error) {
    return next(error);
  }
});

// POST respond to invitation (accept / decline)
router.post('/invitations/:id/respond', async (req, res, next) => {
  try {
    const { accept } = respondSchema.parse(req.body);
    
    const invitation = await Invitation.findOne({
      _id: req.params.id,
      inviteeEmail: req.user.email.toLowerCase(),
      status: 'pending',
    });

    if (!invitation) {
      return res.status(404).json({ message: 'Invitation not found or already processed' });
    }

    if (accept) {
      invitation.status = 'accepted';
      await invitation.save();

      // Push collaborator to all existing shortlists of sender
      await Shortlist.updateMany(
        { user: invitation.sender, 'collaborators.user': { $ne: req.user._id } },
        { $push: { collaborators: { user: req.user._id, role: invitation.role } } }
      );

      // Push collaborator to all existing decisions of sender
      await Decision.updateMany(
        { user: invitation.sender, 'collaborators.user': { $ne: req.user._id } },
        { $push: { collaborators: { user: req.user._id, role: invitation.role } } }
      );

      await logActivity(
        req.user._id,
        'collaborator_accept',
        `Accepted collaboration invite from ${invitation.sender}`
      );
    } else {
      invitation.status = 'declined';
      await invitation.save();
    }

    return res.json({ invitation });
  } catch (error) {
    return next(error);
  }
});

// GET active workspaces (workspaces shared with req.user)
router.get('/shares', async (req, res, next) => {
  try {
    const activeShares = await Invitation.find({
      inviteeEmail: req.user.email.toLowerCase(),
      status: 'accepted',
    }).populate('sender', 'name email');

    const shares = activeShares.map(invite => ({
      _id: invite._id,
      user: invite.sender,
      role: invite.role,
    }));

    // Also get active collaborators for req.user's own workspace
    const ownCollaborators = await Invitation.find({
      sender: req.user._id,
      status: 'accepted',
    });

    // Populate actual user IDs for own collaborators if they exist
    const ownCollaboratorsPopulated = [];
    for (const collab of ownCollaborators) {
      const u = await User.findOne({ email: collab.inviteeEmail }).select('name email');
      ownCollaboratorsPopulated.push({
        _id: collab._id,
        email: collab.inviteeEmail,
        role: collab.role,
        user: u || { name: 'Pending signup', email: collab.inviteeEmail, _id: null },
      });
    }

    return res.json({ shares, ownCollaborators: ownCollaboratorsPopulated });
  } catch (error) {
    return next(error);
  }
});

// DELETE leave or revoke share
router.delete('/shares/:id', async (req, res, next) => {
  try {
    // Check if the id matches an invitation where req.user is either sender or invitee
    const invitation = await Invitation.findById(req.params.id);
    if (!invitation) {
      return res.status(404).json({ message: 'Collaboration workspace not found' });
    }

    const isSender = invitation.sender.toString() === req.user._id.toString();
    const isInvitee = invitation.inviteeEmail.toLowerCase() === req.user.email.toLowerCase();

    if (!isSender && !isInvitee) {
      return res.status(403).json({ message: 'Unauthorized to remove this collaborator share' });
    }

    // Set to declined/removed
    invitation.status = 'declined';
    await invitation.save();

    // Pull from shortlist collaborators
    let collaboratorUserId;
    if (isSender) {
      const collabUser = await User.findOne({ email: invitation.inviteeEmail });
      collaboratorUserId = collabUser ? collabUser._id : null;
    } else {
      collaboratorUserId = req.user._id;
    }

    const targetOwnerId = isSender ? req.user._id : invitation.sender;

    if (collaboratorUserId) {
      await Shortlist.updateMany(
        { user: targetOwnerId },
        { $pull: { collaborators: { user: collaboratorUserId } } }
      );
      await Decision.updateMany(
        { user: targetOwnerId },
        { $pull: { collaborators: { user: collaboratorUserId } } }
      );
    }

    await logActivity(
      req.user._id,
      'collaborator_revoke',
      isSender ? `Revoked workspace share from ${invitation.inviteeEmail}` : `Left workspace of ${invitation.sender}`
    );

    return res.status(204).send();
  } catch (error) {
    return next(error);
  }
});

export default router;
