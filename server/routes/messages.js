/* ============================================================
   REVERS Messenger 2.0 — REST /api/messages
   ============================================================ */

import { Router } from 'express';
import { requireAuth } from '../auth.js';
import {
  getHistory,
  getChatsForUser,
  getLastMessage,
  userExists
} from '../db.js';
import { isOnline } from '../ws.js';
import { LIMITS } from '../../shared/protocol.js';

const router = Router();

/* ------------------------------------------------------------
   GET /api/messages/chats
   Список чатов пользователя с последним сообщением
   ------------------------------------------------------------ */

router.get('/chats', requireAuth, async (req, res) => {
  try {
    const me = req.username;
    const rows = await getChatsForUser(me);

    const chats = [];

    for (const row of rows) {
      const peer = row.peer;
      const last = await getLastMessage(me, peer);
      const exists = await userExists(peer);

      if (!exists) continue;

      chats.push({
        id: peer,
        name: peer,
        online: isOnline(peer),
        lastTs: row.last_ts,
        lastText: last ? last.text : '',
        lastFrom: last ? last.from : null,
        lastStatus: last ? last.status : null
      });
    }

    res.json(chats);
  } catch (e) {
    console.error('[messages/chats]', e);
    res.status(500).json({ error: 'Ошибка загрузки чатов' });
  }
});

/* ------------------------------------------------------------
   GET /api/messages/:peer
   История переписки с конкретным пользователем
   ------------------------------------------------------------ */

router.get('/:peer', requireAuth, async (req, res) => {
  try {
    const me = req.username;
    const peer = String(req.params.peer || '').toLowerCase().trim();

    if (!peer) {
      return res.status(400).json({ error: 'Не указан собеседник' });
    }

    const exists = await userExists(peer);
    if (!exists) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }

    const limit = Math.min(
      Number(req.query.limit) || LIMITS.HISTORY_PAGE_SIZE,
      LIMITS.HISTORY_PAGE_SIZE
    );

    const history = await getHistory(me, peer, limit);

    res.json(history.map(m => ({
      id: m.id,
      from: m.from,
      to: m.to,
      text: m.text,
      ts: m.ts,
      status: m.status
    })));
  } catch (e) {
    console.error('[messages/:peer]', e);
    res.status(500).json({ error: 'Ошибка загрузки истории' });
  }
});

export default router;
