/* ============================================================
   REVERS Messenger 2.0 — REST /api/auth
   ============================================================ */

import { Router } from 'express';
import { register, login } from '../auth.js';
import { isValidUsername, isValidPassword } from '../../shared/protocol.js';

const router = Router();

/* ------------------------------------------------------------
   POST /api/auth/register
   Body: { username, password }
   ------------------------------------------------------------ */

router.post('/register', async (req, res) => {
  try {
    const { username, password } = req.body || {};

    if (typeof username !== 'string' || typeof password !== 'string') {
      return res.status(400).json({ error: 'Нужны username и password' });
    }

    const normalized = username.toLowerCase().trim();

    if (!isValidUsername(normalized)) {
      return res.status(400).json({
        error: 'Имя: 3–32 символа, только a–z, 0–9, _'
      });
    }
    if (!isValidPassword(password)) {
      return res.status(400).json({
        error: 'Пароль: от 6 до 128 символов'
      });
    }

    const result = await register(normalized, password);
    res.json(result);
  } catch (e) {
    res.status(400).json({ error: e.message || 'Ошибка регистрации' });
  }
});

/* ------------------------------------------------------------
   POST /api/auth/login
   Body: { username, password }
   ------------------------------------------------------------ */

router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body || {};

    if (typeof username !== 'string' || typeof password !== 'string') {
      return res.status(400).json({ error: 'Нужны username и password' });
    }

    const normalized = username.toLowerCase().trim();
    const result = await login(normalized, password);
    res.json(result);
  } catch (e) {
    res.status(401).json({ error: e.message || 'Ошибка входа' });
  }
});

export default router;
