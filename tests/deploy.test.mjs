import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../dist/server/app.js';

test('CORS permite sólo el frontend configurado, incluyendo respuestas de error', async () => {
  const origin = 'https://example.neocities.org';
  const server = createApp('', fetch, origin).listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const health = await fetch(`${base}/api/health`, { headers: { Origin: origin } });
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { ok: true });
    assert.equal(health.headers.get('access-control-allow-origin'), origin);
    const error = await fetch(`${base}/api/compare`, { headers: { Origin: origin } });
    assert.equal(error.status, 400);
    assert.equal(error.headers.get('access-control-allow-origin'), origin);
    const other = await fetch(`${base}/api/health`, { headers: { Origin: 'https://other.neocities.org' } });
    assert.equal(other.headers.get('access-control-allow-origin'), null);
    const preflight = await fetch(`${base}/api/compare`, { method: 'OPTIONS', headers: { Origin: origin, 'Access-Control-Request-Method': 'GET' } });
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers.get('access-control-allow-methods'), 'GET, OPTIONS');
  } finally { await new Promise(resolve => server.close(resolve)); }
});

test('rechaza configurar un origen con rutas', () => {
  assert.throws(() => createApp('', fetch, 'https://example.neocities.org/steam'));
});
