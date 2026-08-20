(()=>{
'use strict';
const SAVE_KEY='yukyo_yakata_save_v1';
const BUILD='collision-interaction-v3';
const W=640,H=640,WORLD=640;
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const canvas=$('#game'),ctx=canvas.getContext('2d');
const ui={title:$('#titleScreen'),app:$('#gameApp'),roomName:$('#roomName'),stateLabel:$('#stateLabel'),status:$('#status'),near:$('#nearPrompt'),message:$('#message'),flash:$('#flash'),jumpscare:$('#jumpscare'),menu:$('#menuOverlay'),menuBody:$('#menuBody'),puzzle:$('#puzzleOverlay'),puzzleTitle:$('#puzzleTitle'),puzzleBody:$('#puzzleBody'),ending:$('#endingOverlay'),objectiveMini:$('#objectiveMini')};
const dirs=['down','up','left','right'];
const images={rooms:{},hero:{},ghost:{}};
for(const r of ['bedroom','corridor','study','bath','basement','mirror','parlor']){const im=new Image();im.src=`./assets/rooms/${r}.webp`;images.rooms[r]=im}
for(const d of dirs){images.hero[d]=[];images.ghost[d]=[];for(let i=0;i<3;i++){let h=new Image();h.src=`./assets/hero/${d}_${i}.webp`;images.hero[d].push(h);let g=new Image();g.src=`./assets/ghost/${d}_${i}.webp`;images.ghost[d].push(g)}}
const itemDefs={
 smallKey:{icon:'鍵',name:'小さな鍵',desc:'寝室の鏡台から見つけた小さな鍵。'},
 basementKey:{icon:'鍵',name:'地下室の鍵',desc:'書斎の金庫に入っていた重い鍵。'},
 shard1:{icon:'◇',name:'鏡片・壱',desc:'冷たい鏡の欠片。裏に「一」と刻まれている。'},
 shard2:{icon:'◇',name:'鏡片・弐',desc:'浴室で見つけた鏡の欠片。触れると微かに震える。'},
 shard3:{icon:'◇',name:'鏡片・参',desc:'地下室で見つけた鏡の欠片。赤黒い染みがある。'},
 silverRing:{icon:'○',name:'銀の輪',desc:'美緒の写真立ての裏に隠されていた銀の輪。三枚の鏡片を固定できそうだ。'}
};
const noteDefs={
 letter:{name:'差出人のない手紙',text:'「まだ、鏡の中にいる。三つに割れた私を集めて。地下へ行く前に、書斎を探して。」'},
 studyClue:{name:'書斎の走り書き',text:'「鴉は七度鳴き、灯は一つ、肖像の眼は三つ。順番は“眼・灯・鴉”。」'},
 diary1:{name:'管理人の日記 I',text:'九月三日。鏡の封印を保つ配電盤は、二・四・一・三の順で入れなければならない。順を違えると館の“影”が起きる。'},
 diary2:{name:'美緒のメモ',text:'鏡の女は私じゃない。私の声を真似している。でも、鏡の奥から本当の私の声も聞こえる。名前を忘れないで。'},
 photo:{name:'古い集合写真',text:'裏面に「1998 夏　美緒・由衣」と書かれている。あなたの隣で笑う少女の名は、美緒。'},
 diary3:{name:'管理人の日記 II',text:'三片を銀の輪に戻す。最後の封じ方は「上、右、左、下」。その後、囚われた者の名を呼べ。鏡を割ってはならない。'}
};
function fresh(){return {room:'bedroom',x:320,y:575,dir:'up',inventory:[],notes:[],flags:{intro:false,bedKey:false,studyOpen:false,studySolved:false,bathGhost:false,bathShard:false,basementOpen:false,breakerSolved:false,basementShard:false,chase:false,chaseEscaped:false,photoSeen:false,ring:false,finalOpen:false,finalSolved:false},playSeconds:0,deaths:0,sound:true}}
let state=fresh(), last=performance.now(), running=false, messageTimer=0, autosaveTimer=0, paused=true;
const player={frame:1,t:0,speed:92,dash:false};
const stick={x:0,y:0,active:false,pointerId:null};
const keys={up:false,down:false,left:false,right:false};
const camera={x:0,y:0};
const ghost={active:false,x:0,y:0,dir:'down',frame:1,t:0,alpha:0,pulse:0,speed:74,delay:0,mode:'idle'};
let audio=null;
function initAudio(){if(audio||!state.sound)return;try{const ac=new (window.AudioContext||window.webkitAudioContext)();const master=ac.createGain();master.gain.value=.05;master.connect(ac.destination);const o1=ac.createOscillator(),g1=ac.createGain();o1.type='sine';o1.frequency.value=49;g1.gain.value=.23;o1.connect(g1).connect(master);o1.start();const o2=ac.createOscillator(),g2=ac.createGain();o2.type='triangle';o2.frequency.value=73;g2.gain.value=.08;o2.connect(g2).connect(master);o2.start();audio={ac,master};}catch(e){}}
function sfx(kind){if(!audio||!state.sound)return;const ac=audio.ac,t=ac.currentTime;const o=ac.createOscillator(),g=ac.createGain();o.connect(g).connect(audio.master);if(kind==='ok'){o.type='sine';o.frequency.setValueAtTime(420,t);o.frequency.exponentialRampToValueAtTime(760,t+.18);g.gain.setValueAtTime(.9,t);g.gain.exponentialRampToValueAtTime(.01,t+.25)}else if(kind==='scare'){o.type='sawtooth';o.frequency.setValueAtTime(120,t);o.frequency.exponentialRampToValueAtTime(38,t+.45);g.gain.setValueAtTime(1,t);g.gain.exponentialRampToValueAtTime(.01,t+.5)}else{o.type='square';o.frequency.value=180;g.gain.setValueAtTime(.3,t);g.gain.exponentialRampToValueAtTime(.01,t+.08)}o.start(t);o.stop(t+.55)}
const rooms={
 bedroom:{name:'目覚めの寝室',img:'bedroom',
  walk:[[170,285,432,630],[170,450,435,630]],
  colliders:[[0,0,178,485],[185,230,250,322],[245,190,412,318],[405,190,640,355],[430,360,640,640]],
  spawn:{x:320,y:575},targets:[
   {id:'bed',box:[55,110,178,475],text:'乱れたベッド。枕の下に紙が挟まっている。',act:()=>{if(addNote('letter'))say('差出人のない手紙を見つけた。\n「まだ、鏡の中にいる。」',2600);else say('シーツは冷たい。誰かがさっきまで寝ていたような跡がある。')}},
   {id:'dresser',box:[245,175,412,318],text:'古い鏡台。引き出しが少し開いている。',act:()=>{if(!hasItem('smallKey')){addItem('smallKey');state.flags.bedKey=true;say('引き出しから「小さな鍵」を手に入れた。');save()}else say('引き出しは空だ。鏡には、こちらを見ていない自分が映っている。')}},
   {id:'exit',box:[265,595,375,640],text:'廊下へ出る。',act:()=>goRoom('corridor',320,575,'up')}
  ]},

 corridor:{name:'暗い廊下',img:'corridor',
  walk:[[210,135,430,285],[150,270,495,435],[95,420,545,635]],
  colliders:[],
  spawn:{x:320,y:575},targets:[
   {id:'bedroom',box:[255,595,385,640],text:'寝室へ戻る。',act:()=>goRoom('bedroom',320,550,'up')},
   {id:'studyDoor',box:[120,245,190,370],text:'左手の重い扉。',act:()=>{if(!state.flags.studyOpen){if(hasItem('smallKey')){removeItem('smallKey');state.flags.studyOpen=true;say('小さな鍵が合った。書斎の扉が開いた。');save()}else return say('鍵がかかっている。')}setTimeout(()=>goRoom('study',320,575,'up'),350)}},
   {id:'bathDoor',box:[445,245,520,370],text:'右手の浴室へ。',act:()=>goRoom('bath',320,575,'up')},
   {id:'parlorDoor',box:[105,385,190,510],text:'応接室へ。',act:()=>goRoom('parlor',350,575,'up')},
   {id:'basementDoor',box:[445,385,535,510],text:'地下へ続く扉。',act:()=>{if(!state.flags.basementOpen){if(hasItem('basementKey')){removeItem('basementKey');state.flags.basementOpen=true;say('地下室の鍵を使った。');save()}else return say('大きな鍵穴がある。')}setTimeout(()=>goRoom('basement',320,575,'up'),350)}},
   {id:'mirrorDoor',box:[245,90,395,165],text:'廊下の奥の黒い扉。',act:()=>{if(!(hasItem('shard1')&&hasItem('shard2')&&hasItem('shard3')&&hasItem('silverRing')))return say('扉の中央に、三角形のくぼみと銀色の溝がある。');state.flags.finalOpen=true;goRoom('mirror',320,575,'up')}}
  ]},

 study:{name:'書斎',img:'study',
  walk:[[238,345,470,630],[245,300,455,410]],
  colliders:[[295,300,425,390],[0,390,250,640],[465,390,640,640]],
  spawn:{x:320,y:575},targets:[
   {id:'books',box:[45,90,245,385],text:'左の本棚。背表紙の一冊だけ新しい。',act:()=>{if(addNote('studyClue'))say('本の間から走り書きを見つけた。\n「眼・灯・鴉」');else say('本の並びは不自然だ。数字を示す言葉が気になる。')}},
   {id:'desk',box:[465,390,640,575],text:'右の机。古い日記が開かれている。',act:()=>{if(addNote('diary1'))say('「管理人の日記 I」を記録した。');else say('配電盤についての記述がある。')}},
   {id:'safe',box:[305,100,405,305],text:'肖像画の裏に小さな金庫がある。',act:()=>{if(state.flags.studySolved)return say('金庫は空だ。');openSafe()}},
   {id:'exit',box:[270,595,380,640],text:'廊下へ戻る。',act:()=>goRoom('corridor',245,330,'right')}
  ]},

 bath:{name:'浴室',img:'bath',
  walk:[[180,330,510,630],[205,285,500,500]],
  colliders:[[0,220,180,475],[0,455,205,640],[275,280,430,410],[505,245,640,485],[455,455,550,555]],
  spawn:{x:320,y:575},targets:[
   {id:'mirror',box:[285,35,420,270],text:'曇った大鏡。',act:()=>bathMirror()},
   {id:'sink',box:[500,245,640,450],text:'洗面台。排水口に何か光っている。',act:()=>{if(!state.flags.bathGhost)return say('鏡の方から視線を感じて、手を伸ばせない。');if(!state.flags.bathShard){state.flags.bathShard=true;addItem('shard2');addNote('diary2');say('排水口から「鏡片・弐」を拾った。\n濡れた紙片には、美緒の文字が残っている。',2800);save()}else say('錆びた水が一滴ずつ落ちている。')}},
   {id:'exit',box:[270,595,385,640],text:'廊下へ戻る。',act:()=>goRoom('corridor',440,320,'left')}
  ]},

 parlor:{name:'応接室',img:'parlor',
  walk:[[105,190,575,540],[70,255,585,540],[245,520,395,640]],
  colliders:[[0,45,115,230],[295,145,465,275],[465,150,555,275],[555,95,640,305],[0,285,115,455],[0,425,100,545],[570,345,640,545]],
  spawn:{x:335,y:575},targets:[
   {id:'photo',box:[465,145,555,260],text:'棚の上の古い集合写真。',act:()=>parlorPhoto()},
   {id:'sofa',box:[0,285,115,455],text:'色褪せたソファ。',act:()=>{say('座面が、あなたの隣だけゆっくり沈んだ。');if(!state.flags.photoSeen){peekGhost(470,350)}}},
   {id:'exit',box:[265,535,385,640],text:'廊下へ戻る。',act:()=>goRoom('corridor',205,445,'right')}
  ]},

 basement:{name:'地下室',img:'basement',
  walk:[[75,300,525,630],[190,250,470,630]],
  colliders:[[65,70,280,310],[300,20,485,350],[465,210,640,640],[0,455,205,640]],
  spawn:{x:320,y:575},targets:[
   {id:'breaker',box:[65,75,285,315],text:'古い配電盤。四つのスイッチがある。',act:()=>{if(state.flags.breakerSolved)return say('配電盤は低い唸りを上げている。');openBreaker()}},
   {id:'crate',box:[0,450,210,640],text:'木箱の隙間に銀色のものが見える。',act:()=>{if(!state.flags.breakerSolved)return say('暗すぎて奥まで手を入れられない。');if(!state.flags.basementShard){state.flags.basementShard=true;addItem('shard3');say('「鏡片・参」を手に入れた。\n背後で、裸足が床を擦った。',2000);startChase();save()}else say('箱の中は空だ。')}},
   {id:'exit',box:[265,595,385,640],text:'廊下へ戻る。',act:()=>{if(state.flags.chase){state.flags.chase=false;state.flags.chaseEscaped=true;ghost.active=false;ui.stateLabel.textContent='探索';say('扉を閉めた。\n向こう側から、爪で木を引っ掻く音が続いている。',2400);save()}goRoom('corridor',430,445,'left')}}
  ]},

 mirror:{name:'鏡の間',img:'mirror',
  walk:[[105,380,545,630],[160,315,550,630]],
  colliders:[[265,25,505,430],[0,0,100,640],[555,0,640,640]],
  spawn:{x:320,y:575},targets:[
   {id:'mirror',box:[270,25,505,405],text:'館のすべての鏡が、この一枚へ繋がっている。',act:()=>{if(!state.flags.finalSolved)openFinalPuzzle();else openFinalChoice()}},
   {id:'exit',box:[270,600,380,640],text:'廊下へ戻る。',act:()=>goRoom('corridor',320,190,'down')}
  ]}
};
function currentRoom(){return rooms[state.room]}
function hasItem(k){return state.inventory.includes(k)}
function addItem(k){if(hasItem(k))return false;state.inventory.push(k);renderInventory();sfx('item');return true}
function removeItem(k){state.inventory=state.inventory.filter(x=>x!==k);renderInventory()}
function addNote(k){if(state.notes.includes(k))return false;state.notes.push(k);return true}
function save(){try{localStorage.setItem(SAVE_KEY,JSON.stringify(state));$('#continueBtn').disabled=false}catch(e){}}
function load(){try{const v=localStorage.getItem(SAVE_KEY);return v?JSON.parse(v):null}catch(e){return null}}
function fmtTime(sec){sec=Math.floor(sec);return `${String(Math.floor(sec/60)).padStart(2,'0')}:${String(sec%60).padStart(2,'0')}`}
function say(text,ms=2200){ui.message.textContent=text;ui.message.classList.add('show');messageTimer=ms/1000}
function flicker(){ui.flash.classList.remove('on');void ui.flash.offsetWidth;ui.flash.classList.add('on')}
function scare(){ui.jumpscare.classList.remove('on');void ui.jumpscare.offsetWidth;ui.jumpscare.classList.add('on');sfx('scare')}
function objective(){const f=state.flags;if(!state.notes.includes('letter')||!f.bedKey)return '寝室を調べる';if(!f.studySolved)return '書斎の金庫を開ける';if(!f.bathShard)return '浴室の鏡を調べる';if(!f.breakerSolved)return '地下室の配電盤を復旧する';if(!f.basementShard)return '地下室を調べる';if(f.chase)return '地下室から逃げる';if(!f.chaseEscaped)return '廊下へ戻る';if(!f.ring)return '応接室の写真を調べる';if(!f.finalSolved)return '鏡の間へ向かう';return '鏡に向き合う'}
function updateHUD(){ui.roomName.textContent=currentRoom().name;ui.status.textContent=objective();ui.objectiveMini.textContent=state.flags.chase?'RUN':'EXPLORE'}
function renderInventory(){const slots=$$('.itemSlot');slots.forEach((s,i)=>{const k=state.inventory[i],ic=s.querySelector('.itemIcon'),nm=s.querySelector('.itemName');if(!k){s.classList.add('empty');ic.textContent='＋';nm.textContent='EMPTY'}else{s.classList.remove('empty');ic.textContent=itemDefs[k].icon;nm.textContent=itemDefs[k].name}})}
function showItem(i){const k=state.inventory[i];if(k)say(`${itemDefs[k].name}\n${itemDefs[k].desc}`,2600)}
function goRoom(id,x=null,y=null,dir='up'){state.room=id;const r=rooms[id];state.x=x??r.spawn.x;state.y=y??r.spawn.y;state.dir=dir;ghost.active=false;if(state.flags.chase&&id!=='basement'){state.flags.chase=false;state.flags.chaseEscaped=true}updateHUD();save();flicker();say(r.name,900)}
function pointInWalk(x,y){
  return currentRoom().walk.some(r=>x>=r[0]&&y>=r[1]&&x<=r[2]&&y<=r[3]);
}
function overlap(a,b){
  return a[2]>b[0]&&a[0]<b[2]&&a[3]>b[1]&&a[1]<b[3];
}
function hits(x,y){
  // 判定は主人公全身ではなく足元だけ。見た目上の空間を狭めない。
  const foot=[x-7,y-5,x+7,y+2];
  for(const [px,py] of [[foot[0],foot[1]],[foot[2],foot[1]],[foot[0],foot[3]],[foot[2],foot[3]]]){
    if(!pointInWalk(px,py))return true;
  }
  return currentRoom().colliders.some(c=>overlap(foot,c));
}
function moveCollision(dx,dy){
  // 走行時でも家具をすり抜けないよう細かく分割。
  const dist=Math.hypot(dx,dy);
  const steps=Math.max(1,Math.ceil(dist/1.25));
  const sx=dx/steps,sy=dy/steps;
  for(let i=0;i<steps;i++){
    const nx=state.x+sx;
    if(!hits(nx,state.y))state.x=nx;
    const ny=state.y+sy;
    if(!hits(state.x,ny))state.y=ny;
  }
}
function targetScore(t){
  const [x0,y0,x1,y1]=t.box;
  // 主人公から対象矩形の「一番近い場所」を使う。
  const nx=Math.max(x0,Math.min(state.x,x1));
  const ny=Math.max(y0,Math.min(state.y,y1));
  let vx=nx-state.x,vy=ny-state.y;
  let dist=Math.hypot(vx,vy);

  // 近距離専用。以前のように少し離れた方が反応する状態をなくす。
  const reach=56;
  if(dist>reach)return Infinity;

  // 対象矩形の端にごく僅かに入った場合も、中心方向で向きを判定する。
  if(dist<0.5){
    vx=(x0+x1)/2-state.x;
    vy=(y0+y1)/2-state.y;
    dist=Math.hypot(vx,vy);
    if(dist<0.5)return 0;
  }

  const facing={
    up:[0,-1],down:[0,1],left:[-1,0],right:[1,0]
  }[state.dir];
  const dot=(vx*facing[0]+vy*facing[1])/(dist||1);

  // 正面約±69度以内。横や背後の物は拾わない。
  if(dot<0.35)return Infinity;

  // 距離を最優先し、同距離ならより正面の対象を選ぶ。
  return dist+(1-dot)*24;
}
function nearest(){
  let best=null,bestScore=Infinity;
  for(const t of currentRoom().targets){
    const score=targetScore(t);
    if(score<bestScore){
      best=t;
      bestScore=score;
    }
  }
  return best;
}
function interact(){if(paused)return;const t=nearest();if(!t)return say('特に気になるものはない。',900);t.act?t.act():say(t.text)}
function bathMirror(){if(state.flags.bathGhost)return say('鏡にはもう何も映っていない。\nただ、自分の背後だけが暗い。');state.flags.bathGhost=true;flicker();say('曇りを拭った瞬間、鏡の奥に白い女が立っていた。',2200);ghost.active=true;ghost.mode='peek';ghost.x=320;ghost.y=285;ghost.alpha=.05;setTimeout(()=>{flicker();ghost.alpha=.48;setTimeout(()=>{ghost.active=false;say('鏡の表面に、指で「みお」と書かれている。',2100);save()},1100)},800)}
function peekGhost(x,y){if(ghost.active)return;ghost.active=true;ghost.mode='peek';ghost.x=x;ghost.y=y;ghost.alpha=.38;setTimeout(()=>ghost.active=false,900)}
function parlorPhoto(){if(!state.flags.photoSeen){state.flags.photoSeen=true;addNote('photo');say('集合写真の裏に「美緒・由衣」と書かれている。\n美緒。消えた友人の名前だ。',2600);peekGhost(500,310);save();return}if(state.flags.chaseEscaped&&!state.flags.ring){state.flags.ring=true;addItem('silverRing');addNote('diary3');say('写真立ての裏板が外れ、「銀の輪」と最後の日記が落ちた。',2800);save();return}say('写真の中の美緒だけ、視線が少しずれて見える。')}
function startChase(){state.flags.chase=true;ghost.active=true;ghost.mode='chase';ghost.x=320;ghost.y=245;ghost.alpha=.5;ghost.speed=78;ghost.delay=.85;ui.stateLabel.textContent='追跡';flicker();sfx('scare')}
function caught(){state.deaths++;scare();say('耳元で、美緒ではない声があなたの名前を呼んだ。',1500);paused=true;setTimeout(()=>{paused=false;state.x=320;state.y=560;state.dir='up';ghost.x=320;ghost.y=255;ghost.delay=1.1;ghost.alpha=.35},1250)}
function openPuzzleBase(title,html){paused=true;ui.puzzleTitle.textContent=title;ui.puzzleBody.innerHTML=html;ui.puzzle.classList.remove('hidden')}
function closePuzzle(){ui.puzzle.classList.add('hidden');paused=false}
function openSafe(){let code='';openPuzzleBase('書斎の金庫',`<div class="puzzleDesc">三桁の番号を入力する。書斎に残された言葉が手掛かりになりそうだ。</div><div id="codeDisplay" class="codeDisplay">---</div><div class="numGrid">${[1,2,3,4,5,6,7,8,9].map(n=>`<button data-num="${n}">${n}</button>`).join('')}</div><div class="puzzleActions"><button id="codeClear">消す</button><button id="codeOk">決定</button></div>`);$$('[data-num]').forEach(b=>b.onclick=()=>{if(code.length<3)code+=b.dataset.num;$('#codeDisplay').textContent=(code+'---').slice(0,3)});$('#codeClear').onclick=()=>{code='';$('#codeDisplay').textContent='---'};$('#codeOk').onclick=()=>{if(code==='317'){state.flags.studySolved=true;addItem('basementKey');addItem('shard1');closePuzzle();sfx('ok');say('金庫が開いた。\n「地下室の鍵」と「鏡片・壱」を手に入れた。',2600);save()}else{code='';$('#codeDisplay').textContent='ERR';flicker();setTimeout(()=>$('#codeDisplay').textContent='---',600)}}}
function openBreaker(){let seq=[];openPuzzleBase('地下室の配電盤',`<div class="puzzleDesc">四つのスイッチを正しい順番で入れる。管理人の日記に手順が残されていた。</div><div class="switchGrid">${[1,2,3,4].map(n=>`<button data-sw="${n}">${n}</button>`).join('')}</div><div id="seqText" class="codeDisplay">----</div><div class="puzzleActions"><button id="swReset">リセット</button><button id="swOk">通電</button></div>`);$$('[data-sw]').forEach(b=>b.onclick=()=>{if(seq.length<4){seq.push(+b.dataset.sw);b.classList.add('on');$('#seqText').textContent=seq.join(' ')}});$('#swReset').onclick=()=>{seq=[];$$('[data-sw]').forEach(b=>b.classList.remove('on'));$('#seqText').textContent='----'};$('#swOk').onclick=()=>{if(seq.join(',')==='2,4,1,3'){state.flags.breakerSolved=true;closePuzzle();flicker();sfx('ok');say('配電盤が唸り、地下室の照明が点いた。',1900);save()}else{seq=[];$$('[data-sw]').forEach(b=>b.classList.remove('on'));$('#seqText').textContent='NO';flicker();setTimeout(()=>$('#seqText').textContent='----',650)}}}
function openFinalPuzzle(){let seq=[];const names={up:'上',right:'右',left:'左',down:'下'};openPuzzleBase('三枚の鏡片',`<div class="puzzleDesc">銀の輪に鏡片を戻した。最後に、封印の向きを順番に合わせる。</div><div class="dirGrid"><button data-d="up">▲ 上</button><button data-d="right">▶ 右</button><button data-d="left">◀ 左</button><button data-d="down">▼ 下</button></div><div id="dirText" class="codeDisplay">・・・・</div><div class="puzzleActions"><button id="dirReset">やり直す</button><button id="dirOk">封じる</button></div>`);$$('[data-d]').forEach(b=>b.onclick=()=>{if(seq.length<4){seq.push(b.dataset.d);$('#dirText').textContent=seq.map(x=>names[x]).join(' ')}});$('#dirReset').onclick=()=>{seq=[];$('#dirText').textContent='・・・・'};$('#dirOk').onclick=()=>{if(seq.join(',')==='up,right,left,down'){state.flags.finalSolved=true;closePuzzle();removeItem('shard1');removeItem('shard2');removeItem('shard3');removeItem('silverRing');flicker();sfx('ok');say('鏡面が水のように揺れ、美緒の姿が浮かんだ。\nその背後に、もう一人の女がいる。',2800);setTimeout(openFinalChoice,2900);save()}else{seq=[];$('#dirText').textContent='違う';flicker();setTimeout(()=>$('#dirText').textContent='・・・・',700)}}}
function openFinalChoice(){paused=true;openPuzzleBase('鏡の向こう',`<div class="puzzleDesc">鏡の奥で少女が唇を動かしている。白い女が、その口を塞ごうとしている。</div><div class="menuList"><button class="menuEntry" id="callMio"><b>「美緒」と名前を呼ぶ</b><p>写真と日記に残された名前を呼ぶ。</p></button><button class="menuEntry" id="breakMirror"><b>鏡を割る</b><p>すべてを終わらせるため、鏡を砕く。</p></button><button class="menuEntry" id="leaveMirror"><b>館から逃げる</b><p>扉を閉じ、この館を後にする。</p></button></div>`);$('#callMio').onclick=()=>ending('true');$('#breakMirror').onclick=()=>ending('bad');$('#leaveMirror').onclick=()=>ending('escape')}
function ending(type){ui.puzzle.classList.add('hidden');ghost.active=false;paused=true;let kind,title,text;if(type==='true'){kind='TRUE END';title='名前を返す';text='「美緒！」\n\nその名を呼んだ瞬間、鏡の中の少女がこちらを見た。白い女の指がほどけ、黒い髪が水の底へ沈むように消えていく。\n\n美緒は八年前の姿のまま笑った。\n「覚えていてくれたんだね」\n\n翌朝、館の鏡はすべて曇っていた。ただ一枚、割れた鏡の裏に小さく二人の名前が残っていた。';}else if(type==='bad'){kind='BAD END';title='割れたもの';text='鏡を叩き割った。\n\n悲鳴は一瞬だった。館中の鏡が同時に砕け、白い影は消えた。\n\n外へ出たあなたは、スマートフォンの黒い画面に自分を見つける。\n\n――あなたの背後で、美緒の顔をした何かが笑っていた。';}else{kind='ESCAPE END';title='閉じた扉';text='あなたは鏡の間から逃げた。\n\n館を出るまで、背後の足音は一度も止まらなかった。\n\n数日後、差出人のない手紙が再び届く。\n「どうして、名前を呼んでくれなかったの？」';}ui.ending.classList.remove('hidden');$('#endingKind').textContent=kind;$('#endingTitle').textContent=title;$('#endingText').textContent=text;$('#endingStats').textContent=`PLAY ${fmtTime(state.playSeconds)} / GAME OVER ${state.deaths} / NOTES ${state.notes.length}/${Object.keys(noteDefs).length}`;try{localStorage.removeItem(SAVE_KEY)}catch(e){} }
function openMenu(tab='items'){paused=true;ui.menu.classList.remove('hidden');renderMenu(tab)}
function closeMenu(){ui.menu.classList.add('hidden');paused=false}
function renderMenu(tab){$$('.menuTabs button').forEach(b=>b.classList.toggle('active',b.dataset.tab===tab));if(tab==='items'){ui.menuBody.innerHTML=`<div class="menuList">${state.inventory.length?state.inventory.map(k=>`<div class="menuEntry"><b>${itemDefs[k].icon} ${itemDefs[k].name}</b><p>${itemDefs[k].desc}</p></div>`).join(''):'<div class="hintBox">持ち物はない。</div>'}</div>`}else if(tab==='notes'){ui.menuBody.innerHTML=`<div class="menuList">${state.notes.length?state.notes.map(k=>`<div class="menuEntry"><b>${noteDefs[k].name}</b><p>${noteDefs[k].text}</p></div>`).join(''):'<div class="hintBox">まだメモを見つけていない。</div>'}</div>`}else if(tab==='hint'){ui.menuBody.innerHTML=`<div class="hintBox"><b>現在の目的</b><br><br>${hintText()}</div>`}else{ui.menuBody.innerHTML=`<div class="saveRow"><div class="saveInfo">場所：${currentRoom().name}<br>プレイ時間：${fmtTime(state.playSeconds)}<br>ゲームオーバー：${state.deaths}回<br><br>部屋を移動した時と重要アイテム取得時には自動保存されます。</div><button id="manualSave" class="modalBtn primary">現在の進行を保存</button><button id="backTitle" class="modalBtn">タイトルへ戻る</button></div>`;$('#manualSave').onclick=()=>{save();say('セーブしました。',900);closeMenu()};$('#backTitle').onclick=()=>{save();location.reload()}}}
function hintText(){const f=state.flags;if(!state.notes.includes('letter'))return '寝室のベッドを調べて、届いた手紙を確認しよう。';if(!f.bedKey)return '寝室の鏡台。少し開いた引き出しがある。';if(!f.studyOpen)return '廊下左手の書斎。寝室で見つけた小さな鍵を使える。';if(!f.studySolved)return '書斎の本棚と机を調べよう。「眼・灯・鴉」の順が金庫の番号になる。';if(!f.bathShard)return '浴室の大鏡を調べた後、洗面台の排水口を確認しよう。';if(!f.breakerSolved)return '地下室の配電盤。管理人の日記 I に「二・四・一・三」とある。';if(!f.basementShard)return '地下室の照明が点いた。右側の木箱を調べよう。';if(f.chase)return '迷わず出口へ。走るボタンを押しながら廊下へ戻ろう。';if(!f.chaseEscaped)return '地下室の出口へ戻ろう。';if(!f.ring)return '応接室の集合写真をもう一度調べる。写真立ての裏に何かある。';if(!f.finalSolved)return '三枚の鏡片と銀の輪を持って廊下奥へ。管理人の日記 II の「上・右・左・下」が最後の手順。';return '美緒の名前を覚えているなら、鏡に向かって呼んでみよう。'}
function startGame(saved=null){state=saved||fresh();ui.title.classList.add('hidden');ui.app.classList.remove('hidden');renderInventory();updateHUD();initAudio();paused=false;running=true;if(!saved&&!state.flags.intro){paused=true;$('#introOverlay').classList.remove('hidden')}else say(currentRoom().name,800)}
function updateCamera(){camera.x=0;camera.y=0}
function updatePlayer(dt){let dx=stick.active?stick.x:(keys.right?1:0)-(keys.left?1:0),dy=stick.active?stick.y:(keys.down?1:0)-(keys.up?1:0);if(!(Math.abs(dx)>.05||Math.abs(dy)>.05)){player.frame=1;return}const len=Math.hypot(dx,dy);dx/=len;dy/=len;if(Math.abs(dx)>Math.abs(dy))state.dir=dx<0?'left':'right';else state.dir=dy<0?'up':'down';const mag=stick.active?Math.min(1,len):1,sp=player.speed*(player.dash?1.55:1)*Math.max(.42,mag);moveCollision(dx*sp*dt,dy*sp*dt);player.t+=dt*(player.dash?7:5.3);player.frame=Math.floor(player.t)%3}
function updateGhost(dt){if(!ghost.active)return;ghost.pulse+=dt;ghost.t+=dt*(ghost.mode==='chase'?4.8:2.2);ghost.frame=Math.floor(ghost.t)%3;if(ghost.mode==='peek'){ghost.alpha=Math.min(.5,ghost.alpha+dt*.5);return}if(ghost.mode==='chase'){if(ghost.delay>0){ghost.delay-=dt;return}const dx=state.x-ghost.x,dy=state.y-ghost.y,len=Math.hypot(dx,dy)||1;if(Math.abs(dx)>Math.abs(dy))ghost.dir=dx<0?'left':'right';else ghost.dir=dy<0?'up':'down';ghost.x+=dx/len*ghost.speed*dt+Math.sin(ghost.pulse*6)*2*dt;ghost.y+=dy/len*ghost.speed*dt;ghost.alpha=.42+.08*Math.sin(ghost.pulse*7);if(Math.hypot(dx,dy)<30)caught()}}
function drawSprite(img,x,y,h,alpha=1,ghostFx=false){if(!img.complete||!img.naturalWidth)return;const w=img.naturalWidth*h/img.naturalHeight;ctx.save();ctx.globalAlpha=alpha;if(ghostFx){ctx.shadowColor='rgba(160,175,190,.12)';ctx.shadowBlur=4}ctx.drawImage(img,Math.round(x-camera.x-w/2),Math.round(y-camera.y-h),Math.round(w),h);ctx.restore()}
function drawExitMarkers(){for(const t of currentRoom().targets.filter(t=>/Door|exit|bedroom/.test(t.id))){const [x0,y0,x1,y1]=t.box;const cx=(x0+x1)/2-camera.x,cy=(y0+y1)/2-camera.y;if(cx>-20&&cx<W+20&&cy>-20&&cy<H+20){ctx.save();ctx.globalAlpha=.26;ctx.fillStyle='#d6c49a';ctx.beginPath();ctx.arc(cx,cy,3,0,Math.PI*2);ctx.fill();ctx.restore()}}}
function draw(){ctx.clearRect(0,0,W,H);const bg=images.rooms[currentRoom().img];if(bg.complete)ctx.drawImage(bg,0,0,WORLD,WORLD);drawExitMarkers();ctx.fillStyle='rgba(0,0,0,.3)';ctx.beginPath();ctx.ellipse(state.x,state.y+3,18,7,0,0,Math.PI*2);ctx.fill();drawSprite(images.hero[state.dir][player.frame],state.x,state.y,150,1,false);if(ghost.active){drawSprite(images.ghost[ghost.dir][ghost.frame],ghost.x+Math.sin(ghost.pulse*13)*1.2,ghost.y,ghost.mode==='chase'?190:174,ghost.alpha,true)}}
function updateNear(){const t=nearest();ui.near.textContent=t?'調べる：'+(t.id.includes('exit')||t.id.includes('Door')?'扉':t.text.split('。')[0]):'';ui.near.classList.toggle('show',!!t)}
function loop(now){const dt=Math.min(.033,(now-last)/1000||.016);last=now;if(running&&!paused){state.playSeconds+=dt;updatePlayer(dt);updateGhost(dt);updateCamera(dt);updateNear();autosaveTimer+=dt;if(autosaveTimer>45){autosaveTimer=0;save()}if(messageTimer>0){messageTimer-=dt;if(messageTimer<=0)ui.message.classList.remove('show')}}draw();requestAnimationFrame(loop)}
// Joystick
const stickArea=$('#stickArea'),knob=$('#stickKnob');function setStick(e){const r=stickArea.getBoundingClientRect(),cx=r.left+r.width/2,cy=r.top+r.height/2,dx=e.clientX-cx,dy=e.clientY-cy,max=r.width*.31,len=Math.hypot(dx,dy),cl=Math.min(max,len),nx=len?dx/len:0,ny=len?dy/len:0;knob.style.transform=`translate(${nx*cl}px,${ny*cl}px)`;stick.x=nx*Math.min(1,len/max);stick.y=ny*Math.min(1,len/max);stick.active=true;stickArea.classList.add('active')}
function resetStick(){stick.x=stick.y=0;stick.active=false;knob.style.transform='translate(0,0)';stickArea.classList.remove('active')}
stickArea.addEventListener('pointerdown',e=>{e.preventDefault();stick.pointerId=e.pointerId;try{stickArea.setPointerCapture(e.pointerId)}catch(_){}setStick(e)});stickArea.addEventListener('pointermove',e=>{if(stick.active&&e.pointerId===stick.pointerId)setStick(e)});['pointerup','pointercancel','lostpointercapture'].forEach(ev=>stickArea.addEventListener(ev,resetStick));
// Touch fallback for WKWebView
stickArea.addEventListener('touchstart',e=>{e.preventDefault();const t=e.touches[0];setStick({clientX:t.clientX,clientY:t.clientY})},{passive:false});stickArea.addEventListener('touchmove',e=>{e.preventDefault();const t=e.touches[0];setStick({clientX:t.clientX,clientY:t.clientY})},{passive:false});stickArea.addEventListener('touchend',e=>{e.preventDefault();resetStick()},{passive:false});
const dash=$('#dash');function dashOn(e){e.preventDefault();player.dash=true;dash.classList.add('on')}function dashOff(e){e.preventDefault();player.dash=false;dash.classList.remove('on')}dash.addEventListener('pointerdown',dashOn);['pointerup','pointercancel','lostpointercapture'].forEach(ev=>dash.addEventListener(ev,dashOff));dash.addEventListener('touchstart',dashOn,{passive:false});dash.addEventListener('touchend',dashOff,{passive:false});
$('#interact').onclick=interact;$('#menuBtn').onclick=()=>openMenu();$('#menuClose').onclick=closeMenu;$$('.menuTabs button').forEach(b=>b.onclick=()=>renderMenu(b.dataset.tab));$('#puzzleClose').onclick=closePuzzle;$$('.itemSlot').forEach((s,i)=>s.onclick=()=>showItem(i));
$('#newGameBtn').onclick=()=>startGame();const saved=load();$('#continueBtn').disabled=!saved;$('#continueBtn').onclick=()=>startGame(load());$('#introClose').onclick=()=>{state.flags.intro=true;$('#introOverlay').classList.add('hidden');paused=false;initAudio();say('まず、この寝室を調べよう。',1500);save()};$('#endingTitleBtn').onclick=()=>location.reload();
window.addEventListener('keydown',e=>{const m={ArrowUp:'up',KeyW:'up',ArrowDown:'down',KeyS:'down',ArrowLeft:'left',KeyA:'left',ArrowRight:'right',KeyD:'right'};if(m[e.code]){e.preventDefault();keys[m[e.code]]=true}if(e.code==='Space'||e.code==='Enter'){e.preventDefault();interact()}if(e.code==='ShiftLeft'||e.code==='ShiftRight')player.dash=true;if(e.code==='Escape'){if(!ui.menu.classList.contains('hidden'))closeMenu();else if(!ui.puzzle.classList.contains('hidden'))closePuzzle();else openMenu()}});window.addEventListener('keyup',e=>{const m={ArrowUp:'up',KeyW:'up',ArrowDown:'down',KeyS:'down',ArrowLeft:'left',KeyA:'left',ArrowRight:'right',KeyD:'right'};if(m[e.code])keys[m[e.code]]=false;if(e.code==='ShiftLeft'||e.code==='ShiftRight')player.dash=false});
// Small test hook used by the local automated QA script. It is inert during normal play.
window.__YUKYO_TEST={getState:()=>JSON.parse(JSON.stringify(state)),teleport:(room,x,y,dir='up')=>{state.room=room;state.x=x;state.y=y;state.dir=dir;updateHUD()},interact:()=>interact(),setPaused:v=>paused=v,addItem,addNote,setFlag:(k,v=true)=>state.flags[k]=v,openSafe,openBreaker,openFinalPuzzle,hintText};
Promise.all(Object.values(images.rooms).concat(...dirs.map(d=>images.hero[d]),...dirs.map(d=>images.ghost[d])).map(im=>new Promise(r=>{if(im.complete)r();else{im.onload=r;im.onerror=r}}))).then(()=>requestAnimationFrame(loop));
})();