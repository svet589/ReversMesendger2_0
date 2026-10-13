/* ============================================================
   REVERS Messenger 2.0 — WebSocket-сервер
   ============================================================ */

import { WebSocketServer } from 'ws';
import { verifyToken } from './auth.js';
import {
  saveMessage,
  markDelivered,
  markRead,
  getPendingMessages
} from './db.js';
import {
  WS_TYPES,
  isValidMessage,
  pack,
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

  // Периодический ping для keep-alive
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
   Обработка одного соединения
   ============================================================ */

async function handleConnection(ws, req) {
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });

  // --- Аутентификация по токену из query ---
  let username = null;
  try {
    const url = new URL(req.url, 'http://localhost');
    const token = url.searchParams.get('token');
    const payload = token ? verifyToken(token) : null;
    if (payload && payload.username) {
      username = payload.username;
    }
  } catch (e) {
    username = null;
  }

  if (!username) {
    safeSend(ws, { type: WS_TYPES.ERROR, message: 'Unauthorized' });
    ws.close();
    return;
  }

  ws.username = username;

  // --- Регистрируем клиента ---
  if (!clients.has(username)) {
    clients.set(username, new Set());
  }
  clients.get(username).add(ws);

  console.log(`🔌 ${username} подключён. Всего онлайн: ${clients.size}`);

  // --- Приветствие ---
  safeSend(ws, { type: WS_TYPES.READY, username });

  // --- Доставляем накопившиеся сообщения ---
  await flushPending(ws, username);

  // --- Сообщаем остальным о появлении ---
  broadcastPresence(username, true);

  // --- Обработка входящих сообщений ---
  ws.on('message', async (raw) => {
    const msg = unpack(raw.toString());
    if (!msg) return;

    try {
      switch (msg.type) {
        case WS_TYPES.MESSAGE:
          await handleMessage(ws, msg);
          break;

        case WS_TYPES.TYPING:
          handleTyping(ws, msg);
          break;

        case WS_TYPES.READ:
          await handleRead(ws, msg);
          break;

        case WS_TYPES.PING:
          safeSend(ws, { type: WS_TYPES.PONG });
          break;

        default:
          safeSend(ws, {
            type: WS_TYPES.ERROR,
            message: 'Неизвестный тип сообщения'
          });
      }
    } catch (e) {
      console.error('[ws] handler error:', e);
      safeSend(ws, {
        type: WS_TYPES.ERROR,
        message: e.message || 'Ошибка сервера'
      });
    }
  });

  // --- Отключение ---
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
   Обработчики типов сообщений
   ============================================================ */

async function handleMessage(ws, msg) {
  const from = ws.username;
  const to = String(msg.to || '').toLowerCase().trim();
  const text = String(msg.text || '');

  if (!to) {
    return safeSend(ws, { type: WS_TYPES.ERROR, message: 'Не указан получатель' });
  }
  if (to === from) {
    return safeSend(ws, { type: WS_TYPES.ERROR, message: 'Нельзя писать себе' });
  }
  if (!isValidMessage(text)) {
    return safeSend(ws, { type: WS_TYPES.ERROR, message: 'Неверный текст сообщения' });
  }

  // Сохраняем в БД
  const { id, ts } = await saveMessage(from, to, text);

  const payload = {
    type: WS_TYPES.NEW_MESSAGE,
    id,
    from,
    to,
    text,
    ts,
    status: 'sent'
  };

  // Пытаемся доставить получателю
  const sockets = clients.get(to);
  let delivered = false;

  if (sockets && sockets.size > 0) {
    for (const sock of sockets) {
      if (sock.readyState === 1) {
        sock.send(JSON.stringify(payload));
        delivered = true;
      }
    }
    if (delivered) {
      await markDelivered([id]);
    }
  }

  // Отправителю — подтверждение
  safeSend(ws, {
    type: WS_TYPES.DELIVERED,
    id,
    status: delivered ? 'delivered' : 'sent',
    ts
  });
}

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
    if (sock.readyState === 1) {
      sock.send(payload);
    }
  }
}

async function handleRead(ws, msg) {
  const from = ws.username;
  const peer = String(msg.peer || '').toLowerCase().trim();
  if (!peer) return;

  await markRead(peer, from);

  const sockets = clients.get(peer);
  if (sockets) {
    const payload = JSON.stringify({
      type: WS_TYPES.READ_ACK,
      by: from
    });
    for (const sock of sockets) {
      if (sock.readyState === 1) sock.send(payload);
    }
  }
}

/* ============================================================
   Доставка непрочитанных
   ============================================================ */

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
        status: 'sent'
      });
      ids.push(row.id);
    }

    if (ids.length) {
      await markDelivered(ids);
      console.log(`📬 Доставлено ${ids.length} накопившихся сообщений для ${username}`);
    }
  } catch (e) {
    console.error('[ws] flushPending error:', e);
  }
}

/* ============================================================
   Presence
   ============================================================ */

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
   Утилиты
   ============================================================ */

function safeSend(ws, obj) {
  try {
    if (ws.readyState === 1) {
      ws.send(JSON.stringify(obj));
    }
  } catch (e) {
    // ignore
  }
}

/* ============================================================
   Публичное API
   ============================================================ */

export function isOnline(username) {
  const set = clients.get(username);
  return Boolean(set && set.size > 0);
}

export function getOnlineUsers() {
  return Array.from(clients.keys());
}
