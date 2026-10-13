/* ============================================================
   REVERS Messenger 2.0 — REST /api/messages
   ============================================================ */

import { Router } from 'express';
import { requireAuth } from '../auth.js';
import {
  getHistory,
  getLastMessage,
  userExists,
  findUserByUsername
} from '../db.js';
import { isOnline } from '../ws.js';
import { LIMITS } from '../../shared/protocol.js';

const router = Router();

/* ------------------------------------------------------------
   GET /api/messages/chats
   Список чатов с последним сообщением.
   ВАЖНО: этот роут теперь ДУБЛИРУЕТ /api/chats, оставлен для
   обратной совместимости со старым клиентом.
   ------------------------------------------------------------ */

router.get('/chats', requireAuth, async (req, res) => {
  try {
    const me = req.username;

    // Ищем все уникальные peer'ы из сообщений, где участвует me
    const { db } = await import('../db.js');
    const rows = await db.execute({
      sql: `
        SELECT
          CASE
            WHEN from_user = ? THEN to_user
            ELSE from_user
          END AS peer,
          MAX(created_at) AS last_ts
        FROM messages
        WHERE from_user = ? OR to_user = ?
        GROUP BY peer
        ORDER BY last_ts DESC
      `,
      args: [me, me, me]
    });

    const chats = [];

    for (const row of rows.rows) {
      const peer = row.peer;
      const user = await findUserByUsername(peer);

      if (!user) continue;

      const last = await getLastMessage(me, peer);

      chats.push({
        id: peer,
        name: peer,
        displayName: user.display_name || '',
        avatarEmoji: user.avatar_emoji || '🙂',
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
   История переписки с конкретным пользователем.
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
