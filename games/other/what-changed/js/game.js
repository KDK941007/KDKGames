(() => {
  'use strict';

  const $ = id => document.getElementById(id);
  const setupPanel = $('setupPanel');
  const playPanel = $('playPanel');
  const startBtn = $('startBtn');
  const restartBtn = $('restartBtn');
  const rulesBtn = $('rulesBtn');
  const rulesOverlay = $('rulesOverlay');
  const closeRules = $('closeRules');
  const roundText = $('roundText');
  const scoreText = $('scoreText');
  const phaseTitle = $('phaseTitle');
  const phaseHint = $('phaseHint');
  const sceneEl = $('scene');
  const sceneName = $('sceneName');
  const sceneCover = $('sceneCover');
  const selectionInfo = $('selectionInfo');
  const selectionCount = $('selectionCount');
  const actionBtn = $('actionBtn');
  const roundOverlay = $('roundOverlay');
  const resultMark = $('resultMark');
  const roundResultTitle = $('roundResultTitle');
  const roundResultText = $('roundResultText');
  const answerList = $('answerList');
  const nextBtn = $('nextBtn');
  const finalOverlay = $('finalOverlay');
  const finalScore = $('finalScore');
  const finalMessage = $('finalMessage');
  const againBtn = $('againBtn');

  const store = globalThis.MiniGamePortalPlayerStore;
  const TOTAL_ROUNDS = 5;

  const SCENES = [
    {
      id:'living', name:'リビング', objects:[
        {key:'clock',x:18,y:18,normal:'🕒',changed:'🕘',label:'時計の時間'},
        {key:'plant',x:83,y:26,normal:'🌿',changed:'🌵',label:'植物'},
        {key:'book',x:26,y:73,normal:'📘',changed:'📕',label:'本の色'},
        {key:'drink',x:47,y:69,normal:'☕',changed:'🥛',label:'飲み物'},
        {key:'light',x:70,y:18,normal:'💡',changed:'🏮',label:'照明'},
        {key:'picture',x:49,y:21,normal:'🌄',changed:'🌃',label:'壁の絵'},
        {key:'fruit',x:72,y:70,normal:'🍎',changed:'🍊',label:'果物'},
        {key:'pet',x:88,y:75,normal:'🐈',changed:'🐕',label:'動物'}
      ]
    },
    {
      id:'kitchen', name:'台所', objects:[
        {key:'clock',x:18,y:18,normal:'🕙',changed:'🕓',label:'時計の時間'},
        {key:'pan',x:39,y:70,normal:'🍳',changed:'🥘',label:'フライパン'},
        {key:'fruit',x:68,y:73,normal:'🍌',changed:'🍇',label:'果物'},
        {key:'cup',x:83,y:52,normal:'🥤',changed:'☕',label:'コップ'},
        {key:'bread',x:21,y:74,normal:'🍞',changed:'🥐',label:'パン'},
        {key:'bottle',x:55,y:48,normal:'🧴',changed:'🫙',label:'容器'},
        {key:'plate',x:82,y:20,normal:'🍽️',changed:'🥣',label:'食器'},
        {key:'flower',x:45,y:20,normal:'🌷',changed:'🌻',label:'花'}
      ]
    },
    {
      id:'park', name:'公園', objects:[
        {key:'weather',x:18,y:17,normal:'☀️',changed:'🌤️',label:'空模様'},
        {key:'tree',x:18,y:53,normal:'🌳',changed:'🌲',label:'木'},
        {key:'flower',x:78,y:73,normal:'🌷',changed:'🌻',label:'花'},
        {key:'bird',x:70,y:20,normal:'🐦',changed:'🦋',label:'空にいる生き物'},
        {key:'ball',x:42,y:75,normal:'⚽',changed:'🏀',label:'ボール'},
        {key:'ride',x:87,y:50,normal:'🚲',changed:'🛴',label:'乗り物'},
        {key:'seat',x:58,y:57,normal:'🪑',changed:'🧺',label:'ベンチ付近の物'},
        {key:'cloud',x:44,y:20,normal:'☁️',changed:'🌧️',label:'雲'}
      ]
    },
    {
      id:'washitsu', name:'和室', objects:[
        {key:'clock',x:18,y:18,normal:'🕘',changed:'🕒',label:'時計の時間'},
        {key:'tea',x:50,y:72,normal:'🍵',changed:'☕',label:'飲み物'},
        {key:'flower',x:80,y:28,normal:'🌸',changed:'🌻',label:'花'},
        {key:'cushion',x:26,y:70,normal:'🟥',changed:'🟦',label:'座布団の色'},
        {key:'picture',x:49,y:22,normal:'🖼️',changed:'📜',label:'壁飾り'},
        {key:'cat',x:82,y:72,normal:'🐈',changed:'🐇',label:'動物'},
        {key:'snack',x:67,y:57,normal:'🍘',changed:'🍡',label:'お菓子'},
        {key:'plant',x:18,y:48,normal:'🎋',changed:'🪴',label:'飾り植物'}
      ]
    },
    {
      id:'bedroom', name:'寝室', objects:[
        {key:'clock',x:17,y:18,normal:'🕚',changed:'🕕',label:'時計の時間'},
        {key:'bed',x:30,y:70,normal:'🛏️',changed:'🛋️',label:'ベッド'},
        {key:'lamp',x:75,y:25,normal:'💡',changed:'🕯️',label:'照明'},
        {key:'book',x:69,y:69,normal:'📗',changed:'📙',label:'本の色'},
        {key:'slippers',x:85,y:77,normal:'🥿',changed:'👟',label:'履き物'},
        {key:'window',x:48,y:20,normal:'🌙',changed:'☀️',label:'窓の外'},
        {key:'flower',x:88,y:45,normal:'🌹',changed:'🌼',label:'花'},
        {key:'drink',x:52,y:72,normal:'🥛',changed:'🧃',label:'飲み物'}
      ]
    }
  ];

  let difficulty = 2;
  let scenes = [];
  let round = 0;
  let score = 0;
  let currentScene = null;
  let changedKeys = new Set();
  let selectedKeys = new Set();
  let phase = 'setup';
  let transitionTimer = 0;
  let recorded = false;

  function shuffle(values){
    const out = values.slice();
    for(let i=out.length-1;i>0;i--){
      const j = Math.floor(Math.random()*(i+1));
      const temp = out[i];
      out[i] = out[j];
      out[j] = temp;
    }
    return out;
  }

  function clearTransition(){
    if(transitionTimer){
      clearTimeout(transitionTimer);
      transitionTimer = 0;
    }
  }

  function setSceneTheme(){
    sceneEl.className = 'scene ' + currentScene.id;
    sceneName.textContent = currentScene.name;
    sceneEl.appendChild(sceneName);
    sceneEl.appendChild(sceneCover);
  }

  function objectByKey(key){
    return currentScene.objects.find(item => item.key === key);
  }

  function renderScene(){
    sceneEl.querySelectorAll('.scene-object').forEach(el => el.remove());
    setSceneTheme();

    currentScene.objects.forEach(obj => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'scene-object';
      button.dataset.key = obj.key;
      button.style.left = obj.x + '%';
      button.style.top = obj.y + '%';

      const changed = phase !== 'memorize' && changedKeys.has(obj.key);
      button.textContent = changed ? obj.changed : obj.normal;
      button.setAttribute('aria-label', obj.label);
      button.disabled = phase !== 'find';

      if(selectedKeys.has(obj.key)) button.classList.add('selected');

      if(phase === 'result'){
        const actual = changedKeys.has(obj.key);
        const selected = selectedKeys.has(obj.key);
        if(actual && selected) button.classList.add('correct');
        else if(actual) button.classList.add('missed');
        else if(selected) button.classList.add('wrong');
      }

      button.addEventListener('click', () => toggleSelection(obj.key));
      sceneEl.appendChild(button);
    });

    sceneEl.appendChild(sceneName);
    sceneEl.appendChild(sceneCover);
  }

  function updateSelection(){
    selectionCount.textContent = selectedKeys.size + ' / ' + difficulty;
    actionBtn.disabled = phase === 'find' && selectedKeys.size !== difficulty;
  }

  function toggleSelection(key){
    if(phase !== 'find') return;
    if(selectedKeys.has(key)){
      selectedKeys.delete(key);
    }else{
      if(selectedKeys.size >= difficulty) return;
      selectedKeys.add(key);
    }
    renderScene();
    updateSelection();
  }

  function beginRound(){
    clearTransition();
    currentScene = scenes[round];
    changedKeys = new Set(shuffle(currentScene.objects.map(obj => obj.key)).slice(0,difficulty));
    selectedKeys = new Set();
    phase = 'memorize';

    roundText.textContent = (round + 1) + ' / ' + TOTAL_ROUNDS;
    scoreText.textContent = String(score);
    phaseTitle.textContent = 'よく覚えてください';
    phaseHint.textContent = '時間制限はありません。ゆっくり見て大丈夫です。';
    selectionInfo.classList.add('hidden');
    actionBtn.textContent = '覚えた';
    actionBtn.disabled = false;
    sceneCover.classList.remove('show');
    renderScene();
  }

  function hideAndChange(){
    if(phase !== 'memorize') return;
    phase = 'transition';
    actionBtn.disabled = true;
    sceneCover.classList.add('show');

    transitionTimer = setTimeout(() => {
      transitionTimer = 0;
      phase = 'find';
      selectedKeys.clear();
      phaseTitle.textContent = '変わったところはどこ？';
      phaseHint.textContent = difficulty + 'か所選んでください。選び直しもできます。';
      selectionInfo.classList.remove('hidden');
      actionBtn.textContent = '答え合わせ';
      renderScene();
      updateSelection();
      requestAnimationFrame(() => sceneCover.classList.remove('show'));
    }, 850);
  }

  function checkAnswer(){
    if(phase !== 'find' || selectedKeys.size !== difficulty) return;

    let correct = 0;
    changedKeys.forEach(key => {
      if(selectedKeys.has(key)) correct++;
    });
    score += correct;
    scoreText.textContent = String(score);
    phase = 'result';
    renderScene();

    const perfect = correct === difficulty;
    resultMark.textContent = perfect ? '✓' : correct + '/' + difficulty;
    resultMark.classList.toggle('partial', !perfect);
    roundResultTitle.textContent = perfect ? '全問正解！' : correct + 'か所正解';
    roundResultText.textContent = '今回の変化は次の' + difficulty + 'か所でした。';
    answerList.innerHTML = '';

    changedKeys.forEach(key => {
      const obj = objectByKey(key);
      const row = document.createElement('div');
      row.className = 'answer-item';
      row.innerHTML = '<b>変化</b> ' + obj.label;
      answerList.appendChild(row);
    });

    nextBtn.textContent = round >= TOTAL_ROUNDS - 1 ? '最終結果へ' : '次のラウンドへ';
    roundOverlay.classList.add('show');
  }

  function finishGame(){
    roundOverlay.classList.remove('show');
    finalScore.textContent = score + ' / ' + (TOTAL_ROUNDS * difficulty);
    const rate = score / (TOTAL_ROUNDS * difficulty);
    if(rate === 1) finalMessage.textContent = '全問正解です！';
    else if(rate >= 0.8) finalMessage.textContent = 'かなりよく覚えられています。';
    else if(rate >= 0.5) finalMessage.textContent = '半分以上見つけました。';
    else finalMessage.textContent = 'もう一度挑戦してみましょう。';
    finalOverlay.classList.add('show');
    recordResult();
  }

  function nextRound(){
    roundOverlay.classList.remove('show');
    if(round >= TOTAL_ROUNDS - 1){
      finishGame();
      return;
    }
    round++;
    beginRound();
  }

  function recordResult(){
    if(recorded || !store) return;
    recorded = true;
    store.recordPlay('what-changed','変わったところはどこ？');
  }

  function startGame(){
    difficulty = Number(document.querySelector('input[name="difficulty"]:checked').value);
    scenes = shuffle(SCENES);
    round = 0;
    score = 0;
    recorded = false;
    setupPanel.classList.add('hidden');
    playPanel.classList.remove('hidden');
    restartBtn.classList.remove('hidden');
    finalOverlay.classList.remove('show');
    beginRound();
  }

  function returnToSetup(){
    clearTransition();
    phase = 'setup';
    setupPanel.classList.remove('hidden');
    playPanel.classList.add('hidden');
    restartBtn.classList.add('hidden');
    roundOverlay.classList.remove('show');
    finalOverlay.classList.remove('show');
    sceneCover.classList.remove('show');
  }

  startBtn.addEventListener('click', startGame);
  actionBtn.addEventListener('click', () => {
    if(phase === 'memorize') hideAndChange();
    else if(phase === 'find') checkAnswer();
  });
  nextBtn.addEventListener('click', nextRound);
  againBtn.addEventListener('click', () => {
    finalOverlay.classList.remove('show');
    startGame();
  });
  restartBtn.addEventListener('click', returnToSetup);
  rulesBtn.addEventListener('click', () => rulesOverlay.classList.add('show'));
  closeRules.addEventListener('click', () => rulesOverlay.classList.remove('show'));
  rulesOverlay.addEventListener('click', event => {
    if(event.target === rulesOverlay) rulesOverlay.classList.remove('show');
  });
  window.addEventListener('pagehide', clearTransition);
})();
