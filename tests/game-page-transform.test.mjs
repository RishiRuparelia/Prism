import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import {
  SOURCE_COMMIT, gameSourcePath, gameEntryUrl, isSharedLoaderPage, transformGamePage,
} from '../scripts/game-page-transform.mjs';

const game = { id: 'example-game', sourcePath: '/misc/example/index.html?level=2' };
const base = '<base href="https://cdn.jsdelivr.net/gh/55gms/assets@1234567890/misc/example/">';
const sample = '<!doctype html><html><head>' +
  '<script src="/assets/js/save-agent.js?v=4"></script>' +
  '<script src="/assets/js/loader-ui.js"></script>' +
  '<script src="/assets/js/game-loader.js?v=old" data-title="Example game"></script>' +
  '<script>GameLoader.unity([["Build/game.data",123]]);</script>' + base +
  '<script type="module" src="/assets/js/unity-cdn-loader.js"></script>' +
  '<link rel="stylesheet" href="/assets/css/game-loader.css">' +
  '<script src="/assets/js/script.js?v=28"></script>' +
  '<script src="https://cdn.jsdelivr.net/gh/55gms/gms-ads@abc/embed/dist/sdk.min.js" data-compat="poki"></script>' +
  '<title>Example game | 55GMS</title></head><body><p>Game by Native Author</p>' +
  '<script src="poki-sdk.js"></script></body></html>';

test('local helpers retain blocking order, module attributes, titles, and the original CDN base', () => {
  const output = transformGamePage(sample, game);
  const written = [];
  for (const match of output.matchAll(/<script data-prism-runtime="[^"]+">([\s\S]*?)<\/script>/g)) {
    vm.runInNewContext(match[1], { location: { origin: 'https://example.b-cdn.net' }, document: { write: html => written.push(html) } });
  }
  assert.equal(written.length, 4);
  assert.match(written[0], /src="https:\/\/example\.b-cdn\.net\/game-runtime\/loader-ui\.js\?v=prism-1"/);
  assert.match(written[1], /data-title="Example game"/);
  assert.match(written[2], /type="module"/);
  assert.match(written[3], /href="https:\/\/example\.b-cdn\.net\/game-runtime\/game-loader\.css\?v=prism-1"/);
  assert.ok(output.indexOf('data-prism-runtime="game-loader.js"') < output.indexOf('GameLoader.unity'));
  assert.ok(output.indexOf('GameLoader.unity') < output.indexOf(base));
  assert.equal(output.match(/<base\b/g).length, 1);
});

test('only known site scripts and site ad SDK are removed; native SDKs, engine calls, and credits survive', () => {
  const output = transformGamePage(sample, game);
  assert.doesNotMatch(output, /save-agent\.js|\/assets\/js\/script\.js|gms-ads@/);
  assert.match(output, /<script src="poki-sdk\.js"><\/script>/);
  assert.match(output, /GameLoader\.unity\(\[\["Build\/game\.data",123\]\]\)/);
  assert.match(output, /Game by Native Author/);
  assert.match(output, /Example game \| PRISM/);
});

test('a page without a base gains its pinned source directory while absolute engine URLs stay unchanged', () => {
  const output = transformGamePage(sample.replace(base, ''), game);
  assert.match(output, new RegExp('<base href="https://cdn.jsdelivr.net/gh/55gms/55GMS@' + SOURCE_COMMIT + '/static/misc/example/">'));
});

test('catalog paths and ids are bounded; existing game query parameters survive', () => {
  assert.deepEqual(gameSourcePath(game), { path: '/misc/example/index.html', search: '?level=2' });
  assert.equal(gameSourcePath({ sourcePath: '/misc/example/' }).path, '/misc/example/index.html');
  assert.equal(gameEntryUrl(game), '/game-pages/example-game/index.html?level=2');
  for (const id of ['../escape', 'a/b', '', 'x'.repeat(101)]) assert.throws(() => gameEntryUrl({ ...game, id }));
  for (const sourcePath of ['https://evil.test/a.html', '/misc/../admin.html', '/api/private', '/misc/a.js']) {
    assert.throws(() => gameSourcePath({ sourcePath }));
  }
});

test('unsupported helpers fail visibly instead of reaching the old site application', () => {
  assert.equal(isSharedLoaderPage('<script src="game.js"></script>'), false);
  assert.throws(() => transformGamePage('<script src="game.js"></script>', game), /supported shared loader/);
  assert.throws(() => transformGamePage(sample + '<script src="/assets/js/account.js"></script>', game), /Unmapped site helper/);
});

test('checked-in import contains 151 unique local entries and preserves their CDN engine bases', async () => {
  const manifest = JSON.parse(await readFile(new URL('../public/data/game-pages.json', import.meta.url), 'utf8'));
  assert.equal(manifest.sourceCommit, SOURCE_COMMIT);
  assert.equal(manifest.gameCount, 151);
  assert.equal(Object.keys(manifest.pages).length, 151);
  let gameLoaderCount = 0;
  let unityCount = 0;
  for (const [id, entry] of Object.entries(manifest.pages)) {
    assert.match(id, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    assert.equal(entry, '/game-pages/' + id + '/index.html');
    const html = await readFile(new URL('../public' + entry, import.meta.url), 'utf8');
    assert.match(html, /<base\s+href="https:\/\//i);
    assert.doesNotMatch(html, /src=["']\/assets\/js\/|href=["']\/assets\/css\/|gms-ads@/);
    if (html.includes('data-prism-runtime="game-loader.js"')) gameLoaderCount++;
    if (html.includes('data-prism-runtime="unity-cdn-loader.js"')) unityCount++;
  }
  assert.equal(gameLoaderCount, 130);
  assert.equal(unityCount, 21);
  const unity = await readFile(new URL('../public/game-runtime/unity-cdn-loader.js', import.meta.url), 'utf8');
  assert.match(unity, /\/game-runtime\/loader-ui\.js\?v=prism-1/);
  assert.doesNotMatch(unity, /\/assets\/js\/loader-ui\.js/);
});


