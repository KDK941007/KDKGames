(() => {
  'use strict';
  const SAVE_KEY = 'mini_game_portal_save_v1';

  function now(){ return new Date().toISOString(); }
  function newPlayerId(){
    try{if(globalThis.crypto?.randomUUID)return globalThis.crypto.randomUUID()}catch(_){}
    return `mg-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,10)}`;
  }
  function defaultSave(){
    const createdAt = now();
    return {
      schemaVersion:1,
      player:{playerId:newPlayerId(),displayName:'PLAYER',createdAt,updatedAt:createdAt},
      overall:{totalPlays:0,playedGames:0,lastPlayedGameId:null,lastPlayedAt:null},
      games:{},
      backup:{lastExportedAt:null,lastImportedAt:null}
    };
  }
  function normalize(data){
    const fallback = defaultSave();
    if(!data || typeof data !== 'object') data = fallback;
    data.schemaVersion = 1;
    if(!data.player || typeof data.player !== 'object') data.player = fallback.player;
    if(!data.player.playerId) data.player.playerId = newPlayerId();
    if(!String(data.player.displayName || '').trim()) data.player.displayName = 'PLAYER';
    if(!data.player.createdAt) data.player.createdAt = now();
    if(!data.player.updatedAt) data.player.updatedAt = data.player.createdAt;
    if(!data.overall || typeof data.overall !== 'object') data.overall = fallback.overall;
    if(!data.games || typeof data.games !== 'object' || Array.isArray(data.games)) data.games = {};
    if(!data.backup || typeof data.backup !== 'object') data.backup = fallback.backup;
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
    data = normalize(data);
    data.player.updatedAt = now();
    data.overall.playedGames = Object.values(data.games || {}).filter(g => (Number(g?.plays) || 0) > 0).length;
    try{localStorage.setItem(SAVE_KEY, JSON.stringify(data))}catch(_){}
    return data;
  }
  function profile(){ return load().player; }
  function recordValue(game,key){ return Number(game?.records?.[key]?.value) || 0; }
  function setRecord(game,key,label,value,format='number'){
    game.records ||= {};
    game.records[key] = {label,value,format};
  }
  function recordPlay(gameId,title,mutate){
    const data = load();
    const playedAt = now();
    const game = data.games[gameId] || {gameId,title,recordVersion:1,plays:0,lastPlayedAt:null,records:{}};
    game.title = title;
    game.recordVersion = 1;
    game.plays = (Number(game.plays) || 0) + 1;
    game.lastPlayedAt = playedAt;
    if(typeof mutate === 'function') mutate(game,data);
    data.games[gameId] = game;
    data.overall.totalPlays = (Number(data.overall.totalPlays) || 0) + 1;
    data.overall.lastPlayedGameId = gameId;
    data.overall.lastPlayedAt = playedAt;
    save(data);
    return game;
  }

  globalThis.MiniGamePortalPlayerStore = {
    SAVE_KEY,
    now,
    newPlayerId,
    defaultSave,
    normalize,
    load,
    save,
    profile,
    recordValue,
    setRecord,
    recordPlay
  };
})();
