/* global __uv$config */
const address = document.querySelector('#address');
const status = document.querySelector('#status');
const frame = document.querySelector('#frame');
const back = document.querySelector('#back');
const forward = document.querySelector('#forward');
const entries = [];
let cursor = -1;
let pendingNavigation = null;
let navigationId = 0;
let loadTimer;
let readyPromise;

function setStatus(message = '', error = false, loading = false) {
  status.textContent = message;
  document.body.dataset.error = String(error);
  document.body.dataset.loading = String(loading);
}

function normalize(value) {
  const input = value.trim();
  if (!input) throw new Error('Enter an address or something to search for.');
  if (/^https?:\/\//i.test(input)) return new URL(input).href;
  if (/^(?:file|data|javascript|ftp|about):/i.test(input)) throw new Error('Enter an HTTP or HTTPS website address.');
  if (!/\s/.test(input) && /^(?:[\w\u0080-\uffff-]+(?:\.[\w\u0080-\uffff-]+)+|\[[\da-f:]+\])(?::\d+)?(?:[/?#].*)?$/i.test(input)) {
    return new URL('https://' + input).href;
  }
  const engine = new URLSearchParams(location.search).get('engine') || 'duckduckgo';
  return (engine === 'google' ? 'https://www.google.com/search?q=' : 'https://duckduckgo.com/?q=') + encodeURIComponent(input);
}

function withTimeout(promise, milliseconds, message) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(message)), milliseconds); }),
  ]).finally(() => clearTimeout(timer));
}

function waitForActivation(registration) {
  if (registration.active?.state === 'activated') return Promise.resolve();
  const worker = registration.installing || registration.waiting || registration.active;
  if (!worker) return Promise.reject(new Error('The proxy worker could not be installed. Reload this page to try again.'));
  return new Promise((resolve, reject) => {
    const inspect = () => {
      if (worker.state === 'activated') { worker.removeEventListener('statechange', inspect); resolve(); }
      else if (worker.state === 'redundant') { worker.removeEventListener('statechange', inspect); reject(new Error('The proxy worker could not start. Reload this page to try again.')); }
    };
    worker.addEventListener('statechange', inspect);
    inspect();
  });
}

function prepareProxy() {
  if (!readyPromise) {
    readyPromise = (async () => {
      if (!window.isSecureContext || !('serviceWorker' in navigator)) throw new Error('The proxy needs HTTPS or a localhost address.');
      if (typeof __uv$config !== 'object' || typeof __uv$config.encodeUrl !== 'function') throw new Error('Browser components did not load. Reload this page and try again.');
      const registration = await withTimeout(
        navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' }),
        20_000, 'The proxy worker took too long to install. Reload this page to retry.',
      );
      await withTimeout(waitForActivation(registration), 20_000, 'The proxy worker took too long to start. Reload this page to retry.');
      const response = await fetch('/bare/', { credentials: 'same-origin', cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(10_000) });
      if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) throw new Error('The proxy transport is unavailable or your sign-in has expired. Reload PRISM and try again.');
      const manifest = await response.json();
      if (!manifest.versions?.includes('v3')) throw new Error('The proxy transport returned an incompatible response.');
    })().catch(error => { readyPromise = undefined; throw error; });
  }
  return readyPromise;
}

function updateButtons() {
  back.disabled = cursor <= 0;
  forward.disabled = cursor >= entries.length - 1;
}

function remember(url, mode = 'push') {
  if (mode === 'replace' && cursor >= 0) entries[cursor] = url;
  else if (entries[cursor] !== url) {
    entries.splice(cursor + 1);
    entries.push(url);
    cursor = entries.length - 1;
  }
  updateButtons();
}

function frameUrl() {
  try {
    const raw = frame.contentWindow.location.href;
    if (!raw.startsWith(location.origin + __uv$config.prefix)) return null;
    return __uv$config.decodeUrl(raw.slice((location.origin + __uv$config.prefix).length));
  } catch { return null; }
}

async function navigate(value, mode = 'push') {
  const id = ++navigationId;
  clearTimeout(loadTimer);
  try {
    const url = normalize(value);
    address.removeAttribute('aria-invalid');
    address.value = url;
    setStatus('Connecting…', false, true);
    await prepareProxy();
    if (id !== navigationId) return;
    pendingNavigation = { url, mode };
    const ownUrl = new URL(location.href);
    ownUrl.searchParams.set('url', url);
    window.history.replaceState(null, '', ownUrl);
    frame.src = __uv$config.prefix + __uv$config.encodeUrl(url);
    loadTimer = setTimeout(() => {
      if (id === navigationId) setStatus('This website is taking a while to respond. You can reload it or enter another address.');
    }, 35_000);
  } catch (error) {
    if (id !== navigationId) return;
    pendingNavigation = null;
    address.setAttribute('aria-invalid', 'true');
    setStatus(error instanceof Error ? error.message : 'The browser could not start. Reload this page to try again.', true);
  }
}

frame.addEventListener('load', () => {
  if (!frame.getAttribute('src')) return;
  clearTimeout(loadTimer);
  const url = frameUrl() || pendingNavigation?.url;
  if (url) {
    address.value = url;
    remember(url, pendingNavigation?.mode || 'push');
  }
  pendingNavigation = null;
  try {
    const doc = frame.contentDocument;
    const errorTitle = doc?.querySelector('#errorTitle');
    const errorMessage = doc?.querySelector('#errorMessage');
    if (errorTitle || doc?.querySelector('#remoteHostname')) {
      setStatus(errorMessage?.textContent || errorTitle?.textContent || 'The destination could not be reached. Try reloading or another address.', true);
      return;
    }
  } catch { /* Some destinations isolate their documents. */ }
  setStatus();
});

document.querySelector('#navigation').addEventListener('submit', event => { event.preventDefault(); navigate(address.value); });
document.querySelector('#reload').addEventListener('click', () => navigate(frameUrl() || entries[cursor] || address.value, 'replace'));
back.addEventListener('click', () => { if (cursor > 0) { cursor--; updateButtons(); navigate(entries[cursor], 'replace'); } });
forward.addEventListener('click', () => { if (cursor < entries.length - 1) { cursor++; updateButtons(); navigate(entries[cursor], 'replace'); } });
address.addEventListener('focus', () => address.select());
window.addEventListener('keydown', event => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'l') { event.preventDefault(); address.focus(); address.select(); }
});

// SPA navigation changes the frame URL without a load event.
setInterval(() => {
  if (pendingNavigation || document.activeElement === address) return;
  const url = frameUrl();
  if (url && url !== entries[cursor]) { remember(url); address.value = url; }
}, 700);

navigate(new URLSearchParams(location.search).get('url') || 'https://example.com');
