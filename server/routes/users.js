/* ============================================================
   REVERS Messenger 2.0 — REST /api/users
   ============================================================ */

import { Router } from 'express';
import { requireAuth } from '../auth.js';
import { findUserByUsername, updateUser } from '../db.js';
import { isOnline, broadcastProfileUpdate } from '../ws.js';

const router = Router();

/* ------------------------------------------------------------
   GET /api/users/me
   Свой профиль. Должно быть ДО /:username.
   ------------------------------------------------------------ */

router.get('/me', requireAuth, async (req, res) => {
  try {
    const user = await findUserByUsername(req.username);

    if (!user) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }

    res.json({
      username: user.username,
      displayName: user.display_name || '',
      avatarEmoji: user.avatar_emoji || '🙂',
      bio: user.bio || '',
      online: true,
      createdAt: user.created_at
    });
  } catch (e) {
    console.error('[users/me GET]', e);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

/* ------------------------------------------------------------
   PATCH /api/users/me
   Обновить свой профиль.
   Body: { displayName?, avatarEmoji?, bio? }
   ------------------------------------------------------------ */

router.patch('/me', requireAuth, async (req, res) => {
  try {
    const body = req.body || {};
    const fields = {};

    if (body.displayName !== undefined) {
      fields.display_name = String(body.displayName).trim().slice(0, 40);
    }

    if (body.avatarEmoji !== undefined) {
      const v = String(body.avatarEmoji).trim();
      if (v.length > 0 && v.length <= 8) {
        fields.avatar_emoji = v;
      } else {
        return res.status(400).json({ error: 'Некорректный эмодзи' });
      }
    }

    if (body.bio !== undefined) {
      fields.bio = String(body.bio).trim().slice(0, 200);
    }

    const updated = await updateUser(req.username, fields);
    if (!updated) {
      return res.status(400).json({ error: 'Нет полей для обновления' });
    }

    // Рассылаем всем онлайн-пользователям обновление профиля
    broadcastProfileUpdate(req.username, updated);

    res.json({
      username: updated.username,
      displayName: updated.display_name || '',
      avatarEmoji: updated.avatar_emoji || '🙂',
      bio: updated.bio || '',
      online: true,
      createdAt: updated.created_at
    });
  } catch (e) {
    console.error('[users/me PATCH]', e);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

/* ------------------------------------------------------------
   GET /api/users/:username
   Публичный профиль другого пользователя.
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
      displayName: user.display_name || '',
      avatarEmoji: user.avatar_emoji || '🙂',
      bio: user.bio || '',
      online: isOnline(user.username),
      createdAt: user.created_at
    });
  } catch (e) {
    console.error('[users/:username GET]', e);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

export default router;
