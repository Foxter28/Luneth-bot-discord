// Quick verification script for the Lunera HTTP server.
// Run with: node scratch/verify_server.js  (from the project root)
const http = require('http');

const BASE = 'http://localhost:3999';

function get(path) {
  return new Promise((resolve, reject) => {
    http.get(BASE + path, { headers: { 'User-Agent': 'Lunera-verify/1.0' } }, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => resolve({ status: res.statusCode, body, headers: res.headers }));
    }).on('error', reject);
  });
}

(async () => {
  let failures = 0;
  const assert = (cond, msg) => { if (!cond) { console.error('FAIL:', msg); failures++; } else { console.log('PASS:', msg); } };

  // 1. Health
  {
    const r = await get('/health');
    assert(r.status === 200, '/health returns 200');
    assert(r.body === 'OK', '/health body is "OK"');
  }

  // 2. Homepage
  {
    const r = await get('/');
    assert(r.status === 200, '/ returns 200');
    assert(r.body.includes('<!DOCTYPE html>'), '/ serves HTML');
    assert(r.body.includes('Lunera'), '/ contains brand name');
    assert(r.body.includes('<style>'), '/ has inline <style> block');
    assert(r.body.includes('<script>'), '/ has inline script');
  }

  // 3. Widget proxy
  {
    const r = await get('/api/widget');
    console.log('  widget status:', r.status);
    assert(r.status === 200, '/api/widget returns 200');
    assert(r.headers['content-type'].includes('application/json'), '/api/widget is JSON');
    let data;
    try { data = JSON.parse(r.body); } catch (e) { assert(false, '/api/widget is valid JSON'); }
    if (data) {
      assert(data.id === '1416799484511391754', 'widget id matches guild');
      assert(data.name && data.name.includes('Lunera'), 'widget name includes Lunera');
      console.log('  widget source:', data.source, '| presence:', data.presenceCount, '| memberCount:', data.memberCount, '| available:', data.available);
    }
  }

  // 4. Favicon
  {
    const r = await get('/favicon.svg');
    assert(r.status === 200, '/favicon.svg returns 200');
  }

  console.log('\n' + (failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'));
  process.exit(failures === 0 ? 0 : 1);
})().catch((err) => { console.error('VERIFY ERROR:', err); process.exit(2); });
