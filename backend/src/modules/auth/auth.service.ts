import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { config } from '../../config';
import prisma from '../../prisma';

export async function login(username: string, password: string) {
  const user = await prisma.user.findUnique({ where: { username } });
  if (!user || !user.active) throw Object.assign(new Error('Credenciales inválidas'), { status: 401 });

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) throw Object.assign(new Error('Credenciales inválidas'), { status: 401 });

  const token = jwt.sign(
    { id: user.id, username: user.username, role: user.role },
    config.jwtSecret,
    { expiresIn: config.jwtExpiresIn } as jwt.SignOptions
  );

  return {
    token,
    user: { id: user.id, username: user.username, name: user.name, role: user.role },
  };
}

export async function register(username: string, password: string, name: string, role = 'seller') {
  const exists = await prisma.user.findUnique({ where: { username } });
  if (exists) throw Object.assign(new Error('El usuario ya existe'), { status: 409 });

  const hashed = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: { username, password: hashed, name, role },
  });

  return { id: user.id, username: user.username, name: user.name, role: user.role };
}

export async function getProfile(userId: number) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, username: true, name: true, role: true, createdAt: true },
  });
  if (!user) throw Object.assign(new Error('Usuario no encontrado'), { status: 404 });
  return user;
}

export async function changePassword(userId: number, oldPassword: string, newPassword: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const valid = await bcrypt.compare(oldPassword, user.password);
  if (!valid) throw Object.assign(new Error('Contraseña actual incorrecta'), { status: 400 });
  const hashed = await bcrypt.hash(newPassword, 10);
  await prisma.user.update({ where: { id: userId }, data: { password: hashed } });
  return { message: 'Contraseña actualizada' };
}

export async function ensureDefaultAdmin() {
  const count = await prisma.user.count();
  if (count === 0) {
    const hashed = await bcrypt.hash('admin123', 10);
    await prisma.user.create({
      data: { username: 'admin', password: hashed, name: 'Administrador', role: 'admin' },
    });
    console.log('✅ Usuario admin creado (admin / admin123) — cambiá la contraseña');
  }
}
