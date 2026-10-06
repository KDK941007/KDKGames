(() => {
  'use strict';
  const SIZE=15;
  const $=id=>document.getElementById(id);
  const setupPanel=$('setupPanel'),gamePanel=$('gamePanel'),playerTypesEl=$('playerTypes'),targetInput=$('targetInput'),timerMode=$('timerMode'),timerValueField=$('timerValueField'),timerValueLabel=$('timerValueLabel'),timerSeconds=$('timerSeconds'),setupError=$('setupError'),startBtn=$('startBtn'),restartBtn=$('restartBtn'),rulesBtn=$('rulesBtn'),rulesOverlay=$('rulesOverlay'),closeRules=$('closeRules'),resultOverlay=$('resultOverlay'),resultMark=$('resultMark'),resultTitle=$('resultTitle'),resultReason=$('resultReason'),closeResult=$('closeResult'),restartOverlay=$('restartOverlay'),cancelRestart=$('cancelRestart'),confirmRestart=$('confirmRestart'),boardWrap=$('boardWrap'),boardEl=$('board'),confirmMoveBtn=$('confirmMoveBtn'),turnDisc=$('turnDisc'),turnText=$('turnText'),clockBox=$('clockBox'),clockText=$('clockText'),totalClocks=$('totalClocks'),blackClock=$('blackClock'),whiteClock=$('whiteClock');
  let board,current,target,mode,limit,total,lastMove,pendingMove,gameOver,raf,turnStarted,recorded=false,cpuTimer=0;
  const store=globalThis.MiniGamePortalPlayerStore;
  const playerTypes=globalThis.MiniGamePlayerTypes.create(playerTypesEl,{count:2,items:[{symbol:'',symbolClass:'piece black'},{symbol:'',symbolClass:'piece white'}],guestName:i=>`PLAYER ${i+1}`});
  const zoom=globalThis.MiniGamePinchZoom?.attach(boardWrap,boardEl,{min:1,max:2.5})||{reset(){}};

  function fmt(sec){ if(!Number.isFinite(sec))return '∞'; sec=Math.max(0,sec); return sec>=10?String(Math.ceil(sec)):sec.toFixed(1); }
  function other(p){return p==='B'?'W':'B'}
  function label(p){return p==='B'?'黒':'白'}
  function syncTimerSetup(){ const active=timerMode.value!=='none'; timerValueField.classList.toggle('hidden',!active); timerValueLabel.textContent=timerMode.value==='total'?'各プレイヤーの持ち時間':'1ターンの持ち時間'; if(!active)setupError.textContent=''; }
  function validate(){ const t=Number(targetInput.value); if(!Number.isInteger(t)||t<3||t>SIZE){setupError.textContent=`何目並べは3〜${SIZE}で入力してください。`;return null} let seconds=null; if(timerMode.value!=='none'){seconds=Number(timerSeconds.value);if(!Number.isFinite(seconds)||seconds<1){setupError.textContent='制限時間は1秒以上で入力してください。';return null}} setupError.textContent='';return {t,seconds}; }
  function buildBoard(){ boardEl.innerHTML=''; for(let i=0;i<SIZE*SIZE;i++){const b=document.createElement('button');b.type='button';b.className='cell';b.dataset.index=String(i);b.setAttribute('aria-label',`${Math.floor(i/SIZE)+1}行${i%SIZE+1}列`);b.addEventListener('click',()=>selectMove(i));boardEl.appendChild(b)} }
  function start(){ const v=validate();if(!v)return; stopClock(); zoom.reset(); target=v.t;mode=timerMode.value;limit=v.seconds;board=Array(SIZE*SIZE).fill(null);current='B';lastMove=-1;pendingMove=-1;gameOver=false;recorded=false;total={B:limit,W:limit};setupPanel.classList.add('hidden');gamePanel.classList.remove('hidden');restartBtn.classList.remove('hidden');resultOverlay.classList.remove('show');restartOverlay.classList.remove('show');buildBoard();render();beginTurn(); }
  function returnToSetup(){stopClock();if(cpuTimer){clearTimeout(cpuTimer);cpuTimer=0}zoom.reset();pendingMove=-1;setupPanel.classList.remove('hidden');gamePanel.classList.add('hidden');restartBtn.classList.add('hidden');resultOverlay.classList.remove('show');restartOverlay.classList.remove('show');setupError.textContent='';}
  function beginTurn(){turnStarted=performance.now();stopClock();renderClock();if(mode!=='none')raf=requestAnimationFrame(tick);scheduleCpuTurn()}
  function isCpuTurn(){return playerTypes.getType(current==='B'?0:1)==='cpu'}
  function scoreCpuMove(index,p){
    const r=Math.floor(index/SIZE),c=index%SIZE,opp=other(p),dirs=[[1,0],[0,1],[1,1],[1,-1]];
    let score=0;
    for(const[dr,dc]of dirs){
      for(const who of[p,opp]){
        let count=1,open=0;
        for(const sign of[-1,1]){
          let rr=r+dr*sign,cc=c+dc*sign;
          while(rr>=0&&rr<SIZE&&cc>=0&&cc<SIZE&&board[rr*SIZE+cc]===who){count++;rr+=dr*sign;cc+=dc*sign}
          if(rr>=0&&rr<SIZE&&cc>=0&&cc<SIZE&&!board[rr*SIZE+cc])open++;
        }
        const win=count>=target;
        const value=win?1000000:Math.pow(10,Math.min(count,5))*Math.max(1,open);
        score+=who===p?value:value*.92;
      }
    }
    const center=(SIZE-1)/2;
    score+=SIZE-(Math.abs(r-center)+Math.abs(c-center))*.25;
    return score;
  }
  function cpuDifficulty(){return playerTypes.getCpuDifficulty(current==='B'?0:1)}
  function chooseCpuMove(){
    const empty=[];for(let i=0;i<board.length;i++)if(!board[i])empty.push(i);
    if(!empty.length)return-1;
    if(empty.length===board.length)return cpuDifficulty()==='weak'?empty[Math.floor(Math.random()*empty.length)]:Math.floor(SIZE/2)*SIZE+Math.floor(SIZE/2);
    const level=cpuDifficulty();
    if(level==='weak')return empty[Math.floor(Math.random()*empty.length)];
    const ranked=empty.map(i=>({i,score:scoreCpuMove(i,current)})).sort((a,b)=>b.score-a.score);
    if(level==='normal'){const pool=ranked.slice(0,Math.min(8,ranked.length));return pool[Math.floor(Math.random()*pool.length)].i}
    if(level==='strong')return ranked[0].i;
    let best=-Infinity,bestMoves=[];
    for(const move of ranked.slice(0,Math.min(14,ranked.length))){
      board[move.i]=current;
      const replies=[];for(let j=0;j<board.length;j++)if(!board[j])replies.push(scoreCpuMove(j,other(current)));
      board[move.i]=null;
      const score=move.score-(replies.length?Math.max(...replies)*.97:0);
      if(score>best){best=score;bestMoves=[move.i]}else if(score===best)bestMoves.push(move.i);
    }
    return bestMoves[Math.floor(Math.random()*bestMoves.length)];
  }
  function scheduleCpuTurn(){
    if(cpuTimer){clearTimeout(cpuTimer);cpuTimer=0}
    if(gameOver||!isCpuTurn())return;
    cpuTimer=setTimeout(()=>{cpuTimer=0;if(gameOver||!isCpuTurn())return;const i=chooseCpuMove();if(i<0)return;pendingMove=i;render();cpuTimer=setTimeout(()=>{cpuTimer=0;confirmMove()},350)},450);
  }
  function stopClock(){if(raf){cancelAnimationFrame(raf);raf=0}}
  function elapsed(){return (performance.now()-turnStarted)/1000}
  function currentRemain(){ if(mode==='none')return Infinity; if(mode==='turn')return limit-elapsed(); return total[current]-elapsed(); }
  function consume(){if(mode==='total')total[current]=Math.max(0,total[current]-elapsed())}
  function tick(){if(gameOver)return;const r=currentRemain();renderClock(r);if(r<=0){timeout();return}raf=requestAnimationFrame(tick)}
  function renderClock(value=currentRemain()){ clockBox.classList.toggle('warning',Number.isFinite(value)&&value<=Math.min(5,(limit||5)*.25));clockText.textContent=fmt(value); totalClocks.classList.toggle('hidden',mode!=='total');if(mode==='total'){const now=currentRemain();blackClock.textContent=fmt(current==='B'?now:total.B);whiteClock.textContent=fmt(current==='W'?now:total.W)} }
  function render(){turnText.textContent=`${playerTypes.getDisplayName(current==='B'?0:1)}（${label(current)}）`;turnDisc.className=`turn-disc ${current==='B'?'black':'white'}`; [...boardEl.children].forEach((el,i)=>{el.className='cell';if(board[i]==='B')el.classList.add('black');if(board[i]==='W')el.classList.add('white');if(i===pendingMove)el.classList.add(current==='B'?'pending-black':'pending-white');if(i===lastMove)el.classList.add('last');el.disabled=gameOver||!!board[i]});confirmMoveBtn.disabled=gameOver||pendingMove<0;renderClock();}
  function selectMove(i){if(gameOver||isCpuTurn()||board[i])return;if(mode!=='none'&&currentRemain()<=0){timeout();return}pendingMove=i;render()} function confirmMove(){if(gameOver||pendingMove<0)return;if(mode!=='none'&&currentRemain()<=0){timeout();return}const i=pendingMove;pendingMove=-1;consume();stopClock();const p=current;board[i]=p;lastMove=i;const line=findWin(i,p);if(line){gameOver=true;render();line.forEach(x=>boardEl.children[x]?.classList.add('win'));finish(p,`${target}目以上並びました`);return}if(board.every(Boolean)){gameOver=true;render();finish(null,'盤面がすべて埋まりました');return}current=other(current);render();beginTurn();}
  function findWin(index,p){const r=Math.floor(index/SIZE),c=index%SIZE,dirs=[[1,0],[0,1],[1,1],[1,-1]];for(const[dR,dC]of dirs){const line=[index];for(const s of[-1,1]){let rr=r+dR*s,cc=c+dC*s;while(rr>=0&&rr<SIZE&&cc>=0&&cc<SIZE&&board[rr*SIZE+cc]===p){line.push(rr*SIZE+cc);rr+=dR*s;cc+=dC*s}}if(line.length>=target)return line}return null}
  function timeout(){if(gameOver)return;stopClock();pendingMove=-1;gameOver=true;const loser=current,winner=other(loser);if(mode==='total')total[loser]=0;render();finish(winner,`${label(loser)}が時間切れ`)}
  function record(){if(recorded)return;recorded=true;if(!store||playerTypes.userIndex()<0)return;store.recordPlay('gomoku','五目並べ');}
  function finish(winner,reason){record();resultMark.className='result-disc';resultMark.textContent='';if(winner){resultMark.classList.add(winner==='B'?'black':'white');resultMark.setAttribute('aria-label',winner==='B'?'黒':'白');resultTitle.textContent=`${winner==='B'?'黒':'白'}の勝ち！`}else{resultMark.classList.add('draw');resultMark.textContent='―';resultMark.setAttribute('aria-label','引き分け');resultTitle.textContent='引き分け'}resultReason.textContent=reason;setTimeout(()=>resultOverlay.classList.add('show'),180)}
  timerMode.addEventListener('change',syncTimerSetup);
  startBtn.addEventListener('click',start);
  confirmMoveBtn.addEventListener('click',confirmMove);
  restartBtn.addEventListener('click',()=>restartOverlay.classList.add('show'));
  cancelRestart.addEventListener('click',()=>restartOverlay.classList.remove('show'));
  confirmRestart.addEventListener('click',returnToSetup);
  restartOverlay.addEventListener('click',e=>{if(e.target===restartOverlay)restartOverlay.classList.remove('show')});
  rulesBtn.addEventListener('click',()=>rulesOverlay.classList.add('show'));
  closeRules.addEventListener('click',()=>rulesOverlay.classList.remove('show'));
  closeResult.addEventListener('click',()=>resultOverlay.classList.remove('show'));
  rulesOverlay.addEventListener('click',e=>{if(e.target===rulesOverlay)rulesOverlay.classList.remove('show')});
  window.addEventListener('pagehide',()=>{stopClock();if(cpuTimer)clearTimeout(cpuTimer)});
  syncTimerSetup();buildBoard();
})();
