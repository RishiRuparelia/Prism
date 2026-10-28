import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { unzipSync, strFromU8 } from 'fflate';
import {
  SOURCE_COMMIT, SOURCE_ARCHIVE_SHA256, gameSourcePath, gameEntryUrl,
  isSharedLoaderPage, transformGamePage,
} from './game-page-transform.mjs';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const prefix = '55GMS-' + SOURCE_COMMIT + '/';
const helperFiles = [
  ['assets/js/game-loader.js', 'game-loader.js'],
  ['assets/js/game-parts.js', 'game-parts.js'],
  ['assets/js/cdn-compat.js', 'cdn-compat.js'],
  ['assets/js/unity-cdn-loader.js', 'unity-cdn-loader.js'],
  ['assets/js/unity-cdn-assets.js', 'unity-cdn-assets.js'],
  ['assets/css/unity-cdn-loader.css', 'unity-cdn-loader.css'],
  ['assets/css/game-loader.css', 'game-loader.css'],
  ['assets/fonts/inter-regular.ttf', 'inter-regular.ttf'],
];

async function save(file, contents) {
  await mkdir(dirname(file), { recursive: true });
  const temporary = file + '.import-tmp';
  await writeFile(temporary, contents);
  await rename(temporary, file);
}

export async function importGamePages({ root = projectRoot, archive } = {}) {
  archive ||= join(root, 'outputs', 'source', '55GMS-' + SOURCE_COMMIT + '.zip');
  let bytes;
  try { bytes = await readFile(archive); } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    throw new Error('Missing pinned archive: ' + archive + '\nDownload https://codeload.github.com/55gms/55GMS/zip/' +
      SOURCE_COMMIT + ' to this filename, then rerun games:import. Generated pages are already checked in.');
  }
  const digest = createHash('sha256').update(bytes).digest('hex');
  if (digest !== SOURCE_ARCHIVE_SHA256) throw new Error('Pinned source archive SHA-256 mismatch');
  const games = JSON.parse(await readFile(join(root, 'public', 'data', 'games.json'), 'utf8'));
  const info = JSON.parse(await readFile(join(root, 'public', 'data', 'catalog-info.json'), 'utf8'));
  if (info.commit !== SOURCE_COMMIT) throw new Error('Catalog commit does not match the pinned game importer');
  const wanted = new Set(helperFiles.map(([source]) => prefix + 'static/' + source));
  for (const game of games) if (game.sourcePath) wanted.add(prefix + 'static' + gameSourcePath(game).path);
  const files = unzipSync(bytes, { filter: file => wanted.has(file.name) && file.originalSize <= 16 * 1024 * 1024 });
  function source(path) {
    const contents = files[prefix + 'static/' + path];
    if (!contents) throw new Error('Missing pinned source: ' + path);
    return contents;
  }
  const entries = [];
  for (const game of games) {
    if (!game.sourcePath) continue;
    const html = strFromU8(source(gameSourcePath(game).path.slice(1)));
    if (isSharedLoaderPage(html)) entries.push({ game, html: transformGamePage(html, game) });
  }
  if (entries.length !== 151) throw new Error('Expected 151 pinned shared-loader games; found ' + entries.length);
  const pages = Object.fromEntries(entries.sort((a, b) => a.game.id.localeCompare(b.game.id, 'en'))
    .map(({ game }) => [game.id, gameEntryUrl(game)]));
  let totalBytes = 0;
  for (const { game, html } of entries) {
    await save(join(root, 'public', 'game-pages', game.id, 'index.html'), html);
    totalBytes += Buffer.byteLength(html);
  }
  for (const [original, local] of helperFiles) {
    let contents = source(original);
    if (local.endsWith('.js') || local.endsWith('.css')) {
      let text = strFromU8(contents);
      if (local === 'unity-cdn-loader.js') {
        text = text.replace('"/assets/js/loader-ui.js?v=5gz9swuael"', '"/game-runtime/loader-ui.js?v=prism-1"');
        if (text.includes('/assets/js/loader-ui.js')) throw new Error('Unmapped dynamic LoaderUI import');
      }
      if (local === 'game-loader.css') text = text.replace('/assets/fonts/inter-regular.ttf', './inter-regular.ttf');
      contents = '/* 55GMS ' + SOURCE_COMMIT + '; AGPL-3.0. Source and license: /credits.html. */\n' + text;
    }
    await save(join(root, 'public', 'game-runtime', local), contents);
    totalBytes += typeof contents === 'string' ? Buffer.byteLength(contents) : contents.byteLength;
  }
  const manifest = { version: 1, sourceCommit: SOURCE_COMMIT, gameCount: entries.length, pages };
  await save(join(root, 'public', 'data', 'game-pages.json'), JSON.stringify(manifest, null, 2) + '\n');
  return { ...manifest, totalBytes };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const args = process.argv.slice(2);
    if (args.length && (args.length !== 2 || args[0] !== '--archive')) throw new Error('Usage: node scripts/import-game-pages.mjs [--archive path-to-pinned.zip]');
    const result = await importGamePages({ archive: args[1] && resolve(args[1]) });
    console.log('Imported ' + result.gameCount + ' local game entries and 8 engine helpers (' +
      (result.totalBytes / 1024 / 1024).toFixed(2) + ' MiB). Large game assets remain on their original CDNs.');
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

