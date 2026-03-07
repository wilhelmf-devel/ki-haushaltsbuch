// Service Worker – Cache-First für App-Shell, Network-First für API
'use strict';

const CACHE_NAME = 'haushaltsbuch-v1';
const APP_SHELL = [
  '/',
  '/index.html',
  '/css/app.css',
  '/js/app.js',
  '/js/api.js',
  '/js/offline.js',
  '/js/charts.js',
  '/js/views/dashboard.js',
  '/js/views/capture.js',
  '/js/views/receipts.js',
  '/js/views/receipt-detail.js',
  '/js/views/settings.js',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/manifest.json',
];

// Installation: App-Shell cachen
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(APP_SHELL);
    })
  );
  self.skipWaiting();
});

// Aktivierung: Alte Caches löschen
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// Fetch-Handler
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // API-Calls: Network-First
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(event.request).catch(() => {
        return new Response(
          JSON.stringify({ error: 'Offline – keine Verbindung zum Server' }),
          { status: 503, headers: { 'Content-Type': 'application/json' } }
        );
      })
    );
    return;
  }

  // App-Shell: Cache-First
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        // Statische Assets in Cache aufnehmen
        if (response.ok && event.request.method === 'GET') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      });
    })
  );
});

// Hintergrund-Sync für Offline-Uploads
self.addEventListener('sync', (event) => {
  if (event.tag === 'upload-queue') {
    event.waitUntil(syncOfflineUploads());
  }
});

async function syncOfflineUploads() {
  // Clients benachrichtigen, Uploads abzusenden
  const clients = await self.clients.matchAll();
  clients.forEach((client) => client.postMessage({ type: 'sync-uploads' }));
}
