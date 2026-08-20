(() => {
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
