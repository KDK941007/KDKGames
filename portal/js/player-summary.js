(() => {
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
