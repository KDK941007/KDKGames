"use strict";
const BUILD='1.16-portal-player';
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
const $=id=>document.getElementById(id);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const fmt=n=>'₩'+Math.round(n).toLocaleString('ja-JP');

const BET_KEYS=['player','tie','banker','playerPair','bankerPair'];
const BET_LABEL={
  player:'PLAYER', tie:'TIE', banker:'BANKER',
  playerPair:'PLAYER PAIR', bankerPair:'BANKER PAIR'
};

let mode='krw';
let cfg={min:30000,max:3000000,decks:8,rate:9.2,gameMode:'commission',squeezeMode:'all'};
let users=[];
let activeUser=0;
let roundNo=1,shoeNo=1,deck=[],cutRemaining=0;
let playerHand=[],bankerHand=[];
let selectedBet='player';
let phase='setup',busy=false,lastResult=null;
let history=[];
let roundHistory=[];
let resultActionReadyAt=0;
let stats={rounds:0,p:0,b:0,t:0};
let testDeal={p1:'',p2:'',p3:'',b1:'',b2:'',b3:''};

function blankBets(){return {player:0,tie:0,banker:0,playerPair:0,bankerPair:0}}
function totalBets(obj){return BET_KEYS.reduce((s,k)=>s+(obj?.[k]||0),0)}
function cardPoint(c){if(!c)return 0;if(c.rank==='A')return 1;if(['10','J','Q','K'].includes(c.rank))return 0;return Number(c.rank)}
function handPoint(hand){return hand.reduce((s,c)=>s+cardPoint(c),0)%10}
function isPair(hand){return hand.length>=2&&hand[0].rank===hand[1].rank}
function isRed(suit){return suit==='♥'||suit==='♦'}
function cardFaceHtml(c,large=false){
  const red=isRed(c.suit);
  const color=red?'#bf1f2b':'#151515';
  const val=c.rank;

  const left=large?24:31;
  const right=large?76:69;
  const top1=large?31:27;
  const top2=large?48:49;
  const mid=70;
  const bot2=large?92:91;
  const bot1=large?109:113;
  const pipSize=large?29:20;

  const pip=(x,y,flip=false,cls='pipText')=>
    `<text class="${cls}" x="${x}" y="${y}" fill="${color}" style="${cls==='pipText'?`font-size:${pipSize}px`:''}"${flip?` transform="rotate(180 ${x} ${y})"`:''}>${c.suit}</text>`;

  let center='';
  if(val==='A'){
    center=pip(50,70,false,'acePip');

  }else if(['J','Q','K'].includes(val)){
    const royalName=val==='K'?'KING':val==='Q'?'QUEEN':'JACK';
    const bodyClass=val==='Q'?'courtRed':'courtBlue';

    const headgear = val==='K'
      ? `<path d="M39 35 L42 24 L48 31 L52 20 L58 31 L64 24 L67 35 Z" class="courtGold"/>
         <circle cx="43" cy="27" r="1.4" class="courtRed"/>
         <circle cx="52" cy="23" r="1.4" class="courtBlue"/>
         <circle cx="63" cy="27" r="1.4" class="courtRed"/>`
      : val==='Q'
      ? `<path d="M39 35 Q41 25 47 24 Q52 18 57 24 Q64 25 66 35 Z" class="courtGold"/>
         <circle cx="52" cy="22" r="2" class="courtRed"/>
         <path d="M43 29 Q52 34 62 29" fill="none" class="courtFine"/>`
      : `<path d="M38 35 Q44 25 52 28 Q60 24 67 35 Z" class="courtBlue"/>
         <path d="M40 29 Q52 23 65 30" fill="none" stroke="#d7ae3f" stroke-width="2"/>`;

    const heldItem = val==='K'
      ? `<path d="M70 49 L80 86" class="courtStroke" fill="none"/>
         <path d="M76 46 L83 49 L78 56 Z" class="courtGold"/>
         <path d="M73 63 L81 60" class="courtStroke"/>`
      : val==='Q'
      ? `<path d="M72 52 L77 86" class="courtStroke" fill="none"/>
         <circle cx="72" cy="48" r="4.5" class="courtRed"/>
         <circle cx="78" cy="44" r="3.8" class="courtBlue"/>
         <circle cx="82" cy="49" r="3.8" class="courtGold"/>`
      : `<path d="M71 45 L80 89" class="courtStroke" fill="none"/>
         <path d="M68 50 L77 46" class="courtStroke"/>
         <path d="M76 86 L84 90" class="courtStroke"/>`;

    const royalHalf = `
      ${headgear}
      <ellipse cx="52" cy="43" rx="12" ry="10.5" class="courtSkin"/>
      <path d="M40 40 Q52 30 64 40 Q62 33 52 32 Q43 33 40 40" class="courtHair"/>
      <circle cx="47" cy="42" r="1.15" class="courtInk"/>
      <circle cx="57" cy="42" r="1.15" class="courtInk"/>
      <path d="M48 48 Q52 50 56 48" fill="none" class="courtFine"/>
      <path d="M34 51 Q52 45 70 51 L67 69 Q52 73 37 69 Z" class="${bodyClass}" stroke="#242424" stroke-width="1"/>
      <path d="M43 53 L52 66 L61 53" class="courtWhite" stroke="#242424" stroke-width=".8"/>
      <path d="M40 57 Q52 61 65 57" fill="none" stroke="#d7ae3f" stroke-width="2"/>
      ${heldItem}
      <text class="courtLetter" x="27" y="34" fill="${color}">${val}</text>
      <text class="courtSuit" x="28" y="49" fill="${color}">${c.suit}</text>`;

    center=`
      <g class="courtFace">
        <rect x="13" y="18" width="74" height="104" rx="5" class="courtWhite" stroke="#8a6d2d" stroke-width="1.4"/>
        <rect x="16" y="21" width="68" height="98" rx="4" fill="#efe2af" stroke="#aa8b3b" stroke-width=".8"/>

        <path d="M18 52 L82 88 M82 52 L18 88" class="courtLine" opacity=".85"/>
        <path d="M18 61 L82 79 M18 79 L82 61" stroke="#b52a39" stroke-width="3" opacity=".80"/>
        <rect x="18" y="63" width="64" height="14" rx="3" class="courtGold" opacity=".95"/>

        <g>${royalHalf}</g>
        <g transform="rotate(180 50 70)">${royalHalf}</g>

        <circle cx="50" cy="70" r="8.5" fill="#fff7d2" stroke="#8a6d2d" stroke-width="1"/>
        <text class="courtSuit" x="50" y="70" fill="${color}">${c.suit}</text>
        <text x="50" y="116" font-size="5.2" fill="#735f33" font-family="system-ui,sans-serif">${royalName}</text>
      </g>`;

  }else{
    const n=Number(val);
    const positions={
      2:[[50,top1,false],[50,bot1,true]],
      3:[[50,top1,false],[50,mid,false],[50,bot1,true]],
      4:[[left,top1,false],[right,top1,false],[left,bot1,true],[right,bot1,true]],
      5:[[left,top1,false],[right,top1,false],[50,mid,false],[left,bot1,true],[right,bot1,true]],
      6:[[left,top1,false],[right,top1,false],[left,mid,false],[right,mid,true],[left,bot1,true],[right,bot1,true]],
      7:[[left,top1,false],[right,top1,false],[50,top2,false],[left,mid,false],[right,mid,true],[left,bot1,true],[right,bot1,true]],
      8:[[left,top1,false],[right,top1,false],[50,top2,false],[left,mid,false],[right,mid,true],[50,bot2,true],[left,bot1,true],[right,bot1,true]],
      9:[[left,top1,false],[right,top1,false],[left,top2,false],[right,top2,false],[50,mid,false],[left,bot2,true],[right,bot2,true],[left,bot1,true],[right,bot1,true]],
      10:[[left,top1,false],[right,top1,false],[50,41,false],[left,top2,false],[right,top2,false],[left,bot2,true],[right,bot2,true],[50,99,true],[left,bot1,true],[right,bot1,true]]
    }[n]||[];
    center=positions.map(([x,y,flip])=>pip(x,y,flip)).join('');
  }

  return `<div class="realCardFace${red?' red':''}">
    <svg class="cardSvg" viewBox="0 0 100 140" preserveAspectRatio="none" aria-hidden="true">
      <rect x="0" y="0" width="100" height="140" rx="7" fill="#fff"/>
      <g class="cardIndex">
        <text class="cornerRank" x="10" y="9" fill="${color}">${val}</text>
        <text class="cornerSuit" x="10" y="25" fill="${color}">${c.suit}</text>
        <g transform="rotate(180 90 131)">
          <text class="cornerRank" x="90" y="131" fill="${color}">${val}</text>
          <text class="cornerSuit" x="90" y="115" fill="${color}">${c.suit}</text>
        </g>
      </g>
      ${center}
    </svg>
  </div>`;
}
function currentUser(){return users[activeUser]||null}
function eligibleUserIndexes(){return users.map((u,i)=>u.bank>=cfg.min?i:-1).filter(i=>i>=0)}
function allUsersUnableToBet(){return users.length>0&&users.every(u=>u.bank<cfg.min)}

function buildDeck(){
  const suits=['♠','♥','♦','♣'],ranks=['A','2','3','4','5','6','7','8','9','10','J','Q','K'];
  deck=[];
  for(let d=0;d<cfg.decks;d++)for(const s of suits)for(const r of ranks)deck.push({rank:r,suit:s,id:`${shoeNo}-${d}-${s}-${r}-${Math.random()}`});
  shuffle(deck);
  const penetration=.65+Math.random()*.10;
  cutRemaining=Math.max(12,Math.round(deck.length*(1-penetration)));
}
function newShoe(){
  shoeNo++;
  buildDeck();
}
function shuffle(a){for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}}
function parseTest(v){
  if(!v)return null;
  const rank=v.slice(0,-1),suit=v.slice(-1);
  return {rank,suit,id:`test-${v}-${Math.random()}`};
}
function draw(spec=''){
  if(spec)return parseTest(spec);
  if(deck.length<1)newShoe();
  return deck.pop();
}
function needShuffle(){return deck.length<=cutRemaining||deck.length<12}

const TEST_SELECT_MAP={
  tp1:'p1',tp2:'p2',tp3:'p3',
  tb1:'b1',tb2:'b2',tb3:'b3'
};
function renderTestDealStatus(){
  const entries=[
    ['P1',testDeal.p1],['P2',testDeal.p2],['P3',testDeal.p3],
    ['B1',testDeal.b1],['B2',testDeal.b2],['B3',testDeal.b3]
  ].filter(([,v])=>v);
  $('testDealStatus').textContent=entries.length
    ?`テスト配札：${entries.map(([k,v])=>`${k}=${v}`).join(' / ')}`
    :'テスト配札：未設定';
}
function syncTestDealFromControls(){
  for(const [id,key] of Object.entries(TEST_SELECT_MAP)){
    testDeal[key]=$(id).value||'';
  }
  renderTestDealStatus();
}
function syncTestControlsFromState(){
  for(const [id,key] of Object.entries(TEST_SELECT_MAP)){
    $(id).value=testDeal[key]||'';
  }
  renderTestDealStatus();
}
function clearTestDeal(showToast=false){
  testDeal={p1:'',p2:'',p3:'',b1:'',b2:'',b3:''};
  syncTestControlsFromState();
  if(showToast)toast('テスト配札をクリアしました');
}
function initTestSelects(){
  const opts=['<option value="">ランダム</option>'];
  for(const s of ['♠','♥','♦','♣'])for(const r of ['A','2','3','4','5','6','7','8','9','10','J','Q','K']){
    opts.push(`<option value="${r}${s}">${r}${s}</option>`);
  }
  for(const [id,key] of Object.entries(TEST_SELECT_MAP)){
    const el=$(id);
    el.innerHTML=opts.join('');
    el.value=testDeal[key]||'';
    el.addEventListener('change',syncTestDealFromControls);
  }
  renderTestDealStatus();
}
initTestSelects();

/* ---------- SETUP ---------- */
function getSetupRows(){
  return [...document.querySelectorAll('.userBankRow')];
}
function buildUserBankInputs(){
  const n=Number($('userCount').value)||1;
  const root=$('userBankList');
  const old=getSetupRows().map((row,i)=>({
    name:row.querySelector('.userNameInput')?.value||`PLAYER ${i+1}`,
    bank:row.querySelector('.userBankInput')?.value||'',
    type:row.querySelector('.participantTypeSelect')?.value||(i===0?'user':'guest')
  }));
  const profile=mgPortalProfile();
  root.innerHTML='';
  for(let i=0;i<n;i++){
    const prev=old[i]||{};
    const defaultBank=mode==='krw'?300000:30000;
    const type=prev.type||(i===0?'user':'guest');
    const row=document.createElement('div');
    row.className='userBankRow';
    row.innerHTML=`
      <div class="participantTypeRow">
        <label>参加タイプ
          <select class="participantTypeSelect" data-seat="${i}">
            <option value="user"${type==='user'?' selected':''}>USER</option>
            <option value="guest"${type==='guest'?' selected':''}>GUEST</option>
          </select>
        </label>
        <div class="portalParticipantNote">${type==='user'?'PORTAL PLAYER':'SESSION ONLY'}</div>
      </div>
      <div class="userBankMain">
        <label>名前
          <input class="userNameInput${type==='user'?' portalUserLocked':''}" type="text" maxlength="10" value="${escapeHtml(type==='user'?profile.displayName:(prev.name||`GUEST ${i+1}`))}" placeholder="${type==='user'?'PLAYER':`GUEST ${i+1}`}"${type==='user'?' readonly':''}>
        </label>
        <label>${mode==='krw'?'開始チップ（KRW）':'予算（JPY）'}
          <input class="userBankInput" type="number" inputmode="numeric" min="1000" step="1000" value="${prev.bank||defaultBank}">
        </label>
      </div>
      <div class="bankCalc"></div>`;
    root.appendChild(row);
  }
  getSetupRows().forEach(row=>row.querySelector('.userBankInput').addEventListener('input',updateBudgetPreview));
  document.querySelectorAll('.participantTypeSelect').forEach(s=>s.addEventListener('change',handleParticipantTypeChange));
  refreshParticipantRows();
  updateBudgetPreview();
}
function refreshParticipantRows(){
  const profile=mgPortalProfile();
  const selects=[...document.querySelectorAll('.participantTypeSelect')];
  const userIndex=selects.findIndex(s=>s.value==='user');
  selects.forEach((select,i)=>{
    const row=select.closest('.userBankRow');
    const user=select.value==='user';
    const opt=select.querySelector('option[value="user"]');
    if(opt)opt.disabled=userIndex>=0&&i!==userIndex;
    const name=row.querySelector('.userNameInput');
    name.readOnly=user;
    name.classList.toggle('portalUserLocked',user);
    if(user)name.value=profile.displayName;
    row.querySelector('.portalParticipantNote').textContent=user?'PORTAL PLAYER':'SESSION ONLY';
  });
}
function handleParticipantTypeChange(e){
  const row=e.target.closest('.userBankRow');
  const seat=+e.target.dataset.seat;
  if(e.target.value==='user'){
    document.querySelectorAll('.participantTypeSelect').forEach(s=>{
      if(s!==e.target&&s.value==='user')s.value='guest';
    });
  }else{
    const name=row.querySelector('.userNameInput');
    if(name.readOnly||!name.value.trim())name.value=`GUEST ${seat+1}`;
  }
  refreshParticipantRows();
}
function updateBudgetPreview(){
  const rate=Number($('rate').value)||0;
  getSetupRows().forEach(row=>{
    const input=row.querySelector('.userBankInput'),calc=row.querySelector('.bankCalc');
    const v=Number(input.value)||0;
    calc.textContent=mode==='jpy'
      ?`→ 約 ${fmt(Math.floor(v*rate/1000)*1000)} 分のチップ`
      :`開始チップ ${fmt(v)}`;
  });
}
function setMode(next){
  if(mode===next)return;
  const rows=getSetupRows();
  const rate=Number($('rate').value)||9.2;
  rows.forEach(row=>{
    const input=row.querySelector('.userBankInput');
    const v=Number(input.value)||0;
    if(next==='jpy'&&mode==='krw')input.value=Math.max(1000,Math.round(v/rate/1000)*1000);
    if(next==='krw'&&mode==='jpy')input.value=Math.max(1000,Math.floor(v*rate/1000)*1000);
  });
  mode=next;
  $('modeKrw').classList.toggle('active',mode==='krw');
  $('modeJpy').classList.toggle('active',mode==='jpy');
  $('rateField').classList.toggle('hidden',mode!=='jpy');
  buildUserBankInputs();
}
$('modeKrw').onclick=()=>setMode('krw');
$('modeJpy').onclick=()=>setMode('jpy');
$('userCount').onchange=buildUserBankInputs;
$('rate').addEventListener('input',updateBudgetPreview);
buildUserBankInputs();

function readSetup(){
  const min=Math.max(10000,Number($('tableMin').value)||30000);
  const rate=Math.max(.01,Number($('rate').value)||9.2);
  cfg={min,max:min*100,decks:8,rate,gameMode:$('gameMode').value,squeezeMode:$('squeezeMode').value};
  const rows=getSetupRows();
  const profile=mgPortalProfile();
  users=rows.map((row,i)=>{
    const raw=Number(row.querySelector('.userBankInput').value)||0;
    const bank=mode==='jpy'?Math.floor(raw*rate/1000)*1000:Math.floor(raw/1000)*1000;
    const type=row.querySelector('.participantTypeSelect')?.value||'guest';
    const fallback=type==='user'?profile.displayName:`GUEST ${i+1}`;
    const name=(type==='user'?profile.displayName:(row.querySelector('.userNameInput').value||fallback)).trim().slice(0,10)||fallback;
    return {
      name,type,playerId:type==='user'?profile.playerId:null,bank,initial:bank,roundStartBank:bank,bets:blankBets(),lastBets:blankBets(),confirmed:false,
      roundNet:0,stats:{profit:0,wagered:0,positiveRounds:0}
    };
  });
}
function startGame(){
  readSetup();
  clearTestDeal(false);
  if(users.filter(u=>u.type==='user').length>1){
    toast('USERは1セッションにつき1人だけ設定できます');
    return;
  }
  if(users.some(u=>!u.bank||u.bank<cfg.min)){
    toast('全PLAYERの開始資金をテーブルMIN以上にしてください');
    return;
  }
  roundNo=1;shoeNo=1;history=[];roundHistory=[];stats={rounds:0,p:0,b:0,t:0};
  selectedBet='player';playerHand=[];bankerHand=[];deck=[];buildDeck();
  activeUser=0;
  $('setupScreen').style.display='none';
  $('gameScreen').style.display='block';
  phase='bet';
  prepareBetRound(false);
  updateAll();
}
$('startBtn').onclick=startGame;

/* ---------- RENDER ---------- */
function updateAll(){
  const u=currentUser();
  $('roundPill').textContent=`ROUND ${roundNo}`;
  $('shoeText').textContent=`SHOE ${shoeNo} ・ ${deck.length} cards`;
  $('gameMinText').textContent=fmt(cfg.min);
  $('gameMaxText').textContent=fmt(cfg.max);
  $('bankText').textContent=u?`${u.name} BANK ${fmt(u.bank)}`:'';
  const b=u?.bets||blankBets();
  $('amtPlayer').textContent=fmt(b.player);
  $('amtTie').textContent=fmt(b.tie);
  $('amtBanker').textContent=fmt(b.banker);
  $('amtPlayerPair').textContent=fmt(b.playerPair);
  $('amtBankerPair').textContent=fmt(b.bankerPair);
  $('bankerPayText').textContent=cfg.gameMode==='commission'?'0.95 : 1':'1 : 1 / 6→0.5';
  document.querySelectorAll('.betSpot').forEach(btn=>btn.classList.toggle('active',btn.dataset.bet===selectedBet&&phase==='bet'));
  renderHands();
  renderRoad();
  renderUserStrip();
  renderChips();
  updateDealButtonLabel();
}
function renderChips(){
  const vals=chipValues();
  $('chipRow').innerHTML=vals.map(v=>`<button class="chip" type="button" data-chip="${v}">${compactMoney(v)}</button>`).join('');
  document.querySelectorAll('[data-chip]').forEach(btn=>btn.onclick=()=>addBet(Number(btn.dataset.chip)));
  if(phase!=='bet'||busy)document.querySelectorAll('.chip').forEach(x=>x.disabled=true);
}
function chipValues(){
  const min=cfg.min,max=cfg.max;
  const nice=[10000,20000,30000,50000,100000,200000,300000,500000,1000000,2000000,3000000,5000000,10000000];
  const vals=[...new Set([min,...nice.filter(v=>v>min&&v<=max)])].sort((a,b)=>a-b);
  if(vals.length<=5)return vals;
  const out=[vals[0]],rest=vals.slice(1);
  for(let i=0;i<4;i++){
    const idx=Math.round(i*(rest.length-1)/3);
    if(!out.includes(rest[idx]))out.push(rest[idx]);
  }
  return out.sort((a,b)=>a-b);
}
function compactMoney(n){
  if(n>=100000000)return Math.round(n/10000000)/10+'億';
  if(n>=10000){const m=n/10000;return Number.isInteger(m)?m+'万':m.toFixed(1)+'万'}
  return String(n);
}
function renderHands(){renderHand('player',playerHand);renderHand('banker',bankerHand)}
function renderHand(side,hand){
  $(side+'Cards').innerHTML=hand.map(c=>`<div class="card basicFace ${isRed(c.suit)?'red':''}"><span>${c.rank}${c.suit}</span><span class="bottom">${c.rank}${c.suit}</span></div>`).join('');
  $(side+'Point').textContent=hand.length?handPoint(hand):'–';
}
function appendBackCard(side){
  const row=$(side+'Cards');
  const el=document.createElement('div');
  el.className=`card cardBack ${side==='player'?'dealP':'dealB'}`;
  row.appendChild(el);
  sfxCard();
  return el;
}
function revealTableCard(el,c,side){
  el.className=`card basicFace ${isRed(c.suit)?'red':''} cardFlip`;
  el.innerHTML=`<span>${c.rank}${c.suit}</span><span class="bottom">${c.rank}${c.suit}</span>`;
  $(side+'Point').textContent=handPoint(side==='player'?playerHand:bankerHand);
  sfxReveal();
}
let squeezeResolve=null,squeezeProgress=0,squeezeDragStartX=0,squeezeDragStartY=0;
let squeezeDragBase=0,squeezeDragging=false,squeezeDirection=null,squeezeCompleted=false,squeezeTableViewing=false;

function highestMainBettor(side){
  const key=side==='player'?'player':'banker';
  let best=null;
  users.forEach((u,i)=>{
    const amount=u.bets?.[key]||0;
    if(amount<=0)return;
    if(!best||amount>best.amount)best={index:i,name:u.name,amount};
  });
  return best;
}
function squeezeRights(side,cardIndex){
  if(cfg.squeezeMode!=='all')return null;
  const owner=highestMainBettor(side);
  if(!owner)return null;
  if(cardIndex<1)return null;
  return owner;
}
function resetCover(){
  const c=$('squeezeCover');
  c.style.left='-1px';c.style.right='-1px';c.style.top='-1px';c.style.bottom='-1px';
  c.style.width='calc(100% + 2px)';c.style.height='calc(100% + 2px)';
}
function paintSqueezeProgress(p){
  squeezeProgress=Math.max(0,Math.min(1,p));
  const c=$('squeezeCover'),remain=(1-squeezeProgress)*100;
  resetCover();

  if(squeezeDirection==='up'){
    c.style.bottom='auto';c.style.height=`calc(${remain}% + 2px)`;
  }else if(squeezeDirection==='down'){
    c.style.top='auto';c.style.height=`calc(${remain}% + 2px)`;
  }else if(squeezeDirection==='left'){
    c.style.right='auto';c.style.width=`calc(${remain}% + 2px)`;
  }else if(squeezeDirection==='right'){
    c.style.left='auto';c.style.width=`calc(${remain}% + 2px)`;
  }

  $('squeezeFace').classList.toggle('revealing',squeezeProgress>0);
  $('squeezeFace').classList.toggle('showIndex',squeezeProgress>=.88);
  $('squeezeProgressBar').style.width=`${squeezeProgress*100}%`;
  $('squeezeDirection').textContent=squeezeDirection?`DIRECTION ${squeezeDirection.toUpperCase()}`:'DIRECTION —';
}
function snapBackSqueeze(){
  const c=$('squeezeCover');
  c.classList.add('snapBack');
  paintSqueezeProgress(0);
  setTimeout(()=>{
    c.classList.remove('snapBack');
    squeezeDirection=null;
    resetCover();
    $('squeezeDirection').textContent='DIRECTION —';
    $('squeezeFace').classList.remove('revealing','showIndex');
  },190);
}
function finishSqueeze(){
  squeezeCompleted=true;
  paintSqueezeProgress(1);
  $('squeezeFace').classList.add('revealing','showIndex');
  $('squeezeGuide').innerHTML='カードを確認できます<br>確認できたら「次へ」をタップ';
  $('squeezeDirection').textContent='OPEN';
  $('squeezeOpenBtn').textContent='次へ';
}
function closeSqueezeAfterReview(){
  if(!squeezeResolve||!squeezeCompleted)return;
  $('squeezeOverlay').classList.add('hidden');
  $('squeezeBetCover').classList.add('hidden');
  squeezeTableViewing=false;
  const done=squeezeResolve;
  squeezeResolve=null;
  squeezeCompleted=false;
  squeezeDirection=null;
  squeezeDragging=false;
  $('squeezeOpenBtn').textContent='OPEN';
  $('squeezeGuide').innerHTML='上下左右、好きな方向へスワイプして確認<br>または OPEN をタップ';
  done();
}
function updateSqueezeOverlayBounds(){
  const overlay=$('squeezeOverlay');
  const stage=$('tableStage');
  const bet=$('betPanel');
  const footer=document.querySelector('.gameFooter');
  if(!overlay||!stage||!bet)return;

  const sr=stage.getBoundingClientRect();
  const br=bet.getBoundingClientRect();
  const fr=footer?footer.getBoundingClientRect():null;

  const left=Math.max(6,Math.min(sr.left,br.left));
  const right=Math.min(window.innerWidth-6,Math.max(sr.right,br.right));
  const top=Math.max(4,sr.top);
  const requestedBottom=Math.max(sr.bottom,br.bottom);
  const footerLimit=fr?fr.top-4:window.innerHeight-6;
  const bottom=Math.min(requestedBottom,footerLimit);

  overlay.style.left=`${left}px`;
  overlay.style.top=`${top}px`;
  overlay.style.width=`${Math.max(0,right-left)}px`;
  overlay.style.height=`${Math.max(250,bottom-top)}px`;
}
function squeezeReveal(c,side,owner){
  $('squeezeTitle').textContent=`${side==='player'?'PLAYER':'BANKER'} CARD`;
  $('squeezeOwner').textContent=`${owner.name} ・ ${fmt(owner.amount)} BET`;
  $('squeezeFace').className='squeezeFace';
  $('squeezeFace').innerHTML=cardFaceHtml(c,true);
  squeezeDirection=null;
  squeezeCompleted=false;
  $('squeezeOpenBtn').textContent='OPEN';
  $('squeezeGuide').innerHTML='上下左右、好きな方向へスワイプして確認<br>または OPEN をタップ';
  $('squeezeCover').classList.remove('snapBack');
  resetCover();
  paintSqueezeProgress(0);
  $('squeezeFace').classList.remove('revealing','showIndex');
  squeezeTableViewing=false;
  squeezeDragging=false;
  $('squeezeBetCover').classList.add('hidden');
  updateSqueezeOverlayBounds();
  $('squeezeOverlay').classList.remove('hidden');
  return new Promise(resolve=>{squeezeResolve=resolve});
}
$('squeezeCard').addEventListener('pointerdown',e=>{
  if(!squeezeResolve||squeezeCompleted)return;
  squeezeDragging=true;squeezeDragStartX=e.clientX;squeezeDragStartY=e.clientY;squeezeDragBase=0;
  squeezeDirection=null;
  $('squeezeCover').classList.remove('snapBack');
  paintSqueezeProgress(0);
  $('squeezeCard').setPointerCapture?.(e.pointerId);
  e.preventDefault();
});
$('squeezeCard').addEventListener('pointermove',e=>{
  if(!squeezeDragging||!squeezeResolve)return;
  const dx=e.clientX-squeezeDragStartX,dy=e.clientY-squeezeDragStartY;
  if(!squeezeDirection&&Math.hypot(dx,dy)>8){
    if(Math.abs(dx)>=Math.abs(dy))squeezeDirection=dx>0?'right':'left';
    else squeezeDirection=dy>0?'down':'up';
  }
  if(!squeezeDirection)return;
  const dist=squeezeDirection==='left'||squeezeDirection==='right'?Math.abs(dx):Math.abs(dy);
  paintSqueezeProgress(squeezeDragBase+dist/118);
  if(squeezeProgress>=.98){squeezeDragging=false;finishSqueeze()}
  e.preventDefault();
});
function endSqueezeDrag(){
  if(!squeezeDragging)return;
  squeezeDragging=false;
  if(squeezeProgress>=.98){
    finishSqueeze();
  }else{
    snapBackSqueeze();
  }
}
$('squeezeCard').addEventListener('pointerup',endSqueezeDrag);
$('squeezeCard').addEventListener('pointercancel',endSqueezeDrag);
$('squeezeOpenBtn').onclick=()=>{
  if(!squeezeResolve)return;
  if(squeezeCompleted){
    closeSqueezeAfterReview();
    return;
  }
  if(!squeezeDirection)squeezeDirection='up';
  finishSqueeze();
};

$('squeezeTableBtn').onclick=()=>{
  if(!squeezeResolve)return;
  squeezeDragging=false;
  squeezeTableViewing=true;
  $('squeezeOverlay').classList.add('hidden');
  $('squeezeBetCover').classList.remove('hidden');
  $('message').textContent='場のカードを確認中 — SQUEEZEへ戻れます';
};

$('squeezeReturnBtn').onclick=()=>{
  if(!squeezeResolve)return;
  squeezeTableViewing=false;
  $('squeezeBetCover').classList.add('hidden');
  updateSqueezeOverlayBounds();
  $('squeezeOverlay').classList.remove('hidden');
  $('message').textContent='SQUEEZEを続けてください';
};

async function dealCard(side,specKey){
  const c=draw(testDeal[specKey]);
  const hand=side==='player'?playerHand:bankerHand;
  const cardIndex=hand.length;
  hand.push(c);
  const el=appendBackCard(side);
  updateShoe();
  await sleep(780);

  const owner=squeezeRights(side,cardIndex);
  if(owner){
    await squeezeReveal(c,side,owner);
  }else{
    await sleep(cardIndex===0?650:780);
  }

  revealTableCard(el,c,side);
  await sleep(800);
  return c;
}
function renderRoad(){
  const recent=history.slice(-12);
  $('road').innerHTML=recent.length?recent.map(x=>`<span class="roadDot ${x.toLowerCase()}">${x}</span>`).join(''):'<span class="roadEmpty">NO RESULTS</span>';
  $('roadStats').textContent=`P ${stats.p} / B ${stats.b} / T ${stats.t}`;
}
function renderUserStrip(){
  $('userStrip').innerHTML=users.map((u,i)=>{
    const cls=i===activeUser&&phase==='bet'?'active':u.confirmed?'done':u.bank<cfg.min?'out':'';
    const mark=u.confirmed?'✓':u.bank<cfg.min?'OUT':'';
    return `<div class="userPill ${cls}"><span>${escapeHtml(u.name)}</span>${mark?`<b>${mark}</b>`:''}</div>`;
  }).join('');
}
function setState(side,text,cls=''){
  const el=$(side+'State');el.textContent=text;el.className='sideState'+(cls?' '+cls:'');
}
function phaseLabel(text){$('phaseText').textContent=text}
function toast(text){
  const el=$('toast');el.textContent=text;el.classList.add('show');
  clearTimeout(toast._t);toast._t=setTimeout(()=>el.classList.remove('show'),1500);
}
function setBetControlsEnabled(enabled){
  document.querySelectorAll('.betSpot').forEach(x=>x.disabled=!enabled);
  document.querySelectorAll('.chip').forEach(x=>x.disabled=!enabled);
  $('clearBtn').disabled=!enabled;
  $('customBtn').disabled=!enabled;
  $('dealBtn').disabled=!enabled;
  const u=currentUser();
  $('repeatBtn').disabled=!enabled||!u||!totalBets(u.lastBets);
}
function updateDealButtonLabel(){
  if(phase!=='bet'){ $('dealBtn').textContent='DEAL'; return }
  const next=findNextEligibleUnconfirmed(activeUser+1);
  $('dealBtn').textContent=next>=0?'BET確定':'DEAL';
}

/* ---------- BET ---------- */
document.querySelectorAll('.betSpot').forEach(btn=>btn.onclick=()=>{
  if(phase!=='bet'||busy)return;
  selectedBet=btn.dataset.bet;updateAll();
  $('message').textContent=`${currentUser().name}：${BET_LABEL[selectedBet]} を選択中`;
});
function addBet(amount){
  if(phase!=='bet'||busy)return;
  const u=currentUser();if(!u)return;
  if(amount<=0||u.bank<=0)return;

  const maxRoom=Math.max(0,cfg.max-u.bets[selectedBet]);
  if(maxRoom<=0){toast(`この練習版のMAXは ${fmt(cfg.max)}`);return}

  const requested=amount;
  const actual=Math.min(requested,u.bank,maxRoom);
  if(actual<=0)return;

  u.bets[selectedBet]+=actual;
  u.bank-=actual;
  sfxBet();updateAll();

  if(actual<requested){
    $('message').textContent=`${u.name}：残高分 ${fmt(actual)} をBET`;
    toast(`残高分 ${fmt(actual)} をBETしました`);
  }else{
    $('message').textContent=`${u.name}：${BET_LABEL[selectedBet]} ${fmt(u.bets[selectedBet])}`;
  }
}
$('clearBtn').onclick=()=>{
  if(phase!=='bet'||busy)return;
  const u=currentUser();if(!u)return;
  u.bank+=totalBets(u.bets);u.bets=blankBets();sfxClear();updateAll();
  $('message').textContent=`${u.name}：BETをクリアしました`;
};
$('repeatBtn').onclick=()=>{
  if(phase!=='bet'||busy)return;
  const u=currentUser();if(!u)return;
  const total=totalBets(u.lastBets);
  if(!total){toast('前回BETがありません');return}
  if(totalBets(u.bets)){toast('先にCLEARしてください');return}
  if(BET_KEYS.some(k=>(u.lastBets[k]||0)>cfg.max)){toast('前回BETが現在のMAXを超えています');return}

  if(u.bank>=total){
    u.bets={...u.lastBets};u.bank-=total;sfxBet();updateAll();
    $('message').textContent=`${u.name}：前回BETをセットしました`;
    return;
  }

  const available=u.bank;
  let remaining=available;
  const scaled=blankBets();
  const activeKeys=BET_KEYS.filter(k=>(u.lastBets[k]||0)>0);
  activeKeys.forEach((k,idx)=>{
    if(idx===activeKeys.length-1){
      scaled[k]=remaining;
      return;
    }
    const raw=Math.floor((available*(u.lastBets[k]/total))/1000)*1000;
    const amt=Math.max(0,Math.min(raw,remaining));
    scaled[k]=amt;
    remaining-=amt;
  });

  u.bets=scaled;
  u.bank=0;
  sfxBet();updateAll();
  $('message').textContent=`${u.name}：残高分 ${fmt(available)} で前回BETを再現`;
  toast(`残高分 ${fmt(available)} をBETしました`);
};
$('customBtn').onclick=()=>{
  if(phase!=='bet'||busy)return;
  $('customSub').textContent=`${currentUser().name} / ${BET_LABEL[selectedBet]} に追加`;
  $('customAmount').value='';$('customAmount').min=cfg.min;
  $('customModal').classList.remove('hidden');
  setTimeout(()=>$('customAmount').focus(),80);
};
$('customApply').onclick=()=>{
  const a=Math.floor(Number($('customAmount').value)||0);
  if(a<cfg.min){toast(`指定BETは ${fmt(cfg.min)} 以上`);return}
  if(a%1000!==0){toast('₩1,000単位で入力してください');return}
  $('customModal').classList.add('hidden');addBet(a);
};
function hasValidBet(obj,u=currentUser()){
  if(!totalBets(obj))return false;
  const belowMin=BET_KEYS.filter(k=>obj[k]>0&&obj[k]<cfg.min);
  if(!belowMin.length)return true;
  return !!u&&u.bank===0&&belowMin.length===1;
}
function findNextEligibleUnconfirmed(start=0){
  for(let i=Math.max(0,start);i<users.length;i++){
    if(users[i].bank>=cfg.min&&!users[i].confirmed)return i;
  }
  return -1;
}
function showBetTurn(){
  const u=currentUser();
  if(!u)return;
  phase='bet';busy=false;selectedBet='player';
  $('message').textContent=`${u.name}：ベットしてください`;
  phaseLabel('PLACE YOUR BETS');
  setBetControlsEnabled(true);
  updateAll();
}
$('dealBtn').onclick=async()=>{
  if(phase!=='bet'||busy)return;
  const u=currentUser();if(!u)return;
  if(!hasValidBet(u.bets,u)){toast(`各BETは ${fmt(cfg.min)} 以上（残高ALL-IN時を除く）にしてください`);return}
  u.confirmed=true;u.lastBets={...u.bets};u.stats.wagered+=totalBets(u.bets);
  const next=findNextEligibleUnconfirmed(activeUser+1);
  if(next>=0){
    activeUser=next;
    sfxBet();
    showBetTurn();
    return;
  }
  await dealRound();
};

/* ---------- ROUND ---------- */
function prepareBetRound(checkShuffle=true){
  if(checkShuffle&&needShuffle()){newShoe();toast('NEW SHOE')}
  playerHand=[];bankerHand=[];lastResult=null;phase='bet';busy=false;
  users.forEach(u=>{u.roundStartBank=u.bank;u.bets=blankBets();u.confirmed=false;u.roundNet=0});
  $('resultBanner').className='resultBanner';$('resultBanner').textContent='';
  $('playerPoint').textContent='–';$('bankerPoint').textContent='–';
  $('playerCards').innerHTML='';$('bankerCards').innerHTML='';
  setState('player','');setState('banker','');
  $('betArea').classList.remove('hidden');$('nextRoundBtn').classList.add('hidden');

  const first=users.findIndex(u=>u.bank>=cfg.min);
  if(first<0){
    phase='gameover';
    $('message').textContent='全PLAYERの残高がテーブルMIN未満です';
    phaseLabel('GAME OVER');
    $('bankText').textContent='';
    $('betArea').classList.add('hidden');
    $('nextRoundBtn').classList.add('hidden');
    renderUserStrip();
    toast('GAME OVER');
    return;
  }
  activeUser=first;
  showBetTurn();
}
async function dealRound(){
  busy=true;phase='deal';phaseLabel('NO MORE BETS');$('message').textContent='NO MORE BETS';
  setBetControlsEnabled(false);
  playerHand=[];bankerHand=[];$('playerCards').innerHTML='';$('bankerCards').innerHTML='';
  $('resultBanner').className='resultBanner';setState('player','');setState('banker','');
  renderUserStrip();
  await sleep(280);

  const seq=[['player','p1'],['banker','b1'],['player','p2'],['banker','b2']];
  for(const [side,key] of seq)await dealCard(side,key);

  const p0=handPoint(playerHand),b0=handPoint(bankerHand);
  if(p0>=8||b0>=8){
    setState('player',p0>=8?`NATURAL ${p0}`:'','natural');
    setState('banker',b0>=8?`NATURAL ${b0}`:'','natural');
    phaseLabel('NATURAL');await sleep(700);
    await settleRound();return;
  }

  let playerThird=null;
  if(p0<=5){
    setState('player',`PLAYER ${p0} → DRAW`);await sleep(620);
    playerThird=await dealCard('player','p3');
  }else{
    setState('player',`PLAYER ${p0} → STAND`);await sleep(720);
  }

  const bInitial=b0;let bankerDraw=false;
  if(!playerThird){
    bankerDraw=bInitial<=5;
  }else{
    const pv=cardPoint(playerThird);
    if(bInitial<=2)bankerDraw=true;
    else if(bInitial===3)bankerDraw=pv!==8;
    else if(bInitial===4)bankerDraw=pv>=2&&pv<=7;
    else if(bInitial===5)bankerDraw=pv>=4&&pv<=7;
    else if(bInitial===6)bankerDraw=pv===6||pv===7;
  }

  if(bankerDraw){
    setState('banker',`BANKER ${bInitial} → DRAW`);await sleep(620);
    await dealCard('banker','b3');
  }else{
    setState('banker',`BANKER ${bInitial} → STAND`);await sleep(720);
  }
  await settleRound();
}
function updateShoe(){$('shoeText').textContent=`SHOE ${shoeNo} ・ ${deck.length} cards`}

function signedFmt(v){
  if(v>0)return'+'+fmt(v);
  if(v<0)return'-'+fmt(Math.abs(v));
  return'±'+fmt(0);
}
function userOutcomeType(ur){
  const types=ur.details.map(d=>d.type).filter(Boolean);
  if(!types.length)return'push';
  const uniq=[...new Set(types)];
  if(uniq.length===1)return uniq[0];
  return'mixed';
}
function userOutcomeLabel(ur){
  const t=userOutcomeType(ur);
  return t==='win'?'WIN':t==='lose'?'LOSE':t==='push'?'PUSH':'MIXED';
}
function settleUser(u,outcome,pp,bp,pPoint,bPoint){
  let returned=0,details=[];
  function winBet(key,rate,label,note=''){
    const stake=u.bets[key];if(!stake)return;
    const pr=stake*rate;returned+=stake+pr;
    details.push({
      label,stake,type:'win',result:`WIN +${fmt(pr)}`,
      formula:`${fmt(stake)} × ${rate} = ${fmt(pr)}${note?`（${note}）`:''}`
    });
  }
  function loseBet(key,label){
    const stake=u.bets[key];if(!stake)return;
    details.push({label,stake,type:'lose',result:'LOSE',formula:''});
  }
  function pushBet(key,label){
    const stake=u.bets[key];if(!stake)return;
    returned+=stake;details.push({label,stake,type:'push',result:'PUSH',formula:'元金返却'});
  }

  if(outcome==='P'){winBet('player',1,'PLAYER');loseBet('banker','BANKER');loseBet('tie','TIE')}
  if(outcome==='B'){
    if(cfg.gameMode==='commission'){
      winBet('banker',.95,'BANKER','5% COMMISSION');
    }else{
      const rate=bPoint===6?.5:1;
      winBet('banker',rate,'BANKER',bPoint===6?'NO COMMISSION / BANKER 6':'NO COMMISSION');
    }
    loseBet('player','PLAYER');loseBet('tie','TIE');
  }
  if(outcome==='T'){pushBet('player','PLAYER');pushBet('banker','BANKER');winBet('tie',8,'TIE')}
  if(pp)winBet('playerPair',11,'PLAYER PAIR');else loseBet('playerPair','PLAYER PAIR');
  if(bp)winBet('bankerPair',11,'BANKER PAIR');else loseBet('bankerPair','BANKER PAIR');

  u.bank+=returned;
  const roundNet=u.bank-u.roundStartBank;
  u.roundNet=roundNet;u.stats.profit+=roundNet;if(roundNet>0)u.stats.positiveRounds++;
  return {
    name:u.name,initial:u.initial,roundStartBank:u.roundStartBank,
    roundNet,bankAfter:u.bank,details
  };
}
async function settleRound(){
  const usedTestDeal=Object.values(testDeal).some(Boolean);
  const p=handPoint(playerHand),b=handPoint(bankerHand);
  const outcome=p>b?'P':b>p?'B':'T',pp=isPair(playerHand),bp=isPair(bankerHand);

  // PLAYER / BANKER / TIE を先に明確に見せてから精算へ。
  await announceOutcome(outcome,p,b);

  const userResults=users.filter(u=>u.confirmed).map(u=>settleUser(u,outcome,pp,bp,p,b));

  const portalUser=users.find(u=>u.type==='user'&&u.confirmed);
  if(portalUser){
    mgPortalRecordPlay('baccarat','BACCARAT',game=>{
      const wins=mgPortalRecordValue(game,'wins')+(portalUser.roundNet>0?1:0);
      const losses=mgPortalRecordValue(game,'losses')+(portalUser.roundNet<0?1:0);
      const pushes=mgPortalRecordValue(game,'pushes')+(portalUser.roundNet===0?1:0);
      mgPortalSetRecord(game,'wins','WIN',wins);
      mgPortalSetRecord(game,'losses','LOSE',losses);
      mgPortalSetRecord(game,'pushes','PUSH',pushes);
      const decided=wins+losses;
      mgPortalSetRecord(game,'winRate','WIN RATE',decided?wins/decided*100:0,'percent');
      mgPortalSetRecord(game,'maxBank','MAX BANK',Math.max(mgPortalRecordValue(game,'maxBank'),portalUser.bank),'krw');
    });
  }

  stats.rounds++;
  if(outcome==='P')stats.p++;else if(outcome==='B')stats.b++;else stats.t++;
  history.push(outcome);
  roundHistory.push({
    round:roundNo,shoe:shoeNo,outcome,p,b,pp,bp,
    cards:playerHand.length+bankerHand.length,
    userNets:userResults.map(r=>({name:r.name,net:r.roundNet}))
  });

  const name=outcome==='P'?'PLAYER WIN':outcome==='B'?'BANKER WIN':'TIE';
  $('resultBanner').textContent=`${name}  ${p} - ${b}`;
  $('resultBanner').className=`resultBanner show ${outcome.toLowerCase()}`;
  phaseLabel(name);
  const totalNet=userResults.reduce((s,r)=>s+r.roundNet,0);
  $('message').textContent=`${name} / PLAYER合計 ${signedFmt(totalNet)}`;
  if(userResults.some(r=>r.roundNet>0)){
    sfxPayout();
    setTimeout(sfxWin,110);
    $('tableStage').classList.add('winFlash');
    setTimeout(()=>$('tableStage').classList.remove('winFlash'),800);
  }else{
    sfxLose();
  }

  lastResult={outcome,p,b,pp,bp,userResults,gameMode:cfg.gameMode};
  renderRoad();renderUserStrip();
  phase='result';busy=false;
  $('betArea').classList.add('hidden');
  $('nextRoundBtn').classList.remove('hidden');
  $('bankText').textContent='';
  $('modalNextRound').disabled=false;
  $('modalNextRound').textContent=allUsersUnableToBet()?'GAME OVER｜トップへ戻る':'次のラウンド';
  resultActionReadyAt=performance.now()+700;

  if(usedTestDeal)clearTestDeal(false);

  await sleep(360);
  showResult();
}
function buildResultHtml(){
  if(!lastResult)return'';
  const r=lastResult;
  const modeLabel=r.gameMode==='commission'?'COMMISSION':'NO COMMISSION';
  return `<div class="resultPanelTitle">ROUND ${roundNo} RESULT</div>
    <div class="resultSummary"><span>GAME RESULT</span><b>${r.outcome==='P'?'PLAYER WIN':r.outcome==='B'?'BANKER WIN':'TIE'} ・ ${r.p} - ${r.b}</b></div>
    <div class="resultSummary"><span>PAIR / MODE</span><b>P ${r.pp?'YES':'NO'} / B ${r.bp?'YES':'NO'} ・ ${modeLabel}</b></div>`+
    r.userResults.map(ur=>{
      const type=ur.roundNet>0?'win':ur.roundNet<0?'lose':'push';
      const betsHtml=ur.details.map(d=>{
        const formula=d.formula?`<div class="resultFormula">配当：${d.formula}</div>`:'';
        return `<div class="resultHand"><span>${d.label} ・ BET ${fmt(d.stake)}</span><b>${d.result}</b></div>${formula}`;
      }).join('');
      const initialDiff=ur.bankAfter-ur.initial;
      return `<div class="resultPlayer">
        <div class="resultPlayerHead"><span>${escapeHtml(ur.name)}</span><span class="playerResultBadge ${userOutcomeType(ur)}">${userOutcomeLabel(ur)}</span></div>
        <div class="resultHands">${betsHtml}</div>
        <div class="resultTotals"><span>このラウンド</span><b class="resultDelta ${type}">${signedFmt(ur.roundNet)}</b></div>
        <div class="resultTotals"><span>元金</span><b>${fmt(ur.initial)}</b></div>
        <div class="resultTotals"><span>残高</span><b>${fmt(ur.roundStartBank)} → ${fmt(ur.bankAfter)}</b></div>
        <div class="resultTotals"><span>元金差</span><b class="resultDelta ${initialDiff>0?'win':initialDiff<0?'lose':'push'}">${signedFmt(initialDiff)}</b></div>
      </div>`;
    }).join('');
}
function showResult(){
  if(!lastResult)return;
  $('resultSub').textContent=`ROUND ${roundNo}`;
  $('resultContent').innerHTML=buildResultHtml();
  $('resultModal').classList.remove('hidden');
}
$('nextRoundBtn').onclick=showResult;
$('resultBanner').onclick=showResult;
function returnToTopScreen(){
  stopBgm(true);
  $('resultModal').classList.add('hidden');
  $('statsModal').classList.add('hidden');
  $('settingsModal').classList.add('hidden');
  $('confirmModal').classList.add('hidden');
  $('bgmModal').classList.add('hidden');
  $('squeezeOverlay').classList.add('hidden');
  $('squeezeBetCover').classList.add('hidden');
  $('outcomeOverlay').classList.add('hidden');
  $('gameScreen').style.display='none';
  $('setupScreen').style.display='block';
  phase='setup';
  window.scrollTo({top:0,behavior:'instant'});
}
$('modalNextRound').onclick=()=>{
  if(performance.now()<resultActionReadyAt)return;

  if(allUsersUnableToBet()){
    returnToTopScreen();
    return;
  }

  $('resultModal').classList.add('hidden');
  roundNo++;
  prepareBetRound(true);
};

/* ---------- HELP / STATS / SETTINGS ---------- */
function helpHtml(modeKey){
  if(modeKey==='basic')return `
    <div class="helpCard"><h3>ゲームの目的</h3><b>PLAYER</b> と <b>BANKER</b> のどちらが9に近いポイントになるかを予想してBETします。<b>TIE</b> は同点予想です。PLAYER/BANKERは「客とカジノ」という意味ではなく、勝負する2つのサイド名です。</div>
    <div class="helpCard"><h3>カードの点数</h3><b>A = 1</b>、2〜9 = 表示どおり、<b>10/J/Q/K = 0</b>。合計が10以上なら十の位を捨て、下一桁だけを使います。例：7＋8＝15 → <b>5ポイント</b>。</div>
    <div class="helpCard"><h3>最初の配札</h3>基本の順番は <b>PLAYER → BANKER → PLAYER → BANKER</b>。まず両サイドに2枚ずつ配ります。</div>
    <div class="helpCard"><h3>NATURAL</h3>最初の2枚で8または9なら <b>NATURAL</b>。どちらか一方でもNATURALなら追加カードなしで勝敗を決めます。</div>
    <div class="helpCard"><h3>USERが選ぶもの</h3>USERが選ぶのはBET先とBET額です。HIT/STANDのようなカード判断はなく、3枚目はドローイングルールで自動決定されます。</div>
    <div class="helpCard"><h3>SQUEEZE</h3>All Card SqueezeではBETした側のカードを直接確認できます。この練習版では各サイドの最大メインBET USERにSQUEEZE権を割り当てています。</div>`;

  if(modeKey==='draw')return `
    <div class="helpCard"><h3>最優先：NATURAL</h3>最初の2枚でPLAYERまたはBANKERが8/9なら、その時点で終了。3枚目はありません。</div>
    <div class="helpCard"><h3>PLAYERの3枚目</h3>
      <table class="ruleTable">
        <tr><th>PLAYER 2枚計</th><th>判定</th></tr>
        <tr><td>0〜5</td><td>DRAW</td></tr>
        <tr><td>6〜7</td><td>STAND</td></tr>
        <tr><td>8〜9</td><td>NATURAL</td></tr>
      </table>
    </div>
    <div class="helpCard"><h3>BANKER：PLAYERが3枚目を引いた場合</h3>
      <table class="ruleTable">
        <tr><th>BANKER 2枚計</th><th>BANKERがDRAWするPLAYER 3枚目</th></tr>
        <tr><td>0〜2</td><td>すべて</td></tr>
        <tr><td>3</td><td>8以外</td></tr>
        <tr><td>4</td><td>2〜7</td></tr>
        <tr><td>5</td><td>4〜7</td></tr>
        <tr><td>6</td><td>6〜7</td></tr>
        <tr><td>7</td><td>STAND</td></tr>
      </table>
    </div>
    <div class="helpCard"><h3>PLAYERが3枚目を引かない場合</h3>PLAYERが6/7でSTANDした場合、BANKERは <b>0〜5でDRAW、6〜7でSTAND</b> します。</div>
    <div class="helpCard"><h3>実戦では暗記不要</h3>参加者がDRAW/STANDを選択するわけではありません。ディーラーが決められたルールで処理します。</div>`;

  if(modeKey==='payout')return `
    <div class="helpCard"><h3>Commission Baccarat</h3>
      <table class="ruleTable">
        <tr><th>BET</th><th>勝利時の利益</th></tr>
        <tr><td>PLAYER</td><td>1 : 1</td></tr>
        <tr><td>BANKER</td><td>0.95 : 1（5%控除）</td></tr>
        <tr><td>TIE</td><td>8 : 1</td></tr>
        <tr><td>PAIR</td><td>11 : 1</td></tr>
      </table>
    </div>
    <div class="helpCard"><h3>No Commission Baccarat</h3>BANKER勝利は通常 <b>1 : 1</b>。ただし、<b>BANKERが6ポイントで勝利した場合だけ0.5 : 1</b> です。</div>
    <div class="helpCard"><h3>TIEになった場合</h3>TIE BETは8:1で勝利。PLAYER/BANKERのメインBETは負けではなく <b>PUSH</b> となり元金返却です。</div>
    <div class="helpCard"><h3>テーブルLIMIT</h3>実カジノでは各テーブルごとにMIN/MAXがあります。この練習版のMAXは実テーブルの具体額ではなく、練習上 <b>MIN×100</b> としています。</div>`;

  if(modeKey==='pair')return `
    <div class="helpCard"><h3>PLAYER PAIR / BANKER PAIR</h3>各サイドの<b>最初の2枚</b>が同じランクならPAIR成立。PAIR BETの利益は <b>11 : 1</b> です。</div>
    <div class="helpCard"><h3>成立例</h3>7♠＋7♥、J♦＋J♣、K♠＋K♦ など。</div>
    <div class="helpCard"><h3>成立しない例</h3>10とJ、JとQ、QとKなど。バカラ上の点数はいずれも0ですが、<b>ランクが異なるためPAIRではありません</b>。</div>
    <div class="helpCard"><h3>サイドBETだけでも参加可能</h3>Paradiseの案内では、PLAYER/BANKERのメインBETなしでTIEやPAIRだけにBETする参加も可能です。その場合はカードを表向きで配ると案内されています。</div>`;

  return `
    <div class="helpCard"><h3>1ラウンドの流れ</h3>
      <div class="ruleStep"><div class="ruleNo">1</div><div><b>BET</b><span>PLAYER / BANKER / TIE / PAIRなどへ、テーブルLIMITの範囲内でBETします。</span></div></div>
      <div class="ruleStep"><div class="ruleNo">2</div><div><b>NO MORE BETS</b><span>ディーラーの「No More Bets」以降はBETできません。</span></div></div>
      <div class="ruleStep"><div class="ruleNo">3</div><div><b>INITIAL TWO CARDS</b><span>PLAYER → BANKER → PLAYER → BANKERの順に2枚ずつ配ります。</span></div></div>
      <div class="ruleStep"><div class="ruleNo">4</div><div><b>NATURAL判定</b><span>どちらかが8/9なら追加カードなしで勝敗を決めます。</span></div></div>
      <div class="ruleStep"><div class="ruleNo">5</div><div><b>3rd CARD判定</b><span>NATURALでなければPLAYERを先に判定し、その結果とPLAYERの3枚目を使ってBANKERのDRAW/STANDを決めます。</span></div></div>
      <div class="ruleStep"><div class="ruleNo">6</div><div><b>WIN / PAYOUT</b><span>2枚または3枚の最終ポイントを比較し、高い側が勝利。同点はTIEです。</span></div></div>
    </div>

    <div class="helpCard"><h3>ポイント比較</h3>最大は9、最小は0です。カード枚数ではなく<b>最終ポイント</b>だけを比較します。例：PLAYER 3枚で9、BANKER 2枚で8 → PLAYER勝利。</div>

    <div class="helpCard"><h3>STANDとNOTHING</h3>PLAYERの2枚計6/7、BANKERの2枚計7はSTAND。PLAYER 5以下、BANKER 6以下などは追加カード判定へ進みます。</div>

    <div class="helpCard"><h3>Commission / No Commission</h3><b>Commission</b>ではBANKER勝利利益から5%控除。<b>No Commission</b>では原則控除なしですが、BANKERが6で勝った時だけ利益50%です。</div>

    <div class="helpCard"><h3>No Squeeze / All Card Squeeze</h3><b>No Squeeze</b>は通常オープン。<b>All Card Squeeze</b>はBETした側のカードを直接確認できる方式です。SQUEEZEは結果を変える操作ではなくカード確認の演出です。</div>

    <div class="helpCard"><h3>LIMIT</h3>各テーブルには最低BET額MINと最高BET額MAXがあります。ParadiseではCommission / No Commission、No Squeeze / All Card Squeeze、LIMITを組み合わせて選べると案内されています。</div>

    <div class="helpCard"><h3>シャッフル・カット・シュー</h3>実テーブルではシャッフル後、参加者がインジケートカードを使ってカットする機会があります。その後カードをシューへ入れてゲームを進め、シュー終了を示すカードが出たゲームがラストゲームになります。</div>

    <div class="helpCard"><h3>SCORE CARD</h3>ParadiseではPLAYER/BANKERの勝敗やパターンを記録するスコア用紙が用意されています。このゲームの <b>GAME HISTORY</b> は、その用途をスマホ上で再現するための機能です。</div>

    <div class="ruleNote"><b>公式ルールと練習版の区別：</b><br>配当・ドローイングルール・Commission/No Commission・Squeeze・PairなどはParadiseの案内を基準にしています。一方、8 DECK、具体的なMAX額、SQUEEZE担当者の決め方など、公式ページで具体条件を確認できない部分は練習ゲーム側の実装です。</div>

    <div class="ruleWarn"><b>覚え方：</b>PLAYER/BANKERという名前に惑わされず、「どちらのハンドが勝つかへBETするゲーム」と考えると理解しやすくなります。</div>`;
}
let helpMode='basic';
function renderHelp(){
  $('helpContent').innerHTML=helpHtml(helpMode);
  document.querySelectorAll('[data-help]').forEach(x=>x.classList.toggle('active',x.dataset.help===helpMode));
}
$('helpBtn').onclick=()=>{helpMode='basic';renderHelp();$('helpModal').classList.remove('hidden')};
document.querySelectorAll('[data-help]').forEach(x=>x.onclick=()=>{helpMode=x.dataset.help;renderHelp()});

let statsMode='players';
function renderStatsModal(){
  const totalProfit=users.reduce((s,u)=>s+u.stats.profit,0);
  const totalWagered=users.reduce((s,u)=>s+u.stats.wagered,0);
  const roi=totalWagered?totalProfit/totalWagered*100:0;

  const userRows=users.map(u=>`
    <div class="userResultBlock">
      <div class="userResultHead"><span>${escapeHtml(u.name)} <small style="color:var(--gold)">${u.type==='user'?'USER':'GUEST'}</small></span><b class="${u.stats.profit>=0?'resultDelta win':'resultDelta lose'}">${signedFmt(u.stats.profit)}</b></div>
      <div class="userResultMeta">BANK ${fmt(u.bank)} / BET ${fmt(u.stats.wagered)} / ＋ROUND ${u.stats.positiveRounds}</div>
    </div>`).join('');

  const historyRows=[...roundHistory].reverse().map(h=>`
    <tr>
      <td>${h.round}</td>
      <td><span class="histOutcome ${h.outcome.toLowerCase()}">${h.outcome}</span></td>
      <td>${h.p}</td><td>${h.b}</td>
      <td class="${h.pp?'histPair':''}">${h.pp?'●':'-'}</td>
      <td class="${h.bp?'histPair':''}">${h.bp?'●':'-'}</td>
      <td>${h.cards}</td>
    </tr>`).join('');

  const playerHtml=`
    <div class="statsGrid">
      <div class="statBox"><b>${stats.rounds}</b><span>ROUNDS</span></div>
      <div class="statBox"><b>${stats.p}</b><span>PLAYER</span></div>
      <div class="statBox"><b>${stats.b}</b><span>BANKER</span></div>
      <div class="statBox"><b>${stats.t}</b><span>TIE</span></div>
      <div class="statBox"><b>${signedFmt(totalProfit)}</b><span>PLAYER損益</span></div>
      <div class="statBox"><b>${roi.toFixed(1)}%</b><span>BET ROI</span></div>
    </div>
    <div class="resultContent" style="margin-top:8px">${userRows}</div>`;

  const historyHtml=`
    <div class="historyTitle"><b>GAME HISTORY</b><span>最新ラウンドを上に表示</span></div>
    <div class="historyWrap">
      <table class="historyTable">
        <thead><tr><th>NO.</th><th>RESULT</th><th>P</th><th>B</th><th>P PAIR</th><th>B PAIR</th><th>CARDS</th></tr></thead>
        <tbody>${historyRows||'<tr><td colspan="7">NO RESULTS</td></tr>'}</tbody>
      </table>
    </div>`;

  $('statsContent').innerHTML=statsMode==='players'?playerHtml:historyHtml;
  $('statsPlayerTab').classList.toggle('active',statsMode==='players');
  $('statsHistoryTab').classList.toggle('active',statsMode==='history');
}
$('statsBtn').onclick=()=>{
  statsMode='players';
  renderStatsModal();
  $('statsModal').classList.remove('hidden');
};
$('statsPlayerTab').onclick=()=>{statsMode='players';renderStatsModal()};
$('statsHistoryTab').onclick=()=>{statsMode='history';renderStatsModal()};
$('settingsBtn').onclick=()=>{
  syncTestControlsFromState();
  $('settingsContent').innerHTML=`
    <div class="resultRow"><span>PLAYER構成</span><b>${users.filter(u=>u.type==='user').length} USER / ${users.filter(u=>u.type==='guest').length} GUEST</b></div>
    <div class="resultRow"><span>TABLE LIMIT</span><b>${fmt(cfg.min)} / ${fmt(cfg.max)}</b></div>
    <div class="resultRow"><span>ゲーム方式</span><b>${cfg.gameMode==='commission'?'COMMISSION':'NO COMMISSION'}</b></div>
    <div class="resultRow"><span>カード確認</span><b>${cfg.squeezeMode==='all'?'ALL CARD SQUEEZE':'NO SQUEEZE'}</b></div>
    <div class="resultRow"><span>SHOE</span><b>8 DECK</b></div>
    <div class="resultRow"><span>開始資金入力</span><b>${mode==='jpy'?`JPY → KRW（1円=${cfg.rate}₩）`:'KRW'}</b></div>`;
  $('settingsModal').classList.remove('hidden');
};
function escapeHtml(s){return String(s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]))}

/* ---------- NAV / MODALS ---------- */
$('topBtn').onclick=()=>{$('confirmModal').classList.remove('hidden')};
$('confirmTop').onclick=returnToTopScreen;
document.querySelectorAll('[data-close]').forEach(btn=>btn.onclick=()=>$(btn.dataset.close).classList.add('hidden'));
document.querySelectorAll('.modal').forEach(m=>m.addEventListener('click',e=>{if(e.target===m)m.classList.add('hidden')}));
$('testToggle').onclick=()=>{
  $('testPanel').classList.toggle('hidden');
  $('testToggle').textContent=$('testPanel').classList.contains('hidden')
    ?'テスト配札を設定'
    :'テスト配札を閉じる';
};
$('testClearBtn').onclick=()=>clearTestDeal(true);

/* ---------- AUDIO ---------- */
const AUDIO_BGM_KEY='baccarat_bgm_volume_v1';
const AUDIO_SFX_KEY='baccarat_sfx_volume_v1';
function clamp01(v){return Math.max(0,Math.min(1,Number(v)||0))}
function loadAudioVolume(key){
  try{
    const raw=localStorage.getItem(key);
    return raw===null?1:clamp01(Number(raw));
  }catch{return 1}
}
function saveAudioVolume(key,value){
  try{localStorage.setItem(key,String(clamp01(value)))}catch{}
}
let audioCtx=null,bgmOn=false,bgmTimer=null,bgmMode='lounge',bgmSession=0,bgmMaster=null,sfxMaster=null,bgmVolume=loadAudioVolume(AUDIO_BGM_KEY),sfxVolume=loadAudioVolume(AUDIO_SFX_KEY),bgmWasPlayingBeforeHide=false,bgmResumeMode=null,audioRestoreBusy=false;
function ensureSfxMaster(ac){
  if(!sfxMaster){
    sfxMaster=ac.createGain();
    sfxMaster.gain.value=sfxVolume;
    sfxMaster.connect(ac.destination);
  }
  return sfxMaster;
}
function ensureAudio(){
  if(!audioCtx||audioCtx.state==='closed'){
    audioCtx=new (window.AudioContext||window.webkitAudioContext)();
    sfxMaster=null;
  }
  ensureSfxMaster(audioCtx);
  if(audioCtx.state==='suspended')audioCtx.resume().catch(()=>{});
  return audioCtx;
}
function sfxTone(freq=440,dur=.06,vol=.045,type='sine',endFreq=null,delay=0){
  try{
    const ac=ensureAudio(),t=ac.currentTime+delay;
    const o=ac.createOscillator(),g=ac.createGain(),f=ac.createBiquadFilter();
    o.type=type;
    o.frequency.setValueAtTime(freq,t);
    if(endFreq)o.frequency.exponentialRampToValueAtTime(endFreq,t+dur);
    f.type='lowpass';
    f.frequency.value=3500;
    g.gain.setValueAtTime(.0001,t);
    g.gain.exponentialRampToValueAtTime(vol,t+.008);
    g.gain.exponentialRampToValueAtTime(.0001,t+dur);
    o.connect(f);f.connect(g);g.connect(ensureSfxMaster(ac));
    o.start(t);o.stop(t+dur+.02);
  }catch{}
}
function sfxNoise(dur=.055,vol=.03,highpass=1000,delay=0){
  try{
    const ac=ensureAudio(),t=ac.currentTime+delay;
    const len=Math.floor(ac.sampleRate*dur);
    const buf=ac.createBuffer(1,len,ac.sampleRate);
    const d=buf.getChannelData(0);
    for(let i=0;i<len;i++)d[i]=(Math.random()*2-1)*(1-i/len);
    const s=ac.createBufferSource(),f=ac.createBiquadFilter(),g=ac.createGain();
    s.buffer=buf;
    f.type='highpass';
    f.frequency.value=highpass;
    g.gain.value=vol;
    s.connect(f);f.connect(g);g.connect(ensureSfxMaster(ac));
    s.start(t);
  }catch{}
}
function sfxCard(){
  sfxNoise(.05,.024,1600);
  sfxTone(190,.045,.018,'triangle',145,.008);
}
function sfxReveal(){
  sfxNoise(.035,.014,1800);
  sfxTone(420,.05,.018,'triangle',540,.012);
}
function sfxBet(){
  sfxTone(760,.045,.035,'sine',520);
  sfxTone(1040,.035,.024,'sine',800,.035);
}
function sfxClear(){
  sfxTone(400,.05,.02,'triangle',250);
}
function sfxPayout(){
  sfxTone(660,.05,.032,'triangle',880);
  sfxTone(880,.06,.03,'triangle',1180,.055);
}
function sfxWin(){
  sfxTone(1480,.055,.040,'sine',1760,0);
  sfxTone(2217,.045,.025,'sine',2489,.012);
  sfxTone(1760,.065,.035,'triangle',2093,.040);
  sfxTone(2637,.055,.020,'sine',2960,.060);
  sfxTone(2093,.12,.032,'sine',2349,.095);
  sfxTone(3136,.16,.018,'sine',3322,.120);
  sfxNoise(.025,.008,2600,.018);
}
function sfxLose(){
  sfxTone(440,.12,.038,'triangle',330,0);
  sfxTone(330,.16,.035,'triangle',220,.12);
}

function sfxOutcomePlayer(){
  sfxNoise(.045,.012,2100,0);
  sfxTone(520,.11,.027,'triangle',660,.01);
  sfxTone(660,.14,.032,'sine',880,.105);
  sfxTone(1046.5,.18,.020,'sine',1174.7,.22);
}
function sfxOutcomeBanker(){
  sfxNoise(.05,.013,1450,0);
  sfxTone(330,.12,.032,'triangle',392,.01);
  sfxTone(392,.16,.034,'triangle',523.25,.11);
  sfxTone(783.99,.18,.018,'sine',880,.23);
}
function sfxOutcomeTie(){
  sfxTone(523.25,.16,.027,'sine',523.25,0);
  sfxTone(659.25,.18,.027,'sine',659.25,.035);
  sfxTone(783.99,.22,.024,'sine',783.99,.09);
  sfxNoise(.035,.008,2600,.05);
}
function sfxOutcome(outcome){
  if(outcome==='P')sfxOutcomePlayer();
  else if(outcome==='B')sfxOutcomeBanker();
  else sfxOutcomeTie();
}
async function announceOutcome(outcome,p,b){
  const overlay=$('outcomeOverlay');
  const main=$('outcomeMain');
  const score=$('outcomeScore');
  const name=outcome==='P'?'PLAYER WIN':outcome==='B'?'BANKER WIN':'TIE';

  // 最終カードが見えたあと、勝敗演出の前に一呼吸。
  phaseLabel('RESULT');
  $('message').textContent='勝敗判定…';
  await sleep(680);

  main.textContent=name;
  score.textContent=`PLAYER ${p}  —  BANKER ${b}`;
  overlay.className=`outcomeOverlay ${outcome.toLowerCase()}`;
  overlay.classList.remove('hidden');
  void overlay.offsetWidth;
  overlay.classList.add('play');
  sfxOutcome(outcome);

  await sleep(1260);
  overlay.classList.remove('play');
  overlay.classList.add('hidden');
}
function startLoungeBgm(){
  if(bgmOn)return;
  const ctx=ensureAudio();
  bgmOn=true;bgmMode='lounge';const session=++bgmSession;
  $('bgmBtn').textContent='BGM：LOUNGE';

  const master=ctx.createGain(),room=ctx.createBiquadFilter();
  bgmMaster=master;
  master.gain.value=.16*bgmVolume;
  room.type='lowpass';room.frequency.value=4200;room.Q.value=.3;
  room.connect(master);master.connect(ctx.destination);

  const bpm=76,beat=60/bpm,bar=beat*4;
  const chords=[
    [261.63,311.13,392.00,466.16],
    [207.65,261.63,311.13,392.00],
    [233.08,293.66,349.23,440.00],
    [196.00,246.94,293.66,349.23]
  ];
  const bass=[65.41,51.91,58.27,49.00];
  let barIndex=0,nextTime=ctx.currentTime+.05;

  function envGain(t,peak,attack,hold,release){
    const g=ctx.createGain();
    g.gain.setValueAtTime(.0001,t);
    g.gain.exponentialRampToValueAtTime(peak,t+attack);
    g.gain.setValueAtTime(peak,t+attack+hold);
    g.gain.exponentialRampToValueAtTime(.0001,t+attack+hold+release);
    return g;
  }
  function pianoTone(freq,t,dur,vol=.024){
    const o=ctx.createOscillator(),g=envGain(t,vol,.012,dur*.5,dur*.45),f=ctx.createBiquadFilter();
    o.type='triangle';o.frequency.setValueAtTime(freq,t);f.type='lowpass';f.frequency.value=2200;
    o.connect(f);f.connect(g);g.connect(room);o.start(t);o.stop(t+dur+.08);
  }
  function bassTone(freq,t,dur){
    const o=ctx.createOscillator(),g=envGain(t,.028,.02,dur*.62,dur*.3),f=ctx.createBiquadFilter();
    o.type='sine';o.frequency.setValueAtTime(freq,t);f.type='lowpass';f.frequency.value=330;
    o.connect(f);f.connect(g);g.connect(room);o.start(t);o.stop(t+dur+.08);
  }
  function vibeTone(freq,t){
    const o=ctx.createOscillator(),g=envGain(t,.012,.008,.12,.6);
    o.type='sine';o.frequency.setValueAtTime(freq*2,t);
    o.connect(g);g.connect(room);o.start(t);o.stop(t+.85);
  }
  function brush(t,strong=false){
    const len=Math.floor(ctx.sampleRate*.08),buf=ctx.createBuffer(1,len,ctx.sampleRate),data=buf.getChannelData(0);
    for(let i=0;i<len;i++)data[i]=(Math.random()*2-1)*(1-i/len);
    const s=ctx.createBufferSource(),f=ctx.createBiquadFilter(),g=ctx.createGain();
    s.buffer=buf;f.type='highpass';f.frequency.value=strong?1500:2500;g.gain.value=strong?.008:.0045;
    s.connect(f);f.connect(g);g.connect(room);s.start(t);
  }
  function scheduleBar(){
    if(!bgmOn||session!==bgmSession)return;
    const c=chords[barIndex%chords.length],t=nextTime;
    c.forEach((n,i)=>pianoTone(n,t+i*.018,bar*.92,.018));
    bassTone(bass[barIndex%bass.length],t,beat*.9);
    bassTone(bass[barIndex%bass.length]*1.5,t+beat*2,beat*.75);
    brush(t,true);brush(t+beat);brush(t+beat*2,true);brush(t+beat*3);
    vibeTone(c[(barIndex+1)%c.length],t+beat*1.5);
    if(barIndex%2===1)vibeTone(c[(barIndex+2)%c.length]*.5,t+beat*3.25);
    barIndex++;nextTime+=bar;
    const delay=Math.max(80,(nextTime-ctx.currentTime-bar*.35)*1000);
    bgmTimer=setTimeout(scheduleBar,delay);
  }
  scheduleBar();
}

function startUpbeatBgm(){
  stopBgm(false);
  const ctx=ensureAudio();
  bgmOn=true;bgmMode='upbeat';const session=++bgmSession;
  $('bgmBtn').textContent='BGM：RUSH';

  const master=ctx.createGain(),room=ctx.createBiquadFilter();
  bgmMaster=master;
  master.gain.value=.12*bgmVolume;
  room.type='lowpass';room.frequency.value=4800;room.Q.value=.28;
  room.connect(master);master.connect(ctx.destination);

  const bpm=138,beat=60/bpm;
  const progression=[
    [293.66,349.23,440.00,523.25],
    [392.00,466.16,587.33,698.46],
    [261.63,311.13,392.00,466.16],
    [311.13,392.00,466.16,587.33],
    [349.23,415.30,523.25,622.25],
    [466.16,554.37,698.46,830.61],
    [311.13,392.00,466.16,587.33],
    [392.00,493.88,587.33,739.99]
  ];
  const roots=[73.42,98.00,65.41,77.78,87.31,116.54,77.78,98.00];
  const solo=[523.25,587.33,622.25,698.46,783.99,830.61,932.33,1046.50];
  let barIndex=0,nextTime=ctx.currentTime+.05;

  function env(t,peak,a,h,r){
    const g=ctx.createGain();
    g.gain.setValueAtTime(.0001,t);
    g.gain.exponentialRampToValueAtTime(peak,t+a);
    g.gain.setValueAtTime(peak,t+a+h);
    g.gain.exponentialRampToValueAtTime(.0001,t+a+h+r);
    return g;
  }
  function piano(freq,t,dur,vol=.016){
    const o=ctx.createOscillator(),g=env(t,vol,.006,dur*.32,dur*.6),f=ctx.createBiquadFilter();
    o.type='triangle';o.frequency.setValueAtTime(freq,t);f.type='lowpass';f.frequency.value=2450;
    o.connect(f);f.connect(g);g.connect(room);o.start(t);o.stop(t+dur+.05);
  }
  function upright(freq,t,dur,vol=.03){
    const o=ctx.createOscillator(),o2=ctx.createOscillator(),g=env(t,vol,.008,dur*.42,dur*.5),f=ctx.createBiquadFilter();
    o.type='sine';o2.type='triangle';o.frequency.setValueAtTime(freq,t);o2.frequency.setValueAtTime(freq*2,t);
    f.type='lowpass';f.frequency.value=520;
    const g2=ctx.createGain();g2.gain.value=.12;
    o.connect(f);o2.connect(g2);g2.connect(f);f.connect(g);g.connect(room);
    o.start(t);o2.start(t);o.stop(t+dur+.04);o2.stop(t+dur+.04);
  }
  function horn(freq,t,dur,vol=.012){
    const o=ctx.createOscillator(),g=env(t,vol,.012,dur*.3,dur*.58),f=ctx.createBiquadFilter();
    o.type='sawtooth';o.frequency.setValueAtTime(freq,t);f.type='lowpass';f.frequency.value=1450;
    o.connect(f);f.connect(g);g.connect(room);o.start(t);o.stop(t+dur+.05);
  }
  function brush(t,dur=.055,vol=.013,hp=1800){
    const len=Math.floor(ctx.sampleRate*dur),buf=ctx.createBuffer(1,len,ctx.sampleRate),d=buf.getChannelData(0);
    for(let i=0;i<len;i++)d[i]=(Math.random()*2-1)*(1-i/len);
    const s=ctx.createBufferSource(),f=ctx.createBiquadFilter(),g=ctx.createGain();
    s.buffer=buf;f.type='highpass';f.frequency.value=hp;g.gain.value=vol;
    s.connect(f);f.connect(g);g.connect(room);s.start(t);
  }
  function ride(t,accent=false){brush(t,.028,accent?.013:.007,5600)}
  function kick(t){
    const o=ctx.createOscillator(),g=ctx.createGain();
    o.type='sine';o.frequency.setValueAtTime(92,t);o.frequency.exponentialRampToValueAtTime(52,t+.07);
    g.gain.setValueAtTime(.035,t);g.gain.exponentialRampToValueAtTime(.0001,t+.1);
    o.connect(g);g.connect(room);o.start(t);o.stop(t+.11);
  }
  function compChord(chord,t,dur=.28,vol=.011){
    chord.slice(1).forEach((n,i)=>piano(n*(i===2?2:1),t+i*.009,dur,vol));
  }
  function scheduleBar(){
    if(!bgmOn||session!==bgmSession)return;
    while(nextTime<ctx.currentTime+1.05){
      const idx=barIndex%progression.length,chord=progression[idx],root=roots[idx],t=nextTime;
      const nextRoot=roots[(idx+1)%roots.length];
      const walk=[root,root*1.5,root*1.78,(nextRoot>root?nextRoot/1.05946:nextRoot*1.05946)];
      walk.forEach((n,i)=>upright(n,t+beat*i,beat*.72,i===0?.031:.026));

      compChord(chord,t+beat*.48,beat*.34,.012);
      compChord(chord,t+beat*1.72,beat*.28,.010);
      if(barIndex%2===0)compChord(chord,t+beat*2.55,beat*.3,.011);
      else compChord(chord,t+beat*3.18,beat*.26,.011);

      ride(t,true);ride(t+beat*.66,false);ride(t+beat,true);ride(t+beat*1.66,false);
      ride(t+beat*2,true);ride(t+beat*2.66,false);ride(t+beat*3,true);ride(t+beat*3.66,false);
      kick(t);kick(t+beat*2);
      brush(t+beat,.07,.017,1450);brush(t+beat*3,.07,.018,1450);

      if(barIndex%4===0||barIndex%4===2){
        horn(chord[1]*2,t+beat*1.28,beat*.32,.010);
        horn(chord[2]*2,t+beat*1.31,beat*.32,.008);
      }
      if(barIndex%4===3){
        chord.slice(1).forEach((n,i)=>horn(n*2,t+beat*3.18+i*.012,beat*.42,.008));
      }

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
  try{bgmMaster.gain.setValueAtTime(value,audioCtx.currentTime)}catch{bgmMaster.gain.value=value}
}
function applySfxVolume(){
  if(!sfxMaster||!audioCtx)return;
  try{sfxMaster.gain.setValueAtTime(sfxVolume,audioCtx.currentTime)}catch{sfxMaster.gain.value=sfxVolume}
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
    try{bgmMaster.disconnect()}catch{}
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
    bgmOn=false;
    bgmSession++;
    if(bgmTimer){clearTimeout(bgmTimer);bgmTimer=null}
    if(bgmMaster){
      try{bgmMaster.disconnect()}catch{}
      bgmMaster=null;
    }
  }
  if(audioCtx&&audioCtx.state==='running'){
    try{audioCtx.suspend()}catch{}
  }
}
async function ensureAudioContextRunning(){
  try{
    if(!audioCtx||audioCtx.state==='closed'){
      audioCtx=new (window.AudioContext||window.webkitAudioContext)();
      sfxMaster=null;
    }
    ensureSfxMaster(audioCtx);
    if(audioCtx.state!=='running')await audioCtx.resume();
    return audioCtx.state==='running';
  }catch{
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
  restoreAudioAfterPageReturn();
}
window.addEventListener('resize',()=>{
  if(!$('squeezeOverlay').classList.contains('hidden'))updateSqueezeOverlayBounds();
});
window.addEventListener('orientationchange',()=>{
  setTimeout(()=>{
    if(!$('squeezeOverlay').classList.contains('hidden'))updateSqueezeOverlayBounds();
  },180);
});
document.addEventListener('visibilitychange',()=>{
  if(document.visibilityState==='hidden')pauseAudioForPageHide();
  else restoreAudioAfterPageReturn();
});
window.addEventListener('pagehide',pauseAudioForPageHide);
window.addEventListener('pageshow',()=>restoreAudioAfterPageReturn());
window.addEventListener('focus',()=>restoreAudioAfterPageReturn());
document.addEventListener('pointerdown',unlockAudioFromGesture,{capture:true,passive:true});
document.addEventListener('touchstart',unlockAudioFromGesture,{capture:true,passive:true});

syncAudioVolumeUi();
$('bgmBtn').onclick=()=>{syncAudioVolumeUi();$('bgmModal').classList.remove('hidden')};
$('bgmVolume').addEventListener('input',e=>setBgmVolumeFromUi(e.target.value));
$('sfxVolume').addEventListener('input',e=>setSfxVolumeFromUi(e.target.value));
$('bgmJazz').onclick=()=>{playBgm('lounge');$('bgmModal').classList.add('hidden')};
$('bgmUpbeat').onclick=()=>{playBgm('upbeat');$('bgmModal').classList.add('hidden')};
$('bgmOff').onclick=()=>{stopBgm(true);$('bgmModal').classList.add('hidden')};
$('closeBgm').onclick=()=>{$('bgmModal').classList.add('hidden')};
$('bgmModal').addEventListener('click',e=>{if(e.target===$('bgmModal'))$('bgmModal').classList.add('hidden')});
