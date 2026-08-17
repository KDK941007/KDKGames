const CACHE_NAME = 'mini-game-portal-v1';

// 初回オンラインアクセス時に保存しておくページ。
// 新しいゲームを追加した場合は、この一覧に追加して CACHE_NAME を更新する。
const PRECACHE_PATHS = [
  './',
  './index.html',
  './blackjack/',
  './baccarat/',
  './marubatsu/'
];

function scopedUrl(path) {
  return new URL(path, self.registration.scope).href;
}

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);

    // ブラウザ内の古いHTTPキャッシュを使わず、可能な限り最新版を保存する。
    const requests = PRECACHE_PATHS.map(path =>
      new Request(scopedUrl(path), { cache: 'reload' })
    );

    await cache.addAll(requests);

    // 新版SWを待機状態にせず、更新を早める。
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    // バージョン違いの古いキャッシュは自動削除。
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter(key => key.startsWith('mini-game-portal-') && key !== CACHE_NAME)
        .map(key => caches.delete(key))
    );

    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;

  // GET以外はService Workerで処理しない。
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // GitHub Pages上の同一サイト内だけを対象にする。
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    // HTMLは Network First。
    // オンライン: 最新版を表示し、その内容でキャッシュも更新。
    // オフライン: 最後に正常取得できたキャッシュを表示。
    event.respondWith(networkFirstNavigation(request));
    return;
  }

  // 将来画像/CSS/JS等を外部ファイル化した場合にも対応。
  // オンラインなら更新しつつ、キャッシュがあれば即表示する。
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
    // URL末尾のクエリなどが違っても同じページを使えるようにする。
    const cached = await cache.match(request, { ignoreSearch: true });
    if (cached) return cached;

    // ポータルURLの表記揺れ対策。
    const root = await cache.match(scopedUrl('./'));
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
    eventWaitUntilSafe(networkPromise);
    return cached;
  }

  const network = await networkPromise;
  if (network) return network;

  return Response.error();
}

function eventWaitUntilSafe(promise) {
  // stale-while-revalidate 用。
  // レスポンス返却後の更新失敗は画面表示へ影響させない。
  promise.catch(() => {});
}
