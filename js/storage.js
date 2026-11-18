// Storage seam. v1 keeps the layout on this computer (localStorage + IndexedDB)
// and can also read a published config.json. A later cloud backend can replace
// createStorage() without changing the editor or the display.

const CONFIG_KEY = 'shul-display-config-v1';
const SOURCE_KEY = 'shul-display-source-v1';
const CHANNEL = 'shul-display';
const DB_NAME = 'shul-display';
const STORE = 'assets';

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) {
        request.result.createObjectStore(STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function withStore(mode, fn) {
  return openDb().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const store = tx.objectStore(STORE);
    let result;
    Promise.resolve(fn(store)).then((value) => {
      result = value;
    }, reject);
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error);
  }));
}

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

function dataUrlToBlob(dataUrl) {
  const [header, body] = String(dataUrl).split(',');
  const mime = /data:([^;,]+)/.exec(header)?.[1] || 'application/octet-stream';
  const binary = atob(body || '');
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

export function collectAssetIds(config) {
  const ids = new Set();
  const add = (id) => {
    if (id) ids.add(id);
  };
  if (config?.takeover) add(config.takeover.backgroundAssetId);
  for (const screen of config?.screens || []) {
    for (const widget of screen.widgets || []) {
      const settings = widget.settings || {};
      add(settings.assetId);
      add(settings.backgroundAssetId);
      for (const image of settings.images || []) add(image.assetId);
    }
  }
  return [...ids];
}

function stripAssets(config) {
  if (!config) return config;
  const copy = structuredClone(config);
  delete copy.assets;
  return copy;
}

export function createStorage() {
  const listeners = new Set();
  const urls = new Map();
  let channel = null;
  if (typeof BroadcastChannel !== 'undefined') {
    channel = new BroadcastChannel(CHANNEL);
    channel.onmessage = (event) => {
      const data = event.data;
      if (!data || typeof data !== 'object') return;
      listeners.forEach((fn) => fn(data));
    };
  }
  if (typeof window !== 'undefined') {
    window.addEventListener('storage', (event) => {
      if (event.key === CONFIG_KEY && event.newValue) {
        try {
          listeners.forEach((fn) => fn({ type: 'save', config: JSON.parse(event.newValue) }));
        } catch {
          // Ignore a broken value from another tab.
        }
      }
      if (event.key === SOURCE_KEY && event.newValue) {
        listeners.forEach((fn) => fn({ type: 'source', source: event.newValue }));
      }
    });
  }

  function emit(message) {
    if (channel) channel.postMessage(message);
    listeners.forEach((fn) => fn(message));
  }

  async function assetRecord(id) {
    if (!id) return null;
    return withStore('readonly', (store) => requestToPromise(store.get(id)));
  }

  return {
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    getSource() {
      try {
        return localStorage.getItem(SOURCE_KEY) || 'auto';
      } catch {
        return 'auto';
      }
    },
    setSource(source) {
      const value = source === 'local' || source === 'published' ? source : 'auto';
      localStorage.setItem(SOURCE_KEY, value);
      const message = { type: 'source', source: value };
      if (channel) channel.postMessage(message);
      return value;
    },
    loadLocal() {
      try {
        const raw = localStorage.getItem(CONFIG_KEY);
        return raw ? JSON.parse(raw) : null;
      } catch {
        return null;
      }
    },
    saveLocal(config) {
      const clean = stripAssets(config);
      localStorage.setItem(CONFIG_KEY, JSON.stringify(clean));
      const message = { type: 'save', config: clean };
      if (channel) channel.postMessage(message);
      return clean;
    },
    async loadPublished() {
      const url = new URL('../config.json', import.meta.url);
      const response = await fetch(url, { cache: 'no-store' });
      if (!response.ok) return null;
      return response.json();
    },
    async putAsset(file) {
      const id = 'asset-' + Math.random().toString(36).slice(2, 10);
      const record = {
        id,
        name: file.name || 'file',
        mime: file.type || 'application/octet-stream',
        blob: file,
      };
      await withStore('readwrite', (store) => store.put(record, id));
      return { id, name: record.name, mime: record.mime };
    },
    async assetURL(id) {
      if (!id) return '';
      if (urls.has(id)) return urls.get(id);
      const record = await assetRecord(id);
      if (!record?.blob) return '';
      const url = URL.createObjectURL(record.blob);
      urls.set(id, url);
      return url;
    },
    async assetBuffer(id) {
      const record = await assetRecord(id);
      if (!record?.blob) return null;
      return record.blob.arrayBuffer();
    },
    async deleteAsset(id) {
      if (!id) return;
      const existing = urls.get(id);
      if (existing) URL.revokeObjectURL(existing);
      urls.delete(id);
      await withStore('readwrite', (store) => store.delete(id));
    },
    async exportDocument(config) {
      const assets = {};
      for (const id of collectAssetIds(config)) {
        const record = await assetRecord(id);
        if (!record?.blob) continue;
        assets[id] = {
          name: record.name,
          mime: record.mime,
          dataUrl: await blobToDataUrl(record.blob),
        };
      }
      return { ...stripAssets(config), assets };
    },
    async importDocument(document) {
      const assets = document?.assets || {};
      for (const [id, record] of Object.entries(assets)) {
        if (!record?.dataUrl) continue;
        const blob = dataUrlToBlob(record.dataUrl);
        await withStore('readwrite', (store) => store.put({
          id,
          name: record.name || id,
          mime: record.mime || blob.type,
          blob,
        }, id));
        const previous = urls.get(id);
        if (previous) URL.revokeObjectURL(previous);
        urls.delete(id);
      }
      const config = stripAssets(document);
      this.saveLocal(config);
      return config;
    },
  };
}
