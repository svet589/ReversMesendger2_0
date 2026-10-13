/* ============================================================
   REVERS Messenger 2.0 — точка входа
   ============================================================ */

import express from 'express';
import cors from 'cors';
import http from 'http';
import dotenv from 'dotenv';

import { initSchema, runMigrations } from './db.js';
import { setupWebSocket } from './ws.js';
import authRoutes from './routes/auth.js';
import messageRoutes from './routes/messages.js';
import userRoutes from './routes/users.js';
import chatRoutes from './routes/chats.js';

dotenv.config();

/* ------------------------------------------------------------
   Конфигурация
   ------------------------------------------------------------ */

const PORT = Number(process.env.PORT) || 3000;

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '*')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

/* ------------------------------------------------------------
   Express
   ------------------------------------------------------------ */

const app = express();

app.use(cors({
  origin(origin, cb) {
    if (!origin) return cb(null, true);
    if (ALLOWED_ORIGINS.includes('*')) return cb(null, true);
    if (ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
    cb(new Error('CORS: origin не разрешён'));
  },
  credentials: true
}));

app.use(express.json({ limit: '1mb' }));

/* ------------------------------------------------------------
   Health-check
   ------------------------------------------------------------ */

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    ts: Date.now(),
    uptime: Math.floor(process.uptime())
  });
});

/* ------------------------------------------------------------
   REST-роуты
   ------------------------------------------------------------ */

app.use('/api/auth', authRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/users', userRoutes);
app.use('/api/chats', chatRoutes);

/* ------------------------------------------------------------
   404
   ------------------------------------------------------------ */

app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

/* ------------------------------------------------------------
   Обработчик ошибок
   ------------------------------------------------------------ */

app.use((err, req, res, next) => {
  console.error('[server error]', err);
  res.status(err.status || 500).json({
    error: err.message || 'Ошибка сервера'
  });
});

/* ------------------------------------------------------------
   HTTP + WebSocket
   ------------------------------------------------------------ */

const server = http.createServer(app);

setupWebSocket(server);

/* ------------------------------------------------------------
   Старт
   ------------------------------------------------------------ */

(async () => {
  try {
    await initSchema();
    await runMigrations();

    server.listen(PORT, () => {
      console.log('');
      console.log('╔═══════════════════════════════════════════╗');
      console.log('║        REVERS MESSENGER 2.0               ║');
      console.log('╠═══════════════════════════════════════════╣');
      console.log(`║  HTTP:       http://localhost:${PORT}`);
      console.log(`║  WebSocket:  ws://localhost:${PORT}/ws`);
      console.log(`║  Health:     http://localhost:${PORT}/api/health`);
      console.log('╚═══════════════════════════════════════════╝');
      console.log('');
    });
  } catch (e) {
    console.error('❌ Ошибка запуска:', e);
    process.exit(1);
  }
})();

/* ------------------------------------------------------------
   Graceful shutdown
   ------------------------------------------------------------ */

function shutdown(signal) {
  console.log(`\n${signal} — завершаем работу`);
  server.close(() => {
    console.log('Сервер остановлен');
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 5000);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
});
