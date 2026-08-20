from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SHARED = ROOT / "shared" / "js" / "player-store.js"

SHARED_JS = r'''(() => {
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
'''

ALIAS_TEMPLATE = '''{indent}const {{
{indent}  now: mgPortalNow,
{indent}  newPlayerId: mgPortalNewId,
{indent}  defaultSave: mgPortalDefaultSave,
{indent}  load: mgPortalLoad,
{indent}  save: mgPortalSave,
{indent}  profile: mgPortalProfile,
{indent}  recordValue: mgPortalRecordValue,
{indent}  setRecord: mgPortalSetRecord,
{indent}  recordPlay: mgPortalRecordPlay
{indent}}} = globalThis.MiniGamePortalPlayerStore;
'''


def replace_helper_block(path: Path) -> bool:
    text = path.read_text(encoding="utf-8")
    marker = "const PORTAL_SAVE_KEY='mini_game_portal_save_v1';"
    start = text.find(marker)
    if start < 0:
        return False

    line_start = text.rfind("\n", 0, start) + 1
    indent = text[line_start:start]
    if indent.strip():
        indent = ""

    record_start = text.find("function mgPortalRecordPlay", start)
    if record_start < 0:
        raise RuntimeError(f"mgPortalRecordPlay not found in {path}")
    return_pos = text.find("return game;", record_start)
    if return_pos < 0:
        raise RuntimeError(f"return game not found in {path}")
    end = text.find("}", return_pos)
    if end < 0:
        raise RuntimeError(f"helper block end not found in {path}")
    end += 1

    replacement = ALIAS_TEMPLATE.format(indent=indent).rstrip("\n")
    new_text = text[:start] + replacement + text[end:]
    path.write_text(new_text, encoding="utf-8", newline="\n")
    return True


def inject_shared_script(index_path: Path) -> None:
    text = index_path.read_text(encoding="utf-8")
    shared_src = "../../../shared/js/player-store.js"
    if shared_src in text:
        return
    needle = '<script src="./js/game.js"></script>'
    if needle not in text:
        raise RuntimeError(f"game script tag not found in {index_path}")
    text = text.replace(needle, f'<script src="{shared_src}"></script>\n{needle}', 1)
    index_path.write_text(text, encoding="utf-8", newline="\n")


def main() -> None:
    SHARED.parent.mkdir(parents=True, exist_ok=True)
    SHARED.write_text(SHARED_JS, encoding="utf-8", newline="\n")

    changed = []
    for game_json in sorted((ROOT / "games").glob("*/*/game.json")):
        game_dir = game_json.parent
        index_path = game_dir / "index.html"
        if not index_path.exists():
            continue
        inject_shared_script(index_path)
        js_path = game_dir / "js" / "game.js"
        if js_path.exists() and replace_helper_block(js_path):
            changed.append(js_path.relative_to(ROOT).as_posix())

    print(f"centralized portal player helpers in {len(changed)} game scripts")
    for path in changed:
        print(f"  {path}")


if __name__ == "__main__":
    main()
