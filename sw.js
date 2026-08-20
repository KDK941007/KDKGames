const CACHE_NAME = 'mini-game-portal-v4';

const CORE_PATHS = [
  './',
  './index.html',
  './portal/css/portal.css',
  './portal/js/portal.js',
  './portal/js/player-summary.js',
  './portal/games.json',
  './portal/games.js',
  './shared/js/player-store.js',
  './shared/js/portal-navigation.js',
  './player/',
  './player/index.html'
];

function scopedUrl(path){
  return new URL(path, self.registration.scope).href;
}

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await Promise.allSettled(CORE_PATHS.map(async path => {
      const request = new Request(scopedUrl(path), {cache:'reload'});
      const response = await fetch(request, {cache:'no-store'});
      if(response?.ok) await cache.put(request, response.clone());
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith('mini-game-portal-') && key !== CACHE_NAME).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', event => {
  const data = event.data;
  if(!data || data.type !== 'CACHE_URLS' || !Array.isArray(data.urls)) return;
  event.waitUntil(cacheUrls(data.urls));
});

async function cacheUrls(urls){
  const cache = await caches.open(CACHE_NAME);
  const scopeUrl = new URL(self.registration.scope);
  const uniqueUrls = [...new Set(urls)].map(value => {
    try{return new URL(value, self.registration.scope)}catch(_){return null}
  }).filter(url => url && url.origin === scopeUrl.origin && url.href.startsWith(self.registration.scope));

  await Promise.allSettled(uniqueUrls.map(async url => {
    const request = new Request(url.href, {cache:'reload'});
    try{
      const response = await fetch(request, {cache:'no-store'});
      if(response?.ok) await cache.put(request, response.clone());
    }catch(_){}
  }));
}

self.addEventListener('fetch', event => {
  const request = event.request;
  if(request.method !== 'GET') return;
  const url = new URL(request.url);
  if(url.origin !== self.location.origin) return;
  event.respondWith(request.mode === 'navigate' ? networkFirstNavigation(request) : staleWhileRevalidate(request));
});

async function networkFirstNavigation(request){
  const cache = await caches.open(CACHE_NAME);
  try{
    const response = await fetch(request, {cache:'no-store'});
    if(response?.ok) await cache.put(request, response.clone());
    return response;
  }catch(error){
    const cached = await cache.match(request, {ignoreSearch:true});
    if(cached) return cached;
    const root = await cache.match(scopedUrl('./')) || await cache.match(scopedUrl('./index.html'));
    if(root) return root;
    throw error;
  }
}

async function staleWhileRevalidate(request){
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request, {ignoreSearch:true});
  const networkPromise = fetch(request, {cache:'no-store'}).then(async response => {
    if(response?.ok) await cache.put(request, response.clone());
    return response;
  }).catch(() => null);
  if(cached){ networkPromise.catch(() => {}); return cached; }
  return (await networkPromise) || Response.error();
}
