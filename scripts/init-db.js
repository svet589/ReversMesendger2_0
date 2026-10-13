/* ============================================================
   REVERS Messenger 2.0 — создание схемы Turso
   Запуск: npm run init-db
   ============================================================ */

import dotenv from 'dotenv';
import { initSchema } from '../server/db.js';

dotenv.config();

(async () => {
  console.log('');
  console.log('🗄️  Инициализация схемы REVERS');
  console.log('');

  try {
    const url = process.env.TURSO_URL;
    if (!url) {
      console.error('❌ TURSO_URL не задан в .env');
      process.exit(1);
    }

    // Маскируем токен в выводе, чтобы не светить в логах
    const maskedUrl = url.replace(/\/\/.*@/, '//***@');
    console.log(`   URL: ${maskedUrl}`);
    console.log('');

    await initSchema();

    console.log('');
    console.log('✅ Готово. Схема создана.');
    console.log('');
    process.exit(0);
  } catch (e) {
    console.error('');
    console.error('❌ Ошибка инициализации:');
    console.error('  ', e.message || e);
    console.error('');
    process.exit(1);
  }
})();
