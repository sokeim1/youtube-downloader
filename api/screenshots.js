const fs = require('fs');
const path = require('path');

module.exports = async function handler(req, res) {
  try {
    const url = new URL(req.url, 'http://localhost');
    const name = (url.pathname.split('/').pop() || '').toLowerCase();

    const map = {
      'app-1.png': 'Screenshot_1.png',
      'app-2.png': 'Screenshot_5.png',
    };

    const src = map[name];
    if (!src) {
      res.statusCode = 404;
      res.end('not found');
      return;
    }

    const fp = path.join(process.cwd(), src);
    if (!fs.existsSync(fp)) {
      res.statusCode = 404;
      res.end('not found');
      return;
    }

    res.statusCode = 200;
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    fs.createReadStream(fp).pipe(res);
  } catch (e) {
    res.statusCode = 500;
    res.end(String(e?.message || e));
  }
};
