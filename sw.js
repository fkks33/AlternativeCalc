/**
 * AlternativeCalc Service Worker
 * Enables offline caching and standalone PWA launch.
 * Version 1.0
 */

const CACHE_NAME = 'alternativecalc-v1.0';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './style.css',
  './parser.js',
  './app.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  e.respondWith(
    caches.match(e.request).then((cached) => {
      return cached || fetch(e.request).catch(() => {
        return caches.match('./index.html');
      });
    })
  );
});
