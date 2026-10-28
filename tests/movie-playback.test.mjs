import test from 'node:test';
import assert from 'node:assert/strict';
import { proxyLandingUrl, proxyPreference, prepareMovieProxy, proxiedVideoUrl, embeddedFailureMessage } from '../public/prism/movie-playback.js';

test('movie playback defaults to proxy and respects an explicit Direct preference', () => {
  assert.equal(proxyPreference({}), true);
  assert.equal(proxyPreference({ name: 'Explorer', proxyMovies: false }), false);
  assert.equal(proxyPreference({ proxyMovies: true }), true);
});

test('movie embeds stay on the Prism origin', () => {
  const target = 'https://vidsrc.party/embed/movie/157336?quality=hd&autoplay=1';
  const landing = proxyLandingUrl(target);
  assert.equal(new URL(landing, 'http://localhost:8080').origin, 'http://localhost:8080');
  assert.equal(new URL(landing, 'http://localhost:8080').searchParams.get('url'), target);
  assert.throws(() => proxyLandingUrl('javascript:alert(1)'), /HTTP or HTTPS/);
});

test('direct video uses the controlled service path after proxy activation', async () => {
  let registration;
  const config = { prefix: '/service/', encodeUrl: encodeURIComponent };
  const serviceWorker = {
    controller: {}, ready: Promise.resolve({ active: {} }),
    async register(...args) { registration = args; },
  };
  const active = await prepareMovieProxy({ navigator: { serviceWorker }, secureContext: true, config });
  assert.deepEqual(registration, ['/sw.js', { scope: '/' }]);
  const video = 'https://archive.org/download/HisGirlFriday/film.mp4';
  assert.equal(proxiedVideoUrl(video, active), '/service/' + encodeURIComponent(video));
});

test('movie playback waits for first-page control before starting video', async () => {
  const events = new EventTarget();
  const serviceWorker = {
    controller: null, ready: Promise.resolve({ active: {} }), async register() {},
    addEventListener: events.addEventListener.bind(events),
    removeEventListener: events.removeEventListener.bind(events),
  };
  let resolved = false;
  const ready = prepareMovieProxy({ navigator: { serviceWorker }, secureContext: true, config: { prefix: '/service/', encodeUrl: encodeURIComponent }, timeoutMs: 200 }).then(() => { resolved = true; });
  await new Promise(resolve => setTimeout(resolve, 5));
  assert.equal(resolved, false);
  serviceWorker.controller = {};
  events.dispatchEvent(new Event('controllerchange'));
  await ready;
  assert.equal(resolved, true);
});

test('unsupported contexts and activation failures offer a direct playback recovery', async () => {
  await assert.rejects(prepareMovieProxy({ navigator: {}, secureContext: false }), /Choose Direct/);
  await assert.rejects(prepareMovieProxy({ navigator: { serviceWorker: { async register() { throw new Error('Registration failed'); } } }, secureContext: true, config: { prefix: '/service/', encodeUrl: encodeURIComponent } }), /choose Direct/);
  await assert.rejects(prepareMovieProxy({ navigator: { serviceWorker: { register: () => new Promise(() => {}) } }, secureContext: true, config: { prefix: '/service/', encodeUrl: encodeURIComponent }, timeoutMs: 5 }), /choose Direct/);
});

test('embedded hosting errors show recovery without mistaking normal movie content for failure', () => {
  assert.match(embeddedFailureMessage('This site is not available. Coolify'), /Retry the player or switch connection/);
  assert.match(embeddedFailureMessage('No available server'), /unavailable/);
  assert.match(embeddedFailureMessage('Sandbox is not allowed'), /does not support/);
  assert.equal(embeddedFailureMessage('Interstellar — press Play to start. Some subtitles may be unavailable.'), '');
});
