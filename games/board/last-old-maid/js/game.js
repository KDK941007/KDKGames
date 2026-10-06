(() => {
  'use strict';

  const $=id=>document.getElementById(id);
  const setupPanel=$('setupPanel'),playPanel=$('playPanel'),playerTypesEl=$('playerTypes'),randomOrderToggle=$('randomOrderToggle'),startBtn=$('startBtn'),restartBtn=$('restartBtn'),rulesBtn=$('rulesBtn'),rulesOverlay=$('rulesOverlay'),closeRules=$('closeRules'),restartOverlay=$('restartOverlay'),cancelRestart=$('cancelRestart'),confirmRestart=$('confirmRestart'),resultOverlay=$('resultOverlay'),resultTitle=$('resultTitle'),resultText=$('resultText'),resultRestartBtn=$('resultRestartBtn'),resultJoker=$('resultJoker'),drawerName=$('drawerName'),holderName=$('holderName'),readyPanel=$('readyPanel'),readyTitle=$('readyTitle'),readyText=$('readyText'),readyBtn=$('readyBtn'),orderPanel=$('orderPanel'),orderTitle=$('orderTitle'),orderHand=$('orderHand'),swapBtn=$('swapBtn'),shuffleBtn=$('shuffleBtn'),orderHelper=$('orderHelper'),confirmOrderBtn=$('confirmOrderBtn'),drawPanel=$('drawPanel'),drawTitle=$('drawTitle'),drawHand=$('drawHand'),confirmDrawBtn=$('confirmDrawBtn'),revealPanel=$('revealPanel'),drawnCard=$('drawnCard'),revealText=$('revealText');

  const store=globalThis.MiniGamePortalPlayerStore;
  const cards=globalThis.MiniGamePlayingCards;
  const SUITS=['♠','♥','♦','♣'];
  const RANKS=['2','3','4','5','6','7','8','9','10'];

  const playerTypes=globalThis.MiniGamePlayerTypes.create(playerTypesEl,{
    count:2,
    items:[{symbol:'1'},{symbol:'2'}],
    guestName:i=>`PLAYER ${i+1}`
  });

  let hands=[[],[]];
  let drawer=0;
  let holder=1;
  let selectedDraw=-1;
  let readyPurpose='order';
  let phase='setup';
  let revealTimer=0;
  let revealTextTimer=0;
  let recorded=false;

  function playerName(i){return playerTypes.getDisplayName(i)}
  function other(i){return i===0?1:0}
  function shuffle(values){
    const out=[...values];
    for(let i=out.length-1;i>0;i--){
      const j=Math.floor(Math.random()*(i+1));
      [out[i],out[j]]=[out[j],out[i]];
    }
    return out;
  }

  function clearRevealTimer(){
    if(revealTimer){clearTimeout(revealTimer);revealTimer=0}
    if(revealTextTimer){clearTimeout(revealTextTimer);revealTextTimer=0}
  }

  function isJoker(card){return card?.joker===true}
  function cardLabel(card){return isJoker(card)?'ジョーカー':`${card.rank}${card.suit}`}
  function jokerArt(){
    return '<svg class="joker-figure" viewBox="0 0 120 150" role="img" aria-label="ジョーカーの道化師" xmlns="http://www.w3.org/2000/svg">'
      +'<defs>'
      +'<linearGradient id="jpPurple" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#4c1d95"/><stop offset=".52" stop-color="#7c3aed"/><stop offset="1" stop-color="#c084fc"/></linearGradient>'
      +'<linearGradient id="jpRed" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#9f1239"/><stop offset=".55" stop-color="#e11d48"/><stop offset="1" stop-color="#fb7185"/></linearGradient>'
      +'<linearGradient id="jpGold" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fef3c7"/><stop offset=".45" stop-color="#fbbf24"/><stop offset="1" stop-color="#d97706"/></linearGradient>'
      +'<linearGradient id="jpSkin" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff7ed"/><stop offset=".72" stop-color="#fed7aa"/><stop offset="1" stop-color="#fdba74"/></linearGradient>'
      +'<linearGradient id="jpCollar" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ede9fe"/><stop offset=".5" stop-color="#c4b5fd"/><stop offset="1" stop-color="#8b5cf6"/></linearGradient>'
      +'<filter id="jpShadow" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="2" stdDeviation="2" flood-color="#312e81" flood-opacity=".28"/></filter>'
      +'</defs>'
      +'<g filter="url(#jpShadow)">'
      +'<path d="M60 17c-14 0-27 7-34 20 10-4 18-4 26 0-3-8-2-15 2-22 4 8 9 13 16 16 8-7 17-10 28-7-7 5-12 11-15 19 7-1 14 1 21 6-5-20-20-32-44-32z" fill="url(#jpPurple)" stroke="#3b0764" stroke-width="2.2"/>'
      +'<path d="M31 39C20 36 12 29 10 18c11 1 21 7 28 18z" fill="url(#jpRed)" stroke="#881337" stroke-width="2"/>'
      +'<path d="M89 39c11-3 19-10 21-21-11 1-21 7-28 18z" fill="url(#jpGold)" stroke="#a16207" stroke-width="2"/>'
      +'<circle cx="10" cy="18" r="5.6" fill="url(#jpGold)" stroke="#a16207" stroke-width="1.6"/>'
      +'<circle cx="60" cy="15" r="5.3" fill="#fb7185" stroke="#9f1239" stroke-width="1.6"/>'
      +'<circle cx="110" cy="18" r="5.6" fill="#60a5fa" stroke="#1d4ed8" stroke-width="1.6"/>'
      +'<path d="M30 46c4-12 15-20 30-20s26 8 30 20v29c0 23-12 40-30 40S30 98 30 75V46z" fill="url(#jpSkin)" stroke="#4c1d95" stroke-width="2.4"/>'
      +'<path d="M32 49c8-7 17-10 28-10s20 3 28 10" fill="none" stroke="#7c3aed" stroke-width="2.4" stroke-linecap="round"/>'
      +'<path d="M34 57l18-8-5 18z" fill="url(#jpGold)" stroke="#b45309" stroke-width="1.4"/>'
      +'<path d="M86 57l-18-8 5 18z" fill="url(#jpRed)" stroke="#9f1239" stroke-width="1.4"/>'
      +'<path d="M38 69c4-4 9-6 14-5" fill="none" stroke="#312e81" stroke-width="2.3" stroke-linecap="round"/>'
      +'<path d="M82 69c-4-4-9-6-14-5" fill="none" stroke="#312e81" stroke-width="2.3" stroke-linecap="round"/>'
      +'<ellipse cx="46" cy="74" rx="4.4" ry="5.6" fill="#111827"/><ellipse cx="74" cy="74" rx="4.4" ry="5.6" fill="#111827"/>'
      +'<circle cx="44.7" cy="72.1" r="1.2" fill="#fff"/><circle cx="72.7" cy="72.1" r="1.2" fill="#fff"/>'
      +'<path d="M59 74c-3 6-4 11-1 14 2 2 5 2 8 0" fill="none" stroke="#9a3412" stroke-width="1.8" stroke-linecap="round"/>'
      +'<path d="M44 94c8 7 24 7 32 0-2 13-30 15-32 0z" fill="#be123c" stroke="#881337" stroke-width="1.4"/>'
      +'<path d="M48 96c7 3 17 3 24 0" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round"/>'
      +'<circle cx="38" cy="87" r="2.3" fill="#fb7185" opacity=".45"/><circle cx="82" cy="87" r="2.3" fill="#fb7185" opacity=".45"/>'
      +'<path d="M35 111l-18 18 20 10 9-12 14 12 14-12 9 12 20-10-18-18c-7 7-15 11-25 11s-18-4-25-11z" fill="url(#jpCollar)" stroke="#4c1d95" stroke-width="2.2"/>'
      +'<path d="M36 112l10 15 14-10 14 10 10-15" fill="none" stroke="url(#jpGold)" stroke-width="2.4"/>'
      +'<path d="M27 124l10 5-4 8-11-5z" fill="url(#jpRed)" opacity=".95"/>'
      +'<path d="M93 124l-10 5 4 8 11-5z" fill="url(#jpPurple)" opacity=".95"/>'
      +'<circle cx="36" cy="138" r="5.1" fill="url(#jpGold)" stroke="#a16207" stroke-width="1.5"/>'
      +'<circle cx="84" cy="138" r="5.1" fill="#fb7185" stroke="#9f1239" stroke-width="1.5"/>'
      +'<path d="M58 118h4v20h-4z" fill="#fbbf24"/>'
      +'<circle cx="60" cy="128" r="3.2" fill="#fff7ed" stroke="#6d28d9" stroke-width="1.4"/>'
      +'</g>'
      +'</svg>';
  }
  function cardFace(card){
    if(isJoker(card)){
      return '<div class="playingCard joker" aria-label="ジョーカー"><span class="joker-word joker-word-top">JOKER</span>'+jokerArt()+'<span class="joker-word joker-word-bottom">JOKER</span></div>';
    }
    return cards.cardHTML(card,{ariaLabel:cardLabel(card)});
  }

  function updateStatus(){
    drawerName.textContent=playerName(drawer);
    holderName.textContent=playerName(holder);
  }

  function hideStages(){
    readyPanel.classList.add('hidden');
    orderPanel.classList.add('hidden');
    drawPanel.classList.add('hidden');
    revealPanel.classList.add('hidden');
  }

  function createLastThree(){
    const rank=RANKS[Math.floor(Math.random()*RANKS.length)];
    const suits=shuffle(SUITS).slice(0,2);
    const pair=[
      {rank,suit:suits[0],joker:false},
      {rank,suit:suits[1],joker:false}
    ];
    const pairCards=shuffle(pair);
    hands=[[],[]];
    hands[holder]=shuffle([{rank:'JOKER',suit:'',joker:true},pairCards[0]]);
    hands[drawer]=[pairCards[1]];
  }

  function showReady(purpose){
    phase='ready';
    readyPurpose=purpose;
    hideStages();
    readyPanel.classList.remove('hidden');

    if(purpose==='order'){
      readyTitle.textContent=`${playerName(holder)} の番です`;
      readyText.textContent='手札の順番を決めます。画面を本人だけが見られる状態にしてください。';
    }else{
      readyTitle.textContent=`${playerName(drawer)} の番です`;
      readyText.textContent='相手のカードを1枚引きます。画面を本人だけが見られる状態にしてください。';
    }
    updateStatus();
  }

  function renderOrderHand(){
    orderHand.innerHTML='';
    hands[holder].forEach(card=>{
      const wrap=document.createElement('div');
      wrap.innerHTML=cardFace(card);
      orderHand.appendChild(wrap.firstElementChild);
    });
    const multiple=hands[holder].length>1;
    swapBtn.disabled=!multiple;
    shuffleBtn.disabled=!multiple;
    orderHelper.textContent=multiple?'並び順を決めたら確定してください。':'1枚なので並び替えはありません。';
  }

  function showOrder(){
    phase='order';
    hideStages();
    orderPanel.classList.remove('hidden');
    orderTitle.textContent=`${playerName(holder)}：手札の順番を決める`;
    renderOrderHand();
  }

  function showDraw(){
    phase='draw';
    selectedDraw=-1;
    hideStages();
    drawPanel.classList.remove('hidden');
    drawTitle.textContent=`${playerName(drawer)}：1枚選んでください`;
    drawHand.innerHTML='';

    hands[holder].forEach((card,index)=>{
      const button=document.createElement('button');
      button.type='button';
      button.className='back-choice';
      button.dataset.index=String(index);
      button.setAttribute('aria-label',`${index+1}枚目のカード`);
      button.innerHTML=cards.cardHTML({}, {back:true});
      button.addEventListener('click',()=>selectDraw(index));
      drawHand.appendChild(button);
    });
    confirmDrawBtn.disabled=true;
    updateStatus();
  }

  function selectDraw(index){
    if(phase!=='draw'||index<0||index>=hands[holder].length)return;
    selectedDraw=index;
    [...drawHand.querySelectorAll('.back-choice')].forEach((el,i)=>el.classList.toggle('selected',i===index));
    confirmDrawBtn.disabled=false;
  }

  function discardPair(player){
    const normals=hands[player].filter(card=>!isJoker(card));
    if(normals.length<2)return false;
    const rank=normals[0].rank;
    const pairIndexes=[];
    hands[player].forEach((card,index)=>{
      if(!isJoker(card)&&card.rank===rank&&pairIndexes.length<2)pairIndexes.push(index);
    });
    if(pairIndexes.length<2)return false;
    hands[player]=hands[player].filter((_,index)=>!pairIndexes.includes(index));
    return true;
  }

  function findJokerOwner(){
    return hands.findIndex(hand=>hand.some(isJoker));
  }

  function confirmDraw(){
    if(phase!=='draw'||selectedDraw<0||selectedDraw>=hands[holder].length)return;

    const card=hands[holder].splice(selectedDraw,1)[0];
    hands[drawer].push(card);
    selectedDraw=-1;
    const madePair=discardPair(drawer);

    phase='reveal';
    hideStages();
    revealPanel.classList.remove('hidden');
    drawnCard.innerHTML='<div class="flip-shell"><div class="flip-inner"><div class="flip-face flip-back">'+cards.cardHTML({}, {back:true})+'</div><div class="flip-face flip-front">'+cardFace(card)+'</div></div></div>';
    revealText.textContent='';
    updateStatus();

    clearRevealTimer();
    revealTextTimer=setTimeout(()=>{
      revealTextTimer=0;
      revealText.textContent=madePair?'同じ数字が揃いました！':'ジョーカーを引きました';
    },1450);
    revealTimer=setTimeout(()=>{
      revealTimer=0;
      if(madePair){
        finishGame();
        return;
      }
      const previousDrawer=drawer;
      drawer=holder;
      holder=previousDrawer;
      showReady('order');
    },2200);
  }

  function clearCelebration(){
    resultOverlay.classList.remove('victory');
    resultOverlay.querySelectorAll('.confetti-piece').forEach(el=>el.remove());
  }

  function runCelebration(){
    clearCelebration();
    resultOverlay.classList.add('victory');
    const colors=['#fbbf24','#fb7185','#60a5fa','#34d399','#c084fc','#f8fafc'];
    for(let i=0;i<46;i++){
      const piece=document.createElement('span');
      piece.className='confetti-piece';
      piece.style.setProperty('--piece-x',Math.random()*100+'%');
      piece.style.setProperty('--piece-drift',(Math.random()*180-90)+'px');
      piece.style.setProperty('--piece-rotate',(Math.random()*1080-540)+'deg');
      piece.style.setProperty('--piece-delay',(Math.random()*.5)+'s');
      piece.style.setProperty('--piece-duration',(1.8+Math.random()*1.5)+'s');
      piece.style.setProperty('--piece-color',colors[i%colors.length]);
      resultOverlay.appendChild(piece);
    }
  }

  function finishGame(){
    const jokerOwner=findJokerOwner();
    if(jokerOwner<0)return;
    const winner=other(jokerOwner);
    phase='result';
    recordPlay();
    resultTitle.textContent=`${playerName(winner)} の勝ち！`;
    resultText.textContent=`${playerName(jokerOwner)} にジョーカーが残りました。`;
    resultOverlay.classList.add('show');
    runCelebration();
  }

  function recordPlay(){
    if(recorded)return;
    recorded=true;
    if(!store||playerTypes.userIndex()<0)return;
    store.recordPlay('last-old-maid','ラストばば抜き');
  }

  function startGame(){
    clearRevealTimer();
    clearCelebration();
    const random=randomOrderToggle.getAttribute('aria-pressed')==='true';
    drawer=random?(Math.random()<0.5?0:1):0;
    holder=other(drawer);
    createLastThree();
    selectedDraw=-1;
    recorded=false;
    clearCelebration();
    resultOverlay.classList.remove('show');
    restartOverlay.classList.remove('show');
    setupPanel.classList.add('hidden');
    playPanel.classList.remove('hidden');
    restartBtn.classList.remove('hidden');
    showReady('order');
  }

  function returnToSetup(){
    clearRevealTimer();
    phase='setup';
    hands=[[],[]];
    selectedDraw=-1;
    setupPanel.classList.remove('hidden');
    playPanel.classList.add('hidden');
    restartBtn.classList.add('hidden');
    resultOverlay.classList.remove('show');
    restartOverlay.classList.remove('show');
    hideStages();
  }

  resultJoker.innerHTML=jokerArt();

  randomOrderToggle.addEventListener('click',()=>{
    const next=randomOrderToggle.getAttribute('aria-pressed')!=='true';
    randomOrderToggle.setAttribute('aria-pressed',String(next));
    randomOrderToggle.querySelector('.order-toggle-text').textContent=next?'ランダム':'固定';
  });

  readyBtn.addEventListener('click',()=>{
    if(phase!=='ready')return;
    if(readyPurpose==='order')showOrder();
    else showDraw();
  });

  swapBtn.addEventListener('click',()=>{
    if(phase!=='order'||hands[holder].length<2)return;
    hands[holder].reverse();
    renderOrderHand();
  });

  shuffleBtn.addEventListener('click',()=>{
    if(phase!=='order'||hands[holder].length<2)return;
    hands[holder]=shuffle(hands[holder]);
    renderOrderHand();
  });

  confirmOrderBtn.addEventListener('click',()=>{
    if(phase!=='order')return;
    showReady('draw');
  });

  confirmDrawBtn.addEventListener('click',confirmDraw);
  startBtn.addEventListener('click',startGame);
  restartBtn.addEventListener('click',()=>restartOverlay.classList.add('show'));
  cancelRestart.addEventListener('click',()=>restartOverlay.classList.remove('show'));
  confirmRestart.addEventListener('click',returnToSetup);
  restartOverlay.addEventListener('click',event=>{if(event.target===restartOverlay)restartOverlay.classList.remove('show')});
  resultRestartBtn.addEventListener('click',returnToSetup);
  rulesBtn.addEventListener('click',()=>rulesOverlay.classList.add('show'));
  closeRules.addEventListener('click',()=>rulesOverlay.classList.remove('show'));
  rulesOverlay.addEventListener('click',event=>{if(event.target===rulesOverlay)rulesOverlay.classList.remove('show')});
  window.addEventListener('pagehide',()=>{clearRevealTimer();clearCelebration()});
})();
