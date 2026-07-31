import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

const JWT_SECRET_MIN_LENGTH = 32;

// Adaptable auth: accepts a Bearer token (Authorization header) or an httpOnly
// session cookie named `token`. No x-user-id header, no mock/fallback secret.
export const requireAuth = (req: Request, res: Response, next: NextFunction) => {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < JWT_SECRET_MIN_LENGTH) {
    return res.status(500).json({ error: 'Server configuration error: JWT_SECRET is missing or too short' });
  }

  const token = extractToken(req);
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized: Missing token' });
  }

  try {
    const decoded = jwt.verify(token, secret);
    if (typeof decoded === 'string' || typeof decoded.sub !== 'string' || decoded.sub.length === 0) {
      return res.status(401).json({ error: 'Unauthorized: Invalid token payload' });
    }
    req.user = { id: decoded.sub };
    next();
  } catch {
    return res.status(401).json({ error: 'Unauthorized: Invalid or expired token' });
  }
};

function extractToken(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice('Bearer '.length).trim();
    if (token.length > 0) return token;
  }
  const cookies = (req as Request & { cookies?: Record<string, string> }).cookies;
  const cookieToken = cookies && cookies.token;
  return cookieToken && cookieToken.length > 0 ? cookieToken : null;
}
