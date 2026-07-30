import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { z } from 'zod';

const authHeaderSchema = z.string().regex(/^Bearer\s+(.+)$/, 'Invalid Authorization header format');

export const requireAuth = (req: Request, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: 'Unauthorized: Missing Authorization header' });
    }

    const token = authHeaderSchema.parse(authHeader).split(' ')[1];
    
    // Decoding token
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback_secret') as { userId?: string, id?: string, sub?: string };
    
    const userId = decoded.userId || decoded.id || decoded.sub;
    if (!userId) {
       return res.status(401).json({ error: 'Unauthorized: Invalid token payload' });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (req as any).user = { id: userId };
    next();
  } catch (err: unknown) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const error = err as any;
    if (error.name === 'ZodError') {
      return res.status(401).json({ error: 'Unauthorized: Invalid Authorization header format' });
    }
    return res.status(401).json({ error: 'Unauthorized: Invalid or expired token' });
  }
};
