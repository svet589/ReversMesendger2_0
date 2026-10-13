/* ============================================================
   REVERS Messenger 2.0 — авторизация и JWT
   ============================================================ */

import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { findUserByUsername, createUser } from '../db.js';
import { isValidUsername, isValidPassword } from '../../shared/protocol.js';

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_TTL    = '30d';
const BCRYPT_ROUNDS = 10;

if (!JWT_SECRET) {
  console.error('❌ JWT_SECRET должен быть задан в .env');
  process.exit(1);
}

/* ============================================================
   Регистрация
   ============================================================ */

export async function register(username, password) {
  if (!isValidUsername(username)) {
    throw new Error('Имя: 3–32 символа, только a–z, 0–9, _');
  }
  if (!isValidPassword(password)) {
    throw new Error('Пароль: от 6 до 128 символов');
  }

  const existing = await findUserByUsername(username);
  if (existing) {
    throw new Error('Это имя уже занято');
  }

  const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  await createUser(username, hash);

  return issueToken(username);
}

/* ============================================================
   Логин
   ============================================================ */

export async function login(username, password) {
  const user = await findUserByUsername(username);
  if (!user) {
    throw new Error('Пользователь не найден');
  }

  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) {
    throw new Error('Неверный пароль');
  }

  return issueToken(username);
}

/* ============================================================
   JWT
   ============================================================ */

function issueToken(username) {
  const token = jwt.sign({ username }, JWT_SECRET, { expiresIn: JWT_TTL });
  return { username, token };
}

export function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (e) {
    return null;
  }
}

/* ============================================================
   Express middleware
   ============================================================ */

export function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : null;

  if (!token) {
    return res.status(401).json({ error: 'Требуется авторизация' });
  }

  const payload = verifyToken(token);
  if (!payload || !payload.username) {
    return res.status(401).json({ error: 'Недействительный токен' });
  }

  req.username = payload.username;
  next();
}
