/* global __uv$config */
const status = document.querySelector('#status');
const retry = document.querySelector('#retry');
let starting = false;

function bounded(promise, milliseconds, message) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(message)), milliseconds); }),
  ]).finally(() => clearTimeout(timer));
}

function activate(registration) {
  if (registration.active?.state === 'activated') return Promise.resolve();
  const worker = registration.installing || registration.waiting || registration.active;
  if (!worker) return Promise.reject(new Error('The browser engine did not install. Try again.'));
  return new Promise((resolve, reject) => {
    const inspect = () => {
      if (worker.state === 'activated') { worker.removeEventListener('statechange', inspect); resolve(); }
      else if (worker.state === 'redundant') { worker.removeEventListener('statechange', inspect); reject(new Error('The browser engine could not start. Try again.')); }
    };
    worker.addEventListener('statechange', inspect);
    inspect();
  });
}

async function start() {
  if (starting) return;
  starting = true;
  retry.hidden = true;
  status.textContent = 'Bending the light. Connecting to your destination…';
  try {
    let saved;
    try { saved = sessionStorage.getItem('prism_dest'); } catch { /* The URL parameter also works when storage is unavailable. */ }
    const url = new URLSearchParams(location.search).get('url') || saved;
    if (!url) throw new Error('Enter an address on the PRISM home page first.');
    let destination;
    try { destination = new URL(url); } catch { throw new Error('Enter a complete, valid website address.'); }
    if (!['http:', 'https:'].includes(destination.protocol)) throw new Error('Enter an HTTP or HTTPS address.');
    if (!window.isSecureContext || !('serviceWorker' in navigator)) throw new Error('The proxy needs HTTPS or localhost. Open PRISM at http://localhost:8080 on this computer.');
    if (typeof __uv$config !== 'object' || typeof __uv$config.encodeUrl !== 'function') throw new Error('The browser engine files did not load. Reload PRISM and try again.');
    const registration = await bounded(
      navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' }),
      20_000, 'The browser engine took too long to install. Try again.',
    );
    await bounded(activate(registration), 20_000, 'The browser engine did not activate. Try again.');
    const response = await fetch('/bare/', { credentials: 'same-origin', cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(10_000) });
    if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) throw new Error('The local proxy server is unavailable. Start PRISM and try again.');
    if (!(await response.json()).versions?.includes('v3')) throw new Error('The proxy server returned an incompatible response.');
    location.replace(__uv$config.prefix + __uv$config.encodeUrl(destination.href));
  } catch (error) {
    status.textContent = error instanceof Error ? error.message : 'The destination could not be opened. Try again.';
    retry.hidden = false;
  } finally { starting = false; }
}

retry.addEventListener('click', start);
start();
