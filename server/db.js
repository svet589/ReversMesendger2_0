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
  // --- Пользователи ---
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

  // --- Сообщения ---
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

  // --- Чаты ---
  await db.execute(`
    CREATE TABLE IF NOT EXISTS chats (
      id         TEXT PRIMARY KEY,
      user_a     TEXT NOT NULL,
      user_b     TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      created_by TEXT NOT NULL
    );
  `);

  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_chats_user_a
    ON chats(user_a);
  `);

  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_chats_user_b
    ON chats(user_b);
  `);

  console.log('✅ Схема БД готова');
}

/* ============================================================
   Миграции
   ============================================================ */

export async function runMigrations() {
  const migrations = [
    `ALTER TABLE users ADD COLUMN display_name TEXT`,
    `ALTER TABLE users ADD COLUMN avatar_emoji TEXT DEFAULT '🙂'`,
    `ALTER TABLE users ADD COLUMN bio TEXT DEFAULT ''`
  ];

  for (const sql of migrations) {
    try {
      await db.execute(sql);
      console.log(`   ✅ ${sql.slice(0, 60)}…`);
    } catch (e) {
      if (e.message && e.message.includes('duplicate column name')) {
        console.log(`   ⏭  уже есть: ${sql.slice(0, 60)}…`);
      } else {
        console.log(`   ❌ ${sql.slice(0, 60)}…`);
        console.log(`      ${e.message}`);
      }
    }
  }

  console.log('✅ Миграции применены');
}

/* ============================================================
   Пользователи
   ============================================================ */

export async function findUserByUsername(username) {
  const res = await db.execute({
    sql: `SELECT
            id, username, password_hash, created_at,
            display_name, avatar_emoji, bio
          FROM users WHERE username = ? LIMIT 1`,
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

export async function updateUser(username, fields) {
  const allowed = ['display_name', 'avatar_emoji', 'bio'];
  const updates = [];
  const args = [];

  for (const key of allowed) {
    if (fields[key] !== undefined) {
      updates.push(`${key} = ?`);
      args.push(fields[key]);
    }
  }

  if (updates.length === 0) return null;

  args.push(username);

  await db.execute({
    sql: `UPDATE users SET ${updates.join(', ')} WHERE username = ?`,
    args
  });

  return findUserByUsername(username);
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
   Чаты
   ============================================================ */

export function makeChatId(userA, userB) {
  const [a, b] = [userA, userB].sort();
  return `${a}__${b}`;
}

export async function createChat(userA, userB) {
  const id = makeChatId(userA, userB);
  const [a, b] = [userA, userB].sort();

  const existing = await db.execute({
    sql: 'SELECT * FROM chats WHERE id = ? LIMIT 1',
    args: [id]
  });

  if (existing.rows.length > 0) {
    return existing.rows[0];
  }

  const now = Date.now();
  await db.execute({
    sql: `INSERT INTO chats (id, user_a, user_b, created_at, created_by)
          VALUES (?, ?, ?, ?, ?)`,
    args: [id, a, b, now, userA]
  });

  return { id, user_a: a, user_b: b, created_at: now, created_by: userA };
}

export async function getChatsForUser(username) {
  const res = await db.execute({
    sql: `
      SELECT id, user_a, user_b, created_at
      FROM chats
      WHERE user_a = ? OR user_b = ?
      ORDER BY created_at DESC
    `,
    args: [username, username]
  });
  return res.rows;
}

export async function deleteChat(userA, userB) {
  const id = makeChatId(userA, userB);
  await db.execute({
    sql: 'DELETE FROM chats WHERE id = ?',
    args: [id]
  });
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
