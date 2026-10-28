import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeEpisodes, seasonsFor, initialEpisode, adjacentEpisode, episodeLabel, seriesPlayerUrl, episodeReleased } from '../public/prism/series-state.js';

const episodes = normalizeEpisodes([
  { id: 'special', season: 0, number: 1, name: 'Special' },
  { id: 'two', season: '1', episode: '2', title: 'Second episode', released: '2000-01-08' },
  { id: 'one', season: 1, episode: 1, name: 'First episode', firstAired: '2000-01-01', description: 'A beginning.' },
  { id: 'three', season: 2, episode: 1, title: 'New season', released: '2001-01-01' },
  { id: 'future', season: 2, episode: 2, title: 'Coming soon', released: '2099-01-01' },
  { id: 'invalid', season: 1, title: 'No episode number' },
  { id: 'duplicate', season: 1, episode: 2, title: 'Duplicate' },
]);

test('episode metadata handles Cinemeta aliases, specials, duplicates, and season order', () => {
  assert.deepEqual(episodes.map(episode => `${episode.season}:${episode.episode}`), ['0:1', '1:1', '1:2', '2:1', '2:2']);
  assert.equal(episodes[1].title, 'First episode');
  assert.equal(episodes[1].overview, 'A beginning.');
  assert.deepEqual(seasonsFor(episodes), [0, 1, 2]);
  assert.equal(episodeLabel(episodes[1]), 'S01 E01');
});

test('a new show starts with its first regular episode and resumes saved selections', () => {
  assert.equal(initialEpisode(episodes).id, 'one');
  assert.equal(initialEpisode(episodes, { season: 2, episode: 1 }).id, 'three');
  assert.equal(initialEpisode(episodes, { season: 2, episode: 2 }).id, 'one');
  assert.equal(initialEpisode([], null), null);
});

test('episode navigation crosses seasons and skips unreleased episodes', () => {
  assert.equal(adjacentEpisode(episodes, episodes[2], 1).id, 'three');
  assert.equal(adjacentEpisode(episodes, episodes[3], 1), null);
  assert.equal(adjacentEpisode(episodes, episodes[1], -1).id, 'special');
  assert.equal(episodeReleased(episodes[4]), false);
});

test('South Park playback includes the selected season and episode', () => {
  assert.equal(seriesPlayerUrl({ id: 'tt0121955', tmdbId: 2190 }, { season: 3, episode: 7 }), 'https://vidsrc.party/embed/tv/2190/3/7');
  assert.equal(seriesPlayerUrl({ id: 'tt0121955' }, { season: 0, episode: 1 }, { tvProvider: 'https://player.example/tv/{imdb}/{season}/{episode}' }), 'https://player.example/tv/tt0121955/0/1');
});

test('invalid TV provider templates and missing selections show actionable errors', () => {
  assert.throws(() => seriesPlayerUrl({ tmdbId: 2190 }, null), /Choose an episode/);
  assert.throws(() => seriesPlayerUrl({ tmdbId: 2190 }, episodes[1], { tvProvider: 'https://player.example/{id}' }), /needs \{season\} and \{episode\}/);
  assert.throws(() => seriesPlayerUrl({}, episodes[1]), /no TV playback ID/);
  assert.throws(() => seriesPlayerUrl({ tmdbId: 2190 }, episodes[1], { tvProvider: 'javascript:{season}/{episode}' }), /HTTP or HTTPS/);
});
