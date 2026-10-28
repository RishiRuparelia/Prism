function interrupted(signal) {
  return signal.reason instanceof Error ? signal.reason : new Error('The browser engine took too long to start. Try again.');
}

function abortable(promise, signal) {
  return new Promise((resolve, reject) => {
    const abort = () => reject(interrupted(signal));
    signal.addEventListener('abort', abort, { once: true });
    Promise.resolve(promise).then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
    if (signal.aborted) abort();
  });
}

function waitForActivation(registration, signal) {
  if (!registration) return Promise.reject(new Error('The browser engine did not install. Try again.'));
  return new Promise((resolve, reject) => {
    const watched = new Set();
    let finished = false;
    const finish = error => {
      if (finished) return;
      finished = true;
      signal.removeEventListener('abort', abort);
      registration.removeEventListener?.('updatefound', inspect);
      for (const worker of watched) worker.removeEventListener('statechange', inspect);
      if (error) reject(error); else resolve();
    };
    const abort = () => finish(interrupted(signal));
    const inspect = () => {
      if (registration.active?.state === 'activated') return finish();
      for (const worker of [registration.installing, registration.waiting, registration.active]) {
        if (!worker || watched.has(worker)) continue;
        watched.add(worker);
        worker.addEventListener('statechange', inspect);
      }
      if (watched.size && [...watched].every(worker => worker.state === 'redundant')) {
        finish(new Error('The browser engine could not activate. Reload PRISM and try again.'));
      }
    };
    registration.addEventListener?.('updatefound', inspect);
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort(); else inspect();
  });
}

function waitForController(serviceWorker, signal) {
  if (serviceWorker.controller) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const finish = error => {
      serviceWorker.removeEventListener('controllerchange', inspect);
      signal.removeEventListener('abort', abort);
      if (error) reject(error); else resolve();
    };
    const abort = () => finish(interrupted(signal));
    const inspect = () => { if (serviceWorker.controller) finish(); };
    serviceWorker.addEventListener('controllerchange', inspect);
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort(); else inspect();
  });
}

/** Read an explicit launch URL first; saved state is only a legacy fallback. */
export function readProxyDestination(search, readSaved = () => globalThis.sessionStorage.getItem('prism_dest')) {
  let value = new URLSearchParams(search).get('url');
  if (!value) {
    try { value = readSaved(); } catch { /* Storage may be disabled in embedded pages. */ }
  }
  if (!value) throw new Error('Enter an address on the PRISM home page first.');
  let destination;
  try { destination = new URL(value); } catch { throw new Error('Enter a complete, valid website address.'); }
  if (!['http:', 'https:'].includes(destination.protocol)) throw new Error('Enter an HTTP or HTTPS address.');
  return destination.href;
}

/** Start the same-origin browser transport without relying on a page's ready promise. */
export async function prepareProxy({
  navigator = globalThis.navigator,
  secureContext = globalThis.isSecureContext,
  config = globalThis.__uv$config,
  fetch = globalThis.fetch,
  requireController = false,
  timeoutMs = 20000,
} = {}) {
  if (!secureContext || !navigator?.serviceWorker) throw new Error('The browser engine needs HTTPS or a localhost address.');
  if (!config?.prefix || typeof config.encodeUrl !== 'function' || typeof config.bare !== 'string' || !config.bare) {
    throw new Error('The browser engine files did not load. Reload PRISM and try again.');
  }
  const serviceWorker = navigator.serviceWorker;
  const controller = new AbortController();
  const { signal } = controller;
  let phase = 'The browser engine took too long to start. Reload PRISM and try again.';
  const timeout = setTimeout(() => controller.abort(new Error(phase)), timeoutMs);
  try {
    let registration;
    try {
      registration = await abortable(serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' }), signal);
    } catch (error) {
      if (signal.aborted) throw interrupted(signal);
      throw new Error('The browser engine could not be installed. Reload PRISM and try again.', { cause: error });
    }
    await waitForActivation(registration, signal);
    if (requireController) await waitForController(serviceWorker, signal);
    phase = 'The proxy transport took too long to respond. Try again.';
    let response;
    try {
      response = await abortable(fetch(config.bare, { credentials: 'same-origin', cache: 'no-store', redirect: 'error', signal }), signal);
    } catch (error) {
      if (signal.aborted) throw interrupted(signal);
      throw new Error('The proxy transport could not be reached. Try again.', { cause: error });
    }
    if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) {
      throw new Error('The proxy transport is unavailable. Reload PRISM and try again.');
    }
    let manifest;
    try { manifest = await abortable(response.json(), signal); }
    catch (error) {
      if (signal.aborted) throw interrupted(signal);
      throw new Error('The proxy transport returned an invalid response. Try again.', { cause: error });
    }
    if (!Array.isArray(manifest?.versions) || !manifest.versions.includes('v3')) {
      throw new Error('The proxy transport returned an incompatible response.');
    }
    return config;
  } finally {
    clearTimeout(timeout);
  }
}
