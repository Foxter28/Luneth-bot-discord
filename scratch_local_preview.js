/**
 * Local preview script — starts the HTTP server on port 3333.
 * Run with: node scratch_local_preview.js
 */
const path = require('path');

// Allow PORT override from environment; default to 3333 for local work.
const PORT = process.env.PORT || '3333';
process.env.PORT = PORT;

const { startHttpServer } = require(path.join(__dirname, 'src', 'httpServer'));

const server = startHttpServer();

// Graceful shutdown — close the server on SIGINT/SIGTERM so the port
// is released cleanly and we avoid EADDRINUSE on the next run.
function shutdown() {
  console.log('\n[scratch] shutting down…');
  server.close(() => {
    console.log('[scratch] server closed.');
    process.exit(0);
  });
  // Force-quit after 3s if the server didn't close on its own.
  setTimeout(() => process.exit(1), 3000);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

console.log(`Local preview ready: http://localhost:${PORT}`);
