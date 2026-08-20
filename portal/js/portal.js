(() => {
  'use strict';
  const search = document.getElementById('gameSearch');
  const clear = document.getElementById('clearSearch');
  const filters = document.getElementById('categoryFilters');
  const grid = document.getElementById('gameGrid');
  const count = document.getElementById('resultCount');
  const empty = document.getElementById('emptyState');
  const viewport = document.getElementById('categoryViewport');
  const CATEGORY_ORDER = ['casino', 'board', 'action', 'rpg', 'other'];

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
      const discovered = [...categoryMap].map(([id,label]) => ({id,label}));
      discovered.sort((a,b) => {
        const ai = CATEGORY_ORDER.indexOf(a.id);
        const bi = CATEGORY_ORDER.indexOf(b.id);
        const ar = ai === -1 ? Number.MAX_SAFE_INTEGER : ai;
        const br = bi === -1 ? Number.MAX_SAFE_INTEGER : bi;
        return ar - br || String(a.label).localeCompare(String(b.label), 'ja');
      });
      categories = [{id:'all', label:'ALL'}, ...discovered];
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
