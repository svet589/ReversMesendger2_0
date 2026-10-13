# REVERS Messenger 2.0

Минимальный мессенджер для приватной переписки. Личные чаты, текст.
Клиент-серверная архитектура: Node.js + WebSocket + Turso.

## Стек

- **Клиент** — HTML + CSS + JS, без сборщиков
- **Сервер** — Node.js + Express + ws
- **БД** — Turso (распределённый SQLite)
- **Хостинг** — Render (бэкенд)
- **APK** — Capacitor + GitHub Actions

## Быстрый старт (локально)

```bash
git clone https://github.com/USERNAME/ReversMessenger2_0.git
cd ReversMessenger2_0
npm install
cp .env.example .env
# заполнить .env (TURSO_URL, TURSO_TOKEN, JWT_SECRET)
npm run init-db
npm run dev
