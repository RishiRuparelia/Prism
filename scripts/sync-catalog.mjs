import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = join(root, 'public', 'data');
const sourceRepo = '55gms/55GMS';
const sourceOrigin = 'https://55gms.com';
const headers = { 'User-Agent': 'Rooster-Catalog-Sync/1.0', Accept: 'application/json' };

async function request(url, type = 'json') {
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(45000) });
  if (!response.ok) throw new Error(`${response.status} while fetching ${url}`);
  return type === 'json' ? response.json() : type === 'text' ? response.text() : Buffer.from(await response.arrayBuffer());
}

async function saveJson(name, data) {
  await mkdir(dataDir, { recursive: true });
  await writeFile(join(dataDir, name), JSON.stringify(data, null, 2) + '\n');
}

function category(name) {
  if (/race|racing|drift|car\b|drive|driving|moto|bike|track|traffic|truck|wheel|rally/i.test(name)) return 'Racing';
  if (/basket|soccer|football|sport|golf|baseball|tennis|volley|bowl|boxing|hockey|pool|world cup|rocket league/i.test(name)) return 'Sports';
  if (/word|2048|puzzle|chess|sudoku|tetris|blox|watermelon|cut the rope|alchemy|minesweeper|mahjong|connections|we become/i.test(name)) return 'Puzzle';
  if (/clicker|idle|cookie|craft|life|simulator|tycoon|papas|cooking|adventure capitalist/i.test(name)) return 'Casual';
  if (/\.io\b|1v1|multiplayer|among|roblox|minecraft|eagler|smash karts|stumble|showdown/i.test(name)) return 'Multiplayer';
  if (/gun|shot|shoot|tank|doom|zombie|war|fight|combat|knife|strike|fnaf|nights|horror|murder|sniper|hitman|hobo|madness/i.test(name)) return 'Action';
  return 'Arcade';
}

function normalizeGame(game, index, sha) {
  let sourcePath;
  let author = game.author || '';
  let target;
  if (game.url) {
    const url = new URL(/^\w[\w.-]+\.[a-z]{2,}\/?$/i.test(game.url) ? `https://${game.url}` : game.url, sourceOrigin);
    if (url.pathname.startsWith('/misc/play/')) {
      const link = url.searchParams.get('link');
      if (link) {
        const cleaned = link.replace(/^\/+|\/+$/g, '');
        const split = cleaned.indexOf('?');
        const path = split < 0 ? cleaned : cleaned.slice(0, split);
        const query = split < 0 ? '' : cleaned.slice(split);
        const last = path.split('/').at(-1);
        sourcePath = `/misc/${path}${last.includes('.') ? '' : '/index.html'}${query}`;
        author ||= url.searchParams.get('author') || '';
      }
    } else if (url.origin === sourceOrigin) sourcePath = url.pathname + url.search;
    target = sourcePath ? new URL(sourcePath, sourceOrigin).href : url.href;
  } else if (game.author && game.image) {
    const slug = new URL(game.image, sourceOrigin).pathname.split('/').filter(Boolean).at(-2);
    sourcePath = `/misc/${slug}/index.html`;
    target = new URL(sourcePath, sourceOrigin).href;
  }
  if (!target) throw new Error(`Cannot resolve game ${game.name}`);
  const id = game.name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || `game-${index}`;
  return {
    id, name: game.name, title: game.name, url: target,
    image: new URL(game.image, sourceOrigin).href,
    category: category(game.name), author: author || 'Independent developer',
    usesProxy: Boolean(game.usesProxy),
    sourceUrl: sourcePath ? `https://cdn.jsdelivr.net/gh/${sourceRepo}@${sha}/static${sourcePath}` : target,
    ...(sourcePath ? { sourcePath } : {}),
    ...(game.preview ? { preview: new URL(game.preview, sourceOrigin).href } : {}),
    ...(game.alert ? { note: game.alert } : {}),
  };
}

function normalizeMovie(meta) {
  const genres = meta.genres || meta.genre || [];
  return {
    id: meta.id || meta.imdb_id, title: meta.name,
    year: String(meta.releaseInfo || meta.year || '').slice(0, 4),
    genre: genres[0] || 'Movie', genres,
    poster: meta.poster, backdrop: meta.background || meta.poster,
    description: meta.description || '', rating: Number(meta.imdbRating) || null,
    tmdbId: meta.moviedb_id || null, runtime: meta.runtime || '',
    ...(meta.trailerStreams?.[0]?.ytId ? { trailer: `https://www.youtube.com/watch?v=${meta.trailerStreams[0].ytId}` } : {}),
    source: 'Cinemeta', sourceUrl: `https://www.imdb.com/title/${meta.id || meta.imdb_id}/`,
  };
}

async function parallel(items, limit, work) {
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(items.length, limit) }, async () => {
    while (next < items.length) await work(items[next++]);
  }));
}

async function cacheImage(url, destination) {
  try {
    const bytes = await request(url, 'buffer');
    if (bytes.length < 100) return false;
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, bytes);
    return true;
  } catch (error) {
    console.warn(`Image unavailable: ${url}: ${error.message}`);
    return false;
  }
}

await mkdir(dataDir, { recursive: true });
const tree = await request(`https://api.github.com/repos/${sourceRepo}/git/trees/main?recursive=1`);
const sha = tree.sha;
const raw = await request(`https://raw.githubusercontent.com/${sourceRepo}/${sha}/static/assets/json/load/g.json`);
const requestEntry = raw.find(game => /Request A Game/i.test(game.name));
const games = raw.filter(game => !/Request A Game/i.test(game.name)).map((game, i) => normalizeGame(game, i, sha));
await saveJson('games-source.json', raw);
await saveJson('games.json', games);

const moviesById = new Map();
for (const url of ['https://v3-cinemeta.strem.io/catalog/movie/top.json', 'https://v3-cinemeta.strem.io/catalog/movie/top/skip=100.json']) {
  try {
    const catalog = await request(url);
    for (const meta of catalog.metas || []) if (meta.poster && meta.name) moviesById.set(meta.id || meta.imdb_id, normalizeMovie(meta));
  } catch (error) { console.warn(`Movie catalog unavailable: ${error.message}`); }
}
const movies = [...moviesById.values()];
if (!movies.length) throw new Error('No movies returned by Cinemeta');
await saveJson('movies.json', movies);

const classicItems = [
  { id: 'Nosferatu1922', title: 'Nosferatu', year: '1922', genre: 'Horror', description: 'A shadow falls across a German town when a mysterious count arrives from Transylvania.' },
  { id: 'The_General_Buster_Keaton', title: 'The General', year: '1926', genre: 'Comedy', description: 'A railroad engineer gives chase when spies steal his beloved locomotive in Buster Keaton’s silent classic.' },
  { id: 'HisGirlFriday', title: 'His Girl Friday', year: '1940', genre: 'Comedy', description: 'An editor and his star reporter race against a deadline in a fast-talking newsroom comedy.' },
];
const classics = [];
for (const item of classicItems) {
  try {
    const meta = await request(`https://archive.org/metadata/${item.id}`);
    const videos = (meta.files || []).filter(file => file.name.endsWith('.mp4')).sort((a, b) => Number(a.size) - Number(b.size));
    if (!videos.length) continue;
    classics.push({ ...item, genres: [item.genre], poster: `https://archive.org/services/img/${item.id}`, backdrop: `https://archive.org/services/img/${item.id}`, rating: null,
      src: `https://archive.org/download/${item.id}/${encodeURIComponent(videos[0].name)}`,
      source: 'Internet Archive', sourceUrl: `https://archive.org/details/${item.id}`, license: meta.metadata?.licenseurl || '', description: item.description,
    });
  } catch (error) { console.warn(`Classic unavailable: ${item.id}: ${error.message}`); }
}
await saveJson('classics.json', classics);

const priorityGames = ['Slope', 'Subway Surfers', 'Retro Bowl', 'Minecraft', '2048', '1v1.lol', 'Basketball Stars', 'Polytrack', 'Drift Hunters', 'Geometry Dash', 'Cookie Clicker', 'BitLife', 'Smash Karts', 'Crossy Road', 'Drive Mad', 'Snow Rider 3D', 'Basket Random', 'Among Us', 'Run 3', 'Happy Wheels', 'Tunnel Rush', 'Moto X3M', 'Vex 7', 'A Small World Cup'];
await parallel(games.filter(game => priorityGames.some(name => name.toLowerCase() === game.name.toLowerCase())), 5, async game => {
  const path = `/media/games/${game.id}.webp`;
  if (await cacheImage(game.image, join(root, 'public', path))) {
    game.remoteImage = game.image;
    game.image = path;
  }
});
await parallel(movies.slice(0, 12), 5, async movie => {
  const path = `/media/movies/${movie.id}.jpg`;
  if (await cacheImage(movie.poster, join(root, 'public', path))) { movie.remotePoster = movie.poster; movie.poster = path; }
});
await parallel(movies.slice(0, 3), 3, async movie => {
  const path = `/media/movies/${movie.id}-backdrop.jpg`;
  if (await cacheImage(movie.backdrop, join(root, 'public', path))) { movie.remoteBackdrop = movie.backdrop; movie.backdrop = path; }
});
await saveJson('games.json', games);
await saveJson('movies.json', movies);
const blobs = tree.tree.filter(item => item.type === 'blob');
await saveJson('catalog-info.json', {
  syncedAt: new Date().toISOString(), gameCount: games.length, originalCatalogCount: raw.length,
  movieCount: movies.length, classicCount: classics.length, requestGameUrl: requestEntry?.url,
  repository: `https://github.com/${sourceRepo}`, commit: sha,
  sourceBytes: blobs.reduce((sum, item) => sum + item.size, 0), sourceFileCount: blobs.length,
  catalogSource: `https://raw.githubusercontent.com/${sourceRepo}/${sha}/static/assets/json/load/g.json`,
  assetRepository: 'https://github.com/55gms/assets',
  movieCatalog: 'https://v3-cinemeta.strem.io/catalog/movie/top.json',
});
await writeFile(join(root, 'LICENSE'), await request(`https://raw.githubusercontent.com/${sourceRepo}/${sha}/LICENSE`, 'text'));

if (process.argv.includes('--source')) {
  const directory = join(root, 'outputs', 'source');
  await mkdir(directory, { recursive: true });
  const archive = await request(`https://codeload.github.com/${sourceRepo}/zip/${sha}`, 'buffer');
  const path = join(directory, `55GMS-${sha}.zip`);
  await writeFile(path, archive);
  console.log(`Source snapshot saved: ${path} (${archive.length} bytes)`);
}
console.log(`Synced ${games.length} games, ${movies.length} movies, and ${classics.length} classics at source ${sha}.`);
