import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../dist/server/app.js';
import { getMultiplayerApps } from '../dist/server/steam.js';

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
    assert.equal(preflight.headers.get('access-control-allow-methods'), 'GET, POST, OPTIONS');
    assert.equal(preflight.headers.get('access-control-allow-headers'), 'Content-Type');
  } finally { await new Promise(resolve => server.close(resolve)); }
});

test('rechaza configurar un origen con rutas', () => {
  assert.throws(() => createApp('', fetch, 'https://example.neocities.org/steam'));
});

test('clasifica multijugador por categorías de Steam Store y conserva desconocidos', async () => {
  const calls = [];
  const fetcher = async url => {
    calls.push(url);
    const appid = Number(url.searchParams.get('appids'));
    if (appid === 987003) return new Response('', { status: 429 });
    const categories = appid === 987001 ? [{ id: 38, description: 'Online Co-op' }] : [{ id: 2, description: 'Single-player' }];
    return Response.json({ [appid]: { success: true, data: { categories } } });
  };
  const result = await getMultiplayerApps([987001, 987002, 987003], fetcher);
  assert.deepEqual(result.multiplayer, [987001]);
  assert.deepEqual(result.unknown, [987003]);
  assert.equal(calls.length, 3);
  assert.ok(calls.every(url => url.origin === 'https://store.steampowered.com' && url.searchParams.get('filters') === 'categories'));
});
