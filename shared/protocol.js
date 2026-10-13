/* ============================================================
   REVERS Messenger 2.0 — протокол WebSocket
   Общий файл для клиента и сервера.
   ============================================================ */

/* ------------------------------------------------------------
   Типы сообщений
   ------------------------------------------------------------ */

export const WS_TYPES = {
  // Клиент → сервер
  AUTH:        'auth',
  MESSAGE:     'message',
  TYPING:      'typing',
  READ:        'read',
  PING:        'ping',

  // Сервер → клиент
  READY:       'ready',
  NEW_MESSAGE: 'new_message',
  DELIVERED:   'delivered',
  READ_ACK:    'read_ack',
  TYPING_ACK:  'typing_ack',
  PRESENCE:    'presence',
  PONG:        'pong',
  ERROR:       'error'
};

/* ------------------------------------------------------------
   Валидация
   ------------------------------------------------------------ */

const USERNAME_RE = /^[a-z0-9_]{3,32}$/;

export function isValidUsername(username) {
  return typeof username === 'string' && USERNAME_RE.test(username);
}

export function isValidPassword(password) {
  return typeof password === 'string'
    && password.length >= 6
    && password.length <= 128;
}

export function isValidMessage(text) {
  return typeof text === 'string'
    && text.trim().length > 0
    && text.length <= 4000;
}

/* ------------------------------------------------------------
   Хелперы для сообщений
   ------------------------------------------------------------ */

export function pack(type, data = {}) {
  return JSON.stringify({ type, ...data });
}

export function unpack(raw) {
  try {
    const obj = JSON.parse(raw);
    if (!obj || typeof obj !== 'object' || typeof obj.type !== 'string') {
      return null;
    }
    return obj;
  } catch (e) {
    return null;
  }
}

/* ------------------------------------------------------------
   Константы
   ------------------------------------------------------------ */

export const LIMITS = {
  MESSAGE_MAX_LENGTH: 4000,
  USERNAME_MIN_LENGTH: 3,
  USERNAME_MAX_LENGTH: 32,
  PASSWORD_MIN_LENGTH: 6,
  PASSWORD_MAX_LENGTH: 128,
  HISTORY_PAGE_SIZE: 200
};
