import { Request, Response } from 'express';
import { z } from 'zod';
import * as authService from './auth.service';
import { AuthRequest } from '../../middleware/auth.middleware';

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

const registerSchema = z.object({
  username: z.string().min(3).max(50),
  password: z.string().min(6),
  name: z.string().min(1),
  role: z.enum(['admin', 'seller']).optional(),
});

export async function login(req: Request, res: Response) {
  const { username, password } = loginSchema.parse(req.body);
  const result = await authService.login(username, password);
  res.json(result);
}

export async function register(req: AuthRequest, res: Response) {
  const data = registerSchema.parse(req.body);
  const result = await authService.register(data.username, data.password, data.name, data.role);
  res.status(201).json(result);
}

export async function profile(req: AuthRequest, res: Response) {
  const user = await authService.getProfile(req.user!.id);
  res.json(user);
}

export async function changePassword(req: AuthRequest, res: Response) {
  const { oldPassword, newPassword } = z.object({
    oldPassword: z.string().min(1),
    newPassword: z.string().min(6),
  }).parse(req.body);
  const result = await authService.changePassword(req.user!.id, oldPassword, newPassword);
  res.json(result);
}
