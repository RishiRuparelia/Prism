// Keep the host session on its own transport requests. These cookies
// remain on PRISM and never become the destination website's cookies.
const nativeFetch = self.fetch.bind(self);
self.fetch = (input, options) => {
  const url = new URL(typeof input === 'string' ? input : input.url || String(input), self.location.origin);
  if (url.origin === self.location.origin && /^\/bare(?:\/|$)/.test(url.pathname)) {
    return nativeFetch(input, { ...options, credentials: 'same-origin' });
  }
  return nativeFetch(input, options);
};
importScripts('/uv/uv.bundle.js', '/uv/uv.config.js', '/uv/uv.sw.js');
const uv = new UVServiceWorker();
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (url.origin !== location.origin) return;
  if (url.pathname.startsWith(__uv$config.prefix)) event.respondWith(uv.fetch(event));
  else if (/^\/bare(?:\/|$)/.test(url.pathname)) event.respondWith(self.fetch(event.request));
});
