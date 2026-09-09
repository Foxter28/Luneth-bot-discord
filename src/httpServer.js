// Minimal HTTP server for Render + the Lunera landing page.
//
// Render Web Services must bind to an HTTP port (process.env.PORT) to be
// considered "live" — otherwise it keeps reporting "No open ports detected".
//
// This server:
//   1. Serves the static landing page from public/ (index.html, favicon, etc.)
//   2. Proxies the Discord widget JSON via /api/widget so the browser never
//      needs to hit Discord directly (avoids CORS/rate-limit issues, lets us
//      cache server-side, and never exposes any secret).
//   3. Provides a /health check for uptime monitors.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');
const { fetchWidget } = require('./discordService');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, '..', 'public');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.webm': 'video/webm',
  '.mp4': 'video/mp4',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav'
};

function serveFile(res, filePath) {
  fs.readFile(filePath, (err, content) => {
    if (err) {
      if (err.code === 'ENOENT') {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Not found');
        return;
      }
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Oops — something went wrong.');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable',
    });
    res.end(content);
  });
}

function serveIndex(res) {
  const indexPath = path.join(PUBLIC_DIR, 'index.html');
  serveFile(res, indexPath);
}

async function serveWidget(res) {
  try {
    const data = await fetchWidget();
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(data));
  } catch (err) {
    // Should never happen (fetchWidget always resolves), but guard anyway.
    console.warn('[http] widget handler error:', err.message);
    res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ available: false, source: 'fallback' }));
  }
}

const server = http.createServer(async (req, res) => {
  // Parse URL path, stripping query string.
  let url;
  try {
    url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  } catch {
    res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Bad request');
    return;
  }
  const pathname = url.pathname;

  // --- Discord widget proxy (server-side, no secret exposed) ---
  if (pathname === '/api/widget') {
    return serveWidget(res);
  }

  // --- Health check ---
  if (pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('OK');
    return;
  }

  // --- Boosters API — live data from bot via boosterStore ---
  if (pathname === '/api/boosters') {
    try {
      const { getBoosters } = require('./boosterStore');
      const data = getBoosters();
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-cache' });
      res.end(JSON.stringify(data));
    } catch {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-cache' });
      res.end(JSON.stringify({ boosters: [], count: 0, updatedAt: 0 }));
    }
    return;
  }

  // --- Guild stats (member count from bot) ---
  if (pathname === '/api/stats') {
    try {
      const { getMemberCount } = require('./guildInfo');
      const mc = getMemberCount();
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-cache' });
      res.end(JSON.stringify({ memberCount: mc }));
    } catch {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-cache' });
      res.end(JSON.stringify({ memberCount: null }));
    }
    return;
  }

  // --- Root route ---
  if (pathname === '/' || pathname === '/index.html') {
    return serveIndex(res);
  }

  // --- Bot Guide page route ---
  if (pathname === '/guide' || pathname === '/guide.html' || pathname === '/luneth') {
    const guidePath = path.join(PUBLIC_DIR, 'guide.html');
    if (fs.existsSync(guidePath)) {
      return serveFile(res, guidePath);
    }
  }

  // --- Static files from public/ (with path-traversal guard) ---
  const decoded = decodeURIComponent(pathname);
  // Strip leading slashes so the path is treated as relative to PUBLIC_DIR.
  const relativePath = decoded.replace(/^\/+/, '');
  const fullStaticPath = path.resolve(PUBLIC_DIR, relativePath);
  // Robust containment check: the resolved path must live inside PUBLIC_DIR.
  if (!fullStaticPath.startsWith(PUBLIC_DIR + path.sep) && fullStaticPath !== PUBLIC_DIR) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Forbidden');
    return;
  }
  // Only serve known static file types (don't leak arbitrary files).
  const ext = path.extname(fullStaticPath).toLowerCase();
  if (!Object.prototype.hasOwnProperty.call(MIME, ext)) {
    // Directories or unknown extensions: try index.html, else 404.
    if (relativePath.endsWith('/') || relativePath === '') {
      return serveFile(res, path.join(PUBLIC_DIR, 'index.html'));
    }
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
    return;
  }
  return serveFile(res, fullStaticPath);
});

function startHttpServer() {
  return new Promise((resolve) => {
    server.listen(PORT, '0.0.0.0', () => {
      console.log(`🌐 Lunera page running at http://0.0.0.0:${PORT}`);
      resolve();
    });
  });
}

module.exports = { startHttpServer };
