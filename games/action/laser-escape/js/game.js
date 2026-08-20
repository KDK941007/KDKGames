(() => {
  'use strict';

  const BUILD = '1.17.2';
  const LEVEL_SECONDS = 30;
  const SCORE_PER_SECOND = 100;
  const STORAGE_RANKING = 'laser_escape_ranking_v1';
  const STORAGE_NAME = 'laser_escape_last_name_v1';
    const {
    now: mgPortalNow,
    newPlayerId: mgPortalNewId,
    defaultSave: mgPortalDefaultSave,
    load: mgPortalLoad,
    save: mgPortalSave,
    profile: mgPortalProfile,
    recordValue: mgPortalRecordValue,
    setRecord: mgPortalSetRecord,
    recordPlay: mgPortalRecordPlay
  } = globalThis.MiniGamePortalPlayerStore;

  const $ = s => document.querySelector(s);

  const startScreen = $('#startScreen');
  const gameScreen = $('#gameScreen');
  const playerTypeInput = $('#playerTypeInput');
  const nameInput = $('#playerNameInput');
  const nameError = $('#nameError');
  const rankingList = $('#rankingList');

  const arenaFrame = $('#arenaFrame');
  const arena = $('#arena');
  const pilot = $('#pilot');
  const attackLabel = $('#attackLabel');
  const hitFlashLayer = $('#hitFlashLayer');
  const hitText = $('#hitText');

  const hudName = $('#hudName');
  const hudLevel = $('#hudLevel');
  const hudScore = $('#hudScore');
  const hudLives = $('#hudLives');
  const hudTime = $('#hudTime');

  const levelOverlay = $('#levelOverlay');
  const levelBig = $('#levelBig');
  const levelSmall = $('#levelSmall');
  const pauseOverlay = $('#pauseOverlay');
  const gameOverOverlay = $('#gameOverOverlay');

  const finalScore = $('#finalScore');
  const finalLevel = $('#finalLevel');
  const finalTime = $('#finalTime');
  const finalName = $('#finalName');
  const newRank = $('#newRank');

  const state = {
    running:false,
    paused:false,
    transitioning:false,
    gameOver:false,
    playerName:'',
    playerType:'user',
    level:1,
    levelElapsed:0,
    totalSurvival:0,
    score:0,
    maxHp:3,
    hp:3,
    invulnerableUntil:0,
    lastTs:0,
    spawnAccumulator:0,
    raf:0,
    drag:false,
    dragOffsetX:0,
    dragOffsetY:0,
    lasers:new Set(),
    timers:new Set(),
    sequence:null,
    audioCtx:null,
    bgmTimer:0,
    bgmStep:0,
    warningGroup:null,
    shotGroupSeq:0,
    runToken:0
  };

  function safeJsonParse(text, fallback){
    try{return JSON.parse(text)}catch(_){return fallback}
  }

  function ensureAudio(){
    try{
      if(!state.audioCtx){
        const AC = window.AudioContext || window.webkitAudioContext;
        if(AC) state.audioCtx = new AC();
      }

      const ctx = state.audioCtx;
      if(!ctx) return null;

      if(ctx.state === 'suspended'){
        ctx.resume().catch(()=>{});
      }

      // iOS向けのユーザー操作内アンロック音。ほぼ無音だがAudioContextを確実に開始させる。
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      gain.gain.value = .00001;
      osc.frequency.value = 220;
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + .02);

      return ctx;
    }catch(_){
      return null;
    }
  }

  function playTone(freq, duration=.12, volume=.05, type='square', when=0){
    const ctx = state.audioCtx;
    if(!ctx || ctx.state === 'closed') return;

    const now = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(30,freq),now);
    gain.gain.setValueAtTime(.0001,now);
    gain.gain.exponentialRampToValueAtTime(Math.max(.0002,volume),now+.008);
    gain.gain.exponentialRampToValueAtTime(.0001,now+duration);

    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now+duration+.02);
  }

  function hitSfx(){
    const ctx = ensureAudio();
    if(!ctx) return;
    const now = ctx.currentTime;

    // 大きめの電撃下降音
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(1450, now);
    osc.frequency.exponentialRampToValueAtTime(70, now + .55);
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1900,now);
    filter.frequency.exponentialRampToValueAtTime(380,now+.5);
    filter.Q.value = 1.1;
    gain.gain.setValueAtTime(.0001, now);
    gain.gain.exponentialRampToValueAtTime(.42, now + .012);
    gain.gain.exponentialRampToValueAtTime(.0001, now + .62);
    osc.connect(filter).connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + .65);

    // 衝撃低音
    const bass = ctx.createOscillator();
    const bassGain = ctx.createGain();
    bass.type = 'square';
    bass.frequency.setValueAtTime(150, now);
    bass.frequency.exponentialRampToValueAtTime(38, now + .34);
    bassGain.gain.setValueAtTime(.34, now);
    bassGain.gain.exponentialRampToValueAtTime(.0001, now + .42);
    bass.connect(bassGain).connect(ctx.destination);
    bass.start(now);
    bass.stop(now + .44);

    // 焼けるノイズ
    const length = Math.max(1, Math.floor(ctx.sampleRate * .46));
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for(let i=0;i<length;i++){
      const env = 1 - i/length;
      data[i] = (Math.random()*2-1) * env;
    }
    const noise = ctx.createBufferSource();
    const noiseGain = ctx.createGain();
    const hp = ctx.createBiquadFilter();
    noise.buffer = buffer;
    hp.type = 'highpass';
    hp.frequency.value = 850;
    noiseGain.gain.setValueAtTime(.27, now);
    noiseGain.gain.exponentialRampToValueAtTime(.0001, now + .48);
    noise.connect(hp).connect(noiseGain).connect(ctx.destination);
    noise.start(now);

    // 二段目のビープで「被弾」を明確化
    playTone(760,.12,.15,'square',.16);
    playTone(380,.18,.14,'square',.28);
  }

  function countdownSfx(number){
    ensureAudio();
    if(number>0){
      const base = number===1 ? 620 : 520;
      playTone(base,.13,.12,'square');
      playTone(base*2,.08,.035,'sine',.015);
    }else{
      playTone(784,.12,.13,'square');
      playTone(1046.5,.22,.12,'square',.10);
      playTone(1568,.20,.055,'sine',.20);
    }
  }

  function clearSfx(){
    const ctx = ensureAudio();
    if(!ctx) return;

    // 明るい上昇アルペジオ＋最後の長い決定音。
    const notes = [
      [392,.00,.14,.11],
      [523.25,.12,.14,.12],
      [659.25,.24,.15,.13],
      [783.99,.36,.16,.14],
      [1046.5,.50,.38,.16]
    ];

    for(const [freq,when,dur,vol] of notes){
      playTone(freq,dur,vol,'square',when);
      playTone(freq*2,dur*.72,vol*.38,'triangle',when+.015);
    }

    // SFらしい高音のキラッとした余韻
    playTone(1318.5,.20,.07,'sine',.63);
    playTone(1568,.25,.055,'sine',.75);
  }

  function laserSfx(orientation){
    const ctx = ensureAudio();
    if(!ctx) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();

    osc.type = 'sawtooth';
    const startFreq = orientation === 'v' ? 880 : 720;
    osc.frequency.setValueAtTime(startFreq, now);
    osc.frequency.exponentialRampToValueAtTime(180, now + .18);

    filter.type = 'highpass';
    filter.frequency.value = 420;

    gain.gain.setValueAtTime(.0001,now);
    gain.gain.exponentialRampToValueAtTime(.095,now+.006);
    gain.gain.exponentialRampToValueAtTime(.0001,now+.2);

    osc.connect(filter).connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now+.22);

    // 「ジュッ」という短いノイズ
    const len = Math.max(1,Math.floor(ctx.sampleRate*.08));
    const buffer = ctx.createBuffer(1,len,ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for(let i=0;i<len;i++) data[i]=(Math.random()*2-1)*(1-i/len);
    const noise=ctx.createBufferSource();
    const ng=ctx.createGain();
    noise.buffer=buffer;
    ng.gain.setValueAtTime(.055,now);
    ng.gain.exponentialRampToValueAtTime(.0001,now+.085);
    noise.connect(ng).connect(ctx.destination);
    noise.start(now);
  }

  function bgmNote(step){
    const ctx = state.audioCtx;
    if(!ctx || ctx.state !== 'running') return;

    // SF感を出すため、低いパルス＋浮遊するアルペジオ。
    const scale = [0,3,5,7,10,12,15,17];
    const root = 73.42; // D2
    const note = scale[step % scale.length];
    const freq = root * Math.pow(2,note/12);

    if(step % 2 === 0){
      playTone(freq*2,.14,.026,'square');
    }else{
      playTone(freq*4,.11,.018,'triangle');
    }

    if(step % 4 === 0){
      playTone(root,.32,.038,'sawtooth');
      playTone(root/2,.28,.018,'triangle');
    }

    // 1小節ごとの短いレーダー音
    if(step % 16 === 12){
      playTone(660,.08,.022,'sine');
      playTone(990,.11,.016,'sine',.06);
    }
  }

  function startBgm(){
    ensureAudio();
    stopBgm();
    state.bgmStep = 0;

    const tick = () => {
      if(
        state.running &&
        !state.paused &&
        !state.gameOver &&
        !state.transitioning
      ){
        bgmNote(state.bgmStep++);
      }
    };

    tick();
    state.bgmTimer = window.setInterval(tick,155);
  }

  function stopBgm(){
    if(state.bgmTimer){
      clearInterval(state.bgmTimer);
      state.bgmTimer = 0;
    }
  }

  function loadRanking(){
    const rows = safeJsonParse(localStorage.getItem(STORAGE_RANKING), []);
    return Array.isArray(rows) ? rows.slice(0,3) : [];
  }

  function saveRanking(rows){
    localStorage.setItem(STORAGE_RANKING, JSON.stringify(rows.slice(0,3)));
  }

  function renderRanking(){
    const rows = loadRanking();
    rankingList.innerHTML = '';

    for(let i=0;i<3;i++){
      const row = rows[i];
      const el = document.createElement('div');
      el.className = 'rankRow';
      if(row){
        el.innerHTML =
          `<span class="rankNo">${i+1}.</span>` +
          `<span class="rankName"></span>` +
          `<span class="rankScore">${String(row.score).padStart(6,'0')}</span>`;
        el.querySelector('.rankName').textContent = row.name;
      }else{
        el.innerHTML =
          `<span class="rankNo">${i+1}.</span>` +
          `<span class="rankName">---</span>` +
          `<span class="rankScore">------</span>`;
      }
      rankingList.appendChild(el);
    }
  }

  function addRanking(name, score, level){
    const rows = loadRanking();
    const entry = {
      id:`${Date.now()}-${Math.random().toString(36).slice(2,8)}`,
      name,score,level,t:Date.now()
    };
    rows.push(entry);
    rows.sort((a,b)=>b.score-a.score || a.t-b.t);
    const index = rows.findIndex(r => r.id===entry.id);
    saveRanking(rows);
    return index >= 0 && index < 3 ? index + 1 : null;
  }

  function multiplier(level){
    return 1 + (level - 1) * 0.5;
  }

  function formatScore(score){
    return String(Math.floor(score)).padStart(6,'0');
  }

  function showScreen(which){
    startScreen.classList.toggle('active', which==='start');
    gameScreen.classList.toggle('active', which==='game');
  }

  function setTimer(fn, ms){
    const token = state.runToken;
    const id = setTimeout(() => {
      state.timers.delete(id);
      if(token !== state.runToken) return;
      fn();
    }, ms);
    state.timers.add(id);
    return id;
  }

  function clearTimers(){
    state.timers.forEach(clearTimeout);
    state.timers.clear();
  }

  function clearLasers(){
    state.lasers.forEach(obj => {
      obj.warning?.remove();
      obj.beam?.remove();
      obj.cannon?.remove();
    });
    state.lasers.clear();
    state.warningGroup = null;
    arena.querySelectorAll('.warning,.laser,.cannon').forEach(el=>el.remove());
  }

  function resetPilot(){
    requestAnimationFrame(() => {
      const r = arena.getBoundingClientRect();
      pilot.style.left = (r.width/2) + 'px';
      pilot.style.top = (r.height*0.72) + 'px';
    });
  }

  function updateHud(){
    hudName.textContent = state.playerName;
    hudLevel.textContent = `LEVEL ${state.level}`;
    hudScore.textContent = formatScore(state.score);
    hudLives.innerHTML = Array.from({length:state.maxHp},(_,i)=>
      `<span class="lifeHeart${i<state.hp?'':' off'}"></span>`
    ).join('');
    hudLives.classList.toggle('danger',state.hp===1);
    hudLives.setAttribute('aria-label',`残り体力 ${state.hp}`);
    hudTime.textContent = Math.max(0, LEVEL_SECONDS - state.levelElapsed).toFixed(1);
  }

  function warningDuration(){
    const progress = Math.min(1, state.levelElapsed / LEVEL_SECONDS);
    const levelCut = Math.min(260, (state.level - 1) * 22);
    // v1.12: 警告線を少し早めに表示。攻撃密度は変えず、反応猶予だけを増やす。
    return Math.max(420, 1040 - progress * 330 - levelCut);
  }

  function beamDuration(){
    const progress = Math.min(1, state.levelElapsed / LEVEL_SECONDS);
    return Math.max(260, 560 - progress * 140 - Math.min(90,(state.level-1)*8));
  }

  function spawnInterval(){
    const progress = Math.min(1, state.levelElapsed / LEVEL_SECONDS);
    const levelCut = Math.min(360, (state.level - 1) * 30);
    return Math.max(700, 1750 - progress * 420 - levelCut);
  }

  function randomInt(min,max){
    return Math.floor(Math.random()*(max-min+1))+min;
  }

  function createCannon(orientation, pos){
    const c = document.createElement('div');
    c.className = 'cannon';
    const r = arena.getBoundingClientRect();

    if(orientation==='v'){
      c.style.left = `calc(${pos}% - 13px)`;
      c.style.top = '2px';
    }else{
      c.style.left = '2px';
      c.style.top = `calc(${pos}% - 13px)`;
    }
    arena.appendChild(c);
    return c;
  }

  function createLaser(orientation, pos, delay, group, warningMs=null){
    const obj = {
      orientation,
      pos,
      group,
      warningMs,
      phase:'delay',
      remaining:delay/1000,
      warning:null,
      beam:null,
      cannon:null,
      active:false,
      dead:false
    };
    state.lasers.add(obj);
    return obj;
  }

  function showWarning(obj){
    if(obj.dead) return;
    const warning = document.createElement('div');
    warning.className = `warning ${obj.orientation}`;
    if(obj.orientation==='v') warning.style.left = obj.pos + '%';
    else warning.style.top = obj.pos + '%';

    obj.warning = warning;
    obj.cannon = createCannon(obj.orientation,obj.pos);
    obj.phase = 'warning';
    obj.remaining = (obj.warningMs ?? warningDuration())/1000;
    arena.appendChild(warning);
  }

  function releaseWarningGroupIfFinished(group){
    if(state.warningGroup !== group) return;
    const stillPending = [...state.lasers].some(x =>
      !x.dead &&
      x.group === group &&
      (x.phase === 'warning' || x.phase === 'beamWait')
    );
    if(!stillPending) state.warningGroup = null;
  }

  function showBeam(obj){
    if(obj.dead) return;

    // LEVEL number is the hard cap for lasers that are actually firing simultaneously.
    if(activeBeamCount() >= Math.max(1,state.level)){
      obj.phase = 'beamWait';
      obj.remaining = .045;
      return;
    }

    obj.warning?.remove();
    obj.warning = null;

    const beam = document.createElement('div');
    beam.className = `laser ${obj.orientation}`;
    if(obj.orientation==='v') beam.style.left = obj.pos + '%';
    else beam.style.top = obj.pos + '%';

    obj.beam = beam;
    obj.active = true;
    obj.phase = 'beam';
    obj.remaining = beamDuration()/1000;
    arena.appendChild(beam);
    laserSfx(obj.orientation);
    releaseWarningGroupIfFinished(obj.group);
  }

  function updateLasers(dt){
    for(const obj of [...state.lasers]){
      if(obj.dead) continue;

      obj.remaining -= dt;
      if(obj.remaining > 0) continue;

      if(obj.phase==='delay' || obj.phase==='warningWait'){
        if(state.warningGroup === null || state.warningGroup === obj.group){
          state.warningGroup = obj.group;
          showWarning(obj);
        }else{
          // 先の攻撃は予約だけ保持し、警告線はまだ出さない。
          obj.phase = 'warningWait';
          obj.remaining = .03;
        }
      }else if(obj.phase==='warning' || obj.phase==='beamWait'){
        showBeam(obj);
      }else if(obj.phase==='beam'){
        cleanupLaser(obj);
      }
    }
  }

  function cleanupLaser(obj){
    if(!obj || obj.dead) return;
    obj.dead = true;
    obj.active = false;
    obj.warning?.remove();
    obj.beam?.remove();
    obj.cannon?.remove();
    state.lasers.delete(obj);
  }

  function activeBeamCount(){
    let n = 0;
    for(const obj of state.lasers){
      if(obj.active && !obj.dead) n++;
    }
    return n;
  }

  function chooseVolleyCount(level){
    const roll = Math.random();
    if(roll < 0.60) return randomInt(1, Math.min(level,3));
    if(roll < 0.90) return randomInt(1, Math.max(1,Math.ceil(level/2)));
    return randomInt(1, level);
  }

  function nextShotGroup(){
    return ++state.shotGroupSeq;
  }

  function edgeShotChance(){
    // LEVEL1では控えめ。高LEVELほどわずかに増えるが、端攻撃ばかりにはしない。
    return Math.min(.20,.14 + Math.max(0,state.level-1)*.012);
  }

  function randomShotPos(min=11,max=89,allowEdge=true){
    if(allowEdge && Math.random() < edgeShotChance()){
      // 角待ち対策。端そのものではなく、プレイヤーが避ける余地を残した端付近を狙う。
      return Math.random() < .5 ? randomInt(2,6) : randomInt(94,98);
    }
    return randomInt(min,max);
  }

  function makeShot(orientation,pos,delay=0,group=null,warningMs=null){
    createLaser(
      orientation,
      Math.max(2,Math.min(98,pos)),
      delay,
      group ?? nextShotGroup(),
      warningMs
    );
  }

  function flashAttackLabel(text){
    attackLabel.textContent = text;
    attackLabel.classList.remove('show');
    void attackLabel.offsetWidth;
    attackLabel.classList.add('show');
  }

  function spawnSimultaneous(){
    const count = chooseVolleyCount(Math.max(1,state.level));
    const chosenV = [], chosenH = [];
    const group = nextShotGroup();

    for(let i=0;i<count;i++){
      const orientation = Math.random() < .5 ? 'v' : 'h';
      const list = orientation==='v' ? chosenV : chosenH;
      let pos = randomShotPos(8,92,true), tries=0;
      while(list.some(v=>Math.abs(v-pos)<8) && tries++<12) pos=randomShotPos(8,92,true);
      list.push(pos);
      makeShot(orientation,pos,0,group);
    }
  }

  function rapidWarningMs(first=false){
    if(first) return Math.max(580, warningDuration() * .78);
    const progress = Math.min(1,state.levelElapsed/LEVEL_SECONDS);
    // 連続攻撃の警告をさらに早め、攻撃密度は変えずに反応猶予を増やす。
    return Math.max(320, 470 - state.level*8 - progress*55);
  }

  function spawnBurst(){
    // 基本となる連続射撃。LEVEL1でも5〜8発を連続して撃つ。
    const waves = Math.min(12, randomInt(5,8) + Math.floor((state.level-1)/2));
    const scheduleGap = Math.max(55, 115 - state.level*3);
    let delay = 0;
    flashAttackLabel('RAPID CHAIN');

    for(let w=0;w<waves;w++){
      const orientation = Math.random() < .5 ? 'v' : 'h';

      // LEVEL1は必ず1本。LEVEL2以降は、ときどき複数本の波を混ぜる。
      let count = 1;
      if(state.level>=2 && Math.random()<Math.min(.48,.18+state.level*.035)){
        count = randomInt(2,Math.min(state.level,3));
      }

      const base = randomShotPos(13,87,true);
      const group = nextShotGroup();
      const warn = rapidWarningMs(w===0);

      for(let i=0;i<count;i++){
        const spread = count===1 ? 0 : (i-(count-1)/2)*18;
        makeShot(orientation,base+spread,delay,group,warn);
      }

      // 予約自体は短間隔。実照射はwarningGroupと同時照射上限で安全に直列化される。
      delay += scheduleGap;
    }
  }

  function spawnAlternating(){
    const waves = Math.min(12, randomInt(6,9) + Math.floor(state.level/3));
    const scheduleGap = Math.max(55,105-state.level*3);
    let delay = 0;
    flashAttackLabel('V / H RAPID');

    for(let w=0;w<waves;w++){
      const orientation = w%2===0 ? 'v' : 'h';
      const group = nextShotGroup();
      const warn = rapidWarningMs(w===0);
      makeShot(orientation,randomShotPos(11,89,true),delay,group,warn);

      if(state.level>=3 && Math.random()<.28){
        const pos2=randomShotPos(11,89,true);
        makeShot(orientation,pos2,delay,group,warn);
      }
      delay += scheduleGap;
    }
  }

  function spawnSweep(){
    // 画面の端から端まで埋めるスイープは禁止。
    // 必ず片側に十分な退避スペースを残す「部分スイープ」にする。
    const count = Math.min(8, randomInt(5,7)+Math.floor(state.level/5));
    const vertical = Math.random()<.5;
    const reverse = Math.random()<.5;

    // スイープ幅は画面全体の28〜42%まで。
    // どのパターンでも最低28%以上の広い安全地帯が反対側に残る。
    const sweepWidth = randomInt(28,42);
    const startMin = 10;
    const startMax = 90 - sweepWidth;
    let start = randomInt(startMin,startMax);
    let end = start + sweepWidth;

    if(reverse){
      [start,end] = [end,start];
    }

    const scheduleGap = Math.max(65,115-state.level*2);
    flashAttackLabel(vertical ? 'V-SWEEP ZONE' : 'H-SWEEP ZONE');

    for(let i=0;i<count;i++){
      const t = count<=1 ? 0 : i/(count-1);
      const pos = start + (end-start)*t;

      makeShot(
        vertical?'v':'h',
        pos,
        i*scheduleGap,
        nextShotGroup(),
        rapidWarningMs(i===0)
      );
    }
  }

  function spawnCrossfire(){
    const waves = Math.min(10, randomInt(4,7)+Math.floor(state.level/3));
    const scheduleGap = Math.max(70,130-state.level*3);
    let delay = 0;
    flashAttackLabel('CROSS CHAIN');

    for(let w=0;w<waves;w++){
      makeShot(
        'v',
        randomShotPos(13,87,true),
        delay,
        nextShotGroup(),
        rapidWarningMs(w===0)
      );

      // LEVEL1でも縦→横の連射は行う。ただし同時照射は1本のまま。
      makeShot(
        'h',
        randomShotPos(13,87,true),
        delay + Math.floor(scheduleGap*.55),
        nextShotGroup(),
        rapidWarningMs(false)
      );
      delay += scheduleGap;
    }
  }

  function spawnAttackPattern(){
    if(!state.running || state.paused || state.transitioning || state.gameOver) return;

    const r = Math.random();

    // v1.12: 一部の通常/連続攻撃は低確率で端付近にも飛ぶ。
    // 連続攻撃は全体の70%。
    // 残り30%は通常の同時斉射として、攻撃に緩急を付ける。
    if(r < .31) return spawnBurst();        // 31%
    if(r < .49) return spawnAlternating();  // 18%
    if(r < .61) return spawnSweep();        // 12%
    if(r < .70) return spawnCrossfire();    //  9%
    spawnSimultaneous();                    // 30%
  }

  function rectsOverlap(a,b){
    return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
  }

  function collisionCheck(){
    if(state.paused || state.transitioning || state.gameOver) return;
    if(performance.now() < state.invulnerableUntil) return;
    const pr = pilot.getBoundingClientRect();

    for(const obj of state.lasers){
      if(!obj.active || !obj.beam) continue;
      const br = obj.beam.getBoundingClientRect();

      // Slight forgiveness on player collision box.
      const inset = 5;
      const p = {
        left:pr.left+inset,right:pr.right-inset,
        top:pr.top+inset,bottom:pr.bottom-inset
      };

      if(rectsOverlap(p,br)){
        hitPlayer();
        return;
      }
    }
  }

  function spawnHitParticles(){
    const ar = arena.getBoundingClientRect();
    const pr = pilot.getBoundingClientRect();
    const cx = pr.left + pr.width/2 - ar.left;
    const cy = pr.top + pr.height/2 - ar.top;
    const parts = 30;

    for(let i=0;i<parts;i++){
      const p = document.createElement('i');
      p.className = 'hitBurst';
      p.style.left = (cx-4) + 'px';
      p.style.top = (cy-4) + 'px';
      p.style.background = i%3===0 ? '#ffd84a' : (i%2===0 ? '#ffffff' : '#ff3f6a');
      arena.appendChild(p);

      const a = (Math.PI*2*i/parts) + (Math.random()-.5)*.25;
      const dist = 42 + Math.random()*82;
      const dx = Math.cos(a)*dist;
      const dy = Math.sin(a)*dist;
      p.animate(
        [
          {transform:'translate(0,0) scale(1)',opacity:1},
          {transform:`translate(${dx}px,${dy}px) scale(.55)`,opacity:0}
        ],
        {duration:720+Math.random()*360,easing:'steps(8,end)'}
      ).onfinish = ()=>p.remove();
    }
  }

  function hitPlayer(){
    if(state.gameOver) return;
    if(performance.now() < state.invulnerableUntil) return;

    state.hp = Math.max(0,state.hp-1);
    state.drag = false;
    updateHud();

    ensureAudio();
    hitSfx();

    pilot.classList.remove('hit','invulnerable');
    arenaFrame.classList.remove('hitShake');
    pilot.classList.remove('hit','invulnerable');
    hitText.textContent='LASER HIT!';
    hitFlashLayer.classList.remove('show');
    hitText.classList.remove('show');

    hitText.textContent = state.hp>0 ? `DAMAGE!  HP ${state.hp}` : 'LASER HIT!';

    void arenaFrame.offsetWidth;
    pilot.classList.add('hit');
    arenaFrame.classList.add('hitShake');
    hitFlashLayer.classList.add('show');
    hitText.classList.add('show');
    spawnHitParticles();

    if(state.hp<=0){
      // 3回目の被弾で従来どおりGAME OVER。
      state.gameOver = true;
      stopBgm();

      // 最後に当たったレーザーを短時間残して原因を確認できるようにする。
      setTimer(() => clearLasers(), 720);

      setTimer(() => {
        pilot.classList.remove('hit','invulnerable');
        arenaFrame.classList.remove('hitShake');
        hitFlashLayer.classList.remove('show');
        hitText.classList.remove('show');
        endGame(true);
      }, 1350);
      return;
    }

    // 残りHPがある場合は短時間無敵。
    // 同じレーザーや重なったレーザーでHPが一瞬で連続減少するのを防ぐ。
    state.invulnerableUntil = performance.now() + 1100;

    // 被弾した攻撃パターンはいったん消し、次の攻撃まで立て直す猶予を作る。
    setTimer(() => {
      clearLasers();
      state.spawnAccumulator = 0;
    }, 240);

    setTimer(() => {
      pilot.classList.remove('hit');
      arenaFrame.classList.remove('hitShake');
      hitFlashLayer.classList.remove('show');
      hitText.classList.remove('show');
      pilot.classList.add('invulnerable');
    }, 430);

    setTimer(() => {
      pilot.classList.remove('invulnerable');
      if(!state.gameOver){
        hitText.textContent='LASER HIT!';
      }
    }, 1120);
  }

  function frame(ts){
    if(!state.running) return;

    if(!state.lastTs) state.lastTs = ts;
    let dt = Math.min(0.05, (ts - state.lastTs)/1000);
    state.lastTs = ts;

    if(!state.paused && !state.transitioning && !state.gameOver){
      state.levelElapsed += dt;
      state.totalSurvival += dt;
      state.score += dt * SCORE_PER_SECOND * multiplier(state.level);
      state.spawnAccumulator += dt * 1000;

      if(state.spawnAccumulator >= spawnInterval()){
        state.spawnAccumulator = 0;
        spawnAttackPattern();
      }

      updateLasers(dt);
      collisionCheck();
      updateHud();

      if(state.levelElapsed >= LEVEL_SECONDS){
        levelClear();
      }
    }

    state.raf = requestAnimationFrame(frame);
  }

  function spawnClearParticles(){
    const overlayRect = levelOverlay.getBoundingClientRect();
    const cx = overlayRect.width/2;
    const cy = overlayRect.height/2;
    const colors = ['#59f39a','#38e8ff','#ffd84a','#ffffff'];
    const parts = 34;

    for(let i=0;i<parts;i++){
      const p = document.createElement('i');
      p.className = 'clearBurst';
      p.style.left = (cx-4) + 'px';
      p.style.top = (cy-4) + 'px';
      p.style.background = colors[i % colors.length];
      levelOverlay.appendChild(p);

      const angle = (Math.PI*2*i/parts) + (Math.random()-.5)*.22;
      const dist = 70 + Math.random()*150;
      const dx = Math.cos(angle)*dist;
      const dy = Math.sin(angle)*dist;

      p.animate(
        [
          {transform:'translate(0,0) scale(1)',opacity:1},
          {transform:`translate(${dx*.45}px,${dy*.45}px) scale(1.25)`,opacity:1,offset:.38},
          {transform:`translate(${dx}px,${dy}px) scale(.55)`,opacity:0}
        ],
        {duration:900+Math.random()*450,easing:'steps(9,end)'}
      ).onfinish = ()=>p.remove();
    }
  }

  async function showLevelClear(level){
    levelBig.textContent = `LEVEL ${level} CLEAR!`;
    levelSmall.textContent = `SCORE ${formatScore(state.score)}`;
    levelOverlay.classList.remove('countdownMode');
    levelOverlay.classList.add('clearMode','show');

    // アニメーションを毎回確実に再スタートさせる。
    void levelOverlay.offsetWidth;
    clearSfx();
    spawnClearParticles();

    await new Promise(resolve => setTimer(resolve, 1600));

    levelOverlay.classList.remove('show','clearMode','countdownMode');
    levelBig.classList.remove('countPulse','countGo');
    levelOverlay.querySelectorAll('.clearBurst').forEach(el=>el.remove());
  }

  async function waitMs(ms){
    await new Promise(resolve => setTimer(resolve,ms));
  }

  function pulseCountdownText(text,go=false){
    levelBig.classList.remove('countPulse','countGo');
    levelBig.textContent = text;
    if(go) levelBig.classList.add('countGo');
    void levelBig.offsetWidth;
    levelBig.classList.add('countPulse');
  }

  async function showLevelIntro(level){
    levelOverlay.classList.remove('clearMode');
    levelOverlay.classList.add('countdownMode','show');

    levelSmall.textContent = `LEVEL ${level} / READY`;
    pulseCountdownText(`LEVEL ${level}`,true);
    playTone(330,.16,.06,'triangle');
    await waitMs(700);

    for(const n of [3,2,1]){
      if(!state.running || state.gameOver) return;
      levelSmall.textContent = `LEVEL ${level} START`;
      pulseCountdownText(String(n),false);
      countdownSfx(n);
      await waitMs(720);
    }

    if(!state.running || state.gameOver) return;
    levelSmall.textContent = 'DODGE!';
    pulseCountdownText('START!',true);
    countdownSfx(0);
    await waitMs(650);

    levelOverlay.classList.remove('show','countdownMode');
    levelBig.classList.remove('countPulse','countGo');
  }

  async function showLevelMessage(big, small, ms){
    levelOverlay.classList.remove('clearMode','countdownMode');
    levelBig.classList.remove('countPulse','countGo');
    levelBig.textContent = big;
    levelSmall.textContent = small;
    levelOverlay.classList.add('show');
    await new Promise(resolve => setTimer(resolve, ms));
    levelOverlay.classList.remove('show');
  }

  function startLevel(level, first=false){
    state.level = level;
    state.levelElapsed = 0;
    state.spawnAccumulator = 0;
    state.transitioning = true;
    clearLasers();
    resetPilot();
    updateHud();

    showLevelIntro(level)
      .then(() => {
        if(!state.running || state.gameOver) return;
        state.transitioning = false;
        state.lastTs = performance.now();

        // 開始直後から連続攻撃が体感できるよう少し早めに最初のパターンを出す。
        state.spawnAccumulator = Math.max(0,spawnInterval()-520);
      });
  }

  function levelClear(){
    if(state.transitioning || state.gameOver) return;
    state.transitioning = true;
    clearLasers();

    showLevelClear(state.level)
      .then(() => {
        if(!state.running || state.gameOver) return;
        startLevel(state.level + 1, false);
      });
  }

  function beginRun(){
    const playerType = playerTypeInput.value === 'guest' ? 'guest' : 'user';
    const profile = mgPortalProfile();
    const name = playerType === 'user' ? profile.displayName : nameInput.value.trim();

    if(!name){
      nameError.textContent = 'ゲスト名を入力してください';
      nameInput.focus();
      return;
    }

    nameError.textContent = '';
    if(playerType==='guest')localStorage.setItem(STORAGE_NAME, name);

    state.runToken++;
    clearTimers();
    cancelAnimationFrame(state.raf);
    clearLasers();

    Object.assign(state,{
      running:true,
      paused:false,
      transitioning:false,
      gameOver:false,
      playerName:name,
      playerType,
      level:1,
      levelElapsed:0,
      totalSurvival:0,
      score:0,
      maxHp:3,
      hp:3,
      invulnerableUntil:0,
      lastTs:0,
      spawnAccumulator:0,
      drag:false,
      warningGroup:null,
      shotGroupSeq:0
    });

    pauseOverlay.classList.remove('show');
    gameOverOverlay.classList.remove('show');
    newRank.classList.remove('show');
    arenaFrame.classList.remove('hitShake');
    hitFlashLayer.classList.remove('show');
    hitText.classList.remove('show');
    levelOverlay.classList.remove('show','clearMode');
    levelOverlay.querySelectorAll('.clearBurst').forEach(el=>el.remove());
    arena.querySelectorAll('.hitBurst').forEach(el=>el.remove());

    showScreen('game');
    resetPilot();
    updateHud();
    startLevel(1,true);
    startBgm();
    state.raf = requestAnimationFrame(frame);
  }

  function pauseGame(){
    if(!state.running || state.paused || state.transitioning || state.gameOver) return;
    state.paused = true;
    pauseOverlay.classList.add('show');
  }

  function resumeGame(){
    if(!state.running || !state.paused || state.gameOver) return;
    state.paused = false;
    state.lastTs = performance.now();
    pauseOverlay.classList.remove('show');
  }

  function quitToTop(){
    if(state.running && !state.gameOver){
      if(!confirm('プレイを中断してトップ画面に戻りますか？')) return;
    }
    state.runToken++;
    state.running = false;
    state.paused = false;
    state.gameOver = false;
    clearTimers();
    cancelAnimationFrame(state.raf);
    clearLasers();
    stopBgm();
    pauseOverlay.classList.remove('show');
    gameOverOverlay.classList.remove('show');
    renderRanking();
    showScreen('start');
  }

  function endGame(fromHit=false){
    if(state.gameOver && !fromHit) return;

    state.gameOver = true;
    state.paused = false;
    clearLasers();
    stopBgm();

    const score = Math.floor(state.score);
    if(state.playerType==='user'){
      mgPortalRecordPlay('laser-escape','LASER ESCAPE',game=>{
        mgPortalSetRecord(game,'bestScore','BEST SCORE',Math.max(mgPortalRecordValue(game,'bestScore'),score),'score');
        mgPortalSetRecord(game,'bestLevel','BEST LEVEL',Math.max(mgPortalRecordValue(game,'bestLevel'),state.level),'level');
      });
    }
    const rank = addRanking(state.playerName, score, state.level);

    finalScore.textContent = formatScore(score);
    finalLevel.textContent = state.level;
    finalTime.textContent = `${state.totalSurvival.toFixed(1)}s`;
    finalName.textContent = state.playerName;
    newRank.textContent = rank ? `RANK IN!  ${rank}位` : '';
    newRank.classList.toggle('show', !!rank);

    renderRanking();
    setTimer(() => gameOverOverlay.classList.add('show'), 350);
  }

  // Drag control
  function eventPoint(e){
    const t = e.touches?.[0] || e.changedTouches?.[0] || e;
    return {x:t.clientX,y:t.clientY};
  }

  function startDrag(e){
    if(!state.running || state.paused || state.transitioning || state.gameOver) return;
    e.preventDefault();
    const p = eventPoint(e);
    const pr = pilot.getBoundingClientRect();
    state.drag = true;
    state.dragOffsetX = p.x - (pr.left + pr.width/2);
    state.dragOffsetY = p.y - (pr.top + pr.height/2);
    if(e.pointerId!=null){
      try{arena.setPointerCapture(e.pointerId)}catch(_){}
    }
  }

  function moveDrag(e){
    if(!state.drag || state.paused || state.transitioning || state.gameOver) return;
    e.preventDefault();

    const p = eventPoint(e);
    const ar = arena.getBoundingClientRect();
    const half = 17;
    const x = Math.max(half+8, Math.min(ar.width-half-8, p.x-ar.left-state.dragOffsetX));
    const y = Math.max(half+8, Math.min(ar.height-half-8, p.y-ar.top-state.dragOffsetY));

    pilot.style.left = x + 'px';
    pilot.style.top = y + 'px';
    collisionCheck();
  }

  function endDrag(e){
    state.drag = false;
    if(e?.pointerId!=null){
      try{arena.releasePointerCapture(e.pointerId)}catch(_){}
    }
  }

  if(window.PointerEvent){
    arena.addEventListener('pointerdown', e => {
      if(e.target.closest('#pilot')) startDrag(e);
    }, {passive:false});
    arena.addEventListener('pointermove', moveDrag, {passive:false});
    arena.addEventListener('pointerup', endDrag);
    arena.addEventListener('pointercancel', endDrag);
  }else{
    arena.addEventListener('touchstart', e => {
      if(e.target.closest('#pilot')) startDrag(e);
    }, {passive:false});
    arena.addEventListener('touchmove', moveDrag, {passive:false});
    arena.addEventListener('touchend', endDrag);
    arena.addEventListener('touchcancel', endDrag);
  }

  $('#startBtn').addEventListener('click', () => { ensureAudio(); beginRun(); });
  $('#pauseBtn').addEventListener('click', pauseGame);
  $('#resumeBtn').addEventListener('click', resumeGame);
  $('#quitBtn').addEventListener('click', quitToTop);
  $('#topBtn').addEventListener('click', quitToTop);
  $('#retryBtn').addEventListener('click', () => { ensureAudio(); beginRun(); });

  nameInput.addEventListener('input', () => {
    if(nameInput.value.trim()) nameError.textContent = '';
  });
  nameInput.addEventListener('keydown', e => {
    if(e.key==='Enter') beginRun();
  });

  document.addEventListener('visibilitychange', () => {
    if(document.hidden && state.running && !state.paused && !state.gameOver && !state.transitioning){
      pauseGame();
    }
  });

  function syncPlayerTypeUi(){
    const user=playerTypeInput.value!=='guest';
    const profile=mgPortalProfile();
    document.querySelectorAll('[data-player-type]').forEach(btn=>{
      const active=(btn.dataset.playerType==='user')===user;
      btn.classList.toggle('active',active);
      btn.setAttribute('aria-pressed',active?'true':'false');
    });
    nameInput.readOnly=user;
    nameInput.classList.toggle('portalUserLocked',user);
    if(user){
      nameInput.value=profile.displayName;
    }else{
      nameInput.value=localStorage.getItem(STORAGE_NAME)||'';
    }
    nameError.textContent='';
  }
  const playerTypeButtons=[...document.querySelectorAll('[data-player-type]')];
  playerTypeButtons.forEach(btn=>btn.addEventListener('click',()=>{
    playerTypeInput.value=btn.dataset.playerType==='guest'?'guest':'user';
    syncPlayerTypeUi();
  }));
  window.addEventListener('pageshow', syncPlayerTypeUi);
  syncPlayerTypeUi();
  renderRanking();
  document.documentElement.dataset.laserEscapeReady = 'true';
  document.documentElement.dataset.build = BUILD;
})();
