'use strict';

const cachePrefix = 'tidyhome-shell-' + self.registration.scope + ':';
const cacheName = cachePrefix + 'v4';
const shell = ['./', './index.html', './styles.css', './inventory.js', './storage.js',
  './annotation.js', './app.js', './manifest.webmanifest', './icon-192.png', './icon-512.png'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(cacheName).then(cache => cache.addAll(shell)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys
    .filter(key => key.startsWith(cachePrefix) && key !== cacheName)
    .map(key => caches.delete(key))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  const known = shell.some(path => new URL(path, self.registration.scope).href === request.url);
  if (!known && request.mode !== 'navigate') return;

  const fromShell = url => caches.open(cacheName).then(cache => cache.match(url));
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => fromShell(new URL('./index.html', self.registration.scope).href)));
    return;
  }

  event.respondWith(fromShell(request).then(response => response || fetch(request)));
});
