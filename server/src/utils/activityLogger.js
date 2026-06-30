import { ActivityLog } from '../models/ActivityLog.js';

export async function logActivity(userId, action, details) {
  try {
    await ActivityLog.create({
      user: userId,
      action,
      details,
    });
  } catch (error) {
    console.error('Failed to write activity log:', error);
  }
}
