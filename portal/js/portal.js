(() => {
  'use strict';
  const search = document.getElementById('gameSearch');
  const clear = document.getElementById('clearSearch');
  const filters = document.getElementById('categoryFilters');
  const grid = document.getElementById('gameGrid');
  const count = document.getElementById('resultCount');
  const empty = document.getElementById('emptyState');
  const viewport = document.getElementById('categoryViewport');
  const track = document.getElementById('categoryTrack');
  const isLocalFile = location.protocol === 'file:';

  let games = Array.isArray(globalThis.MINI_GAME_PORTAL_GAMES)
    ? [...globalThis.MINI_GAME_PORTAL_GAMES]
    : [];
  let categories = [{id:'all', label:'ALL'}];
  let categoryIndex = 0;

  let pointerDown = false;
  let dragging = false;
  let startX = 0;
  let startY = 0;
  let deltaX = 0;
  let width = 1;
  let animationLock = false;
  let suppressClickUntil = 0;

  const CATEGORY_ORDER = ['casino','board','action','rpg','other'];
  const SWIPE_MIN = 48;
  const SWIPE_RATIO = 0.18;
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
      return `<a class="gameTile available" href="${esc(game.path)}" data-local-entry="${esc(game.localEntry || `${game.path}index.html`)}" data-category="${esc(game.category)}" data-search="${esc(haystack)}">${inner}</a>`;
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

  function keepActiveFilterVisible(){
    const button = filters.querySelector(`[data-index="${categoryIndex}"]`);
    if(!button) return;
    const rowRect = filters.getBoundingClientRect();
    const buttonRect = button.getBoundingClientRect();
    let nextLeft = filters.scrollLeft;
    if(buttonRect.left < rowRect.left){
      nextLeft -= rowRect.left - buttonRect.left + 8;
    }else if(buttonRect.right > rowRect.right){
      nextLeft += buttonRect.right - rowRect.right + 8;
    }
    if(nextLeft !== filters.scrollLeft){
      filters.scrollTo({left:Math.max(0, nextLeft), behavior:'smooth'});
    }
  }

  function setTrackX(x, animate){
    track.classList.toggle('animating', !!animate);
    if(!animate) track.classList.remove('animating');
    track.style.transform = `translate3d(${x}px,0,0)`;
  }

  function finishAnimation(callback){
    let finished = false;
    const done = () => {
      if(finished) return;
      finished = true;
      track.removeEventListener('transitionend', done);
      callback();
    };
    track.addEventListener('transitionend', done, {once:true});
    setTimeout(done, 320);
  }

  function completeCategoryChange(nextIndex, direction){
    categoryIndex = nextIndex;
    applyFilter();
    keepActiveFilterVisible();

    track.classList.remove('animating');
    track.style.transition = 'none';
    track.style.transform = `translate3d(${direction > 0 ? -width : width}px,0,0)`;

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        track.style.transition = '';
        setTrackX(0, true);
        finishAnimation(() => {
          setTrackX(0, false);
          animationLock = false;
        });
      });
    });
  }

  function moveToIndex(index){
    const next = Math.max(0, Math.min(categories.length - 1, index));
    if(next === categoryIndex || animationLock) return;

    width = Math.max(1, viewport.clientWidth);
    const direction = next > categoryIndex ? 1 : -1;
    animationLock = true;
    setTrackX(direction > 0 ? -width : width, true);
    finishAnimation(() => completeCategoryChange(next, direction));
  }

  filters.addEventListener('click', event => {
    const button = event.target.closest('.filterChip');
    if(!button) return;
    moveToIndex(Number(button.dataset.index));
  });
  search.addEventListener('input', applyFilter);
  clear.addEventListener('click', () => { search.value = ''; search.focus(); applyFilter(); });

  grid.addEventListener('click', event => {
    if(Date.now() < suppressClickUntil){
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if(!isLocalFile) return;
    const link = event.target.closest('a.gameTile.available');
    if(!link) return;
    event.preventDefault();
    location.href = link.dataset.localEntry || `${link.getAttribute('href')}index.html`;
  });

  viewport.addEventListener('pointerdown', event => {
    if(animationLock) return;
    pointerDown = true;
    dragging = false;
    startX = event.clientX;
    startY = event.clientY;
    deltaX = 0;
    width = Math.max(1, viewport.clientWidth);
    track.classList.add('dragging');
    track.classList.remove('animating');
  });

  viewport.addEventListener('pointermove', event => {
    if(!pointerDown || animationLock) return;

    const dx = event.clientX - startX;
    const dy = event.clientY - startY;

    if(!dragging){
      if(Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      if(Math.abs(dy) > Math.abs(dx)){
        pointerDown = false;
        track.classList.remove('dragging');
        setTrackX(0, false);
        return;
      }
      dragging = true;
      try{ viewport.setPointerCapture(event.pointerId); }catch(_){}
    }

    deltaX = dx;
    if((categoryIndex === 0 && deltaX > 0) || (categoryIndex === categories.length - 1 && deltaX < 0)){
      deltaX *= 0.28;
    }
    setTrackX(deltaX, false);
  });

  function endPointer(event){
    if(!pointerDown && !dragging) return;

    pointerDown = false;
    track.classList.remove('dragging');
    try{ viewport.releasePointerCapture(event.pointerId); }catch(_){}

    if(!dragging){
      setTrackX(0, false);
      deltaX = 0;
      return;
    }

    dragging = false;
    suppressClickUntil = Date.now() + 300;
    width = Math.max(1, viewport.clientWidth);
    const threshold = Math.max(SWIPE_MIN, width * SWIPE_RATIO);
    const canGoNext = categoryIndex < categories.length - 1;
    const canGoPrev = categoryIndex > 0;

    if(deltaX <= -threshold && canGoNext){
      animationLock = true;
      setTrackX(-width, true);
      finishAnimation(() => completeCategoryChange(categoryIndex + 1, 1));
    }else if(deltaX >= threshold && canGoPrev){
      animationLock = true;
      setTrackX(width, true);
      finishAnimation(() => completeCategoryChange(categoryIndex - 1, -1));
    }else{
      setTrackX(0, true);
      finishAnimation(() => setTrackX(0, false));
    }

    deltaX = 0;
  }

  viewport.addEventListener('pointerup', endPointer);
  viewport.addEventListener('pointercancel', endPointer);
  viewport.addEventListener('dragstart', event => event.preventDefault());

  async function cachePlayableGames(){
    if(isLocalFile || !('serviceWorker' in navigator)) return;
    try{
      const registration = await navigator.serviceWorker.register('./sw.js');
      await navigator.serviceWorker.ready;
      const urls = ['./portal/games.json', './portal/games.js'];
      games.filter(game => game.available).forEach(game => {
        urls.push(game.path, ...(game.assets || []));
      });
      (registration.active || navigator.serviceWorker.controller)?.postMessage({type:'CACHE_URLS', urls});
    }catch(error){
      console.warn('Service Worker registration failed', error);
    }
  }

  function init(){
    if(!games.length){
      count.textContent = '0 GAMES';
      empty.classList.remove('hidden');
      empty.querySelector('b').textContent = 'ゲーム一覧を読み込めませんでした';
      empty.querySelector('span').textContent = 'portal/games.js を確認してください。';
      return;
    }

    games.sort((a,b) => String(a.name).localeCompare(String(b.name), 'ja', {numeric:true, sensitivity:'base'}));
    const categoryMap = new Map();
    games.forEach(game => {
      if(!categoryMap.has(game.category)) categoryMap.set(game.category, game.categoryLabel || game.category);
    });
    const ordered = [...categoryMap.entries()].sort((a,b) => {
      const ai = CATEGORY_ORDER.indexOf(a[0]);
      const bi = CATEGORY_ORDER.indexOf(b[0]);
      const av = ai === -1 ? Number.MAX_SAFE_INTEGER : ai;
      const bv = bi === -1 ? Number.MAX_SAFE_INTEGER : bi;
      return av - bv || String(a[1]).localeCompare(String(b[1]), 'ja');
    });
    categories = [{id:'all', label:'ALL'}, ...ordered.map(([id,label]) => ({id,label}))];
    renderFilters();
    renderGames();
    cachePlayableGames();
  }

  init();
})();
