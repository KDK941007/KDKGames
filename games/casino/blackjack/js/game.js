const BUILD='14.47-portal-player';
const $=id=>document.getElementById(id), fmt=n=>'₩'+Math.round(n).toLocaleString('ko-KR'), sleep=ms=>new Promise(r=>setTimeout(r,ms));
function chipAmountLabel(amount,prefix=''){
  const n=Math.max(0,Math.round(amount));
  let body='';
  if(n>=100000000){
    const v=n/100000000;
    body=(Number.isInteger(v)?v:v.toFixed(1).replace(/\.0$/,''))+'億';
  }else if(n>=10000){
    const v=n/10000;
    body=(Number.isInteger(v)?v:v.toFixed(1).replace(/\.0$/,''))+'万';
  }else if(n>=1000){
    const v=n/1000;
    body=(Number.isInteger(v)?v:v.toFixed(1).replace(/\.0$/,''))+'千';
  }else{
    body=String(n);
  }
  return prefix+body;
}
const suits=['♠','♥','♦','♣'],ranks=['A','2','3','4','5','6','7','8','9','10','J','Q','K'];
const AUDIO_BGM_KEY='blackjack_bgm_volume_v1';
const AUDIO_SFX_KEY='blackjack_sfx_volume_v1';
const PORTAL_SAVE_KEY='mini_game_portal_save_v1';
function mgPortalNow(){return new Date().toISOString()}
function mgPortalNewId(){
  try{if(globalThis.crypto?.randomUUID)return globalThis.crypto.randomUUID()}catch(_){ }
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
  if(!data.games||typeof data.games!=='object')data.games={};
  if(!data.backup||typeof data.backup!=='object')data.backup={lastExportedAt:null,lastImportedAt:null};
  try{localStorage.setItem(PORTAL_SAVE_KEY,JSON.stringify(data))}catch(_){ }
  return data;
}
function mgPortalSave(data){
  if(!data?.player)return;
  data.player.updatedAt=mgPortalNow();
  data.overall.playedGames=Object.values(data.games||{}).filter(g=>(Number(g?.plays)||0)>0).length;
  try{localStorage.setItem(PORTAL_SAVE_KEY,JSON.stringify(data))}catch(_){ }
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
function clamp01(v){return Math.max(0,Math.min(1,Number(v)||0))}
function loadAudioVolume(key){
  try{
    const raw=localStorage.getItem(key);
    return raw===null?1:clamp01(Number(raw));
  }catch(e){return 1}
}
function saveAudioVolume(key,value){
  try{localStorage.setItem(key,String(clamp01(value)))}catch(e){}
}
let mode='krw', cfg={}, players=[], deck=[], dealer=[], activePlayer=0, activeHand=0, phase='setup', currentBet=0, reveal=false, insuranceIndex=0, insuranceMode='insurance', evenMoneyContext=null, evenMoneyResolve=null, animating=false, roundNo=0, settlingPlayer=-1, blackjackAnnouncePlayer=-1, lastActionPlayer=0, testDeal={dealer:[null,null],players:[]};let cardSeq=0,seenCards=new Set(),audioCtx=null,bgmOn=false,bgmTimer=null,bgmMode='lounge',bgmSession=0,bgmMaster=null,sfxMaster=null,bgmVolume=loadAudioVolume(AUDIO_BGM_KEY),sfxVolume=loadAudioVolume(AUDIO_SFX_KEY),bgmWasPlayingBeforeHide=false,bgmResumeMode=null,audioRestoreBusy=false,cutCardRemaining=0,cutCardSeen=false,shuffleAfterRound=false,shoeNo=0,hintMode='basic',hiLoRunning=0,hiLoCountedIds=new Set(),dealtCardMap=new Map(),cpuSerial=0,cpuTurnPending=false,roundHistory=[],lastRecordedRound=0,statsMode='players';
let dealingDealerActive=false;
function buildBankInputs(){
  const n=+$('playerCount').value,root=$('playerBanks');
  const old=[...root.querySelectorAll('.playerBankRow')].map(row=>({
    name:row.querySelector('.playerNameInput')?.value||'',
    bank:row.querySelector('.bankInput')?.value||'',
    type:row.querySelector('.playerTypeSelect')?.value||'guest',
    level:row.querySelector('.cpuLevelSelect')?.value||'advanced'
  }));
  const profile=mgPortalProfile();
  root.innerHTML='';
  for(let i=0;i<n;i++){
    const prev=old[i]||{};
    // 既存初期配置を維持：PLAYER 1 = USER / PLAYER 2以降 = CPU。
    // GUESTは人間操作だが、ポータルプロフィール戦績には反映しない。
    const type=prev.type||(i===0?'user':'cpu');
    const row=document.createElement('div');
    row.className='playerBankRow';
    row.innerHTML=`
      <div class="playerTypeRow">
        <label>参加タイプ
          <select class="playerTypeSelect" data-seat="${i}">
            <option value="user"${type==='user'?' selected':''}>USER</option>
            <option value="guest"${type==='guest'?' selected':''}>GUEST</option>
            <option value="cpu"${type==='cpu'?' selected':''}>CPU</option>
          </select>
        </label>
        <div class="cpuLevelWrap ${type==='cpu'?'':'hidden'}">
          <label>CPUレベル
            <select class="cpuLevelSelect">
              <option value="basic"${prev.level==='basic'?' selected':''}>BASIC</option>
              <option value="advanced"${(!prev.level||prev.level==='advanced')?' selected':''}>ADVANCED</option>
              <option value="expert"${prev.level==='expert'?' selected':''}>EXPERT</option>
            </select>
          </label>
        </div>
      </div>
      <div class="playerBankMain">
        <div class="nameWrap"><label>名前</label><input class="playerNameInput${type==='user'?' portalUserLocked':''}" type="text" maxlength="10" value="${type==='user'?profile.displayName:(prev.name||`${type==='cpu'?'CPU':'GUEST'} ${i+1}`)}" placeholder="${type==='guest'?'GUEST':type==='cpu'?'CPU':'PLAYER'} ${i+1}"${type==='user'?' readonly':''}></div>
        <div class="bankWrap"><label>${mode==='krw'?'開始チップ（KRW）':'予算（JPY）'}</label><input class="bankInput" type="number" inputmode="numeric" min="1000" step="1000" value="${prev.bank||300000}"><div class="bankCalc"></div></div>
      </div>
      <div class="portalUserNote ${type==='user'?'':'hidden'}">PORTAL PLAYER：${profile.displayName}</div>
      <div class="cpuModeHelp ${type==='cpu'?'':'hidden'}">${cpuLevelDescription(prev.level||'advanced')}</div>`;
    root.appendChild(row);
  }
  updateBankLabels();
  document.querySelectorAll('.bankInput').forEach(i=>i.addEventListener('input',updateBudgetPreview));
  document.querySelectorAll('.playerTypeSelect').forEach(s=>s.addEventListener('change',handlePlayerTypeChange));
  document.querySelectorAll('.cpuLevelSelect').forEach(s=>s.addEventListener('change',handleCpuLevelChange));
  refreshParticipationRows();
  updateCpuBustModeVisibility();
}
function cpuLevelDescription(level){
  if(level==='basic')return 'BASIC：基本戦略で自動アクション / BETはテーブルMIN固定';
  if(level==='expert')return 'EXPERT：応用＋Hi-Lo上級戦略で自動アクション / BETはTrue Count連動';
  return 'ADVANCED：応用戦略で自動アクション / BETはテーブルMIN固定';
}
function refreshParticipationRows(){
  const profile=mgPortalProfile();
  const selects=[...document.querySelectorAll('.playerTypeSelect')];
  const userIndex=selects.findIndex(s=>s.value==='user');
  selects.forEach((select,i)=>{
    const row=select.closest('.playerBankRow');
    const type=select.value;
    const cpu=type==='cpu',user=type==='user';
    const userOption=select.querySelector('option[value="user"]');
    if(userOption)userOption.disabled=userIndex>=0&&i!==userIndex;
    row.querySelector('.cpuLevelWrap')?.classList.toggle('hidden',!cpu);
    row.querySelector('.cpuModeHelp')?.classList.toggle('hidden',!cpu);
    row.querySelector('.portalUserNote')?.classList.toggle('hidden',!user);
    const name=row.querySelector('.playerNameInput');
    name.readOnly=user;
    name.classList.toggle('portalUserLocked',user);
    if(user){
      name.value=profile.displayName;
      row.querySelector('.portalUserNote').textContent=`PORTAL PLAYER：${profile.displayName}`;
    }
  });
}
function handlePlayerTypeChange(e){
  const row=e.target.closest('.playerBankRow');
  const type=e.target.value;
  const seat=+e.target.dataset.seat;
  // USERは登録プロフィール本人なので、1セッションにつき1席だけ。
  if(type==='user'){
    document.querySelectorAll('.playerTypeSelect').forEach(s=>{
      if(s!==e.target&&s.value==='user')s.value='guest';
    });
  }
  const name=row.querySelector('.playerNameInput');
  if(type==='cpu' && (!name.value.trim()||/^(PLAYER|GUEST) \d+$/i.test(name.value.trim())))name.value=`CPU ${seat+1}`;
  if(type==='guest' && (!name.value.trim()||/^CPU \d+$/i.test(name.value.trim())||name.readOnly))name.value=`GUEST ${seat+1}`;
  refreshParticipationRows();
  updateCpuBustModeVisibility();
}
function handleCpuLevelChange(e){
  const row=e.target.closest('.playerBankRow');
  row.querySelector('.cpuModeHelp').textContent=cpuLevelDescription(e.target.value);
}
function updateCpuBustModeVisibility(){
  const hasCpu=[...document.querySelectorAll('.playerTypeSelect')].some(s=>s.value==='cpu');
  $('cpuBustModeField').classList.toggle('hidden',!hasCpu);
}
function updateBankLabels(){document.querySelectorAll('.bankInput').forEach(i=>{i.placeholder=mode==='krw'?'例：300000':'例：30000'});updateBudgetPreview()}function updateBudgetPreview(){let rate=+$('rate').value||0;document.querySelectorAll('.playerBankRow').forEach(row=>{let i=row.querySelector('.bankInput'),c=row.querySelector('.bankCalc'),v=+i.value||0;c.textContent=mode==='jpy'?`→ 約 ${fmt(Math.floor(v*rate/1000)*1000)} 分のチップ`:`開始チップ ${fmt(v)}`})}
$('playerCount').onchange=()=>{buildBankInputs()};buildBankInputs();

const testRanks=['','A','2','3','4','5','6','7','8','9','10','J','Q','K'];
function testRankOptions(selected=''){
  return testRanks.map(r=>`<option value="${r}"${r===selected?' selected':''}>${r||'通常（ランダム）'}</option>`).join('');
}
function buildTestDealInputs(){
  const count=players.length||+$('playerCount').value;
  $('testDealer1').innerHTML=testRankOptions(testDeal.dealer[0]||'');
  $('testDealer2').innerHTML=testRankOptions(testDeal.dealer[1]||'');
  const root=$('testPlayerCards');
  root.innerHTML='';
  for(let i=0;i<count;i++){
    const vals=testDeal.players[i]||[null,null];
    const group=document.createElement('div');
    group.className='testDealGroup';
    group.innerHTML=`<div class="testDealTitle">PLAYER ${i+1}</div>
      <div class="testCardRow">
        <label>1枚目<select class="testCardSelect testPlayerCard" data-p="${i}" data-c="0">${testRankOptions(vals[0]||'')}</select></label>
        <label>2枚目<select class="testCardSelect testPlayerCard" data-p="${i}" data-c="1">${testRankOptions(vals[1]||'')}</select></label>
      </div>`;
    root.appendChild(group);
  }
}
function captureTestDeal(){
  testDeal.dealer=[
    $('testDealer1').value||null,
    $('testDealer2').value||null
  ];
  const count=+$('playerCount').value;
  testDeal.players=Array.from({length:count},()=>[null,null]);
  document.querySelectorAll('.testPlayerCard').forEach(s=>{
    const p=+s.dataset.p,c=+s.dataset.c;
    testDeal.players[p][c]=s.value||null;
  });
}
function clearTestDeal(){
  testDeal={dealer:[null,null],players:[]};
  buildTestDealInputs();
}

function syncTableMax(){
  const min=Number($('tableMin').value)||0;
  const max=min*100;
  $('tableMax').value=max;
  $('tableMax').setAttribute('value',String(max));
}
$('tableMin').addEventListener('input',syncTableMax);
$('tableMin').addEventListener('change',syncTableMax);
syncTableMax();

$('modeKrw').onclick=()=>setMode('krw');$('modeJpy').onclick=()=>setMode('jpy');
function setMode(m){mode=m;$('modeKrw').classList.toggle('active',m==='krw');$('modeJpy').classList.toggle('active',m==='jpy');$('rateField').classList.toggle('hidden',m!=='jpy');updateBankLabels()}$('rate').addEventListener('input',updateBudgetPreview);
function makeDeck(){let d=[];for(let k=0;k<8;k++)for(const s of suits)for(const r of ranks)d.push({s,r});for(let i=d.length-1;i>0;i--){let j=Math.floor(Math.random()*(i+1));[d[i],d[j]]=[d[j],d[i]]}return d}
function newShoe(){
  deck=makeDeck();
  shoeNo++;
  cutCardSeen=false;
  shuffleAfterRound=false;
  hiLoRunning=0;
  hiLoCountedIds.clear();
  dealtCardMap.clear();
  const penetration=.65+Math.random()*.10;
  cutCardRemaining=Math.max(1,Math.round(deck.length*(1-penetration)));
}
function draw(){
  if(!deck.length)newShoe();
  let c=deck.pop();
  c.id=++cardSeq;
  dealtCardMap.set(c.id,c);
  sfxCard();
  if(!cutCardSeen && deck.length<=cutCardRemaining){
    cutCardSeen=true;
    shuffleAfterRound=true;
    setTimeout(()=>toast('INDICATOR CARD — このゲームがシューの最終ゲーム'),80);
  }
  return c
}

function drawSpecified(rank){
  if(!rank)return draw();
  const idx=deck.findIndex(c=>c.r===rank);
  if(idx<0)return draw();
  const c=deck.splice(idx,1)[0];
  c.id=++cardSeq;
  dealtCardMap.set(c.id,c);
  sfxCard();
  if(!cutCardSeen && deck.length<=cutCardRemaining){
    cutCardSeen=true;
    shuffleAfterRound=true;
    setTimeout(()=>toast('INDICATOR CARD — このゲームがシューの最終ゲーム'),80);
  }
  return c;
}
function value(h){let v=0,a=0;for(const c of h){if(c.r==='A'){v+=11;a++}else if(['J','Q','K'].includes(c.r))v+=10;else v+=+c.r}while(v>21&&a){v-=10;a--}return v}
function natural(h,splitOrigin=false){return !splitOrigin&&h.length===2&&value(h)===21}
function cardHTML(c,back=false){let fresh=!seenCards.has(c.id),cls=fresh?' newCard':'';if(back)return `<div class="playingCard back${cls}" data-card="${c.id}"></div>`;let red=c.s==='♥'||c.s==='♦';return `<div class="playingCard ${red?'red':''}${cls}" data-card="${c.id}"><span>${c.r}${c.s}</span><span class="b">${c.r}${c.s}</span></div>`}
function hiLoCardValue(card){
  if(!card)return 0;
  if(['2','3','4','5','6'].includes(card.r))return 1;
  if(['10','J','Q','K','A'].includes(card.r))return -1;
  return 0;
}
function markSeen(){
  document.querySelectorAll('[data-card]').forEach(el=>{
    const id=+el.dataset.card;
    seenCards.add(id);
    if(!el.classList.contains('back')&&!hiLoCountedIds.has(id)){
      const card=dealtCardMap.get(id);
      if(card){
        hiLoRunning+=hiLoCardValue(card);
        hiLoCountedIds.add(id);
      }
    }
  });
}
function toast(t){let el=$('toast');el.textContent=t;el.classList.add('show');setTimeout(()=>el.classList.remove('show'),850)}
function ensureSfxMaster(ac){
  if(!sfxMaster){
    sfxMaster=ac.createGain();
    sfxMaster.gain.value=sfxVolume;
    sfxMaster.connect(ac.destination);
  }
  return sfxMaster;
}
function getAudio(){
  if(!audioCtx||audioCtx.state==='closed'){
    audioCtx=new (window.AudioContext||window.webkitAudioContext)();
    sfxMaster=null;
  }
  ensureSfxMaster(audioCtx);
  if(audioCtx.state==='suspended')audioCtx.resume();
  return audioCtx;
}
function sfxTone(freq=440,dur=.06,vol=.045,type='sine',endFreq=null,delay=0){
  try{
    const ac=getAudio(),t=ac.currentTime+delay,o=ac.createOscillator(),g=ac.createGain(),f=ac.createBiquadFilter();
    o.type=type;o.frequency.setValueAtTime(freq,t);
    if(endFreq)o.frequency.exponentialRampToValueAtTime(endFreq,t+dur);
    f.type='lowpass';f.frequency.value=3500;
    g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(vol,t+.008);
    g.gain.exponentialRampToValueAtTime(.0001,t+dur);
    o.connect(f);f.connect(g);g.connect(ensureSfxMaster(ac));o.start(t);o.stop(t+dur+.02);
  }catch(e){}
}
function sfxNoise(dur=.055,vol=.03,highpass=1000,delay=0){
  try{
    const ac=getAudio(),t=ac.currentTime+delay,len=Math.floor(ac.sampleRate*dur),buf=ac.createBuffer(1,len,ac.sampleRate),d=buf.getChannelData(0);
    for(let i=0;i<len;i++)d[i]=(Math.random()*2-1)*(1-i/len);
    const s=ac.createBufferSource(),f=ac.createBiquadFilter(),g=ac.createGain();
    s.buffer=buf;f.type='highpass';f.frequency.value=highpass;g.gain.value=vol;
    s.connect(f);f.connect(g);g.connect(ensureSfxMaster(ac));s.start(t);
  }catch(e){}
}
function sfxCard(){sfxNoise(.05,.024,1600);sfxTone(190,.045,.018,'triangle',145,.008)}
function sfxBet(){sfxTone(760,.045,.035,'sine',520);sfxTone(1040,.035,.024,'sine',800,.035)}
function sfxPayout(){sfxTone(660,.05,.032,'triangle',880);sfxTone(880,.06,.03,'triangle',1180,.055)}
function sfxCollect(){sfxTone(520,.055,.028,'triangle',340);sfxNoise(.04,.014,1300,.018)}
function sfxDealerCollect(){
  // 負けBETをDealerが回収する、低めのチップ衝突＋滑る音。
  sfxNoise(.075,.030,850,0);
  sfxTone(390,.075,.034,'triangle',260,.012);
  sfxTone(255,.095,.030,'triangle',175,.075);
  sfxNoise(.045,.018,1550,.105);
}
function sfxClear(){sfxTone(400,.05,.02,'triangle',250)}
function sfxWin(){
  // Coin / chip payout style "chariin" sound.
  // Several short metallic partials overlap, followed by a bright ringing tail.
  sfxTone(1480,.055,.040,'sine',1760,0);
  sfxTone(2217,.045,.025,'sine',2489,.012);
  sfxTone(1760,.065,.035,'triangle',2093,.040);
  sfxTone(2637,.055,.020,'sine',2960,.060);
  sfxTone(2093,.12,.032,'sine',2349,.095);
  sfxTone(3136,.16,.018,'sine',3322,.120);
  sfxNoise(.025,.008,2600,.018);
}
function sfxPush(){
  // Neutral two-note confirmation.
  sfxTone(520,.10,.035,'sine',520,0);
  sfxTone(520,.13,.03,'sine',520,.13);
}
function sfxLose(){
  // Short descending cue; noticeable without being harsh.
  sfxTone(440,.12,.038,'triangle',330,0);
  sfxTone(330,.16,.035,'triangle',220,.12);
}

function sfxHandSignal(type){
  if(type==='hit'){
    sfxNoise(.035,.022,900);sfxTone(180,.045,.022,'triangle',135,.012);
  }else if(type==='stand'){
    sfxNoise(.055,.018,1400);sfxTone(320,.06,.018,'sine',280,.015);
  }else if(type==='double'){
    sfxBet();sfxTone(880,.055,.025,'triangle',1040,.07);
  }else if(type==='split'){
    sfxBet();sfxTone(720,.045,.024,'triangle',900,.06);sfxTone(900,.045,.022,'triangle',1080,.115);
  }else if(type==='surrender'){
    sfxNoise(.08,.02,800);sfxTone(300,.09,.022,'triangle',210,.02);
  }
}
const HAND_SIGNAL_MS=1780;
let handSignalTimer=0;
let handSignalResolve=null;
function positionHandSignal(){
  const visual=$('handSignalVisual');
  const playActions=$('playActions');
  const actionFrame=document.querySelector('.controls .controlFrame');
  const controls=document.querySelector('.controls');

  // ハンドサインはPLAY中しか使わないため、
  // 実際の5ボタン領域 #playActions を最優先で基準にする。
  const anchor=playActions&&!playActions.classList.contains('hidden')
    ?playActions
    :(actionFrame||controls);

  if(!visual||!anchor)return;

  const r=anchor.getBoundingClientRect();
  const vv=window.visualViewport;
  const viewportTop=vv?.offsetTop||0;
  const viewportHeight=vv?.height||window.innerHeight;
  const viewportBottom=viewportTop+viewportHeight;

  const w=118;
  const h=126;

  // #playActions の幾何学的中心へ配置。
  const centerX=Math.min(
    window.innerWidth-w/2-8,
    Math.max(w/2+8,r.left+r.width/2)
  );
  const centeredTop=r.top+(r.height-h)/2;
  const top=Math.max(
    viewportTop+8,
    Math.min(centeredTop,viewportBottom-h-8)
  );

  visual.style.left=`${centerX}px`;
  visual.style.top=`${top}px`;
  visual.style.bottom='auto';
}
function showHandSignal(type,label){
  const overlay=$('handSignalOverlay'),visual=$('handSignalVisual');
  if(!overlay||!visual)return Promise.resolve();

  // 同一プレイヤーが次HAND/次アクションへすぐ進んだ場合は、
  // まだ表示中の旧サインを新しいサインで安全に置き換える。
  if(handSignalTimer){
    clearTimeout(handSignalTimer);
    handSignalTimer=0;
  }
  if(handSignalResolve){
    handSignalResolve();
    handSignalResolve=null;
  }

  positionHandSignal();
  overlay.classList.remove('hidden');
  visual.classList.remove('show');
  visual.className=`handSignalVisual ${type}`;
  $('signalLabel').textContent=label;
  void visual.offsetWidth;
  visual.classList.add('show');
  sfxHandSignal(type);

  return new Promise(resolve=>{
    handSignalResolve=resolve;
    handSignalTimer=setTimeout(()=>{
      handSignalTimer=0;
      handSignalResolve=null;
      visual.classList.remove('show');
      overlay.classList.add('hidden');
      resolve();
    },HAND_SIGNAL_MS);
  });
}
function playRoundResultSfx(){
  const results=[];
  players.forEach(p=>p.hands.forEach(h=>{if(h.result)results.push(h.result)}));
  if(!results.length)return;

  const wins=results.filter(r=>r==='WIN'||r==='BLACKJACK').length;
  const pushes=results.filter(r=>r==='PUSH').length;
  const losses=results.filter(r=>r==='LOSE'||r==='BUST'||r==='SURRENDER').length;

  // Multiple players/hands can finish differently.
  // Use the strongest outcome present so the round only plays one result cue.
  if(wins>0)sfxWin();
  else if(pushes>0)sfxPush();
  else if(losses>0)sfxLose();
}


$('startBtn').onclick=()=>{
  let min=+$('tableMin').value,max=min*100;
  syncTableMax();
  let rate=+$('rate').value;
  const rows=[...document.querySelectorAll('.playerBankRow')];
  const raw=rows.map(r=>+r.querySelector('.bankInput').value);
  const types=rows.map(r=>r.querySelector('.playerTypeSelect').value);
  const levels=rows.map(r=>r.querySelector('.cpuLevelSelect').value);
  const profile=mgPortalProfile();
  const names=rows.map((r,i)=>{
    if(types[i]==='user')return profile.displayName.slice(0,10);
    const fallback=types[i]==='cpu'?`CPU ${i+1}`:`GUEST ${i+1}`;
    return (r.querySelector('.playerNameInput').value||fallback).trim().slice(0,10)||fallback;
  });
  if(types.filter(t=>t==='user').length>1){alert('USERは1セッションにつき1人だけ設定できます。');return}
  if(!types.some(t=>t!=='cpu')){alert('CPUだけでは開始できません。USERまたはGUESTを最低1人設定してください。');return}
  if(!max||max<min){alert('テーブルMAXはMIN以上に設定してください。');return}
  const banks=raw.map(v=>mode==='jpy'?Math.floor(v*rate/1000)*1000:v);
  if(banks.some(v=>!v||v<min)){alert('全プレイヤーの開始資金をテーブルMIN以上にしてください。');return}
  cfg={min,max,rate,banks:[...banks],count:banks.length,cpuBustMode:$('cpuBustMode').value};
  cpuSerial=types.filter(t=>t==='cpu').length;
  players=banks.map((b,i)=>({
    name:names[i],type:types[i],playerId:types[i]==='user'?profile.playerId:null,cpuLevel:levels[i]||'advanced',
    bank:b,initial:b,roundStartBank:b,bet:0,lastBet:0,hands:[],insurance:0,result:''
  }));
  roundNo=0;
  lastActionPlayer=0;
  roundHistory=[];
  lastRecordedRound=0;
  statsMode='players';
  deck=[];newShoe();
  $('setup').style.display='none';
  $('table').style.display='block';

  window.scrollTo({top:0,left:0,behavior:'auto'});
  document.documentElement.scrollTop=0;
  document.body.scrollTop=0;

  requestAnimationFrame(()=>{
    window.scrollTo({top:0,left:0,behavior:'auto'});
    beginBet();
  });
}
function chipValues(){
  const min=cfg.min,max=cfg.max;
  const candidates=new Set([min]);

  // スマホ操作前提で候補数を絞る。
  // MINは必ず残し、その上はキリの良い代表額だけ採用する。
  const nice=[
    10000,20000,30000,50000,
    100000,200000,300000,500000,
    1000000,2000000,3000000,5000000,
    10000000
  ];

  for(const v of nice){
    if(v>min&&v<=max)candidates.add(v);
  }

  const sorted=[...candidates].sort((a,b)=>a-b);
  if(sorted.length<=6)return sorted;

  // MIN + 代表5個。全体レンジから偏りなく選ぶ。
  const result=[sorted[0]];
  const rest=sorted.slice(1);
  const slots=5;
  for(let i=0;i<slots;i++){
    const idx=Math.round(i*(rest.length-1)/(slots-1));
    const v=rest[idx];
    if(!result.includes(v))result.push(v);
  }
  return result.sort((a,b)=>a-b);
}
function renderChips(){
  const values=chipValues();
  $('chips').innerHTML=
    values.map(v=>`<button class="chip" data-v="${v}">${v>=10000?(v/10000)+'万':v}</button>`).join('')+
    `<button id="customBetBtn" class="chip customChip">指定BET</button>`;
  [...$('chips').querySelectorAll('.chip[data-v]')].forEach(b=>b.addEventListener('click',async()=>{
    let p=players[activePlayer],v=+b.dataset.v;
    if(animating)return;
    let room=Math.min(p.bank,cfg.max-currentBet);
    if(room<=0){toast(`MAX ${fmt(cfg.max)} です`);sfxClear();return}
    let add=Math.min(v,room);
    animating=true;sfxBet();await flyChipToBet(b,add);
    p.bank-=add;currentBet+=add;$('betAmount').textContent=fmt(currentBet);render();animating=false;
    if(add<v||currentBet>=cfg.max)toast(`テーブルMAX ${fmt(cfg.max)} に達しました`)
  }));
  $('customBetBtn').addEventListener('click',()=>openCustomBet());
  const repeat=$('repeatBetBtn'),p=players[activePlayer];
  if(repeat){
    const v=p?.lastBet||0;
    repeat.disabled=!(v>=cfg.min&&v<=cfg.max&&v<=p.bank+currentBet);
    repeat.textContent=v?`前回 ${v>=10000?(v/10000)+'万':v}`:'前回BET';
  }
}async function flyChipToBet(btn,v){let seat=document.querySelectorAll('.seat')[activePlayer];if(!seat)return;let from=btn.getBoundingClientRect(),to=seat.getBoundingClientRect();let clone=btn.cloneNode(true);clone.classList.add('flyingChip');clone.style.left=from.left+'px';clone.style.top=from.top+'px';clone.style.width=from.width+'px';clone.style.height=from.height+'px';clone.style.margin='0';document.body.appendChild(clone);let dx=(to.left+to.width/2)-(from.left+from.width/2),dy=(to.top+44)-(from.top+from.height/2);let a=clone.animate([{transform:'translate(0,0) scale(1)',opacity:1},{transform:`translate(${dx*.58}px,${dy*.48-34}px) scale(.92) rotate(7deg)`,opacity:1,offset:.55},{transform:`translate(${dx}px,${dy}px) scale(.62) rotate(-4deg)`,opacity:.2}],{duration:360,easing:'cubic-bezier(.2,.75,.2,1)',fill:'forwards'});await a.finished.catch(()=>{});clone.remove();toast(`${v>=10000?(v/10000)+'万':v}チップ BET`) }function chipStackHTML(amount){if(!amount)return '';let vals=chipValues().slice().reverse(),left=amount,out=[];for(const v of vals){while(left>=v&&out.length<8){out.push(v);left-=v}}if(left>0&&out.length<8)out.push(left);return out.length?`<div class="chipStack">${out.map(v=>`<span class="chipDisc">${v>=10000?(v/10000)+'万':v}</span>`).join('')}</div>`:''}function resultClass(r=''){if(r.includes('BLACKJACK')||r.includes('EVEN MONEY')||r.includes('WIN'))return'win';if(r.includes('PUSH'))return'push';if(r.includes('SURRENDER'))return'surrender';if(r.includes('LOSE')||r.includes('BUST'))return'lose';return''}

function allUsersBankrupt(){
  const humans=players.filter(p=>p.type!=='cpu');
  return humans.length>0&&humans.every(p=>p.bank<=0);
}
function prepareCpuSeatsForNextRound(){
  let changed=false;
  if(cfg.cpuBustMode==='replace'){
    players=players.map(p=>{
      if(p.type!=='cpu'||p.bank>0)return p;
      changed=true;
      const id=++cpuSerial;
      return {
        name:`CPU ${id}`,type:'cpu',cpuLevel:p.cpuLevel||'advanced',
        bank:p.initial,initial:p.initial,roundStartBank:p.initial,
        bet:0,lastBet:0,hands:[],insurance:0,result:''
      };
    });
  }else{
    const before=players.length;
    players=players.filter(p=>!(p.type==='cpu'&&p.bank<=0));
    changed=players.length!==before;
  }
  if(changed){
    cfg.count=players.length;
    testDeal.players=[];
    setTimeout(()=>toast(cfg.cpuBustMode==='replace'?'NEW CPU JOIN':'CPU LEAVE'),120);
  }
}
function nextBetPlayerIndex(from){
  let i=from;
  while(i<players.length&&players[i].bank<=0)i++;
  return i<players.length?i:-1;
}
function cpuBetAmount(p){
  let amount=cfg.min;
  if(p.cpuLevel==='expert'){
    const tc=trueCountSnapshot().raw;
    amount=Math.min(cfg.max,cfg.min*betSpreadUnits(tc));
  }
  amount=Math.min(amount,p.bank);
  if(amount<cfg.min)return 0;
  return amount;
}
function setBetControlsDisabled(disabled){
  const betArea=$('betArea');
  if(!betArea)return;

  betArea.querySelectorAll('button').forEach(btn=>{
    btn.disabled=!!disabled;
  });
}

function showBetTurn(){
  if(activePlayer<0||activePlayer>=players.length){dealInitial();return}
  const p=players[activePlayer];
  currentBet=0;$('betAmount').textContent=fmt(0);
  const controls=document.querySelector('.controls');
  if(p.type==='cpu'){
    // CPUもUSERと同じBETチップUIを表示するが、ユーザー誤操作防止のため全BET操作を非活性化。
    renderChips();
    controls?.classList.add('cpuBetTurn');
    setBetControlsDisabled(true);
    $('message').textContent=`${p.name}（CPU ${String(p.cpuLevel).toUpperCase()}）：BETを判断中…`;
    render();ensurePlayerVisible(activePlayer,'smooth');
    setTimeout(cpuPlaceBet,650);
  }else{
    controls?.classList.remove('cpuBetTurn');
    renderChips();
    setBetControlsDisabled(false);
    $('message').textContent=`${p.name}：ベットしてください（MIN ${fmt(cfg.min)} / MAX ${fmt(cfg.max)}）`;
    render();ensurePlayerVisible(activePlayer,'auto');
  }
}
async function cpuPlaceBet(){
  if(phase!=='bet'||animating)return;
  const pi=activePlayer;
  const p=players[pi];
  if(!p||p.type!=='cpu')return;

  const amount=cpuBetAmount(p);
  if(amount<cfg.min){
    p.bet=0;
  }else{
    animating=true;
    $('message').textContent=`${p.name}：CPU BET ${fmt(amount)}`;
    render();
    ensurePlayerVisible(pi,'smooth');

    // USERと同じチップボタンから、USERと同じ flyChipToBet() で席へ飛ばす。
    await sleep(280);
    const source=
      $('chips').querySelector(`.chip[data-v="${amount}"]`) ||
      $('customBetBtn');

    sfxBet();
    if(source)await flyChipToBet(source,amount);

    // USERと同様、飛行後にcurrentBetへ反映して席にチップを表示する。
    p.bank-=amount;
    currentBet=amount;
    $('betAmount').textContent=fmt(currentBet);
    render();

    // 置かれたチップを認識できる間を残す。
    await sleep(650);

    // USERのBET確定と同じ形で正式BETへ移す。
    p.bet=currentBet;
    p.lastBet=p.bet;
    currentBet=0;
    $('betAmount').textContent=fmt(0);
    animating=false;
  }

  document.querySelector('.controls')?.classList.remove('cpuBetTurn');
  setBetControlsDisabled(false);

  const next=nextBetPlayerIndex(pi+1);
  if(next>=0){
    activePlayer=next;
    showBetTurn();
  }else{
    await dealInitial();
  }
}
function cpuChosenAction(p,h){
  if(value(h.cards)===21)return 'S';
  const d=dealerUpValue();
  let result;
  if(p.cpuLevel==='basic')result=basicStrategyHint(h,d);
  else{
    const base=advancedStrategyHint(h,d);
    if(p.cpuLevel==='expert'){
      const dev=expertDeviationHint(h,d,base,trueCountSnapshot());
      result={...base,action:dev.action};
    }else result=base;
  }
  let a=result.action;
  if(a==='P'&&!canSplitHand(p,h))a=advancedStrategyHint(h,d,true).action;
  if(a==='D'&&(h.cards.length!==2||p.bank<h.bet)){
    const info=handSoftInfo(h.cards);
    a=(info.soft&&info.total===18&&[2,3,4,5,6,7,8].includes(d))?'S':'H';
  }
  if(a==='R'&&(h.cards.length!==2||h.splitOrigin))a=advancedStrategyHint(h,d,true).action;
  return a;
}
function scheduleCpuAction(){
  if(cpuTurnPending)return;
  cpuTurnPending=true;
  setTimeout(()=>{
    cpuTurnPending=false;
    if(phase!=='play')return;
    const p=players[activePlayer],h=currentHand();
    if(!p||p.type!=='cpu'||!h)return;
    const a=cpuChosenAction(p,h),labels={H:'HIT',S:'STAND',D:'DOUBLE',P:'SPLIT',R:'SURRENDER'};
    $('message').textContent=`${p.name}：CPU → ${labels[a]||a}`;
    render();ensurePlayerVisible(activePlayer,'smooth');
    setTimeout(()=>{
      if(phase!=='play'||players[activePlayer]!==p)return;
      const btn={H:'hitBtn',S:'standBtn',D:'doubleBtn',P:'splitBtn',R:'surrenderBtn'}[a];
      const target=btn?$(btn):null;

      // disabledはUSER操作を止めるためのもの。
      // CPUはイベントハンドラを直接実行してアクションする。
      if(target&&typeof target.onclick==='function'){
        target.onclick();
      }else if(typeof $('hitBtn').onclick==='function'){
        $('hitBtn').onclick();
      }
    },600);
  },450);
}
function beginBet(){
  if(allUsersBankrupt()){showGameOver();return}
  prepareCpuSeatsForNextRound();
  const controls=document.querySelector('.controls');
  controls.classList.remove('resultMode','singleResult','resultCompact','dealerHidden','playCompact');
  controls.classList.add('betCompact');
  dealingDealerActive=false;
  $('table').classList.remove(
    'dealingOverview','dealerDealActive','payoutOverview',
    'betOverview','viewMorphOutToAction','viewMorphInToAction',
    'viewMorphOutToOverview','viewMorphInToOverview','viewMorphBusy',
    'overviewPhaseOut','overviewPhaseIn','overviewPhaseBusy'
  );
  $('table').classList.add('betPhase');
  $('table').dataset.dealSeats=String(players.length);

  if(useOverviewMode()){
    // 「テーブルに着く」「次のラウンド」ではカメラ演出を行わない。
    // BET俯瞰をそのまま静止状態で表示する。
    $('table').classList.add('betOverview');
  }
  $('roundResultModal').classList.add('hidden');
  $('resultBtn').disabled=true;
  settlingPlayer=-1;blackjackAnnouncePlayer=-1;
  if($('blackjackNotice')){
    $('blackjackNotice').classList.add('hidden');
    const b=$('blackjackNotice').querySelector('.blackjackNoticeBox');if(b)b.classList.remove('play');
  }
  if(!deck.length||shuffleAfterRound)newShoe();
  roundNo++;phase='bet';activeHand=0;currentBet=0;dealer=[];reveal=false;insuranceIndex=0;insuranceMode='insurance';evenMoneyContext=null;evenMoneyResolve=null;seenCards.clear();
  $('roundBanner').className='roundBanner';$('roundBanner').textContent='';
  players.forEach(p=>{p.roundStartBank=p.bank;p.bet=0;p.hands=[];p.insurance=0;p.result=''});
  $('betArea').style.display='block';$('insuranceBox').style.display='none';$('playActions').classList.add('hidden');
  $('betAmount').textContent=fmt(0);
  activePlayer=nextBetPlayerIndex(0);
  if(activePlayer<0){showGameOver();return}
  showBetTurn();
}

$('repeatBetBtn').onclick=async()=>{
  if(animating)return;
  const p=players[activePlayer];
  const v=p.lastBet||0;
  if(v<=0){toast('前回BETがありません');return}
  if(v<cfg.min){toast(`前回BETがテーブルMIN ${fmt(cfg.min)} 未満です`);return}
  if(v>cfg.max){toast(`前回BETがテーブルMAX ${fmt(cfg.max)} を超えています`);return}
  if(v>p.bank){toast('残高が前回BETに足りません');return}

  // Clear any amount currently being selected, then place the previous bet.
  p.bank+=currentBet;
  currentBet=0;
  animating=true;
  sfxBet();

  const source=$('repeatBetBtn');
  if(source)await flyChipToBet(source,v);

  p.bank-=v;
  currentBet=v;
  $('betAmount').textContent=fmt(currentBet);
  $('message').textContent=`${p.name}：前回BET ${fmt(v)}`;
  render();

  // A short pause so the player can recognize what was placed before advancing.
  await sleep(650);

  p.bet=currentBet;
  p.lastBet=p.bet;
  currentBet=0;
  $('betAmount').textContent=fmt(0);

  const next=nextBetPlayerIndex(activePlayer+1);
  animating=false;
  if(next>=0){activePlayer=next;showBetTurn()}
  else await dealInitial();
};
$('clearBet').onclick=()=>{let p=players[activePlayer];p.bank+=currentBet;currentBet=0;$('betAmount').textContent=fmt(0);sfxClear();render()};
$('dealBtn').onclick=async()=>{
  if(animating)return;
  const p=players[activePlayer];
  if(p.type==='cpu')return;
  if(currentBet<cfg.min){$('message').textContent=`最低 ${fmt(cfg.min)} 必要です`;return}
  if(currentBet>cfg.max){$('message').textContent=`MAX ${fmt(cfg.max)} までです`;toast(`テーブルMAX ${fmt(cfg.max)} を超えています`);return}
  p.bet=currentBet;p.lastBet=p.bet;currentBet=0;$('betAmount').textContent=fmt(0);
  const next=nextBetPlayerIndex(activePlayer+1);
  if(next>=0){activePlayer=next;showBetTurn()}
  else await dealInitial();
}
async function dealInitial(){
  animating=true;
  $('table').classList.remove('dealerDealActive','payoutOverview');
  $('table').dataset.dealSeats=String(players.length);

  phase='dealing';
  dealingDealerActive=false;
  activePlayer=0;

  // BET俯瞰から配札俯瞰へ切り替える前にHAND構造を準備する。
  // これにより
  //   BET placeholder → dealing placeholder → actual empty hand
  // のような複数段階の再レイアウトを発生させない。
  for(const p of players){
    p.hands=p.bet>0
      ?[{cards:[],bet:p.bet,done:false,surrendered:false,splitOrigin:false,result:''}]
      :[];
  }

  if(useOverviewMode()){
    await transitionBetOverviewToDealing();
  }else{
    $('table').classList.remove('betPhase','betOverview','dealingOverview');
    render();
  }

  // dealingOverviewに入った後はcontrolsが非表示なので、
  // ここでBET用controlsを解除しても画面レイアウトには影響しない。
  document.querySelector('.controls').classList.remove('betCompact');
  $('betArea').style.display='none';

  const scroller=$('players');
  if(scroller)scroller.scrollTop=0;

  // transitionBetOverviewToDealing / 上記elseですでに描画済み。
  await sleep(180);

  for(let round=0;round<2;round++){
    for(let i=0;i<players.length;i++){
      if(players[i].bet<=0)continue;
      dealingDealerActive=false;
      activePlayer=i;
      render();
      await sleep(160);
      const forced=testDeal.players?.[i]?.[round]||null;
      players[i].hands[0].cards.push(drawSpecified(forced));
      render();
      await sleep(330);
    }

    // Paradise City公式：No Hole Card。
    // Dealerは初期配札では表向き1枚のみ。2枚目はPLAYER ACTION後に引く。
    if(round===0){
      dealingDealerActive=true;
      render();
      await sleep(160);
      const dealerForced=testDeal.dealer?.[0]||null;
      dealer.push(drawSpecified(dealerForced));
      render();
      await sleep(360);
    }
  }

  dealingDealerActive=false;
  const insuranceRequired=dealer[0]?.r==='A';

  // Dealerはまだ1枚しか持っていないため、この時点ではBLACKJACK判定しない。
  // 複数PLAYERではACTION画面へフェード切替。
  if(useOverviewMode()){
    await transitionOverviewToAction();
  }else{
    $('table').classList.remove('dealingOverview','dealerDealActive','betOverview','payoutOverview');
    render();
  }

  if(scroller)scroller.scrollTop=0;

  animating=false;

  if(insuranceRequired){
    startInsurance();
  }else{
    await dealerPeekThenPlay();
  }
}

async function announceActiveBlackjack(pi){
  const notice=$('blackjackNotice');
  const box=notice?.querySelector('.blackjackNoticeBox');
  if(!notice||!box)return;

  // この時点では既に対象PLAYERがACTION対象としてactiveになっている。
  blackjackAnnouncePlayer=pi;
  render();
  ensurePlayerVisible(pi,'smooth');
  $('message').textContent=`${players[pi].name}：BLACKJACK!`;

  // active表示を一瞬見せてからBJ演出を出す。
  await sleep(260);

  $('blackjackNoticePlayer').textContent=players[pi].name;

  notice.classList.remove('hidden');
  box.classList.remove('play');
  void box.offsetWidth;
  box.classList.add('play');

  sfxWin();
  await sleep(1350);

  box.classList.remove('play');
  notice.classList.add('hidden');
  blackjackAnnouncePlayer=-1;
  render();

  // BJ確認後、すぐ次PLAYERへ飛ばず一呼吸置く。
  await sleep(360);
}
function setInsurancePrompt(mode='insurance'){
  insuranceMode=mode;
  const title=$('insuranceTitle');
  const yes=$('insuranceYes');
  const no=$('insuranceNo');

  if(mode==='evenMoney'){
    if(title)title.textContent='EVEN MONEY?';
    if(yes)yes.textContent='YES（1:1確定）';
    if(no)no.textContent='NO（BJ 3:2を狙う）';
  }else{
    if(title)title.textContent='INSURANCE?';
    if(yes)yes.textContent='YES（1/2 BET）';
    if(no)no.textContent='NO';
  }
}

function startInsurance(){
  document.querySelector('.controls').classList.remove('betCompact');
  phase='insurance';
  insuranceIndex=0;
  setInsurancePrompt('insurance');
  $('insuranceBox').style.display='none';
  askInsurance();
}

function askInsurance(){
  // CPUのInsuranceは完全非活性。
  // Natural BJは通常Insuranceではなく、ACTION順でEven Moneyを提示する。
  while(insuranceIndex<players.length){
    const p=players[insuranceIndex];
    const h=p.hands?.[0];
    const isBlackjack=!!h && natural(h.cards,h.splitOrigin);
    const canUserInsure=
      p.type!=='cpu' &&
      !isBlackjack &&
      p.bank>=p.bet/2;

    if(canUserInsure)break;

    p.insurance=0;
    insuranceIndex++;
  }

  if(insuranceIndex>=players.length){
    $('insuranceBox').style.display='none';
    setInsurancePrompt('insurance');
    dealerPeekThenPlay();
    return;
  }

  const p=players[insuranceIndex];
  lastActionPlayer=insuranceIndex;
  setInsurancePrompt('insurance');
  $('insuranceBox').style.display='block';
  $('insuranceYes').disabled=false;
  $('insuranceNo').disabled=false;
  $('message').textContent=`${p.name}：Insuranceを選択（${fmt(p.bet/2)}）`;
  render();
  ensurePlayerVisible(insuranceIndex);
}

function askEvenMoneyForActiveBlackjack(pi,hi){
  const p=players[pi];
  const h=p?.hands?.[hi];

  // Dealer A + Natural BJ のUSERだけが選択対象。
  // CPUは既存方針どおりInsurance系の判断を行わず、自動的にNO。
  if(!p||!h||p.type==='cpu'||dealer[0]?.r!=='A'||!natural(h.cards,h.splitOrigin)){
    return Promise.resolve(false);
  }

  evenMoneyContext={pi,hi};
  setInsurancePrompt('evenMoney');
  $('playActions').classList.add('hidden');
  $('insuranceBox').style.display='block';
  $('insuranceYes').disabled=false;
  $('insuranceNo').disabled=false;
  $('message').textContent=`${p.name}：EVEN MONEY？　勝ち +${fmt(h.bet)} を確定`;
  render();
  ensurePlayerVisible(pi,'smooth');

  return new Promise(resolve=>{
    evenMoneyResolve=resolve;
  });
}

function finishEvenMoneyChoice(take){
  if(insuranceMode!=='evenMoney'||!evenMoneyContext)return;

  const resolve=evenMoneyResolve;
  evenMoneyResolve=null;
  evenMoneyContext=null;

  $('insuranceBox').style.display='none';
  setInsurancePrompt('insurance');
  $('playActions').classList.remove('hidden');

  if(resolve)resolve(!!take);
}

$('insuranceYes').onclick=()=>{
  if(insuranceMode==='evenMoney'){
    finishEvenMoneyChoice(true);
    return;
  }

  const p=players[insuranceIndex];
  if(!p||p.type==='cpu')return;
  const amt=p.bet/2;
  if(p.bank>=amt){
    p.bank-=amt;
    p.insurance=amt;
  }
  insuranceIndex++;
  askInsurance();
};

$('insuranceNo').onclick=()=>{
  if(insuranceMode==='evenMoney'){
    finishEvenMoneyChoice(false);
    return;
  }

  const p=players[insuranceIndex];
  if(!p||p.type==='cpu')return;
  p.insurance=0;
  insuranceIndex++;
  askInsurance();
};

async function showDealerBlackjackCheckCue(isBlackjack){
  const notice=$('dealerCheckNotice');
  const title=$('dealerCheckTitle');
  const sub=$('dealerCheckSub');
  if(!notice||!title||!sub)return;

  title.textContent='DEALER CHECK';
  sub.textContent='BLACKJACK?';
  notice.classList.remove('hidden','blackjack');
  void notice.offsetWidth;
  notice.classList.add('show');

  $('message').textContent='Dealer：BLACKJACKを確認中...';
  sfxTone(420,.11,.025,'triangle',520);
  await sleep(720);

  if(isBlackjack){
    notice.classList.add('blackjack');
    title.textContent='DEALER';
    sub.textContent='BLACKJACK';
    sfxTone(250,.12,.035,'triangle',190);
    await sleep(520);
  }

  notice.classList.remove('show');
  await sleep(120);
  notice.classList.add('hidden');
}

async function dealerPeekThenPlay(){
  // Paradise City No Hole Card:
  // DealerはPLAYER ACTION前には1枚しか持たないため、
  // ここではBLACKJACKチェックを行わない。
  phase='play';
  activePlayer=0;
  activeHand=0;
  document.querySelector('.controls').classList.remove('betCompact');
  document.querySelector('.controls').classList.add('playCompact');
  $('playActions').classList.remove('hidden');
  advancePlayer();
}


let betHintMode='tc';

function betSpreadUnits(trueCountRaw){
  if(trueCountRaw>=6)return 8;
  if(trueCountRaw>=5)return 6;
  if(trueCountRaw>=4)return 4;
  if(trueCountRaw>=3)return 3;
  if(trueCountRaw>=2)return 2;
  return 1;
}
function floorToBetUnit(amount,unit){
  if(!unit||unit<=0)return 0;
  return Math.floor(amount/unit)*unit;
}
function betStrategySnapshot(){
  const p=players[activePlayer];
  const count=trueCountSnapshot();
  const unit=cfg.min||0;
  const max=cfg.max||0;
  const totalFunds=(p?.bank||0)+currentBet;
  const units=betSpreadUnits(count.raw);
  const tcTarget=Math.min(max,unit*units);

  // 練習版の資金管理補正:
  // 初期BET + Split + 両HANDのDoubleまで想定すると最大4倍の資金を使う可能性があるため、
  // 初期BETは現在BANKの1/4を上限目安にする。
  const rawReserveCap=floorToBetUnit(totalFunds/4,unit);
  const canKeepFourX=rawReserveCap>=unit;
  const bankrollCap=totalFunds>=unit
    ? Math.min(max,canKeepFourX?rawReserveCap:unit)
    : 0;
  const adjusted=totalFunds>=unit
    ? Math.min(tcTarget,bankrollCap)
    : 0;

  let currentState='';
  if(currentBet===0)currentState='まだBETを選択していません';
  else if(adjusted===0)currentState='現在の残高ではテーブルMINに届きません';
  else if(currentBet===adjusted)currentState='現在BETは資金管理補正後の推奨額と一致';
  else if(currentBet<adjusted)currentState=`推奨額まであと ${fmt(adjusted-currentBet)}`;
  else currentState=`推奨額を ${fmt(currentBet-adjusted)} 上回っています`;

  return {
    p,count,unit,max,totalFunds,units,tcTarget,
    rawReserveCap,canKeepFourX,bankrollCap,adjusted,currentState
  };
}
function tcBandLabel(tc){
  if(tc>=6)return 'TC +6以上';
  if(tc>=5)return 'TC +5';
  if(tc>=4)return 'TC +4';
  if(tc>=3)return 'TC +3';
  if(tc>=2)return 'TC +2';
  return 'TC +1以下';
}
function betSpreadRows(currentUnits){
  const rows=[
    ['+1以下',1],
    ['+2',2],
    ['+3',3],
    ['+4',4],
    ['+5',6],
    ['+6以上',8]
  ];
  return rows.map(([tc,u])=>`<tr class="${u===currentUnits?'current':''}"><td>TC ${tc}</td><td>${u} Unit</td><td>${fmt((cfg.min||0)*u)}</td></tr>`).join('');
}
function renderBetStrategyHint(){
  const root=$('betStrategyHintContent');
  if(phase!=='bet'||activePlayer<0||!players[activePlayer]){
    root.innerHTML='<div class="helpNote">BET中のみBET戦略ヒントを表示できます。</div>';
    return;
  }
  const s=betStrategySnapshot();
  const tcSign=s.count.raw>=0?'+':'';
  const rcSign=s.count.running>=0?'+':'';

  if(betHintMode==='tc'){
    root.innerHTML=`
      <div class="betHintHero">
        <div class="meta">
          <span>1-8 BET SPREAD</span>
          <b>${tcBandLabel(s.count.raw)}</b>
          <span>テーブルMIN = 1 Unit</span>
        </div>
        <div class="betHintAmount">
          <span>TCベース推奨BET</span>
          <strong>${fmt(s.tcTarget)}</strong>
          <span class="betUnitBadge">${s.units} Unit</span>
        </div>
      </div>
      <div class="betHintMetrics">
        <div class="betHintMetric"><span>Running Count</span><b>${rcSign}${s.count.running}</b></div>
        <div class="betHintMetric"><span>True Count</span><b>${tcSign}${s.count.raw.toFixed(1)}</b></div>
        <div class="betHintMetric"><span>現在BET</span><b>${fmt(currentBet)}</b></div>
      </div>
      <div class="betHintExplain">
        <b>考え方</b><br>
        True Countが高いほど高いカードが相対的に多く残っているため、BETを段階的に増やします。
        現在は ${tcBandLabel(s.count.raw)} なので ${s.units} Unit が目安です。
      </div>
      <table class="betSpreadTable">
        <thead><tr><th>True Count</th><th>Unit</th><th>BET額</th></tr></thead>
        <tbody>${betSpreadRows(s.units)}</tbody>
      </table>
      <div class="helpNote">このタブではBANK量による補正は行わず、True CountだけでBET目安を表示します。</div>
    `;
    return;
  }

  if(betHintMode==='bankroll'){
    root.innerHTML=`
      <div class="betHintHero">
        <div class="meta">
          <span>TC推奨 ${s.units} Unit</span>
          <b>${fmt(s.tcTarget)} → 資金管理補正</b>
          <span>${s.currentState}</span>
        </div>
        <div class="betHintAmount">
          <span>資金管理込み推奨BET</span>
          <strong>${s.adjusted?fmt(s.adjusted):'BET不可'}</strong>
          ${s.adjusted?`<span class="betUnitBadge">${Math.round(s.adjusted/s.unit)} Unit</span>`:''}
        </div>
      </div>
      <div class="betHintCompare">
        <div><span>現在BANK（選択中BETを戻した総額）</span><b>${fmt(s.totalFunds)}</b></div>
        <div><span>TCだけの推奨</span><b>${fmt(s.tcTarget)}</b></div>
        <div><span>資金管理上限の目安</span><b>${s.bankrollCap?fmt(s.bankrollCap):'—'}</b></div>
        <div><span>最終推奨</span><b>${s.adjusted?fmt(s.adjusted):'—'}</b></div>
      </div>
      <div class="betHintExplain">
        <b>資金管理補正</b><br>
        この練習版では、初期BET後に「Split＋両HANDのDouble」が発生しても対応しやすいよう、
        初期BETを現在資金のおおむね1/4以内に抑える保守的な上限を使っています。
      </div>
      ${!s.canKeepFourX&&s.totalFunds>=s.unit?`
        <div class="betHintWarning">
          現在BANKでは「BETの4倍分を確保する」余裕がありません。テーブルMINを表示していますが、Split/Doubleが重なると資金不足になる可能性があります。
        </div>`:''}
      ${s.totalFunds<s.unit?`
        <div class="betHintWarning">現在BANKがテーブルMIN ${fmt(s.unit)} 未満のため、新しいBETを成立させられません。</div>`:''}
    `;
    return;
  }

  root.innerHTML=`
    <div class="betHintHero">
      <div class="meta">
        <span>詳細分析</span>
        <b>${tcBandLabel(s.count.raw)} / ${s.units} Unit</b>
        <span>${s.currentState}</span>
      </div>
      <div class="betHintAmount">
        <span>最終推奨BET</span>
        <strong>${s.adjusted?fmt(s.adjusted):'BET不可'}</strong>
      </div>
    </div>

    <div class="betHintMetrics">
      <div class="betHintMetric"><span>Running Count</span><b>${rcSign}${s.count.running}</b></div>
      <div class="betHintMetric"><span>残りデック</span><b>${s.count.remainingDecks.toFixed(1)}</b></div>
      <div class="betHintMetric"><span>True Count</span><b>${tcSign}${s.count.raw.toFixed(1)}</b></div>
    </div>

    <div class="betHintCompare">
      <div><span>テーブルMIN / 1 Unit</span><b>${fmt(s.unit)}</b></div>
      <div><span>テーブルMAX</span><b>${fmt(s.max)}</b></div>
      <div><span>現在BANK総額</span><b>${fmt(s.totalFunds)}</b></div>
      <div><span>現在選択中BET</span><b>${fmt(currentBet)}</b></div>
      <div><span>TC推奨</span><b>${s.units} Unit / ${fmt(s.tcTarget)}</b></div>
      <div><span>資金管理上限</span><b>${s.bankrollCap?fmt(s.bankrollCap):'—'}</b></div>
      <div><span>資金管理補正後</span><b>${s.adjusted?fmt(s.adjusted):'—'}</b></div>
    </div>

    <div class="betHintNotice">
      <b>判定内容</b><br>
      ① True Count ${tcSign}${s.count.raw.toFixed(1)} から ${s.units} Unit を選択。<br>
      ② TC推奨額は ${fmt(s.tcTarget)}。<br>
      ③ 現在BANKから追加BET用の余力を残す上限は ${s.bankrollCap?fmt(s.bankrollCap):'確保不可'}。<br>
      ④ 両方を比較して ${s.adjusted?fmt(s.adjusted):'BET不可'} を最終目安としています。
    </div>

    <div class="helpNote">
      BET額は勝敗の直前結果ではなく、シューのTrue Countと資金余力を根拠に判断します。
      ここでの資金管理補正は、この練習ゲーム用の保守的な目安です。
    </div>
  `;
}
function openBetStrategyHint(){
  if(phase!=='bet'||activePlayer<0)return;
  document.querySelectorAll('.betHintModeBtn').forEach(b=>b.classList.toggle('active',b.dataset.betHintMode===betHintMode));
  renderBetStrategyHint();
  $('betStrategyHintModal').classList.remove('hidden');
}
function closeBetStrategyHint(){$('betStrategyHintModal').classList.add('hidden')}
function dealerUpValue(){
  const c=dealer[0];
  if(!c)return 0;
  if(c.r==='A')return 11;
  if(['10','J','Q','K'].includes(c.r))return 10;
  return +c.r;
}
function handSoftInfo(cards){
  let raw=0,aces=0;
  cards.forEach(c=>{
    if(c.r==='A'){raw+=11;aces++}
    else if(['J','Q','K'].includes(c.r))raw+=10;
    else raw+=+c.r;
  });
  let total=raw,reduced=0;
  while(total>21&&aces-reduced>0){total-=10;reduced++}
  return {total,soft:aces-reduced>0,aces};
}
function pairStrategyValue(cards){
  if(cards.length!==2)return null;
  const a=splitValue(cards[0]),b=splitValue(cards[1]);
  if(a!==b)return null;
  return a==='A'?'A':+a;
}
function actionLabel(a){
  return {H:'HIT',S:'STAND',D:'DOUBLE',P:'SPLIT',R:'SURRENDER'}[a]||a;
}
function handDisplay(cards){
  return cards.map(c=>`${c.r}${c.s}`).join('  ');
}
function handTypeLabel(cards){
  const pair=pairStrategyValue(cards),info=handSoftInfo(cards);
  if(pair!==null)return `PAIR ${pair},${pair} / TOTAL ${info.total}`;
  return `${info.soft?'SOFT':'HARD'} ${info.total}`;
}
function basicStrategyHint(h,d){
  const info=handSoftInfo(h.cards),total=info.total,pair=pairStrategyValue(h.cards);
  const splitMap={
    2:['A',2,3,6,7,8,9],
    3:['A',2,3,6,7,8,9],
    4:['A',2,3,4,6,7,8,9],
    5:['A',2,3,4,6,7,8,9],
    6:['A',2,3,4,6,7,8,9],
    7:['A',2,3,7,8],
    8:['A',8,9],
    9:['A',8],
    10:['A',8],
    11:['A',8]
  };
  if(pair!==null&&(splitMap[d]||[]).includes(pair)){
    return {action:'P',title:'Splitを優先',reason:`基本戦略では、ディーラー ${d===11?'A':d} に対して ${pair},${pair} はSplit対象です。合計値として処理する前にPair判断を優先します。`};
  }
  if((d===9&&total===16)||(d===10&&(total===15||total===16))||(d===11&&total===16)){
    return {action:'R',title:'損失を半分に抑える',reason:`基本戦略では、ディーラー ${d===11?'A':d} に対するTOTAL ${total}はSurrender対象です。強いアップカードに対して不利なHANDを最後まで戦わない判断です。`};
  }
  const doubles=(d===2?[10,11]:d===3?[9,10,11]:[4,5,6].includes(d)?[9,10,11]:[7,8,9].includes(d)?[10,11]:d===10?[11]:[]);
  if(h.cards.length===2&&doubles.includes(total)){
    return {action:'D',title:'有利な局面でBETを増やす',reason:`基本戦略では、ディーラー ${d===11?'A':d} に対するTOTAL ${total}はDouble対象です。1枚だけ引く代わりにBETを倍にする価値が高い局面です。`};
  }
  const standAt=[4,5,6].includes(d)?12:[2,3].includes(d)?13:17;
  if(total>=standAt){
    return {action:'S',title:'DealerのBustを待つ',reason:`基本戦略では、ディーラー ${d===11?'A':d} に対してTOTAL ${total}はStandです。これ以上カードを引いてBustするリスクを取らない判断です。`};
  }
  return {action:'H',title:'HANDを改善する',reason:`基本戦略では、ディーラー ${d===11?'A':d} に対するTOTAL ${total}はHitです。現在の強さではStandするより、追加カードでHANDを改善する方を優先します。`};
}
function advancedStrategyHint(h,d,ignorePair=false){
  const info=handSoftInfo(h.cards),total=info.total,pair=pairStrategyValue(h.cards);
  if(!ignorePair&&pair!==null){
    let action='H',reason='';
    if(pair==='A'||pair===8)action='P';
    else if(pair===10)action='S';
    else if(pair===9)action=([2,3,4,5,6,8,9].includes(d)?'P':'S');
    else if(pair===7)action=([2,3,4,5,6,7].includes(d)?'P':'H');
    else if(pair===6)action=([2,3,4,5,6].includes(d)?'P':'H');
    else if(pair===5)action=([2,3,4,5,6,7,8,9].includes(d)?'D':'H');
    else if(pair===4)action=([5,6].includes(d)?'P':'H');
    else if(pair===3||pair===2)action=([2,3,4,5,6,7].includes(d)?'P':'H');
    reason=`PAIR ${pair},${pair}を最初に判定します。ディーラー ${d===11?'A':d} に対するPair戦略は ${actionLabel(action)} です。`;
    return {action,title:'PAIR戦略を優先',reason,kind:'pair'};
  }
  if(h.cards.length===2&&!h.splitOrigin&&!info.soft&&((total===16&&[9,10,11].includes(d))||(total===15&&d===10))){
    return {action:'R',title:'Surrender条件に該当',reason:`PairではないHard ${total}です。ディーラー ${d===11?'A':d} に対する詳細戦略ではSurrenderを優先します。`,kind:'surrender'};
  }
  if(info.soft){
    let a='H';
    if(total>=19)a='S';
    else if(total===18){
      if([3,4,5,6].includes(d))a='D';
      else if([2,7,8].includes(d))a='S';
      else a='H';
    }else if(total===17)a=([3,4,5,6].includes(d)?'D':'H');
    else if(total===16||total===15)a=([4,5,6].includes(d)?'D':'H');
    else if(total===14||total===13)a=([5,6].includes(d)?'D':'H');
    return {action:a,title:`Soft ${total}として判断`,reason:`Aを11として使えるSoft Handです。ディーラー ${d===11?'A':d} に対するSoft戦略は ${actionLabel(a)} です。Aがあるため、同じTOTALのHard Handとは判断が異なります。`,kind:'soft'};
  }
  let a='H';
  if(total>=17)a='S';
  else if(total>=13&&total<=16)a=([2,3,4,5,6].includes(d)?'S':'H');
  else if(total===12)a=([4,5,6].includes(d)?'S':'H');
  else if(total===11)a=(d===11?'H':'D');
  else if(total===10)a=([2,3,4,5,6,7,8,9].includes(d)?'D':'H');
  else if(total===9)a=([3,4,5,6].includes(d)?'D':'H');
  return {action:a,title:`Hard ${total}として判断`,reason:`Aを11として使えないHard Handです。ディーラー ${d===11?'A':d} に対する詳細戦略は ${actionLabel(a)} です。`,kind:'hard'};
}
function trueCountSnapshot(){
  const hiddenDealer=(!reveal&&dealer[1])?1:0;
  const remainingCards=deck.length+hiddenDealer;
  const remainingDecks=Math.max(remainingCards/52,.25);
  const raw=hiLoRunning/remainingDecks;
  const indexTc=raw<0?Math.ceil(raw):Math.floor(raw);
  return {running:hiLoRunning,remainingDecks,raw,indexTc};
}
function expertDeviationHint(h,d,base,count){
  const info=handSoftInfo(h.cards),total=info.total,pair=pairStrategyValue(h.cards),tc=count.indexTc;
  const surrenderEligible=h.cards.length===2&&!h.splitOrigin;

  // Fab 4 first: these are Late Surrender deviations.
  if(surrenderEligible&&!info.soft&&pair===null){
    let index=null,label='';
    if(total===14&&d===10){index=3;label='Fab 4：14 vs 10'}
    else if(total===15&&d===10){index=0;label='Fab 4：15 vs 10'}
    else if(total===15&&d===9){index=2;label='Fab 4：15 vs 9'}
    else if(total===15&&d===11){index=1;label='Fab 4：15 vs A'}
    if(index!==null){
      const action=tc>=index?'R':'H';
      return {action,applied:action!==base.action,label,index,detail:`${label}。Index ${index>=0?'+':''}${index} に対して現在の判定TCは ${tc>=0?'+':''}${tc}。${tc>=index?'Surrenderへ変更します。':'Index未満なのでHitします。'}`};
    }
  }

  // If normal advanced strategy already says surrender (e.g. 16 vs 9/10/A), keep it.
  if(base.action==='R'){
    return {action:base.action,applied:false,label:'Surrender優先',index:null,detail:'現在は通常のSurrender条件に該当するため、Hi-Loの主要DeviationよりSurrender戦略を優先します。'};
  }

  let index=null,highAction=null,lowAction=null,label='';
  if(pair===10&&d===5){index=5;highAction='P';lowAction='S';label='10,10 vs 5'}
  else if(pair===10&&d===6){index=4;highAction='P';lowAction='S';label='10,10 vs 6'}
  else if(!info.soft&&pair===null&&total===16&&d===10){index=0;highAction='S';lowAction='H';label='16 vs 10'}
  else if(!info.soft&&pair===null&&total===15&&d===10){index=4;highAction='S';lowAction='H';label='15 vs 10'}
  else if(!info.soft&&pair===null&&total===10&&d===10){index=4;highAction='D';lowAction='H';label='10 vs 10'}
  else if(!info.soft&&pair===null&&total===12&&d===3){index=2;highAction='S';lowAction='H';label='12 vs 3'}
  else if(!info.soft&&pair===null&&total===12&&d===2){index=3;highAction='S';lowAction='H';label='12 vs 2'}
  else if(!info.soft&&pair===null&&total===11&&d===11){index=1;highAction='D';lowAction='H';label='11 vs A'}
  else if(!info.soft&&pair===null&&total===9&&d===2){index=1;highAction='D';lowAction='H';label='9 vs 2'}
  else if(!info.soft&&pair===null&&total===10&&d===11){index=4;highAction='D';lowAction='H';label='10 vs A'}
  else if(!info.soft&&pair===null&&total===9&&d===7){index=3;highAction='D';lowAction='H';label='9 vs 7'}
  else if(!info.soft&&pair===null&&total===16&&d===9){index=5;highAction='S';lowAction='H';label='16 vs 9'}
  else if(!info.soft&&pair===null&&total===13&&d===2){index=-1;highAction='S';lowAction='H';label='13 vs 2'}
  else if(!info.soft&&pair===null&&total===12&&d===4){index=0;highAction='S';lowAction='H';label='12 vs 4'}
  else if(!info.soft&&pair===null&&total===12&&d===5){index=-2;highAction='S';lowAction='H';label='12 vs 5'}
  else if(!info.soft&&pair===null&&total===12&&d===6){index=-1;highAction='S';lowAction='H';label='12 vs 6'}
  else if(!info.soft&&pair===null&&total===13&&d===3){index=-2;highAction='S';lowAction='H';label='13 vs 3'}

  if(index===null){
    return {action:base.action,applied:false,label:'主要Deviation対象外',index:null,detail:'このHANDはIllustrious 18 / Fab 4の主要Index対象ではありません。応用戦略の推奨をそのまま使います。'};
  }
  const action=tc>=index?highAction:lowAction;
  return {action,applied:action!==base.action,label,index,detail:`Illustrious 18：${label}。Index ${index>=0?'+':''}${index} に対して現在の判定TCは ${tc>=0?'+':''}${tc}。${tc>=index?`${actionLabel(highAction)}側`:`${actionLabel(lowAction)}側`}を選びます。`};
}
function strategyAvailabilityNote(action,h){
  const p=players[activePlayer];
  if(action==='D'&&(h.cards.length!==2||p.bank<h.bet)){
    const info=handSoftInfo(h.cards);
    const fallback=(info.soft&&info.total===18)?'STAND':'HIT';
    return `推奨はDOUBLEですが、現在は実行できません。次善手の目安は ${fallback} です。`;
  }
  if(action==='P'&&!canSplitHand(p,h)){
    return '推奨はSPLITですが、残高不足または3HAND上限のため現在は実行できません。';
  }
  if(action==='R'&&(h.cards.length!==2||h.splitOrigin)){
    return '推奨はSURRENDERですが、現在のHANDではSURRENDERできません。';
  }
  return '';
}
function advancedHintTableSpec(h){
  const info=handSoftInfo(h.cards);
  const pair=pairStrategyValue(h.cards);

  if(pair!==null){
    return {
      title:'PAIR',
      rowLabel:pair==='A'?'A,A':`${pair},${pair}`
    };
  }

  if(info.soft){
    // ヘルプのSOFT HAND表は A,2(13) ～ A,9(20)。
    if(info.total>=13&&info.total<=20){
      return {
        title:'SOFT HAND',
        rowLabel:`A,${info.total-11}`
      };
    }
    return {
      title:'SOFT HAND',
      rowLabel:null
    };
  }

  let rowLabel='';
  if(info.total<=8)rowLabel='8以下';
  else if(info.total===9)rowLabel='9';
  else if(info.total===10)rowLabel='10';
  else if(info.total===11)rowLabel='11';
  else if(info.total===12)rowLabel='12';
  else if(info.total===13||info.total===14)rowLabel='13-14';
  else if(info.total===15)rowLabel='15';
  else if(info.total===16)rowLabel='16';
  else rowLabel='17以上';

  return {
    title:'HARD HAND',
    rowLabel
  };
}

function buildAdvancedHintTableHtml(h,d){
  const spec=advancedHintTableSpec(h);
  const sections=[...document.querySelectorAll('#helpAdvanced .advancedSection')];
  const section=sections.find(s=>s.querySelector('h3')?.textContent.trim()===spec.title);
  const originalWrap=section?.querySelector('.strategyMatrixWrap');

  if(!originalWrap){
    return '<div class="hintAdvancedNoRow">応用戦略表を取得できませんでした。</div>';
  }

  const wrap=originalWrap.cloneNode(true);
  wrap.classList.add('hintAdvancedTableWrap');

  const table=wrap.querySelector('.strategyMatrix');
  if(!table){
    return '<div class="hintAdvancedNoRow">応用戦略表を取得できませんでした。</div>';
  }

  const dealerLabel=d===11?'A':String(d);
  const headerRow=table.tHead?.rows?.[1];
  let dealerColIndex=-1;

  if(headerRow){
    [...headerRow.cells].forEach((cell,index)=>{
      if(index>0&&cell.textContent.trim()===dealerLabel){
        dealerColIndex=index;
      }
    });
  }

  // 現在HANDの行を金色の枠で囲う。
  let targetRow=null;
  if(spec.rowLabel){
    targetRow=[...table.tBodies[0].rows].find(
      row=>row.cells[0]?.textContent.trim()===spec.rowLabel
    )||null;
  }

  if(targetRow){
    [...targetRow.cells].forEach((cell,index)=>{
      cell.classList.add('hintTargetRow');
      if(index===0)cell.classList.add('hintRowStart');
      if(index===targetRow.cells.length-1)cell.classList.add('hintRowEnd');
    });
  }

  // Dealer列を緑系の枠で囲う。
  if(dealerColIndex>0&&headerRow){
    const colCells=[headerRow.cells[dealerColIndex]];
    [...table.tBodies[0].rows].forEach(row=>{
      if(row.cells[dealerColIndex])colCells.push(row.cells[dealerColIndex]);
    });

    colCells.forEach((cell,index)=>{
      cell.classList.add('hintTargetCol');
      if(index===0)cell.classList.add('hintColTop');
      if(index===colCells.length-1)cell.classList.add('hintColBottom');
    });

    if(targetRow?.cells[dealerColIndex]){
      targetRow.cells[dealerColIndex].classList.add('hintTargetCell');
    }
  }

  const noRowNote=!spec.rowLabel
    ? '<div class="hintAdvancedNoRow">現在のSoft 21は応用戦略表の範囲外です。アクションはSTANDです。</div>'
    : '';

  return `
    <div class="hintAdvancedTableBlock">
      <div class="hintAdvancedTableTitle">
        <b>${spec.title}</b>
        <span>金枠＝自分のHAND ／ 緑枠＝Dealer</span>
      </div>
      ${wrap.outerHTML}
      ${noRowNote}
    </div>
  `;
}

function renderStrategyHint(){
  const h=currentHand(),d=dealerUpValue(),root=$('strategyHintContent');
  if(!h||phase!=='play'||!dealer[0]){
    root.innerHTML='<div class="helpNote">現在は戦略ヒントを表示できるアクション状態ではありません。</div>';
    return;
  }
  let result,base=null,deviation=null,count=null;
  if(hintMode==='basic'){
    result=basicStrategyHint(h,d);
  }else{
    base=advancedStrategyHint(h,d);
    result={...base};
    if(hintMode==='expert'){
      count=trueCountSnapshot();
      deviation=expertDeviationHint(h,d,base,count);
      result.action=deviation.action;
      result.title=deviation.applied?'True Countで戦略を補正':base.title;
      result.reason=deviation.applied
        ?`応用戦略では ${actionLabel(base.action)} ですが、現在のHi-Lo CountがIndex条件に該当するため ${actionLabel(result.action)} に変更します。`
        :`${base.reason} 上級戦略による変更はありません。`;
    }
  }
  const unavailable=strategyAvailabilityNote(result.action,h);
  const modeName=hintMode==='basic'?'基本戦略のみ':hintMode==='advanced'?'応用戦略のみ':'応用戦略＋上級戦略';

  const explanationHtml=hintMode==='advanced'
    ?buildAdvancedHintTableHtml(h,d)
    :`<div class="hintExplain"><b>なぜ？</b><p>${result.reason}</p></div>`;

  root.innerHTML=`
    <div class="hintHandSummary">
      <div class="handSide">
        <span>自分のHAND</span>
        <b>${handDisplay(h.cards)}</b>
        <span>${handTypeLabel(h.cards)}</span>
      </div>
      <div class="hintDealer">
        <span>ディーラー表向き</span>
        <b>${dealer[0].r}${dealer[0].s}</b>
      </div>
    </div>
    <div class="hintRecommendation">
      <div class="hintActionBadge">${actionLabel(result.action)}</div>
      <div class="hintRecText">
        <span>${modeName}</span>
        <b>${result.title}</b>
      </div>
    </div>
    ${explanationHtml}
    ${hintMode==='expert'?`
      <div class="hintCountBox">
        <div class="hintCountMetric"><span>Running Count</span><b>${count.running>=0?'+':''}${count.running}</b></div>
        <div class="hintCountMetric"><span>残りデック</span><b>${count.remainingDecks.toFixed(1)}</b></div>
        <div class="hintCountMetric"><span>True Count</span><b>${count.raw>=0?'+':''}${count.raw.toFixed(1)}</b></div>
      </div>
      <div class="hintDeviation"><b>${deviation.label}</b><br>${deviation.detail}</div>
    `:''}
    ${unavailable?`<div class="hintUnavailable">${unavailable}</div>`:''}
  `;
}
function openStrategyHint(){
  if(phase!=='play'||!currentHand())return;
  document.querySelectorAll('.hintModeBtn').forEach(b=>b.classList.toggle('active',b.dataset.hintMode===hintMode));
  renderStrategyHint();
  $('strategyHintModal').classList.remove('hidden');
}
function closeStrategyHint(){$('strategyHintModal').classList.add('hidden')}

function currentHand(){return players[activePlayer]?.hands[activeHand]}
function splitValue(card){
  if(!card)return null;
  return ['10','J','Q','K'].includes(card.r)?10:card.r;
}
function canSplitHand(p,h){
  return !!(h&&h.cards.length===2&&
    splitValue(h.cards[0])===splitValue(h.cards[1])&&
    p.bank>=h.bet&&p.hands.length<3);
}
function hasNextPlayableHandSamePlayer(p,fromHandIndex){
  if(!p)return false;
  for(let i=fromHandIndex;i<p.hands.length;i++){
    const h=p.hands[i];
    if(!h||h.done)continue;
    // advancePlayer() が自動確定するNaturalは、操作対象HANDとして数えない。
    if(natural(h.cards,h.splitOrigin))continue;
    return true;
  }
  return false;
}
async function finishHandAndAdvance(signalDone,extraWait=null){
  const p=players[activePlayer];
  const waitNextPlayer=!hasNextPlayableHandSamePlayer(p,activeHand+1);

  if(extraWait)await extraWait;
  // 次HANDが同じプレイヤーなら、ハンドサイン消滅を待たず即移動。
  // 次プレイヤー（またはDealer）へ移る時だけサイン終了を待つ。
  if(waitNextPlayer&&signalDone)await signalDone;

  activeHand++;
  animating=false;
  advancePlayer();
}

async function settleEvenMoneyNow(pi,hi){
  const p=players[pi];
  const h=p?.hands?.[hi];
  if(!p||!h)return;

  const profit=h.bet;

  h.evenMoney=true;
  h.result=`EVEN MONEY +${fmt(profit)}`;
  h.payoutFormula=`${fmt(h.bet)} × 1 = ${fmt(profit)}`;

  $('message').textContent=`${p.name}：EVEN MONEY — +${fmt(profit)} 確定`;
  render();
  ensurePlayerVisible(pi,'smooth');
  await sleep(180);

  // 利益1倍をDealerから配り、元BETをBANKへ返す。
  await flyDealerPayout(pi,profit);
  await flyBetBackToBank(pi,h.bet,'BET RETURN');

  p.bank+=h.bet+profit;
  render();
  await sleep(320);
}

function advancePlayer(){
  while(activePlayer<players.length){
    let p=players[activePlayer];
    while(activeHand<p.hands.length&&p.hands[activeHand].done)activeHand++;

    if(activeHand<p.hands.length){
      let h=p.hands[activeHand];

      // Natural BJは初期配札直後には演出しない。
      // ACTION順でこのPLAYERがactiveになった瞬間に演出してから次へ進む。
      if(natural(h.cards,h.splitOrigin)){
        lastActionPlayer=activePlayer;
        animating=true;

        $('message').textContent=`${p.name}${p.type==='cpu'?'（CPU）':''}：BLACKJACK!`;
        updateButtons();
        render();
        ensurePlayerVisible(activePlayer,'smooth');

        const bjPlayer=activePlayer;
        const bjHand=activeHand;

        announceActiveBlackjack(bjPlayer).then(async()=>{
          const target=players[bjPlayer]?.hands?.[bjHand];
          if(!target){
            animating=false;
            advancePlayer();
            return;
          }

          // Dealerの1枚目がAなら、BJプレイヤーには通常InsuranceではなくEven Money。
          const takeEvenMoney=await askEvenMoneyForActiveBlackjack(bjPlayer,bjHand);

          if(takeEvenMoney){
            await settleEvenMoneyNow(bjPlayer,bjHand);
          }else if(dealer[0]?.r==='A' && players[bjPlayer]?.type!=='cpu'){
            $('message').textContent=`${players[bjPlayer].name}：EVEN MONEYを選択しない`;
            render();
            await sleep(300);
          }

          target.done=true;

          activePlayer=bjPlayer;
          activeHand=bjHand+1;
          blackjackAnnouncePlayer=-1;
          animating=false;
          advancePlayer();
        });
        return;
      }

      lastActionPlayer=activePlayer;
      $('message').textContent=`${p.name}${p.hands.length>1?` HAND ${activeHand+1}`:''}${p.type==='cpu'?'（CPU）':''}：アクション`;
      updateButtons();
      render();
      ensurePlayerVisible(activePlayer);
      if(p.type==='cpu')scheduleCpuAction();
      return;
    }

    activePlayer++;
    activeHand=0;
  }

  dealerTurn();
}
function updateButtons(){
  let p=players[activePlayer],h=currentHand(),two=h&&h.cards.length===2;
  const total=h?value(h.cards):0;
  const standOnly=total===21;
  const locked=animating;
  const cpuTurn=!!p&&p.type==='cpu';

  // CPUターン中は見た目・操作とも全ボタン非活性。
  // CPU自身の実行はonclick関数を直接呼び出すため、disabledでも進行できる。
  $('hitBtn').disabled=locked||cpuTurn||!h||standOnly;
  $('standBtn').disabled=locked||cpuTurn||!h;
  $('doubleBtn').disabled=locked||cpuTurn||standOnly||!(two&&p.bank>=h.bet);
  $('splitBtn').disabled=locked||cpuTurn||standOnly||!canSplitHand(p,h);
  $('surrenderBtn').disabled=locked||cpuTurn||standOnly||!(two&&!h.splitOrigin);
}


$('betHintBtn').addEventListener('click',openBetStrategyHint);
$('closeBetStrategyHint').addEventListener('click',closeBetStrategyHint);
$('betStrategyHintModal').addEventListener('click',e=>{if(e.target===$('betStrategyHintModal'))closeBetStrategyHint()});
document.querySelectorAll('.betHintModeBtn').forEach(btn=>btn.addEventListener('click',()=>{
  betHintMode=btn.dataset.betHintMode;
  document.querySelectorAll('.betHintModeBtn').forEach(b=>b.classList.toggle('active',b===btn));
  renderBetStrategyHint();
}));

$('hintBtn').addEventListener('click',openStrategyHint);
$('closeStrategyHint').addEventListener('click',closeStrategyHint);
$('strategyHintModal').addEventListener('click',e=>{if(e.target===$('strategyHintModal'))closeStrategyHint()});
document.querySelectorAll('.hintModeBtn').forEach(btn=>btn.addEventListener('click',()=>{
  hintMode=btn.dataset.hintMode;
  document.querySelectorAll('.hintModeBtn').forEach(b=>b.classList.toggle('active',b===btn));
  renderStrategyHint();
}));
$('hitBtn').onclick=async()=>{
  if(animating)return;
  let h=currentHand();
  if(!h||value(h.cards)>=21)return;

  animating=true;
  updateButtons();
  const signalDone=showHandSignal('hit','HIT');

  h.cards.push(draw());
  render();
  await sleep(680);

  const total=value(h.cards);

  if(total>21){
    const p=players[activePlayer];

    // 決着処理まで待たず、その場でBUSTを明示。
    h.result='BUST';
    h.done=true;
    $('message').textContent=`${p.name}${p.hands.length>1?` HAND ${activeHand+1}`:''}：BUST — TOTAL ${total}`;
    render();
    ensurePlayerVisible(activePlayer,'auto');

    // 赤いBUST表示とTOTALを認識できる短い間を残す。
    await sleep(700);

    // 同一プレイヤーの次HANDならハンドサイン終了を待たず移動。
    // 次プレイヤーへ移る場合だけ、従来どおりサイン終了を待つ。
    await finishHandAndAdvance(signalDone);
    return;
  }

  if(total===21){
    // TOTAL 21は同一HANDなのでサインを待たずSTANDだけ操作可能にする。
    animating=false;
    const p=players[activePlayer];
    $('message').textContent=`${p.name}${p.hands.length>1?` HAND ${activeHand+1}`:''}：TOTAL 21 — STANDで確定`;
    updateButtons();
    render();
    ensurePlayerVisible(activePlayer,'auto');
    if(p.type==='cpu')scheduleCpuAction();
    return;
  }

  // 同一HANDの次アクションもサイン消滅を待たない。
  animating=false;
  advancePlayer();
};
$('standBtn').onclick=async()=>{
  if(animating)return;
  const h=currentHand();
  if(!h)return;

  animating=true;
  updateButtons();
  const signalDone=showHandSignal('stand','STAND');

  h.done=true;
  await finishHandAndAdvance(signalDone);
};
$('doubleBtn').onclick=async()=>{
  if(animating)return;
  let p=players[activePlayer],h=currentHand();
  if(!h||h.cards.length!==2||p.bank<h.bet)return;

  animating=true;
  updateButtons();
  const signalDone=showHandSignal('double','');

  p.bank-=h.bet;
  h.bet*=2;
  h.cards.push(draw());
  render();
  ensurePlayerVisible(activePlayer,'auto');
  $('message').textContent=`${p.name}${p.hands.length>1?` HAND ${activeHand+1}`:''}：DOUBLE — 引いたカードを確認`;

  h.done=true;
  await finishHandAndAdvance(signalDone,sleep(1250));
};
$('surrenderBtn').onclick=async()=>{
  if(animating)return;
  let p=players[activePlayer],h=currentHand();
  if(!h||h.cards.length!==2||h.splitOrigin)return;

  animating=true;
  updateButtons();
  const signalDone=showHandSignal('surrender','SURRENDER');

  h.surrendered=true;
  h.done=true;
  p.bank+=h.bet/2;
  h.result=`SURRENDER -${fmt(h.bet/2)}`;
  render();

  await finishHandAndAdvance(signalDone);
};
$('splitBtn').onclick=async()=>{
  if(animating)return;
  let p=players[activePlayer],h=currentHand();
  if(!canSplitHand(p,h))return;

  animating=true;
  updateButtons();
  const signalDone=showHandSignal('split','');

  p.bank-=h.bet;
  const splitRank=h.cards[0].r;
  const c2=h.cards.pop();
  const h2={cards:[c2],bet:h.bet,done:false,surrendered:false,splitOrigin:true,result:''};
  h.splitOrigin=true;
  p.hands.splice(activeHand+1,0,h2);


  // Deal one card to each split hand, but keep the first hand active.
  h.cards.push(draw());
  render();
  await sleep(350);

  h2.cards.push(draw());
  render();
  await sleep(350);

  if(splitRank==='A'){
    // Split Aces: one additional card to each hand, then both hands end.
    $('message').textContent=`${p.name}：Split A — 追加カードを確認`;
    ensurePlayerVisible(activePlayer,'auto');
    await sleep(1400);
    h.done=true;
    h2.done=true;

    // activeHand+2 以降に操作対象HANDがなければ次プレイヤーへ移るため待つ。
    const waitNextPlayer=!hasNextPlayableHandSamePlayer(p,activeHand+2);
    if(waitNextPlayer)await signalDone;

    activeHand+=2;
    animating=false;
    advancePlayer();
    return;
  }

  // Normal splitは同じプレイヤーのHAND 1をそのまま継続。
  // ハンドサインが残っていても次アクションへ進める。
  h.done=false;
  h2.done=false;
  animating=false;
  advancePlayer();
};
let tableViewMorphing=false;

function useOverviewMode(){
  return players.length>1;
}

function clampMorphPercent(v){
  return Math.max(8,Math.min(92,v));
}

function setMorphOriginForPlayer(pi){
  const table=$('table');
  const stage=table?.querySelector('.gameStage');
  if(!table||!stage||pi==null||pi<0||pi>=players.length){
    table?.style.setProperty('--morph-x','50%');
    table?.style.setProperty('--morph-y','50%');
    return;
  }

  const seat=$('players')?.querySelector(`[data-player-index="${pi}"]`);
  if(!seat){
    table.style.setProperty('--morph-x','50%');
    table.style.setProperty('--morph-y','50%');
    return;
  }

  const sr=stage.getBoundingClientRect();
  const pr=seat.getBoundingClientRect();
  if(!sr.width||!sr.height)return;

  const cx=pr.left+pr.width/2;
  const cy=pr.top+pr.height/2;
  const x=clampMorphPercent((cx-sr.left)/sr.width*100);
  const y=clampMorphPercent((cy-sr.top)/sr.height*100);

  table.style.setProperty('--morph-x',`${x}%`);
  table.style.setProperty('--morph-y',`${y}%`);
}

function firstActionFocusPlayer(){
  // Dealer Aなら、最初にInsuranceを選択する人間PLAYER（USER/GUEST）を最優先。
  if(dealer[0]?.r==='A'){
    const insurancePlayer=players.findIndex(p=>
      p.type!=='cpu' &&
      p.bet>0 &&
      p.bank>=p.bet/2
    );
    if(insurancePlayer>=0)return insurancePlayer;
  }

  // 通常ACTIONで最初に操作するHAND。
  const playable=players.findIndex(p=>{
    const h=p.hands?.[0];
    return !!h && !natural(h.cards,h.splitOrigin);
  });
  if(playable>=0)return playable;

  // 全員Natural等の場合は、最初にカードがある席。
  const firstDealt=players.findIndex(p=>p.hands?.[0]?.cards?.length);
  return firstDealt>=0?firstDealt:0;
}

async function morphTableView(direction,mutate,focusPi=null){
  const table=$('table');
  const stage=table?.querySelector('.gameStage');
  const controls=table?.querySelector('.controls');

  if(!table||!stage){
    mutate?.();
    render();
    return;
  }

  while(tableViewMorphing)await sleep(20);
  tableViewMorphing=true;
  table.classList.add('viewMorphBusy');

  // ズーム/移動は完全廃止。
  // 現在レイアウトを短くフェードアウトし、
  // 低いopacityの間にレイアウトを切り替えてフェードインする。
  const fadeTargets=[stage];
  if(controls)fadeTargets.push(controls);

  const outAnimations=fadeTargets.map(el=>el.animate(
    [{opacity:1},{opacity:.10}],
    {
      duration:180,
      easing:'ease-out',
      fill:'forwards'
    }
  ));
  await Promise.all(outAnimations.map(a=>a.finished.catch(()=>{})));

  mutate?.();
  render();

  const scroller=$('players');
  if(scroller)scroller.scrollTop=0;

  await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));

  outAnimations.forEach(a=>a.cancel());

  const inAnimations=fadeTargets.map(el=>el.animate(
    [{opacity:.10},{opacity:1}],
    {
      duration:240,
      easing:'ease-in-out',
      fill:'forwards'
    }
  ));
  await Promise.all(inAnimations.map(a=>a.finished.catch(()=>{})));
  inAnimations.forEach(a=>a.cancel());

  table.classList.remove(
    'viewMorphBusy',
    'viewMorphOutToAction','viewMorphInToAction',
    'viewMorphOutToOverview','viewMorphInToOverview'
  );
  table.style.removeProperty('--morph-x');
  table.style.removeProperty('--morph-y');
  tableViewMorphing=false;
}

async function transitionBetOverviewToDealing(){
  const table=$('table');
  if(!table)return;

  // BET俯瞰→配札俯瞰では演出を入れない。
  // 両モードの外枠/DEALER/PLAYERグリッド寸法をCSSで完全に揃え、
  // classだけを切り替える。
  table.classList.remove(
    'overviewPhaseOut','overviewPhaseIn','overviewPhaseBusy',
    'betOverview','betPhase'
  );

  if(useOverviewMode())table.classList.add('dealingOverview');
  render();

  const scroller=$('players');
  if(scroller)scroller.scrollTop=0;
}

async function transitionOverviewToAction(){
  const focusPi=firstActionFocusPlayer();
  lastActionPlayer=focusPi;

  await morphTableView('action',()=>{
    const table=$('table');
    table?.classList.remove(
      'dealingOverview','dealerDealActive','betOverview','payoutOverview'
    );
  },focusPi);
}

async function enterPayoutOverview(){
  const table=$('table');

  // Dealer revealからすでに俯瞰へ入っている場合は二重ズームしない。
  if(table?.classList.contains('payoutOverview'))return;

  if(!useOverviewMode()){
    table?.classList.remove(
      'betOverview','dealingOverview','dealerDealActive','payoutOverview',
      'viewMorphOutToAction','viewMorphInToAction',
      'viewMorphOutToOverview','viewMorphInToOverview','viewMorphBusy'
    );
    return;
  }

  const focusPi=
    lastActionPlayer>=0&&lastActionPlayer<players.length
      ?lastActionPlayer
      :Math.max(0,Math.min(players.length-1,activePlayer));

  await morphTableView('overview',()=>{
    const table=$('table');
    if(!table)return;
    table.classList.remove('betPhase','betOverview','dealingOverview','dealerDealActive');
    table.classList.add('payoutOverview');
    table.dataset.dealSeats=String(players.length);
  },focusPi);
}

function leavePayoutOverview(){
  const table=$('table');
  if(!table)return;
  table.classList.remove(
    'payoutOverview',
    'viewMorphOutToAction','viewMorphInToAction',
    'viewMorphOutToOverview','viewMorphInToOverview',
    'viewMorphBusy'
  );
  table.style.removeProperty('--morph-x');
  table.style.removeProperty('--morph-y');
  tableViewMorphing=false;
}

async function dealerTurn(){
  document.querySelector('.controls').classList.remove('betCompact','playCompact');
  phase='dealer';
  $('playActions').classList.add('hidden');
  document.querySelector('.controls').classList.add('dealerHidden');

  // PLAYER ACTION終了後、まず俯瞰へフェード切替。
  await enterPayoutOverview();

  // Paradise City No Hole Card:
  // ここで初めてDealerの2枚目を表向きで引く。
  $('message').textContent='Dealer：SECOND CARD';
  await sleep(260);

  if(dealer.length<2){
    const forced=testDeal.dealer?.[1]||null;
    dealer.push(drawSpecified(forced));
  }
  reveal=true;
  render();
  await sleep(620);

  // 2枚目を引いた時点で初めてBLACKJACK判定。
  if(natural(dealer)){
    $('message').textContent='Dealer BLACKJACK';
    await showDealerBlackjackCheckCue(true);
    await settleDealerBlackjack();
    return;
  }

  // DealerがBLACKJACKでなければInsuranceはLOSE。
  if(players.some(p=>p.insurance)){
    players.forEach(p=>{
      if(p.insurance){
        p.result='Insurance LOSE';
      }
    });
    $('message').textContent='Insurance LOSE';
    render();
    await sleep(430);
  }

  while(value(dealer)<17){
    $('message').textContent=`Dealer ${value(dealer)} — HIT`;
    await sleep(430);
    dealer.push(draw());
    render();
    await sleep(540);
  }

  $('message').textContent=`Dealer ${value(dealer)} — STAND`;
  await sleep(650);
  await settle();
}
function payoutChipBreakdown(amount,maxChips=8){
  let left=Math.max(0,Math.round(amount));
  if(!left)return [];

  // 現在のテーブルで使用しているチップ額を大きい順に使い、
  // 実際の配当額を複数枚のチップへ分解する。
  const vals=chipValues()
    .slice()
    .sort((a,b)=>b-a)
    .filter(v=>v>0);

  const out=[];
  for(const v of vals){
    while(left>=v&&out.length<maxChips-1){
      out.push(v);
      left-=v;
    }
  }

  // 端数や8枚を超える分は最後の1枚へまとめ、配当総額は変えない。
  if(left>0)out.push(left);
  return out.length?out:[Math.round(amount)];
}

function payoutChipLabel(value){
  const n=Math.max(0,Math.round(value));
  if(n>=100000000){
    const v=n/100000000;
    return `${Number.isInteger(v)?v:v.toFixed(1).replace(/\.0$/,'')}億`;
  }
  if(n>=10000){
    const v=n/10000;
    return `${Number.isInteger(v)?v:v.toFixed(1).replace(/\.0$/,'')}万`;
  }
  if(n>=1000){
    const v=n/1000;
    return `${Number.isInteger(v)?v:v.toFixed(1).replace(/\.0$/,'')}千`;
  }
  return String(n);
}

async function flyDealerPayout(pi,amount){
  if(!amount)return;
  await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));

  const dealerEl=document.querySelector('.dealer');
  const seat=document.querySelectorAll('.seat')[pi];
  if(!dealerEl||!seat)return;

  const values=payoutChipBreakdown(amount,8);
  if(!values.length)return;

  sfxPayout();

  const from=dealerEl.getBoundingClientRect();
  const to=seat.getBoundingClientRect();
  const startX=from.left+from.width/2;
  const startY=from.top+53;
  const endX=to.left+to.width/2;
  const endY=to.top+42;

  const chips=[];
  const animations=[];

  // 配当額を1つの文字列で飛ばすのではなく、
  // チップを1枚ずつ少し時間差を付けてディーラーから配る。
  values.forEach((value,index)=>{
    const chip=document.createElement('div');
    chip.className='flyingChip payoutChipVisual';
    chip.innerHTML=`<span class="payoutChipValue">${payoutChipLabel(value)}</span>`;

    const startOffsetX=((index%3)-1)*6;
    const startOffsetY=-Math.floor(index/3)*3;
    const spread=(index-(values.length-1)/2)*8;

    chip.style.left=(startX-19+startOffsetX)+'px';
    chip.style.top=(startY-19+startOffsetY)+'px';
    chip.style.zIndex=String(9999+index);
    document.body.appendChild(chip);

    const dx=(endX+spread)-(startX+startOffsetX);
    const dy=(endY+Math.min(index,4)*2)-(startY+startOffsetY);
    const rotate=(index%2===0?1:-1)*(5+index*2);

    const animation=chip.animate([
      {transform:'translate(0,0) scale(.72)',opacity:0},
      {transform:`translate(${dx*.18}px,${dy*.08-12}px) scale(1) rotate(${rotate*.35}deg)`,opacity:1,offset:.20},
      {transform:`translate(${dx*.58}px,${dy*.42-44}px) scale(1.04) rotate(${rotate}deg)`,opacity:1,offset:.60},
      {transform:`translate(${dx}px,${dy}px) scale(.9) rotate(0deg)`,opacity:1}
    ],{
      duration:620,
      delay:index*65,
      easing:'cubic-bezier(.18,.75,.18,1)',
      fill:'forwards'
    });

    chips.push(chip);
    animations.push(animation.finished.catch(()=>{}));
  });

  await Promise.all(animations);
  await sleep(180);
  chips.forEach(chip=>chip.remove());
}
async function flyBetBackToBank(pi,amount,label='BET RETURN'){if(!amount)return;await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));let seat=document.querySelectorAll('.seat')[pi];if(!seat)return;let bank=seat.querySelector('.seatHead span:last-child');if(!bank)return;sfxCollect();let sr=seat.getBoundingClientRect(),br=bank.getBoundingClientRect();let chip=document.createElement('div');chip.className='flyingChip payoutChipVisual';chip.innerHTML=`<span class="payoutChipValue">${payoutChipLabel(amount)}</span>`;chip.style.left=(sr.left+sr.width/2-19)+'px';chip.style.top=(sr.top+42)+'px';document.body.appendChild(chip);let dx=(br.left+br.width/2)-(sr.left+sr.width/2),dy=(br.top+br.height/2)-(sr.top+61);let a=chip.animate([{transform:'translate(0,0) scale(.9)',opacity:1},{transform:`translate(${dx*.55}px,${dy-26}px) scale(.95)`,opacity:1,offset:.55},{transform:`translate(${dx}px,${dy}px) scale(.55)`,opacity:.15}],{duration:560,easing:'cubic-bezier(.22,.7,.2,1)',fill:'forwards'});await a.finished.catch(()=>{});chip.remove();bank.classList.add('bankFlash');setTimeout(()=>bank.classList.remove('bankFlash'),720)}
async function flyLostBetToDealer(pi,amount){
  if(!amount)return;

  await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));

  const seat=document.querySelectorAll('.seat')[pi];
  const dealerEl=document.querySelector('.dealer');
  if(!seat||!dealerEl)return;

  const source=
    seat.querySelector('.overviewChipSlot') ||
    seat.querySelector('.chipStack') ||
    seat;

  const sr=source.getBoundingClientRect();
  const dr=dealerEl.getBoundingClientRect();

  const startX=sr.left+sr.width/2;
  const startY=sr.top+Math.min(sr.height*.55,42);
  const endX=dr.left+dr.width/2;
  const endY=dr.top+dr.height*.58;

  const values=payoutChipBreakdown(amount,6);
  if(!values.length)return;

  sfxDealerCollect();

  const chips=[];
  const animations=[];

  values.forEach((value,index)=>{
    const chip=document.createElement('div');
    chip.className='flyingChip payoutChipVisual dealerCollectChip';
    chip.innerHTML=`<span class="payoutChipValue">${payoutChipLabel(value)}</span>`;

    const sx=((index%3)-1)*5;
    const sy=-Math.floor(index/3)*3;

    chip.style.left=(startX-19+sx)+'px';
    chip.style.top=(startY-19+sy)+'px';
    chip.style.zIndex=String(10020+index);
    document.body.appendChild(chip);

    const dx=endX-(startX+sx);
    const dy=endY-(startY+sy);
    const side=(index-(values.length-1)/2)*5;

    const anim=chip.animate([
      {
        transform:'translate(0,0) scale(.92)',
        opacity:1
      },
      {
        transform:`translate(${dx*.26+side}px,${dy*.18-24}px) scale(1) rotate(${side*.45}deg)`,
        opacity:1,
        offset:.30
      },
      {
        transform:`translate(${dx*.70}px,${dy*.66-20}px) scale(.82) rotate(${side*.7}deg)`,
        opacity:.96,
        offset:.72
      },
      {
        transform:`translate(${dx}px,${dy}px) scale(.42) rotate(0deg)`,
        opacity:.08
      }
    ],{
      duration:560,
      delay:index*55,
      easing:'cubic-bezier(.28,.62,.24,1)',
      fill:'forwards'
    });

    chips.push(chip);
    animations.push(anim.finished.catch(()=>{}));
  });

  await Promise.all(animations);
  chips.forEach(chip=>chip.remove());

  dealerEl.classList.remove('dealerCollectFlash');
  void dealerEl.offsetWidth;
  dealerEl.classList.add('dealerCollectFlash');
  setTimeout(()=>dealerEl.classList.remove('dealerCollectFlash'),480);

  await sleep(100);
}

async function settleDealerBlackjack(){
  phase='settling';
  await enterPayoutOverview();

  $('playActions').classList.add('hidden');
  $('insuranceBox').style.display='none';

  for(let pi=0;pi<players.length;pi++){
    const p=players[pi];
    settlingPlayer=pi;
    render();
    ensurePlayerVisible(pi,'smooth');
    await sleep(280);

    let returned=0;
    let lost=0;

    for(const h of p.hands){
      if(h.evenMoney){
        // ACTION時点ですでにBET返却 + 利益1倍まで精算済み。
        continue;
      }
      if(natural(h.cards,h.splitOrigin)){
        h.result='PUSH';
        returned+=h.bet;
      }else{
        h.result='LOSE';
        lost+=h.bet;
      }
    }

    render();

    if(lost){
      $('message').textContent=`${p.name}：LOSE — BETをDealerが回収`;
      await flyLostBetToDealer(pi,lost);
    }

    if(returned){
      $('message').textContent=`${p.name}：PUSH — BET返却`;
      await flyBetBackToBank(pi,returned);
      p.bank+=returned;
      render();
    }

    if(p.insurance){
      $('message').textContent=`${p.name}：Insurance WIN`;
      await flyDealerPayout(pi,p.insurance*2);
      await flyBetBackToBank(pi,p.insurance,'INS BET');
      p.bank+=p.insurance*3;

      for(const h of p.hands){
        h.result+=(h.result?' / ':'')+`Insurance WIN +${fmt(p.insurance*2)}`;
      }
      render();
    }

    await settlePlayerCue(pi);
    await sleep(120);
  }

  recordRoundHistory();
  phase='result';
  $('message').textContent='Dealer BLACKJACK';
  showRoundBanner();
  render();
  await showResultPanel();

  if(allPlayersBankrupt())showGameOver();
}

async function settle(){
  const dv=value(dealer);
  phase='settling';
  await enterPayoutOverview();

  for(let pi=0;pi<players.length;pi++){
    const p=players[pi];
    settlingPlayer=pi;
    render();
    ensurePlayerVisible(pi,'smooth');
    await sleep(280);

    for(let hi=0;hi<p.hands.length;hi++){
      const h=p.hands[hi];
      if(h.surrendered||h.evenMoney)continue;

      const pv=value(h.cards);
      let profit=0;
      let returnBet=0;
      let lostBet=0;

      if(pv>21){
        h.result='BUST / LOSE';
        lostBet=h.bet;
      }else if(natural(h.cards,h.splitOrigin)){
        profit=h.bet*1.5;
        returnBet=h.bet;
        h.result=`BLACKJACK +${fmt(profit)}`;
        h.payoutFormula=`${fmt(h.bet)} × 1.5 = ${fmt(profit)}`;
      }else if(dv>21||pv>dv){
        profit=h.bet;
        returnBet=h.bet;
        h.result=`WIN +${fmt(profit)}`;
        h.payoutFormula=`${fmt(h.bet)} × 1 = ${fmt(profit)}`;
      }else if(pv===dv){
        returnBet=h.bet;
        h.result='PUSH';
      }else{
        h.result='LOSE';
        lostBet=h.bet;
      }

      render();

      if(lostBet){
        $('message').textContent=
          `${p.name}${p.hands.length>1?` HAND ${hi+1}`:''}：${pv>21?'BUST / ':''}LOSE — BET回収`;
        await flyLostBetToDealer(pi,lostBet);
      }

      if(profit){
        $('message').textContent=
          `${p.name}${p.hands.length>1?` HAND ${hi+1}`:''}：${h.result.startsWith('BLACKJACK')?'BLACKJACK':'WIN'} — 配当`;
        await flyDealerPayout(pi,profit);
      }

      if(returnBet){
        await flyBetBackToBank(pi,returnBet);
        p.bank+=returnBet+profit;
        render();
      }

      await sleep(260);
    }

    await settlePlayerCue(pi);
  }

  recordRoundHistory();
  phase='result';
  $('message').textContent=`ROUND END — Dealer ${dv}${dv>21?' BUST':''}`;
  showRoundBanner();
  render();
  await showResultPanel();

  if(allPlayersBankrupt())showGameOver();
}

function recordRoundHistory(){
  if(roundNo<=0||lastRecordedRound===roundNo)return;

  const dealerTotal=value(dealer);
  const dealerLabel=natural(dealer,false)
    ?'BJ'
    :dealerTotal>21
      ?'BUST'
      :String(dealerTotal);

  const snapshots=players.map((p,pi)=>{
    const wins=p.hands.filter(h=>handOutcomeType(h)==='win').length;
    const losses=p.hands.filter(h=>handOutcomeType(h)==='lose').length;
    const pushes=p.hands.filter(h=>handOutcomeType(h)==='push').length;
    const wagered=p.hands.reduce((s,h)=>s+(h.bet||0),0)+(p.insurance||0);

    return {
      seat:pi,
      name:p.name,
      type:p.type,
      cpuLevel:p.cpuLevel||'',
      initial:p.initial,
      bankAfter:p.bank,
      roundStartBank:p.roundStartBank,
      net:p.bank-p.roundStartBank,
      wagered,
      wins,
      losses,
      pushes,
      handTotals:p.hands.map((h,hi)=>({
        no:hi+1,
        total:natural(h.cards,h.splitOrigin)?'BJ':String(value(h.cards))
      }))
    };
  });

  roundHistory.push({
    round:roundNo,
    shoe:shoeNo,
    dealer:dealerLabel,
    dealerTotal,
    dealerBlackjack:natural(dealer,false),
    dealerBust:dealerTotal>21,
    players:snapshots,
    userNet:snapshots
      .filter(x=>x.type==='user')
      .reduce((s,x)=>s+x.net,0),
    wins:snapshots.reduce((s,x)=>s+x.wins,0),
    losses:snapshots.reduce((s,x)=>s+x.losses,0),
    pushes:snapshots.reduce((s,x)=>s+x.pushes,0)
  });

  const portalUser=snapshots.find(x=>x.type==='user');
  if(portalUser){
    // ポータル戦績はHAND数ではなくROUND単位で集計する。
    // Split等で複数HANDになっても、1 ROUND = 1 PLAY / 1 RESULTを維持する。
    mgPortalRecordPlay('blackjack','BLACKJACK',game=>{
      const wins=mgPortalRecordValue(game,'wins')+(portalUser.net>0?1:0);
      const losses=mgPortalRecordValue(game,'losses')+(portalUser.net<0?1:0);
      const pushes=mgPortalRecordValue(game,'pushes')+(portalUser.net===0?1:0);
      mgPortalSetRecord(game,'wins','WIN',wins);
      mgPortalSetRecord(game,'losses','LOSE',losses);
      mgPortalSetRecord(game,'pushes','PUSH',pushes);
      const decided=wins+losses;
      mgPortalSetRecord(game,'winRate','WIN RATE',decided?wins/decided*100:0,'percent');
      mgPortalSetRecord(game,'maxBank','MAX BANK',Math.max(mgPortalRecordValue(game,'maxBank'),portalUser.bankAfter),'krw');
    });
  }

  lastRecordedRound=roundNo;
}
function allPlayersBankrupt(){return allUsersBankrupt()}
function showGameOver(){
  phase='gameover';
  $('message').textContent='GAME OVER — 全PLAYERの残高が ₩0 になりました';
  const result=$('gameOverResultText');if(result)result.textContent='全PLAYERの残高が ₩0 になりました';
  $('gameOverModal').classList.remove('hidden');
}
function showRoundBanner(){if(players.length>1){let el=$('roundBanner');el.className='roundBanner';el.textContent='';return}let rs=players.flatMap(p=>p.hands.map(h=>h.result));let w=rs.filter(r=>r.includes('WIN')||r.includes('BLACKJACK')||r.includes('EVEN MONEY')).length,l=rs.filter(r=>r.includes('LOSE')||r.includes('BUST')).length;let el=$('roundBanner');el.className='roundBanner show '+(w>l?'win':l>w?'lose':'push');el.textContent=w>l?`PLAYER WIN × ${w}`:l>w?`PLAYER LOSE × ${l}`:`PUSH / MIXED RESULT`}

function handOutcomeType(h){
  const r=h.result||'';
  if(r.includes('BLACKJACK')||r.includes('WIN'))return'win';
  if(r.includes('PUSH'))return'push';
  if(r.includes('LOSE')||r.includes('BUST')||r.includes('SURRENDER'))return'lose';
  return'';
}
function playerOutcomeType(p){
  const types=p.hands.map(handOutcomeType).filter(Boolean);
  if(!types.length)return'';
  const uniq=[...new Set(types)];
  if(uniq.length===1)return uniq[0];
  return'mixed';
}
function playerOutcomeLabel(p){
  const t=playerOutcomeType(p);
  return t==='win'?'WIN':t==='lose'?'LOSE':t==='push'?'PUSH':t==='mixed'?'MIXED':'';
}
function signedFmt(v){
  if(v>0)return'+'+fmt(v);
  if(v<0)return'-'+fmt(Math.abs(v));
  return'±'+fmt(0);
}
function buildResultHtml(){
  return `<div class="resultPanelTitle">ROUND ${roundNo} RESULT</div>`+
    players.map((p,pi)=>{
      const delta=p.bank-p.roundStartBank;
      const type=delta>0?'win':delta<0?'lose':'push';
      const hands=p.hands.map((h,hi)=>{
        const label=p.hands.length>1?`HAND ${hi+1}`:'HAND';
        const formula=h.payoutFormula?`<div class="resultFormula">配当：${h.payoutFormula}</div>`:'';
        return `<div class="resultHand"><span>${label} ・ TOTAL ${value(h.cards)}</span><b>${h.result||'-'}</b></div>${formula}`;
      }).join('');
      return `<div class="resultPlayer">
        <div class="resultPlayerHead"><span>${p.name}</span><span class="playerResultBadge ${playerOutcomeType(p)}">${playerOutcomeLabel(p)}</span></div>
        <div class="resultHands">${hands}</div>
        <div class="resultTotals"><span>このラウンド</span><b class="resultDelta ${type}">${signedFmt(delta)}</b></div>
        <div class="resultTotals"><span>元金</span><b>${fmt(p.initial)}</b></div>
        <div class="resultTotals"><span>残高</span><b>${fmt(p.roundStartBank)} → ${fmt(p.bank)}</b></div>
        <div class="resultTotals"><span>元金差</span><b class="resultDelta ${p.bank-p.initial>0?'win':p.bank-p.initial<0?'lose':'push'}">${signedFmt(p.bank-p.initial)}</b></div>
      </div>`;
    }).join('');
}
function openRoundResult(){
  if(phase!=='result'&&phase!=='gameover')return;
  $('roundResultSub').textContent=`ROUND ${roundNo}`;
  $('roundResultContent').innerHTML=buildResultHtml();
  $('modalNextRound').classList.toggle('hidden',allPlayersBankrupt());
  $('roundResultModal').classList.remove('hidden');
}
function closeRoundResult(){
  $('roundResultModal').classList.add('hidden');
}
async function showResultPanel(){
  settlingPlayer=-1;
  // 配当後の最終状態を一呼吸見せてから結果一覧を開く。
  const controls=document.querySelector('.controls');
  controls.classList.remove('resultMode','singleResult','dealerHidden');
  controls.classList.add('resultCompact');
  $('resultBtn').disabled=false;
  render();

  await sleep(950);

  if(phase!=='result'&&phase!=='gameover')return;
  openRoundResult();
}
async function settlePlayerCue(pi){
  settlingPlayer=pi;
  render();
  ensurePlayerVisible(pi);
  await sleep(180);
  const p=players[pi];
  const type=playerOutcomeType(p);
  const badge=document.querySelectorAll('.seat')[pi]?.querySelector('.playerResultBadge');
  if(badge)badge.classList.add('bankFlash');
  if(type==='win')sfxWin();
  else if(type==='push'||type==='mixed')sfxPush();
  else if(type==='lose')sfxLose();
  await sleep(520);
}

function escStats(s){
  return String(s).replace(/[&<>"']/g,m=>({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'
  }[m]));
}
function sessionPlayerStats(){
  const map=new Map();

  for(const r of roundHistory){
    for(const p of r.players){
      const key=`${p.type}|${p.name}`;
      if(!map.has(key)){
        map.set(key,{
          key,
          name:p.name,
          type:p.type,
          cpuLevel:p.cpuLevel,
          initial:p.initial,
          bank:p.bankAfter,
          rounds:0,
          wagered:0,
          profit:0,
          positiveRounds:0,
          wins:0,
          losses:0,
          pushes:0
        });
      }
      const s=map.get(key);
      s.bank=p.bankAfter;
      s.rounds++;
      s.wagered+=p.wagered;
      s.profit+=p.net;
      if(p.net>0)s.positiveRounds++;
      s.wins+=p.wins;
      s.losses+=p.losses;
      s.pushes+=p.pushes;
    }
  }

  // ラウンド未完了/未記録の現参加者も一覧から消さない。
  for(const p of players){
    const key=`${p.type}|${p.name}`;
    if(!map.has(key)){
      map.set(key,{
        key,
        name:p.name,
        type:p.type,
        cpuLevel:p.cpuLevel||'',
        initial:p.initial,
        bank:p.bank,
        rounds:0,
        wagered:0,
        profit:p.bank-p.initial,
        positiveRounds:0,
        wins:0,
        losses:0,
        pushes:0
      });
    }else{
      map.get(key).bank=p.bank;
    }
  }

  return [...map.values()];
}
function renderStatsModal(){
  const rows=sessionPlayerStats();
  const completed=roundHistory.length;
  const totalWins=roundHistory.reduce((s,r)=>s+r.wins,0);
  const totalLosses=roundHistory.reduce((s,r)=>s+r.losses,0);
  const totalPushes=roundHistory.reduce((s,r)=>s+r.pushes,0);
  const totalHands=totalWins+totalLosses+totalPushes;

  const playerHtml=`
    <div class="statsGrid">
      <div class="statBox"><b>${completed}</b><span>ROUNDS</span></div>
      <div class="statBox"><b>${players.length}</b><span>PLAYERS</span></div>
      <div class="statBox"><b>${totalHands}</b><span>HANDS</span></div>
      <div class="statBox"><b>${totalWins}</b><span>WIN</span></div>
      <div class="statBox"><b>${totalLosses}</b><span>LOSE</span></div>
      <div class="statBox"><b>${totalPushes}</b><span>PUSH</span></div>
    </div>

    ${rows.map(p=>{
      const diff=p.bank-p.initial;
      const diffClass=diff>0?'win':diff<0?'lose':'push';
      const level=p.type==='cpu'&&p.cpuLevel?` ${String(p.cpuLevel).toUpperCase()}`:'';
      return `<div class="statsPlayerCard">
        <div class="statsPlayerHead">
          <span>${escStats(p.name)}<em class="statsPlayerType">${p.type==='cpu'?`CPU${level}`:p.type==='guest'?'GUEST':'USER'}</em></span>
          <b class="statsProfit ${diffClass}">${signedFmt(diff)}</b>
        </div>
        <div class="statsPlayerMeta">
          <span>BANK<br><b>${fmt(p.bank)}</b></span>
          <span>START BANK<br><b>${fmt(p.initial)}</b></span>
          <span>TOTAL BET<br><b>${fmt(p.wagered)}</b></span>
          <span>WIN / LOSE / PUSH<br><b>${p.wins} / ${p.losses} / ${p.pushes}</b></span>
          <span>＋ROUND / ROUNDS<br><b>${p.positiveRounds} / ${p.rounds}</b></span>
          <span>損益<br><b class="statsProfit ${diffClass}">${signedFmt(diff)}</b></span>
        </div>
      </div>`;
    }).join('')}`;

  const historyRows=[...roundHistory].reverse().map(r=>{
    const playerLines=r.players.map(p=>{
      const cls=p.net>0?'histWin':p.net<0?'histLose':'histPush';
      const totals=(p.handTotals||[]).map((h,i)=>
        (p.handTotals||[]).length>1?`H${h.no} ${h.total}`:`TOTAL ${h.total}`
      ).join(' / ');
      return `<div class="histPlayerLine">
        <div class="histPlayerMain">
          <span class="name">${escStats(p.name)}</span>
          <span class="wl">W${p.wins} / L${p.losses} / P${p.pushes}</span>
          <span class="net ${cls}">${signedFmt(p.net)}</span>
        </div>
        <div class="histHandTotals">${totals||'TOTAL -'}</div>
      </div>`;
    }).join('');

    return `<tr>
      <td>${r.round}</td>
      <td><span class="histDealer">${r.dealer}</span></td>
      <td class="histWin">${r.wins}</td>
      <td class="histLose">${r.losses}</td>
      <td class="histPush">${r.pushes}</td>
      <td class="histPlayers">${playerLines}</td>
    </tr>`;
  }).join('');

  const historyHtml=`
    <div class="historyTitle">
      <b>GAME HISTORY</b>
      <span>各プレイヤーの結果 / HAND TOTAL</span>
    </div>
    <div class="historyWrap">
      <table class="historyTable">
        <thead>
          <tr>
            <th>NO.</th>
            <th>DEALER</th>
            <th>WIN</th>
            <th>LOSE</th>
            <th>PUSH</th>
            <th>PLAYER RESULTS</th>
          </tr>
        </thead>
        <tbody>${historyRows||'<tr><td colspan="6">NO RESULTS</td></tr>'}</tbody>
      </table>
    </div>`;

  $('statsContent').innerHTML=statsMode==='players'?playerHtml:historyHtml;
  $('statsPlayerTab').classList.toggle('active',statsMode==='players');
  $('statsHistoryTab').classList.toggle('active',statsMode==='history');
  $('statsContent').scrollTop=0;
}
function openStats(){
  statsMode='players';
  renderStatsModal();
  $('statsModal').classList.remove('hidden');
}
function closeStats(){
  $('statsModal').classList.add('hidden');
}

function ensurePlayerVisible(pi,behavior='smooth'){
  const table=$('table');
  if(table?.classList.contains('dealingOverview')||
     table?.classList.contains('betOverview')||
     table?.classList.contains('payoutOverview'))return;
  if(pi==null||pi<0)return;
  requestAnimationFrame(()=>requestAnimationFrame(()=>{
    const scroller=$('players');
    const seat=scroller?.querySelector(`[data-player-index="${pi}"]`);
    if(!scroller||!seat)return;

    const sr=scroller.getBoundingClientRect();
    const tr=seat.getBoundingClientRect();

    // Convert the seat's current viewport position into the PLAYER scroller's
    // own coordinate system, then align it near the top.
    const target=scroller.scrollTop+(tr.top-sr.top)-5;
    scroller.scrollTo({
      top:Math.max(0,target),
      behavior
    });
  }));
}
function currentFocusPlayer(){
  if(phase==='bet'||phase==='play')return activePlayer;
  if(phase==='insurance')return insuranceIndex;
  if(phase==='settling')return settlingPlayer;
  return -1;
}
function render(){ const table=$('table');if(table){table.dataset.dealSeats=String(players.length);table.classList.toggle('dealerDealActive',phase==='dealing'&&dealingDealerActive)} $('roundCounter').textContent=`ROUND ${Math.max(roundNo,1)}`;$('shoeCount').textContent=`SHOE ${shoeNo} ・ ${deck.length} cards${cutCardSeen?' ・ LAST GAME':''}`;$('dealerCards').innerHTML=dealer.map((c,i)=>cardHTML(c,!reveal&&i===1)).join('');$('dealerScore').textContent=dealer.length?(dealer.length===1?`(${value(dealer)})`:(reveal?`(${value(dealer)})`:`(${dealer[0]?value([dealer[0]]):''} + ?)`)):'';$('players').innerHTML=players.map((p,pi)=>{let tempBet=phase==='bet'&&pi===activePlayer?currentBet:p.bet;return `<div class="seat ${(((phase==='bet'||phase==='play'||(phase==='dealing'&&!dealingDealerActive))&&pi===activePlayer)||(phase==='insurance'&&pi===insuranceIndex)||(phase==='settling'&&pi===settlingPlayer))?'active':''} ${pi===blackjackAnnouncePlayer?'blackjackFlash':''}" data-player-index="${pi}"><div class="seatHead"><span>${p.name}${p.type==='cpu'?`<em class="cpuBadge">CPU ${String(p.cpuLevel||'advanced').toUpperCase()}</em>`:p.type==='guest'?`<em class="cpuBadge">GUEST</em>`:`<em class="cpuBadge cpuBadgeSpacer" aria-hidden="true">CPU ADVANCED</em>`}</span><span>BANK ${fmt(p.bank)}</span></div><div class="overviewChipSlot">${chipStackHTML(tempBet)}</div>${p.hands.length?`<div class="handsRow ${p.hands.length>1?'splitHands':''} ${p.hands.length===3?'threeHands':''}">${p.hands.map((h,hi)=>`<div class="handBlock ${phase==='play'&&pi===activePlayer&&hi===activeHand?'activeHand':''} ${phase==='play'&&pi===activePlayer&&p.hands.length>1&&hi!==activeHand?'dimmedHand':''}"><div class="handTitle">${p.hands.length>1?`HAND ${hi+1} ・ `:''}BET ${fmt(h.bet)}</div><div class="cards">${h.cards.map(c=>cardHTML(c)).join('')}</div><div class="handTotal">${h.cards.length?`TOTAL ${value(h.cards)}`:'&nbsp;'}</div><div class="handResult result ${resultClass(h.result)}">${h.result||''}</div></div>`).join('')}</div>`:`<div class="handsRow"><div class="handBlock handPlaceholder"><div class="handTitle">BET ${fmt(tempBet)}</div><div class="cards"></div><div class="handTotal"></div><div class="handResult"></div></div></div>`}${p.insurance?`<div class="result">Insurance ${fmt(p.insurance)}</div>`:''}</div>`}).join('');markSeen();ensurePlayerVisible(currentFocusPlayer())}
function startLoungeBgm(){
 if(bgmOn)return;
 audioCtx=audioCtx||new (window.AudioContext||window.webkitAudioContext)();
 if(audioCtx.state==='suspended')audioCtx.resume();
 bgmOn=true;bgmMode='lounge';const session=++bgmSession;$('bgmBtn').textContent='BGM：LOUNGE';
 const master=audioCtx.createGain(),room=audioCtx.createBiquadFilter();
 bgmMaster=master;
 master.gain.value=.16*bgmVolume;room.type='lowpass';room.frequency.value=4200;room.Q.value=.3;room.connect(master);master.connect(audioCtx.destination);
 const bpm=76,beat=60/bpm,bar=beat*4;
 const chords=[
  [261.63,311.13,392.00,466.16], // Cm7
  [207.65,261.63,311.13,392.00], // Abmaj7
  [233.08,293.66,349.23,440.00], // Bb6/9 feel
  [196.00,246.94,293.66,349.23]  // Gm7
 ];
 const bass=[65.41,51.91,58.27,49.00];
 let barIndex=0,nextTime=audioCtx.currentTime+.05;
 function envGain(t,peak,attack,hold,release){let g=audioCtx.createGain();g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(peak,t+attack);g.gain.setValueAtTime(peak,t+attack+hold);g.gain.exponentialRampToValueAtTime(.0001,t+attack+hold+release);return g}
 function pianoTone(freq,t,dur,vol=.024){let o=audioCtx.createOscillator(),g=envGain(t,vol,.012,dur*.5,dur*.45),f=audioCtx.createBiquadFilter();o.type='triangle';o.frequency.setValueAtTime(freq,t);f.type='lowpass';f.frequency.value=2200;o.connect(f);f.connect(g);g.connect(room);o.start(t);o.stop(t+dur+.08)}
 function bassTone(freq,t,dur){let o=audioCtx.createOscillator(),g=envGain(t,.028,.02,dur*.62,dur*.3),f=audioCtx.createBiquadFilter();o.type='sine';o.frequency.setValueAtTime(freq,t);f.type='lowpass';f.frequency.value=330;o.connect(f);f.connect(g);g.connect(room);o.start(t);o.stop(t+dur+.08)}
 function vibeTone(freq,t){let o=audioCtx.createOscillator(),g=envGain(t,.012,.008,.12,.6);o.type='sine';o.frequency.setValueAtTime(freq*2,t);o.connect(g);g.connect(room);o.start(t);o.stop(t+.85)}
 function brush(t,strong=false){let len=Math.floor(audioCtx.sampleRate*.08),buf=audioCtx.createBuffer(1,len,audioCtx.sampleRate),data=buf.getChannelData(0);for(let i=0;i<len;i++)data[i]=(Math.random()*2-1)*(1-i/len);let s=audioCtx.createBufferSource(),f=audioCtx.createBiquadFilter(),g=audioCtx.createGain();s.buffer=buf;f.type='highpass';f.frequency.value=strong?1500:2500;g.gain.value=strong?.008:.0045;s.connect(f);f.connect(g);g.connect(room);s.start(t)}
 function scheduleBar(){
  if(!bgmOn||session!==bgmSession)return;
  let c=chords[barIndex%chords.length],t=nextTime;
  c.forEach((n,i)=>pianoTone(n,t+i*.018,bar*.92,.018));
  bassTone(bass[barIndex%bass.length],t,beat*.9);bassTone(bass[barIndex%bass.length]*1.5,t+beat*2,beat*.75);
  brush(t,true);brush(t+beat);brush(t+beat*2,true);brush(t+beat*3);
  vibeTone(c[(barIndex+1)%c.length],t+beat*1.5);
  if(barIndex%2===1)vibeTone(c[(barIndex+2)%c.length]*.5,t+beat*3.25);
  barIndex++;nextTime+=bar;
  let delay=Math.max(80,(nextTime-audioCtx.currentTime-bar*.35)*1000);
  bgmTimer=setTimeout(scheduleBar,delay)
 }
 scheduleBar()
}
function startUpbeatBgm(){
  stopBgm(false);
  audioCtx=audioCtx||new (window.AudioContext||window.webkitAudioContext)();
  if(audioCtx.state==='suspended')audioCtx.resume();
  bgmOn=true;bgmMode='upbeat';const session=++bgmSession;
  $('bgmBtn').textContent='BGM：RUSH';
   const master=audioCtx.createGain(),room=audioCtx.createBiquadFilter();
  bgmMaster=master;
  master.gain.value=.12*bgmVolume;
  room.type='lowpass';room.frequency.value=4800;room.Q.value=.28;
  room.connect(master);master.connect(audioCtx.destination);

  // Up-tempo swing / casino big-band jazz.
  const bpm=138,beat=60/bpm,eighth=beat/2;
  // ii-V-I / turnaround-heavy progression in a C minor / Eb jazz palette.
  const progression=[
    [293.66,349.23,440.00,523.25],   // Dm7
    [392.00,466.16,587.33,698.46],   // G7 color
    [261.63,311.13,392.00,466.16],   // Cm7
    [311.13,392.00,466.16,587.33],   // Ebmaj7
    [349.23,415.30,523.25,622.25],   // Fm7
    [466.16,554.37,698.46,830.61],   // Bb7
    [311.13,392.00,466.16,587.33],   // Ebmaj7
    [392.00,493.88,587.33,739.99]    // G9 turnaround
  ];
  const roots=[73.42,98.00,65.41,77.78,87.31,116.54,77.78,98.00];
  const solo=[523.25,587.33,622.25,698.46,783.99,830.61,932.33,1046.50];
  let barIndex=0,nextTime=audioCtx.currentTime+.05;

  function env(t,peak,a,h,r){
    const g=audioCtx.createGain();
    g.gain.setValueAtTime(.0001,t);
    g.gain.exponentialRampToValueAtTime(peak,t+a);
    g.gain.setValueAtTime(peak,t+a+h);
    g.gain.exponentialRampToValueAtTime(.0001,t+a+h+r);
    return g;
  }
  function piano(freq,t,dur,vol=.016){
    const o=audioCtx.createOscillator(),g=env(t,vol,.006,dur*.32,dur*.6),f=audioCtx.createBiquadFilter();
    o.type='triangle';o.frequency.setValueAtTime(freq,t);
    f.type='lowpass';f.frequency.value=2450;
    o.connect(f);f.connect(g);g.connect(room);o.start(t);o.stop(t+dur+.05);
  }
  function upright(freq,t,dur,vol=.03){
    const o=audioCtx.createOscillator(),o2=audioCtx.createOscillator(),g=env(t,vol,.008,dur*.42,dur*.5),f=audioCtx.createBiquadFilter();
    o.type='sine';o2.type='triangle';o.frequency.setValueAtTime(freq,t);o2.frequency.setValueAtTime(freq*2,t);
    f.type='lowpass';f.frequency.value=520;
    const g2=audioCtx.createGain();g2.gain.value=.12;
    o.connect(f);o2.connect(g2);g2.connect(f);f.connect(g);g.connect(room);
    o.start(t);o2.start(t);o.stop(t+dur+.04);o2.stop(t+dur+.04);
  }
  function horn(freq,t,dur,vol=.012){
    const o=audioCtx.createOscillator(),g=env(t,vol,.012,dur*.3,dur*.58),f=audioCtx.createBiquadFilter();
    o.type='sawtooth';o.frequency.setValueAtTime(freq,t);
    f.type='lowpass';f.frequency.value=1450;
    o.connect(f);f.connect(g);g.connect(room);o.start(t);o.stop(t+dur+.05);
  }
  function brush(t,dur=.055,vol=.013,hp=1800){
    const len=Math.floor(audioCtx.sampleRate*dur),buf=audioCtx.createBuffer(1,len,audioCtx.sampleRate),d=buf.getChannelData(0);
    for(let i=0;i<len;i++)d[i]=(Math.random()*2-1)*(1-i/len);
    const s=audioCtx.createBufferSource(),f=audioCtx.createBiquadFilter(),g=audioCtx.createGain();
    s.buffer=buf;f.type='highpass';f.frequency.value=hp;g.gain.value=vol;
    s.connect(f);f.connect(g);g.connect(room);s.start(t);
  }
  function ride(t,accent=false){
    brush(t,.028,accent?.013:.007,5600);
  }
  function kick(t){
    const o=audioCtx.createOscillator(),g=audioCtx.createGain();
    o.type='sine';o.frequency.setValueAtTime(92,t);o.frequency.exponentialRampToValueAtTime(52,t+.07);
    g.gain.setValueAtTime(.035,t);g.gain.exponentialRampToValueAtTime(.0001,t+.1);
    o.connect(g);g.connect(room);o.start(t);o.stop(t+.11);
  }
  function compChord(chord,t,dur=.28,vol=.011){
    // Rootless-ish voicing: emphasize upper chord tones.
    chord.slice(1).forEach((n,i)=>piano(n*(i===2?2:1),t+i*.009,dur,vol));
  }

  function scheduleBar(){
    if(!bgmOn||session!==bgmSession)return;
    while(nextTime<audioCtx.currentTime+1.05){
      const idx=barIndex%progression.length,chord=progression[idx],root=roots[idx],t=nextTime;

      // Walking upright bass on all four beats with chromatic/approach flavor.
      const nextRoot=roots[(idx+1)%roots.length];
      const walk=[root,root*1.5,root*1.78,(nextRoot>root?nextRoot/1.05946:nextRoot*1.05946)];
      walk.forEach((n,i)=>upright(n,t+beat*i,beat*.72,i===0?.031:.026));

      // Classic jazz comping: deliberately irregular off-beat chord punches.
      compChord(chord,t+beat*.48,beat*.34,.012);
      compChord(chord,t+beat*1.72,beat*.28,.010);
      if(barIndex%2===0)compChord(chord,t+beat*2.55,beat*.3,.011);
      else compChord(chord,t+beat*3.18,beat*.26,.011);

      // Swing ride pattern: ding-ding-da-ding.
      ride(t,true);
      ride(t+beat*.66,false);
      ride(t+beat,true);
      ride(t+beat*1.66,false);
      ride(t+beat*2,true);
      ride(t+beat*2.66,false);
      ride(t+beat*3,true);
      ride(t+beat*3.66,false);

      // Light kick and brush/snare on 2 & 4.
      kick(t); kick(t+beat*2);
      brush(t+beat,.07,.017,1450);
      brush(t+beat*3,.07,.018,1450);

      // Brass section call-and-response.
      if(barIndex%4===0||barIndex%4===2){
        horn(chord[1]*2,t+beat*1.28,beat*.32,.010);
        horn(chord[2]*2,t+beat*1.31,beat*.32,.008);
      }
      if(barIndex%4===3){
        chord.slice(1).forEach((n,i)=>horn(n*2,t+beat*3.18+i*.012,beat*.42,.008));
      }

      // Short piano improvisation with swung spacing; phrases leave breathing room.
      if(barIndex%2===1){
        const base=(barIndex*2)%solo.length;
        const phrase=[0,2,1,4,3];
        phrase.forEach((off,i)=>{
          const swing=i%2?beat*.08:0;
          piano(solo[(base+off)%solo.length],t+beat*(.18+i*.43)+swing,beat*.24,i===4?.012:.009);
        });
      }else if(barIndex%4===2){
        piano(solo[(barIndex+4)%solo.length],t+beat*3.42,beat*.3,.011);
      }

      barIndex++;
      nextTime+=beat*4;
    }
    bgmTimer=setTimeout(scheduleBar,110);
  }
  scheduleBar();
}
function currentBgmBaseGain(){
  return bgmMode==='upbeat'?.12:.16;
}
function applyBgmVolume(){
  if(!bgmMaster||!audioCtx)return;
  const value=currentBgmBaseGain()*bgmVolume;
  try{bgmMaster.gain.setValueAtTime(value,audioCtx.currentTime)}catch(e){bgmMaster.gain.value=value}
}
function applySfxVolume(){
  if(!sfxMaster||!audioCtx)return;
  try{sfxMaster.gain.setValueAtTime(sfxVolume,audioCtx.currentTime)}catch(e){sfxMaster.gain.value=sfxVolume}
}
function syncAudioVolumeUi(){
  const bgmPct=Math.round(bgmVolume*100);
  const sfxPct=Math.round(sfxVolume*100);
  $('bgmVolume').value=String(bgmPct);
  $('sfxVolume').value=String(sfxPct);
  $('bgmVolumeValue').textContent=`${bgmPct}%`;
  $('sfxVolumeValue').textContent=`${sfxPct}%`;
}
function setBgmVolumeFromUi(value){
  bgmVolume=clamp01(Number(value)/100);
  saveAudioVolume(AUDIO_BGM_KEY,bgmVolume);
  applyBgmVolume();
  syncAudioVolumeUi();
}
function setSfxVolumeFromUi(value){
  sfxVolume=clamp01(Number(value)/100);
  saveAudioVolume(AUDIO_SFX_KEY,sfxVolume);
  applySfxVolume();
  syncAudioVolumeUi();
}
function stopBgm(updateLabel=true){
  bgmOn=false;
  bgmSession++;
  if(bgmTimer){clearTimeout(bgmTimer);bgmTimer=null}
  if(bgmMaster){
    try{bgmMaster.disconnect()}catch(e){}
    bgmMaster=null;
  }
  if(updateLabel){
    bgmWasPlayingBeforeHide=false;
    bgmResumeMode=null;
    $('bgmBtn').textContent='BGM';
  }
}
function playBgm(mode){
  stopBgm(false);
  if(mode==='upbeat')startUpbeatBgm();
  else startLoungeBgm();
}

function pauseAudioForPageHide(){
  if(bgmOn){
    bgmWasPlayingBeforeHide=true;
    bgmResumeMode=bgmMode;
    // Stop only the scheduler/output graph, but keep the user's BGM choice.
    bgmOn=false;
    bgmSession++;
    if(bgmTimer){clearTimeout(bgmTimer);bgmTimer=null}
    if(bgmMaster){
      try{bgmMaster.disconnect()}catch(e){}
      bgmMaster=null;
    }
  }
  if(audioCtx&&audioCtx.state==='running'){
    try{audioCtx.suspend()}catch(e){}
  }
}
async function ensureAudioContextRunning(){
  try{
    if(!audioCtx||audioCtx.state==='closed'){
      audioCtx=new (window.AudioContext||window.webkitAudioContext)();
      sfxMaster=null;
    }
    ensureSfxMaster(audioCtx);
    if(audioCtx.state!=='running'){
      await audioCtx.resume();
    }
    return audioCtx.state==='running';
  }catch(e){
    return false;
  }
}
async function restoreAudioAfterPageReturn(){
  if(audioRestoreBusy)return;
  audioRestoreBusy=true;
  try{
    const ok=await ensureAudioContextRunning();
    if(ok&&bgmWasPlayingBeforeHide&&bgmResumeMode){
      const mode=bgmResumeMode;
      bgmWasPlayingBeforeHide=false;
      bgmResumeMode=null;
      playBgm(mode);
    }
  }finally{
    audioRestoreBusy=false;
  }
}
function unlockAudioFromGesture(){
  // iOS may refuse automatic resume after navigation/backgrounding.
  // A real touch/pointer event is accepted as the fallback unlock gesture.
  restoreAudioAfterPageReturn();
}

window.addEventListener('resize',()=>{
  if(!$('handSignalOverlay').classList.contains('hidden'))positionHandSignal();
});
window.visualViewport?.addEventListener('resize',()=>{
  if(!$('handSignalOverlay').classList.contains('hidden'))positionHandSignal();
});
window.visualViewport?.addEventListener('scroll',()=>{
  if(!$('handSignalOverlay').classList.contains('hidden'))positionHandSignal();
});
document.addEventListener('visibilitychange',()=>{
  if(document.visibilityState==='hidden')pauseAudioForPageHide();
  else restoreAudioAfterPageReturn();
});
window.addEventListener('pagehide',pauseAudioForPageHide);
window.addEventListener('pageshow',()=>restoreAudioAfterPageReturn());
window.addEventListener('focus',()=>restoreAudioAfterPageReturn());

// Capture-phase listeners run before game button handlers, so the first
// effect sound after returning is much less likely to be swallowed.
document.addEventListener('pointerdown',unlockAudioFromGesture,{capture:true,passive:true});
document.addEventListener('touchstart',unlockAudioFromGesture,{capture:true,passive:true});

syncAudioVolumeUi();
$('bgmBtn').addEventListener('click',()=>{syncAudioVolumeUi();$('bgmModal').classList.remove('hidden')});
$('bgmVolume').addEventListener('input',e=>setBgmVolumeFromUi(e.target.value));
$('sfxVolume').addEventListener('input',e=>setSfxVolumeFromUi(e.target.value));
$('bgmJazz').addEventListener('click',()=>{playBgm('lounge');$('bgmModal').classList.add('hidden')});
$('bgmUpbeat').addEventListener('click',()=>{playBgm('upbeat');$('bgmModal').classList.add('hidden')});
$('bgmOff').addEventListener('click',()=>{stopBgm();$('bgmModal').classList.add('hidden')});
$('closeBgm').addEventListener('click',()=>{$('bgmModal').classList.add('hidden')});
$('bgmModal').addEventListener('click',e=>{if(e.target===$('bgmModal'))$('bgmModal').classList.add('hidden')});

function openCustomBet(){
  const p=players[activePlayer];
  const maxAdd=Math.max(0,Math.min(p.bank,cfg.max-currentBet));
  $('customBetInput').value='';
  $('customBetInput').max=maxAdd;
  $('customBetHint').textContent=`追加可能：₩1,000〜${fmt(maxAdd)} / 現在BET ${fmt(currentBet)} / MAX ${fmt(cfg.max)}`;
  $('customBetModal').classList.remove('hidden');
}
function closeCustomBet(){$('customBetModal').classList.add('hidden')}
$('closeCustomBet').addEventListener('click',closeCustomBet);
$('customBetModal').addEventListener('click',e=>{if(e.target===$('customBetModal'))closeCustomBet()});
$('applyCustomBet').addEventListener('click',async()=>{
  if(animating)return;
  const p=players[activePlayer];
  let v=Math.floor((+$('customBetInput').value||0)/1000)*1000;
  const room=Math.max(0,Math.min(p.bank,cfg.max-currentBet));
  if(v<1000){toast('指定BETは ₩1,000 以上で入力してください');return}
  if(room<=0){toast(`MAX ${fmt(cfg.max)} です`);closeCustomBet();return}
  const add=Math.min(v,room);
  closeCustomBet();
  animating=true;
  sfxBet();
  const source=$('customBetBtn');
  if(source)await flyChipToBet(source,add);
  p.bank-=add;
  currentBet+=add;
  $('betAmount').textContent=fmt(currentBet);
  render();
  animating=false;
  if(add<v||currentBet>=cfg.max)toast(`テーブルMAX ${fmt(cfg.max)} に達しました`);
});



$('resultBtn').addEventListener('click',openRoundResult);
$('closeRoundResult').addEventListener('click',closeRoundResult);
$('roundResultModal').addEventListener('click',e=>{if(e.target===$('roundResultModal'))closeRoundResult()});
$('modalNextRound').addEventListener('click',()=>{
  closeRoundResult();
  if(allPlayersBankrupt()){showGameOver();return}
  beginBet();
});

function showHelp(){
  $('helpModal').classList.remove('hidden');
  const panel=$('helpModal').querySelector('.helpPanel:not(.hidden)');
  if(panel)panel.scrollTop=0;
}
function hideHelp(){
  $('helpModal').classList.add('hidden');
}
$('helpBtn').addEventListener('click',showHelp);
$('closeHelp').addEventListener('click',hideHelp);
$('helpModal').addEventListener('click',e=>{if(e.target===$('helpModal'))hideHelp()});
document.querySelectorAll('.helpTab').forEach(btn=>btn.addEventListener('click',()=>{
  document.querySelectorAll('.helpTab').forEach(b=>b.classList.toggle('active',b===btn));
  const tab=btn.dataset.helpTab;
  $('helpStrategy').classList.toggle('hidden',tab!=='strategy');
  $('helpAdvanced').classList.toggle('hidden',tab!=='advanced');
  $('helpExpert').classList.toggle('hidden',tab!=='expert');
  $('helpSignal').classList.toggle('hidden',tab!=='signal');
  $('helpMemo').classList.toggle('hidden',tab!=='memo');
}));

$('settingsModal').addEventListener('change',e=>{
  if(e.target.matches('#testDealer1,#testDealer2,.testPlayerCard'))captureTestDeal();
});
$('clearTestDeal').addEventListener('click',()=>{
  clearTestDeal();
  buildTestDealInputs();
  toast('テスト配札をクリアしました');
});
function showSettings(){buildTestDealInputs();
  const rows=[
    ['プレイヤー数', `${cfg.count||players.length}人`],
    ['テーブル MIN', fmt(cfg.min||0)],
    ['テーブル MAX', fmt(cfg.max||0)],
    ['開始資金入力', mode==='jpy'?'日本円から換算':'KRWで入力'],
    ['換算レート', mode==='jpy'?`1円 = ${cfg.rate||$('rate').value} KRW`:'—'],
    ['シュー', `SHOE ${shoeNo} / 残り ${deck.length}枚`],
    ['PLAYER TYPE', `${players.filter(p=>p.type==='user').length} USER / ${players.filter(p=>p.type==='guest').length} GUEST / ${players.filter(p=>p.type==='cpu').length} CPU`],
    ['CPU残高0時', cfg.cpuBustMode==='replace'?'新しいCPUが参戦':'そのCPUは退場'],
    ['テスト配札', (testDeal.dealer.some(Boolean)||testDeal.players.some(a=>a&&a.some(Boolean)))?'指定あり':'通常（ランダム）']
  ];
  $('settingsSummary').innerHTML=rows.map(r=>`<div class="settingsRow"><span>${r[0]}</span><b>${r[1]}</b></div>`).join('');
  $('settingsModal').classList.remove('hidden');
  const body=$('settingsModal').querySelector('.settingsMainBody');
  if(body)body.scrollTop=0;
}
function hideSettings(){$('settingsModal').classList.add('hidden')}

$('settingsBtn').addEventListener('click',showSettings);
$('closeSettings').addEventListener('click',hideSettings);
$('settingsModal').addEventListener('click',e=>{if(e.target===$('settingsModal'))hideSettings()});

function openBackTopConfirm(){
  $('backTopModal').classList.remove('hidden');
}
function closeBackTopConfirm(){
  $('backTopModal').classList.add('hidden');
}
function returnToTop(){
  stopBgm();
  dealingDealerActive=false;
  $('table').classList.remove('dealingOverview','dealerDealActive','betPhase','betOverview','payoutOverview','viewMorphOutToAction','viewMorphInToAction','viewMorphOutToOverview','viewMorphInToOverview','viewMorphBusy','overviewPhaseOut','overviewPhaseIn','overviewPhaseBusy');
  phase='setup';
  roundNo=0;
  animating=false;
  currentBet=0;
  activePlayer=0;
  activeHand=0;
  lastActionPlayer=0;
  dealer=[];
  players=[];
  deck=[];
  reveal=false;

  $('backTopModal').classList.add('hidden');
  $('settingsModal').classList.add('hidden');
  if($('roundResultModal'))$('roundResultModal').classList.add('hidden');
  if($('helpModal'))$('helpModal').classList.add('hidden');
  if($('strategyHintModal'))$('strategyHintModal').classList.add('hidden');
  if($('betStrategyHintModal'))$('betStrategyHintModal').classList.add('hidden');
  if($('customBetModal'))$('customBetModal').classList.add('hidden');
  if($('gameOverModal'))$('gameOverModal').classList.add('hidden');

  $('table').style.display='none';
  $('setup').style.display='block';
  $('betAmount').textContent=fmt(0);
  window.scrollTo({top:0,behavior:'smooth'});
}

const backTopBtn=$('backTopBtn');
if(backTopBtn)backTopBtn.addEventListener('click',openBackTopConfirm);
$('cancelBackTop').addEventListener('click',closeBackTopConfirm);
$('confirmBackTop').addEventListener('click',returnToTop);
$('backTopModal').addEventListener('click',e=>{
  if(e.target===$('backTopModal'))closeBackTopConfirm();
});

$('gameOverTopBtn').addEventListener('click',()=>{
  stopBgm();
  dealingDealerActive=false;
  $('table').classList.remove('dealingOverview','dealerDealActive','betPhase','betOverview','payoutOverview','viewMorphOutToAction','viewMorphInToAction','viewMorphOutToOverview','viewMorphInToOverview','viewMorphBusy','overviewPhaseOut','overviewPhaseIn','overviewPhaseBusy');
  phase='setup';
  roundNo=0;
  animating=false;
  currentBet=0;
  activePlayer=0;
  activeHand=0;
  lastActionPlayer=0;
  dealer=[];
  players=[];
  deck=[];
  reveal=false;
  $('gameOverModal').classList.add('hidden');
  $('settingsModal').classList.add('hidden');
  $('statsModal').classList.add('hidden');
  if($('customBetModal'))$('customBetModal').classList.add('hidden');
  $('table').style.display='none';
  $('setup').style.display='block';
  $('betAmount').textContent=fmt(0);
  window.scrollTo({top:0,behavior:'smooth'});
});

$('statsBtn').onclick=openStats;
$('closeStats').onclick=closeStats;
$('statsPlayerTab').onclick=()=>{
  statsMode='players';
  renderStatsModal();
};
$('statsHistoryTab').onclick=()=>{
  statsMode='history';
  renderStatsModal();
};
