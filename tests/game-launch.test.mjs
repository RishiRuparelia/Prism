import test from 'node:test';
import assert from 'node:assert/strict';
import { gameLaunchUrl, loadGamePages } from '../public/prism/game-launch.js';

test('imported entries use the local Prism loader page while other games keep their original launch', () => {
  const slope = { id: 'slope', url: 'https://55gms.com/misc/slope/index.html', usesProxy: false };
  assert.equal(gameLaunchUrl(slope, { slope: '/game-pages/slope/index.html' }), '/game-pages/slope/index.html');
  assert.equal(gameLaunchUrl(slope), slope.url);
  const external = { id: 'external-game', url: 'https://example.com/play?a=1&b=2', usesProxy: true };
  assert.equal(new URL(gameLaunchUrl(external), 'https://prism.example').searchParams.get('url'), external.url);
});

test('a malformed manifest cannot redirect games or substitute another game entry', () => {
  const game = { id: 'slope', url: 'https://55gms.com/misc/slope/index.html' };
  for (const entry of ['https://other.example/game', '//other.example/game', '/game-pages/other-game/index.html', '/game-pages/slope/../other/index.html', '/game-pages/slope/index.html?url=elsewhere', null, {}]) assert.equal(gameLaunchUrl(game, { slope: entry }), game.url);
  assert.equal(gameLaunchUrl({ ...game, id: '../other' }, { '../other': '/game-pages/../other/index.html' }), game.url);
});


test('optional game manifest success validates local entries and cancels its deadline', async () => {
  let requested, signal;
  const result = await loadGamePages(async (url, options) => {
    requested = url; signal = options.signal;
    return { ok: true, json: async () => ({ version: 1, pages: { slope: '/game-pages/slope/index.html', other: 'https://external.example/elsewhere', '../escape': '/game-pages/../escape/index.html' } }) };
  }, { timeoutMs: 20 });
  assert.equal(requested, '/data/game-pages.json');
  assert.deepEqual(result, { slope: '/game-pages/slope/index.html' });
  assert.equal(signal.aborted, true, 'Finished requests must release their controller');
});

test('hanging optional manifest fetch expires and preserves original game launches', async () => {
  let signal;
  const started = Date.now();
  const pages = await loadGamePages((url, options) => { signal = options.signal; return new Promise(() => {}); }, { timeoutMs: 20 });
  assert.deepEqual(pages, {});
  assert.equal(signal.aborted, true);
  assert.ok(Date.now() - started < 1000, 'A stalled optional fetch must settle promptly');
  const game = { id: 'slope', url: 'https://55gms.com/misc/slope/index.html' };
  assert.equal(gameLaunchUrl(game, pages), game.url);
});

test('one deadline also bounds a manifest body that never finishes parsing', async () => {
  let signal;
  const started = Date.now();
  const pages = await loadGamePages(async (url, options) => {
    signal = options.signal;
    return { ok: true, json: () => new Promise(() => {}) };
  }, { timeoutMs: 20 });
  assert.deepEqual(pages, {});
  assert.equal(signal.aborted, true);
  assert.ok(Date.now() - started < 1000, 'JSON body parsing must share the fetch deadline');
});

test('optional manifest errors, missing files, and malformed schemas use original launches', async () => {
  let parsed404 = false;
  assert.deepEqual(await loadGamePages(async () => ({ ok: false, json: async () => { parsed404 = true; throw new Error('404 body'); } })), {});
  assert.equal(parsed404, false);
  assert.deepEqual(await loadGamePages(async () => { throw new Error('offline'); }), {});
  assert.deepEqual(await loadGamePages(async () => ({ ok: true, json: async () => { throw new SyntaxError('invalid JSON'); } })), {});
  for (const data of [null, {}, { version: 2, pages: {} }, { version: 1, pages: [] }, { version: 1, pages: 'wrong' }]) {
    assert.deepEqual(await loadGamePages(async () => ({ ok: true, json: async () => data })), {});
  }
});
