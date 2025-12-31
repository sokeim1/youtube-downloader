const el = (id) => document.getElementById(id);

const urlInput = el('url');
const analyzeBtn = el('analyze');
const result = el('result');
const errorBox = el('error');
const titleEl = el('title');
const extractorEl = el('extractor');
const openSource = el('openSource');
const thumbImg = el('thumbImg');
const downloadConfirm = el('downloadConfirm');
const downloadThumb = el('downloadThumb');
const statusEl = el('status');

const logoBtn = el('logoBtn');
const installerMsg = el('installerMsg');

const qualitiesEl = el('qualities');

let lastAnalyze = null;
let selectedPreset = null;

if (installerMsg) {
  const p = new URLSearchParams(window.location.search);
  if (p.get('installer') === 'missing') {
    installerMsg.classList.remove('hidden');
    try {
      window.history.replaceState({}, '', window.location.pathname);
    } catch {}
  }
}

function setError(text) {
  if (!text) {
    errorBox.classList.add('hidden');
    errorBox.textContent = '';
    return;
  }
  errorBox.textContent = text;
  errorBox.classList.remove('hidden');
}

function setStatus(text) {
  statusEl.textContent = text || '';
}

function isValidHttpUrl(value) {
  try {
    const u = new URL(value);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

function clearSelection() {
  selectedPreset = null;
  downloadConfirm.disabled = true;
  [...qualitiesEl.querySelectorAll('button')].forEach((b) => b.classList.remove('active'));
}

function resetToHome() {
  lastAnalyze = null;
  selectedPreset = null;
  setError('');
  setStatus('');
  titleEl.textContent = '';
  extractorEl.textContent = '';
  openSource.removeAttribute('href');
  qualitiesEl.innerHTML = '';
  thumbImg.removeAttribute('src');
  thumbImg.style.display = 'none';
  downloadThumb.disabled = true;
  downloadConfirm.disabled = true;
  result.classList.add('hidden');
  urlInput.value = '';
  urlInput.focus();
}

function buildQualityButtons(formats) {
  qualitiesEl.innerHTML = '';

  const heights = new Set();
  for (const f of Array.isArray(formats) ? formats : []) {
    if (f && f.isVideo && typeof f.height === 'number' && f.height > 0) heights.add(f.height);
  }

  const sortedHeights = [...heights].sort((a, b) => b - a);

  for (const h of sortedHeights) {
    const btn = document.createElement('button');
    btn.className = 'btn btnOption';
    btn.textContent = `${h}p`;
    btn.addEventListener('click', () => {
      clearSelection();
      btn.classList.add('active');
      selectedPreset = `${h}p`;
      downloadConfirm.disabled = false;
      setStatus(`Выбрано: ${h}p`);
    });
    qualitiesEl.appendChild(btn);
  }

  const mp3 = document.createElement('button');
  mp3.className = 'btn btnOption';
  mp3.textContent = 'MP3';
  mp3.addEventListener('click', () => {
    clearSelection();
    mp3.classList.add('active');
    selectedPreset = 'mp3';
    downloadConfirm.disabled = false;
    setStatus('Выбрано: MP3');
  });
  qualitiesEl.appendChild(mp3);
}

function pickBestOrientation(formats) {
  const vids = (Array.isArray(formats) ? formats : []).filter((f) => f && f.isVideo && typeof f.width === 'number' && typeof f.height === 'number');
  if (!vids.length) return null;
  vids.sort((a, b) => (b.height || 0) - (a.height || 0));
  const best = vids[0];
  if (!best || !best.width || !best.height) return null;
  return best.height > best.width ? 'portrait' : 'landscape';
}

async function analyze() {
  setError('');
  setStatus('');
  result.classList.add('hidden');

  const url = urlInput.value.trim();
  if (!url || !isValidHttpUrl(url)) {
    setError('Некорректная ссылка');
    return;
  }

  analyzeBtn.disabled = true;
  analyzeBtn.textContent = 'Проверяю...';

  try {
    const r = await fetch('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });

    const data = await r.json().catch(() => null);
    if (!r.ok) {
      throw new Error(data?.error || `HTTP ${r.status}`);
    }

    lastAnalyze = data;
    titleEl.textContent = data.title || '';
    extractorEl.textContent = data.extractor || '';
    openSource.href = data.webpage_url || url;

    clearSelection();
    buildQualityButtons(data.formats);

    const orient = pickBestOrientation(data.formats);
    const previewEl = thumbImg?.closest('.preview');
    if (previewEl) {
      previewEl.classList.remove('portrait');
      if (orient === 'portrait') previewEl.classList.add('portrait');
    }

    downloadThumb.disabled = false;

    const directThumb = data.thumbnail || null;
    thumbImg.onerror = null;
    if (directThumb) {
      thumbImg.src = directThumb;
      thumbImg.onerror = () => {
        thumbImg.onerror = null;
        thumbImg.src = `/api/thumbnail-view?src=${encodeURIComponent(directThumb)}&t=${Date.now()}`;
      };
    } else {
      thumbImg.src = `/api/thumbnail-view?url=${encodeURIComponent(url)}&t=${Date.now()}`;
    }
    thumbImg.style.display = 'block';

    result.classList.remove('hidden');
  } catch (e) {
    setError(String(e?.message || e));
  } finally {
    analyzeBtn.disabled = false;
    analyzeBtn.textContent = 'Скачать';
  }
}

function makeDownloadUrl({ preset, mode }) {
  const p = new URLSearchParams();
  p.set('url', urlInput.value.trim());
  if (lastAnalyze?.title) p.set('title', lastAnalyze.title);
  if (preset) p.set('preset', preset);
  if (mode) p.set('mode', mode);
  return `/api/download?${p.toString()}`;
}

function makeThumbUrl() {
  const p = new URLSearchParams();
  p.set('url', urlInput.value.trim());
  if (lastAnalyze?.title) p.set('title', `${lastAnalyze.title} - preview`);
  if (lastAnalyze?.thumbnail) p.set('src', lastAnalyze.thumbnail);
  return `/api/thumbnail?${p.toString()}`;
}

function startDownload(href) {
  const a = document.createElement('a');
  a.href = href;
  a.download = '';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

analyzeBtn.addEventListener('click', analyze);
urlInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') analyze();
});

if (logoBtn) {
  logoBtn.style.cursor = 'pointer';
  logoBtn.addEventListener('click', resetToHome);
}

downloadConfirm.addEventListener('click', () => {
  if (!lastAnalyze || !selectedPreset) return;

  setError('');
  setStatus(`Скачивание ${selectedPreset.toUpperCase()}...`);
  startDownload(makeDownloadUrl({ preset: selectedPreset }));
});

downloadThumb.addEventListener('click', () => {
  if (!lastAnalyze) return;
  setStatus('Превью: скачивание...');
  startDownload(makeThumbUrl());
});

downloadThumb.disabled = true;
