import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../dist/server/app.js';
import { compareLibraries, parseProfile } from '../dist/server/steam.js';

const id1 = '76561198000000001';
const id2 = '76561198000000002';
const id3 = '76561198000000003';
const game = (appid, name, minutes) => ({ appid, name, playtime_forever: minutes });

function steam({ libraries = [{ game_count: 2, games: [game(620, 'Portal 2', 1080), game(10, 'Alpha', 60)] }, { game_count: 3, games: [game(99, 'Other', 1), game(10, 'Alpha', 120), game(620, 'Portal 2', 720)] }], visibility = 3, playersMissing = false, vanityMissing = false } = {}) {
  return async url => {
    assert.equal(url.origin, 'https://api.steampowered.com');
    assert.equal(url.searchParams.get('key'), 'test-secret');
    let response;
    if (url.pathname.includes('ResolveVanityURL')) response = vanityMissing ? { success: 42 } : { success: 1, steamid: id1 };
    else if (url.pathname.includes('GetPlayerSummaries')) response = { players: playersMissing ? [] : [id1, id2, id3].map((steamid, i) => ({ steamid, personaname: ['Euge', 'Andrés', 'Ana'][i], communityvisibilitystate: visibility })) };
    else {
      assert.equal(url.searchParams.get('include_appinfo'), 'true');
      assert.equal(url.searchParams.get('include_played_free_games'), 'true');
      response = libraries[[id1, id2, id3].indexOf(url.searchParams.get('steamid'))];
    }
    return Response.json({ response });
  };
}

test('acepta URL, vanity e ID sin perder precisión', () => {
  for (const input of [id1, `https://steamcommunity.com/profiles/${id1}/?x=1`]) assert.deepEqual(parseProfile(input), { kind: 'id', value: id1 });
  for (const input of [' eujnia ', 'https://steamcommunity.com/id/eujnia/', 'steamcommunity.com/id/eujnia']) assert.deepEqual(parseProfile(input), { kind: 'vanity', value: 'eujnia' });
  for (const input of ['', 'https://evil.test/id/eujnia', 'https://steamcommunity.com.evil.test/id/eujnia', 'https://steamcommunity.com/profiles/nope', 'a/b']) assert.throws(() => parseProfile(input));
});

test('intersección ordenada, nombres reales y tiempos de cada usuario', async () => {
  const result = await compareLibraries(['eujnia', id2], 'test-secret', steam());
  assert.equal(result.count, 2);
  assert.deepEqual(result.games.map(g => g.name), ['Alpha', 'Portal 2']);
  assert.equal(result.games[1].playtimes[0].minutes, 1080);
  assert.equal(result.games[1].playtimes[1].minutes, 720);
  assert.equal(result.users[1].name, 'Andrés');
});

test('biblioteca explícitamente vacía y sin coincidencias', async () => {
  const result = await compareLibraries([id1, id2], 'test-secret', steam({ libraries: [{ game_count: 0 }, { game_count: 1, games: [game(1, 'One', 0)] }] }));
  assert.equal(result.count, 0);
  assert.match(result.notices[0], /Euge no tiene juegos/);
  const disjoint = await compareLibraries([id1, id2], 'test-secret', steam({ libraries: [{ game_count: 1, games: [game(1, 'One', 0)] }, { game_count: 1, games: [game(2, 'Two', 0)] }] }));
  assert.equal(disjoint.count, 0);
  assert.deepEqual(disjoint.notices, []);
});

test('tres personas: juegos de al menos dos, con horas sólo de sus propietarios', async () => {
  const libraries = [
    { game_count: 2, games: [game(1, 'Uno', 60), game(2, 'Dos', 100)] },
    { game_count: 3, games: [game(2, 'Dos', 200), game(1, 'Uno', 120), game(3, 'Tres', 0)] },
    { game_count: 3, games: [game(1, 'Uno', 180), game(3, 'Tres', 50), game(4, 'Solo', 10)] }
  ];
  const result = await compareLibraries([id1, id2, id3], 'test-secret', steam({ libraries }));
  assert.equal(result.count, 3);
  assert.deepEqual(result.games.map(game => game.appid), [1, 2, 3]);
  assert.deepEqual(result.users.map(user => user.name), ['Euge', 'Andrés', 'Ana']);
  assert.deepEqual(result.games[0].playtimes, [{ steamId: id1, minutes: 60 }, { steamId: id2, minutes: 120 }, { steamId: id3, minutes: 180 }]);
  assert.deepEqual(result.games[2].playtimes, [{ steamId: id2, minutes: 0 }, { steamId: id3, minutes: 50 }]);
  libraries[2] = { game_count: 0 };
  assert.equal((await compareLibraries([id1, id2, id3], 'test-secret', steam({ libraries }))).count, 2);
  libraries[2] = {};
  await assert.rejects(compareLibraries([id1, id2, id3], 'test-secret', steam({ libraries })), error => error.code === 'LIBRARY_UNAVAILABLE' && error.message.includes('Usuario 3'));
});

test('límites de cantidad y perfiles duplicados tras resolver vanity', async () => {
  for (const inputs of [[], [id1], Array(11).fill(id1)]) {
    await assert.rejects(compareLibraries(inputs, 'test-secret', steam()), { code: 'PROFILE_COUNT' });
  }
  await assert.rejects(compareLibraries(['eujnia', id1], 'test-secret', steam()), { code: 'DUPLICATE_PROFILE' });
});

for (const [name, options, code] of [
  ['perfil privado', { visibility: 1 }, 'PRIVATE_PROFILE'],
  ['ID inexistente', { playersMissing: true }, 'PROFILE_NOT_FOUND'],
  ['vanity inexistente', { vanityMissing: true }, 'PROFILE_NOT_FOUND'],
  ['biblioteca no accesible', { libraries: [{}, {}] }, 'LIBRARY_UNAVAILABLE'],
  ['respuesta incompleta', { libraries: [{ game_count: 2 }, {}] }, 'STEAM_ERROR']
]) test(name, async () => {
  await assert.rejects(compareLibraries(['eujnia', id2], 'test-secret', steam(options)), { code });
});

test('clave ausente, errores HTTP, red y JSON inválido', async () => {
  await assert.rejects(compareLibraries([id1, id2], '', steam()), { code: 'MISSING_API_KEY' });
  for (const fetcher of [async () => new Response('', { status: 500 }), async () => { throw new Error('secret'); }, async () => new Response('not json'), async () => Response.json({ response: null })]) {
    await assert.rejects(compareLibraries([id1, id2], 'test-secret', fetcher), { code: 'STEAM_ERROR' });
  }
  await assert.rejects(compareLibraries([id1, id2], 'test-secret', async () => new Response('', { status: 403 })), { code: 'INVALID_API_KEY' });
});

test('HTTP: sirve frontend y comparación; no expone clave ni archivos del servidor', async () => {
  const server = createApp('test-secret', steam()).listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const page = await fetch(base);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /Persona 1:/);
    assert.equal((await fetch(`${base}/assets/client/main.js`)).status, 200);
    for (const path of ['/.env', '/src/server/steam.ts', '/dist/server/index.js']) assert.equal((await fetch(base + path)).status, 404);
    const result = await fetch(`${base}/api/compare?user1=eujnia&user2=${id2}`);
    assert.equal(result.status, 200);
    const text = await result.text();
    assert.equal(JSON.parse(text).count, 2);
    assert.ok(!text.includes('test-secret'));
    const multiple = await fetch(`${base}/api/compare?user=${id1}&user=${id2}`);
    assert.equal(multiple.status, 200);
    assert.equal((await multiple.json()).users.length, 2);
    const tooMany = await fetch(`${base}/api/compare?${Array(11).fill(`user=${id1}`).join('&')}`);
    assert.equal(tooMany.status, 400);
    assert.equal((await tooMany.json()).error.code, 'PROFILE_COUNT');
    const invalid = await fetch(`${base}/api/compare?user1=&user2=${id2}`);
    assert.equal(invalid.status, 400);
    assert.equal((await invalid.json()).error.code, 'EMPTY_INPUT');
    const duplicate = await fetch(`${base}/api/compare?user1=a&user1=b&user2=${id2}`);
    assert.equal(duplicate.status, 400);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
