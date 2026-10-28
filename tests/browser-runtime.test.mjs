import test from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate as nextTurn } from 'node:timers/promises';
import { prepareProxy, readProxyDestination } from '../public/prism/browser-runtime.js';

class TrackedEvents extends EventTarget {
  listeners = new Map();
  addEventListener(type, listener, options) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(listener);
    super.addEventListener(type, listener, options);
  }
  removeEventListener(type, listener, options) {
    this.listeners.get(type)?.delete(listener);
    super.removeEventListener(type, listener, options);
  }
  count(type) { return this.listeners.get(type)?.size || 0; }
}

function fixture() {
  const active = Object.assign(new TrackedEvents(), { state: 'activated' });
  const registration = Object.assign(new TrackedEvents(), { active, installing: null, waiting: null });
  const registrations = [], requests = [];
  const serviceWorker = Object.assign(new TrackedEvents(), {
    controller: null,
    async register(...args) { registrations.push(args); return registration; },
  });
  Object.defineProperty(serviceWorker, 'ready', { get() { throw new Error('Do not wait on an unrelated page registration.'); } });
  const config = { prefix: '/service/', bare: '/api/transport/', encodeUrl: encodeURIComponent };
  const options = {
    navigator: { serviceWorker }, secureContext: true, config,
    async fetch(...args) { requests.push(args); return Response.json({ versions: ['v3'] }); },
  };
  return { options, active, registration, serviceWorker, registrations, requests };
}

test('an explicit launch destination works when storage is unavailable and keeps the whole URL', () => {
  const target = 'https://example.com/search?q=hello%20there&language=en#results';
  let reads = 0;
  const blockedStorage = () => { reads++; throw new DOMException('Access denied', 'SecurityError'); };
  assert.equal(readProxyDestination('?url=' + encodeURIComponent(target), blockedStorage), target);
  assert.equal(reads, 0);
  assert.throws(() => readProxyDestination('', blockedStorage), /Enter an address/);
  assert.equal(reads, 1);
});

test('legacy saved launches still work but cannot override an explicit invalid destination', () => {
  assert.equal(readProxyDestination('', () => 'https://example.com'), 'https://example.com/');
  assert.throws(() => readProxyDestination('?url=javascript%3Aalert(1)', () => 'https://example.com'), /HTTP or HTTPS/);
  assert.throws(() => readProxyDestination('?url=%2Frelative', () => 'https://example.com'), /complete, valid/);
});

test('an active worker uses the configured transport without waiting for page control or ready', async () => {
  const state = fixture();
  assert.equal(await prepareProxy(state.options), state.options.config);
  assert.deepEqual(state.registrations, [['/sw.js', { scope: '/', updateViaCache: 'none' }]]);
  assert.equal(state.requests[0][0], '/api/transport/');
  assert.equal(state.requests[0][1].cache, 'no-store');
  assert.equal(state.requests[0][1].credentials, 'same-origin');
  assert.equal(state.requests[0][1].redirect, 'error');
  assert.equal(state.serviceWorker.count('controllerchange'), 0);
  assert.equal(state.registration.count('updatefound'), 0);
});

test('first installation waits for activation and removes its listeners before fetching the manifest', async () => {
  const state = fixture();
  const installing = Object.assign(new TrackedEvents(), { state: 'installing' });
  state.registration.active = null;
  state.registration.installing = installing;
  const started = prepareProxy(state.options);
  await nextTurn();
  assert.equal(state.requests.length, 0);
  assert.equal(installing.count('statechange'), 1);
  assert.equal(state.registration.count('updatefound'), 1);
  state.registration.active = installing;
  state.registration.installing = null;
  installing.state = 'activated';
  installing.dispatchEvent(new Event('statechange'));
  await started;
  assert.equal(state.requests.length, 1);
  assert.equal(installing.count('statechange'), 0);
  assert.equal(state.registration.count('updatefound'), 0);
});

test('direct media can require first-page control without a navigator.ready dependency', async () => {
  const state = fixture();
  const started = prepareProxy({ ...state.options, requireController: true });
  await nextTurn();
  assert.equal(state.requests.length, 0);
  assert.equal(state.serviceWorker.count('controllerchange'), 1);
  state.serviceWorker.controller = state.active;
  state.serviceWorker.dispatchEvent(new Event('controllerchange'));
  await started;
  assert.equal(state.requests.length, 1);
  assert.equal(state.serviceWorker.count('controllerchange'), 0);
});

test('redundant installation fails promptly and a fresh startup can retry', async () => {
  const state = fixture();
  const installing = Object.assign(new TrackedEvents(), { state: 'installing' });
  state.registration.active = null;
  state.registration.installing = installing;
  const rejection = assert.rejects(prepareProxy(state.options), /could not activate/);
  await nextTurn();
  installing.state = 'redundant';
  state.registration.installing = null;
  installing.dispatchEvent(new Event('statechange'));
  await rejection;
  assert.equal(installing.count('statechange'), 0);
  assert.equal(state.registration.count('updatefound'), 0);
  assert.equal(state.requests.length, 0);
  state.registration.active = state.active;
  assert.equal(await prepareProxy(state.options), state.options.config);
});

test('timed-out activation and controller waits release listeners', async () => {
  const activation = fixture();
  const installing = Object.assign(new TrackedEvents(), { state: 'installing' });
  activation.registration.active = null;
  activation.registration.installing = installing;
  await assert.rejects(prepareProxy({ ...activation.options, timeoutMs: 10 }), /too long/);
  assert.equal(installing.count('statechange'), 0);
  assert.equal(activation.registration.count('updatefound'), 0);
  assert.equal(activation.requests.length, 0);
  const control = fixture();
  await assert.rejects(prepareProxy({ ...control.options, requireController: true, timeoutMs: 10 }), /too long/);
  assert.equal(control.serviceWorker.count('controllerchange'), 0);
});

test('a registration resolving after timeout cannot continue startup', async () => {
  const state = fixture();
  let completeRegistration;
  state.serviceWorker.register = () => new Promise(resolve => { completeRegistration = resolve; });
  await assert.rejects(prepareProxy({ ...state.options, timeoutMs: 10 }), /too long/);
  completeRegistration(state.registration);
  await nextTurn();
  assert.equal(state.requests.length, 0);
  assert.equal(state.registration.count('updatefound'), 0);
});

test('a stalled manifest request is aborted and startup can be retried', async () => {
  const state = fixture();
  let signal;
  await assert.rejects(prepareProxy({
    ...state.options, timeoutMs: 10,
    fetch(_url, options) { signal = options.signal; return new Promise(() => {}); },
  }), /transport took too long/);
  assert.equal(signal.aborted, true);
  assert.equal(await prepareProxy(state.options), state.options.config);
});

test('transport failures distinguish unavailable, malformed, and incompatible responses', async t => {
  const cases = [
    ['HTTP failure', () => Response.json({ error: 'unavailable' }, { status: 503 }), /unavailable/],
    ['HTML instead of manifest', () => new Response('<html>Sign in</html>', { headers: { 'content-type': 'text/html' } }), /unavailable/],
    ['malformed JSON', () => new Response('{', { headers: { 'content-type': 'application/json' } }), /invalid response/],
    ['wrong protocol', () => Response.json({ versions: ['v2'] }), /incompatible/],
    ['malformed versions', () => Response.json({ versions: 'v3' }), /incompatible/],
  ];
  for (const [name, response, expected] of cases) {
    await t.test(name, async () => {
      const state = fixture();
      await assert.rejects(prepareProxy({ ...state.options, fetch: async () => response() }), expected);
    });
  }
});

test('unsupported contexts and registration errors stop before transport requests', async () => {
  const state = fixture();
  await assert.rejects(prepareProxy({ ...state.options, secureContext: false }), /HTTPS/);
  await assert.rejects(prepareProxy({ ...state.options, config: { ...state.options.config, bare: undefined } }), /files did not load/);
  state.serviceWorker.register = async () => { throw new DOMException('Blocked', 'SecurityError'); };
  await assert.rejects(prepareProxy(state.options), /could not be installed/);
  assert.equal(state.requests.length, 0);
});
