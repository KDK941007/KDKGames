(() => {
  'use strict';
  const $=id=>document.getElementById(id);
  const setupPanel=$('setupPanel'),gamePanel=$('gamePanel'),playerTypesEl=$('playerTypes'),boardSizeInput=$('boardSizeInput'),timerMode=$('timerMode'),timerValueField=$('timerValueField'),timerValueLabel=$('timerValueLabel'),timerSeconds=$('timerSeconds'),setupError=$('setupError'),startBtn=$('startBtn'),restartBtn=$('restartBtn'),rulesBtn=$('rulesBtn'),rulesOverlay=$('rulesOverlay'),closeRules=$('closeRules'),resultOverlay=$('resultOverlay'),resultMark=$('resultMark'),resultTitle=$('resultTitle'),resultReason=$('resultReason'),closeResult=$('closeResult'),restartOverlay=$('restartOverlay'),cancelRestart=$('cancelRestart'),confirmRestart=$('confirmRestart'),boardWrap=$('boardWrap'),boardEl=$('board'),turnText=$('turnText'),passText=$('passText'),blackCount=$('blackCount'),whiteCount=$('whiteCount'),clockBox=$('clockBox'),clockText=$('clockText'),totalClocks=$('totalClocks'),blackClock=$('blackClock'),whiteClock=$('whiteClock');
  const DIRS=[[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];
  const store=globalThis.MiniGamePortalPlayerStore;
  const playerTypes=globalThis.MiniGamePlayerTypes.create(playerTypesEl,{count:2,items:[{symbol:'',symbolClass:'disc black'},{symbol:'',symbolClass:'disc white'}],guestName:()=> '一時プレイ'});
  const zoom=globalThis.MiniGamePinchZoom?.attach(boardWrap,boardEl,{min:1,max:2.5})||{reset(){}};
  const reducedMotion=matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
  let size,board,current,mode,limit,total,lastMove,gameOver,raf,turnStarted,recorded=false,passMessage='',animating=false,animationTimer=0;
  const other=p=>p==='B'?'W':'B'; const label=p=>p==='B'?'● 黒':'○ 白';
  function fmt(sec){if(!Number.isFinite(sec))return'∞';sec=Math.max(0,sec);return sec>=10?String(Math.ceil(sec)):sec.toFixed(1)}
  function syncTimerSetup(){const active=timerMode.value!=='none';timerValueField.classList.toggle('hidden',!active);timerValueLabel.textContent=timerMode.value==='total'?'各プレイヤーの持ち時間':'1ターンの持ち時間';if(!active)setupError.textContent=''}
  function validate(){const n=Number(boardSizeInput.value);if(!Number.isInteger(n)||n<4||n>16||n%2!==0){setupError.textContent='盤面サイズは4〜16の偶数で入力してください。';return null}let s=null;if(timerMode.value!=='none'){s=Number(timerSeconds.value);if(!Number.isFinite(s)||s<1){setupError.textContent='制限時間は1秒以上で入力してください。';return null}}setupError.textContent='';return{n,s}}
  function start(){const v=validate();if(!v)return;stopClock();clearAnimation();zoom.reset();size=v.n;mode=timerMode.value;limit=v.s;board=Array(size*size).fill(null);const a=size/2-1,b=size/2;board[a*size+a]='W';board[a*size+b]='B';board[b*size+a]='B';board[b*size+b]='W';current='B';total={B:limit,W:limit};lastMove=-1;gameOver=false;recorded=false;passMessage='';animating=false;setupPanel.classList.add('hidden');gamePanel.classList.remove('hidden');restartBtn.classList.remove('hidden');resultOverlay.classList.remove('show');restartOverlay.classList.remove('show');boardEl.style.gridTemplateColumns=`repeat(${size},1fr)`;render();beginTurn()}
  function returnToSetup(){stopClock();clearAnimation();zoom.reset();setupPanel.classList.remove('hidden');gamePanel.classList.add('hidden');restartBtn.classList.add('hidden');resultOverlay.classList.remove('show');restartOverlay.classList.remove('show');setupError.textContent=''}
  function clearAnimation(){if(animationTimer){clearTimeout(animationTimer);animationTimer=0}animating=false}
  function inside(r,c){return r>=0&&r<size&&c>=0&&c<size}
  function flipsFor(index,p){if(board[index])return[];const r=Math.floor(index/size),c=index%size,opp=other(p),all=[];for(const[dr,dc]of DIRS){let rr=r+dr,cc=c+dc,line=[];while(inside(rr,cc)&&board[rr*size+cc]===opp){line.push(rr*size+cc);rr+=dr;cc+=dc}if(line.length&&inside(rr,cc)&&board[rr*size+cc]===p)all.push(...line)}return all}
  function legalMoves(p){const out=[];for(let i=0;i<board.length;i++)if(flipsFor(i,p).length)out.push(i);return out}
  function counts(){return{B:board.filter(x=>x==='B').length,W:board.filter(x=>x==='W').length}}
  function render(animation=null){const legal=new Set(gameOver||animating?[]:legalMoves(current));const flipOrder=new Map((animation?.flips||[]).map((idx,i)=>[idx,i]));boardEl.innerHTML='';for(let i=0;i<board.length;i++){const cell=document.createElement('button');cell.type='button';cell.className='cell';if(legal.has(i))cell.classList.add('legal');if(i===lastMove)cell.classList.add('last');cell.disabled=!legal.has(i)||gameOver||animating;cell.setAttribute('aria-label',`${Math.floor(i/size)+1}行${i%size+1}列`);if(board[i]){const d=document.createElement('span');d.className=`disc ${board[i]==='B'?'black':'white'}`;if(animation?.placed===i)d.classList.add('placed');if(flipOrder.has(i)){const from=animation.from==='B'?'#111':'#f4f4f4',to=animation.to==='B'?'#111':'#f4f4f4';d.classList.add('flipping');d.style.setProperty('--flip-from',from);d.style.setProperty('--flip-to',to);d.style.animationDelay=`${flipOrder.get(i)*(reducedMotion?0:90)}ms`}cell.appendChild(d)}cell.addEventListener('click',()=>play(i));boardEl.appendChild(cell)}const c=counts();blackCount.textContent=String(c.B);whiteCount.textContent=String(c.W);turnText.textContent=label(current);passText.textContent=passMessage;renderClock()}
  function beginTurn(){stopClock();turnStarted=performance.now();renderClock();if(mode!=='none')raf=requestAnimationFrame(tick)}
  function stopClock(){if(raf){cancelAnimationFrame(raf);raf=0}}
  function elapsed(){return(performance.now()-turnStarted)/1000}
  function currentRemain(){if(mode==='none')return Infinity;if(mode==='turn')return limit-elapsed();return total[current]-elapsed()}
  function consume(){if(mode==='total')total[current]=Math.max(0,total[current]-elapsed())}
  function renderClock(v=currentRemain()){clockBox.classList.toggle('warning',Number.isFinite(v)&&v<=Math.min(5,(limit||5)*.25));clockText.textContent=fmt(v);totalClocks.classList.toggle('hidden',mode!=='total');if(mode==='total'){const now=currentRemain();blackClock.textContent=fmt(current==='B'?now:total.B);whiteClock.textContent=fmt(current==='W'?now:total.W)}}
  function tick(){if(gameOver||animating)return;const r=currentRemain();renderClock(r);if(r<=0){timeout();return}raf=requestAnimationFrame(tick)}
  function play(i){if(gameOver||animating)return;const flips=flipsFor(i,current);if(!flips.length)return;if(mode!=='none'&&currentRemain()<=0){timeout();return}consume();stopClock();const playedBy=current,from=other(playedBy);board[i]=playedBy;flips.forEach(x=>board[x]=playedBy);lastMove=i;animating=true;passMessage='';render({placed:i,flips,from,to:playedBy});const wait=reducedMotion?0:Math.max(240,420+(flips.length-1)*90);animationTimer=setTimeout(()=>{animationTimer=0;animating=false;advance(playedBy)},wait)}
  function advance(previous){const next=other(previous);passMessage='';if(legalMoves(next).length){current=next;render();beginTurn();return}if(legalMoves(previous).length){current=previous;passMessage=`${label(next)}は置ける場所がないためパス`;render();beginTurn();return}finishByCount()}
  function timeout(){if(gameOver||animating)return;stopClock();gameOver=true;const loser=current,winner=other(loser);if(mode==='total')total[loser]=0;render();finish(winner,`${label(loser)}が時間切れ`)}
  function finishByCount(){stopClock();gameOver=true;const c=counts();render();if(c.B>c.W)finish('B',`黒 ${c.B} - 白 ${c.W}`);else if(c.W>c.B)finish('W',`黒 ${c.B} - 白 ${c.W}`);else finish(null,`黒 ${c.B} - 白 ${c.W}`)}
  function record(){if(recorded)return;recorded=true;if(!store||playerTypes.userIndex()<0)return;store.recordPlay('othello','オセロ')}
  function finish(winner,reason){record();resultMark.className='result-disc';resultMark.textContent='';if(winner){resultMark.classList.add(winner==='B'?'black':'white');resultMark.setAttribute('aria-label',winner==='B'?'黒':'白');resultTitle.textContent=`${winner==='B'?'黒':'白'}の勝ち！`}else{resultMark.classList.add('draw');resultMark.textContent='―';resultMark.setAttribute('aria-label','引き分け');resultTitle.textContent='引き分け'}resultReason.textContent=reason;setTimeout(()=>resultOverlay.classList.add('show'),180)}
  timerMode.addEventListener('change',syncTimerSetup);
  startBtn.addEventListener('click',start);
  restartBtn.addEventListener('click',()=>restartOverlay.classList.add('show'));
  cancelRestart.addEventListener('click',()=>restartOverlay.classList.remove('show'));
  confirmRestart.addEventListener('click',returnToSetup);
  restartOverlay.addEventListener('click',e=>{if(e.target===restartOverlay)restartOverlay.classList.remove('show')});
  rulesBtn.addEventListener('click',()=>rulesOverlay.classList.add('show'));
  closeRules.addEventListener('click',()=>rulesOverlay.classList.remove('show'));
  closeResult.addEventListener('click',()=>resultOverlay.classList.remove('show'));
  rulesOverlay.addEventListener('click',e=>{if(e.target===rulesOverlay)rulesOverlay.classList.remove('show')});
  window.addEventListener('pagehide',()=>{stopClock();clearAnimation()});
  syncTimerSetup();
})();
