# Сборка APK для REVERS Messenger 2.0

APK собирается автоматически через GitHub Actions. Ничего локально устанавливать не нужно.

---

## 1. Как получить APK

1. Открой репозиторий на GitHub.
2. Вкладка **Actions**.
3. Выбери последний запущенный workflow **Build APK**.
4. Внизу страницы — раздел **Artifacts**.
5. Скачай `revers-apk.zip`.
6. Распакуй — внутри `app-debug.apk`.
7. Скинь APK на телефон и установи (разрешить установку из неизвестных источников).

---

## 2. Как запускается сборка

Сборка стартует автоматически при:

- push в ветку `main`, если изменился хотя бы один из путей:
  - `client/**`
  - `.github/workflows/build-apk.yml`
  - `package.json`
- ручном запуске через кнопку **Run workflow** во вкладке Actions.

Обычный push в `server/**` **не** пересобирает APK — потому что сервер живёт на Render и обновляется отдельно.

---

## 3. Что делает workflow

Файл: `.github/workflows/build-apk.yml`

Шаги:

1. Ставит Ubuntu (последняя).
2. Ставит Node.js 20.
3. Ставит Java 17 (нужна для Android Gradle).
4. Ставит Android SDK.
5. `npm install` — устанавливает зависимости.
6. Устанавливает Capacitor.
7. `npx cap init` — инициализирует Capacitor с именем `REVERS`.
8. `npx cap add android` — создаёт Android-проект.
9. `npx cap sync android` — копирует `client/` в нативный проект.
10. `./gradlew assembleDebug` — собирает APK.
11. Загружает APK в Artifacts.

Весь процесс занимает 3–6 минут.

---

## 4. Локальная сборка (если нужно)

Требуется:

- Node.js 20+
- Java 17
- Android SDK (или Android Studio)

Команды:

```bash
npm install
npm install @capacitor/core @capacitor/cli @capacitor/android

npx cap init REVERS com.revers.messenger --web-dir=client
npx cap add android
npx cap sync android

cd android
chmod +x gradlew
./gradlew assembleDebug
