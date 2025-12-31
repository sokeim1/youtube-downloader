module.exports = async function handler(req, res) {
  const base = process.env.BACKEND_BASE_URL;
  if (!base) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ error: 'BACKEND_BASE_URL is not set' }));
    return;
  }

  const url = new URL(req.url, 'http://localhost');
  const upstream = new URL(url.pathname + url.search, base);

  // IMPORTANT: avoid proxying large binary responses through Vercel (limits).
  // Redirect downloads/thumbnails directly to the backend.
  const method = req.method || 'GET';
  if (method === 'GET' && url.pathname.startsWith('/api/')) {
    const p = url.pathname;
    if (p === '/api/download' || p === '/api/thumbnail' || p === '/api/thumbnail-view') {
      res.statusCode = 302;
      res.setHeader('Location', upstream.toString());
      res.end();
      return;
    }
  }

  const headers = { ...req.headers };
  delete headers.host;

  let body = undefined;
  if (method !== 'GET' && method !== 'HEAD') {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    body = Buffer.concat(chunks);
  }

  let r;
  try {
    r = await fetch(upstream, { method, headers, body });
  } catch (e) {
    res.statusCode = 502;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ error: String(e?.message || e) }));
    return;
  }

  res.statusCode = r.status;
  r.headers.forEach((v, k) => {
    if (k.toLowerCase() === 'transfer-encoding') return;
    res.setHeader(k, v);
  });

  const buf = Buffer.from(await r.arrayBuffer());
  res.end(buf);
}
