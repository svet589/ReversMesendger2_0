/* ============================================================
   REVERS Messenger 2.0 — работа с Turso
   ============================================================ */

import { createClient } from '@libsql/client';
import dotenv from 'dotenv';

dotenv.config();

const url   = process.env.TURSO_URL;
const token = process.env.TURSO_TOKEN;

if (!url || !token) {
  console.error('❌ TURSO_URL и TURSO_TOKEN должны быть заданы в .env');
  process.exit(1);
}

export const db = createClient({ url, authToken: token });

/* ============================================================
   Схема
   ============================================================ */

export async function initSchema() {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS users (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      username      TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at    INTEGER NOT NULL
    );
  `);

  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_users_username
    ON users(username);
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS messages (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      from_user   TEXT NOT NULL,
      to_user     TEXT NOT NULL,
      text        TEXT NOT NULL,
      status      TEXT NOT NULL DEFAULT 'sent',
      created_at  INTEGER NOT NULL
    );
  `);

  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_messages_dialog
    ON messages(from_user, to_user, created_at);
  `);

  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_messages_to_user
    ON messages(to_user, status);
  `);

  console.log('✅ Схема БД готова');
}

/* ============================================================
   Пользователи
   ============================================================ */

export async function findUserByUsername(username) {
  const res = await db.execute({
    sql: 'SELECT * FROM users WHERE username = ? LIMIT 1',
    args: [username]
  });
  return res.rows[0] || null;
}

export async function createUser(username, passwordHash) {
  const res = await db.execute({
    sql: 'INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)',
    args: [username, passwordHash, Date.now()]
  });
  return Number(res.lastInsertRowid);
}

export async function userExists(username) {
  const res = await db.execute({
    sql: 'SELECT 1 FROM users WHERE username = ? LIMIT 1',
    args: [username]
  });
  return res.rows.length > 0;
}

/* ============================================================
   Сообщения
   ============================================================ */

export async function saveMessage(fromUser, toUser, text) {
  const ts = Date.now();
  const res = await db.execute({
    sql: `INSERT INTO messages (from_user, to_user, text, status, created_at)
          VALUES (?, ?, ?, 'sent', ?)`,
    args: [fromUser, toUser, text, ts]
  });
  return { id: Number(res.lastInsertRowid), ts };
}

export async function getHistory(userA, userB, limit = 200) {
  const res = await db.execute({
    sql: `
      SELECT
        id,
        from_user AS "from",
        to_user   AS "to",
        text,
        status,
        created_at AS ts
      FROM messages
      WHERE (from_user = ? AND to_user = ?)
         OR (from_user = ? AND to_user = ?)
      ORDER BY created_at ASC
      LIMIT ?
    `,
    args: [userA, userB, userB, userA, limit]
  });
  return res.rows;
}

export async function getChatsForUser(username) {
  const res = await db.execute({
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
    args: [username, username, username]
  });
  return res.rows;
}

export async function getLastMessage(userA, userB) {
  const res = await db.execute({
    sql: `
      SELECT
        id,
        from_user AS "from",
        to_user   AS "to",
        text,
        status,
        created_at AS ts
      FROM messages
      WHERE (from_user = ? AND to_user = ?)
         OR (from_user = ? AND to_user = ?)
      ORDER BY created_at DESC
      LIMIT 1
    `,
    args: [userA, userB, userB, userA]
  });
  return res.rows[0] || null;
}

/* ============================================================
   Статусы
   ============================================================ */

export async function markDelivered(ids) {
  if (!ids || ids.length === 0) return;
  const placeholders = ids.map(() => '?').join(',');
  await db.execute({
    sql: `UPDATE messages SET status = 'delivered' WHERE id IN (${placeholders})`,
    args: ids
  });
}

export async function markRead(fromUser, toUser) {
  await db.execute({
    sql: `UPDATE messages
          SET status = 'read'
          WHERE from_user = ? AND to_user = ? AND status != 'read'`,
    args: [fromUser, toUser]
  });
}

export async function getPendingMessages(toUser) {
  const res = await db.execute({
    sql: `SELECT
            id,
            from_user AS "from",
            to_user   AS "to",
            text,
            status,
            created_at AS ts
          FROM messages
          WHERE to_user = ? AND status = 'sent'
          ORDER BY created_at ASC`,
    args: [toUser]
  });
  return res.rows;
}
