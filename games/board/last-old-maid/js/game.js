(() => {
  'use strict';

  const $=id=>document.getElementById(id);
  const setupPanel=$('setupPanel'),playPanel=$('playPanel'),playerTypesEl=$('playerTypes'),randomOrderToggle=$('randomOrderToggle'),startBtn=$('startBtn'),restartBtn=$('restartBtn'),rulesBtn=$('rulesBtn'),rulesOverlay=$('rulesOverlay'),closeRules=$('closeRules'),restartOverlay=$('restartOverlay'),cancelRestart=$('cancelRestart'),confirmRestart=$('confirmRestart'),resultOverlay=$('resultOverlay'),resultTitle=$('resultTitle'),resultText=$('resultText'),playAgainBtn=$('playAgainBtn'),drawerName=$('drawerName'),holderName=$('holderName'),readyPanel=$('readyPanel'),readyIcon=$('readyIcon'),readyTitle=$('readyTitle'),readyText=$('readyText'),readyBtn=$('readyBtn'),orderPanel=$('orderPanel'),orderTitle=$('orderTitle'),orderHand=$('orderHand'),swapBtn=$('swapBtn'),shuffleBtn=$('shuffleBtn'),orderHelper=$('orderHelper'),confirmOrderBtn=$('confirmOrderBtn'),drawPanel=$('drawPanel'),drawTitle=$('drawTitle'),drawHand=$('drawHand'),confirmDrawBtn=$('confirmDrawBtn'),revealPanel=$('revealPanel'),drawnCard=$('drawnCard'),revealText=$('revealText');

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
  }

  function isJoker(card){return card?.joker===true}
  function cardLabel(card){return isJoker(card)?'ジョーカー':`${card.rank}${card.suit}`}
  function cardFace(card){
    if(isJoker(card)){
      return '<div class="playingCard joker" aria-label="ジョーカー"><span>JOKER</span><span class="joker-center">🃏</span><span class="b">JOKER</span></div>';
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
    const twoCardPlayer=Math.random()<0.5?0:1;
    const oneCardPlayer=other(twoCardPlayer);
    const pairCards=shuffle(pair);
    hands=[[],[]];
    hands[twoCardPlayer]=shuffle([{rank:'JOKER',suit:'',joker:true},pairCards[0]]);
    hands[oneCardPlayer]=[pairCards[1]];
  }

  function showReady(purpose){
    phase='ready';
    readyPurpose=purpose;
    hideStages();
    readyPanel.classList.remove('hidden');

    if(purpose==='order'){
      readyIcon.textContent='↕';
      readyTitle.textContent=`${playerName(holder)} の番です`;
      readyText.textContent='手札の順番を決めます。画面を本人だけが見られる状態にしてください。';
    }else{
      readyIcon.textContent='🃏';
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
    drawnCard.innerHTML=cardFace(card);
    revealText.textContent=madePair?'同じ数字が揃いました！':'ジョーカーを引きました';
    updateStatus();

    clearRevealTimer();
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
    },1100);
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
  }

  function recordPlay(){
    if(recorded)return;
    recorded=true;
    if(!store||playerTypes.userIndex()<0)return;
    store.recordPlay('last-old-maid','ラストばば抜き');
  }

  function startGame(){
    clearRevealTimer();
    createLastThree();
    const random=randomOrderToggle.getAttribute('aria-pressed')==='true';
    drawer=random?(Math.random()<0.5?0:1):0;
    holder=other(drawer);
    selectedDraw=-1;
    recorded=false;
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
  playAgainBtn.addEventListener('click',()=>{
    resultOverlay.classList.remove('show');
    startGame();
  });
  rulesBtn.addEventListener('click',()=>rulesOverlay.classList.add('show'));
  closeRules.addEventListener('click',()=>rulesOverlay.classList.remove('show'));
  rulesOverlay.addEventListener('click',event=>{if(event.target===rulesOverlay)rulesOverlay.classList.remove('show')});
  window.addEventListener('pagehide',clearRevealTimer);
})();
