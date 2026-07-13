import express from 'express';
import { requireAuth } from '../middleware/auth.js';
import { ActivityLog } from '../models/ActivityLog.js';
import { Invitation } from '../models/Invitation.js';

const router = express.Router();

router.use(requireAuth);

async function checkWorkspaceAccess(req, res, next) {
  try {
    const targetUserId = req.query.userId || req.body.userId;

    if (targetUserId && targetUserId !== req.user._id.toString()) {
      const invitation = await Invitation.findOne({
        sender: targetUserId,
        inviteeEmail: req.user.email.toLowerCase(),
        status: 'accepted',
      });

      if (!invitation) {
        return res.status(403).json({ message: 'Access to this workspace is unauthorized' });
      }

      req.workspaceOwnerId = invitation.sender;
      req.workspaceRole = invitation.role;
    } else {
      req.workspaceOwnerId = req.user._id;
      req.workspaceRole = 'owner';
    }

    return next();
  } catch (error) {
    return next(error);
  }
}

router.get('/', checkWorkspaceAccess, async (req, res, next) => {
  try {
    const activities = await ActivityLog.find({ user: req.workspaceOwnerId }).sort({ createdAt: -1 }).limit(50);
    return res.json({ activities });
  } catch (error) {
    return next(error);
  }
});

export default router;
