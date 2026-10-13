/* ============================================================
   REVERS Messenger 2.0 — REST /api/chats
   ============================================================ */

import { Router } from 'express';
import { requireAuth } from '../auth.js';
import {
  createChat,
  getChatsForUser,
  deleteChat,
  getLastMessage,
  userExists
} from '../db.js';
import { isOnline } from '../ws.js';

const router = Router();

/* ------------------------------------------------------------
   GET /api/chats
   ------------------------------------------------------------ */

router.get('/', requireAuth, async (req, res) => {
  try {
    const me = req.username;
    const rows = await getChatsForUser(me);

    const chats = [];

    for (const row of rows) {
      const peer = row.user_a === me ? row.user_b : row.user_a;

      const exists = await userExists(peer);
      if (!exists) continue;

      const last = await getLastMessage(me, peer);

      chats.push({
        id: peer,
        name: peer,
        chatId: row.id,
        online: isOnline(peer),
        lastTs: last ? last.ts : row.created_at,
        lastText: last ? last.text : '',
        lastFrom: last ? last.from : null,
        lastStatus: last ? last.status : null
      });
    }

    chats.sort((a, b) => (b.lastTs || 0) - (a.lastTs || 0));

    res.json(chats);
  } catch (e) {
    console.error('[chats GET]', e);
    res.status(500).json({ error: 'Ошибка загрузки чатов' });
  }
});

/* ------------------------------------------------------------
   POST /api/chats
   Body: { peer: 'bob' }
   ------------------------------------------------------------ */

router.post('/', requireAuth, async (req, res) => {
  try {
    const me = req.username;
    const peer = String((req.body && req.body.peer) || '').toLowerCase().trim();

    if (!peer) {
      return res.status(400).json({ error: 'Не указан собеседник' });
    }
    if (peer === me) {
      return res.status(400).json({ error: 'Нельзя создать чат с собой' });
    }

    const exists = await userExists(peer);
    if (!exists) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }

    const chat = await createChat(me, peer);

    res.json({
      id: peer,
      name: peer,
      chatId: chat.id,
      online: isOnline(peer),
      lastTs: chat.created_at,
      lastText: '',
      created: true
    });
  } catch (e) {
    console.error('[chats POST]', e);
    res.status(500).json({ error: 'Ошибка создания чата' });
  }
});

/* ------------------------------------------------------------
   DELETE /api/chats/:peer
   ------------------------------------------------------------ */

router.delete('/:peer', requireAuth, async (req, res) => {
  try {
    const me = req.username;
    const peer = String(req.params.peer || '').toLowerCase().trim();

    if (!peer) {
      return res.status(400).json({ error: 'Не указан собеседник' });
    }

    await deleteChat(me, peer);

    res.json({ ok: true });
  } catch (e) {
    console.error('[chats DELETE]', e);
    res.status(500).json({ error: 'Ошибка удаления чата' });
  }
});

export default router;
