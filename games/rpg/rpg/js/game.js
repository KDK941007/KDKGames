(() => {
  'use strict';
  const frame = document.getElementById('rpgGameFrame');
  if (!frame) return;
  frame.addEventListener('load', () => {
    document.body.classList.add('game-loaded');
  }, {once:true});
})();
