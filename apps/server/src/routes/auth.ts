import { Router } from 'express';
import { z } from 'zod';

import { loginWithPassword, registerUser } from '../auth/appAuth.js';
import { db } from '../db/client.js';

export const authRouter = Router();

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1),
});

authRouter.post('/api/auth/register', async (req, res, next) => {
  try {
    const input = registerSchema.parse(req.body);
    const result = await registerUser(db, input);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

authRouter.post('/api/auth/login', async (req, res, next) => {
  try {
    const input = loginSchema.parse(req.body);
    const result = await loginWithPassword(db, input.email, input.password);
    res.json(result);
  } catch (err) {
    next(err);
  }
});
