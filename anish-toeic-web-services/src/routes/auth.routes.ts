import { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';

const router = Router();

router.post('/login', (req: Request, res: Response) => {
  const { email, password } = req.body;
  
  if (!email || !password) {
    return res.status(400).json({ error: 'Thiếu email hoặc mật khẩu' });
  }

  // Simulate validation - accept any email/password for testing since there's no users table
  const userId = `user_${Date.now()}`;
  
  const token = jwt.sign(
    { userId, email },
    process.env.JWT_SECRET || 'fallback_secret',
    { expiresIn: '7d' }
  );

  return res.json({
    message: 'Đăng nhập thành công',
    token,
    user: { id: userId, email }
  });
});

export default router;
