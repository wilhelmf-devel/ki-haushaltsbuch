// Offline-Upload-Queue via IndexedDB
'use strict';

const DB_NAME = 'haushaltsbuch-offline';
const STORE = 'upload-queue';
const DB_VERSION = 1;

let _db = null;

async function getDB() {
  if (_db) return _db;
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
      }
    };
    req.onsuccess = (e) => { _db = e.target.result; resolve(_db); };
    req.onerror = () => reject(req.error);
  });
}

// Upload in Queue speichern
export async function queueUpload(file, tenantId, date) {
  const db = await getDB();
  const arrayBuffer = await file.arrayBuffer();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const req = tx.objectStore(STORE).add({
      fileName: file.name,
      mimeType: file.type,
      data: arrayBuffer,
      tenantId,
      date,
      timestamp: Date.now(),
    });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// Alle Items in der Queue lesen
export async function getQueue() {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// Item aus Queue löschen
export async function removeFromQueue(id) {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const req = tx.objectStore(STORE).delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

// Alle ausstehenden Uploads abschicken
export async function flushQueue(onProgress) {
  const queue = await getQueue();
  if (queue.length === 0) return 0;

  let erfolge = 0;
  for (const item of queue) {
    try {
      const formData = new FormData();
      const blob = new Blob([item.data], { type: item.mimeType });
      formData.append('file', blob, item.fileName);
      formData.append('tenant_id', item.tenantId);
      if (item.date) formData.append('receipt_date', item.date);

      const res = await fetch('/api/upload', { method: 'POST', body: formData });
      if (res.ok) {
        await removeFromQueue(item.id);
        erfolge++;
        onProgress?.(erfolge, queue.length);
      }
    } catch {
      // Nächstes Mal wieder versuchen
    }
  }
  return erfolge;
}

// Online-Event: Queue automatisch abschicken
export function initOfflineSync(onFlush) {
  window.addEventListener('online', async () => {
    const count = await flushQueue(onFlush);
    if (count > 0) {
      console.log(`[Offline] ${count} Uploads nachgeholt`);
    }
  });

  // Service Worker Sync-Nachricht empfangen
  navigator.serviceWorker?.addEventListener('message', async (e) => {
    if (e.data?.type === 'sync-uploads') {
      await flushQueue(onFlush);
    }
  });
}
