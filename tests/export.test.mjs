import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

test('exporta sólo la página con iframe HTTPS y sin secretos', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'steam-export-'));
  try {
    await mkdir(join(cwd, 'public/assets/client'), { recursive: true });
    for (const file of ['index.html', 'style.css', 'assets/client/main.js']) await writeFile(join(cwd, 'public', file), 'public file');
    await writeFile(join(cwd, '.env'), 'STEAM_API_KEY=secret');
    const script = fileURLToPath(new URL('../scripts/export-neocities.mjs', import.meta.url));
    const run = base => spawnSync(process.execPath, [script], { cwd, env: { ...process.env, API_BASE_URL: base }, encoding: 'utf8' });
    assert.notEqual(run('').status, 0);
    assert.notEqual(run('http://example.com').status, 0);
    assert.equal(run('https://example.onrender.com/').status, 0);
    const output = join(cwd, 'neocities-upload');
    assert.deepEqual(await readdir(output), ['index.html']);
    const html = await readFile(join(output, 'index.html'), 'utf8');
    assert.match(html, /iframe src="https:\/\/example.onrender.com\/"/);
    assert.ok(!html.includes('secret'));
  } finally { await rm(cwd, { recursive: true, force: true }); }
});
