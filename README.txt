Запуск (Windows)

1) Установи Node.js LTS.
2) Установи yt-dlp (должен быть в PATH):
   - через winget: winget install yt-dlp.yt-dlp
   или скачай exe и добавь в PATH.
3) (Важно для MP3) Нужен ffmpeg в PATH:
   - winget install Gyan.FFmpeg

Далее в папке проекта:
- npm install
- npm run start
Открой: http://localhost:5173

Если Instagram / TikTok не скачивается:
- некоторые видео требуют авторизацию или блокируются.
- в таком случае нужен импорт cookies в yt-dlp (это можно добавить позже отдельной настройкой).
