/* ============================================================
   REVERS Messenger 2.0 — WebSocket-сервер
   ============================================================ */

import { WebSocketServer } from 'ws';
import { verifyToken } from './auth.js';
import {
  saveMessage,
  markDelivered,
  markRead,
  getPendingMessages,
  getMessageById,
  editMessage,
  softDeleteMessage,
  addOrUpdateReaction,
  removeReaction,
  pinMessage,
  unpinMessage,
  getPinned
} from './db.js';
import {
  WS_TYPES,
  isValidMessage,
  unpack
} from '../shared/protocol.js';

/* ------------------------------------------------------------
   Активные соединения: Map<username, Set<WebSocket>>
   ------------------------------------------------------------ */

const clients = new Map();

/* ============================================================
   Настройка WebSocket-сервера
   ============================================================ */

export function setupWebSocket(httpServer) {
  const wss = new WebSocketServer({
    server: httpServer,
    path: '/ws'
  });

  wss.on('connection', (ws, req) => {
    handleConnection(ws, req);
  });

  const pingInterval = setInterval(() => {
    wss.clients.forEach((ws) => {
      if (ws.isAlive === false) {
        ws.terminate();
        return;
      }
      ws.isAlive = false;
      try { ws.ping(); } catch (e) {}
    });
  }, 30000);

  wss.on('close', () => clearInterval(pingInterval));

  return wss;
}

/* ============================================================
   Обработка соединения
   ============================================================ */

async function handleConnection(ws, req) {
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });

  let username = null;
  try {
    const url = new URL(req.url, 'http://localhost');
    const token = url.searchParams.get('token');
    const payload = token ? verifyToken(token) : null;
    if (payload && payload.username) username = payload.username;
  } catch (e) { username = null; }

  if (!username) {
    safeSend(ws, { type: WS_TYPES.ERROR, message: 'Unauthorized' });
    ws.close();
    return;
  }

  ws.username = username;

  if (!clients.has(username)) clients.set(username, new Set());
  clients.get(username).add(ws);

  console.log(`🔌 ${username} подключён. Всего онлайн: ${clients.size}`);

  safeSend(ws, { type: WS_TYPES.READY, username });

  await flushPending(ws, username);
  broadcastPresence(username, true);

  ws.on('message', async (raw) => {
    const msg = unpack(raw.toString());
    if (!msg) return;

    try {
      switch (msg.type) {
        case WS_TYPES.MESSAGE:  await handleMessage(ws, msg);  break;
        case WS_TYPES.TYPING:   handleTyping(ws, msg);         break;
        case WS_TYPES.READ:     await handleRead(ws, msg);     break;
        case 'edit':            await handleEdit(ws, msg);     break;
        case 'delete':          await handleDelete(ws, msg);   break;
        case 'reaction':        await handleReaction(ws, msg); break;
        case 'pin':             await handlePin(ws, msg);      break;
        case 'unpin':           await handleUnpin(ws, msg);    break;
        case WS_TYPES.PING:     safeSend(ws, { type: WS_TYPES.PONG }); break;
        default:
          safeSend(ws, { type: WS_TYPES.ERROR, message: 'Неизвестный тип' });
      }
    } catch (e) {
      console.error('[ws] handler error:', e);
      safeSend(ws, { type: WS_TYPES.ERROR, message: e.message || 'Ошибка' });
    }
  });

  ws.on('close', () => {
    const set = clients.get(username);
    if (set) {
      set.delete(ws);
      if (set.size === 0) {
        clients.delete(username);
        broadcastPresence(username, false);
      }
    }
    console.log(`🔌 ${username} отключён. Всего онлайн: ${clients.size}`);
  });

  ws.on('error', (err) => {
    console.error(`[ws] ${username} ошибка:`, err.message);
  });
}

/* ============================================================
   Message
   ============================================================ */

async function handleMessage(ws, msg) {
  const from = ws.username;
  const to = String(msg.to || '').toLowerCase().trim();
  const text = String(msg.text || '');
  const replyToId = msg.replyToId ? Number(msg.replyToId) : null;

  if (!to) return safeSend(ws, { type: WS_TYPES.ERROR, message: 'Не указан получатель' });
  if (to === from) return safeSend(ws, { type: WS_TYPES.ERROR, message: 'Нельзя писать себе' });
  if (!isValidMessage(text)) return safeSend(ws, { type: WS_TYPES.ERROR, message: 'Неверный текст' });

  const { id, ts } = await saveMessage(from, to, text, replyToId);

  // Получаем полную запись, чтобы вернуть reply данные
  const full = await getMessageById(id);

  const payload = {
    type: WS_TYPES.NEW_MESSAGE,
    id,
    from,
    to,
    text,
    ts,
    status: 'sent',
    replyToId,
    replyText: null
  };

  // Если это ответ — подгружаем текст цитируемого сообщения
  if (replyToId) {
    const replied = await getMessageById(replyToId);
    if (replied) {
      payload.replyText = replied.deleted ? '[сообщение удалено]' : replied.text;
      payload.replyFrom = replied.from;
    }
  }

  const sockets = clients.get(to);
  let delivered = false;

  if (sockets && sockets.size > 0) {
    for (const sock of sockets) {
      if (sock.readyState === 1) {
        sock.send(JSON.stringify(payload));
        delivered = true;
      }
    }
    if (delivered) await markDelivered([id]);
  }

  safeSend(ws, {
    type: WS_TYPES.DELIVERED,
    id,
    status: delivered ? 'delivered' : 'sent',
    ts
  });
}

/* ============================================================
   Typing
   ============================================================ */

function handleTyping(ws, msg) {
  const from = ws.username;
  const to = String(msg.to || '').toLowerCase().trim();
  if (!to) return;

  const sockets = clients.get(to);
  if (!sockets) return;

  const payload = JSON.stringify({
    type: WS_TYPES.TYPING,
    from,
    typing: Boolean(msg.typing)
  });

  for (const sock of sockets) {
    if (sock.readyState === 1) sock.send(payload);
  }
}

/* ============================================================
   Read
   ============================================================ */

async function handleRead(ws, msg) {
  const from = ws.username;
  const peer = String(msg.peer || '').toLowerCase().trim();
  if (!peer) return;

  await markRead(peer, from);

  const sockets = clients.get(peer);
  if (sockets) {
    const payload = JSON.stringify({
      type: WS_TYPES.READ_ACK,
      from,
      peer
    });
    for (const sock of sockets) {
      if (sock.readyState === 1) sock.send(payload);
    }
  }
}

/* ============================================================
   Edit
   ============================================================ */

async function handleEdit(ws, msg) {
  const from = ws.username;
  const id = Number(msg.id);
  const text = String(msg.text || '');

  if (!id || !isValidMessage(text)) {
    return safeSend(ws, { type: WS_TYPES.ERROR, message: 'Неверные данные' });
  }

  const original = await getMessageById(id);
  if (!original) return safeSend(ws, { type: WS_TYPES.ERROR, message: 'Сообщение не найдено' });
  if (original.from !== from) return safeSend(ws, { type: WS_TYPES.ERROR, message: 'Не ваше сообщение' });
  if (original.deleted) return safeSend(ws, { type: WS_TYPES.ERROR, message: 'Сообщение удалено' });

  const updated = await editMessage(id, from, text);

  const payload = {
    type: 'message_edited',
    id,
    from: updated.from,
    to: updated.to,
    text: updated.text,
    editedAt: updated.edited_at,
    ts: updated.ts
  };

  sendToBoth(updated.from, updated.to, payload);
}

/* ============================================================
   Delete
   ============================================================ */

async function handleDelete(ws, msg) {
  const from = ws.username;
  const id = Number(msg.id);
  const forAll = Boolean(msg.forAll);

  if (!id) return safeSend(ws, { type: WS_TYPES.ERROR, message: 'Неверные данные' });

  const original = await getMessageById(id);
  if (!original) return safeSend(ws, { type: WS_TYPES.ERROR, message: 'Сообщение не найдено' });
  if (original.from !== from) return safeSend(ws, { type: WS_TYPES.ERROR, message: 'Не ваше сообщение' });

  await softDeleteMessage(id, from);

  const payload = {
    type: 'message_deleted',
    id,
    from: original.from,
    to: original.to,
    forAll
  };

  sendToBoth(original.from, original.to, payload);
}

/* ============================================================
   Reaction
   ============================================================ */

async function handleReaction(ws, msg) {
  const from = ws.username;
  const id = Number(msg.id);
  const emoji = String(msg.emoji || '').trim();
  const remove = Boolean(msg.remove);

  if (!id) return safeSend(ws, { type: WS_TYPES.ERROR, message: 'Неверные данные' });

  const original = await getMessageById(id);
  if (!original) return safeSend(ws, { type: WS_TYPES.ERROR, message: 'Сообщение не найдено' });

  if (remove) {
    await removeReaction(id, from);
  } else {
    if (!emoji || emoji.length > 8) {
      return safeSend(ws, { type: WS_TYPES.ERROR, message: 'Неверный эмодзи' });
    }
    await addOrUpdateReaction(id, from, emoji);
  }

  const payload = {
    type: remove ? 'reaction_removed' : 'reaction_added',
    id,
    from,
    emoji: remove ? null : emoji,
    to: original.from === from ? original.to : original.from
  };

  sendToBoth(original.from, original.to, payload);
}

/* ============================================================
   Pin / Unpin
   ============================================================ */

async function handlePin(ws, msg) {
  const from = ws.username;
  const id = Number(msg.id);
  if (!id) return safeSend(ws, { type: WS_TYPES.ERROR, message: 'Неверные данные' });

  const original = await getMessageById(id);
  if (!original) return safeSend(ws, { type: WS_TYPES.ERROR, message: 'Сообщение не найдено' });

  const peer = original.from === from ? original.to : original.from;
  const chatId = [from, peer].sort().join('__');

  await pinMessage(chatId, id, from);

  const payload = {
    type: 'message_pinned',
    chatId,
    id,
    from: original.from,
    text: original.text,
    pinnedBy: from,
    ts: original.ts
  };

  sendToBoth(from, peer, payload);
}

async function handleUnpin(ws, msg) {
  const from = ws.username;
  const peer = String(msg.peer || '').toLowerCase().trim();
  if (!peer) return safeSend(ws, { type: WS_TYPES.ERROR, message: 'Не указан чат' });

  const chatId = [from, peer].sort().join('__');
  await unpinMessage(chatId);

  const payload = {
    type: 'message_unpinned',
    chatId
  };

  sendToBoth(from, peer, payload);
}

/* ============================================================
   Утилиты
   ============================================================ */

function sendToBoth(userA, userB, obj) {
  const payload = JSON.stringify(obj);

  const setA = clients.get(userA);
  if (setA) {
    for (const sock of setA) {
      if (sock.readyState === 1) sock.send(payload);
    }
  }

  const setB = clients.get(userB);
  if (setB) {
    for (const sock of setB) {
      if (sock.readyState === 1) sock.send(payload);
    }
  }
}

async function flushPending(ws, username) {
  try {
    const pending = await getPendingMessages(username);
    if (!pending.length) return;

    const ids = [];

    for (const row of pending) {
      safeSend(ws, {
        type: WS_TYPES.NEW_MESSAGE,
        id: row.id,
        from: row.from,
        to: row.to,
        text: row.text,
        ts: row.ts,
        status: 'sent',
        replyToId: row.reply_to_id || null,
        editedAt: row.edited_at || null,
        deleted: row.deleted || 0
      });
      ids.push(row.id);
    }

    if (ids.length) {
      await markDelivered(ids);
      console.log(`📩 Доставлено ${ids.length} накопившихся для ${username}`);
    }
  } catch (e) {
    console.error('[ws] flushPending error:', e);
  }
}

function broadcastPresence(username, online) {
  const payload = JSON.stringify({
    type: WS_TYPES.PRESENCE,
    from: username,
    online
  });

  for (const [otherUser, sockets] of clients) {
    if (otherUser === username) continue;
    for (const sock of sockets) {
      if (sock.readyState === 1) sock.send(payload);
    }
  }
}

/* ============================================================
   Публичные функции
   ============================================================ */

export function broadcastProfileUpdate(username, profile) {
  const payload = JSON.stringify({
    type: 'profile_update',
    username,
    displayName: profile.display_name || '',
    avatarEmoji: profile.avatar_emoji || '🙂',
    bio: profile.bio || ''
  });

  for (const [otherUser, sockets] of clients) {
    if (otherUser === username) continue;
    for (const sock of sockets) {
      if (sock.readyState === 1) sock.send(payload);
    }
  }
}

function safeSend(ws, obj) {
  try {
    if (ws.readyState === 1) ws.send(JSON.stringify(obj));
  } catch (e) {}
}

export function isOnline(username) {
  const set = clients.get(username);
  return Boolean(set && set.size > 0);
}

export function getOnlineUsers() {
  return Array.from(clients.keys());
       }
