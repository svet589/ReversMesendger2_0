/* ============================================================
   REVERS Messenger 2.0 — REST /api/users
   ============================================================ */

import { Router } from 'express';
import { requireAuth } from '../auth.js';
import { findUserByUsername } from '../db.js';
import { isOnline } from '../ws.js';

const router = Router();

/* ------------------------------------------------------------
   GET /api/users/:username
   Информация о пользователе + статус онлайн
   ------------------------------------------------------------ */

router.get('/:username', requireAuth, async (req, res) => {
  try {
    const username = String(req.params.username || '').toLowerCase().trim();

    if (!username) {
      return res.status(400).json({ error: 'Не указано имя' });
    }

    const user = await findUserByUsername(username);

    if (!user) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }

    res.json({
      username: user.username,
      online: isOnline(user.username),
      createdAt: user.created_at
    });
  } catch (e) {
    console.error('[users/:username]', e);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

/* ------------------------------------------------------------
   GET /api/users/me
   Свой профиль (по токену)
   ------------------------------------------------------------ */

router.get('/me', requireAuth, async (req, res) => {
  try {
    const user = await findUserByUsername(req.username);

    if (!user) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }

    res.json({
      username: user.username,
      online: true,
      createdAt: user.created_at
    });
  } catch (e) {
    console.error('[users/me]', e);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

export default router;
