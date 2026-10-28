// Keep the host session on its own transport requests. These cookies
// remain on PRISM and never become the destination website's cookies.
const nativeFetch = self.fetch.bind(self);
const isTransportPath = pathname => /^\/(?:api\/transport|bare)(?:\/|$)/.test(pathname);
self.fetch = (input, options) => {
  const url = new URL(typeof input === 'string' ? input : input.url || String(input), self.location.origin);
  if (url.origin === self.location.origin && isTransportPath(url.pathname)) {
    return nativeFetch(input, { ...options, credentials: 'same-origin' });
  }
  return nativeFetch(input, options);
};
importScripts('/assets/runtime/engine.js', '/assets/runtime/config.js', '/assets/runtime/worker.js');
const uv = new UVServiceWorker();
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (url.origin !== location.origin) return;
  if (url.pathname.startsWith(__uv$config.prefix)) event.respondWith(uv.fetch(event));
  else if (isTransportPath(url.pathname)) event.respondWith(self.fetch(event.request));
});
