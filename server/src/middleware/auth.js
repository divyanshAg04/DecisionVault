import jwt from 'jsonwebtoken';
import { User } from '../models/User.js';

export async function requireAuth(req, res, next) {
  try {
    let token = null;

    if (req.cookies && req.cookies.token) {
      token = req.cookies.token;
    }

    if (!token) {
      const header = req.headers.authorization || '';
      token = header.startsWith('Bearer ') ? header.slice(7) : null;
    }

    if (!token) {
      return res.status(401).json({ message: 'Authentication token is required' });
    }

    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(payload.userId).select('-passwordHash');

    if (!user) {
      return res.status(401).json({ message: 'User no longer exists' });
    }

    req.user = user;
    return next();
  } catch (error) {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
}

export function requireVerifiedEmail(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ message: 'Authentication is required' });
  }
  if (!req.user.emailVerified) {
    return res.status(403).json({ message: 'Email verification is required to perform this action' });
  }
  return next();
}

