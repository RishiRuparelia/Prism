importScripts("/scram/scramjet.bundle.js");

self.__scramjet$config = {
  prefix: "/scramjet/",
};

importScripts("/scram/scramjet.worker.js");

const scramjet = new ScramjetServiceWorker();

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("fetch", (event) => {
  if (scramjet.route(event)) {
    event.respondWith(scramjet.fetch(event));
  }
});
