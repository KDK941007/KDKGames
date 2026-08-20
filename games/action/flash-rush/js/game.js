(() => {
  'use strict';
  // FLASH RUSH v4.3.2: profile USER name + session-only GUEST name

  const $ = s => document.querySelector(s);
  const startScreen = $('#startScreen');
  const gameScreen = $('#gameScreen');
  const endScreen = $('#endScreen');
  const gameArea = $('#gameArea');
  const stage = $('#microStage');
  const progressBar = $('#progressBar');
  const scoreValue = $('#scoreValue');
  const roundValue = $('#roundValue');
  const levelValue = $('#levelValue');
  const speedValue = $('#speedValue');
  const livesEl = $('#lives');
  const bestStart = $('#bestStart');
  const pauseOverlay = $('#pauseOverlay');
  const zoneValue = $('#zoneValue');

  const state = {
    score:0, round:0, lives:4, speed:1, level:1, clears:0,
    running:false, resolving:false, paused:false, sound:true, playerType:'user', playerName:'PLAYER',
    lastGame:'', cleanup:[], timerRaf:0, duration:4000, elapsed:0,
    timeoutSuccess:false, currentGame:'', runToken:0, roundToken:0,
    audioUnlocked:false, roundInteracted:false,
    normalRoundsSinceBoss:0, roundType:'normal', previousRoundType:'', bossCount:0,
    launchedRoundToken:-1, isBossRound:false, lastBossGame:'', bossBag:[], recentGames:[]
  };

  let best = loadBest();
  bestStart.textContent = best;

  function loadBest(){ try{return Number(localStorage.getItem('flashRushBest')||0)||0}catch(_){return 0} }
  function saveBest(v){ try{localStorage.setItem('flashRushBest',String(v))}catch(_){} }

  const PORTAL_SAVE_KEY='mini_game_portal_save_v1';
  function mgPortalNow(){return new Date().toISOString()}
  function mgPortalNewId(){
    try{if(globalThis.crypto?.randomUUID)return globalThis.crypto.randomUUID()}catch(_){}
    return `mg-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,10)}`;
  }
  function mgPortalDefaultSave(){
    const now=mgPortalNow();
    return {
      schemaVersion:1,
      player:{playerId:mgPortalNewId(),displayName:'PLAYER',createdAt:now,updatedAt:now},
      overall:{totalPlays:0,playedGames:0,lastPlayedGameId:null,lastPlayedAt:null},
      games:{},
      backup:{lastExportedAt:null,lastImportedAt:null}
    };
  }
  function mgPortalLoad(){
    let data=null;
    try{data=JSON.parse(localStorage.getItem(PORTAL_SAVE_KEY)||'null')}catch(_){data=null}
    if(!data||typeof data!=='object')data=mgPortalDefaultSave();
    if(data.schemaVersion!==1)data.schemaVersion=1;
    if(!data.player||typeof data.player!=='object')data.player=mgPortalDefaultSave().player;
    if(!data.player.playerId)data.player.playerId=mgPortalNewId();
    if(!String(data.player.displayName||'').trim())data.player.displayName='PLAYER';
    if(!data.player.createdAt)data.player.createdAt=mgPortalNow();
    if(!data.player.updatedAt)data.player.updatedAt=data.player.createdAt;
    if(!data.overall||typeof data.overall!=='object')data.overall={totalPlays:0,playedGames:0,lastPlayedGameId:null,lastPlayedAt:null};
    if(!data.games||typeof data.games!=='object'||Array.isArray(data.games))data.games={};
    if(!data.backup||typeof data.backup!=='object')data.backup={lastExportedAt:null,lastImportedAt:null};
    try{localStorage.setItem(PORTAL_SAVE_KEY,JSON.stringify(data))}catch(_){}
    return data;
  }
  function mgPortalSave(data){
    if(!data?.player)return;
    data.player.updatedAt=mgPortalNow();
    data.overall.playedGames=Object.values(data.games||{}).filter(g=>(Number(g?.plays)||0)>0).length;
    try{localStorage.setItem(PORTAL_SAVE_KEY,JSON.stringify(data))}catch(_){}
  }
  function mgPortalProfile(){return mgPortalLoad().player}
  function mgPortalRecordValue(game,key){return Number(game?.records?.[key]?.value)||0}
  function mgPortalSetRecord(game,key,label,value,format='number'){
    game.records ||= {};
    game.records[key]={label,value,format};
  }
  function mgPortalRecordPlay(gameId,title,mutate){
    const data=mgPortalLoad();
    const now=mgPortalNow();
    const game=data.games[gameId]||{gameId,title,recordVersion:1,plays:0,lastPlayedAt:null,records:{}};
    game.title=title;
    game.recordVersion=1;
    game.plays=(Number(game.plays)||0)+1;
    game.lastPlayedAt=now;
    if(typeof mutate==='function')mutate(game,data);
    data.games[gameId]=game;
    data.overall.totalPlays=(Number(data.overall.totalPlays)||0)+1;
    data.overall.lastPlayedGameId=gameId;
    data.overall.lastPlayedAt=now;
    mgPortalSave(data);
    return game;
  }

  function showScreen(screen){ [startScreen,gameScreen,endScreen].forEach(s=>s.classList.toggle('active',s===screen)); }
  function clamp(v,min,max){ return Math.max(min,Math.min(max,v)); }
  function rand(min,max){ return Math.random()*(max-min)+min; }
  function randInt(min,max){ return Math.floor(rand(min,max+1)); }
  function pick(arr){ return arr[Math.floor(Math.random()*arr.length)]; }
  function shuffle(arr){
    const out=[...arr];
    for(let i=out.length-1;i>0;i--){
      const j=Math.floor(Math.random()*(i+1));
      [out[i],out[j]]=[out[j],out[i]];
    }
    return out;
  }


  // 4択の正解位置を前回と同じ場所に固定しない。
  const choiceAnswerSlotHistory=new Map();
  function shuffledChoiceOptions(options,answer,key){
    let arr=shuffle(options);
    if(arr.length<2) return arr;
    const prev=choiceAnswerSlotHistory.get(key);
    let idx=arr.findIndex(v=>v===answer);
    if(prev!=null && idx===prev){
      const candidates=arr.map((_,i)=>i).filter(i=>i!==idx);
      const swapIndex=pick(candidates);
      [arr[idx],arr[swapIndex]]=[arr[swapIndex],arr[idx]];
      idx=swapIndex;
    }
    choiceAnswerSlotHistory.set(key,idx);
    return arr;
  }

  // Emoji/font glyphをそのまま見せず、低解像度・減色済みの透明ビットマップへ変換する。
  // 透明背景のまま1emで表示するため、物体を四角いカードへ押し込めない。
  const pixelSpriteCache=new Map();
  const EMOJI_TOKEN_RE=/(\p{Extended_Pictographic}(?:\uFE0F|\u200D\p{Extended_Pictographic})*|[★☆●○▲△■□◆◇♥♡✦⚡←→↑↓▣])/gu;
  function pixelSpriteData(symbol){
    if(pixelSpriteCache.has(symbol)) return pixelSpriteCache.get(symbol);

    // v3.6: every pictorial glyph is converted into the same low-resolution
    // game palette. This intentionally removes the glossy native emoji look.
    const hi=document.createElement('canvas'); hi.width=96; hi.height=96;
    const hc=hi.getContext('2d',{willReadFrequently:true});
    hc.clearRect(0,0,96,96);
    hc.textAlign='center'; hc.textBaseline='middle';
    hc.fillStyle='#ffffff';
    hc.font='74px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji","Courier New",sans-serif';
    hc.fillText(symbol,48,51);

    const src=hc.getImageData(0,0,96,96), sd=src.data;
    let minX=96,minY=96,maxX=-1,maxY=-1;
    for(let y=0;y<96;y++) for(let x=0;x<96;x++){
      const a=sd[(y*96+x)*4+3];
      if(a<28) continue;
      if(x<minX)minX=x;if(x>maxX)maxX=x;if(y<minY)minY=y;if(y>maxY)maxY=y;
    }
    if(maxX<minX||maxY<minY){minX=12;minY=12;maxX=83;maxY=83;}
    const pad=2;
    minX=Math.max(0,minX-pad);minY=Math.max(0,minY-pad);
    maxX=Math.min(95,maxX+pad);maxY=Math.min(95,maxY+pad);
    const sw=maxX-minX+1,sh=maxY-minY+1;

    // 12–15 source pixels across the longest edge is intentionally coarse.
    const maxPx=14;
    const scale=maxPx/Math.max(sw,sh);
    const tw=Math.max(5,Math.round(sw*scale));
    const th=Math.max(5,Math.round(sh*scale));
    const raw=document.createElement('canvas'); raw.width=tw; raw.height=th;
    const rc=raw.getContext('2d',{willReadFrequently:true});
    rc.imageSmoothingEnabled=false;
    rc.drawImage(hi,minX,minY,sw,sh,0,0,tw,th);
    const img=rc.getImageData(0,0,tw,th), d=img.data;

    const palette=[
      [7,11,23],       // ink
      [232,246,255],   // white
      [57,231,255],    // cyan
      [255,79,163],    // pink
      [255,216,74],    // yellow
      [85,239,156],    // green
      [255,93,108],    // red
      [142,108,255],   // violet
      [192,132,86],    // brown
      [113,135,166]    // steel
    ];
    function nearest(r,g,b){
      let best=palette[0],bestD=Infinity;
      for(const p of palette){
        const dr=r-p[0],dg=g-p[1],db=b-p[2];
        const dist=dr*dr+dg*dg+db*db;
        if(dist<bestD){bestD=dist;best=p;}
      }
      return best;
    }
    for(let i=0;i<d.length;i+=4){
      if(d[i+3]<72){d[i+3]=0;continue;}
      const p=nearest(d[i],d[i+1],d[i+2]);
      d[i]=p[0];d[i+1]=p[1];d[i+2]=p[2];d[i+3]=255;
    }
    rc.putImageData(img,0,0);

    // Add a one-pixel dark outline around the actual silhouette.
    const lo=document.createElement('canvas');lo.width=tw+2;lo.height=th+2;
    const lc=lo.getContext('2d',{willReadFrequently:true});
    lc.imageSmoothingEnabled=false;
    const rawData=rc.getImageData(0,0,tw,th).data;
    lc.fillStyle='#070b17';
    for(let y=0;y<th;y++) for(let x=0;x<tw;x++){
      const a=rawData[(y*tw+x)*4+3]; if(!a) continue;
      for(let oy=-1;oy<=1;oy++) for(let ox=-1;ox<=1;ox++){
        if(!ox&&!oy) continue;
        lc.fillRect(x+1+ox,y+1+oy,1,1);
      }
    }
    lc.drawImage(raw,1,1);
    const data={url:lo.toDataURL('image/png'),w:lo.width,h:lo.height};
    pixelSpriteCache.set(symbol,data);
    return data;
  }
  function makePixelGlyph(symbol){
    const data=pixelSpriteData(symbol);
    const img=document.createElement('img');
    img.className='pixelGlyph'; img.alt=symbol;
    img.width=data.w; img.height=data.h;
    img.style.aspectRatio=`${data.w}/${data.h}`;
    img.src=data.url;
    return img;
  }
  function pixelizeTextNode(node){
    if(!node?.nodeValue || !node.parentNode) return;
    EMOJI_TOKEN_RE.lastIndex=0;
    if(!EMOJI_TOKEN_RE.test(node.nodeValue)) return;
    EMOJI_TOKEN_RE.lastIndex=0;
    const parts=node.nodeValue.split(EMOJI_TOKEN_RE);
    const frag=document.createDocumentFragment();
    for(const part of parts){
      if(!part) continue;
      EMOJI_TOKEN_RE.lastIndex=0;
      if(EMOJI_TOKEN_RE.test(part)) frag.appendChild(makePixelGlyph(part));
      else frag.appendChild(document.createTextNode(part));
    }
    node.replaceWith(frag);
  }
  function pixelizeElement(root){
    if(!root || root.nodeType!==1) return;
    if(root.matches?.('script,style,img.pixelGlyph,canvas')) return;
    const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
    const nodes=[]; let n;
    while((n=walker.nextNode())){
      if(n.parentElement?.closest('script,style')) continue;
      EMOJI_TOKEN_RE.lastIndex=0;
      if(EMOJI_TOKEN_RE.test(n.nodeValue||'')) nodes.push(n);
    }
    nodes.forEach(pixelizeTextNode);
  }
  let pixelSpriteRefreshTimer=0;
  function startPixelSpriteObserver(){
    const shell=document.querySelector('.shell');
    if(!shell) return;

    // MutationObserverは使用しない。ゲーム中はDOM更新が多く、
    // 自己再検知や過剰なコールバックが入力処理を塞ぐため。
    // 静的UIはここで1回、ゲーム内は各ラウンド生成直後＋低頻度走査で変換する。
    pixelizeElement(shell);

    if(pixelSpriteRefreshTimer) clearInterval(pixelSpriteRefreshTimer);
    pixelSpriteRefreshTimer=window.setInterval(()=>{
      if(document.hidden || !state.running || state.resolving) return;
      pixelizeElement(stage);
    },320);
  }

  function vibrate(ms){ try{navigator.vibrate?.(ms)}catch(_){} }
  function setStylePos(el,x,y){ el.style.left=x+'px'; el.style.top=y+'px'; }
  function rectsOverlap(a,b,pad=0){ return a.left+pad<b.right-pad&&a.right-pad>b.left+pad&&a.top+pad<b.bottom-pad&&a.bottom-pad>b.top+pad; }
  // LEVELはゲーム解放には使わず、速度・難易度パラメータ調整だけに使用する。
  function currentLevel(clears=state.clears){ return clears<8?1:clears<18?2:clears<30?3:4; }
  function currentSpeed(clears=state.clears){ return Math.min(8,Math.floor(clears/5)+1); }
  function regularDuration(){ return Math.max(1750,4300-(state.speed-1)*360-(state.level-1)*100); }
  function bossDuration(){ return Math.max(6000,9200-(state.speed-1)*360); }
  function promptDelay(){ return Math.max(330,620-(state.speed-1)*42); }

  const WORLD_ZONES={
    1:{id:'home',label:'HOME MAYHEM',jp:'朝の大騒動'},
    2:{id:'street',label:'STREET PANIC',jp:'街が大混乱'},
    3:{id:'work',label:'WORK RUSH',jp:'仕事も店も大忙し'},
    4:{id:'night',label:'NIGHT GLITCH',jp:'夜の街がバグった'}
  };
  function currentZone(){ return WORLD_ZONES[state.level]||WORLD_ZONES[4]; }
  function applyWorldZone(){
    const z=currentZone(); gameScreen.dataset.zone=z.id;
    if(zoneValue) zoneValue.textContent=z.label;
  }
  function hashString(s){ let h=2166136261>>>0; for(let i=0;i<s.length;i++){ h^=s.charCodeAt(i); h=Math.imul(h,16777619); } return h>>>0; }
  function generatedTheme(id){
    const h=hashString(id||'game');
    const bases=[165,196,220,247,262,294,330,349,392];
    const waves=['square','triangle','sine','sawtooth'];
    const scales=[[0,3,7,10,12,7,5,3],[0,4,7,11,12,9,7,4],[0,5,7,12,10,7,5,2],[0,2,7,9,14,12,7,5]];
    return {base:bases[h%bases.length],wave:waves[(h>>>5)%waves.length],tempo:138+((h>>>9)%58),notes:scales[(h>>>15)%scales.length]};
  }
  function themeFor(id){ return THEMES[id]||generatedTheme(id); }
  function pixelBurst(ok){
    const colors=ok?['#55ef9c','#39e7ff','#ffd84a','#ffffff']:['#ff5d6c','#ff4fa3','#ffd84a','#ffffff'];
    for(let i=0;i<18;i++){
      const p=document.createElement('i'); p.className='pixelFx'; p.style.left=(48+rand(-8,8))+'%'; p.style.top=(50+rand(-5,5))+'%';
      p.style.background=pick(colors); p.style.setProperty('--dx',rand(-150,150)+'px'); p.style.setProperty('--dy',rand(-130,130)+'px');
      gameArea.appendChild(p); setTimeout(()=>p.remove(),560);
    }
  }
  function addWorldBanner(text){ const b=document.createElement('div'); b.className='worldBanner'; b.textContent=text||currentZone().jp; stage.appendChild(b); return b; }

  function clearTransientOverlays(){
    gameArea.querySelectorAll('.promptCard,.resultFlash,.speedOverlay,.levelOverlay').forEach(el=>el.remove());
  }
  function clearStage(){
    state.cleanup.splice(0).forEach(fn=>{try{fn()}catch(_){}});
    cancelAnimationFrame(state.timerRaf);
    stage.replaceChildren();
    stage.classList.remove('shake');
    clearTransientOverlays();
  }
  function onCleanup(fn){ state.cleanup.push(fn); return fn; }
  function markInteraction(){
    if(state.running&&!state.paused&&!state.resolving) state.roundInteracted=true;
  }
  function touchAsPointer(e,type){
    const t=(type==='pointerup'||type==='pointercancel')?e.changedTouches?.[0]:e.touches?.[0];
    return {
      clientX:t?.clientX??0, clientY:t?.clientY??0, pointerId:null, pointerType:'touch',
      buttons:type==='pointermove'?1:0, cancelable:e.cancelable,
      preventDefault:()=>{ if(e.cancelable) e.preventDefault(); },
      stopPropagation:()=>e.stopPropagation(), originalEvent:e
    };
  }
  function listen(el,type,fn,opts){
    if(!type.startsWith('pointer')){
      el.addEventListener(type,fn,opts);
      onCleanup(()=>el.removeEventListener(type,fn,opts));
      return;
    }

    // Pointer Events対応ブラウザではPointer Eventsだけを使用する。
    // iPhoneでpointer/touchの両方を同時登録すると、長押しなどの1操作が
    // 二重の入力系列として扱われる可能性があるため重複登録しない。
    if('PointerEvent' in window){
      const pointerFn=e=>{
        if(type==='pointerdown') markInteraction();
        fn(e);
      };
      el.addEventListener(type,pointerFn,opts);
      onCleanup(()=>el.removeEventListener(type,pointerFn,opts));
      return;
    }

    // Pointer Events非対応環境のみTouch Eventsへフォールバックする。
    const touchType={pointerdown:'touchstart',pointermove:'touchmove',pointerup:'touchend',pointercancel:'touchcancel'}[type];
    if(!touchType) return;
    const touchOpts={passive:false};
    const touchFn=e=>{
      if(type==='pointerdown') markInteraction();
      fn(touchAsPointer(e,type));
    };
    el.addEventListener(touchType,touchFn,touchOpts);
    onCleanup(()=>el.removeEventListener(touchType,touchFn,touchOpts));
  }
  function safeCapture(el,e){
    try{ if(e.pointerId!==null&&e.pointerId!==undefined&&el.setPointerCapture) el.setPointerCapture(e.pointerId); }catch(_){}
  }
  function safeReleaseCapture(el,e){
    try{
      if(e?.pointerId!==null&&e?.pointerId!==undefined&&el.releasePointerCapture&&el.hasPointerCapture?.(e.pointerId)){
        el.releasePointerCapture(e.pointerId);
      }
    }catch(_){}
  }
  function gameLoop(step){
    // このループを生成したラウンドだけで生存させる。
    // step() の中で resolveRound() が呼ばれると cleanup が実行されるため、
    // cleanup 後に次の requestAnimationFrame を再予約しないことが重要。
    const ownerRunToken=state.runToken;
    const ownerRoundToken=state.roundToken;
    let raf=0, prev=performance.now(), alive=true;

    const stop=()=>{
      if(!alive) return;
      alive=false;
      if(raf) cancelAnimationFrame(raf);
      raf=0;
    };

    onCleanup(stop);

    const loop=()=>{
      if(
        !alive ||
        !state.running ||
        ownerRunToken!==state.runToken ||
        ownerRoundToken!==state.roundToken
      ){
        stop();
        return;
      }

      const now=performance.now();
      const dt=Math.min(.04,Math.max(0,(now-prev)/1000));
      prev=now;

      if(!state.paused && !state.resolving){
        step(now,dt);
      }

      // step() 内で resolveRound() → cleanup → stop() となった場合、
      // ここで必ず終了する。旧ラウンドのループを次ゲームへ持ち越さない。
      if(
        !alive ||
        !state.running ||
        state.resolving ||
        ownerRunToken!==state.runToken ||
        ownerRoundToken!==state.roundToken
      ){
        stop();
        return;
      }

      raf=requestAnimationFrame(loop);
    };

    raf=requestAnimationFrame(loop);
  }
  function activeDelay(ms, token=state.runToken){
    return new Promise(resolve=>{
      let elapsed=0,last=performance.now(),raf=0,done=false;
      const finish=value=>{
        if(done) return;
        done=true;
        cancelAnimationFrame(raf);
        resolve(value);
      };
      const step=()=>{
        if(token!==state.runToken||!state.running){ finish(false); return; }
        const now=performance.now();
        if(!state.paused) elapsed+=Math.max(0,now-last);
        last=now;
        if(elapsed>=ms){ finish(true); return; }
        raf=requestAnimationFrame(step);
      };
      raf=requestAnimationFrame(step);
    });
  }


  const playerModeName=$('#playerModeName');
  const playerModeGuestName=$('#playerModeGuestName');
  const playerModeButtons=[...document.querySelectorAll('[data-player-mode]')];
  let selectedPlayerMode='user';
  function selectedPlayerName(){
    const profile=mgPortalProfile();
    if(selectedPlayerMode==='user') return profile.displayName;
    return (playerModeGuestName?.value||'').trim().slice(0,12)||'GUEST';
  }
  function refreshPlayerMode(){
    const profile=mgPortalProfile();
    const isUser=selectedPlayerMode==='user';
    if(playerModeName){
      playerModeName.hidden=!isUser;
      playerModeName.textContent=profile.displayName;
    }
    if(playerModeGuestName) playerModeGuestName.hidden=isUser;
    playerModeButtons.forEach(btn=>{
      const active=btn.dataset.playerMode===selectedPlayerMode;
      btn.classList.toggle('active',active);
      btn.setAttribute('aria-pressed',active?'true':'false');
    });
  }
  playerModeButtons.forEach(btn=>btn.addEventListener('click',()=>{
    selectedPlayerMode=btn.dataset.playerMode==='guest'?'guest':'user';
    refreshPlayerMode();
  }));
  window.addEventListener('pageshow',refreshPlayerMode);
  refreshPlayerMode();

  /* ---------- AUDIO ---------- */
  let audioCtx=null, master=null, bgmTimer=0, beat=0, bgmGame='';
  const THEMES={
    bug:{base:392,wave:'square',tempo:150,notes:[0,7,12,7,4,12,9,7]},
    meter:{base:247,wave:'triangle',tempo:176,notes:[0,4,7,11,7,4,2,7]},
    swipe:{base:330,wave:'square',tempo:164,notes:[0,12,7,14,5,12,9,16]},
    drag:{base:220,wave:'triangle',tempo:138,notes:[0,5,9,12,9,5,7,2]},
    hold:{base:294,wave:'sine',tempo:128,notes:[0,3,7,10,7,3,5,8]},
    catch:{base:349,wave:'triangle',tempo:156,notes:[0,4,9,12,16,12,9,4]},
    balloons:{base:440,wave:'square',tempo:172,notes:[0,4,7,12,7,16,12,7]},
    mash:{base:196,wave:'sawtooth',tempo:190,notes:[0,7,5,10,7,12,10,5]},
    color:{base:262,wave:'triangle',tempo:154,notes:[0,5,9,7,12,9,4,7]},
    number:{base:311,wave:'square',tempo:146,notes:[0,3,7,10,14,10,7,3]},
    dodge:{base:165,wave:'sawtooth',tempo:184,notes:[0,7,3,10,5,12,7,14]},
    order:{base:277,wave:'square',tempo:160,notes:[0,2,5,9,12,9,5,2]},
    odd:{base:370,wave:'triangle',tempo:150,notes:[0,6,11,6,3,9,13,8]},
    lane:{base:208,wave:'sine',tempo:168,notes:[0,7,12,14,12,7,5,9]},
    wipe:{base:233,wave:'triangle',tempo:142,notes:[0,5,12,10,7,3,10,12]},
    side:{base:352,wave:'square',tempo:158,notes:[0,7,4,12,9,5,14,7]},
    size:{base:286,wave:'triangle',tempo:148,notes:[0,4,9,12,7,11,4,9]},
    light:{base:330,wave:'sine',tempo:132,notes:[0,0,5,7,0,9,7,12]},
    flick:{base:415,wave:'square',tempo:180,notes:[0,12,5,14,7,16,9,12]},
    same:{base:260,wave:'triangle',tempo:144,notes:[0,3,7,3,10,7,12,5]},
    count:{base:300,wave:'square',tempo:154,notes:[0,4,7,9,12,9,7,4]},
    pair:{base:245,wave:'sine',tempo:138,notes:[0,7,5,12,9,14,7,5]},
    symbols:{base:360,wave:'square',tempo:166,notes:[0,2,7,5,12,9,14,7]},
    slider:{base:215,wave:'triangle',tempo:146,notes:[0,5,10,12,7,3,9,12]},
    colorcatch:{base:325,wave:'triangle',tempo:170,notes:[0,4,11,7,14,9,12,4]},
    math:{base:275,wave:'square',tempo:152,notes:[0,5,7,12,10,5,14,7]},
    memory:{base:205,wave:'sine',tempo:126,notes:[0,7,12,7,3,10,15,12]},
    stroop:{base:390,wave:'triangle',tempo:174,notes:[0,6,11,3,9,14,5,12]},
    trace:{base:232,wave:'sine',tempo:160,notes:[0,4,9,14,12,7,16,9]},
    chase:{base:180,wave:'sawtooth',tempo:188,notes:[0,7,12,3,10,15,5,14]},
    train:{base:294,wave:'square',tempo:178,notes:[0,7,12,4,9,14,7,12]},
    alarm:{base:440,wave:'square',tempo:196,notes:[0,0,12,0,7,0,12,5]},
    toast:{base:330,wave:'triangle',tempo:162,notes:[0,4,7,12,9,7,4,12]},
    umbrella:{base:247,wave:'sine',tempo:140,notes:[0,5,9,12,7,5,2,9]},
    dog:{base:370,wave:'triangle',tempo:186,notes:[0,7,4,12,9,14,7,16]},
    ramen:{base:220,wave:'sawtooth',tempo:172,notes:[0,3,7,10,7,12,5,9]},
    elevator:{base:262,wave:'square',tempo:154,notes:[0,12,7,5,9,4,12,7]},
    toilet:{base:196,wave:'triangle',tempo:146,notes:[0,5,12,7,10,3,9,12]},
    boss_stars:{base:110,wave:'sawtooth',tempo:198,notes:[0,12,7,15,3,10,5,17]},
    boss_targets:{base:147,wave:'square',tempo:204,notes:[0,7,12,16,5,14,10,19]},
    boss_lasers:{base:98,wave:'sawtooth',tempo:188,notes:[0,3,10,15,7,12,17,5]},
    boss_memory:{base:196,wave:'triangle',tempo:150,notes:[0,4,7,11,14,9,12,16]},
    boss_meteors:{base:123,wave:'square',tempo:196,notes:[0,12,5,17,7,15,3,19]}
  };
  function midiRatio(semi){ return Math.pow(2,semi/12); }
  async function unlockAudio(){
    if(!state.sound) return false;
    try{
      if(!audioCtx){
        audioCtx=new (window.AudioContext||window.webkitAudioContext)();
        master=audioCtx.createGain(); master.gain.value=.72; master.connect(audioCtx.destination);
      }
      if(audioCtx.state==='suspended') await audioCtx.resume();
      const o=audioCtx.createOscillator(),g=audioCtx.createGain(),t=audioCtx.currentTime;
      g.gain.setValueAtTime(.0001,t); g.gain.linearRampToValueAtTime(.00001,t+.02);
      o.connect(g); g.connect(master); o.start(t); o.stop(t+.025);
      state.audioUnlocked=audioCtx.state==='running';
      return state.audioUnlocked;
    }catch(_){ state.audioUnlocked=false; return false; }
  }
  function tone(freq=440,dur=.08,type='square',gain=.08,slide=0,delay=0){
    if(!state.sound||!audioCtx||audioCtx.state!=='running'||!master) return;
    const t=audioCtx.currentTime+delay;
    const o=audioCtx.createOscillator(),g=audioCtx.createGain();
    o.type=type; o.frequency.setValueAtTime(Math.max(40,freq),t);
    if(slide) o.frequency.exponentialRampToValueAtTime(Math.max(40,freq+slide),t+dur);
    g.gain.setValueAtTime(.0001,t); g.gain.exponentialRampToValueAtTime(gain,t+.008); g.gain.exponentialRampToValueAtTime(.0001,t+dur);
    o.connect(g); g.connect(master); o.start(t); o.stop(t+dur+.03);
  }
  function noise(dur=.05,gain=.03){
    if(!state.sound||!audioCtx||audioCtx.state!=='running'||!master) return;
    const length=Math.max(1,Math.floor(audioCtx.sampleRate*dur));
    const buffer=audioCtx.createBuffer(1,length,audioCtx.sampleRate),data=buffer.getChannelData(0);
    for(let i=0;i<length;i++) data[i]=(Math.random()*2-1)*(1-i/length);
    const src=audioCtx.createBufferSource(),g=audioCtx.createGain(); g.gain.value=gain; src.buffer=buffer; src.connect(g); g.connect(master); src.start();
  }
  function gameSfx(kind){
    const th=themeFor(state.currentGame), b=th.base;
    if(kind==='action'){ const h=hashString(state.currentGame||'game'); const mul=[1.5,1.75,2,2.25][h%4]; tone(b*mul,.045,th.wave,.09,b*.18); if((h>>>4)%3===0||state.currentGame==='mash'||state.currentGame==='balloons') noise(.025,.02); }
    else if(kind==='ok'){ tone(b*2,.07,th.wave,.11,b*.4); tone(b*3,.11,th.wave,.09,b*.5,.06); }
    else if(kind==='miss'){ tone(Math.max(70,b*.55),.18,'sawtooth',.1,-Math.max(25,b*.18)); noise(.11,.045); }
    else if(kind==='boss'){ tone(90,.23,'sawtooth',.12,90); tone(150,.24,'square',.08,120,.12); }
    else if(kind==='speed'){ [0,4,7,12].forEach((n,i)=>tone(330*midiRatio(n),.08,'square',.085,60,i*.055)); }
    else if(kind==='level'){ [0,7,12,16].forEach((n,i)=>tone(262*midiRatio(n),.11,'triangle',.09,40,i*.07)); }
  }
  function startBgm(gameId=state.currentGame){
    stopBgm(); if(!state.sound||!state.running||state.paused||!audioCtx||audioCtx.state!=='running') return;
    bgmGame=gameId; beat=0; const th=themeFor(gameId);
    const loop=()=>{
      if(!state.running||state.paused||!state.sound||bgmGame!==gameId) return;
      const semi=th.notes[beat%th.notes.length], f=th.base*midiRatio(semi);
      tone(f,.075,th.wave,.045,th.wave==='sawtooth'?-10:18);
      if(beat%2===0) tone(Math.max(55,th.base*.5),.08,'sine',.04,-8);
      if(beat%4===2) noise(.03,.012);
      beat++;
      const ms=Math.max(92,60000/(th.tempo+(state.speed-1)*8)/2);
      bgmTimer=setTimeout(loop,ms);
    };
    loop();
  }
  function stopBgm(){ clearTimeout(bgmTimer); bgmTimer=0; bgmGame=''; }
  function updateSoundButtons(){ const b=$('#soundBtnStart'); b.textContent=state.sound?'🔊 SOUND ON':'🔇 SOUND OFF'; pixelizeElement(b); }
  async function toggleSound(){
    state.sound=!state.sound; updateSoundButtons();
    if(state.sound){ await unlockAudio(); if(state.running&&!state.paused) startBgm(); }
    else stopBgm();
  }

  /* ---------- FLOW ---------- */
  function updateHud(){
    scoreValue.textContent=state.score.toLocaleString('ja-JP');
    roundValue.textContent=state.round; levelValue.textContent=`LEVEL ${state.level}`; speedValue.textContent=`SPEED ${state.speed}`;
    applyWorldZone();
    livesEl.replaceChildren();
    for(let i=0;i<4;i++){ const h=document.createElement('span'); h.className='heart'+(i>=state.lives?' lost':''); h.textContent='♥'; livesEl.appendChild(h); }
    pixelizeElement(livesEl);
  }
  function setPaused(v){
    if(!state.running||state.resolving) return;
    state.paused=v; pauseOverlay.classList.toggle('show',v); pauseOverlay.setAttribute('aria-hidden',v?'false':'true'); gameArea.classList.toggle('paused',v);
    if(v) stopBgm(); else if(state.sound) startBgm(state.currentGame);
  }
  async function beginRun(){
    await unlockAudio();
    state.runToken++; clearStage();
    Object.assign(state,{
      score:0,round:0,lives:4,speed:1,level:1,clears:0,
      running:true,resolving:false,paused:false,playerType:selectedPlayerMode==='guest'?'guest':'user',playerName:selectedPlayerName(),lastGame:'',currentGame:'',roundInteracted:false,
      normalRoundsSinceBoss:0,roundType:'normal',previousRoundType:'',bossCount:0,
      launchedRoundToken:-1,isBossRound:false,lastBossGame:'',bossBag:[],recentGames:[]
    });
    pauseOverlay.classList.remove('show'); gameArea.classList.remove('paused'); showScreen(gameScreen); updateHud();
    tone(392,.08,'square',.1,120); tone(588,.12,'triangle',.09,150,.08);
    await activeDelay(180,state.runToken); nextRound();
  }
  async function nextRound(){
    if(!state.running) return;
    clearStage();
    state.resolving=false;
    state.round++;
    state.roundToken++;

    // ボス出現条件はラウンド番号から完全に分離する。
    // 通常ゲームを9回完了した場合だけ、次の1ラウンドをボスにする。
    // ボス終了時に normalRoundsSinceBoss は必ず0へ戻るため、連続ボスは構造上発生しない。
    const shouldBoss = state.normalRoundsSinceBoss >= 9 && state.previousRoundType !== 'boss';
    state.roundType = shouldBoss ? 'boss' : 'normal';
    state.isBossRound = shouldBoss;

    const prevLevel=state.level, prevSpeed=state.speed;
    state.level=currentLevel(); state.speed=currentSpeed(); updateHud();
    if(state.level>prevLevel){ await showLevelOverlay(); }
    if(!state.running) return;
    if(state.speed>prevSpeed){ gameSfx('speed'); await showSpeedOverlay(); }
    if(state.running) launchCurrent();
  }
  async function showSpeedOverlay(){
    const ov=document.createElement('div'); ov.className='speedOverlay'; ov.innerHTML=`<b>SPEED UP!</b><span>SPEED ${state.speed}</span>`; gameArea.appendChild(ov);
    await activeDelay(760); ov.remove();
  }
  async function showLevelOverlay(){
    gameSfx('level'); const ov=document.createElement('div'); ov.className='levelOverlay';
    const labels=['','HOME MAYHEM / 朝の大騒動','STREET PANIC / 街が大混乱','WORK RUSH / 仕事も店も大忙し','NIGHT GLITCH / 夜の街がバグった'];
    ov.innerHTML=`<b>LEVEL ${state.level}</b><span>${labels[state.level]}</span>`; gameArea.appendChild(ov);
    await activeDelay(880); ov.remove();
  }

  /* ---------- PIXEL CITY THEME VARIANTS (not counted as separate games) ---------- */
  const GAME_BUILD = '4.3.2-guest-name';
  const SCENARIO_DEFS = [
    // LEVEL 1 / HOME MAYHEM (16)
    {id:'coffee',min:1,type:'tap',verb:'コーヒー！',hint:'眠気を吹き飛ばせ',scene:'KITCHEN',target:'☕',decoys:['🥛','🧃','🍵'],count:1},
    {id:'shoes',min:1,type:'choice',verb:'左右そろえろ！',hint:'同じ靴のペアを選べ',question:'同じ靴が2つ並んでいるペアはどれ？',scene:'ENTRANCE',options:['👟👟','👟🥿','🥾👠','🩴🥾'],answer:'👟👟'},
    {id:'brush',min:1,type:'mash',verb:'歯をみがけ！',hint:'高速ブラッシング',scene:'BATHROOM',need:[6,10]},
    {id:'fridge',min:1,type:'choice',verb:'冷蔵庫を閉めろ！',hint:'CLOSEを押せ',question:'冷蔵庫を「閉める」操作はどれ？',scene:'KITCHEN',options:['OPEN','CLOSE','FREEZE','LIGHT'],answer:'CLOSE'},
    {id:'egg',min:1,type:'meter',verb:'目玉焼きを返せ！',hint:'焼き色ゾーンでタップ',scene:'KITCHEN'},
    {id:'socks',min:1,type:'tap',verb:'靴下を探せ！',hint:'同じ柄を2つタップ',scene:'BEDROOM',target:'🧦',decoys:['🧤','👒','🩲'],count:2},
    {id:'phone_charge',min:1,type:'drag',verb:'充電しろ！',hint:'ケーブルをスマホへ',scene:'BEDROOM',item:'🔌',goal:'📱'},
    {id:'key_lock',min:1,type:'drag',verb:'鍵をかけろ！',hint:'鍵をドアへ',scene:'ENTRANCE',item:'🔑',goal:'🚪'},
    {id:'curtains',min:1,type:'swipe',verb:'カーテン！',hint:'左右へ開けろ',scene:'BEDROOM',dirs:['left','right']},
    {id:'faucet',min:1,type:'choice',verb:'水を止めろ！',hint:'OFFを押せ',question:'水を止める操作はどれ？',scene:'BATHROOM',options:['HOT','COLD','OFF','MAX'],answer:'OFF'},
    {id:'soap',min:1,type:'hold',verb:'泡立てろ！',hint:'しっかり長押し',scene:'BATHROOM',hold:[.55,.8]},
    {id:'lights',min:1,type:'tap',verb:'電気を消せ！',hint:'光っているスイッチ',scene:'HOME',target:'💡',decoys:['⚪','⬜','🔘'],count:1,moving:false},
    {id:'bag',min:1,type:'drag',verb:'カバンに入れろ！',hint:'忘れ物を収納',scene:'ENTRANCE',item:'📕',goal:'🎒'},
    {id:'doorbell',min:1,type:'tap',verb:'出ろ！',hint:'鳴っているチャイムをタップ',scene:'ENTRANCE',target:'🔔',decoys:['🔕','⚪','📫'],count:1},
    {id:'milk',min:1,type:'meter',verb:'牛乳を止めろ！',hint:'こぼれる前にSTOP',scene:'KITCHEN'},
    {id:'microwave',min:1,type:'choice',verb:'レンジを止めろ！',hint:'00:00を選べ',question:'タイマーが終了した表示はどれ？',scene:'KITCHEN',options:['00:00','09:99','88:88','12:34'],answer:'00:00'},

    // LEVEL 2 / STREET PANIC (18)
    {id:'crosswalk',min:2,type:'choice',verb:'渡れ！',hint:'青信号を選べ',question:'横断歩道を渡ってよい表示はどれ？',scene:'STREET',options:['🔴 STOP','🟢 GO','🟡 WAIT','🚧'],answer:'🟢 GO'},
    {id:'taxi',min:2,type:'tap',verb:'タクシー！',hint:'空車を止めろ',scene:'STREET',target:'🚕',decoys:['🚗','🚙','🚌'],count:1,moving:true},
    {id:'vending',min:2,type:'choice',verb:'水を買え！',hint:'水だけを選べ',question:'飲み物の中から「水」を選べ',scene:'VENDING',options:['💧 WATER','🥤 COLA','☕ COFFEE','🧃 JUICE'],answer:'💧 WATER'},
    {id:'bicycle',min:2,type:'mash',verb:'こげ！',hint:'坂を登れ',scene:'STREET',need:[8,13]},
    {id:'mailbox',min:2,type:'drag',verb:'投函しろ！',hint:'手紙をポストへ',scene:'STREET',item:'✉️',goal:'📮'},
    {id:'pigeon',min:2,type:'tap',verb:'ハトを追え！',hint:'3羽タップ',scene:'PARK',target:'🐦',decoys:['🍂','🌿','⚪'],count:3,moving:true},
    {id:'bus',min:2,type:'meter',verb:'バスに乗れ！',hint:'停留所でタップ',scene:'STREET'},
    {id:'parking',min:2,type:'drag',verb:'駐車しろ！',hint:'車をPへ',scene:'PARKING',item:'🚗',goal:'🅿️'},
    {id:'coin',min:2,type:'tap',verb:'小銭を拾え！',hint:'コインだけ3枚',scene:'STREET',target:'🪙',decoys:['🟤','⚙️','🔘'],count:3},
    {id:'escalator',min:2,type:'swipe',verb:'上れ！',hint:'上へスワイプ',scene:'STATION',dirs:['up']},
    {id:'sign',min:2,type:'choice',verb:'出口は？',hint:'EXITを探せ',question:'「出口」を表す表示はどれ？',scene:'STATION',options:['EXIT','ENTRY','WC','SHOP'],answer:'EXIT'},
    {id:'burger',min:2,type:'order',verb:'順に重ねろ！',hint:'1→4でバーガー完成',scene:'FOOD'},
    {id:'icecream',min:2,type:'hold',verb:'ソフトを巻け！',hint:'長押ししすぎ注意',scene:'FOOD',hold:[.5,.72]},
    {id:'shopping_cart',min:2,type:'drag',verb:'カートへ！',hint:'買い物を入れろ',scene:'SHOP',item:'🍎',goal:'🛒'},
    {id:'receipt',min:2,type:'choice',verb:'おつり！',hint:'500円 − 400円',question:'400円の商品に500円を払った。おつりはいくら？',scene:'SHOP',options:['¥10','¥50','¥100','¥500'],answer:'¥100'},
    {id:'camera',min:2,type:'light',verb:'撮れ！',hint:'光った瞬間にシャッター',scene:'STREET'},
    {id:'traffic_cone',min:2,type:'tap',verb:'コーンを避けろ！',hint:'青い矢印だけタップ',scene:'STREET',target:'➡️',decoys:['🚧','🔶','⚠️'],count:1,moving:true},
    {id:'ticket_gate',min:2,type:'drag',verb:'改札を通れ！',hint:'カードをリーダーへ',scene:'STATION',item:'💳',goal:'🚉'},

    // LEVEL 3 / WORK RUSH (16)
    {id:'keyboard',min:3,type:'choice',verb:'保存！',hint:'保存ショートカットを選べ',question:'Windowsで「保存」のショートカットはどれ？',scene:'OFFICE',options:['CTRL+S','CTRL+Z','ALT+F4','CTRL+P'],answer:'CTRL+S'},
    {id:'printer',min:3,type:'tap',verb:'紙づまり！',hint:'詰まった紙だけ抜け',scene:'OFFICE',target:'📄',decoys:['🖨️','⬜','📁'],count:2},
    {id:'copy',min:3,type:'choice',verb:'コピー！',hint:'同じサイズを選べ',question:'A4原稿を同じ大きさでコピーする。用紙サイズは？',scene:'OFFICE',options:['A3','A4','B4','POSTER'],answer:'A4'},
    {id:'stamp',min:3,type:'tap',verb:'承認！',hint:'APPROVEを押せ',scene:'OFFICE',target:'✅',decoys:['❌','❓','⚠️'],count:1,moving:true},
    {id:'meeting',min:3,type:'choice',verb:'ミュート！',hint:'マイクを消音',question:'自分のマイク音声を止める操作はどれ？',scene:'MEETING',options:['🎙️ ON','🔇 MUTE','📹 CAM','☎️ END'],answer:'🔇 MUTE'},
    {id:'email',min:3,type:'drag',verb:'送信！',hint:'メールをSENDへ',scene:'OFFICE',item:'✉️',goal:'📤'},
    {id:'trash',min:3,type:'drag',verb:'捨てろ！',hint:'ゴミをゴミ箱へ',scene:'OFFICE',item:'🧻',goal:'🗑️'},
    {id:'package',min:3,type:'mash',verb:'梱包しろ！',hint:'テープを巻け',scene:'WAREHOUSE',need:[10,15]},
    {id:'calculator',min:3,type:'math',verb:'精算！',hint:'暗算して答えろ',scene:'SHOP'},
    {id:'battery',min:3,type:'drag',verb:'電池交換！',hint:'電池を機械へ',scene:'LAB',item:'🔋',goal:'🤖'},
    {id:'cable',min:3,type:'choice',verb:'LANはどれ？',hint:'有線ネット接続を選べ',question:'有線ネットワーク接続に使うものはどれ？',scene:'OFFICE',options:['🔌 POWER','🌐 LAN','🎧 AUDIO','📺 HDMI'],answer:'🌐 LAN'},
    {id:'plant',min:3,type:'meter',verb:'水やり！',hint:'ちょうどいい量で止めろ',scene:'OFFICE'},
    {id:'shelf',min:3,type:'drag',verb:'棚へ戻せ！',hint:'箱を空き棚へ',scene:'WAREHOUSE',item:'📦',goal:'🗄️'},
    {id:'clockout',min:3,type:'light',verb:'定時だ！',hint:'17:30で押せ',scene:'OFFICE'},
    {id:'receipt_match',min:3,type:'same',verb:'一致？',hint:'レシート番号を見比べろ',scene:'SHOP'},
    {id:'coffee_spill',min:3,type:'swipe',verb:'拭け！',hint:'左右に素早くスワイプ',scene:'OFFICE',dirs:['left','right']},

    // LEVEL 4 / NIGHT GLITCH (12)
    {id:'neon',min:4,type:'tap',verb:'ネオン修理！',hint:'消えた文字を点灯',scene:'NIGHT',target:'💡',decoys:['🌑','⬛','🔲'],count:3,moving:true},
    {id:'arcade',min:4,type:'mash',verb:'必殺技！',hint:'ボタン連打',scene:'ARCADE',need:[13,18]},
    {id:'drone',min:4,type:'tap',verb:'ドローン捕捉！',hint:'動くドローンを2回撃て',scene:'ROOFTOP',target:'🛸',decoys:['☁️','⭐','🌙'],count:2,moving:true},
    {id:'alien',min:4,type:'choice',verb:'地球人は？',hint:'人間だけ選べ',question:'4つの中で人間はどれ？',scene:'NIGHT',options:['👽','🤖','🧑','👻'],answer:'🧑'},
    {id:'portal',min:4,type:'drag',verb:'ポータルへ！',hint:'ピコを出口へ送れ',scene:'GLITCH',item:'🧑',goal:'🌀'},
    {id:'robot',min:4,type:'order',verb:'再起動！',hint:'1→5の順で押せ',scene:'LAB'},
    {id:'glitch',min:4,type:'stroop',verb:'色を読め！',hint:'バグ文字に惑わされるな',scene:'GLITCH'},
    {id:'satellite',min:4,type:'meter',verb:'電波を合わせろ！',hint:'中央でロック',scene:'ROOFTOP'},
    {id:'disco',min:4,type:'memory',verb:'ダンス！',hint:'光った順番を覚えろ',scene:'NIGHT'},
    {id:'ghost',min:4,type:'tap',verb:'幽霊を捕まえろ！',hint:'3体タップ',scene:'NIGHT',target:'👻',decoys:['🌫️','🌙','☁️'],count:3,moving:true},
    {id:'bomb_wire',min:4,type:'choice',verb:'コードを切れ！',hint:'解除コード：GREEN',question:'解除指示は「GREEN」。切るコードはどれ？',scene:'GLITCH',options:['RED','BLUE','GREEN','YELLOW'],answer:'GREEN'},
    {id:'final_switch',min:4,type:'hold',verb:'街を再起動！',hint:'スイッチを長押し',scene:'GLITCH',hold:[.72,.92]}
  ];

  function makeScenario(def){
    const scene=def.scene||currentZone().label;
    // 世界観の名前より、実際に行う操作を優先して指示する。
    // 同じ汎用UIを使うゲームで「料理する」「水をやる」等の表現を出すと
    // 操作内容と見た目が食い違うため、ここで機械的に整合させる。
    if(def.type==='tap'){
      const need=def.count||1;
      return {id:def.id,verb:`${def.target}を${need>1?need+'個':''}タップ！`,hint:'ほかのマークは押さない',timeBudget:4200+(need-1)*850+(def.moving?1300:0),setup:()=>setupPixelTapScenario({...def,scene})};
    }
    if(def.type==='choice'){
      return {id:def.id,verb:'1つ選べ！',hint:def.question||def.hint||'問題に合う答えを選べ',timeBudget:6500,setup:()=>setupPixelChoiceScenario({...def,scene})};
    }
    if(def.type==='drag'){
      return {id:def.id,verb:'ドラッグ！',hint:`${def.item} を ${def.goal} へ運べ`,timeBudget:6200,setup:()=>setupPixelDragScenario({...def,scene})};
    }
    if(def.type==='mash'){
      const need=randInt(def.need[0],def.need[1]);
      return {id:def.id,verb:'連打！',hint:`PUSHを${need}回タップ`,timeBudget:4300+need*190,setup:()=>{addWorldBanner(scene);return setupMash(need)}};
    }
    if(def.type==='hold'){
      const need=rand(def.hold[0],def.hold[1]);
      return {id:def.id,verb:'長押し！',hint:`HOLDを約${need.toFixed(1)}秒押し、RELEASEで離す`,timeBudget:4800+need*1300,setup:()=>{addWorldBanner(scene);return setupHold(need)}};
    }
    if(def.type==='meter'){
      return {id:def.id,verb:'緑で止めろ！',hint:'動くバーが緑ゾーンに入ったら画面をタップ',timeBudget:5600,setup:()=>{addWorldBanner(scene);const width=randInt(14,22),left=randInt(10,78-width);return setupMeter({left,width})}};
    }
    if(def.type==='light'){
      return {id:def.id,verb:'青で押せ！',hint:'WAIT中は押さず、青に変わった瞬間タップ',timeBudget:5500,setup:()=>{addWorldBanner(scene);return setupLight(rand(0.38,.78))}};
    }
    if(def.type==='order'){
      const len=state.level>=4?5:4;
      return {id:def.id,verb:'順番！',hint:`1 → ${len} の順にタップ`,timeBudget:4600+len*650,setup:()=>{addWorldBanner(scene);return setupOrder(len)}};
    }
    if(def.type==='math'){
      let a=randInt(3,12),b=randInt(2,9),op=Math.random()<.55?'+':'−';if(op==='−'&&b>a)[a,b]=[b,a];const ans=op==='+'?a+b:a-b;
      return {id:def.id,verb:'計算！',hint:`${a} ${op} ${b} = ?`,timeBudget:7000,setup:()=>{addWorldBanner(scene);return setupMath(a,op,b,ans)}};
    }
    if(def.type==='same'){
      const a=String(randInt(100,999)),same=Math.random()<.5,b=same?a:String(randInt(100,999));
      return {id:def.id,verb:'同じ？',hint:'2つの数字を比べて SAME / DIFFERENT',timeBudget:5800,setup:()=>{addWorldBanner(scene);return setupSame(a,b,same)}};
    }
    if(def.type==='swipe'){
      const names={left:'←',right:'→',up:'↑',down:'↓'}, dirs=def.dirs||['left','right','up','down'],d=pick(dirs);
      return {id:def.id,verb:`${names[d]}へスワイプ！`,hint:'矢印と同じ方向へ画面をスワイプ',timeBudget:4700,setup:()=>{addWorldBanner(scene);return setupSwipe({n:d,i:names[d]})}};
    }
    if(def.type==='stroop'){
      return {id:def.id,verb:'文字の色！',hint:'文字の意味ではなく、実際の文字色を選べ',timeBudget:6400,setup:()=>{addWorldBanner(scene);const colors=[['赤','#ff5d6c'],['青','#39e7ff'],['緑','#55ef9c'],['黄','#ffd84a']],word=pick(colors),ink=pick(colors.filter(x=>x[0]!==word[0]));return setupStroop(word,ink,colors)}};
    }
    if(def.type==='memory'){
      const len=4,seq=Array.from({length:len},()=>randInt(0,3));
      return {id:def.id,verb:'覚えろ！',hint:`${len}回光る順番を覚えて、同じ順にタップ`,timeBudget:7600+len*700,setup:()=>{addWorldBanner(scene);return setupMemory(seq)}};
    }
    return {id:def.id,verb:`${def.target||'★'}をタップ！`,hint:'指定されたマークだけをタップ',timeBudget:5000,setup:()=>setupPixelTapScenario({...def,target:def.target||'★',decoys:def.decoys||['●','▲','◆'],count:def.count||1,scene})};
  }

  function setupPixelTapScenario(cfg){
    addWorldBanner(cfg.scene);
    const wrap=document.createElement('div');wrap.className='pixelScenario';
    const title=document.createElement('div');title.className='pixelSceneTitle';title.textContent=cfg.scene+' / TARGET '+cfg.target;
    const grid=document.createElement('div');grid.className='pixelItemGrid';wrap.append(title,grid);stage.appendChild(wrap);
    const need=cfg.count||1;let got=0;
    const total=cfg.moving?5:Math.max(6,need+3);const items=[];
    const symbols=shuffle(Array.from({length:need},()=>cfg.target).concat(Array.from({length:Math.max(0,total-need)},(_,i)=>(cfg.decoys||['●','▲','◆'])[i%(cfg.decoys||['●']).length])));
    symbols.forEach((symbol,i)=>{
      const b=document.createElement('button');b.type='button';b.className='pixelItem';b.textContent=symbol;
      if(cfg.moving) b.classList.add('moving');
      const isTarget=symbol===cfg.target;
      listen(b,'pointerdown',e=>{e.preventDefault();gameSfx('action');if(!isTarget){resolveRound(false);return;}if(b.dataset.hit)return;b.dataset.hit='1';b.style.visibility='hidden';got++;if(got>=need)resolveRound(true)});
      (cfg.moving?wrap:grid).appendChild(b);items.push(b);
    });
    if(cfg.moving){
      const r=wrap.getBoundingClientRect(), data=items.map((el,i)=>({el,x:rand(18,Math.max(20,r.width-94)),y:rand(96,Math.max(100,r.height-110)),vx:rand(-90,90)||60,vy:rand(-70,70)||50}));
      data.forEach(o=>setStylePos(o.el,o.x,o.y));
      gameLoop((_,dt)=>data.forEach(o=>{if(o.el.style.visibility==='hidden')return;o.x+=o.vx*dt;o.y+=o.vy*dt;if(o.x<8||o.x>r.width-82)o.vx*=-1;if(o.y<82||o.y>r.height-84)o.vy*=-1;o.x=clamp(o.x,8,r.width-82);o.y=clamp(o.y,82,r.height-84);setStylePos(o.el,o.x,o.y)}));
    }
  }

  function setupPixelChoiceScenario(cfg){
    addWorldBanner(cfg.scene);
    const wrap=document.createElement('div');wrap.className='pixelScenario';
    const title=document.createElement('div');title.className='pixelSceneTitle';title.textContent=cfg.scene+' / 4 CHOICES';
    const question=document.createElement('div');question.className='pixelChoiceQuestion';
    question.innerHTML=`<div>${cfg.question||cfg.hint||'正しいものを1つ選べ'}</div><div class="pixelChoiceRule">↓ 正しい答えを1つタップ ↓</div>`;
    const grid=document.createElement('div');grid.className='pixelChoiceGrid';
    shuffledChoiceOptions(cfg.options,cfg.answer,cfg.id||cfg.question||'choice').forEach(opt=>{const b=document.createElement('button');b.type='button';b.className='pixelChoice';b.textContent=opt;listen(b,'pointerdown',e=>{e.preventDefault();gameSfx('action');resolveRound(opt===cfg.answer)});grid.appendChild(b)});
    wrap.append(title,question,grid);stage.appendChild(wrap);
  }

  function randomSeparatedStagePoints(r,itemW=92,itemH=92,goalW=108,goalH=108){
    const maxIX=Math.max(8,r.width-itemW-8), maxIY=Math.max(58,r.height-itemH-8);
    const maxGX=Math.max(8,r.width-goalW-8), maxGY=Math.max(58,r.height-goalH-8);
    let a,b,tries=0;
    do{
      a={x:rand(8,maxIX),y:rand(58,maxIY)};
      b={x:rand(8,maxGX),y:rand(58,maxGY)};
      tries++;
    }while(tries<60 && Math.hypot(a.x-b.x,a.y-b.y)<Math.min(170,r.width*.46));
    return [a,b];
  }

  function setupPixelDragScenario(cfg){
    addWorldBanner(cfg.scene);
    const label=document.createElement('div');label.className='pixelDragLabel';label.textContent=cfg.scene+' / '+cfg.item+' → '+cfg.goal;
    const item=document.createElement('div');item.className='pixelDragItem';item.textContent=cfg.item;
    const goal=document.createElement('div');goal.className='pixelDragGoal';goal.textContent=cfg.goal;
    stage.append(label,item,goal);
    const r=stage.getBoundingClientRect();
    const [start,target]=randomSeparatedStagePoints(r,92,92,108,108);
    let x=start.x,y=start.y,drag=false,ox=0,oy=0;
    setStylePos(item,x,y);setStylePos(goal,target.x,target.y);
    listen(item,'pointerdown',e=>{e.preventDefault();drag=true;safeCapture(item,e);const rr=item.getBoundingClientRect();ox=e.clientX-rr.left;oy=e.clientY-rr.top});
    listen(item,'pointermove',e=>{if(!drag)return;const sr=stage.getBoundingClientRect();x=clamp(e.clientX-sr.left-ox,0,sr.width-92);y=clamp(e.clientY-sr.top-oy,42,sr.height-92);setStylePos(item,x,y)});
    const end=e=>{if(!drag)return;drag=false;safeReleaseCapture(item,e);gameSfx('action');resolveRound(rectsOverlap(item.getBoundingClientRect(),goal.getBoundingClientRect(),18))};
    listen(item,'pointerup',end);listen(item,'pointercancel',end);
  }


  // ---- v3.2 PLAYABILITY-FIRST TIME BUDGETS ----
  // SPEEDは主に物体速度/BGMで上げ、制限時間を極端に削らない。
  // 思考・複数回操作・ドラッグ・記憶は、構成に見合った最低時間を持つ。
  const BASE_TIME_BUDGET={
    bug:5400,meter:5600,swipe:4700,drag:6000,hold:5800,side:4600,size:5000,light:5500,flick:5200,same:5800,
    train:6200,alarm:5600,toast:6500,umbrella:5200,catch:6500,balloons:6200,mash:6200,color:5000,number:5000,
    count:6500,pair:7000,symbols:6800,slider:6200,colorcatch:6800,dog:7000,ramen:6200,elevator:5600,
    dodge:6800,order:6600,odd:5600,lane:5600,wipe:5800,math:7000,stroop:6500,chase:6200,toilet:7000,
    memory:9000,trace:8500
  };
  function durationForGame(game,isBoss){
    if(isBoss) return bossDuration();
    const explicit=Number(game?.timeBudget)||0;
    const base=explicit||BASE_TIME_BUDGET[game?.id]||5200;
    // 高速化しても最大8%しか短縮しない。反応速度より「成立すること」を優先。
    const speedFactor=1-Math.min(.08,(state.speed-1)*.012);
    return Math.round(base*speedFactor);
  }


  /* ---------- TRUE UNIQUE MICROGAMES (62) ----------
     v3.9: 38 existing mechanics + these 62 = 100 mechanics.
     Theme/skin changes are variants and are NOT counted as separate games. */
  function uEl(tag,cls,text){
    const e=document.createElement(tag);
    if(cls)e.className=cls;
    if(text!==undefined)e.textContent=text;
    return e;
  }
  function uBtn(text,cls='uBtn'){
    const b=uEl('button',cls,text); b.type='button'; return b;
  }
  function uScene(title,sub=''){
    addWorldBanner(currentZone().jp);
    const w=uEl('div','uScene');
    const h=uEl('div','uTitle',title); w.appendChild(h);
    if(sub)w.appendChild(uEl('div','uSub',sub));
    stage.appendChild(w); return w;
  }
  function uShuffleButtons(w,values,onPick){
    const g=uEl('div','uGrid');
    shuffle(values).forEach(v=>{const b=uBtn(String(v));listen(b,'pointerdown',e=>{e.preventDefault();gameSfx('action');onPick(v,b)});g.appendChild(b)});
    w.appendChild(g); return g;
  }
  function uPointInRect(x,y,r){return x>=r.left&&x<=r.right&&y>=r.top&&y<=r.bottom}
  function uDistance(a,b){return Math.hypot(a.x-b.x,a.y-b.y)}

  function setupExtraUnique(mode){
    if(mode==='doubletap'){
      const w=uScene('DOUBLE TAP','同じターゲットを素早く2回');
      const b=uBtn('◎','uBigTarget'); w.appendChild(b); let n=0,last=0;
      listen(b,'pointerdown',e=>{e.preventDefault();const now=performance.now();if(n===0){n=1;last=now;b.textContent='◎ ×2'}else{gameSfx('action');resolveRound(now-last<=650)}});
      return;
    }
    if(mode==='tap_or_hold'){
      const want=Math.random()<.5?'TAP':'HOLD'; const need=650;
      const w=uScene(want==='TAP'?'TAP!':'HOLD!','指示どおりの操作をしろ');
      const b=uBtn(want,'uBigTarget');w.appendChild(b);let down=0,holding=false,timer=0;
      listen(b,'pointerdown',e=>{e.preventDefault();down=performance.now();holding=true;if(want==='TAP'){timer=setTimeout(()=>{if(holding)resolveRound(false)},330);onCleanup(()=>clearTimeout(timer));}});
      listen(b,'pointerup',e=>{if(!holding)return;holding=false;const held=performance.now()-down;gameSfx('action');resolveRound(want==='TAP'?held<300:held>=need)});
      return;
    }
    if(mode==='target_sequence'){
      const flashes=randInt(2,4),w=uScene('点滅を数えろ','光った回数と同じだけTAP');const lamp=uEl('div','uBigTarget','●'),tap=uBtn('TAP');w.append(lamp,tap);let ready=false,count=0;
      (async()=>{for(let i=0;i<flashes;i++){lamp.classList.add('good');if(!await activeDelay(180))return;lamp.classList.remove('good');if(!await activeDelay(180))return}ready=true})();
      listen(tap,'pointerdown',e=>{e.preventDefault();if(!ready){resolveRound(false);return}count++;gameSfx('action');if(count===flashes)resolveRound(true);else if(count>flashes)resolveRound(false)});return;
    }
    if(mode==='reverse_sequence'){
      const seq=shuffle([1,2,3,4]).slice(0,3);const w=uScene('逆順！',seq.join(' → ')+' を逆から');let i=seq.length-1;
      uShuffleButtons(w,seq,(v,b)=>{if(v!==seq[i]){resolveRound(false);return}b.disabled=true;i--;if(i<0)resolveRound(true)});return;
    }
    if(mode==='select_all'){
      const target=pick(['★','●','▲']);const vals=shuffle([target,target,target,'◆','■','♥']);const w=uScene('全部選べ',`${target} だけ全部タップ`);let left=3;
      const g=uEl('div','uGrid');vals.forEach(v=>{const b=uBtn(v);listen(b,'pointerdown',e=>{e.preventDefault();if(v!==target){resolveRound(false);return}if(b.disabled)return;b.disabled=true;b.style.opacity=.25;gameSfx('action');if(--left===0)resolveRound(true)});g.appendChild(b)});w.appendChild(g);return;
    }
    if(mode==='wait_reveal'){
      const w=uScene('押したまま待て','GOになったら指を離せ');const b=uBtn('HOLD','uBigTarget');w.appendChild(b);let ready=false,holding=false;
      listen(b,'pointerdown',e=>{e.preventDefault();holding=true;safeCapture(b,e)});
      const t=setTimeout(()=>{if(!state.paused&&holding){ready=true;b.textContent='GO! RELEASE';b.classList.add('good')}},randInt(700,1250));onCleanup(()=>clearTimeout(t));
      listen(b,'pointerup',e=>{if(!holding)return;holding=false;safeReleaseCapture(b,e);gameSfx('action');resolveRound(ready)});return;
    }
    if(mode==='drag_maze'){
      const w=uScene('迷路を抜けろ','青い玉を緑ゴールまで。壁に触れるな');const board=uEl('div','uBoard uMaze');w.appendChild(board);
      const ball=uEl('div','uBall');const goal=uEl('div','uGoal');board.append(ball,goal);
      const layouts=[
        {start:[7,8],goal:[86,80],walls:[[38,0,10,58],[65,42,10,58]]},
        {start:[86,8],goal:[7,80],walls:[[62,0,10,58],[35,42,10,58]]},
        {start:[7,8],goal:[86,80],walls:[[0,38,58,10],[42,65,58,10]]},
        {start:[86,8],goal:[7,80],walls:[[42,38,58,10],[0,65,58,10]]}
      ];
      const layout=pick(layouts);
      const walls=layout.walls.map(([l,t,ww,hh])=>{const x=uEl('div','uWall');Object.assign(x.style,{left:l+'%',top:t+'%',width:ww+'%',height:hh+'%'});board.appendChild(x);return x});
      requestAnimationFrame(()=>{
        const r=board.getBoundingClientRect(),bs=ball.offsetWidth||24,gs=goal.offsetWidth||34;
        setStylePos(ball,r.width*layout.start[0]/100-bs/2,r.height*layout.start[1]/100-bs/2);
        setStylePos(goal,r.width*layout.goal[0]/100-gs/2,r.height*layout.goal[1]/100-gs/2);
      });
      let drag=false,ox=0,oy=0;
      listen(ball,'pointerdown',e=>{e.preventDefault();drag=true;safeCapture(ball,e);const rr=ball.getBoundingClientRect();ox=e.clientX-rr.left;oy=e.clientY-rr.top});
      listen(ball,'pointermove',e=>{
        if(!drag)return;
        const br=board.getBoundingClientRect(),bs=ball.offsetWidth||24;
        setStylePos(ball,clamp(e.clientX-br.left-ox,0,br.width-bs),clamp(e.clientY-br.top-oy,0,br.height-bs));
        const rr=ball.getBoundingClientRect();
        if(walls.some(x=>rectsOverlap(rr,x.getBoundingClientRect(),0)))resolveRound(false);
      });
      listen(ball,'pointerup',e=>{if(!drag)return;drag=false;safeReleaseCapture(ball,e);gameSfx('action');resolveRound(rectsOverlap(ball.getBoundingClientRect(),goal.getBoundingClientRect(),3))});return;
    }
    if(mode==='multi_match_drag'){
      const w=uScene('色を合わせろ','2個を同じ色の枠へ');const board=uEl('div','uBoard');w.appendChild(board);const colors=[['#39e7ff','A'],['#ff4fa3','B']];let done=0;
      colors.forEach((c,i)=>{const obj=uEl('div','uDragToken',c[1]),goal=uEl('div','uDropSlot',c[1]);obj.style.background=c[0];goal.style.borderColor=c[0];board.append(goal,obj);requestAnimationFrame(()=>{const r=board.getBoundingClientRect();setStylePos(obj,18,28+i*86);setStylePos(goal,r.width-76,28+(1-i)*86)});let drag=false,ox=0,oy=0;
        listen(obj,'pointerdown',e=>{e.preventDefault();drag=true;safeCapture(obj,e);const rr=obj.getBoundingClientRect();ox=e.clientX-rr.left;oy=e.clientY-rr.top});listen(obj,'pointermove',e=>{if(!drag)return;const r=board.getBoundingClientRect();setStylePos(obj,clamp(e.clientX-r.left-ox,0,r.width-52),clamp(e.clientY-r.top-oy,0,r.height-52))});listen(obj,'pointerup',e=>{if(!drag)return;drag=false;safeReleaseCapture(obj,e);if(rectsOverlap(obj.getBoundingClientRect(),goal.getBoundingClientRect(),8)){obj.style.visibility='hidden';done++;gameSfx('action');if(done===2)resolveRound(true)}})});return;
    }
    if(mode==='swap_tiles'){
      const target=['A','B','C'];const current=['B','A','C'];const w=uScene('入れ替えろ','A B C の順にする');const row=uEl('div','uRow');w.appendChild(row);let first=null;
      current.forEach((v,i)=>{const b=uBtn(v,'uTile');b.dataset.i=i;listen(b,'pointerdown',e=>{e.preventDefault();const idx=+b.dataset.i;if(first===null){first=idx;b.classList.add('sel');return}const tmp=current[first];current[first]=current[idx];current[idx]=tmp;[...row.children].forEach((x,j)=>{x.textContent=current[j];x.classList.remove('sel')});first=null;gameSfx('action');if(current.join('')===target.join(''))resolveRound(true)});row.appendChild(b)});return;
    }
    if(mode==='dial_rotate'){
      const target=randInt(1,7)*45;const w=uScene('ダイヤル','針を緑の方向へ回せ');const dial=uEl('div','uDial'),needle=uEl('div','uNeedle'),mark=uEl('div','uDialMark');dial.append(mark,needle);w.appendChild(dial);mark.style.transform=`rotate(${target}deg)`;let drag=false;
      const update=e=>{const r=dial.getBoundingClientRect(),cx=r.left+r.width/2,cy=r.top+r.height/2,a=(Math.atan2(e.clientY-cy,e.clientX-cx)*180/Math.PI+90+360)%360;needle.dataset.a=a;needle.style.transform=`rotate(${a}deg)`};listen(dial,'pointerdown',e=>{e.preventDefault();drag=true;safeCapture(dial,e);update(e)});listen(dial,'pointermove',e=>{if(drag)update(e)});listen(dial,'pointerup',e=>{if(!drag)return;drag=false;safeReleaseCapture(dial,e);const a=+needle.dataset.a||0,d=Math.abs(((a-target+540)%360)-180);gameSfx('action');resolveRound(d<18)});return;
    }
    if(mode==='slider_value'){
      const target=randInt(25,75);const w=uScene('数値を合わせろ',`TARGET ${target}`);const input=document.createElement('input');input.type='range';input.min=0;input.max=100;input.value=randInt(0,100);input.className='uRange';const out=uEl('div','uReadout',input.value);w.append(input,out);listen(input,'input',()=>out.textContent=input.value);listen(input,'pointerup',()=>{gameSfx('action');resolveRound(Math.abs(+input.value-target)<=4)});return;
    }
    if(mode==='balance'){
      const w=uScene('バランス！','左右ボタンで3秒間中央を守れ');const meter=uEl('div','uBalance'),dot=uEl('div','uBalanceDot');meter.appendChild(dot);const row=uEl('div','uRow');const l=uBtn('LEFT'),r=uBtn('RIGHT');row.append(l,r);w.append(meter,row);let pos=50,vel=rand(-15,15),survive=0;listen(l,'pointerdown',e=>{e.preventDefault();vel-=18});listen(r,'pointerdown',e=>{e.preventDefault();vel+=18});gameLoop((_,dt)=>{pos+=vel*dt;vel+=rand(-7,7)*dt;vel*=.985;dot.style.left=pos+'%';survive+=dt;if(pos<5||pos>95){resolveRound(false);return}if(survive>=3)resolveRound(true)});return;
    }
    if(mode==='charge_release'){
      const w=uScene('チャージ！','長押しして緑で離せ');const b=uBtn('HOLD','uBigTarget'),bar=uEl('div','uMeter'),fill=uEl('div','uMeterFill'),zone=uEl('div','uMeterZone');bar.append(zone,fill);w.append(b,bar);let down=false,p=0;zone.style.left='62%';zone.style.width='16%';listen(b,'pointerdown',e=>{e.preventDefault();down=true});listen(b,'pointerup',e=>{if(!down)return;down=false;gameSfx('action');resolveRound(p>=62&&p<=78)});gameLoop((_,dt)=>{if(down){p=Math.min(100,p+55*dt);fill.style.width=p+'%'}});return;
    }
    if(mode==='dual_meter'){
      const w=uScene('2本止めろ','上→下の順に緑でSTOP');let done=0;const states=[];
      for(let i=0;i<2;i++){const bar=uEl('div','uMeter'),zone=uEl('div','uMeterZone'),needle=uEl('div','uMeterNeedle');zone.style.left=(i?55:25)+'%';zone.style.width='18%';bar.append(zone,needle);w.appendChild(bar);states.push({needle,p:i?90:0,v:i?-70:75,l:i?55:25,h:(i?55:25)+18})}
      const b=uBtn('STOP');w.appendChild(b);listen(b,'pointerdown',e=>{e.preventDefault();const s=states[done];if(!s)return;gameSfx('action');if(s.p<s.l||s.p>s.h){resolveRound(false);return}s.needle.style.background='#55ef9c';done++;if(done===2)resolveRound(true)});gameLoop((_,dt)=>states.forEach((s,i)=>{if(i<done)return;s.p+=s.v*dt;if(s.p<0||s.p>100)s.v*=-1;s.p=clamp(s.p,0,100);s.needle.style.left=s.p+'%'}));return;
    }
    if(mode==='rhythm_copy'){
      const seq=[0,1,Math.random()<.5?0:1,1];const w=uScene('リズムをコピー','光った左右を同じ順で');const row=uEl('div','uRow');const bs=[uBtn('L','uRhythm'),uBtn('R','uRhythm')];row.append(...bs);w.appendChild(row);let input=[],ready=false;
      (async()=>{for(const n of seq){if(!await activeDelay(260))return;bs[n].classList.add('flash');if(!await activeDelay(180))return;bs[n].classList.remove('flash')}ready=true})();bs.forEach((b,n)=>listen(b,'pointerdown',e=>{e.preventDefault();if(!ready){resolveRound(false);return}input.push(n);gameSfx('action');const k=input.length-1;if(input[k]!==seq[k]){resolveRound(false);return}if(input.length===seq.length)resolveRound(true)}));return;
    }
    if(mode==='alternate_lr'){
      const need=8;const w=uScene('交互に連打','L → R → L → R…');const row=uEl('div','uRow');const bs=[uBtn('L','uBigSide'),uBtn('R','uBigSide')];row.append(...bs);w.appendChild(row);let n=0;bs.forEach((b,i)=>listen(b,'pointerdown',e=>{e.preventDefault();if(i!==n%2){resolveRound(false);return}n++;gameSfx('action');if(n>=need)resolveRound(true)}));return;
    }
    if(mode==='opposite_arrow'){
      const dir=pick(['←','→','↑','↓']),opp={'←':'RIGHT','→':'LEFT','↑':'DOWN','↓':'UP'}[dir];const w=uScene('逆を押せ！',`矢印 ${dir} の反対`);const vals=['LEFT','RIGHT','UP','DOWN'];uShuffleButtons(w,vals,v=>resolveRound(v===opp));return;
    }
    if(mode==='conjunction_match'){
      const wantColor=pick(['BLUE','PINK']),wantShape=pick(['●','▲']);const w=uScene('両方一致！',`${wantColor} + ${wantShape}`);const opts=[['BLUE','●'],['BLUE','▲'],['PINK','●'],['PINK','▲']];const g=uEl('div','uGrid');shuffle(opts).forEach(o=>{const b=uBtn(o[1],'uChoiceShape');b.style.color=o[0]==='BLUE'?'#39e7ff':'#ff4fa3';listen(b,'pointerdown',e=>{e.preventDefault();resolveRound(o[0]===wantColor&&o[1]===wantShape)});g.appendChild(b)});w.appendChild(g);return;
    }
    if(mode==='jump'){
      const w=uScene('ジャンプ！','障害物が足元に来たらタップ');const lane=uEl('div','uRunnerLane'),p=uEl('div','uRunner','P'),obs=uEl('div','uObstacle');lane.append(p,obs);w.appendChild(lane);let x=100,jump=0;listen(lane,'pointerdown',e=>{e.preventDefault();if(jump<=0)jump=.62});gameLoop((_,dt)=>{x-=42*dt;obs.style.left=x+'%';if(jump>0){jump-=dt;const y=Math.sin((.62-jump)/.62*Math.PI)*55;p.style.transform=`translateY(${-y}px)`}else p.style.transform='';if(x<22&&x>12&&jump<=.08){resolveRound(false);return}if(x<-8)resolveRound(true)});return;
    }
    if(mode==='duck'){
      const w=uScene('しゃがめ！','高い障害物が来たら長押し');const lane=uEl('div','uRunnerLane'),p=uEl('div','uRunner','P'),obs=uEl('div','uHighObstacle');lane.append(p,obs);w.appendChild(lane);let x=100,duck=false;listen(lane,'pointerdown',e=>{e.preventDefault();duck=true;p.classList.add('duck')});listen(lane,'pointerup',e=>{duck=false;p.classList.remove('duck')});gameLoop((_,dt)=>{x-=38*dt;obs.style.left=x+'%';if(x<23&&x>10&&!duck){resolveRound(false);return}if(x<-8)resolveRound(true)});return;
    }
    if(mode==='lane_collect'){
      const w=uScene('レーン移動','★のレーンへ左右タップ');const board=uEl('div','uLanes');const p=uEl('div','uLanePlayer','P'),star=uEl('div','uLaneStar','★');board.append(p,star);w.appendChild(board);let lane=1,y=-10,target=randInt(0,2);p.style.left=(16+lane*34)+'%';star.style.left=(16+target*34)+'%';const row=uEl('div','uRow');const l=uBtn('←'),r=uBtn('→');row.append(l,r);w.appendChild(row);listen(l,'pointerdown',e=>{e.preventDefault();lane=Math.max(0,lane-1);p.style.left=(16+lane*34)+'%'});listen(r,'pointerdown',e=>{e.preventDefault();lane=Math.min(2,lane+1);p.style.left=(16+lane*34)+'%'});gameLoop((_,dt)=>{y+=35*dt;star.style.top=y+'%';if(y>72)resolveRound(lane===target)});return;
    }
    if(mode==='shield'){
      const attack=pick(['LEFT','RIGHT','UP','DOWN']),w=uScene('盾を置け！',`${attack} 側へ盾をドラッグ`),board=uEl('div','uBoard'),player=uEl('div','uRunner','P'),shield=uEl('div','uDragToken','▰'),zone=uEl('div','uDropSlot',attack);board.append(zone,player,shield);w.appendChild(board);let drag=false,ox=0,oy=0;
      requestAnimationFrame(()=>{const r=board.getBoundingClientRect();setStylePos(player,r.width/2-19,r.height/2-29);setStylePos(shield,r.width/2-26,r.height-62);const pos={LEFT:[8,r.height/2-29],RIGHT:[r.width-62,r.height/2-29],UP:[r.width/2-29,8],DOWN:[r.width/2-29,r.height-62]}[attack];setStylePos(zone,pos[0],pos[1])});
      listen(shield,'pointerdown',e=>{e.preventDefault();drag=true;safeCapture(shield,e);const rr=shield.getBoundingClientRect();ox=e.clientX-rr.left;oy=e.clientY-rr.top});listen(shield,'pointermove',e=>{if(!drag)return;const r=board.getBoundingClientRect();setStylePos(shield,clamp(e.clientX-r.left-ox,0,r.width-52),clamp(e.clientY-r.top-oy,0,r.height-52))});listen(shield,'pointerup',e=>{if(!drag)return;drag=false;safeReleaseCapture(shield,e);resolveRound(rectsOverlap(shield.getBoundingClientRect(),zone.getBoundingClientRect(),5))});return;
    }
    if(mode==='aim_shoot'){
      const w=uScene('狙って撃て','照準をドラッグ→FIRE');const board=uEl('div','uBoard'),target=uEl('div','uAimTarget'),ret=uEl('div','uReticle');board.append(target,ret);w.appendChild(board);const fire=uBtn('FIRE');w.appendChild(fire);requestAnimationFrame(()=>{const r=board.getBoundingClientRect();setStylePos(target,rand(30,r.width-70),rand(30,r.height-70));setStylePos(ret,r.width/2-20,r.height/2-20)});let drag=false;listen(ret,'pointerdown',e=>{e.preventDefault();drag=true;safeCapture(ret,e)});listen(ret,'pointermove',e=>{if(!drag)return;const r=board.getBoundingClientRect();setStylePos(ret,clamp(e.clientX-r.left-20,0,r.width-40),clamp(e.clientY-r.top-20,0,r.height-40))});listen(ret,'pointerup',e=>{drag=false;safeReleaseCapture(ret,e)});listen(fire,'pointerdown',e=>{e.preventDefault();gameSfx('action');resolveRound(rectsOverlap(ret.getBoundingClientRect(),target.getBoundingClientRect(),8))});return;
    }
    if(mode==='sort_bins'){
      const w=uScene('仕分けろ','●は左、▲は右');const board=uEl('div','uBoard'),l=uEl('div','uBin','●'),r=uEl('div','uBin','▲'),obj=uEl('div','uSortObj',Math.random()<.5?'●':'▲');board.append(l,r,obj);w.appendChild(board);requestAnimationFrame(()=>{const br=board.getBoundingClientRect();setStylePos(l,18,br.height-70);setStylePos(r,br.width-74,br.height-70);setStylePos(obj,br.width/2-25,30)});let drag=false,ox=0,oy=0;listen(obj,'pointerdown',e=>{e.preventDefault();drag=true;safeCapture(obj,e);const rr=obj.getBoundingClientRect();ox=e.clientX-rr.left;oy=e.clientY-rr.top});listen(obj,'pointermove',e=>{if(!drag)return;const br=board.getBoundingClientRect();setStylePos(obj,clamp(e.clientX-br.left-ox,0,br.width-50),clamp(e.clientY-br.top-oy,0,br.height-50))});listen(obj,'pointerup',e=>{drag=false;safeReleaseCapture(obj,e);const goal=obj.textContent==='●'?l:r;resolveRound(rectsOverlap(obj.getBoundingClientRect(),goal.getBoundingClientRect(),4))});return;
    }
    if(mode==='stack_drop'){
      const w=uScene('積め！','動くブロックを3個重ねろ');const board=uEl('div','uStackBoard');w.appendChild(board);let level=0,x=0,dir=1,current=null,baseLeft=40;
      const spawn=()=>{current=uEl('div','uStackBlock');current.style.bottom=(level*34+8)+'px';board.appendChild(current);x=level?baseLeft:10;dir=1};spawn();listen(board,'pointerdown',e=>{e.preventDefault();if(level>0&&Math.abs(x-baseLeft)>22){resolveRound(false);return}baseLeft=x;level++;gameSfx('action');if(level===3){resolveRound(true);return}spawn()});gameLoop((_,dt)=>{if(!current)return;x+=dir*55*dt;if(x<3||x>77)dir*=-1;x=clamp(x,3,77);current.style.left=x+'%'});return;
    }
    if(mode==='slide_puzzle'){
      const w=uScene('1手で揃えろ','空きマスへ隣を動かす');const arr=['1','2','3',''];const solved=['1','2','3',''];[arr[2],arr[3]]=[arr[3],arr[2]];const g=uEl('div','uPuzzle2');w.appendChild(g);const render=()=>{g.replaceChildren();arr.forEach((v,i)=>{const b=uBtn(v||'·','uTile');if(!v)b.disabled=true;listen(b,'pointerdown',e=>{e.preventDefault();const empty=arr.indexOf('');if(Math.abs(i-empty)!==1){resolveRound(false);return}[arr[i],arr[empty]]=[arr[empty],arr[i]];render();if(arr.join('|')===solved.join('|'))resolveRound(true)});g.appendChild(b)})};render();return;
    }
    if(mode==='toggle_pattern'){
      const target=[1,0,1,1];const cur=[0,0,0,0];const w=uScene('スイッチ','表示どおり ON/OFF');w.appendChild(uEl('div','uPattern',target.map(x=>x?'ON':'OFF').join(' ')));const row=uEl('div','uRow');w.appendChild(row);cur.forEach((_,i)=>{const b=uBtn('OFF','uToggle');listen(b,'pointerdown',e=>{e.preventDefault();cur[i]^=1;b.textContent=cur[i]?'ON':'OFF';b.classList.toggle('on',!!cur[i]);if(cur.every((v,j)=>v===target[j]))resolveRound(true)});row.appendChild(b)});return;
    }
    if(mode==='lights_out'){
      const answer=randInt(0,8),w=uScene('全部消せ','1回押すだけで全部消えるマスを探せ'),cells=Array(9).fill(0);[answer,answer-3,answer+3,answer-1,answer+1].forEach(j=>{if(j<0||j>8)return;if((j===answer-1&&answer%3===0)||(j===answer+1&&answer%3===2))return;cells[j]=1});const g=uEl('div','uGrid3');w.appendChild(g);cells.forEach((v,i)=>{const b=uBtn('',`uLightCell ${v?'on':''}`);listen(b,'pointerdown',e=>{e.preventDefault();resolveRound(i===answer)});g.appendChild(b)});return;
    }
    if(mode==='missing_number'){
      const miss=randInt(2,8);const vals=[1,2,3,4,5,6,7,8,9].filter(x=>x!==miss);const w=uScene('抜けてる数は？',vals.join('  '));uShuffleButtons(w,shuffle([miss,10,0,randInt(11,15)]),v=>resolveRound(v===miss));return;
    }
    if(mode==='duplicate_number'){
      const dup=randInt(1,6),vals=shuffle([1,2,3,4,5,6,dup]);const w=uScene('重複を押せ',vals.join('  '));const g=uEl('div','uGrid');w.appendChild(g);vals.forEach(v=>{const b=uBtn(v);listen(b,'pointerdown',e=>{e.preventDefault();resolveRound(v===dup)});g.appendChild(b)});return;
    }
    if(mode==='more_dots'){
      const a=randInt(3,8),b=a+(Math.random()<.5?-1:1)*randInt(1,3);const w=uScene('多い方！','点の数が多い側をタップ');const row=uEl('div','uRow');const make=(n)=>uBtn('● '.repeat(n),'uDotBox');const l=make(a),r=make(b);row.append(l,r);w.appendChild(row);listen(l,'pointerdown',e=>{e.preventDefault();resolveRound(a>b)});listen(r,'pointerdown',e=>{e.preventDefault();resolveRound(b>a)});return;
    }
    if(mode==='closest_value'){
      const target=randInt(20,80),vals=shuffle([target+randInt(-3,3),target+randInt(8,14),target-randInt(8,14),target+randInt(18,25)]);const closest=vals.reduce((a,b)=>Math.abs(b-target)<Math.abs(a-target)?b:a);const w=uScene('一番近い数',`TARGET ${target}`);uShuffleButtons(w,vals,v=>resolveRound(v===closest));return;
    }
    if(mode==='shadow_match'){
      const shapes=['●','▲','◆'];const target=pick(shapes);const w=uScene('影を合わせろ',`影: ${target}`);const row=uEl('div','uRow');w.appendChild(row);shuffle(shapes).forEach(s=>{const b=uBtn(s,'uShapeBtn');listen(b,'pointerdown',e=>{e.preventDefault();resolveRound(s===target)});row.appendChild(b)});return;
    }
    if(mode==='rotate_fit'){
      const target=pick([0,90,180,270]);let angle=pick([0,90,180,270]);if(angle===target)angle=(angle+90)%360;const w=uScene('回して合わせろ','矢印を緑の向きに');const targetEl=uEl('div','uRotateTarget','↑'),obj=uEl('div','uRotateObj','↑');targetEl.style.transform=`rotate(${target}deg)`;obj.style.transform=`rotate(${angle}deg)`;w.append(targetEl,obj);const row=uEl('div','uRow');const l=uBtn('↺'),r=uBtn('↻'),ok=uBtn('OK');row.append(l,r,ok);w.appendChild(row);listen(l,'pointerdown',e=>{e.preventDefault();angle=(angle+270)%360;obj.style.transform=`rotate(${angle}deg)`});listen(r,'pointerdown',e=>{e.preventDefault();angle=(angle+90)%360;obj.style.transform=`rotate(${angle}deg)`});listen(ok,'pointerdown',e=>{e.preventDefault();resolveRound(angle===target)});return;
    }
    if(mode==='mirror_swipe'){
      const d=pick(['left','right','up','down']),mirror={left:'right',right:'left',up:'down',down:'up'}[d],icons={left:'←',right:'→',up:'↑',down:'↓'};const w=uScene('鏡！',`${icons[d]} の左右/上下反対へスワイプ`);w.appendChild(uEl('div','uHugeArrow',icons[d]));let sx=0,sy=0;listen(w,'pointerdown',e=>{sx=e.clientX;sy=e.clientY});listen(w,'pointerup',e=>{const dx=e.clientX-sx,dy=e.clientY-sy;if(Math.hypot(dx,dy)<35)return;const got=Math.abs(dx)>Math.abs(dy)?(dx>0?'right':'left'):(dy>0?'down':'up');resolveRound(got===mirror)});return;
    }
    if(mode==='swipe_combo'){
      const dirs=shuffle(['left','right','up','down']).slice(0,3),icons={left:'←',right:'→',up:'↑',down:'↓'};const w=uScene('3連スワイプ',dirs.map(d=>icons[d]).join(' '));let i=0,sx=0,sy=0;listen(w,'pointerdown',e=>{sx=e.clientX;sy=e.clientY});listen(w,'pointerup',e=>{const dx=e.clientX-sx,dy=e.clientY-sy;if(Math.hypot(dx,dy)<30)return;const got=Math.abs(dx)>Math.abs(dy)?(dx>0?'right':'left'):(dy>0?'down':'up');if(got!==dirs[i]){resolveRound(false);return}i++;gameSfx('action');if(i===dirs.length)resolveRound(true)});return;
    }
    if(mode==='memory_positions'){
      const w=uScene('場所を覚えろ','光った3マスを覚える');const g=uEl('div','uGrid3');w.appendChild(g);const chosen=shuffle([...Array(9).keys()]).slice(0,3),btns=[];for(let i=0;i<9;i++){const b=uBtn('',`uMemCell ${chosen.includes(i)?'show':''}`);btns.push(b);g.appendChild(b)}let ready=false,hit=new Set();const t=setTimeout(()=>{btns.forEach(b=>b.classList.remove('show'));ready=true},1100);onCleanup(()=>clearTimeout(t));btns.forEach((b,i)=>listen(b,'pointerdown',e=>{e.preventDefault();if(!ready){resolveRound(false);return}if(!chosen.includes(i)){resolveRound(false);return}hit.add(i);b.classList.add('hit');if(hit.size===3)resolveRound(true)}));return;
    }
    if(mode==='whack_order'){
      const nums=shuffle([1,2,3,4]);const w=uScene('出た順！','1→4ではなく、出現した順に叩け');const board=uEl('div','uBoard');w.appendChild(board);let order=[],ready=false,i=0,btns=[];(async()=>{for(const n of nums){const b=uBtn(String(n),'uPopTarget');b.style.left=randInt(5,75)+'%';b.style.top=randInt(8,70)+'%';board.appendChild(b);btns.push(b);order.push(n);b.classList.add('flash');await activeDelay(250);b.classList.remove('flash')}ready=true})();onCleanup(()=>{});gameLoop(()=>{});const handler=e=>{const b=e.target.closest('.uPopTarget');if(!b||!ready)return;const v=+b.textContent;if(v!==order[i]){resolveRound(false);return}b.disabled=true;i++;if(i===order.length)resolveRound(true)};listen(board,'pointerdown',handler);return;
    }
    if(mode==='size_order'){
      const vals=shuffle([26,40,56,72]);const w=uScene('小→大','円を小さい順にタップ');const row=uEl('div','uRow');w.appendChild(row);let sorted=[...vals].sort((a,b)=>a-b),i=0;vals.forEach(s=>{const b=uBtn('','uSizeCircle');b.style.width=b.style.height=s+'px';listen(b,'pointerdown',e=>{e.preventDefault();if(s!==sorted[i]){resolveRound(false);return}b.style.visibility='hidden';if(++i===sorted.length)resolveRound(true)});row.appendChild(b)});return;
    }
    if(mode==='color_order'){
      const recipes=[{target:'紫',mix:['赤','青']},{target:'緑',mix:['青','黄']},{target:'橙',mix:['赤','黄']}],rec=pick(recipes),colors=[['赤','#ff5d6c'],['青','#39e7ff'],['黄','#ffd84a']],w=uScene('色を作れ',`${rec.target}になる2色を選べ`),row=uEl('div','uRow');w.appendChild(row);let picked=[];colors.forEach(c=>{const b=uBtn(c[0],'uColorTile');b.style.background=c[1];listen(b,'pointerdown',e=>{e.preventDefault();if(b.disabled)return;b.disabled=true;picked.push(c[0]);if(picked.length===2)resolveRound(rec.mix.every(x=>picked.includes(x)))});row.appendChild(b)});return;
    }
    if(mode==='precision_hold'){
      const low=700,high=1050;const w=uScene('ぴったり長押し','0.7〜1.0秒で離せ');const b=uBtn('HOLD','uBigTarget'),out=uEl('div','uReadout','0.0s');w.append(b,out);let start=0,holding=false;listen(b,'pointerdown',e=>{e.preventDefault();holding=true;start=performance.now()});listen(b,'pointerup',e=>{if(!holding)return;holding=false;const ms=performance.now()-start;out.textContent=(ms/1000).toFixed(1)+'s';resolveRound(ms>=low&&ms<=high)});gameLoop(()=>{if(holding)out.textContent=((performance.now()-start)/1000).toFixed(1)+'s'});return;
    }
    if(mode==='zone_tracking'){
      const w=uScene('追い続けろ','指で青玉を動かし、動く緑枠内を2秒維持');const board=uEl('div','uBoard'),ball=uEl('div','uBall'),zone=uEl('div','uTrackZone');board.append(zone,ball);w.appendChild(board);let bx=50,by=50,zx=30,zy=30,t=0,drag=false;listen(board,'pointerdown',e=>{e.preventDefault();drag=true});listen(board,'pointermove',e=>{if(!drag)return;const r=board.getBoundingClientRect();bx=(e.clientX-r.left)/r.width*100;by=(e.clientY-r.top)/r.height*100;ball.style.left=bx+'%';ball.style.top=by+'%'});listen(board,'pointerup',()=>drag=false);gameLoop((now,dt)=>{zx=45+30*Math.sin(now/850);zy=42+25*Math.cos(now/1000);zone.style.left=zx+'%';zone.style.top=zy+'%';const inside=Math.abs(bx-zx)<12&&Math.abs(by-zy)<12;t=inside?t+dt:0;if(t>=2)resolveRound(true)});return;
    }
    if(mode==='swipe_clear'){
      const w=uScene('邪魔を払え','赤い3個だけ外へスワイプ。緑は残せ');const board=uEl('div','uBoard');w.appendChild(board);let left=3;for(let i=0;i<4;i++){const isBad=i<3,b=uBtn('','uSwipeChip '+(isBad?'bad':'good'));b.style.left=(15+(i%2)*50)+'%';b.style.top=(18+Math.floor(i/2)*45)+'%';board.appendChild(b);let sx=0,sy=0;listen(b,'pointerdown',e=>{sx=e.clientX;sy=e.clientY});listen(b,'pointerup',e=>{if(Math.hypot(e.clientX-sx,e.clientY-sy)<45)return;if(!isBad){resolveRound(false);return}b.remove();if(--left===0)resolveRound(true)})}return;
    }
    if(mode==='catch_avoid'){
      const w=uScene('取って避けろ','★を2個キャッチ、爆弾は避ける');const board=uEl('div','uCatchBoard'),basket=uEl('div','uBasket');board.appendChild(basket);w.appendChild(board);let x=50,spawn=0,caught=0,items=[];listen(board,'pointermove',e=>{const r=board.getBoundingClientRect();x=clamp((e.clientX-r.left)/r.width*100,8,92);basket.style.left=x+'%'});listen(board,'pointerdown',e=>{const r=board.getBoundingClientRect();x=clamp((e.clientX-r.left)/r.width*100,8,92);basket.style.left=x+'%'});gameLoop((_,dt)=>{spawn-=dt;if(spawn<=0){spawn=.55;const good=Math.random()<.7,it=uEl('div','uFallItem',good?'★':'✹');it.dataset.good=good?'1':'0';it.style.left=randInt(8,88)+'%';it.style.top='-8%';board.appendChild(it);items.push({el:it,y:-8})}const br=board.getBoundingClientRect(),rr=basket.getBoundingClientRect();items.forEach(o=>{o.y+=44*dt;o.el.style.top=o.y+'%';if(o.y>78&&o.y<92&&rectsOverlap(o.el.getBoundingClientRect(),rr,2)){if(o.el.dataset.good==='1'){caught++;o.el.remove();o.y=120;if(caught>=2)resolveRound(true)}else resolveRound(false)}})});return;
    }
    if(mode==='slingshot'){
      const w=uScene('はじいて入れろ','玉を後ろへ引いて離す');const board=uEl('div','uBoard'),ball=uEl('div','uBall'),goal=uEl('div','uGoal');board.append(goal,ball);w.appendChild(board);let start={x:45,y:160},drag=false,dx=0,dy=0;requestAnimationFrame(()=>{const r=board.getBoundingClientRect();start={x:45,y:r.height-55};setStylePos(ball,start.x,start.y);setStylePos(goal,r.width-70,25)});listen(ball,'pointerdown',e=>{e.preventDefault();drag=true;safeCapture(ball,e)});listen(ball,'pointermove',e=>{if(!drag)return;const r=board.getBoundingClientRect();const x=clamp(e.clientX-r.left-18,0,r.width-36),y=clamp(e.clientY-r.top-18,0,r.height-36);dx=start.x-x;dy=start.y-y;setStylePos(ball,x,y)});listen(ball,'pointerup',e=>{if(!drag)return;drag=false;safeReleaseCapture(ball,e);let x=parseFloat(ball.style.left),y=parseFloat(ball.style.top),vx=dx*2.2,vy=dy*2.2;gameLoop((_,dt)=>{x+=vx*dt;y+=vy*dt;vy+=80*dt;setStylePos(ball,x,y);if(rectsOverlap(ball.getBoundingClientRect(),goal.getBoundingClientRect(),5))resolveRound(true);if(x<-50||x>board.clientWidth+50||y>board.clientHeight+50)resolveRound(false)})});return;
    }
    if(mode==='safe_path'){
      const safe=randInt(0,2);const w=uScene('安全な道','障害物のないレーンを選べ');const row=uEl('div','uRow');w.appendChild(row);for(let i=0;i<3;i++){const b=uBtn(i===safe?'···':'·■·','uPath');listen(b,'pointerdown',e=>{e.preventDefault();resolveRound(i===safe)});row.appendChild(b)}return;
    }
    if(mode==='spot_change'){
      const before=['●','▲','■','◆'],idx=randInt(0,3),after=[...before];after[idx]=['♥','★','○','△'][idx];const w=uScene('変わった場所','最初を覚えろ');const row=uEl('div','uRow');w.appendChild(row);let ready=false,btns=before.map((v,i)=>{const b=uBtn(v,'uTile');row.appendChild(b);return b});const t=setTimeout(()=>{btns.forEach((b,i)=>b.textContent=after[i]);ready=true;w.querySelector('.uSub').textContent='変わった1個をタップ'},950);onCleanup(()=>clearTimeout(t));btns.forEach((b,i)=>listen(b,'pointerdown',e=>{e.preventDefault();if(!ready){resolveRound(false);return}resolveRound(i===idx)}));return;
    }
    if(mode==='rotated_glyph'){
      const base='L',targetAngle=pick([90,180,270]);const w=uScene('同じ向き','見本と同じ回転を選べ');const sample=uEl('div','uRotateTarget',base);sample.style.transform=`rotate(${targetAngle}deg)`;w.appendChild(sample);const row=uEl('div','uRow');w.appendChild(row);shuffle([0,90,180,270]).forEach(a=>{const b=uBtn(base,'uRotateChoice');b.style.transform=`rotate(${a}deg)`;listen(b,'pointerdown',e=>{e.preventDefault();resolveRound(a===targetAngle)});row.appendChild(b)});return;
    }
    if(mode==='grid_pattern'){
      const pattern=shuffle([...Array(9).keys()]).slice(0,4);const w=uScene('模様を再現','1秒後に消える');const ref=uEl('div','uGrid3 uPatternGrid'),play=uEl('div','uGrid3');w.append(ref,play);for(let i=0;i<9;i++)ref.appendChild(uEl('div',`uPatternCell ${pattern.includes(i)?'on':''}`));let selected=new Set(),ready=false;const cells=[];for(let i=0;i<9;i++){const b=uBtn('','uPatternCell');cells.push(b);play.appendChild(b);listen(b,'pointerdown',e=>{e.preventDefault();if(!ready)return;b.classList.toggle('on');selected.has(i)?selected.delete(i):selected.add(i);if(selected.size===pattern.length){resolveRound(pattern.every(x=>selected.has(x)))}})}const t=setTimeout(()=>{ref.style.visibility='hidden';ready=true},1000);onCleanup(()=>clearTimeout(t));return;
    }
    if(mode==='count_crossing'){
      const total=randInt(4,7);const w=uScene('何個通った？','線を越えた数を数えろ');const board=uEl('div','uCrossBoard'),line=uEl('div','uCrossLine');board.appendChild(line);w.appendChild(board);let spawned=0,crossed=0,items=[],answering=false;gameLoop((_,dt)=>{if(answering)return;if(spawned<total&&Math.random()<dt*3){spawned++;const it=uEl('div','uCrossObj','●');it.style.top=randInt(12,78)+'%';board.appendChild(it);items.push({el:it,x:-10,v:rand(42,64),counted:false})}items.forEach(o=>{o.x+=o.v*dt;o.el.style.left=o.x+'%';if(!o.counted&&o.x>=50){o.counted=true;crossed++}});if(spawned===total&&items.every(o=>o.x>105)){answering=true;const vals=shuffle([total,total-1,total+1,total+2]);uShuffleButtons(w,vals,v=>resolveRound(v===total))}});return;
    }
    if(mode==='shell_game'){
      const w=uScene('カップを追え','★が入ったカップを覚えろ');const row=uEl('div','uShellRow');w.appendChild(row);let cups=[];for(let i=0;i<3;i++){const c=uBtn('▰','uCup');cups.push(c);row.appendChild(c)}const starCup=pick(cups),star=uEl('div','uShellStar','★');starCup.appendChild(star);let ready=false;(async()=>{if(!await activeDelay(700))return;star.remove();for(let k=0;k<4;k++){const a=randInt(0,2),b=(a+randInt(1,2))%3;[cups[a],cups[b]]=[cups[b],cups[a]];row.replaceChildren(...cups);if(!await activeDelay(230))return}ready=true})();cups.forEach(c=>listen(c,'pointerdown',e=>{e.preventDefault();if(!ready){resolveRound(false);return}resolveRound(c===starCup)}));return;
    }
    if(mode==='remember_object'){
      const icons=['★','▲','◆','♥'];const target=pick(icons);const w=uScene('覚えろ',target);const big=uEl('div','uHugeIcon',target);w.appendChild(big);let ready=false;const t=setTimeout(()=>{big.remove();ready=true;uShuffleButtons(w,icons,v=>{if(ready)resolveRound(v===target)})},900);onCleanup(()=>clearTimeout(t));return;
    }
    if(mode==='keypad_code'){
      const code=String(randInt(100,999));const w=uScene('コード入力',code);const display=uEl('div','uCode',code);w.appendChild(display);let input='';const t=setTimeout(()=>{display.textContent='---'},850);onCleanup(()=>clearTimeout(t));const g=uEl('div','uKeypad');w.appendChild(g);shuffle([1,2,3,4,5,6,7,8,9,0]).forEach(n=>{const b=uBtn(n,'uKey');listen(b,'pointerdown',e=>{e.preventDefault();input+=n;if(input.length===3)resolveRound(input===code)});g.appendChild(b)});return;
    }
    if(mode==='unlock_pattern'){
      const path=pick([[0,1,4,7],[2,1,4,6],[6,3,4,5]]),w=uScene('パターン解除','1→4の点を指で順になぞれ'),board=uEl('div','uPatternLock');w.appendChild(board);const dots=[];for(let i=0;i<9;i++){const order=path.indexOf(i);const d=uEl('div','uLockDot',order>=0?String(order+1):'○');dots.push(d);board.appendChild(d)}let drag=false,hit=[];const addAt=e=>{const el=document.elementFromPoint(e.clientX,e.clientY)?.closest('.uLockDot');if(!el)return;const i=dots.indexOf(el);if(i>=0&&path.includes(i)&&hit.at(-1)!==i){hit.push(i);el.classList.add('hit')}};listen(board,'pointerdown',e=>{e.preventDefault();drag=true;safeCapture(board,e);addAt(e)});listen(board,'pointermove',e=>{if(drag)addAt(e)});listen(board,'pointerup',e=>{drag=false;safeReleaseCapture(board,e);resolveRound(hit.join(',')===path.join(','))});return;
    }
    if(mode==='clock_read'){
      const hour=pick([1,3,6,9]),minute=pick([0,30]);const w=uScene('時計を読め','針の時刻を選べ');const clock=uEl('div','uClock'),h=uEl('div','uHourHand'),m=uEl('div','uMinuteHand');clock.append(h,m);w.appendChild(clock);h.style.transform=`rotate(${hour*30+minute*.5}deg)`;m.style.transform=`rotate(${minute*6}deg)`;const answer=`${hour}:${minute===0?'00':'30'}`,vals=shuffle([answer,`${(hour%12)+1}:${minute===0?'00':'30'}`,`${hour}:${minute===0?'30':'00'}`,`${((hour+5)%12)||12}:00`]);uShuffleButtons(w,vals,v=>resolveRound(v===answer));return;
    }
    if(mode==='set_clock'){
      const targetH=pick([2,4,6,8]),targetM=pick([0,30]);const w=uScene('針を合わせろ',`${targetH}:${targetM?'30':'00'}`);const clock=uEl('div','uClock'),h=uEl('div','uHourHand'),m=uEl('div','uMinuteHand');clock.append(h,m);w.appendChild(clock);let hh=12,mm=0;const row=uEl('div','uRow');const hb=uBtn('HOUR +2'),mb=uBtn('MIN +30'),ok=uBtn('OK');row.append(hb,mb,ok);w.appendChild(row);const render=()=>{h.style.transform=`rotate(${(hh%12)*30+mm*.5}deg)`;m.style.transform=`rotate(${mm*6}deg)`};listen(hb,'pointerdown',e=>{e.preventDefault();hh=hh===12?2:(hh+2>12?2:hh+2);render()});listen(mb,'pointerdown',e=>{e.preventDefault();mm=mm?0:30;render()});listen(ok,'pointerdown',e=>{e.preventDefault();resolveRound(hh===targetH&&mm===targetM)});render();return;
    }
    if(mode==='primes'){
      const vals=shuffle([2,3,4,5,6,7]);const primes=new Set([2,3,5,7]);const w=uScene('素数だけ','素数を全部タップ');const g=uEl('div','uGrid');w.appendChild(g);let left=4;vals.forEach(v=>{const b=uBtn(v);listen(b,'pointerdown',e=>{e.preventDefault();if(!primes.has(v)){resolveRound(false);return}if(b.disabled)return;b.disabled=true;if(--left===0)resolveRound(true)});g.appendChild(b)});return;
    }
    if(mode==='vowels'){
      const vals=shuffle(['A','B','E','K','I','T']);const vowels=new Set(['A','E','I']);const w=uScene('母音だけ','A E I を全部タップ');const g=uEl('div','uGrid');w.appendChild(g);let left=3;vals.forEach(v=>{const b=uBtn(v);listen(b,'pointerdown',e=>{e.preventDefault();if(!vowels.has(v)){resolveRound(false);return}if(b.disabled)return;b.disabled=true;if(--left===0)resolveRound(true)});g.appendChild(b)});return;
    }
    if(mode==='make_sum'){
      const target=10,pair=pick([[3,7],[4,6],[2,8]]),vals=shuffle(pair.concat([1,5,9,6]));const w=uScene('合計10','2つ選んで10にしろ');const g=uEl('div','uGrid');w.appendChild(g);let selected=[];vals.forEach(v=>{const b=uBtn(v);listen(b,'pointerdown',e=>{e.preventDefault();if(b.disabled)return;b.disabled=true;selected.push(v);if(selected.length===2)resolveRound(selected[0]+selected[1]===target)});g.appendChild(b)});return;
    }
    if(mode==='make_difference'){
      const target=4,pair=pick([[9,5],[7,3],[6,2]]),vals=shuffle(pair.concat([1,8,5,10]));const w=uScene('差を4に','2つ選んで差を4');const g=uEl('div','uGrid');w.appendChild(g);let selected=[];vals.forEach(v=>{const b=uBtn(v);listen(b,'pointerdown',e=>{e.preventDefault();if(b.disabled)return;b.disabled=true;selected.push(v);if(selected.length===2)resolveRound(Math.abs(selected[0]-selected[1])===target)});g.appendChild(b)});return;
    }
    if(mode==='domino_match'){
      const end=randInt(1,6),vals=shuffle([[end,randInt(1,6)],[randInt(1,6),end],[randInt(1,6),randInt(1,6)],[randInt(1,6),randInt(1,6)]]);const correct=vals.find(v=>v[0]===end||v[1]===end);const w=uScene('ドミノ','端の数に合う牌を選べ');w.appendChild(uEl('div','uDominoEnd',String(end)));const g=uEl('div','uGrid');w.appendChild(g);vals.forEach(v=>{const b=uBtn(`${v[0]} | ${v[1]}`,'uDomino');listen(b,'pointerdown',e=>{e.preventDefault();resolveRound(v===correct)});g.appendChild(b)});return;
    }
    if(mode==='connect_pairs'){
      const w=uScene('同色をつなげ','青↔青、桃↔桃を指で結ぶ');
      const board=uEl('div','uConnectBoard');w.appendChild(board);
      const pts=[['b',12,18],['p',12,72],['p',78,18],['b',78,72]],els=[];
      pts.forEach(([c,x,y])=>{
        const d=uEl('div','uConnectDot '+c);
        d.dataset.c=c;d.style.left=x+'%';d.style.top=y+'%';
        board.appendChild(d);els.push(d);
      });

      const live=uEl('div','uConnectLine live');
      live.style.display='none';
      board.prepend(live);

      const done=new Set();
      let start=null;

      const pointInBoard=(clientX,clientY)=>{
        const br=board.getBoundingClientRect();
        return {x:clientX-br.left,y:clientY-br.top};
      };
      const centerInBoard=el=>{
        const br=board.getBoundingClientRect(),r=el.getBoundingClientRect();
        return {x:r.left+r.width/2-br.left,y:r.top+r.height/2-br.top};
      };
      const drawLine=(line,a,b,color)=>{
        const dx=b.x-a.x,dy=b.y-a.y;
        line.className='uConnectLine '+color+(line===live?' live':'');
        line.style.left=a.x+'px';
        line.style.top=(a.y-4)+'px';
        line.style.width=Math.max(1,Math.hypot(dx,dy))+'px';
        line.style.transform=`rotate(${Math.atan2(dy,dx)*180/Math.PI}deg)`;
      };
      const resetLive=()=>{
        if(start)start.classList.remove('active');
        start=null;
        live.style.display='none';
      };
      const nearestDot=(clientX,clientY)=>{
        const p=pointInBoard(clientX,clientY);
        let found=null,best=Infinity;
        for(const d of els){
          const c=centerInBoard(d),dist=Math.hypot(p.x-c.x,p.y-c.y);
          if(dist<best){best=dist;found=d}
        }
        return best<=40?found:null;
      };

      els.forEach(dot=>{
        listen(dot,'pointerdown',e=>{
          e.preventDefault();
          if(done.has(dot.dataset.c))return;
          start=dot;
          dot.classList.add('active');
          live.style.display='block';
          const a=centerInBoard(dot);
          drawLine(live,a,pointInBoard(e.clientX,e.clientY),dot.dataset.c);
          safeCapture(dot,e);
          gameSfx('action');
        });
      });

      listen(board,'pointermove',e=>{
        if(!start)return;
        e.preventDefault();
        drawLine(live,centerInBoard(start),pointInBoard(e.clientX,e.clientY),start.dataset.c);
      });

      const finishConnect=e=>{
        if(!start)return;
        e.preventDefault();
        const source=start;
        safeReleaseCapture(source,e);
        const target=nearestDot(e.clientX,e.clientY);

        if(target&&target!==source&&target.dataset.c===source.dataset.c&&!done.has(source.dataset.c)){
          const finalLine=uEl('div','uConnectLine '+source.dataset.c);
          board.insertBefore(finalLine,board.firstChild);
          drawLine(finalLine,centerInBoard(source),centerInBoard(target),source.dataset.c);
          source.classList.remove('active');
          source.classList.add('hit');
          target.classList.add('hit');
          done.add(source.dataset.c);
          start=null;
          live.style.display='none';
          gameSfx('ok');
          if(done.size===2)resolveRound(true);
          return;
        }

        // 別色の点へつないだ時だけMISS。
        // 空振りはやり直せるので、指を少し外しても即失敗にはしない。
        const wrong=target&&target!==source&&target.dataset.c!==source.dataset.c;
        resetLive();
        if(wrong)resolveRound(false);
      };

      listen(board,'pointerup',finishConnect);
      listen(board,'pointercancel',e=>{
        if(start)safeReleaseCapture(start,e);
        resetLive();
      });
      return;
    }
  }

  const EXTRA_UNIQUE_MODES=[
    'doubletap','tap_or_hold','target_sequence','reverse_sequence','select_all','wait_reveal','drag_maze','multi_match_drag','swap_tiles','dial_rotate','slider_value',
    'balance','charge_release','dual_meter','rhythm_copy','alternate_lr','opposite_arrow','conjunction_match','jump','duck','lane_collect','shield','aim_shoot',
    'sort_bins','stack_drop','slide_puzzle','toggle_pattern','lights_out','missing_number','duplicate_number','more_dots','closest_value','shadow_match','rotate_fit','mirror_swipe','swipe_combo','memory_positions','whack_order','size_order',
    'color_order','precision_hold','zone_tracking','swipe_clear','catch_avoid','slingshot','safe_path','spot_change','rotated_glyph','grid_pattern','count_crossing','shell_game','remember_object','keypad_code','unlock_pattern','clock_read','set_clock','primes','vowels','make_sum','make_difference','domino_match','connect_pairs'
  ];
  const EXTRA_LABELS={
    doubletap:['2回タップ！','同じターゲットを素早く2回'],tap_or_hold:['TAP? HOLD?','表示された操作を実行'],target_sequence:['点滅を数えろ','光った回数だけTAP'],reverse_sequence:['逆順タップ','表示の逆順で押す'],select_all:['全部選べ','指定記号を全部選ぶ'],wait_reveal:['押したまま待て','GOで指を離す'],drag_maze:['ドラッグ迷路','壁を避けてゴール'],multi_match_drag:['2個仕分け','色ごとにドラッグ'],swap_tiles:['入れ替え','2枚を交換して整列'],dial_rotate:['ダイヤル','針を方向へ回す'],slider_value:['数値スライダー','指定値に合わせる'],
    balance:['バランス','左右入力で中央維持'],charge_release:['チャージ','長押しして適量で離す'],dual_meter:['ダブルSTOP','2本を順に止める'],rhythm_copy:['リズムコピー','光った左右を再現'],alternate_lr:['交互連打','左右を交互に押す'],opposite_arrow:['逆方向','矢印の反対を選ぶ'],conjunction_match:['条件2つ','色と形を同時判定'],jump:['ジャンプ','障害物を飛び越える'],duck:['しゃがむ','障害物の下をくぐる'],lane_collect:['レーン収集','左右移動で回収'],shield:['盾を置け','指示方向へ盾をドラッグ'],aim_shoot:['照準射撃','狙って撃つ'],
    sort_bins:['仕分け','対象を正しい箱へ'],stack_drop:['積み上げ','動くブロックを落とす'],slide_puzzle:['スライドパズル','空きマスへ動かす'],toggle_pattern:['スイッチ再現','ON/OFFを一致'],lights_out:['ライトアウト','1回で全部消えるマスを探す'],missing_number:['欠番','抜けた数字を探す'],duplicate_number:['重複','2個ある数字を探す'],more_dots:['多い方','個数を比較'],closest_value:['近い数','目標値に最も近い数'],shadow_match:['影合わせ','シルエット一致'],rotate_fit:['回転合わせ','向きを回して一致'],mirror_swipe:['鏡スワイプ','反対方向へスワイプ'],swipe_combo:['3連スワイプ','方向列を連続入力'],memory_positions:['位置記憶','光ったマスを覚える'],whack_order:['出現順','出た順に叩く'],size_order:['サイズ順','小さい順に押す'],
    color_order:['色を作れ','2色を混ぜて指定色を作る'],precision_hold:['精密長押し','時間範囲で離す'],zone_tracking:['追従','動く枠内を維持'],swipe_clear:['払い除け','不要物だけスワイプ'],catch_avoid:['キャッチ&回避','良い物を取り爆弾回避'],slingshot:['スリングショット','引いて放してゴール'],safe_path:['安全ルート','障害物のない道を選ぶ'],spot_change:['変化探し','変わった1個を見つける'],rotated_glyph:['回転識別','同じ向きの記号'],grid_pattern:['模様記憶','3×3配置を再現'],count_crossing:['通過カウント','横切った個数を数える'],shell_game:['カップ追跡','隠した★を追う'],remember_object:['一瞬記憶','見た物を選ぶ'],keypad_code:['暗証番号','コードを記憶して入力'],unlock_pattern:['パターンロック','点を順になぞる'],clock_read:['時計読み','アナログ時刻を読む'],set_clock:['時計合わせ','針を指定時刻へ'],primes:['素数選択','素数を全部選ぶ'],vowels:['母音選択','母音だけ選ぶ'],make_sum:['合計作り','2数で指定合計'],make_difference:['差作り','2数で指定差'],domino_match:['ドミノ','端の数をつなぐ'],connect_pairs:['ペア接続','同色の点をつなぐ']
  };
  const EXTRA_UNIQUE_DEFS=EXTRA_UNIQUE_MODES.map((mode,index)=>{
    const min=index<11?1:index<23?2:index<39?3:4;
    const label=EXTRA_LABELS[mode];
    return {id:'u_'+mode,mechanicKey:'u_'+mode,min,make:()=>({id:'u_'+mode,verb:label[0],hint:label[1],timeBudget:min===4?8200:min===3?7200:min===2?6500:6000,setup:()=>setupExtraUnique(mode)})};
  });


  // v3.9 count rule: a theme/skin variation is NOT a separate game.
  // The original 38 mechanics remain, and 62 mechanically distinct games are added.
  const baseGameDefs=[
    {id:'bug',min:1,make:makeBug},{id:'meter',min:1,make:makeMeter},{id:'swipe',min:1,make:makeSwipe},{id:'drag',min:1,make:makeDrag},{id:'hold',min:1,make:makeHold},
    {id:'side',min:1,make:makeSide},{id:'size',min:1,make:makeSize},{id:'light',min:1,make:makeLight},{id:'flick',min:1,make:makeFlick},{id:'same',min:1,make:makeSame},
    {id:'train',min:1,make:makeTrain},{id:'alarm',min:1,make:makeAlarm},{id:'toast',min:1,make:makeToast},{id:'umbrella',min:1,make:makeUmbrella},
    {id:'catch',min:2,make:makeCatch},{id:'balloons',min:2,make:makeBalloons},{id:'mash',min:2,make:makeMash},{id:'color',min:2,make:makeColor},{id:'number',min:2,make:makeNumber},
    {id:'count',min:2,make:makeCount},{id:'pair',min:2,make:makePair},{id:'symbols',min:2,make:makeSymbols},{id:'slider',min:2,make:makeSlider},{id:'colorcatch',min:2,make:makeColorCatch},
    {id:'dog',min:2,make:makeDog},{id:'ramen',min:2,make:makeRamen},{id:'elevator',min:2,make:makeElevator},
    {id:'dodge',min:3,make:makeDodge},{id:'order',min:3,make:makeOrder},{id:'odd',min:3,make:makeOdd},{id:'lane',min:3,make:makeLane},{id:'wipe',min:3,make:makeWipe},
    {id:'math',min:3,make:makeMath},{id:'stroop',min:3,make:makeStroop},{id:'chase',min:3,make:makeChase},{id:'toilet',min:3,make:makeToilet},
    {id:'memory',min:4,make:makeMemory},{id:'trace',min:4,make:makeTrace}
  ].map(g=>({...g,mechanicKey:g.id}));
  const gameDefs=[...baseGameDefs,...EXTRA_UNIQUE_DEFS];
  const mechanicKeys=new Set(gameDefs.map(g=>g.mechanicKey));
  if(gameDefs.length!==100||mechanicKeys.size!==100){
    throw new Error(`FLASH RUSH game audit failed: defs=${gameDefs.length}, mechanics=${mechanicKeys.size}`);
  }
  // SCENARIO_DEFS is kept only as a theme/variant library. It is not counted in the 100 games.

  function chooseGame(){
    // LEVELによるゲーム解放制限は行わない。
    // 毎ラウンド、通常ミニゲーム100種類すべてを同じ候補として完全ランダム選択する。
    const def=pick(gameDefs);
    state.lastGame=def.id;
    return def.make();
  }
  async function launchCurrent(){
    // 同じroundTokenのゲーム本体は1度しか起動しない。
    // 非同期演出や入力イベントが重なっても、同じラウンドが二重生成されるのを防ぐ。
    const launchRoundToken=state.roundToken;
    if(state.launchedRoundToken===launchRoundToken) return;
    state.launchedRoundToken=launchRoundToken;

    // ボスかどうかは nextRound() で1度だけ確定する。
    // launchCurrent() は出現判定を一切行わず、確定済みのラウンド種別だけを使用する。
    const isBoss = state.roundType === 'boss';
    state.isBossRound = isBoss;

    // 二重防御。直前がボスなのにboss指定になった場合は通常ゲームへ強制復帰する。
    const safeIsBoss = isBoss && state.previousRoundType !== 'boss';
    if(isBoss && !safeIsBoss){
      state.roundType='normal';
      state.isBossRound=false;
    }
    const game=safeIsBoss?makeBoss():chooseGame();
    state.currentGame=game.id; await unlockAudio();
    if(!state.running||launchRoundToken!==state.roundToken) return;
    startBgm(game.id); if(safeIsBoss) gameSfx('boss');
    const prompt=document.createElement('div'); prompt.className='promptCard'; prompt.innerHTML=`<div class="promptVerb">${game.verb}</div><div class="promptHint">${game.hint}</div>`; gameArea.appendChild(prompt); pixelizeElement(prompt);
    const token=state.runToken, roundToken=state.roundToken;
    if(!await activeDelay(promptDelay(),token)||roundToken!==state.roundToken||launchRoundToken!==state.roundToken) return;
    prompt.classList.add('hide'); await activeDelay(170,token); prompt.remove();
    if(!state.running||roundToken!==state.roundToken||launchRoundToken!==state.roundToken) return;
    stage.replaceChildren(); stage.classList.remove('roundEnter'); void stage.offsetWidth; stage.classList.add('roundEnter'); state.roundInteracted=false; const result=game.setup()||{}; pixelizeElement(stage); state.timeoutSuccess=!!result.timeoutSuccess; state.duration=Math.max(Number(result.duration)||0,durationForGame(game,safeIsBoss)); startTimer(state.duration,roundToken);
  }
  function startTimer(ms,roundToken){
    state.elapsed=0; let last=performance.now(); cancelAnimationFrame(state.timerRaf);
    const tick=()=>{
      if(!state.running||state.resolving||roundToken!==state.roundToken) return;
      const now=performance.now();
      if(!state.paused) state.elapsed+=Math.max(0,now-last);
      last=now;
      const p=clamp(1-state.elapsed/ms,0,1); progressBar.style.transform=`scaleX(${p})`;
      if(state.elapsed>=ms){ resolveRound(state.timeoutSuccess&&state.roundInteracted); return; }
      state.timerRaf=requestAnimationFrame(tick);
    };
    state.timerRaf=requestAnimationFrame(tick);
  }
  async function resolveRound(ok){
    if(!state.running||state.resolving) return;
    state.resolving=true; cancelAnimationFrame(state.timerRaf); stopBgm(); progressBar.style.transform='scaleX(0)';
    state.cleanup.splice(0).forEach(fn=>{try{fn()}catch(_){}});
    // 現在ラウンドの種別を先に確定してから、次回ボス用カウンタを更新する。
    // 成否に関係なく「1ゲーム消化」として扱う。
    const completedType = state.roundType;
    if(completedType === 'boss'){
      state.normalRoundsSinceBoss = 0;
      state.bossCount++;
    }else{
      state.normalRoundsSinceBoss++;
    }
    state.previousRoundType = completedType;

    if(ok){ state.clears++; const bonus=Math.max(0,Math.round((state.duration-state.elapsed)/28)); const base=completedType==='boss'?650:100; state.score+=base*state.speed+bonus; gameSfx('ok'); vibrate(28); }
    else{ state.lives--; gameSfx('miss'); vibrate([55,35,55]); stage.classList.remove('shake'); void stage.offsetWidth; stage.classList.add('shake'); }
    updateHud(); pixelBurst(ok); const flash=document.createElement('div'); flash.className='resultFlash '+(ok?'ok':'miss'); flash.textContent=ok?'OK!':'MISS!'; gameArea.appendChild(flash);
    await activeDelay(620); flash.remove(); if(!state.running) return;
    if(state.lives<=0) endRun(); else nextRound();
  }
  function endRun(){
    if(!state.running) return; state.running=false; state.paused=false; state.runToken++; stopBgm(); clearStage(); pauseOverlay.classList.remove('show'); gameArea.classList.remove('paused');
    const oldBest=best; if(state.score>best){best=state.score;saveBest(best)}
    if(state.playerType==='user'){
      mgPortalRecordPlay('flash-rush','FLASH RUSH',game=>{
        mgPortalSetRecord(game,'bestScore','BEST SCORE',Math.max(mgPortalRecordValue(game,'bestScore'),state.score),'score');
        mgPortalSetRecord(game,'bestLevel','BEST LEVEL',Math.max(mgPortalRecordValue(game,'bestLevel'),state.level),'level');
        mgPortalSetRecord(game,'bestClear','BEST CLEAR',Math.max(mgPortalRecordValue(game,'bestClear'),state.clears),'number');
        mgPortalSetRecord(game,'maxSpeed','MAX SPEED',Math.max(mgPortalRecordValue(game,'maxSpeed'),state.speed),'number');
      });
    }
    $('#finalScore').textContent=state.score.toLocaleString('ja-JP'); $('#statGames').textContent=state.round; $('#statClear').textContent=state.clears; $('#statSpeed').textContent=state.speed; $('#newBest').textContent=state.score>oldBest?'★ NEW BEST!':'';
    $('#endSub').textContent=state.level>=4?'LEVEL 4まで到達！':state.level>=3?'かなり速いところまで到達！':'もう一回で反応速度を更新しよう。'; bestStart.textContent=best; showScreen(endScreen);
  }
  function abortRun(){
    if(!confirm('現在のゲームを中断してタイトルへ戻りますか？')) return;
    state.running=false; state.paused=false; state.runToken++; stopBgm(); clearStage(); pauseOverlay.classList.remove('show'); gameArea.classList.remove('paused'); bestStart.textContent=best; showScreen(startScreen);
  }

  /* ---------- VARIANTS ---------- */
  function makeBug(){ const hits=state.level>=3?randInt(1,3):randInt(1,2),icon=pick(['⚡','🐝','★','👾']); return {id:'bug',verb:hits>1?`${hits}回たたけ！`:'たたけ！',hint:`動く ${icon} をタップ`,timeBudget:4600+hits*650,setup:()=>setupBug({hits,icon})}; }
  function makeMeter(){ const width=state.level>=3?randInt(11,17):randInt(16,23),left=randInt(12,78-width); return {id:'meter',verb:'緑で止めろ！',hint:'動くバーが緑ゾーンに入ったらタップ',timeBudget:5600,setup:()=>setupMeter({left,width})}; }
  function makeSwipe(){ const d=pick([{n:'left',i:'←'},{n:'right',i:'→'},{n:'up',i:'↑'},{n:'down',i:'↓'}]); return {id:'swipe',verb:'スワイプしろ！',hint:`${d.i} の方向へスワイプ`,timeBudget:4700,setup:()=>setupSwipe(d)}; }
  function makeDrag(){ const themed=SCENARIO_DEFS.filter(d=>d.type==='drag').map(d=>[d.item,d.goal]); const pair=pick([['🔌','▣'],['🔑','🔒'],['✉️','📮'],['🧩','□'],...themed]); return {id:'drag',verb:'入れろ！',hint:`${pair[0]} を ${pair[1]} へドラッグ`,timeBudget:6000,setup:()=>setupDrag(pair)}; }
  function makeHold(){ const need=randInt(55,85)/100; return {id:'hold',verb:'長押し！',hint:`約 ${need.toFixed(1)} 秒 押し続けろ`,timeBudget:5000+need*1200,setup:()=>setupHold(need)}; }
  function makeCatch(){ const count=state.level>=4?randInt(2,3):randInt(1,2),icon=pick(['★','♥','◆']); return {id:'catch',verb:`${count}個キャッチ！`,hint:`${icon} をカゴで受けろ`,timeBudget:5400+count*950,setup:()=>setupCatch({count,icon})}; }
  function makeBalloons(){ const count=randInt(2,Math.min(5,2+state.level)); return {id:'balloons',verb:'全部わる！',hint:`動く風船を ${count} 個タップ`,timeBudget:4300+count*650,setup:()=>setupBalloons(count)}; }
  function makeMash(){ const need=randInt(6+state.level,9+state.level*2); return {id:'mash',verb:'連打！',hint:`${need} 回タップ`,timeBudget:4300+need*190,setup:()=>setupMash(need)}; }
  function makeColor(){ const colors=[['緑','#55ef9c'],['ピンク','#ff4fa3'],['青','#39e7ff'],['黄','#ffd84a']],target=pick(colors); return {id:'color',verb:`${target[0]}だけ！`,hint:'正しい色を1つタップ',setup:()=>setupColor(target)}; }
  function makeNumber(){ const target=randInt(1,9),count=state.level>=4?9:6; return {id:'number',verb:`${target}を押せ！`,hint:'数字を見つけてタップ',setup:()=>setupNumber(target,count)}; }
  function makeDodge(){ const side=state.level>=4&&Math.random()<.45?'side':'top'; return {id:'dodge',verb:'よけろ！',hint:side==='top'?'左右に動いて生き残れ':'上下に動いて横から避けろ',setup:()=>setupDodge(side)}; }
  function makeOrder(){ const len=state.level>=4?randInt(4,5):3; return {id:'order',verb:'順番！',hint:`1 → ${len} の順にタップ`,timeBudget:4600+len*650,setup:()=>setupOrder(len)}; }
  function makeOdd(){ const packs=[['●','○'],['★','☆'],['▲','△'],['■','□'],['😃','😎']],p=pick(packs); return {id:'odd',verb:'違うの！',hint:'1つだけ違うものをタップ',setup:()=>setupOdd(p)}; }
  function makeLane(){ const width=state.level>=4?randInt(13,17):randInt(18,24),left=randInt(8,88-width); return {id:'lane',verb:'ゲートで止めろ！',hint:'動くボールが緑ゲート内に入ったらタップ',setup:()=>setupLane({left,width})}; }
  function makeWipe(){ const side=Math.random()<.5?'left':'right'; return {id:'wipe',verb:side==='left'?'左へ！':'右へ！',hint:'ブロックをゴールまでスライド',setup:()=>setupWipe(side)}; }
  function makeSide(){ const vertical=Math.random()<.4,d=vertical?pick(['up','down']):pick(['left','right']),labels={left:'左',right:'右',up:'上',down:'下'}; return {id:'side',verb:`${labels[d]}を押せ！`,hint:'指示された側をタップ',setup:()=>setupSide(d,vertical)}; }
  function makeSize(){ const want=Math.random()<.5?'big':'small'; return {id:'size',verb:want==='big'?'大きい方！':'小さい方！',hint:'2つを見比べてタップ',setup:()=>setupSize(want)}; }
  function makeLight(){ const wait=randInt(38,90)/100; return {id:'light',verb:'青で押せ！',hint:'早押しはMISS',setup:()=>setupLight(wait)}; }
  function makeFlick(){ const d=pick([{n:'left',i:'←'},{n:'right',i:'→'},{n:'up',i:'↑'},{n:'down',i:'↓'}]),icon=pick(['●','⚽','🍊','💿']); return {id:'flick',verb:'はじけ！',hint:`${icon} を ${d.i} へフリック`,setup:()=>setupFlick(d,icon)}; }
  function makeSame(){ const icons=['🐸','🐧','🐶','🐱','🍎','🍋','🚗','★'],same=Math.random()<.5,a=pick(icons),b=same?a:pick(icons.filter(x=>x!==a)); return {id:'same',verb:'同じ？',hint:'2つを比べて SAME / DIFFERENT を選べ',setup:()=>setupSame(a,b,same)}; }
  function makeCount(){ const icon=pick(['★','●','▲','🍓','🐸']),count=randInt(2,state.level>=4?8:6); return {id:'count',verb:'何個？',hint:`画面の ${icon} を数えて、個数の数字をタップ`,setup:()=>setupCount(icon,count)}; }
  function makePair(){ const packs=[['🐸','🐧','🐶'],['🍎','🍋','🍇'],['★','◆','●'],['🚗','🚲','🚀']]; return {id:'pair',verb:'ペアを探せ！',hint:'同じ2枚を続けてタップ',setup:()=>setupPair(pick(packs))}; }
  function makeSymbols(){ const pool=['★','●','▲','◆','♥','☀'],len=state.level>=4?4:randInt(2,3),seq=shuffle(pool).slice(0,len); return {id:'symbols',verb:'順番どおり！',hint:`${seq.join(' → ')} の順にタップ`,timeBudget:4700+len*700,setup:()=>setupSymbols(seq,pool)}; }
  function makeSlider(){ const width=state.level>=4?randInt(12,16):randInt(17,22),left=randInt(7,91-width); return {id:'slider',verb:'合わせろ！',hint:'つまみを緑ゾーンへ',setup:()=>setupSlider(left,width)}; }
  function makeColorCatch(){ const colors=[['ピンク','#ff4fa3'],['青','#39e7ff'],['緑','#55ef9c'],['黄','#ffd84a']],target=pick(colors),count=state.level>=4?2:1; return {id:'colorcatch',verb:`${target[0]}だけ！`,hint:`${count}個カゴでキャッチ`,timeBudget:5700+count*950,setup:()=>setupColorCatch(target,count,colors)}; }
  function makeMath(){ let a,b,op,ans;if(state.level>=4&&Math.random()<.35){a=randInt(2,6);b=randInt(2,5);op='×';ans=a*b}else{a=randInt(2,12);b=randInt(1,9);op=Math.random()<.55?'+':'−';if(op==='−'&&b>a)[a,b]=[b,a];ans=op==='+'?a+b:a-b} return {id:'math',verb:'計算！',hint:`${a} ${op} ${b} = ?`,timeBudget:7000,setup:()=>setupMath(a,op,b,ans)}; }
  function makeStroop(){ const colors=[['赤','#ff5d6c'],['青','#39e7ff'],['緑','#55ef9c'],['黄','#ffd84a']],word=pick(colors),ink=Math.random()<.72?pick(colors.filter(x=>x[0]!==word[0])):word; return {id:'stroop',verb:'文字の色！',hint:'書いてある意味ではなく「色」',setup:()=>setupStroop(word,ink,colors)}; }
  function makeChase(){ const icons=['🐸','🐙','👾','🐥','🦊','🐼'],target=pick(icons),count=state.level>=4?8:6; return {id:'chase',verb:`${target}を捕まえろ！`,hint:'動くターゲットをタップ',setup:()=>setupChase(target,count,icons)}; }
  function makeMemory(){ const len=state.speed>=7?4:3,seq=Array.from({length:len},()=>randInt(0,3)); return {id:'memory',verb:'覚えろ！',hint:`${len}回の光を同じ順で`,timeBudget:7600+len*700,setup:()=>setupMemory(seq)}; }
  function makeTrace(){ const count=state.speed>=7?5:4; return {id:'trace',verb:'なぞれ！',hint:`1 → ${count} を指でつなげ`,timeBudget:6200+count*600,setup:()=>setupTrace(count)}; }
  function makeTrain(){ const dir=Math.random()<.5?1:-1,doorLeft=randInt(30,56); return {id:'train',verb:'飛び乗れ！',hint:'ドアの前に来た瞬間タップ',setup:()=>setupTrain(dir,doorLeft)}; }
  function makeAlarm(){ const labels=shuffle(['STOP','SNOOZE','+5 MIN']); return {id:'alarm',verb:'目覚ましを止めろ！',hint:'STOPだけを押せ',setup:()=>setupAlarm(labels)}; }
  function makeToast(){ const from=pick(['left','center','right']); return {id:'toast',verb:'トーストをキャッチ！',hint:'お皿を動かして受け止めろ',setup:()=>setupToast(from)}; }
  function makeUmbrella(){ const x=randInt(34,66); return {id:'umbrella',verb:'傘を開け！',hint:'傘を上へスワイプ',setup:()=>setupUmbrella(x)}; }
  function makeDog(){ const axis=Math.random()<.5?'x':'y'; return {id:'dog',verb:'犬を捕まえろ！',hint:'輪っかを犬にかぶせて離せ',setup:()=>setupDog(axis)}; }
  function makeRamen(){ const low=state.level>=4?74:68, high=state.level>=4?84:88; return {id:'ramen',verb:'ラーメンを止めろ！',hint:'緑の高さでSTOP',setup:()=>setupRamen(low,high)}; }
  function makeElevator(){ const labels=shuffle(['閉','開','1','2','3','▲','▼','4','5']); return {id:'elevator',verb:'閉めろ！',hint:'エレベーターの「閉」を押せ',setup:()=>setupElevator(labels)}; }
  function makeToilet(){ const side=Math.random()<.5?'left':'right'; return {id:'toilet',verb:'交換しろ！',hint:'新しいトイレットペーパーをホルダーへ',setup:()=>setupToilet(side)}; }



  const bossDefs=[
    {id:'boss_stars',make:()=>{const need=Math.min(7,2+state.level);return {id:'boss_stars',verb:'BOSS：スターラッシュ！',hint:`★を${need}個集めて障害物をよけろ`,setup:()=>setupBossStars(need)}}},
    {id:'boss_targets',make:()=>{const need=5+state.level*2;return {id:'boss_targets',verb:'BOSS：ターゲットパニック！',hint:`青いコアを${need}個破壊。赤い爆弾は押すな`,setup:()=>setupBossTargets(need)}}},
    {id:'boss_meteors',make:()=>{const need=6+state.level*2;return {id:'boss_meteors',verb:'BOSS：メテオ防衛！',hint:`落下する隕石を${need}個撃ち落とせ。3個落とすとMISS`,setup:()=>setupBossMeteors(need)}}},
    {id:'boss_lasers',make:()=>({id:'boss_lasers',verb:'BOSS：レーザー脱出！',hint:'プレイヤーをドラッグしてレーザーを最後まで避けろ',setup:()=>setupBossLasers()})},
    {id:'boss_memory',make:()=>({id:'boss_memory',verb:'BOSS：メモリーコア！',hint:'光った色の順番を覚えて2ステージ突破しろ',setup:()=>setupBossMemory()})}
  ];
  function refillBossBag(){
    const ids=shuffle(bossDefs.map(b=>b.id));
    if(ids.length>1&&ids[0]===state.lastBossGame){
      [ids[0],ids[1]]=[ids[1],ids[0]];
    }
    state.bossBag=ids;
  }
  function makeBoss(){
    if(!Array.isArray(state.bossBag)||!state.bossBag.length)refillBossBag();
    const id=state.bossBag.shift();
    const def=bossDefs.find(b=>b.id===id);
    state.lastBossGame=def.id;
    return def.make();
  }

  /* ---------- MICRO GAMES ---------- */
  function setupBug({hits,icon}){
    let got=0; const t=document.createElement('button'); t.type='button'; t.className='bigTarget'; t.textContent=icon; stage.appendChild(t); let moveAt=0;
    const move=()=>{ const r=stage.getBoundingClientRect(); setStylePos(t,rand(12,Math.max(13,r.width-90)),rand(28,Math.max(29,r.height-112))); };
    move(); gameLoop((now)=>{ if(now-moveAt>Math.max(210,530-state.speed*30)){move();moveAt=now;} });
    listen(t,'pointerdown',e=>{e.preventDefault();got++;gameSfx('action');if(got>=hits)resolveRound(true);else move()});
  }
  function setupMeter({left,width}){
    const wrap=document.createElement('div');wrap.className='meterPanel';wrap.innerHTML='<div class="meterGuide">バーが緑ゾーンに入ったらタップ</div><div class="meterTrack"><div class="meterZone"></div><div class="meterNeedle"></div></div>';const zone=wrap.querySelector('.meterZone');zone.style.left=left+'%';zone.style.width=width+'%';const btn=document.createElement('button');btn.className='tapAnywhere';btn.type='button';stage.append(wrap,btn);const needle=wrap.querySelector('.meterNeedle');let phase=rand(0,6);
    gameLoop((_,dt)=>{phase+=dt*(4.4+state.speed*.42);needle.style.left=((Math.sin(phase)*.5+.5)*94)+'%'});
    listen(btn,'pointerdown',e=>{e.preventDefault();gameSfx('action');const n=needle.getBoundingClientRect(),z=zone.getBoundingClientRect(),c=n.left+n.width/2;resolveRound(c>=z.left&&c<=z.right)});
  }
  function setupSwipe(target){
    let sx=0,sy=0,tracking=false;
    const rotations={right:0,down:90,left:180,up:-90};
    const directionNames={right:'RIGHT',left:'LEFT',up:'UP',down:'DOWN'};
    const w=document.createElement('div');
    w.className='arrowWrap';
    w.innerHTML=`
      <div class="pixelSwipeArrow" style="--arrow-rot:${rotations[target.n]??0}deg" aria-hidden="true">
        <svg viewBox="0 0 18 18" role="img">
          <path class="arrowOutline" d="M1 5h8V2h3v2h2v2h2v2h1v2h-1v2h-2v2h-2v2H9v-3H1z"/>
          <path class="arrowFill" d="M3 7h8V5l4 4-4 4v-2H3z"/>
        </svg>
      </div>
      <div class="arrowDirection">${directionNames[target.n]||target.n}</div>
      <div class="arrowHelp">大きい矢印と同じ方向へスワイプ</div>`;
    stage.appendChild(w);
    listen(stage,'pointerdown',e=>{tracking=true;sx=e.clientX;sy=e.clientY});
    listen(stage,'pointerup',e=>{
      if(!tracking)return;
      tracking=false;
      const dx=e.clientX-sx,dy=e.clientY-sy;
      if(Math.hypot(dx,dy)<38)return;
      const dir=Math.abs(dx)>Math.abs(dy)?(dx>0?'right':'left'):(dy>0?'down':'up');
      gameSfx('action');
      resolveRound(dir===target.n);
    });
  }
  function setupDrag(pair){
    const obj=document.createElement('div'),zone=document.createElement('div');
    obj.className='dragObj';obj.textContent=pair[0];zone.className='dropZone';zone.textContent=pair[1];stage.append(zone,obj);
    const r=stage.getBoundingClientRect();
    const [start,target]=randomSeparatedStagePoints(r,84,84,114,114);
    setStylePos(obj,start.x,start.y);setStylePos(zone,target.x,target.y);
    let active=false,ox=0,oy=0;
    listen(obj,'pointerdown',e=>{e.preventDefault();active=true;safeCapture(obj,e);const rr=obj.getBoundingClientRect();ox=e.clientX-rr.left;oy=e.clientY-rr.top});
    listen(obj,'pointermove',e=>{if(!active)return;const sr=stage.getBoundingClientRect();setStylePos(obj,clamp(e.clientX-sr.left-ox,0,sr.width-84),clamp(e.clientY-sr.top-oy,42,sr.height-84))});
    const end=e=>{if(!active)return;active=false;safeReleaseCapture(obj,e);gameSfx('action');if(rectsOverlap(obj.getBoundingClientRect(),zone.getBoundingClientRect(),18))resolveRound(true)};
    listen(obj,'pointerup',end);listen(obj,'pointercancel',end);
  }
  function setupHold(need){
    const w=document.createElement('div');
    w.className='holdWrap';
    w.innerHTML=`<button class="holdButton" type="button"><span class="holdPixelHand" aria-hidden="true"><svg viewBox="0 0 16 16"><rect x="7" y="1" width="2" height="8" fill="#fff1c9"/><rect x="9" y="4" width="2" height="6" fill="#fff1c9"/><rect x="11" y="5" width="2" height="6" fill="#fff1c9"/><rect x="13" y="7" width="2" height="5" fill="#fff1c9"/><rect x="5" y="8" width="9" height="6" fill="#fff1c9"/><rect x="3" y="8" width="3" height="2" fill="#fff1c9"/><rect x="4" y="10" width="3" height="3" fill="#fff1c9"/><rect x="6" y="14" width="7" height="1" fill="#e9b77f"/><rect x="7" y="1" width="2" height="1" fill="#ffdca5"/><rect x="4" y="8" width="2" height="1" fill="#ffdca5"/></svg></span><span class="holdText">HOLD!</span></button><div class="holdBar"><div class="holdFill"></div></div>`;
    stage.appendChild(w);
    const btn=w.querySelector('.holdButton'),fill=w.querySelector('.holdFill'),text=w.querySelector('.holdText');
    const setHoldText=value=>{text.textContent=value};
    let holding=false,held=0,qualified=false,activePointerId=null;

    listen(btn,'pointerdown',e=>{
      e.preventDefault();
      if(holding) return;
      holding=true;
      held=0;
      qualified=false;
      activePointerId=e.pointerId ?? null;
      fill.style.width='0%';
      btn.classList.add('holding');
      setHoldText('HOLD...');
      gameSfx('action');
      safeCapture(btn,e);
    });

    const finish=e=>{
      if(!holding) return;
      holding=false;
      safeReleaseCapture(btn,e);
      activePointerId=null;
      btn.classList.remove('holding');

      // 規定時間を満たしていても、指を離すまでは次ゲームへ遷移しない。
      // Pointer Capture中にDOMを破棄するとiPhoneで後続入力が壊れることがあるため。
      if(qualified){
        setHoldText('OK!');
        resolveRound(true);
      }else{
        held=0;
        fill.style.width='0%';
        setHoldText('HOLD!');
      }
    };

    const cancel=e=>{
      if(!holding) return;
      holding=false;
      safeReleaseCapture(btn,e);
      activePointerId=null;
      qualified=false;
      held=0;
      fill.style.width='0%';
      btn.classList.remove('holding');
      setHoldText('HOLD!');
    };

    listen(btn,'pointerup',finish);
    listen(btn,'pointercancel',cancel);

    gameLoop((_,dt)=>{
      if(!holding||qualified) return;
      held+=dt;
      const pct=Math.min(100,held/need*100);
      fill.style.width=pct+'%';
      if(held>=need){
        qualified=true;
        fill.style.width='100%';
        setHoldText('RELEASE!');
        gameSfx('action');
        vibrate(20);
      }
    });
  }
  function setupCatch({count,icon}){
    const b=document.createElement('div');b.className='basket';stage.appendChild(b);let caught=0,items=[],spawnWait=0;const r=stage.getBoundingClientRect();b.style.left=(r.width/2-47)+'px';
    function moveBasket(cx){const rr=stage.getBoundingClientRect();b.style.left=clamp(cx-rr.left-47,3,rr.width-97)+'px'} listen(stage,'pointerdown',e=>moveBasket(e.clientX));listen(stage,'pointermove',e=>{if(e.buttons||e.pointerType==='touch')moveBasket(e.clientX)});
    function spawn(){const el=document.createElement('div');el.className='star';el.textContent=icon;const o={el,x:rand(20,r.width-70),y:-62,v:175+state.speed*22};setStylePos(el,o.x,o.y);stage.appendChild(el);items.push(o)} spawn();
    gameLoop((_,dt)=>{spawnWait+=dt;for(let i=items.length-1;i>=0;i--){const o=items[i];o.y+=o.v*dt;o.el.style.top=o.y+'px';if(rectsOverlap(o.el.getBoundingClientRect(),b.getBoundingClientRect(),4)){caught++;gameSfx('action');o.el.remove();items.splice(i,1);if(caught>=count){resolveRound(true);return;}spawn()}else if(o.y>r.height){resolveRound(false);return;}}});
  }
  function setupBalloons(count){
    const colors=['#ff4fa3','#39e7ff','#916cff','#55ef9c','#ffd84a'];const items=[],r=stage.getBoundingClientRect();for(let i=0;i<count;i++){const el=document.createElement('button');el.type='button';el.className='balloon';el.style.setProperty('--balloon-color',colors[i%colors.length]);el.style.color=colors[i%colors.length];el.setAttribute('aria-label','風船');const o={el,x:rand(8,r.width-80),y:rand(55,r.height-150),vx:rand(60,115)*(Math.random()<.5?-1:1),vy:rand(50,100)*(Math.random()<.5?-1:1),dead:false};setStylePos(el,o.x,o.y);stage.appendChild(el);items.push(o);listen(el,'pointerdown',e=>{e.preventDefault();if(o.dead)return;o.dead=true;gameSfx('action');el.classList.add('pop');setTimeout(()=>el.remove(),170);if(items.every(x=>x.dead))resolveRound(true)})}gameLoop((_,dt)=>{for(const o of items){if(o.dead)continue;o.x+=o.vx*dt;o.y+=o.vy*dt;if(o.x<3||o.x>r.width-75){o.vx*=-1;o.x=clamp(o.x,3,r.width-75)}if(o.y<35||o.y>r.height-105){o.vy*=-1;o.y=clamp(o.y,35,r.height-105)}setStylePos(o.el,o.x,o.y)}});
  }
  function setupMash(need){let count=0;const w=document.createElement('div');w.className='mashWrap';w.innerHTML='<button class="mashButton" type="button">PUSH!</button><div class="mashBar"><div class="mashFill"></div></div>';stage.appendChild(w);const btn=w.querySelector('.mashButton'),fill=w.querySelector('.mashFill');listen(btn,'pointerdown',e=>{e.preventDefault();count++;gameSfx('action');fill.style.width=Math.min(100,count/need*100)+'%';if(count>=need)resolveRound(true)});}
  function setupColor(target){
    const palette=[['緑','#55ef9c'],['ピンク','#ff4fa3'],['青','#39e7ff'],['黄','#ffd84a']],label=document.createElement('div');label.className='colorLabel';label.innerHTML=`<b style="color:${target[1]}">${target[0]}</b>だけタップ`;stage.appendChild(label);const items=[],r=stage.getBoundingClientRect(),choices=shuffle([...palette,pick(palette),pick(palette)]);let usedTarget=false;
    choices.forEach((data,i)=>{if(data[0]===target[0]){if(usedTarget)data=pick(palette.filter(x=>x[0]!==target[0]));else usedTarget=true}const el=document.createElement('button');el.className='colorOrb';el.type='button';el.style.background=data[1];const o={el,ok:data[0]===target[0],x:rand(6,r.width-76),y:rand(r.height*.26,r.height-90),vx:rand(65,115)*(Math.random()<.5?-1:1),vy:rand(55,100)*(Math.random()<.5?-1:1)};setStylePos(el,o.x,o.y);stage.appendChild(el);items.push(o);listen(el,'pointerdown',e=>{e.preventDefault();gameSfx('action');resolveRound(o.ok)})});if(!usedTarget){items[0].ok=true;items[0].el.style.background=target[1]}
    gameLoop((_,dt)=>{for(const o of items){o.x+=o.vx*dt;o.y+=o.vy*dt;if(o.x<3||o.x>r.width-73){o.vx*=-1;o.x=clamp(o.x,3,r.width-73)}if(o.y<r.height*.22||o.y>r.height-73){o.vy*=-1;o.y=clamp(o.y,r.height*.22,r.height-73)}setStylePos(o.el,o.x,o.y)}});
  }
  function setupNumber(target,count){
    const grid=document.createElement('div');grid.className='numGrid';stage.appendChild(grid);let nums=new Set([target]);while(nums.size<count)nums.add(randInt(1,9));const arr=shuffle([...nums]);while(arr.length<count)arr.push(randInt(1,9));shuffle(arr).forEach(n=>{const b=document.createElement('button');b.type='button';b.className='numTile';b.textContent=n;grid.appendChild(b);listen(b,'pointerdown',e=>{e.preventDefault();gameSfx('action');resolveRound(n===target)})});
  }
  function setupDodge(side){
    const p=document.createElement('div');p.className='playerDot';stage.appendChild(p);const hazards=[],r=stage.getBoundingClientRect();if(side==='side'){p.style.width='34px';p.style.height='64px';p.style.left='22px';p.style.bottom=(r.height/2-32)+'px'}
    function move(e){const rr=stage.getBoundingClientRect();if(side==='top')p.style.left=clamp(e.clientX-rr.left-32,4,rr.width-68)+'px';else p.style.bottom=clamp(rr.bottom-e.clientY-32,4,rr.height-68)+'px'}listen(stage,'pointerdown',e=>move(e));listen(stage,'pointermove',e=>{if(e.buttons||e.pointerType==='touch')move(e)});let spawnAt=0;
    function spawn(){const el=document.createElement('div');el.className='fallingRock';const o={el,x:0,y:0,v:220+state.speed*30};if(side==='top'){o.x=rand(4,r.width-58);o.y=-65}else{o.x=r.width+65;o.y=rand(35,r.height-90)}setStylePos(el,o.x,o.y);stage.appendChild(el);hazards.push(o)}
    gameLoop((now,dt)=>{if(now-spawnAt>Math.max(390,730-state.speed*55)){spawn();spawnAt=now}for(let i=hazards.length-1;i>=0;i--){const o=hazards[i];if(side==='top')o.y+=o.v*dt;else o.x-=o.v*dt;setStylePos(o.el,o.x,o.y);if(rectsOverlap(o.el.getBoundingClientRect(),p.getBoundingClientRect(),6)){resolveRound(false);return}if(o.y>r.height+70||o.x<-70){o.el.remove();hazards.splice(i,1)}}});return{timeoutSuccess:true};
  }
  function setupOrder(len){
    const grid=document.createElement('div');grid.className='orderGrid';stage.appendChild(grid);let next=1;shuffle(Array.from({length:len},(_,i)=>i+1)).forEach(n=>{const b=document.createElement('button');b.type='button';b.className='orderTile';b.textContent=n;grid.appendChild(b);listen(b,'pointerdown',e=>{e.preventDefault();if(n!==next){gameSfx('action');resolveRound(false);return}gameSfx('action');b.classList.add('done');next++;if(next>len)resolveRound(true)})});
  }
  function setupOdd(pair){
    const grid=document.createElement('div');grid.className='oddGrid';stage.appendChild(grid);const count=state.level>=4?9:6,odd=randInt(0,count-1);for(let i=0;i<count;i++){const b=document.createElement('button');b.type='button';b.className='oddTile';b.textContent=i===odd?pair[1]:pair[0];grid.appendChild(b);listen(b,'pointerdown',e=>{e.preventDefault();gameSfx('action');resolveRound(i===odd)})}
  }
  function setupLane({left,width}){
    const guide=document.createElement('div');guide.className='meterGuide';guide.textContent='ボールが緑ゲート内に入ったらタップ';const track=document.createElement('div');track.className='laneTrack';const gate=document.createElement('div');gate.className='laneGate';gate.style.left=left+'%';gate.style.width=width+'%';const ball=document.createElement('div');ball.className='laneBall';track.append(gate,ball);const btn=document.createElement('button');btn.className='tapAnywhere';btn.type='button';stage.append(guide,track,btn);let phase=rand(0,4);gameLoop((_,dt)=>{phase+=dt*(3.9+state.speed*.34);ball.style.left=((Math.sin(phase)*.5+.5)*88)+'%'});listen(btn,'pointerdown',e=>{e.preventDefault();gameSfx('action');const br=ball.getBoundingClientRect(),gr=gate.getBoundingClientRect(),c=br.left+br.width/2;resolveRound(c>=gr.left&&c<=gr.right)});
  }
  function setupWipe(side){
    const track=document.createElement('div');track.className='wipeTrack';const goal=document.createElement('div');goal.className='wipeGoal';const handle=document.createElement('div');handle.className='wipeHandle';handle.textContent=side==='left'?'←':'→';track.append(goal,handle);stage.appendChild(track);let active=false,ox=0;requestAnimationFrame(()=>{const w=track.clientWidth;goal.style.left=(side==='left'?4:w-82)+'px';handle.style.left=(side==='left'?w-76:8)+'px'});listen(handle,'pointerdown',e=>{e.preventDefault();active=true;const rr=handle.getBoundingClientRect();ox=e.clientX-rr.left;safeCapture(handle,e)});listen(handle,'pointermove',e=>{if(!active)return;const tr=track.getBoundingClientRect();handle.style.left=clamp(e.clientX-tr.left-ox,3,tr.width-71)+'px'});const end=()=>{if(!active)return;active=false;gameSfx('action');if(rectsOverlap(handle.getBoundingClientRect(),goal.getBoundingClientRect(),15))resolveRound(true)};listen(handle,'pointerup',end);listen(handle,'pointercancel',end);
  }
  function setupSide(target,vertical){
    const wrap=document.createElement('div');wrap.className='sideChoiceWrap'+(vertical?' vertical':'');
    const defs=vertical?[['up','↑'],['down','↓']]:[['left','←'],['right','→']];
    defs.forEach(([id,icon])=>{const b=document.createElement('button');b.type='button';b.className='sideChoice';b.textContent=icon;wrap.appendChild(b);listen(b,'pointerdown',e=>{e.preventDefault();gameSfx('action');resolveRound(id===target)})});
    stage.appendChild(wrap);
  }
  function setupSize(want){
    const wrap=document.createElement('div');wrap.className='sizeChoiceWrap';stage.appendChild(wrap);const sizes=shuffle([randInt(74,96),randInt(126,158)]);const target=want==='big'?Math.max(...sizes):Math.min(...sizes);
    sizes.forEach((sz,i)=>{const b=document.createElement('button');b.type='button';b.className='sizeChoice';b.style.width=sz+'px';b.style.height=sz+'px';b.textContent=pick(['●','★','◆']);wrap.appendChild(b);listen(b,'pointerdown',e=>{e.preventDefault();gameSfx('action');resolveRound(sz===target)})});
  }
  function setupLight(wait){
    const wrap=document.createElement('div');wrap.className='lightWrap';wrap.innerHTML='<div class="trafficLight"><div class="lamp"></div></div><div class="lightHint">WAIT...</div><button class="lightTap" type="button" aria-label="青になったらタップ"></button>';stage.appendChild(wrap);const light=wrap.querySelector('.trafficLight'),hint=wrap.querySelector('.lightHint'),tap=wrap.querySelector('.lightTap');let t=0,ready=false;
    gameLoop((_,dt)=>{if(ready)return;t+=dt;if(t>=wait){ready=true;light.classList.add('ready');hint.textContent='NOW!';gameSfx('action')}});
    listen(tap,'pointerdown',e=>{e.preventDefault();if(!ready){gameSfx('action');resolveRound(false);return}gameSfx('action');resolveRound(true)});
  }
  function setupFlick(target,icon){
    const guide=document.createElement('div');guide.className='flickGuide';guide.textContent=target.i;const p=document.createElement('div');p.className='flickPuck';p.textContent=icon;stage.append(guide,p);const r=stage.getBoundingClientRect();setStylePos(p,r.width/2-52,r.height/2-52);let active=false,sx=0,sy=0,ox=0,oy=0;
    listen(p,'pointerdown',e=>{e.preventDefault();active=true;sx=e.clientX;sy=e.clientY;const pr=p.getBoundingClientRect();ox=e.clientX-pr.left;oy=e.clientY-pr.top;safeCapture(p,e)});
    listen(p,'pointermove',e=>{if(!active)return;const sr=stage.getBoundingClientRect();setStylePos(p,clamp(e.clientX-sr.left-ox,0,sr.width-104),clamp(e.clientY-sr.top-oy,0,sr.height-104))});
    const end=e=>{if(!active)return;active=false;safeReleaseCapture(p,e);const dx=e.clientX-sx,dy=e.clientY-sy;if(Math.hypot(dx,dy)<45){const rr=stage.getBoundingClientRect();setStylePos(p,rr.width/2-52,rr.height/2-52);return}const dir=Math.abs(dx)>Math.abs(dy)?(dx>0?'right':'left'):(dy>0?'down':'up');gameSfx('action');resolveRound(dir===target.n)};listen(p,'pointerup',end);listen(p,'pointercancel',e=>{active=false;safeReleaseCapture(p,e)});
  }
  function setupSame(a,b,isSame){
    const w=document.createElement('div');w.className='sameWrap';w.innerHTML=`<div class="sameCards"><div class="sameCard">${a}</div><div class="sameCard">${b}</div></div><div class="sameButtons"><button class="sameBtn" type="button">SAME</button><button class="sameBtn" type="button">DIFFERENT</button></div>`;stage.appendChild(w);const bs=w.querySelectorAll('.sameBtn');listen(bs[0],'pointerdown',e=>{e.preventDefault();gameSfx('action');resolveRound(isSame)});listen(bs[1],'pointerdown',e=>{e.preventDefault();gameSfx('action');resolveRound(!isSame)});
  }
  function setupCount(icon,count){
    const w=document.createElement('div');w.className='countWrap';const cloud=document.createElement('div');cloud.className='countCloud';for(let i=0;i<count;i++){const s=document.createElement('span');s.textContent=icon;cloud.appendChild(s)}const row=document.createElement('div');row.className='answerRow';let opts=new Set([count]);while(opts.size<4)opts.add(clamp(count+randInt(-3,3),1,9));shuffle([...opts]).forEach(n=>{const b=document.createElement('button');b.type='button';b.className='answerBtn';b.textContent=n;row.appendChild(b);listen(b,'pointerdown',e=>{e.preventDefault();gameSfx('action');resolveRound(n===count)})});w.append(cloud,row);stage.appendChild(w);
  }
  function setupPair(pack){
    const grid=document.createElement('div');grid.className='pairGrid';stage.appendChild(grid);const values=shuffle(pack.flatMap(v=>[v,v]));let first=null;
    values.forEach(v=>{const b=document.createElement('button');b.type='button';b.className='pairCard';b.dataset.value=v;b.textContent=v;grid.appendChild(b);listen(b,'pointerdown',e=>{e.preventDefault();if(first===b)return;gameSfx('action');if(!first){first=b;b.classList.add('selected');return}resolveRound(first.dataset.value===v)})});
  }
  function setupSymbols(seq,pool){
    const label=document.createElement('div');label.className='symbolSeqLabel';label.textContent=seq.join(' → ');const grid=document.createElement('div');grid.className='symbolGrid';stage.append(label,grid);let next=0;shuffle(pool).forEach(sym=>{const b=document.createElement('button');b.type='button';b.className='symbolBtn';b.textContent=sym;grid.appendChild(b);listen(b,'pointerdown',e=>{e.preventDefault();gameSfx('action');if(sym!==seq[next]){resolveRound(false);return}b.classList.add('done');next++;if(next>=seq.length)resolveRound(true)})});
  }
  function setupSlider(left,width){
    const wrap=document.createElement('div');wrap.className='precisionWrap';const guide=document.createElement('div');guide.className='meterGuide';guide.textContent='つまみを緑ゾーンまでドラッグして離す';const tr=document.createElement('div');tr.className='precisionTrack';const goal=document.createElement('div');goal.className='precisionGoal';goal.style.left=left+'%';goal.style.width=width+'%';const h=document.createElement('div');h.className='precisionHandle';tr.append(goal,h);wrap.append(guide,tr);stage.appendChild(wrap);let active=false,ox=0;requestAnimationFrame(()=>{h.style.left=randInt(2,Math.max(3,tr.clientWidth-58))+'px'});listen(h,'pointerdown',e=>{e.preventDefault();active=true;ox=e.clientX-h.getBoundingClientRect().left;safeCapture(h,e)});listen(h,'pointermove',e=>{if(!active)return;const rr=tr.getBoundingClientRect();h.style.left=clamp(e.clientX-rr.left-ox,0,rr.width-54)+'px'});const end=e=>{if(!active)return;active=false;safeReleaseCapture(h,e);gameSfx('action');const hr=h.getBoundingClientRect(),gr=goal.getBoundingClientRect(),c=hr.left+hr.width/2;resolveRound(c>=gr.left&&c<=gr.right)};listen(h,'pointerup',end);listen(h,'pointercancel',e=>{active=false;safeReleaseCapture(h,e)});
  }
  function setupColorCatch(target,count,colors){
    const label=document.createElement('div');label.className='colorCatchLabel';label.innerHTML=`<b style="color:${target[1]}">${target[0]}</b>をキャッチ`;const basket=document.createElement('div');basket.className='colorBasket';basket.style.color=target[1];stage.append(label,basket);const r=stage.getBoundingClientRect();basket.style.left=(r.width/2-46)+'px';let got=0,lastSpawn=0,spawnIndex=0;const items=[];
    function move(cx){const rr=stage.getBoundingClientRect();basket.style.left=clamp(cx-rr.left-46,2,rr.width-94)+'px'}listen(stage,'pointerdown',e=>move(e.clientX));listen(stage,'pointermove',e=>{if(e.buttons||e.pointerType==='touch')move(e.clientX)});
    function spawn(){const data=spawnIndex++%3===0?target:pick(colors),el=document.createElement('div');el.className='colorDrop';el.style.background=data[1];const o={el,data,x:rand(8,r.width-52),y:-50,v:180+state.speed*20};setStylePos(el,o.x,o.y);stage.appendChild(el);items.push(o)}spawn();
    gameLoop((now,dt)=>{if(now-lastSpawn>Math.max(430,770-state.speed*35)){spawn();lastSpawn=now}const br=basket.getBoundingClientRect();for(let i=items.length-1;i>=0;i--){const o=items[i];o.y+=o.v*dt;o.el.style.top=o.y+'px';if(rectsOverlap(o.el.getBoundingClientRect(),br,3)){const ok=o.data[0]===target[0];o.el.remove();items.splice(i,1);gameSfx('action');if(!ok){resolveRound(false);return}got++;if(got>=count){resolveRound(true);return}}else if(o.y>r.height+55){o.el.remove();items.splice(i,1)}}});
  }
  function setupMath(a,op,b,ans){
    const w=document.createElement('div');w.className='mathWrap';const expr=document.createElement('div');expr.className='mathExpr';expr.textContent=`${a} ${op} ${b}`;const answers=document.createElement('div');answers.className='mathAnswers';let opts=new Set([ans]);while(opts.size<4)opts.add(Math.max(0,ans+randInt(-5,5)));shuffle([...opts]).forEach(n=>{const bt=document.createElement('button');bt.type='button';bt.className='mathBtn';bt.textContent=n;answers.appendChild(bt);listen(bt,'pointerdown',e=>{e.preventDefault();gameSfx('action');resolveRound(n===ans)})});w.append(expr,answers);stage.appendChild(w);
  }
  function setupMemory(seq){
    const label=document.createElement('div');label.className='memoryLabel';label.textContent='WATCH...';const grid=document.createElement('div');grid.className='memoryGrid';const pads=[];for(let i=0;i<4;i++){const b=document.createElement('button');b.type='button';b.className='memoryPad';grid.appendChild(b);pads.push(b)}stage.append(label,grid);let phase=0,idx=0,preview=true,input=0;const on=.28,off=.16;
    gameLoop((_,dt)=>{if(!preview)return;phase+=dt;const limit=(idx%2===0?on:off);if(phase<limit)return;phase=0;if(idx%2===0){pads[seq[idx/2]].classList.remove('on')}idx++;if(idx>=seq.length*2){preview=false;label.textContent='YOUR TURN!';return}if(idx%2===0)pads[seq[idx/2]].classList.add('on')});pads[seq[0]].classList.add('on');
    pads.forEach((p,i)=>listen(p,'pointerdown',e=>{e.preventDefault();if(preview){gameSfx('action');resolveRound(false);return}gameSfx('action');p.classList.add('on');setTimeout(()=>p.classList.remove('on'),100);if(i!==seq[input]){resolveRound(false);return}input++;if(input>=seq.length)resolveRound(true)}));return{duration:regularDuration()+900};
  }
  function setupStroop(word,ink,colors){
    const w=document.createElement('div');w.className='stroopWrap';const txt=document.createElement('div');txt.className='stroopWord';txt.textContent=word[0];txt.style.color=ink[1];const answers=document.createElement('div');answers.className='stroopAnswers';shuffle(colors).forEach(c=>{const b=document.createElement('button');b.type='button';b.className='stroopBtn';b.textContent=c[0];b.style.color=c[1];answers.appendChild(b);listen(b,'pointerdown',e=>{e.preventDefault();gameSfx('action');resolveRound(c[0]===ink[0])})});w.append(txt,answers);stage.appendChild(w);
  }
  function setupTrace(count){
    const r=stage.getBoundingClientRect(),margin=48,pts=[];const anchors=[[.16,.25],[.78,.22],[.24,.5],[.76,.58],[.5,.8]];shuffle(anchors).slice(0,count).forEach((a,i)=>pts.push({x:clamp(r.width*a[0],margin,r.width-margin),y:clamp(r.height*a[1],margin,r.height-margin),i}));
    for(let i=0;i<pts.length-1;i++){const a=pts[i],b=pts[i+1],dx=b.x-a.x,dy=b.y-a.y,l=Math.hypot(dx,dy),line=document.createElement('div');line.className='traceLine';line.style.width=l+'px';line.style.left=a.x+'px';line.style.top=a.y+'px';line.style.transform=`rotate(${Math.atan2(dy,dx)}rad)`;stage.appendChild(line)}
    const dots=pts.map((p,i)=>{const d=document.createElement('div');d.className='traceDot';d.textContent=i+1;setStylePos(d,p.x-28,p.y-28);stage.appendChild(d);return d});const finger=document.createElement('div');finger.className='traceFinger';stage.appendChild(finger);let active=false,next=0;
    function local(e){const rr=stage.getBoundingClientRect();return{x:e.clientX-rr.left,y:e.clientY-rr.top}}function near(p,q){return Math.hypot(p.x-q.x,p.y-q.y)<40}
    listen(stage,'pointerdown',e=>{const p=local(e);if(!near(p,pts[0]))return;active=true;next=1;dots[0].classList.add('done');finger.style.display='block';setStylePos(finger,p.x-17,p.y-17);safeCapture(stage,e);gameSfx('action')});listen(stage,'pointermove',e=>{if(!active)return;const p=local(e);setStylePos(finger,p.x-17,p.y-17);if(next<pts.length&&near(p,pts[next])){dots[next].classList.add('done');gameSfx('action');next++;if(next>=pts.length){active=false;safeReleaseCapture(stage,e);resolveRound(true)}}});listen(stage,'pointerup',e=>{if(!active)return;active=false;safeReleaseCapture(stage,e);finger.style.display='none';if(next<pts.length)resolveRound(false)});listen(stage,'pointercancel',e=>{active=false;safeReleaseCapture(stage,e)});
  }
  function setupChase(target,count,icons){
    const label=document.createElement('div');label.className='chaseLabel';label.innerHTML=`TARGET <span class="chaseTarget">${target}</span>`;stage.appendChild(label);const r=stage.getBoundingClientRect(),items=[];for(let i=0;i<count;i++){const el=document.createElement('button');el.type='button';el.className='chaseOrb';const icon=i===0?target:pick(icons.filter(x=>x!==target));el.textContent=icon;const o={el,ok:i===0,x:rand(5,r.width-71),y:rand(80,r.height-75),vx:rand(70,135)*(Math.random()<.5?-1:1),vy:rand(60,125)*(Math.random()<.5?-1:1)};setStylePos(el,o.x,o.y);stage.appendChild(el);items.push(o);listen(el,'pointerdown',e=>{e.preventDefault();gameSfx('action');resolveRound(o.ok)})}gameLoop((_,dt)=>{for(const o of items){o.x+=o.vx*dt;o.y+=o.vy*dt;if(o.x<2||o.x>r.width-68){o.vx*=-1;o.x=clamp(o.x,2,r.width-68)}if(o.y<65||o.y>r.height-68){o.vy*=-1;o.y=clamp(o.y,65,r.height-68)}setStylePos(o.el,o.x,o.y)}});
  }

  function setupTrain(dir,doorLeft){
    const scene=document.createElement('div'); scene.className='trainScene';
    const car=document.createElement('div'); car.className='trainCar';
    car.innerHTML='<div class="trainWindow a"></div><div class="trainWindow b"></div>';
    const door=document.createElement('div'); door.className='trainDoor'; door.style.left=doorLeft+'%'; car.appendChild(door);
    const runner=document.createElement('div'); runner.className='trainRunner';
    runner.style.setProperty('--runner-flip',dir>0?'1':'-1');
    runner.innerHTML=`<svg class="trainRunnerSprite" viewBox="0 0 13 17" aria-hidden="true"><rect x="5" y="1" width="4" height="4" fill="#ffd2a1"/><rect x="4" y="5" width="6" height="5" fill="#39e7ff"/><rect x="2" y="6" width="3" height="2" fill="#ffd2a1"/><rect x="9" y="6" width="3" height="2" fill="#ffd2a1"/><rect x="4" y="10" width="3" height="5" fill="#4d67d8"/><rect x="8" y="10" width="3" height="4" fill="#4d67d8"/><rect x="2" y="14" width="5" height="2" fill="#172032"/><rect x="9" y="13" width="4" height="2" fill="#172032"/><rect x="8" y="2" width="2" height="1" fill="#172032"/></svg>`;
    const fx=document.createElement('div');fx.className='trainBoardFx';
    scene.setAttribute('role','button');
    scene.setAttribute('tabindex','0');
    scene.setAttribute('aria-label','電車に飛び乗る。ピコがドアの前に来た瞬間にタップ');
    scene.append(car,runner,fx); stage.appendChild(scene);
    const r=scene.getBoundingClientRect();
    let x=dir>0?-54:r.width+12, v=(155+state.speed*18)*dir, boarding=false;
    gameLoop((_,dt)=>{
      if(boarding)return;
      x+=v*dt;
      if(dir>0&&x>r.width+20)x=-55;
      if(dir<0&&x<-55)x=r.width+20;
      runner.style.left=x+'px';
    });
    function attemptTrainBoard(){
      if(boarding||state.paused||state.resolving)return;
      gameSfx('action');
      const a=runner.getBoundingClientRect(),d=door.getBoundingClientRect(),sr=scene.getBoundingClientRect();
      const cx=a.left+a.width/2;
      const success=cx>=d.left&&cx<=d.right;
      if(!success){
        scene.classList.remove('shake');
        void scene.offsetWidth;
        scene.classList.add('shake');
        setTimeout(()=>scene.classList.remove('shake'),260);
        resolveRound(false);
        return;
      }
      boarding=true;
      const runnerCenterX=a.left+a.width/2-sr.left;
      const runnerCenterY=a.top+a.height/2-sr.top;
      const targetX=d.left+d.width/2-sr.left;
      const targetY=d.top+d.height*.52-sr.top;
      runner.style.setProperty('--board-x',(targetX-runnerCenterX)+'px');
      runner.style.setProperty('--board-y',(targetY-runnerCenterY)+'px');
      fx.style.left=(targetX-37)+'px';
      fx.style.top=(targetY-37)+'px';
      requestAnimationFrame(()=>{
        runner.classList.add('boarding');
        fx.classList.add('show');
      });
      vibrate(25);
      const boardRoundToken=state.roundToken,boardRunToken=state.runToken;
      activeDelay(620,boardRunToken).then(active=>{
        if(active&&boardRoundToken===state.roundToken&&!state.resolving)resolveRound(true);
      });
    }
    // シーン全体で入力を受ける。走っているピコ自身をタップしても親へ届く。
    listen(scene,'pointerdown',e=>{
      e.preventDefault();
      attemptTrainBoard();
    });
    listen(scene,'keydown',e=>{
      if(e.key!=='Enter'&&e.key!==' ')return;
      e.preventDefault();
      markInteraction();
      attemptTrainBoard();
    });
  }

  function setupAlarm(labels){
    const wrap=document.createElement('div'); wrap.className='alarmWrap';
    const clock=document.createElement('div'); clock.className='alarmClock ringing'; clock.textContent='⏰';
    const buttons=document.createElement('div'); buttons.className='alarmBtns';
    labels.forEach(label=>{ const b=document.createElement('button'); b.type='button'; b.className='alarmBtn'+(label==='STOP'?' stop':''); b.textContent=label; listen(b,'pointerdown',e=>{e.preventDefault();gameSfx('action');resolveRound(label==='STOP')}); buttons.appendChild(b); });
    wrap.append(clock,buttons); stage.appendChild(wrap);
  }

  function setupToast(from){
    const scene=document.createElement('div'); scene.className='toastScene';
    const toaster=document.createElement('div'); toaster.className='toaster';
    const toast=document.createElement('div'); toast.className='toastPiece'; toast.textContent='🍞';
    const plate=document.createElement('div'); plate.className='toastPlate';
    scene.append(toaster,toast,plate); stage.appendChild(scene);
    const r=scene.getBoundingClientRect(); let px=r.width/2-58, active=false, ox=0;
    if(from==='left') px=24; else if(from==='right') px=r.width-140; plate.style.left=px+'px';
    let x=r.width/2-34+rand(-18,18), y=98, vy=-270-state.speed*8, gravity=460;
    setStylePos(toast,x,y);
    listen(plate,'pointerdown',e=>{e.preventDefault();active=true;safeCapture(plate,e);const pr=plate.getBoundingClientRect();ox=e.clientX-pr.left});
    listen(plate,'pointermove',e=>{if(!active)return;const sr=scene.getBoundingClientRect();px=clamp(e.clientX-sr.left-ox,0,sr.width-116);plate.style.left=px+'px'});
    const end=e=>{if(!active)return;active=false;safeReleaseCapture(plate,e)};listen(plate,'pointerup',end);listen(plate,'pointercancel',end);
    gameLoop((_,dt)=>{ vy+=gravity*dt; y+=vy*dt; x+=Math.sin(y*.025)*18*dt; setStylePos(toast,x,y); const tr=toast.getBoundingClientRect(),pr=plate.getBoundingClientRect(); if(vy>0&&rectsOverlap(tr,pr,8)){gameSfx('action');resolveRound(true);return;} if(y>r.height+30)resolveRound(false); });
  }

  function setupUmbrella(xPct){
    const scene=document.createElement('div'); scene.className='umbrellaScene';
    const hint=document.createElement('div'); hint.className='umbrellaHint'; hint.textContent='☔ RAIN!';
    const umb=document.createElement('div'); umb.className='umbrellaClosed'; umb.innerHTML='<div class="canopy"></div><div class="shaft"></div><div class="handle"></div>'; umb.style.left=`calc(${xPct}% - 110px)`;
    scene.append(hint,umb); stage.appendChild(scene);
    const r=scene.getBoundingClientRect(); for(let i=0;i<18;i++){const d=document.createElement('div');d.className='rainDrop';setStylePos(d,rand(0,r.width),rand(-30,r.height));scene.appendChild(d);let y=parseFloat(d.style.top),v=210+rand(0,160);gameLoop((_,dt)=>{y+=v*dt;if(y>r.height)y=-35;d.style.top=y+'px'})}
    let sy=0,tracking=false;
    listen(umb,'pointerdown',e=>{e.preventDefault();tracking=true;sy=e.clientY;safeCapture(umb,e)});
    listen(umb,'pointerup',e=>{if(!tracking)return;tracking=false;safeReleaseCapture(umb,e);const dy=e.clientY-sy;if(dy<-42){umb.classList.add('open');gameSfx('action');setTimeout(()=>{if(state.running&&!state.resolving)resolveRound(true)},120)}else if(Math.abs(dy)>20)resolveRound(false)});
    listen(umb,'pointercancel',e=>{tracking=false;safeReleaseCapture(umb,e)});
  }

  function setupDog(axis){
    const scene=document.createElement('div'); scene.className='dogScene';
    const help=document.createElement('div');help.className='dogHelp';help.textContent='LEASH → 🐶';
    const dog=document.createElement('div');dog.className='dogPet';dog.textContent='🐶';
    const loopEl=document.createElement('div');loopEl.className='leashLoop';scene.append(help,dog,loopEl);stage.appendChild(scene);
    const r=scene.getBoundingClientRect();let t=rand(0,6),lx=r.width/2-44,ly=r.height-145,drag=false,ox=0,oy=0;setStylePos(loopEl,lx,ly);
    gameLoop((_,dt)=>{t+=dt*(1.8+state.speed*.11);let x,y;if(axis==='x'){x=(Math.sin(t)*.5+.5)*(r.width-92)+5;y=r.height*.28+Math.sin(t*1.7)*46}else{x=r.width*.5-41+Math.sin(t*1.4)*70;y=(Math.sin(t)*.5+.5)*(r.height-180)+62}setStylePos(dog,x,y)});
    listen(loopEl,'pointerdown',e=>{e.preventDefault();drag=true;safeCapture(loopEl,e);const rr=loopEl.getBoundingClientRect();ox=e.clientX-rr.left;oy=e.clientY-rr.top});
    listen(loopEl,'pointermove',e=>{if(!drag)return;const sr=scene.getBoundingClientRect();lx=clamp(e.clientX-sr.left-ox,0,sr.width-88);ly=clamp(e.clientY-sr.top-oy,40,sr.height-110);setStylePos(loopEl,lx,ly)});
    const end=e=>{if(!drag)return;drag=false;safeReleaseCapture(loopEl,e);gameSfx('action');if(rectsOverlap(loopEl.getBoundingClientRect(),dog.getBoundingClientRect(),16))resolveRound(true)};listen(loopEl,'pointerup',end);listen(loopEl,'pointercancel',end);
  }

  function setupRamen(low,high){
    const scene=document.createElement('div');scene.className='ramenScene';
    const pot=document.createElement('div');pot.className='ramenPot';const fill=document.createElement('div');fill.className='ramenFill';const safe=document.createElement('div');safe.className='ramenSafe';safe.style.bottom=low+'%';safe.style.height=(high-low)+'%';const noodles=document.createElement('div');noodles.className='ramenNoodles';noodles.textContent='🍜';pot.append(fill,safe,noodles);
    const btn=document.createElement('button');btn.type='button';btn.className='ramenStop';btn.textContent='STOP!';scene.append(pot,btn);stage.appendChild(scene);
    let pct=0,v=19+state.speed*1.8;gameLoop((_,dt)=>{pct+=v*dt;fill.style.height=Math.min(104,pct)+'%';if(pct>102)resolveRound(false)});
    listen(btn,'pointerdown',e=>{e.preventDefault();gameSfx('action');resolveRound(pct>=low&&pct<=high)});
  }

  function setupElevator(labels){
    const wrap=document.createElement('div');wrap.className='elevatorWrap';const disp=document.createElement('div');disp.className='elevatorDisplay';disp.textContent=pick(['12','7','B1','18']);const panel=document.createElement('div');panel.className='elevatorPanel';
    labels.forEach(label=>{const b=document.createElement('button');b.type='button';b.className='elevatorBtn'+(label==='閉'?' close':'');b.textContent=label;listen(b,'pointerdown',e=>{e.preventDefault();gameSfx('action');resolveRound(label==='閉')});panel.appendChild(b)});wrap.append(disp,panel);stage.appendChild(wrap);
  }

  function setupToilet(side){
    const scene=document.createElement('div');scene.className='toiletScene';const wall=document.createElement('div');wall.className='tpWall';const help=document.createElement('div');help.className='tpHelp';help.textContent='🧻 → HOLDER';const holder=document.createElement('div');holder.className='tpHolder';const roll=document.createElement('div');roll.className='tpRoll';scene.append(wall,help,holder,roll);stage.appendChild(scene);
    const r=scene.getBoundingClientRect();const holderX=side==='left'?24:r.width-162, rollX=side==='left'?r.width-116:24;setStylePos(holder,holderX,r.height*.38);setStylePos(roll,rollX,r.height*.61);let active=false,ox=0,oy=0;
    listen(roll,'pointerdown',e=>{e.preventDefault();active=true;safeCapture(roll,e);const rr=roll.getBoundingClientRect();ox=e.clientX-rr.left;oy=e.clientY-rr.top});
    listen(roll,'pointermove',e=>{if(!active)return;const sr=scene.getBoundingClientRect();setStylePos(roll,clamp(e.clientX-sr.left-ox,0,sr.width-92),clamp(e.clientY-sr.top-oy,30,sr.height-92))});
    const end=e=>{if(!active)return;active=false;safeReleaseCapture(roll,e);gameSfx('action');if(rectsOverlap(roll.getBoundingClientRect(),holder.getBoundingClientRect(),18))resolveRound(true)};listen(roll,'pointerup',end);listen(roll,'pointercancel',end);
  }

  function setupBossStars(need){
    const title=document.createElement('div');title.className='bossTitle';title.textContent=`★ ×${need} COLLECT / AVOID`;const countEl=document.createElement('div');countEl.className='bossCount';countEl.textContent=`0 / ${need}`;const p=document.createElement('div');p.className='bossPlayer';stage.append(title,countEl,p);const r=stage.getBoundingClientRect();p.style.left=(r.width/2-29)+'px';const hazards=[],gems=[];let collected=0,lastHaz=0,lastGem=0;
    function movePlayer(cx){const rr=stage.getBoundingClientRect();p.style.left=clamp(cx-rr.left-29,3,rr.width-61)+'px'}listen(stage,'pointerdown',e=>movePlayer(e.clientX));listen(stage,'pointermove',e=>{if(e.buttons||e.pointerType==='touch')movePlayer(e.clientX)});
    function spawnHaz(){const el=document.createElement('div');el.className='bossHazard';const o={el,x:rand(3,r.width-55),y:-90,v:225+state.speed*20};setStylePos(el,o.x,o.y);stage.appendChild(el);hazards.push(o)}function spawnGem(){const el=document.createElement('div');el.className='bossGem';el.textContent='★';const o={el,x:rand(8,r.width-50),y:-55,v:160+state.speed*13};setStylePos(el,o.x,o.y);stage.appendChild(el);gems.push(o)}
    gameLoop((now,dt)=>{if(now-lastHaz>Math.max(350,700-state.speed*38-state.level*25)){spawnHaz();lastHaz=now}if(now-lastGem>Math.max(720,1120-state.level*85)){spawnGem();lastGem=now}const pr=p.getBoundingClientRect();for(let i=hazards.length-1;i>=0;i--){const o=hazards[i];o.y+=o.v*dt;o.el.style.top=o.y+'px';if(rectsOverlap(o.el.getBoundingClientRect(),pr,6)){resolveRound(false);return}if(o.y>r.height+90){o.el.remove();hazards.splice(i,1)}}for(let i=gems.length-1;i>=0;i--){const o=gems[i];o.y+=o.v*dt;o.el.style.top=o.y+'px';if(rectsOverlap(o.el.getBoundingClientRect(),pr,4)){collected++;gameSfx('action');countEl.textContent=`${collected} / ${need}`;o.el.remove();gems.splice(i,1);if(collected>=need){resolveRound(true);return}}else if(o.y>r.height+60){o.el.remove();gems.splice(i,1)}}});
  }


  function setupBossTargets(need){
    const title=document.createElement('div');title.className='bossTitle';title.textContent='CORE TARGETS / AVOID BOMBS';
    const countEl=document.createElement('div');countEl.className='bossCount';countEl.textContent=`0 / ${need}`;
    stage.append(title,countEl);
    const r=stage.getBoundingClientRect();
    const objects=[];
    let hit=0,lastTarget=0,lastBomb=0;

    function spawn(kind){
      const el=document.createElement('button');
      el.type='button';
      el.className=kind==='target'?'bossTarget':'bossBomb';
      if(kind==='bomb') el.textContent='💣';
      const size=kind==='target'?74:70;
      const o={
        el,kind,x:rand(6,Math.max(7,r.width-size-6)),y:rand(110,Math.max(120,r.height-size-20)),
        vx:rand(-90,90),vy:rand(-75,75),born:performance.now()
      };
      if(Math.abs(o.vx)<30)o.vx=o.vx<0?-55:55;
      if(Math.abs(o.vy)<24)o.vy=o.vy<0?-45:45;
      setStylePos(el,o.x,o.y);
      stage.appendChild(el);
      objects.push(o);
      listen(el,'pointerdown',e=>{
        e.preventDefault();
        if(state.resolving) return;
        gameSfx('action');
        if(kind==='bomb'){ resolveRound(false); return; }
        hit++;
        countEl.textContent=`${hit} / ${need}`;
        const idx=objects.indexOf(o); if(idx>=0)objects.splice(idx,1);
        el.remove();
        if(hit>=need) resolveRound(true);
      });
    }

    gameLoop((now,dt)=>{
      if(now-lastTarget>Math.max(420,730-state.level*55-state.speed*22)){spawn('target');lastTarget=now}
      if(now-lastBomb>Math.max(980,1550-state.level*95)){spawn('bomb');lastBomb=now}
      for(let i=objects.length-1;i>=0;i--){
        const o=objects[i], size=o.kind==='target'?74:70;
        o.x+=o.vx*dt;o.y+=o.vy*dt;
        if(o.x<4||o.x>r.width-size-4){o.vx*=-1;o.x=clamp(o.x,4,r.width-size-4)}
        if(o.y<105||o.y>r.height-size-12){o.vy*=-1;o.y=clamp(o.y,105,r.height-size-12)}
        setStylePos(o.el,o.x,o.y);
        if(now-o.born>3200){
          o.el.remove();objects.splice(i,1);
        }
      }
    });
    return {duration:Math.max(7800,bossDuration()+1200)};
  }

  function setupBossLasers(){
    const title=document.createElement('div');title.className='bossTitle';title.textContent='SURVIVE THE LASER GRID';
    const countEl=document.createElement('div');countEl.className='bossCount';countEl.textContent='SURVIVE!';
    const p=document.createElement('div');p.className='bossLaserPlayer';
    stage.append(title,countEl,p);
    const r=stage.getBoundingClientRect();
    let px=r.width/2-27,py=r.height*.68,drag=false,ox=0,oy=0,lastLaser=0;
    const lasers=[];
    setStylePos(p,px,py);

    listen(p,'pointerdown',e=>{e.preventDefault();drag=true;safeCapture(p,e);const rr=p.getBoundingClientRect();ox=e.clientX-rr.left;oy=e.clientY-rr.top});
    listen(stage,'pointermove',e=>{
      if(!drag)return;
      const sr=stage.getBoundingClientRect();
      px=clamp(e.clientX-sr.left-ox,3,sr.width-57);
      py=clamp(e.clientY-sr.top-oy,100,sr.height-57);
      setStylePos(p,px,py);
    });
    const end=e=>{drag=false;safeReleaseCapture(p,e)};
    listen(p,'pointerup',end);listen(p,'pointercancel',end);

    function spawnLaser(now){
      const vertical=Math.random()<.5;
      const el=document.createElement('div');
      el.className='bossLaser warning '+(vertical?'vertical':'horizontal');
      const pos=vertical?rand(18,r.width-42):rand(115,r.height-42);
      if(vertical)el.style.left=pos+'px';else el.style.top=pos+'px';
      stage.appendChild(el);
      lasers.push({el,vertical,pos,born:now,active:false});
    }

    gameLoop((now)=>{
      if(now-lastLaser>Math.max(720,1220-state.level*85-state.speed*25)){spawnLaser(now);lastLaser=now}
      const pr=p.getBoundingClientRect();
      for(let i=lasers.length-1;i>=0;i--){
        const o=lasers[i],age=now-o.born;
        if(age>480&&!o.active){o.active=true;o.el.classList.remove('warning');o.el.classList.add('active');gameSfx('action')}
        if(o.active&&age<960&&rectsOverlap(o.el.getBoundingClientRect(),pr,4)){resolveRound(false);return}
        if(age>1050){o.el.remove();lasers.splice(i,1)}
      }
    });
    return {timeoutSuccess:true,duration:Math.max(7200,bossDuration())};
  }

  function setupBossMemory(){
    const wrap=document.createElement('div');wrap.className='bossMemoryWrap';
    const status=document.createElement('div');status.className='bossMemoryStatus';status.textContent='WATCH...';
    const grid=document.createElement('div');grid.className='bossMemoryGrid';
    const pads=[];
    for(let i=0;i<4;i++){
      const b=document.createElement('button');b.type='button';b.className='bossMemoryPad';b.dataset.i=String(i);
      grid.appendChild(b);pads.push(b);
    }
    wrap.append(status,grid);stage.appendChild(wrap);

    const ownerRound=state.roundToken;
    let accepting=false,seq=[],idx=0,wave=0,dead=false;
    onCleanup(()=>{dead=true});

    async function flashSequence(){
      accepting=false;idx=0;
      status.textContent=`STAGE ${wave}/2  WATCH...`;
      await activeDelay(360);
      for(const n of seq){
        if(dead||state.roundToken!==ownerRound||state.resolving)return;
        pads[n].classList.add('lit');tone((220+n*72),.14,'triangle',.075,30);
        await activeDelay(Math.max(210,330-state.speed*14));
        pads[n].classList.remove('lit');
        await activeDelay(105);
      }
      if(dead||state.roundToken!==ownerRound||state.resolving)return;
      status.textContent=`STAGE ${wave}/2  YOUR TURN`;
      accepting=true;
    }

    async function beginWave(){
      wave++;
      const len=(wave===1?3:4)+Math.min(2,state.level-1);
      seq=Array.from({length:len},()=>randInt(0,3));
      await flashSequence();
    }

    pads.forEach((b,n)=>listen(b,'pointerdown',e=>{
      e.preventDefault();
      if(!accepting||dead||state.resolving)return;
      gameSfx('action');
      if(n!==seq[idx]){resolveRound(false);return}
      b.classList.add('correct');setTimeout(()=>b.classList.remove('correct'),120);
      idx++;
      if(idx>=seq.length){
        accepting=false;
        if(wave>=2){resolveRound(true)}
        else{
          status.textContent='GOOD! NEXT...';
          (async()=>{if(await activeDelay(430)&&!dead&&!state.resolving)beginWave()})();
        }
      }
    }));
    beginWave();
    return {duration:Math.max(11500,bossDuration()+3000)};
  }

  function setupBossMeteors(need){
    const title=document.createElement('div');title.className='bossTitle';title.textContent='METEOR DEFENSE';
    const countEl=document.createElement('div');countEl.className='bossCount';countEl.textContent=`0 / ${need}`;
    const missesEl=document.createElement('div');missesEl.className='bossMisses';missesEl.textContent='MISS 0 / 3';
    stage.append(title,countEl,missesEl);
    const r=stage.getBoundingClientRect();
    const meteors=[];
    let destroyed=0,misses=0,lastSpawn=0;

    function spawn(){
      const el=document.createElement('button');el.type='button';el.className='bossMeteor';
      const o={el,x:rand(4,r.width-70),y:-72,v:150+state.speed*18+rand(0,70),spin:rand(-180,180)};
      setStylePos(el,o.x,o.y);stage.appendChild(el);meteors.push(o);
      listen(el,'pointerdown',e=>{
        e.preventDefault();
        if(state.resolving)return;
        gameSfx('action');destroyed++;countEl.textContent=`${destroyed} / ${need}`;
        const i=meteors.indexOf(o);if(i>=0)meteors.splice(i,1);
        el.remove();
        if(destroyed>=need)resolveRound(true);
      });
    }

    gameLoop((now,dt)=>{
      if(now-lastSpawn>Math.max(430,820-state.level*60-state.speed*20)){spawn();lastSpawn=now}
      for(let i=meteors.length-1;i>=0;i--){
        const o=meteors[i];o.y+=o.v*dt;o.el.style.top=o.y+'px';o.el.style.transform=`rotate(${o.y*.7}deg)`;
        if(o.y>r.height+15){
          o.el.remove();meteors.splice(i,1);misses++;missesEl.textContent=`MISS ${misses} / 3`;
          if(misses>=3){resolveRound(false);return}
        }
      }
    });
    return {duration:Math.max(8500,bossDuration()+900)};
  }

  // v3.0 sanity: 38 legacy + 62 Pixel City scenarios = 100 normal games.
  console.assert(gameDefs.length===100,`FLASH RUSH game count mismatch: ${gameDefs.length}`);

  $('#startBtn').addEventListener('click',beginRun); $('#retryBtn').addEventListener('click',beginRun); $('#soundBtnStart').addEventListener('click',toggleSound); $('#portalBtnStart').addEventListener('click',()=>location.href='../');
  $('#pauseBtn').addEventListener('click',()=>setPaused(true)); $('#resumeBtn').addEventListener('click',()=>setPaused(false)); $('#abortBtn').addEventListener('click',abortRun); updateSoundButtons();
  startPixelSpriteObserver();
  document.documentElement.dataset.flashRushReady='true';
  document.addEventListener('visibilitychange',()=>{ if(document.hidden&&state.running&&!state.paused)setPaused(true); });
})();
