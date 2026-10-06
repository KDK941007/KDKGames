(() => {
  'use strict';
  const $=id=>document.getElementById(id);
  const setupPanel=$('setupPanel'),playPanel=$('playPanel'),playerCountEl=$('playerCount'),playerTypesEl=$('playerTypes'),startBtn=$('startBtn'),restartBtn=$('restartBtn'),rulesBtn=$('rulesBtn'),rulesOverlay=$('rulesOverlay'),closeRules=$('closeRules'),restartOverlay=$('restartOverlay'),cancelRestart=$('cancelRestart'),confirmRestart=$('confirmRestart'),roundText=$('roundText'),phaseText=$('phaseText'),scoreboard=$('scoreboard'),tableBoard=$('tableBoard'),centerCards=$('centerCards'),centerMessage=$('centerMessage'),readyPanel=$('readyPanel'),readySuit=$('readySuit'),readyTitle=$('readyTitle'),readyBtn=$('readyBtn'),selectionPreview=$('selectionPreview'),previewCard=$('previewCard'),confirmSelectedCard=$('confirmSelectedCard'),battleReadyPanel=$('battleReadyPanel'),battleBtn=$('battleBtn'),showdownOverlay=$('showdownOverlay'),winnerCelebration=$('winnerCelebration'),winnerCelebrationTitle=$('winnerCelebrationTitle'),winnerCelebrationName=$('winnerCelebrationName'),roundSummary=$('roundSummary'),roundWinnerText=$('roundWinnerText'),nextRoundBtn=$('nextRoundBtn'),finalResultPanel=$('finalResultPanel'),finalTitle=$('finalTitle'),finalScores=$('finalScores'),backSetupBtn=$('backSetupBtn');
  const stationEls={top:$('stationTop'),right:$('stationRight'),bottom:$('stationBottom'),left:$('stationLeft')};
  const RANKS=['A','K','Q','J','10'],POWER={A:5,K:4,Q:3,J:2,'10':1},SUITS=[{symbol:'♠',name:'スペード',red:false},{symbol:'♥',name:'ハート',red:true},{symbol:'♦',name:'ダイヤ',red:true},{symbol:'♣',name:'クラブ',red:false}];
  const store=globalThis.MiniGamePortalPlayerStore;
  const cards=globalThis.MiniGamePlayingCards;
  const reducedMotion=globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
  let playerTypes=null;
  let players=[],seatPositions=[],initialSeatPositions=[],fieldSlots=[],round=1,currentIndex=0,choices={},selectedIndex=-1,reveal=false,recorded=false,phase='setup',dealTimer=0,showdownTimer=0,celebrationTimer=0;

  function playerName(i){return playerTypes?.getDisplayName(i)||`PLAYER ${i+1}`}
  playerTypes=globalThis.MiniGamePlayerTypes.create(playerTypesEl,{count:Number(playerCountEl.value),items:i=>({symbol:SUITS[i]?.symbol||String(i+1),symbolClass:SUITS[i]?.red?'red':''}),guestName:i=>`PLAYER ${i+1}`});
  playerCountEl.addEventListener('change',()=>playerTypes.setCount(Number(playerCountEl.value)));
  function shuffle(values){const out=[...values];for(let i=out.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[out[i],out[j]]=[out[j],out[i]]}return out}
  function cardObject(playerIndex,rank){return {rank,suit:SUITS[playerIndex].symbol}}
  function renderScores(){scoreboard.innerHTML='';players.forEach((p,i)=>{const d=document.createElement('div');d.className='score-item';d.innerHTML=`<span>${SUITS[i].symbol} ${playerName(i)}</span><b>${p.score}</b>`;scoreboard.appendChild(d)})}
  function setPhase(value,label){phase=value;phaseText.textContent=label}
  function buildSeatPositions(activeIndex){
    const n=players.length, result=Array(n);
    result[activeIndex]='bottom';
    if(n===2){result[(activeIndex+1)%n]='top';return result}
    if(n===3){result[(activeIndex+1)%n]='left';result[(activeIndex+2)%n]='right';return result}
    result[(activeIndex+1)%n]='left';
    result[(activeIndex+2)%n]='top';
    result[(activeIndex+3)%n]='right';
    return result;
  }
  function updateSeatPositions(){seatPositions=buildSeatPositions(currentIndex)}
  function start(){
    const count=Number(playerCountEl.value);
    playerTypes.setCount(count);
    reveal=document.querySelector('input[name="revealMode"]:checked').value==='open';
    players=Array.from({length:count},()=>({score:0,hand:[...RANKS]}));
    fieldSlots=shuffle((count===2?['left','right']:count===3?['left','top','right']:['top','right','bottom','left']));
    round=1;currentIndex=0;choices={};selectedIndex=-1;recorded=false;updateSeatPositions();initialSeatPositions=[...seatPositions];
    setupPanel.classList.add('hidden');playPanel.classList.remove('hidden');restartBtn.classList.remove('hidden');restartOverlay.classList.remove('show');
    roundSummary.classList.add('hidden');finalResultPanel.classList.add('hidden');selectionPreview.classList.add('hidden');battleReadyPanel.classList.add('hidden');readyPanel.classList.add('hidden');
    renderScores();renderTable({dealing:true});roundText.textContent='ROUND 1 / 5';setPhase('dealing','配札中');centerMessage.textContent='カードを配っています';centerMessage.classList.remove('hidden');
    clearTimers();
    const wait=reducedMotion?0:(players.length*5-1)*90+520;
    dealTimer=setTimeout(()=>{dealTimer=0;showReady()},wait);
  }
  function clearTimers(){if(dealTimer){clearTimeout(dealTimer);dealTimer=0}if(showdownTimer){clearTimeout(showdownTimer);showdownTimer=0}if(celebrationTimer){clearTimeout(celebrationTimer);celebrationTimer=0}}
  function returnToSetup(){
    clearTimers();phase='setup';tableBoard.classList.remove('showdown');showdownOverlay.classList.remove('active');winnerCelebration.classList.add('hidden');
    setupPanel.classList.remove('hidden');playPanel.classList.add('hidden');restartBtn.classList.add('hidden');restartOverlay.classList.remove('show');
    roundSummary.classList.add('hidden');finalResultPanel.classList.add('hidden');
  }
  function stationPlayerIndex(position){return seatPositions.indexOf(position)}
  function renderTable({dealing=false}={}){
    Object.entries(stationEls).forEach(([position,el])=>{
      const i=stationPlayerIndex(position);
      if(i<0){el.classList.add('hidden');el.innerHTML='';return}
      el.classList.remove('hidden');el.classList.toggle('active',phase==='choosing'&&i===currentIndex);
      const p=players[i];
      const showFaces=phase==='choosing'&&i===currentIndex;
      const handHtml=p.hand.map((rank,cardIndex)=>{
        const face=cards.cardHTML(cardObject(i,rank),{back:!showFaces});
        const cls=['card-slot'];
        if(showFaces)cls.push('selectable');
        if(showFaces&&selectedIndex===cardIndex)cls.push('selected');
        if(dealing)cls.push('dealing');
        const delay=dealing?(cardIndex*players.length+i)*90:0;
        return `<div class="${cls.join(' ')}" data-card-index="${cardIndex}" style="animation-delay:${delay}ms">${face}</div>`;
      }).join('');
      el.innerHTML=`<div class="station-hand">${handHtml}</div><div class="station-label">${SUITS[i].symbol} ${playerName(i)}</div>`;
      if(showFaces)el.querySelectorAll('.card-slot').forEach(slot=>slot.addEventListener('click',()=>selectCard(+slot.dataset.cardIndex)));
    });
    renderCenterCards();
  }
  function renderCenterCards({resolved=false,winners=[],allTied=false}={}){
    centerCards.innerHTML='';
    Object.entries(choices).forEach(([key,choice])=>{
      const i=Number(key),position=(phase==='battle-ready'||phase==='showdown'||phase==='result'||phase==='final')?(initialSeatPositions[i]||choice.fieldPosition):choice.fieldPosition;
      const wrap=document.createElement('div');
      wrap.className=`battle-card pos-${position}`;
      if(choice.fresh)wrap.classList.add('enter');
      if(resolved&&!allTied&&winners.includes(i))wrap.classList.add('winner');
      if(resolved&&reveal)wrap.classList.add('reveal');
      const showFace=resolved&&reveal;
      wrap.innerHTML=cards.cardHTML(cardObject(i,choice.rank),{back:!showFace});
      if(resolved&&!allTied&&winners.includes(i)){const badge=document.createElement('div');badge.className='point-badge';badge.textContent='+1';wrap.appendChild(badge)}
      centerCards.appendChild(wrap);
      choice.fresh=false;
    });
  }
  function hideCenterPanels(){
    readyPanel.classList.add('hidden');
    selectionPreview.classList.add('hidden');
    battleReadyPanel.classList.add('hidden');
    centerMessage.classList.add('hidden');
  }
  function showReady(){
    selectedIndex=-1;updateSeatPositions();
    setPhase('ready','準備');
    roundText.textContent=`ROUND ${round} / 5`;
    roundSummary.classList.add('hidden');roundSummary.classList.remove('win');finalResultPanel.classList.add('hidden');selectionPreview.classList.add('hidden');battleReadyPanel.classList.add('hidden');centerMessage.classList.add('hidden');winnerCelebration.classList.add('hidden');winnerCelebration.classList.remove('draw');readyPanel.classList.remove('hidden');
    readySuit.textContent=SUITS[currentIndex].symbol;readySuit.classList.toggle('red',SUITS[currentIndex].red);readyTitle.textContent=`${playerName(currentIndex)} の番です`;
    renderTable();
  }
  function showChoose(){
    setPhase('choosing','カード選択');
    readyPanel.classList.add('hidden');selectionPreview.classList.add('hidden');
    centerMessage.textContent='手札から1枚選んでください';centerMessage.classList.remove('hidden');
    renderTable();
  }
  function selectCard(index){
    if(phase!=='choosing'||index<0||index>=players[currentIndex].hand.length)return;
    selectedIndex=index;renderTable();
    const rank=players[currentIndex].hand[index];
    previewCard.innerHTML=cards.cardHTML(cardObject(currentIndex,rank));
    centerMessage.classList.add('hidden');
    selectionPreview.classList.remove('hidden');
  }
  function confirmCard(){
    if(phase!=='choosing'||selectedIndex<0)return;
    const p=players[currentIndex],rank=p.hand[selectedIndex];
    p.hand.splice(selectedIndex,1);
    choices[currentIndex]={rank,fresh:true,fieldPosition:fieldSlots[Object.keys(choices).length]};
    selectedIndex=-1;selectionPreview.classList.add('hidden');
    renderTable();
    if(currentIndex<players.length-1){currentIndex++;showReady();return}
    showBattleReady();
  }
  function showBattleReady(){
    setPhase('battle-ready','勝負待ち');
    seatPositions=[...initialSeatPositions];
    hideCenterPanels();battleReadyPanel.classList.remove('hidden');
    renderTable();
  }
  function resolveBattle(){
    if(phase!=='battle-ready')return;
    setPhase('showdown','勝負中');
    battleReadyPanel.classList.add('hidden');
    tableBoard.classList.add('showdown');
    showdownOverlay.classList.add('active');
    showdownOverlay.setAttribute('aria-hidden','false');
    const wait=reducedMotion?0:900;
    showdownTimer=setTimeout(()=>{showdownTimer=0;tableBoard.classList.remove('showdown');showdownOverlay.classList.remove('active');showdownOverlay.setAttribute('aria-hidden','true');showBattleResult()},wait);
  }
  function showBattleResult(){
    const max=Math.max(...Object.values(choices).map(v=>POWER[v.rank]));
    const winners=Object.keys(choices).map(Number).filter(i=>POWER[choices[i].rank]===max);
    const allTied=winners.length===players.length;
    if(!allTied)winners.forEach(i=>players[i].score++);
    setPhase('result','結果');
    roundSummary.classList.remove('hidden');roundSummary.classList.toggle('win',!allTied);
    winnerCelebration.classList.remove('hidden','draw');
    if(allTied){
      winnerCelebration.classList.add('draw');winnerCelebrationTitle.textContent='DRAW';winnerCelebrationName.textContent='全員引き分け・ポイントなし';
      roundWinnerText.textContent='全員引き分けのため、このラウンドはポイントなし';
    }else if(winners.length===1){
      winnerCelebrationTitle.textContent='WIN!';winnerCelebrationName.textContent=`${playerName(winners[0])} +1 POINT`;
      roundWinnerText.textContent=`${playerName(winners[0])} が+1ポイント`;
    }else{
      winnerCelebrationTitle.textContent='WIN!';winnerCelebrationName.textContent=`${winners.map(playerName).join('・')} +1 POINT`;
      roundWinnerText.textContent=`${winners.map(playerName).join('・')} は引き分けで全員+1ポイント`;
    }
    nextRoundBtn.textContent=round>=5?'最終結果へ':'次のラウンドへ';
    renderScores();renderCenterCards({resolved:true,winners,allTied});
    if(celebrationTimer)clearTimeout(celebrationTimer);celebrationTimer=setTimeout(()=>{celebrationTimer=0;winnerCelebration.classList.add('hidden')},1500);
  }
  function nextRound(){
    if(phase!=='result')return;
    if(round>=5){showFinal();return}
    round++;currentIndex=0;choices={};selectedIndex=-1;fieldSlots=shuffle((players.length===2?['left','right']:players.length===3?['left','top','right']:['top','right','bottom','left']));seatPositions=[...initialSeatPositions];roundSummary.classList.add('hidden');winnerCelebration.classList.add('hidden');showReady();
  }
  function showFinal(){
    setPhase('final','ゲーム終了');
    roundSummary.classList.add('hidden');
    const top=Math.max(...players.map(p=>p.score));
    const winners=players.map((p,i)=>p.score===top?i:-1).filter(i=>i>=0);
    finalTitle.textContent=winners.length===1?`${playerName(winners[0])} の勝ち！`:`${winners.map(playerName).join('・')} の引き分け`;
    finalScores.innerHTML='';
    players.forEach((p,i)=>{const d=document.createElement('div');d.className='final-score';d.innerHTML=`<span>${SUITS[i].symbol} ${playerName(i)}</span><b>${p.score} POINT</b>`;finalScores.appendChild(d)});
    finalResultPanel.classList.remove('hidden');recordPlay();
  }
  function recordPlay(){if(recorded)return;recorded=true;if(!store||playerTypes.userIndex()<0)return;store.recordPlay('high-card','ハイカードバトル')}
  readyBtn.addEventListener('click',showChoose);
  confirmSelectedCard.addEventListener('click',confirmCard);
  battleBtn.addEventListener('click',resolveBattle);
  nextRoundBtn.addEventListener('click',nextRound);
  startBtn.addEventListener('click',start);
  restartBtn.addEventListener('click',()=>restartOverlay.classList.add('show'));
  cancelRestart.addEventListener('click',()=>restartOverlay.classList.remove('show'));
  confirmRestart.addEventListener('click',returnToSetup);
  restartOverlay.addEventListener('click',e=>{if(e.target===restartOverlay)restartOverlay.classList.remove('show')});
  backSetupBtn.addEventListener('click',returnToSetup);
  rulesBtn.addEventListener('click',()=>rulesOverlay.classList.add('show'));
  closeRules.addEventListener('click',()=>rulesOverlay.classList.remove('show'));
  rulesOverlay.addEventListener('click',e=>{if(e.target===rulesOverlay)rulesOverlay.classList.remove('show')});
  window.addEventListener('pagehide',clearTimers);
})();
