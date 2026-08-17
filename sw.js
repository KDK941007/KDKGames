const CACHE_NAME = 'mini-game-portal-v2';

// Service Worker自身に固定するのはポータルだけ。
// 各ゲームはポータルHTMLから自動検出され、CACHE_URLSで追加される。
const CORE_PATHS = [
  './',
  './index.html'
];

function scopedUrl(path) {
  return new URL(path, self.registration.scope).href;
}

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);

    const requests = CORE_PATHS.map(path =>
      new Request(scopedUrl(path), { cache: 'reload' })
    );

    await cache.addAll(requests);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();

    await Promise.all(
      keys
        .filter(key =>
          key.startsWith('mini-game-portal-') &&
          key !== CACHE_NAME
        )
        .map(key => caches.delete(key))
    );

    await self.clients.claim();
  })());
});

// ポータルから現在のPLAYABLEゲーム一覧を受け取り、自動保存。
self.addEventListener('message', event => {
  const data = event.data;

  if (!data || data.type !== 'CACHE_URLS' || !Array.isArray(data.urls)) {
    return;
  }

  event.waitUntil(cacheUrls(data.urls));
});

async function cacheUrls(urls) {
  const cache = await caches.open(CACHE_NAME);
  const scopeUrl = new URL(self.registration.scope);

  const uniqueUrls = [...new Set(urls)]
    .map(value => {
      try {
        return new URL(value, self.registration.scope);
      } catch (_) {
        return null;
      }
    })
    .filter(url =>
      url &&
      url.origin === scopeUrl.origin &&
      url.href.startsWith(self.registration.scope)
    );

  // 1件失敗しても他ゲームのキャッシュまで止めない。
  await Promise.allSettled(
    uniqueUrls.map(async url => {
      try {
        const request = new Request(url.href, { cache: 'reload' });
        const response = await fetch(request, { cache: 'no-store' });

        if (response && response.ok) {
          await cache.put(request, response.clone());
        }
      } catch (_) {
        // オフラインや一時的な通信失敗時は既存キャッシュを維持。
      }
    })
  );
}

self.addEventListener('fetch', event => {
  const request = event.request;

  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // 同一サイト内だけService Workerで扱う。
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    // HTMLはNetwork First。
    event.respondWith(networkFirstNavigation(request));
    return;
  }

  // 将来CSS/JS/画像などを外部ファイル化した場合にも対応。
  event.respondWith(staleWhileRevalidate(request));
});

async function networkFirstNavigation(request) {
  const cache = await caches.open(CACHE_NAME);

  try {
    const response = await fetch(request, { cache: 'no-store' });

    if (response && response.ok) {
      await cache.put(request, response.clone());
    }

    return response;
  } catch (error) {
    const cached = await cache.match(request, { ignoreSearch: true });
    if (cached) return cached;

    const root =
      await cache.match(scopedUrl('./')) ||
      await cache.match(scopedUrl('./index.html'));

    if (root) return root;

    throw error;
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request, { ignoreSearch: true });

  const networkPromise = fetch(request, { cache: 'no-store' })
    .then(async response => {
      if (response && response.ok) {
        await cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => null);

  if (cached) {
    networkPromise.catch(() => {});
    return cached;
  }

  const network = await networkPromise;
  if (network) return network;

  return Response.error();
}
