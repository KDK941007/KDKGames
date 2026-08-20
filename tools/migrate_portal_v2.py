from __future__ import annotations

import json
import re
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

GAME_CONFIG = {
    "blackjack": {
        "id": "blackjack",
        "name": "BLACKJACK",
        "category": "casino",
        "categoryLabel": "CASINO",
        "description": "実戦を想定したブラックジャック練習ゲーム。",
        "searchTerms": ["blackjack", "ブラックジャック", "casino", "カジノ", "実戦", "練習"],
        "available": True,
        "iconLabel": "BJ",
    },
    "baccarat": {
        "id": "baccarat",
        "name": "BACCARAT",
        "category": "casino",
        "categoryLabel": "CASINO",
        "description": "パラダイス実戦を想定したバカラ練習ゲーム。",
        "searchTerms": ["baccarat", "バカラ", "casino", "カジノ", "パラダイス", "練習"],
        "available": True,
        "iconLabel": "B",
    },
    "marubatsu": {
        "id": "marubatsu",
        "name": "消える○×ゲーム",
        "category": "board",
        "categoryLabel": "ボードゲーム",
        "description": "4個目を置くと一番古いコマが消える三目並べ。",
        "searchTerms": ["消える○×ゲーム", "まるばつ", "マルバツ", "○×", "tic tac toe", "三目並べ", "board", "ボードゲーム"],
        "available": True,
        "iconLabel": "○×",
    },
    "flash-rush": {
        "id": "flash-rush",
        "name": "FLASH RUSH",
        "category": "action",
        "categoryLabel": "ACTION",
        "description": "100種類の瞬間ミニゲームをハイテンポで連続攻略。",
        "searchTerms": ["flash rush", "フラッシュラッシュ", "瞬間ゲーム", "ミニゲーム", "アクション", "action", "micro game"],
        "available": True,
        "iconLabel": "⚡",
    },
    "laser-escape": {
        "id": "laser-escape",
        "name": "LASER ESCAPE",
        "category": "action",
        "categoryLabel": "ACTION",
        "description": "迫りくるレーザーを避け続けるドット絵サバイバル。",
        "searchTerms": ["laser escape", "レーザーエスケープ", "レーザー", "回避", "サバイバル", "ドットゲーム", "アクション", "action", "survival"],
        "available": True,
        "iconLabel": "LE",
    },
    "rpg": {
        "id": "rpg",
        "name": "MYSTERY RPG",
        "category": "rpg",
        "categoryLabel": "RPG",
        "description": "内容を知らずに始める、短編RPG。",
        "searchTerms": ["mystery rpg", "ミステリー", "rpg", "role playing", "ロールプレイング"],
        "available": True,
        "iconLabel": "RPG",
    },
}

CATEGORY_COLORS = {
    "casino": ("#6366f1", "#eef2ff"),
    "board": ("#0f9f8f", "#ecfdf5"),
    "action": ("#f97316", "#fff7ed"),
    "rpg": ("#7c3aed", "#f5f3ff"),
    "other": ("#ec4899", "#fdf2f8"),
}

JS_TYPES = {"", "text/javascript", "application/javascript", "module"}


def ensure_dir(path: Path) -> None:
    path.mkdir(parents=True, exist_ok=True)


def write_text(path: Path, content: str) -> None:
    ensure_dir(path.parent)
    path.write_text(content, encoding="utf-8", newline="\n")


def externalize_inline_assets(index_path: Path) -> None:
    source = index_path.read_text(encoding="utf-8")
    cursor = 0
    output: list[str] = []
    style_no = 0
    script_no = 0
    tag_re = re.compile(r"<(style|script)\b([^>]*)>", re.I)

    while True:
        match = tag_re.search(source, cursor)
        if not match:
            output.append(source[cursor:])
            break

        tag = match.group(1).lower()
        attrs = match.group(2) or ""
        close_re = re.compile(rf"</{tag}\s*>", re.I)
        close = close_re.search(source, match.end())
        if not close:
            output.append(source[cursor:])
            break

        output.append(source[cursor:match.start()])
        body = source[match.end():close.start()]

        if tag == "style":
            style_no += 1
            filename = "style.css" if style_no == 1 else f"style-{style_no}.css"
            write_text(index_path.parent / "css" / filename, body.strip() + "\n")
            media_match = re.search(r"\bmedia\s*=\s*([\"'])(.*?)\1", attrs, re.I | re.S)
            media = f' media="{media_match.group(2)}"' if media_match else ""
            output.append(f'<link rel="stylesheet" href="./css/{filename}"{media}>')
        else:
            has_src = re.search(r"\bsrc\s*=", attrs, re.I) is not None
            type_match = re.search(r"\btype\s*=\s*([\"'])(.*?)\1", attrs, re.I | re.S)
            script_type = (type_match.group(2).strip().lower() if type_match else "")
            if has_src or script_type not in JS_TYPES:
                output.append(source[match.start():close.end()])
            else:
                script_no += 1
                filename = "game.js" if script_no == 1 else f"game-{script_no}.js"
                write_text(index_path.parent / "js" / filename, body.strip() + "\n")
                kept_attrs = attrs
                output.append(f'<script{kept_attrs} src="./js/{filename}"></script>')

        cursor = close.end()

    index_path.write_text("".join(output), encoding="utf-8", newline="\n")


def make_icon_svg(label: str, category: str) -> str:
    accent, soft = CATEGORY_COLORS.get(category, CATEGORY_COLORS["other"])
    safe = (
        label.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
    )
    size = "20" if len(label) <= 2 else "13"
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="{safe}">
  <rect x="2" y="2" width="60" height="60" rx="16" fill="{soft}" stroke="{accent}" stroke-opacity=".24" stroke-width="2"/>
  <circle cx="32" cy="32" r="22" fill="{accent}" fill-opacity=".10"/>
  <text x="32" y="37" text-anchor="middle" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif" font-size="{size}" font-weight="800" fill="{accent}">{safe}</text>
</svg>
'''


def write_game_metadata(target: Path, cfg: dict) -> None:
    game_json = {
        "schemaVersion": 1,
        "id": cfg["id"],
        "name": cfg["name"],
        "category": cfg["category"],
        "categoryLabel": cfg["categoryLabel"],
        "description": cfg["description"],
        "searchTerms": cfg["searchTerms"],
        "icon": "./icon.svg",
        "entry": "./index.html",
        "available": cfg["available"],
    }
    write_text(target / "game.json", json.dumps(game_json, ensure_ascii=False, indent=2) + "\n")
    write_text(target / "icon.svg", make_icon_svg(cfg["iconLabel"], cfg["category"]))


def redirect_html(target: str) -> str:
    return f'''<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="refresh" content="0;url={target}">
<title>MINI GAME PORTAL</title>
<script>location.replace({json.dumps(target)});</script>
</head>
<body><a href="{target}">MINI GAME PORTALへ戻る</a></body>
</html>
'''


def migrate_games() -> None:
    games_root = ROOT / "games"
    ensure_dir(games_root)

    for old_name, cfg in GAME_CONFIG.items():
        old = ROOT / old_name
        target = games_root / cfg["category"] / cfg["id"]
        if old.exists() and not target.exists():
            ensure_dir(target.parent)
            shutil.move(str(old), str(target))
        if not target.exists():
            raise FileNotFoundError(f"game source not found: {old_name}")

        index_path = target / "index.html"
        if index_path.exists() and not (target / "css").exists() and not (target / "js").exists():
            externalize_inline_assets(index_path)
        write_game_metadata(target, cfg)

    roulette = games_root / "casino" / "roulette"
    ensure_dir(roulette)
    roulette_cfg = {
        "id": "roulette",
        "name": "ROULETTE",
        "category": "casino",
        "categoryLabel": "CASINO",
        "description": "今後追加予定。",
        "searchTerms": ["roulette", "ルーレット", "casino", "カジノ"],
        "available": False,
        "iconLabel": "R",
    }
    write_game_metadata(roulette, roulette_cfg)

    write_text(games_root / "index.html", redirect_html("../"))
    for category in {cfg["category"] for cfg in GAME_CONFIG.values()} | {"other"}:
        write_text(games_root / category / "index.html", redirect_html("../../"))


def extract_portal_css() -> str:
    source = (ROOT / "index.html").read_text(encoding="utf-8")
    match = re.search(r"<style\b[^>]*>(.*?)</style\s*>", source, re.I | re.S)
    if not match:
        raise RuntimeError("portal style block not found")
    return match.group(1).strip() + "\n\n" + '''.tileIconImage{width:100%;height:100%;display:block;object-fit:contain;border-radius:12px}\n.gameTile.loading{opacity:.62;pointer-events:none}\n''' 


def portal_index_html() -> str:
    return '''<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#f5f7fb">
<title>MINI GAME PORTAL</title>
<link rel="stylesheet" href="./portal/css/portal.css">
</head>
<body>
<main class="app">
  <header class="hero">
    <div class="brandMark" aria-hidden="true"><span class="brandTile">M</span><span class="brandTile">G</span></div>
    <div class="eyebrow">MINI GAME PORTAL</div>
    <h1>MINI GAME HUB</h1>
    <p>ジャンルを問わず、遊びたいゲームをここから選択できます。各ゲームは独立して動作します。</p>
  </header>

  <a class="playerPortalCard" href="./player/" aria-label="PLAYER PROFILEを開く">
    <div class="playerPortalIcon" aria-hidden="true">P</div>
    <div class="playerPortalBody">
      <div class="playerPortalLabel">PLAYER</div>
      <div id="portalPlayerName" class="playerPortalName">PLAYER</div>
      <div id="portalPlayerMeta" class="playerPortalMeta">PLAY 0 / GAMES 0</div>
    </div>
    <div class="playerPortalArrow" aria-hidden="true">›</div>
  </a>

  <section class="gameBrowser" aria-label="ゲームを探す">
    <div class="browserTop">
      <label class="searchBox">
        <span aria-hidden="true">⌕</span>
        <input id="gameSearch" type="search" inputmode="search" placeholder="ゲーム名を検索" autocomplete="off">
        <button id="clearSearch" type="button" aria-label="検索をクリア">×</button>
      </label>
      <div class="filterRow" id="categoryFilters" aria-label="カテゴリ絞り込み"></div>
      <div class="browserMeta"><span id="resultCount">0 GAMES</span><span>カテゴリで絞り込みできます</span></div>
    </div>

    <div class="categoryViewport" id="categoryViewport">
      <div class="categoryTrack" id="categoryTrack">
        <div class="gameGrid" id="gameGrid"></div>
        <div id="emptyState" class="emptyState hidden"><b>該当するゲームがありません</b><span>検索条件やカテゴリを変更してください。</span></div>
      </div>
    </div>
  </section>

  <section class="notice">
    <b>PORTAL STRUCTURE</b>
    <p>ゲーム情報は各ゲームの game.json を基準に自動生成されます。ゲーム追加時にポータルHTMLを直接編集する必要はありません。</p>
  </section>
  <footer class="footer">MINI GAME PORTAL</footer>
</main>
<script src="./shared/js/player-store.js"></script>
<script src="./portal/js/player-summary.js"></script>
<script src="./portal/js/portal.js"></script>
</body>
</html>
'''


def player_store_js() -> str:
    return r'''(() => {
  'use strict';
  const SAVE_KEY = 'mini_game_portal_save_v1';

  function newPlayerId(){
    try{if(globalThis.crypto?.randomUUID)return globalThis.crypto.randomUUID()}catch(_){}
    return `mg-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,10)}`;
  }

  function normalize(data){
    const now = new Date().toISOString();
    if(!data || typeof data !== 'object') data = {};
    data.schemaVersion = 1;
    if(!data.player || typeof data.player !== 'object') data.player = {};
    if(!data.player.playerId) data.player.playerId = newPlayerId();
    if(!String(data.player.displayName || '').trim()) data.player.displayName = 'PLAYER';
    if(!data.player.createdAt) data.player.createdAt = now;
    if(!data.player.updatedAt) data.player.updatedAt = data.player.createdAt;
    if(!data.overall || typeof data.overall !== 'object') data.overall = {};
    if(!data.games || typeof data.games !== 'object' || Array.isArray(data.games)) data.games = {};
    if(!data.backup || typeof data.backup !== 'object') data.backup = {};
    data.overall.totalPlays = Number(data.overall.totalPlays) || 0;
    data.overall.playedGames = Object.values(data.games).filter(g => (Number(g?.plays) || 0) > 0).length;
    data.overall.lastPlayedGameId ??= null;
    data.overall.lastPlayedAt ??= null;
    data.backup.lastExportedAt ??= null;
    data.backup.lastImportedAt ??= null;
    return data;
  }

  function load(){
    let data = null;
    try{data = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null')}catch(_){data = null}
    data = normalize(data);
    try{localStorage.setItem(SAVE_KEY, JSON.stringify(data))}catch(_){}
    return data;
  }

  function save(data){
    const normalized = normalize(data);
    try{localStorage.setItem(SAVE_KEY, JSON.stringify(normalized))}catch(_){}
    return normalized;
  }

  globalThis.MiniGamePortalPlayerStore = { SAVE_KEY, load, save, normalize };
})();
'''


def player_summary_js() -> str:
    return r'''(() => {
  'use strict';
  const nameEl = document.getElementById('portalPlayerName');
  const metaEl = document.getElementById('portalPlayerMeta');
  function render(){
    const data = globalThis.MiniGamePortalPlayerStore?.load?.();
    if(!data) return;
    if(nameEl) nameEl.textContent = data.player.displayName;
    if(metaEl) metaEl.textContent = `PLAY ${data.overall.totalPlays.toLocaleString('ja-JP')} / GAMES ${data.overall.playedGames.toLocaleString('ja-JP')}`;
  }
  render();
  window.addEventListener('pageshow', render);
  document.addEventListener('visibilitychange', () => { if(!document.hidden) render(); });
})();
'''


def portal_js() -> str:
    return r'''(() => {
  'use strict';
  const search = document.getElementById('gameSearch');
  const clear = document.getElementById('clearSearch');
  const filters = document.getElementById('categoryFilters');
  const grid = document.getElementById('gameGrid');
  const count = document.getElementById('resultCount');
  const empty = document.getElementById('emptyState');
  const viewport = document.getElementById('categoryViewport');

  let games = [];
  let categories = [{id:'all', label:'ALL'}];
  let categoryIndex = 0;
  let pointerStart = null;

  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));

  function renderFilters(){
    filters.innerHTML = categories.map((item, index) =>
      `<button type="button" class="filterChip${index === categoryIndex ? ' active' : ''}" data-index="${index}" data-filter="${esc(item.id)}">${esc(item.label)}</button>`
    ).join('');
  }

  function cardHtml(game){
    const haystack = [game.name, game.description, ...(game.searchTerms || [])].join(' ');
    const icon = `<img class="tileIconImage" src="${esc(game.icon)}" alt="">`;
    const inner = `
      <div class="tileTop">
        <div class="tileIcon gameIcon" aria-hidden="true">${icon}</div>
        <span class="miniStatus${game.available ? ' playable' : ''}">${game.available ? 'PLAYABLE' : 'SOON'}</span>
      </div>
      <div class="tileCategory">${esc(game.categoryLabel || game.category)}</div>
      <h3>${esc(game.name)}</h3>
      <p>${esc(game.description || '')}</p>
      <div class="tileAction${game.available ? '' : ' muted'}">${game.available ? 'PLAY <span>›</span>' : 'COMING SOON'}</div>`;

    if(game.available){
      return `<a class="gameTile available" href="${esc(game.path)}" data-category="${esc(game.category)}" data-search="${esc(haystack)}">${inner}</a>`;
    }
    return `<div class="gameTile disabled" data-category="${esc(game.category)}" data-search="${esc(haystack)}">${inner}</div>`;
  }

  function renderGames(){
    grid.innerHTML = games.map(cardHtml).join('');
    applyFilter();
  }

  function applyFilter(){
    const selected = categories[categoryIndex]?.id || 'all';
    const query = (search.value || '').trim().toLocaleLowerCase('ja');
    let visible = 0;
    [...grid.querySelectorAll('.gameTile')].forEach(card => {
      const categoryOk = selected === 'all' || card.dataset.category === selected;
      const searchOk = !query || (card.dataset.search || '').toLocaleLowerCase('ja').includes(query);
      const show = categoryOk && searchOk;
      card.classList.toggle('hidden', !show);
      if(show) visible += 1;
    });
    count.textContent = `${visible} GAMES`;
    empty.classList.toggle('hidden', visible !== 0);
    [...filters.querySelectorAll('.filterChip')].forEach((button, index) => button.classList.toggle('active', index === categoryIndex));
  }

  function selectCategory(index){
    const next = Math.max(0, Math.min(categories.length - 1, index));
    if(next === categoryIndex) return;
    categoryIndex = next;
    applyFilter();
    filters.querySelector(`[data-index="${categoryIndex}"]`)?.scrollIntoView({behavior:'smooth', block:'nearest', inline:'center'});
  }

  filters.addEventListener('click', event => {
    const button = event.target.closest('.filterChip');
    if(!button) return;
    selectCategory(Number(button.dataset.index));
  });
  search.addEventListener('input', applyFilter);
  clear.addEventListener('click', () => { search.value = ''; search.focus(); applyFilter(); });

  viewport.addEventListener('pointerdown', event => {
    pointerStart = {x:event.clientX, y:event.clientY};
  });
  viewport.addEventListener('pointerup', event => {
    if(!pointerStart) return;
    const dx = event.clientX - pointerStart.x;
    const dy = event.clientY - pointerStart.y;
    pointerStart = null;
    if(Math.abs(dx) < 45 || Math.abs(dx) <= Math.abs(dy) * 1.15) return;
    selectCategory(categoryIndex + (dx < 0 ? 1 : -1));
  });
  viewport.addEventListener('pointercancel', () => { pointerStart = null; });

  async function cachePlayableGames(){
    if(!('serviceWorker' in navigator)) return;
    try{
      const registration = await navigator.serviceWorker.register('./sw.js');
      await navigator.serviceWorker.ready;
      const urls = ['./portal/games.json'];
      games.filter(game => game.available).forEach(game => {
        urls.push(game.path, ...(game.assets || []));
      });
      (registration.active || navigator.serviceWorker.controller)?.postMessage({type:'CACHE_URLS', urls});
    }catch(error){
      console.warn('Service Worker registration failed', error);
    }
  }

  async function init(){
    try{
      const response = await fetch('./portal/games.json', {cache:'no-store'});
      if(!response.ok) throw new Error(`games.json: ${response.status}`);
      games = await response.json();
      games.sort((a,b) => String(a.name).localeCompare(String(b.name), 'ja', {numeric:true, sensitivity:'base'}));
      const categoryMap = new Map();
      games.forEach(game => { if(!categoryMap.has(game.category)) categoryMap.set(game.category, game.categoryLabel || game.category); });
      categories = [{id:'all', label:'ALL'}, ...[...categoryMap].map(([id,label]) => ({id,label}))];
      renderFilters();
      renderGames();
      cachePlayableGames();
    }catch(error){
      console.error(error);
      count.textContent = '0 GAMES';
      empty.classList.remove('hidden');
      empty.querySelector('b').textContent = 'ゲーム一覧を読み込めませんでした';
      empty.querySelector('span').textContent = '通信状態を確認して再読み込みしてください。';
    }
  }

  init();
})();
'''


def service_worker_js() -> str:
    return r'''const CACHE_NAME = 'mini-game-portal-v3';

const CORE_PATHS = [
  './',
  './index.html',
  './portal/css/portal.css',
  './portal/js/portal.js',
  './portal/js/player-summary.js',
  './portal/games.json',
  './shared/js/player-store.js',
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
'''


def build_manifest() -> None:
    games = []
    for game_json_path in sorted((ROOT / "games").glob("*/*/game.json")):
        data = json.loads(game_json_path.read_text(encoding="utf-8"))
        game_dir = game_json_path.parent
        rel_dir = game_dir.relative_to(ROOT).as_posix()
        assets = []
        for path in sorted(game_dir.rglob("*")):
            if not path.is_file() or path.name == "game.json":
                continue
            assets.append("./" + path.relative_to(ROOT).as_posix())
        data["path"] = f"./{rel_dir}/"
        icon = str(data.get("icon", "./icon.svg"))
        data["icon"] = f"./{rel_dir}/{icon.removeprefix('./')}"
        data["assets"] = assets
        games.append(data)
    games.sort(key=lambda game: (str(game.get("name", "")).casefold(), str(game.get("id", ""))))
    write_text(ROOT / "portal" / "games.json", json.dumps(games, ensure_ascii=False, indent=2) + "\n")


def write_portal_files() -> None:
    write_text(ROOT / "portal" / "css" / "portal.css", extract_portal_css())
    write_text(ROOT / "shared" / "js" / "player-store.js", player_store_js())
    write_text(ROOT / "portal" / "js" / "player-summary.js", player_summary_js())
    write_text(ROOT / "portal" / "js" / "portal.js", portal_js())
    write_text(ROOT / "index.html", portal_index_html())
    write_text(ROOT / "sw.js", service_worker_js())


def main() -> None:
    migrate_games()
    write_portal_files()
    build_manifest()
    print("Portal v2 migration completed")


if __name__ == "__main__":
    main()
