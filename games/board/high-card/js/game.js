(() => {
  'use strict';
  const $=id=>document.getElementById(id);
  const setupPanel=$('setupPanel'),playPanel=$('playPanel'),playerCountEl=$('playerCount'),startBtn=$('startBtn'),restartBtn=$('restartBtn'),rulesBtn=$('rulesBtn'),rulesOverlay=$('rulesOverlay'),closeRules=$('closeRules'),restartOverlay=$('restartOverlay'),cancelRestart=$('cancelRestart'),confirmRestart=$('confirmRestart'),finalOverlay=$('finalOverlay'),finalTitle=$('finalTitle'),finalScores=$('finalScores'),backSetupBtn=$('backSetupBtn'),roundText=$('roundText'),phaseText=$('phaseText'),scoreboard=$('scoreboard'),centerCards=$('centerCards'),centerMessage=$('centerMessage'),readyPanel=$('readyPanel'),readySuit=$('readySuit'),readyTitle=$('readyTitle'),readyBtn=$('readyBtn'),battleReadyPanel=$('battleReadyPanel'),battleBtn=$('battleBtn'),roundSummary=$('roundSummary'),roundWinnerText=$('roundWinnerText'),nextRoundBtn=$('nextRoundBtn');
  const stationEls={top:$('stationTop'),right:$('stationRight'),bottom:$('stationBottom'),left:$('stationLeft')};
  const RANKS=['A','K','Q','J','10'],POWER={A:5,K:4,Q:3,J:2,'10':1},SUITS=[{symbol:'♠',name:'スペード',red:false},{symbol:'♥',name:'ハート',red:true},{symbol:'♦',name:'ダイヤ',red:true},{symbol:'♣',name:'クラブ',red:false}];
  const POSITION_SETS={2:['top','bottom'],3:['top','right','bottom'],4:['top','right','bottom','left']};
  const store=globalThis.MiniGamePortalPlayerStore;
  const cards=globalThis.MiniGamePlayingCards;
  const reducedMotion=matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
  let players=[],positions=[],round=1,currentIndex=0,choices={},selectedIndex=-1,reveal=false,recorded=false,phase='setup',dealTimer=0;

  function playerName(i){return `PLAYER ${i+1}`}
  function shuffle(values){const out=[...values];for(let i=out.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[out[i],out[j]]=[out[j],out[i]]}return out}
  function cardObject(playerIndex,rank){return {rank,suit:SUITS[playerIndex].symbol}}
  function renderScores(){scoreboard.innerHTML='';players.forEach((p,i)=>{const d=document.createElement('div');d.className='score-item';d.innerHTML=`<span>${SUITS[i].symbol} ${playerName(i)}</span><b>${p.score}</b>`;scoreboard.appendChild(d)})}
  function setPhase(value,label){phase=value;phaseText.textContent=label}
  function start(){
    const count=Number(playerCountEl.value);
    reveal=document.querySelector('input[name="revealMode"]:checked').value==='open';
    positions=POSITION_SETS[count];
    players=Array.from({length:count},()=>({score:0,hand:shuffle(RANKS)}));
    round=1;currentIndex=0;choices={};selectedIndex=-1;recorded=false;
    setupPanel.classList.add('hidden');playPanel.classList.remove('hidden');restartBtn.classList.remove('hidden');finalOverlay.classList.remove('show');restartOverlay.classList.remove('show');
    renderScores();renderTable({dealing:true});roundText.textContent='ROUND 1 / 5';setPhase('dealing','配札中');centerMessage.textContent='カードを配っています';centerMessage.classList.remove('hidden');readyPanel.classList.add('hidden');battleReadyPanel.classList.add('hidden');roundSummary.classList.add('hidden');
    clearTimeout(dealTimer);
    const wait=reducedMotion?0:(players.length*5-1)*90+520;
    dealTimer=setTimeout(()=>{dealTimer=0;showReady()},wait);
  }
  function returnToSetup(){
    clearTimeout(dealTimer);dealTimer=0;phase='setup';
    setupPanel.classList.remove('hidden');playPanel.classList.add('hidden');restartBtn.classList.add('hidden');restartOverlay.classList.remove('show');finalOverlay.classList.remove('show');
  }
  function stationPlayerIndex(position){return positions.indexOf(position)}
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
      el.innerHTML=`<div class="station-label">${SUITS[i].symbol} ${playerName(i)}</div><div class="station-hand">${handHtml}</div>`;
      if(showFaces)el.querySelectorAll('.card-slot').forEach(slot=>slot.addEventListener('click',()=>selectCard(+slot.dataset.cardIndex)));
    });
    renderCenterCards();
  }
  function renderCenterCards({resolved=false,winners=[]}={}){
    centerCards.innerHTML='';
    Object.entries(choices).forEach(([key,choice])=>{
      const i=Number(key),position=positions[i];
      const wrap=document.createElement('div');
      wrap.className=`battle-card pos-${position}`;
      if(choice.fresh)wrap.classList.add('enter');
      if(resolved&&winners.includes(i))wrap.classList.add('winner');
      if(resolved&&reveal)wrap.classList.add('reveal');
      const showFace=resolved&&reveal;
      wrap.innerHTML=cards.cardHTML(cardObject(i,choice.rank),{back:!showFace});
      if(resolved&&winners.includes(i)){const badge=document.createElement('div');badge.className='point-badge';badge.textContent='+1';wrap.appendChild(badge)}
      centerCards.appendChild(wrap);
      choice.fresh=false;
    });
  }
  function showReady(){
    selectedIndex=-1;
    setPhase('ready','準備');
    roundText.textContent=`ROUND ${round} / 5`;
    centerMessage.classList.add('hidden');battleReadyPanel.classList.add('hidden');roundSummary.classList.add('hidden');readyPanel.classList.remove('hidden');
    readySuit.textContent=SUITS[currentIndex].symbol;readySuit.classList.toggle('red',SUITS[currentIndex].red);readyTitle.textContent=`${playerName(currentIndex)} の番です`;
    renderTable();
  }
  function showChoose(){
    setPhase('choosing','カード選択');
    readyPanel.classList.add('hidden');
    centerMessage.textContent='手札から1枚選んでください';centerMessage.classList.remove('hidden');
    renderTable();
  }
  function selectCard(index){
    if(phase!=='choosing'||index<0||index>=players[currentIndex].hand.length)return;
    selectedIndex=index;renderTable();
    centerMessage.innerHTML='<button class="primary" id="confirmSelectedCard" type="button">このカードを出す</button>';
    $('confirmSelectedCard').addEventListener('click',confirmCard);
  }
  function confirmCard(){
    if(phase!=='choosing'||selectedIndex<0)return;
    const p=players[currentIndex],rank=p.hand[selectedIndex];
    p.hand.splice(selectedIndex,1);
    choices[currentIndex]={rank,fresh:true};
    selectedIndex=-1;
    renderTable();
    centerMessage.classList.add('hidden');
    if(currentIndex<players.length-1){currentIndex++;showReady();return}
    showBattleReady();
  }
  function showBattleReady(){
    setPhase('battle-ready','勝負待ち');
    readyPanel.classList.add('hidden');centerMessage.classList.add('hidden');roundSummary.classList.add('hidden');battleReadyPanel.classList.remove('hidden');
    renderTable();
  }
  function resolveBattle(){
    if(phase!=='battle-ready')return;
    const max=Math.max(...Object.values(choices).map(v=>POWER[v.rank]));
    const winners=Object.keys(choices).map(Number).filter(i=>POWER[choices[i].rank]===max);
    winners.forEach(i=>players[i].score++);
    setPhase('result','結果');
    battleReadyPanel.classList.add('hidden');roundSummary.classList.remove('hidden');
    roundWinnerText.textContent=winners.length===1?`${playerName(winners[0])} が+1ポイント`:`${winners.map(playerName).join('・')} が同率1位で全員+1ポイント`;
    nextRoundBtn.textContent=round>=5?'最終結果へ':'次のラウンドへ';
    renderScores();renderCenterCards({resolved:true,winners});
  }
  function nextRound(){
    if(phase!=='result')return;
    if(round>=5){showFinal();return}
    round++;currentIndex=0;choices={};selectedIndex=-1;showReady();
  }
  function showFinal(){
    setPhase('final','ゲーム終了');
    const top=Math.max(...players.map(p=>p.score));
    const winners=players.map((p,i)=>p.score===top?i:-1).filter(i=>i>=0);
    finalTitle.textContent=winners.length===1?`${playerName(winners[0])} の勝ち！`:`${winners.map(playerName).join('・')} の引き分け`;
    finalScores.innerHTML='';
    players.forEach((p,i)=>{const d=document.createElement('div');d.className='final-score';d.innerHTML=`<span>${SUITS[i].symbol} ${playerName(i)}</span><b>${p.score} POINT</b>`;finalScores.appendChild(d)});
    finalOverlay.classList.add('show');recordPlay();
  }
  function recordPlay(){if(recorded||!store)return;recorded=true;store.recordPlay('high-card','ハイカードバトル')}
  readyBtn.addEventListener('click',showChoose);
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
})();
