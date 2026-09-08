// Self-contained verification: starts the HTTP server, runs all checks, exits.
// Run from the project root: node scratch/verify_full.js
const http = require('http');
const path = require('path');
const PUBLIC_DIR = path.join(__dirname, '..', 'public');

process.env.PORT = '4567';
process.env.DISCORD_INVITE_URL = 'https://discord.gg/Eg2SBcsG4N';

let failures = 0;
const assert = (cond, msg) => {
  if (!cond) { console.error('  ✗ FAIL:', msg); failures++; }
  else { console.log('  ✓ PASS:', msg); }
};

function get(port, p) {
  return new Promise((resolve, reject) => {
    http.get('http://localhost:' + port + p, { headers: { 'User-Agent': 'Lunera-verify/1.0' } }, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => resolve({ status: res.statusCode, body, headers: res.headers }));
    }).on('error', reject);
  });
}

async function run() {
  // Start the server in-process
  console.log('Starting HTTP server...');
  const { startHttpServer } = require('../src/httpServer');
  await startHttpServer();

  console.log('\n--- /health ---');
  {
    const r = await get(4567, '/health');
    assert(r.status === 200, '/health returns 200');
    assert(r.body === 'OK', '/health body is "OK"');
  }

  console.log('\n--- / (homepage) ---');
  {
    const r = await get(4567, '/');
    assert(r.status === 200, '/ returns 200');
    assert(r.body.includes('<!DOCTYPE html>'), '/ serves HTML');
    assert(r.body.includes('Lunera'), '/ contains brand name');
    assert(r.body.includes('<style>'), '/ has inline <style> block');
    assert(r.body.includes('<script>'), '/ has inline <script> block');
    assert(r.body.includes('/api/widget'), '/ references /api/widget endpoint');
    assert(r.body.includes('favicon'), '/ references favicon');
    assert(r.body.includes('data-depth'), '/ has parallax layers');
    assert(r.body.includes('prefers-reduced-motion'), '/ respects reduced motion');
  }

  console.log('\n--- /favicon.svg ---');
  {
    const r = await get(4567, '/favicon.svg');
    assert(r.status === 200, '/favicon.svg returns 200');
    assert(r.headers['content-type'].includes('image/svg+xml'), '/favicon.svg is image/svg+xml');
  }

  console.log('\n--- /favicon-32.png ---');
  {
    const r = await get(4567, '/favicon-32.png');
    assert(r.status === 200, '/favicon-32.png returns 200');
  }

  console.log('\n--- /api/widget ---');
  {
    const r = await get(4567, '/api/widget');
    assert(r.status === 200, '/api/widget returns 200');
    assert(r.headers['content-type'].includes('application/json'), '/api/widget is JSON');
    let data;
    try { data = JSON.parse(r.body); } catch (e) { assert(false, '/api/widget is valid JSON'); }
    if (data) {
      console.log('  → name:', data.name);
      console.log('  → presence:', data.presenceCount, '| memberCount:', data.memberCount);
      console.log('  → invite:', data.instantInvite);
      console.log('  → channels:', Array.isArray(data.channels) ? data.channels.length : 'n/a');
      console.log('  → users:', Array.isArray(data.users) ? data.users.length : 'n/a');
      console.log('  → available:', data.available, '| source:', data.source);
      assert(data.id === '1416799484511391754', 'widget id matches guild');
      assert(data.name && data.name.includes('Lunera'), 'widget name includes Lunera');
      assert(typeof data.available === 'boolean', 'widget has availability flag');
      // Verify no bot token leaked
      assert(!r.body.includes('DISCORD_TOKEN'), 'no token leaked in widget response');
    }
  }

  console.log('\n--- /health (2nd) ---');
  { const r = await get(4567, '/health'); assert(r.status === 200, '/health still 200'); }

  console.log('\n--- path traversal guard ---');
  {
    const r = await get(4567, '/%2e%2e/%2e%2e/%2e%2e/etc/passwd');
    assert(r.status === 403 || r.status === 404, 'path traversal blocked (got ' + r.status + ')');
  }

  console.log('\n--- unknown route ---');
  {
    const r = await get(4567, '/nonexistent');
    assert(r.status === 404, '/nonexistent returns 404');
  }

  console.log('\n' + (failures === 0 ? '✅ ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'));
  process.exit(failures === 0 ? 0 : 1);
}

run().catch((err) => { console.error('VERIFY ERROR:', err); process.exit(2); });
