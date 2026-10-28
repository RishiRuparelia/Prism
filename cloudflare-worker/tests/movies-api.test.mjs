import test from 'node:test';
import assert from 'node:assert/strict';
import { GET } from '../app/api/movies/route.ts';

const request = (query) => new Request('http://localhost:8080/api/movies?' + query);

test('defaults to the existing movie endpoint and preserves its response', async (context) => {
  const movie = { meta: { id: 'tt0816692', name: 'Interstellar', moviedb_id: 157336 } };
  let called;
  context.mock.method(globalThis, 'fetch', async (url, init) => { called = { url, init }; return Response.json(movie); });
  const response = await GET(request('id=tt0816692'));
  assert.equal(called.url, 'https://v3-cinemeta.strem.io/meta/movie/tt0816692.json');
  assert.equal(called.init.redirect, 'manual');
  assert.deepEqual(await response.json(), movie);
  assert.equal(response.status, 200);
});

test('series metadata includes the verified TV mapping, seasons, episodes and specials', async (context) => {
  context.mock.method(globalThis, 'fetch', async (url) => {
    assert.equal(url, 'https://v3-cinemeta.strem.io/meta/series/tt0121955.json');
    return Response.json({ meta: {
      id: 'tt0121955', name: 'South Park', moviedb_id: 2190, genre: ['Animation', 'Comedy'],
      videos: [
        { name: 'Special', season: 0, number: 1, firstAired: '1992-12-15T00:00:00.000Z' },
        { name: 'Pilot', season: '1', episode: '1', overview: 'Episode synopsis', released: '1997-08-13T00:00:00.000Z' },
        { name: 'Broken record', season: -1, episode: 4 },
      ],
    } });
  });
  const response = await GET(request('type=series&id=tt0121955'));
  const { meta } = await response.json();
  assert.equal(meta.title, 'South Park');
  assert.equal(meta.tmdbId, 2190);
  assert.equal(meta.type, 'series');
  assert.deepEqual(meta.genres, ['Animation', 'Comedy']);
  assert.equal(meta.videos.length, 2);
  assert.equal(meta.videos[0].season, 0);
  assert.equal(meta.videos[0].episode, 1);
  assert.equal(meta.videos[0].released, '1992-12-15T00:00:00.000Z');
  assert.equal(meta.videos[1].season, 1);
  assert.equal(meta.videos[1].title, 'Pilot');
  assert.equal(meta.videos[1].description, 'Episode synopsis');
});

test('series search encodes the query as data in the series catalog route', async (context) => {
  let called;
  context.mock.method(globalThis, 'fetch', async (url) => {
    called = url;
    return Response.json({ metas: [{ id: 'tt0121955', name: 'South Park', moviedb_id: '2190' }] });
  });
  const response = await GET(request('type=series&q=' + encodeURIComponent('South Park / comedy?')));
  assert.equal(called, 'https://v3-cinemeta.strem.io/catalog/series/top/search=South%20Park%20%2F%20comedy%3F.json');
  assert.equal((await response.json()).metas[0].tmdbId, 2190);
});

test('rejects unsupported types, injected IDs, blank queries and oversized inputs before fetching', async (context) => {
  const fetch = context.mock.method(globalThis, 'fetch', async () => { throw new Error('Should not fetch'); });
  for (const query of ['type=../../movie&q=test', 'type=tv&q=test', 'type=series&id=../../movie', 'type=series&id=', 'type=series&q=', 'type=series&q=' + 'a'.repeat(101), 'type=series&q=abc%00def']) {
    assert.equal((await GET(request(query))).status, 400, query);
  }
  assert.equal(fetch.mock.callCount(), 0);
});

test('returns a useful error when the upstream catalog is unavailable or malformed', async (context) => {
  const fetch = context.mock.method(globalThis, 'fetch', async () => new Response('Unavailable', { status: 503 }));
  assert.equal((await GET(request('type=series&q=South%20Park'))).status, 502);
  fetch.mock.mockImplementation(async () => Response.json({ unexpected: true }));
  const response = await GET(request('type=series&id=tt0121955'));
  assert.equal(response.status, 502);
  assert.match((await response.json()).error, /saved collection still works/);
});

test('follows catalog redirects only to the verified Cinemeta catalog service', async (context) => {
  const calls = [];
  const fetch = context.mock.method(globalThis, 'fetch', async (url) => {
    calls.push(url);
    if (calls.length === 1) return new Response(null, { status: 307, headers: { location: 'https://cinemeta-catalogs.strem.io/top/catalog/series/top.json' } });
    return Response.json({ metas: [] });
  });
  assert.equal((await GET(request('type=series&q=South'))).status, 200);
  assert.equal(calls.length, 2);
  fetch.mock.mockImplementation(async () => new Response(null, { status: 307, headers: { location: 'http://127.0.0.1/private' } }));
  assert.equal((await GET(request('type=series&q=South'))).status, 502);
  assert.equal(fetch.mock.callCount(), 3);
});
