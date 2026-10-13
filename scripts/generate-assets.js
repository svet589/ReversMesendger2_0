/* ============================================================
   REVERS Messenger 2.0 — генерация иконок и сплэша
   Запуск: npm run generate-assets
   ============================================================
   Скрипт берёт исходные картинки из assets/ и раскладывает их
   по всем нужным размерам Android через @capacitor/assets.
   ============================================================ */

import { existsSync, mkdirSync, copyFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT      = join(__dirname, '..');
const ASSETS    = join(ROOT, 'assets');

/* ------------------------------------------------------------
   Проверка исходников
   ------------------------------------------------------------ */

const required = [
  { file: 'icon.png',            size: '1024×1024', note: 'основная иконка' },
  { file: 'icon-foreground.png', size: '432×432',   note: 'передний план adaptive-иконки (опционально)' },
  { file: 'icon-background.png', size: '432×432',   note: 'фон adaptive-иконки (опционально)' },
  { file: 'splash.png',          size: '2732×2732', note: 'сплэш-экран (опционально)' }
];

console.log('');
console.log('🎨 REVERS — генерация ассетов');
console.log('');

if (!existsSync(ASSETS)) {
  console.error('❌ Папка assets/ не найдена');
  console.error('   Создай её и положи туда хотя бы icon.png');
  process.exit(1);
}

const missing = [];
for (const { file, size, note } of required) {
  const path = join(ASSETS, file);
  if (existsSync(path)) {
    console.log(`   ✅ ${file.padEnd(24)} ${size.padEnd(12)} ${note}`);
  } else {
    console.log(`   ⚠️  ${file.padEnd(24)} ${size.padEnd(12)} отсутствует`);
    missing.push(file);
  }
}

if (missing.includes('icon.png')) {
  console.error('');
  console.error('❌ icon.png обязателен. Без него иконки не сгенерируются.');
  console.error('   Положи файл 1024×1024 PNG в assets/icon.png');
  process.exit(1);
}

/* ------------------------------------------------------------
   Проверка Capacitor Assets
   ------------------------------------------------------------ */

const hasCapAssets = (() => {
  try {
    const pkgPath = join(ROOT, 'node_modules', '@capacitor', 'assets', 'package.json');
    return existsSync(pkgPath);
  } catch (e) {
    return false;
  }
})();

if (!hasCapAssets) {
  console.log('');
  console.log('📦 @capacitor/assets не установлен. Устанавливаю…');
  const install = spawnSync('npm', ['install', '-D', '@capacitor/assets'], {
    cwd: ROOT,
    stdio: 'inherit',
    shell: process.platform === 'win32'
  });
  if (install.status !== 0) {
    console.error('❌ Не удалось установить @capacitor/assets');
    process.exit(1);
  }
}

/* ------------------------------------------------------------
   Проверка android/ (нужна ли платформа)
   ------------------------------------------------------------ */

const androidDir = join(ROOT, 'android');
const hasAndroid = existsSync(join(androidDir, 'app'));

if (!hasAndroid) {
  console.log('');
  console.log('⚠️  Папка android/app не найдена.');
  console.log('   Иконки генерируются ПОСЛЕ того как создан Android-проект.');
  console.log('');
  console.log('   Сначала выполни:');
  console.log('     npx cap add android');
  console.log('     npx cap sync android');
  console.log('');
  console.log('   Потом снова:');
  console.log('     npm run generate-assets');
  console.log('');
  process.exit(1);
}

/* ------------------------------------------------------------
   Запуск генерации
   ------------------------------------------------------------ */

console.log('');
console.log('⚙️  Запускаю capacitor-assets generate…');
console.log('');

const result = spawnSync(
  'npx',
  ['capacitor-assets', 'generate', '--android'],
  {
    cwd: ROOT,
    stdio: 'inherit',
    shell: process.platform === 'win32'
  }
);

if (result.status !== 0) {
  console.error('');
  console.error('❌ Ошибка генерации ассетов');
  process.exit(1);
}

/* ------------------------------------------------------------
   Готово
   ------------------------------------------------------------ */

console.log('');
console.log('✅ Ассеты сгенерированы.');
console.log('');
console.log('   Проверь результат в:');
console.log('     android/app/src/main/res/mipmap-*/ic_launcher.png');
console.log('     android/app/src/main/res/drawable/splash.png');
console.log('');
console.log('   После этого запусти сборку:');
console.log('     npx cap sync android');
console.log('     cd android && ./gradlew assembleDebug');
console.log('');
