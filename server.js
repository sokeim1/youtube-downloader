const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');
const { randomUUID } = require('crypto');

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

const PUBLIC_DIR = path.join(__dirname, 'public');
app.use(express.static(PUBLIC_DIR));

function findLatestInstallerExe() {
  try {
    const dir = path.join(__dirname, 'installer', 'Output');
    if (!fs.existsSync(dir)) return null;
    const names = fs.readdirSync(dir).filter((n) => /^VideoDownloaderSetup-.*\.exe$/i.test(n));
    if (!names.length) return null;
    let best = null;
    let bestMtime = 0;
    for (const n of names) {
      const fp = path.join(dir, n);
      const st = fs.statSync(fp);
      if (st.isFile() && st.mtimeMs > bestMtime) {
        bestMtime = st.mtimeMs;
        best = fp;
      }
    }
    return best;
  } catch {
    return null;
  }
}

app.get('/download/windows', (req, res) => {
  if (process.env.INSTALLER_URL) {
    return res.redirect(process.env.INSTALLER_URL);
  }
  const fp = findLatestInstallerExe();
  if (!fp) return res.redirect('/?installer=missing');
  res.setHeader('Cache-Control', 'no-store');
  res.download(fp, path.basename(fp));
});

const ANALYZE_CACHE_TTL_MS = 5 * 60 * 1000;
const analyzeCache = new Map();

function getCachedAnalyze(url) {
  const hit = analyzeCache.get(url);
  if (!hit) return null;
  if (Date.now() - hit.ts > ANALYZE_CACHE_TTL_MS) {
    analyzeCache.delete(url);
    return null;
  }
  return hit.data;
}

function setCachedAnalyze(url, data) {
  analyzeCache.set(url, { ts: Date.now(), data });
}

 function findYtDlpOnWindows() {
   try {
     if (process.platform !== 'win32') return null;
     const local = process.env.LOCALAPPDATA;
     if (!local) return null;
     const base = path.join(local, 'Microsoft', 'WinGet', 'Packages');
     if (!fs.existsSync(base)) return null;

     const entries = fs.readdirSync(base, { withFileTypes: true });
     const candidates = entries
       .filter((e) => e.isDirectory() && e.name.toLowerCase().startsWith('yt-dlp.yt-dlp_'))
       .map((e) => path.join(base, e.name, 'yt-dlp.exe'))
       .filter((p) => fs.existsSync(p));

     return candidates.length ? candidates[0] : null;
   } catch {
     return null;
   }
 }

 const YT_DLP_BIN = process.env.YT_DLP_PATH || findYtDlpOnWindows() || 'yt-dlp';

 let _cookiesFileCache = undefined;

 function resolveCookiesFile() {
   if (_cookiesFileCache !== undefined) return _cookiesFileCache;

   try {
     const fp = process.env.YT_DLP_COOKIES_FILE;
     if (fp && fs.existsSync(fp)) {
       _cookiesFileCache = fp;
       return _cookiesFileCache;
     }
   } catch {}

   try {
     const b64 = process.env.YT_DLP_COOKIES_B64;
     if (b64 && typeof b64 === 'string') {
       const out = path.join(os.tmpdir(), 'vd_cookies.txt');
       const buf = Buffer.from(b64, 'base64');
       fs.writeFileSync(out, buf, { encoding: 'utf8', mode: 0o600 });
       _cookiesFileCache = out;
       return _cookiesFileCache;
     }
   } catch {}

   _cookiesFileCache = null;
   return _cookiesFileCache;
 }

 function spawnYtDlp(args, spawnOpts = {}) {
   const cookiesFile = resolveCookiesFile();
   const fullArgs = [];
   if (cookiesFile) {
     fullArgs.push('--cookies', cookiesFile);
   }
   fullArgs.push(...args);
   return spawn(YT_DLP_BIN, fullArgs, { windowsHide: true, ...spawnOpts });
 }

function runYtDlp(args, { timeoutMs = 0 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawnYtDlp(args);

    let stdout = '';
    let stderr = '';

    const killTimer = timeoutMs
      ? setTimeout(() => {
          try {
            child.kill();
          } catch {}
        }, timeoutMs)
      : null;

    child.stdout.on('data', (d) => (stdout += d.toString('utf8')));
    child.stderr.on('data', (d) => (stderr += d.toString('utf8')));

    child.on('error', (err) => {
      if (killTimer) clearTimeout(killTimer);
      if (err && err.code === 'ENOENT') {
        const e = new Error(
          `yt-dlp not found. Restart your terminal/IDE so PATH updates, or set YT_DLP_PATH to full path of yt-dlp.exe. Original: ${err.message}`
        );
        e.code = 'ENOENT';
        return reject(e);
      }
      reject(err);
    });

    child.on('close', (code) => {
      if (killTimer) clearTimeout(killTimer);
      if (code === 0) return resolve({ stdout, stderr });
      const e = new Error(`yt-dlp exited with code ${code}`);
      e.code = code;
      e.stderr = stderr;
      e.stdout = stdout;
      reject(e);
    });
  });
}

function safeFilename(name) {
  return String(name || 'download')
    .replace(/[\\/:*?"<>|]+/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
}

async function findLargestByPrefix(dir, prefix) {
  const names = await fs.promises.readdir(dir);
  const matched = names.filter((n) => n.startsWith(prefix));
  if (matched.length === 0) return null;
  let best = null;
  let bestSize = -1;
  for (const n of matched) {
    const fp = path.join(dir, n);
    const st = await fs.promises.stat(fp);
    if (st.isFile() && st.size > bestSize) {
      bestSize = st.size;
      best = fp;
    }
  }
  return best;
}

app.get('/api/health', (req, res) => {
  res.json({ ok: true });
});

// Analyze URL and return formats + title + thumbnail
app.post('/api/analyze', async (req, res) => {
  try {
    const { url } = req.body || {};
    if (!url || typeof url !== 'string') {
      return res.status(400).json({ error: 'url is required' });
    }

    const cached = getCachedAnalyze(url);
    if (cached) return res.json(cached);

    // -J: JSON, --no-playlist: single item, --no-warnings: cleaner
    const { stdout } = await runYtDlp(['-J', '--no-playlist', '--no-warnings', url], {
      timeoutMs: 45000,
    });

    const info = JSON.parse(stdout);

    const title = info.title || info.fulltitle || 'download';
    const thumbnail = info.thumbnail || (Array.isArray(info.thumbnails) ? info.thumbnails.at(-1)?.url : null);

    const formats = Array.isArray(info.formats) ? info.formats : [];

    // Normalize + filter obvious junk
    const normalized = formats
      .filter((f) => f && f.format_id)
      .map((f) => {
        const vcodec = f.vcodec || 'none';
        const acodec = f.acodec || 'none';
        const isVideo = vcodec !== 'none';
        const isAudio = acodec !== 'none' && vcodec === 'none';

        const height = typeof f.height === 'number' ? f.height : null;
        const width = typeof f.width === 'number' ? f.width : null;
        const fps = typeof f.fps === 'number' ? f.fps : null;
        const ext = f.ext || null;
        const filesize = typeof f.filesize === 'number' ? f.filesize : (typeof f.filesize_approx === 'number' ? f.filesize_approx : null);
        const tbr = typeof f.tbr === 'number' ? f.tbr : null;

        return {
          format_id: String(f.format_id),
          ext,
          isVideo,
          isAudio,
          width,
          height,
          fps,
          vcodec,
          acodec,
          tbr,
          filesize,
          format_note: f.format_note || null,
          protocol: f.protocol || null,
        };
      });

    const response = {
      title,
      thumbnail,
      formats: normalized,
      extractor: info.extractor || null,
      webpage_url: info.webpage_url || url,
    };

    setCachedAnalyze(url, response);
    res.json(response);
  } catch (err) {
    const msg = err?.stderr || err?.message || String(err);
    res.status(500).json({ error: msg });
  }
});

// Download selected format (or mp3)
app.get('/api/download', async (req, res) => {
  try {
    const url = req.query.url;
    const formatId = req.query.formatId;
    const mode = req.query.mode; // 'mp3' or 'file'
    const preset = req.query.preset;

    if (!url || typeof url !== 'string') {
      return res.status(400).send('url is required');
    }

    const baseName = safeFilename(req.query.title || 'download');

    res.setHeader('Cache-Control', 'no-store');

    if (preset && typeof preset === 'string') {
      const tmpDir = path.join(os.tmpdir(), 'video-downloader');
      await fs.promises.mkdir(tmpDir, { recursive: true });
      const token = `vd_${randomUUID()}`;
      const outTpl = path.join(tmpDir, `${token}.%(ext)s`);

      let args = null;
      let contentType = 'application/octet-stream';
      let downloadExt = null;

      if (preset.toLowerCase() === 'mp3') {
        args = ['--no-playlist', '--no-warnings', '-x', '--audio-format', 'mp3', '-o', outTpl, url];
        contentType = 'audio/mpeg';
        downloadExt = 'mp3';
      } else {
        const p = preset.toLowerCase().replace(/p$/, '');
        const height = Number(p);
        if (!Number.isFinite(height)) return res.status(400).send('invalid preset');

        if (height > 1080) {
          const selector = `bestvideo[height<=${height}]+bestaudio/best[height<=${height}]`;
          args = ['--no-playlist', '--no-warnings', '-f', selector, '--merge-output-format', 'mkv', '-o', outTpl, url];
          contentType = 'video/x-matroska';
          downloadExt = 'mkv';
        } else {
          const selector = `bestvideo[vcodec^=avc1][height<=${height}]+bestaudio[ext=m4a]/bestvideo[height<=${height}]+bestaudio/best[height<=${height}]`;
          args = ['--no-playlist', '--no-warnings', '-f', selector, '--merge-output-format', 'mp4', '--remux-video', 'mp4', '-o', outTpl, url];
          contentType = 'video/mp4';
          downloadExt = 'mp4';
        }
      }

      const child = spawnYtDlp(args);

      let stderr = '';
      child.stderr.on('data', (d) => (stderr += d.toString('utf8')));

      const exitCode = await new Promise((resolve, reject) => {
        child.on('error', reject);
        child.on('close', resolve);
      });

      if (exitCode !== 0) {
        return res.status(500).send(stderr || `yt-dlp exit ${exitCode}`);
      }

      const outFile = await findLargestByPrefix(tmpDir, token);
      if (!outFile) return res.status(500).send('output file not found');

      const ext = path.extname(outFile).slice(1) || downloadExt || 'bin';
      res.setHeader(
        'Content-Type',
        ext === 'mp3'
          ? 'audio/mpeg'
          : ext === 'mp4'
            ? 'video/mp4'
            : ext === 'mkv'
              ? 'video/x-matroska'
              : ext === 'webm'
                ? 'video/webm'
                : contentType
      );
      res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(baseName)}.${encodeURIComponent(ext)}`);

      const stream = fs.createReadStream(outFile);
      stream.on('error', async (e) => {
        try {
          await fs.promises.unlink(outFile);
        } catch {}
        if (!res.headersSent) res.status(500).send(String(e));
        else res.end();
      });

      res.on('close', async () => {
        try {
          await fs.promises.unlink(outFile);
        } catch {}
      });

      stream.pipe(res);
      stream.on('close', async () => {
        try {
          await fs.promises.unlink(outFile);
        } catch {}
      });

      return;
    }

    if (mode === 'mp3') {
      // Stream mp3 to client
      res.setHeader('Content-Type', 'audio/mpeg');
      res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(baseName)}.mp3`);

      const args = [
        '--no-playlist',
        '--no-warnings',
        '-x',
        '--audio-format',
        'mp3',
        '-o',
        '-',
        url,
      ];

      const child = spawnYtDlp(args);
      child.stdout.pipe(res);

      let stderr = '';
      child.stderr.on('data', (d) => (stderr += d.toString('utf8')));

      child.on('error', (e) => {
        if (!res.headersSent) res.status(500).send(String(e));
        else res.end();
      });

      child.on('close', (code) => {
        if (code !== 0 && !res.headersSent) {
          res.status(500).send(stderr || `yt-dlp exit ${code}`);
        }
      });

      return;
    }

    if (!formatId || typeof formatId !== 'string') {
      return res.status(400).send('formatId is required (or use mode=mp3)');
    }

    // Stream selected format
    // Let browser guess; also allow user to choose extension on client
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(baseName)}.${encodeURIComponent(req.query.ext || 'mp4')}`);

    const args = ['--no-playlist', '--no-warnings', '-f', formatId, '-o', '-', url];
    const child = spawnYtDlp(args);
    child.stdout.pipe(res);

    let stderr = '';
    child.stderr.on('data', (d) => (stderr += d.toString('utf8')));

    child.on('error', (e) => {
      if (!res.headersSent) res.status(500).send(String(e));
      else res.end();
    });

    child.on('close', (code) => {
      if (code !== 0 && !res.headersSent) {
        res.status(500).send(stderr || `yt-dlp exit ${code}`);
      }
    });
  } catch (err) {
    res.status(500).send(err?.message || String(err));
  }
});

// Download thumbnail/preview
app.get('/api/thumbnail', async (req, res) => {
  try {
    const url = req.query.url;
    const title = safeFilename(req.query.title || 'preview');
    const src = req.query.src;

    let thumb = null;

    if (src && typeof src === 'string') {
      thumb = src;
    } else {
      if (!url || typeof url !== 'string') {
        return res.status(400).send('url is required');
      }
      thumb = await getThumbUrlFromYtDlp(url);
    }

    // Try fetch by URL first; if blocked, fall back to yt-dlp thumbnail file
    let r = null;
    if (thumb) {
      r = await fetch(thumb).catch(() => null);
    }

    if (!r || !r.ok) {
      if (!url || typeof url !== 'string') return res.status(404).send('thumbnail not found');
      const fp = await getThumbFileFromYtDlp(url);
      if (!fp) return res.status(404).send('thumbnail not found');
      const buf = await fs.promises.readFile(fp);
      try {
        await fs.promises.unlink(fp);
      } catch {}
      res.setHeader('Content-Type', 'image/jpeg');
      res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(title)}.jpg`);
      return res.send(buf);
    }

    const contentType = r.headers.get('content-type') || 'image/jpeg';
    const ext = contentType.includes('png') ? 'png' : contentType.includes('webp') ? 'webp' : 'jpg';

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(title)}.${ext}`);

    const buf = Buffer.from(await r.arrayBuffer());
    res.send(buf);
  } catch (err) {
    res.status(500).send(err?.message || String(err));
  }
});

app.get('/api/thumbnail-view', async (req, res) => {
  try {
    const url = req.query.url;
    const src = req.query.src;

    let thumb = null;
    if (src && typeof src === 'string') {
      thumb = src;
    } else {
      if (!url || typeof url !== 'string') {
        return res.status(400).send('url is required');
      }

      thumb = await getThumbUrlFromYtDlp(url);
    }

    // Try fetch by URL first; if blocked, fall back to yt-dlp thumbnail file
    let r = null;
    if (thumb) {
      r = await fetch(thumb).catch(() => null);
    }

    if (!r || !r.ok) {
      if (!url || typeof url !== 'string') return res.status(404).send('thumbnail not found');
      const fp = await getThumbFileFromYtDlp(url);
      if (!fp) return res.status(404).send('thumbnail not found');
      const buf = await fs.promises.readFile(fp);
      try {
        await fs.promises.unlink(fp);
      } catch {}
      res.setHeader('Content-Type', 'image/jpeg');
      res.setHeader('Cache-Control', 'no-store');
      return res.send(buf);
    }

    const contentType = r.headers.get('content-type') || 'image/jpeg';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'no-store');

    const buf = Buffer.from(await r.arrayBuffer());
    res.send(buf);
  } catch (err) {
    res.status(500).send(err?.message || String(err));
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

const START_PORT = Number(process.env.PORT) || 5173;

function listenWithFallback(startPort, attemptsLeft = 10) {
  const port = startPort;
  const server = app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
  });

  server.on('error', (err) => {
    if (err && err.code === 'EADDRINUSE' && attemptsLeft > 0) {
      server.close(() => {
        listenWithFallback(port + 1, attemptsLeft - 1);
      });
      return;
    }

    console.error(err);
    process.exit(1);
  });
}

listenWithFallback(START_PORT);
