import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const origin = 'https://v3-cinemeta.strem.io';
const pinnedId = 'tt0121955';

async function get(path) {
  let url = new URL(path, origin);
  for (let attempt = 0; attempt < 4; attempt++) {
    const response = await fetch(url, {
      headers: { accept: 'application/json', 'user-agent': 'Prism-Series-Sync/1.0' },
      redirect: 'manual',
      signal: AbortSignal.timeout(20_000),
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      if (!location) throw new Error('Series catalog redirect had no destination.');
      url = new URL(location, url);
      if (url.protocol !== 'https:' || url.username || url.password || !['v3-cinemeta.strem.io', 'cinemeta-catalogs.strem.io'].includes(url.hostname)) {
        throw new Error('Series catalog redirected outside its verified services.');
      }
      continue;
    }
    if (!response.ok) throw new Error(`Series catalog returned ${response.status} for ${path}`);
    return response.json();
  }
  throw new Error('Series catalog redirected too many times.');
}

function normalize(meta) {
  const id = meta.id || meta.imdb_id;
  const genres = meta.genres || meta.genre || [];
  const tmdbId = Number(meta.moviedb_id);
  return {
    id,
    title: meta.name,
    year: String(meta.releaseInfo || meta.year || '').slice(0, 4),
    genre: genres[0] || 'TV Series',
    genres,
    poster: meta.poster,
    backdrop: meta.background || meta.poster,
    description: meta.description || '',
    rating: Number(meta.imdbRating) || null,
    tmdbId: Number.isSafeInteger(tmdbId) && tmdbId > 0 ? tmdbId : null,
    type: 'series',
    runtime: meta.runtime || '',
    status: meta.status || '',
    seasonCount: new Set((meta.videos || []).filter(video => Number.isInteger(video.season) && video.season > 0).map(video => video.season)).size,
    ...(meta.trailerStreams?.[0]?.ytId ? { trailer: `https://www.youtube.com/watch?v=${meta.trailerStreams[0].ytId}` } : {}),
    source: 'Cinemeta',
    sourceUrl: `https://www.imdb.com/title/${id}/`,
  };
}

const [catalog, southPark] = await Promise.all([
  get('/catalog/series/top.json'),
  get(`/meta/series/${pinnedId}.json`),
]);
if (!southPark.meta || southPark.meta.id !== pinnedId || Number(southPark.meta.moviedb_id) !== 2190) {
  throw new Error('South Park metadata could not be verified; saved catalog was not replaced.');
}
const records = new Map([[pinnedId, normalize(southPark.meta)]]);
for (const meta of catalog.metas || []) {
  const id = meta.id || meta.imdb_id;
  if (/^tt\d{5,12}$/.test(id) && meta.name && meta.poster && !records.has(id)) records.set(id, normalize(meta));
}
if (records.size < 2) throw new Error('The series catalog was empty; saved catalog was not replaced.');
await Promise.all(['poster', 'backdrop'].map(async (kind) => {
  const pinned = records.get(pinnedId);
  const remote = pinned[kind];
  if (!remote) return;
  try {
    const response = await fetch(remote, { signal: AbortSignal.timeout(15_000) });
    if (!response.ok || !response.headers.get('content-type')?.startsWith('image/')) throw new Error(`Image returned ${response.status}`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength < 100) throw new Error('Image was empty');
    const directory = join(root, 'public', 'media', 'series');
    const name = `${pinnedId}${kind === 'backdrop' ? '-backdrop' : ''}.jpg`;
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, name), bytes);
    pinned[kind === 'poster' ? 'remotePoster' : 'remoteBackdrop'] = remote;
    pinned[kind] = `/media/series/${name}`;
  } catch (error) { console.warn(`South Park ${kind} kept remote: ${error.message}`); }
}));
const directory = join(root, 'public', 'data');
await mkdir(directory, { recursive: true });
await writeFile(join(directory, 'series.json'), JSON.stringify([...records.values()], null, 2) + '\n');
console.log(`Saved ${records.size} TV series; South Park pinned first with ${southPark.meta.videos?.length || 0} episode records available from the live metadata API.`);
