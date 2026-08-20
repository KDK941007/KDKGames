(() => {
  const boardEl = document.getElementById('board');
  const statusLabel = document.getElementById('statusLabel');
  const statusText = document.getElementById('statusText');
  const turnSymbol = document.getElementById('turnSymbol');
  const turnView = document.getElementById('turnView');
  const turnTimerBox = document.getElementById('turnTimerBox');
  const turnTimer = document.getElementById('turnTimer');

  const starterArea = document.getElementById('starterArea');
  const starterInline = document.getElementById('starterInline');
  const starterButtons = [...document.querySelectorAll('.starter-choice')];

  const turnTimeInput = document.getElementById('turnTimeInput');
  const unlimitedToggle = document.getElementById('unlimitedToggle');
  const timeError = document.getElementById('timeError');

  const restartBtn = document.getElementById('restartBtn');
  const rulesBtn = document.getElementById('rulesBtn');

  const rulesOverlay = document.getElementById('rulesOverlay');
  const closeRules = document.getElementById('closeRules');

  const winnerOverlay = document.getElementById('winnerOverlay');
  const winnerSymbol = document.getElementById('winnerSymbol');
  const winnerText = document.getElementById('winnerText');
  const winnerSub = document.getElementById('winnerSub');
  const playAgainBtn = document.getElementById('playAgainBtn');

  const portalBtn = document.getElementById('portalBtn');
  const portalConfirmOverlay = document.getElementById('portalConfirmOverlay');
  const cancelPortalBtn = document.getElementById('cancelPortalBtn');
  const confirmPortalBtn = document.getElementById('confirmPortalBtn');


    const {
    now: mgPortalNow,
    newPlayerId: mgPortalNewId,
    defaultSave: mgPortalDefaultSave,
    load: mgPortalLoad,
    save: mgPortalSave,
    profile: mgPortalProfile,
    recordValue: mgPortalRecordValue,
    setRecord: mgPortalSetRecord,
    recordPlay: mgPortalRecordPlay
  } = globalThis.MiniGamePortalPlayerStore;


  const oPlayerTypeBtn = document.getElementById('oPlayerTypeBtn');
  const xPlayerTypeBtn = document.getElementById('xPlayerTypeBtn');
  const oPlayerName = document.getElementById('oPlayerName');
  const xPlayerName = document.getElementById('xPlayerName');
  const oPlayerMode = document.getElementById('oPlayerMode');
  const xPlayerMode = document.getElementById('xPlayerMode');
  const playerTypes={O:'user',X:'guest'};

  function getPlayerType(side){ return playerTypes[side]||'guest'; }
  function refreshPlayerTypes(changed=null) {
    if(changed && playerTypes[changed]==='user'){
      playerTypes[changed==='O'?'X':'O']='guest';
    }
    if(playerTypes.O==='user' && playerTypes.X==='user') playerTypes.X='guest';
    const profile=mgPortalProfile();
    const apply=(side,btn,nameEl,modeEl)=>{
      const isUser=playerTypes[side]==='user';
      btn.classList.toggle('is-user',isUser);
      btn.setAttribute('aria-pressed',isUser?'true':'false');
      modeEl.textContent=isUser?'USER':'GUEST';
      nameEl.textContent=isUser?profile.displayName:'一時プレイ';
    };
    apply('O',oPlayerTypeBtn,oPlayerName,oPlayerMode);
    apply('X',xPlayerTypeBtn,xPlayerName,xPlayerMode);
  }

  [oPlayerTypeBtn,xPlayerTypeBtn].forEach(btn=>btn.addEventListener('click',()=>{
    const side=btn.dataset.side;
    playerTypes[side]=playerTypes[side]==='user'?'guest':'user';
    refreshPlayerTypes(side);
  }));
  window.addEventListener('pageshow',()=>refreshPlayerTypes());
  refreshPlayerTypes();

  const WIN_LINES = [
    [0,1,2],[3,4,5],[6,7,8],
    [0,3,6],[1,4,7],[2,5,8],
    [0,4,8],[2,4,6]
  ];

  let board = Array(9).fill(null);
  let current = null;
  let history = { X: [], O: [] };
  let gameOver = false;
  let winLine = [];

  let turnLimitSeconds = null;
  let turnDeadline = 0;
  let timerRaf = 0;
  let audioCtx = null;
  let portalResultRecorded = false;

  function getSymbol(player) {
    return player === 'X' ? '×' : '○';
  }

  function resolveStartPlayer(mode) {
    if (mode === 'random') {
      return Math.random() < 0.5 ? 'O' : 'X';
    }
    return mode;
  }

  function ensureAudio() {
    try {
      if (!audioCtx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (AC) audioCtx = new AC();
      }
      if (audioCtx && audioCtx.state === 'suspended') {
        audioCtx.resume().catch(() => {});
      }
      return audioCtx;
    } catch (_) {
      return null;
    }
  }

  function tone(freq, duration, volume, type, when = 0) {
    const ctx = ensureAudio();
    if (!ctx) return;

    const start = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);

    osc.connect(gain).connect(ctx.destination);
    osc.start(start);
    osc.stop(start + duration + 0.03);
  }

  function playPieceSound(player) {
    ensureAudio();

    if (player === 'O') {
      // ○：丸く明るい上昇音
      tone(420, 0.10, 0.11, 'sine');
      tone(620, 0.14, 0.09, 'sine', 0.07);
    } else {
      // ×：硬く短い下降音
      tone(340, 0.08, 0.12, 'square');
      tone(220, 0.12, 0.09, 'triangle', 0.055);
    }
  }

  function resetState() {
    stopTurnTimer();
    board = Array(9).fill(null);
    current = null;
    history = { X: [], O: [] };
    gameOver = false;
    winLine = [];
    turnDeadline = 0;
    portalResultRecorded = false;
  }

  function showStarterSelection() {
    resetState();
    winnerOverlay.classList.remove('show');
    starterArea.style.display = '';
    starterInline.classList.add('show');
    turnView.classList.add('hidden');
    timeError.classList.remove('show');
    render();
  }

  function getTurnLimitFromSetup() {
    if (unlimitedToggle.checked) {
      return null;
    }

    const seconds = Number(turnTimeInput.value);
    if (!Number.isFinite(seconds) || seconds < 1) {
      timeError.classList.add('show');
      turnTimeInput.focus();
      return undefined;
    }

    timeError.classList.remove('show');
    return seconds;
  }

  function startGame(mode) {
    const selectedLimit = getTurnLimitFromSetup();
    if (selectedLimit === undefined) return;

    ensureAudio();
    resetState();

    turnLimitSeconds = selectedLimit;
    current = resolveStartPlayer(mode);

    starterInline.classList.remove('show');
    starterArea.style.display = 'none';
    turnView.classList.remove('hidden');
    winnerOverlay.classList.remove('show');

    render();
    startTurnTimer();
  }

  function startTurnTimer() {
    stopTurnTimer();

    if (!current || gameOver) return;

    if (turnLimitSeconds === null) {
      turnTimer.textContent = '∞';
      turnTimerBox.classList.remove('warning');
      return;
    }

    turnDeadline = performance.now() + turnLimitSeconds * 1000;
    updateTurnTimer();
  }

  function stopTurnTimer() {
    if (timerRaf) {
      cancelAnimationFrame(timerRaf);
      timerRaf = 0;
    }
  }

  function updateTurnTimer() {
    if (!current || gameOver || turnLimitSeconds === null) {
      timerRaf = 0;
      return;
    }

    const remainingMs = Math.max(0, turnDeadline - performance.now());
    const remainingSec = remainingMs / 1000;

    turnTimer.textContent = remainingSec >= 10
      ? Math.ceil(remainingSec).toString()
      : remainingSec.toFixed(1);

    turnTimerBox.classList.toggle('warning', remainingSec <= Math.min(3, turnLimitSeconds * 0.3));

    if (remainingMs <= 0) {
      timerRaf = 0;
      handleTimeout();
      return;
    }

    timerRaf = requestAnimationFrame(updateTurnTimer);
  }

  function handleTimeout() {
    if (!current || gameOver) return;

    const loser = current;
    const winner = loser === 'X' ? 'O' : 'X';

    gameOver = true;
    winLine = [];
    stopTurnTimer();
    render();

    statusLabel.textContent = '時間切れ';
    statusText.textContent = `${getSymbol(loser)} の負け`;
    turnSymbol.textContent = getSymbol(loser);
    turnSymbol.className = `turn-symbol ${loser.toLowerCase()}`;
    turnTimer.textContent = '0.0';
    turnTimerBox.classList.add('warning');

    showWinner(winner, '時間切れ');
  }

  function render() {
    boardEl.innerHTML = '';

    const oldestX = !gameOver && history.X.length === 3 ? history.X[0] : -1;
    const oldestO = !gameOver && history.O.length === 3 ? history.O[0] : -1;

    board.forEach((value, index) => {
      const cell = document.createElement('button');
      cell.className = 'cell';
      cell.type = 'button';
      cell.setAttribute('aria-label', `${index + 1}番のマス`);
      cell.disabled = !current || gameOver;

      if (value) {
        cell.textContent = getSymbol(value);
        cell.classList.add(value.toLowerCase());

        if (index === oldestX || index === oldestO) {
          cell.classList.add('oldest');
        }
      }

      if (winLine.includes(index)) {
        cell.classList.add('winner');
      }

      cell.addEventListener('click', () => play(index));
      boardEl.appendChild(cell);
    });

    if (!gameOver && current) {
      statusLabel.textContent = '現在のターン';
      statusText.textContent = `${getSymbol(current)} の番`;
      turnSymbol.textContent = getSymbol(current);
      turnSymbol.className = `turn-symbol ${current.toLowerCase()}`;
    }
  }

  function play(index) {
    if (!current || gameOver || board[index]) return;

    const playedBy = current;

    if (history[playedBy].length >= 3) {
      const oldest = history[playedBy].shift();
      board[oldest] = null;
    }

    board[index] = playedBy;
    history[playedBy].push(index);

    playPieceSound(playedBy);

    const winning = findWin(playedBy);

    if (winning) {
      gameOver = true;
      winLine = winning;
      stopTurnTimer();
      render();
      showWinner(playedBy, '3つ並びました');
      return;
    }

    current = playedBy === 'X' ? 'O' : 'X';
    render();
    startTurnTimer();
  }

  function findWin(player) {
    return WIN_LINES.find(line => line.every(i => board[i] === player)) || null;
  }


  function recordPortalMatch(winner){
    if(portalResultRecorded)return;
    portalResultRecorded=true;
    const userSide=getPlayerType('O')==='user'?'O':getPlayerType('X')==='user'?'X':null;
    if(!userSide)return;
    const userWon=winner===userSide;
    mgPortalRecordPlay('marubatsu','消える○×ゲーム',game=>{
      const wins=mgPortalRecordValue(game,'wins')+(userWon?1:0);
      const losses=mgPortalRecordValue(game,'losses')+(userWon?0:1);
      mgPortalSetRecord(game,'wins','WIN',wins,'number');
      mgPortalSetRecord(game,'losses','LOSE',losses,'number');
      const decided=Math.max(1,wins+losses);
      mgPortalSetRecord(game,'winRate','WIN RATE',wins/decided*100,'percent');
    });
  }

  function showWinner(player, reason) {
    recordPortalMatch(player);
    const symbol = getSymbol(player);

    winnerSymbol.textContent = symbol;
    winnerSymbol.style.color = player === 'X' ? 'var(--x)' : 'var(--o)';
    winnerText.textContent = `${symbol} の勝ち！`;
    winnerSub.textContent = reason;

    if (reason !== '時間切れ') {
      statusLabel.textContent = 'ゲーム終了';
      statusText.textContent = `${symbol} の勝ち`;
      turnSymbol.textContent = symbol;
      turnSymbol.className = `turn-symbol ${player.toLowerCase()}`;
      turnTimerBox.classList.remove('warning');
    }

    setTimeout(() => {
      winnerOverlay.classList.add('show');
    }, 300);
  }

  unlimitedToggle.addEventListener('change', () => {
    turnTimeInput.disabled = unlimitedToggle.checked;
    timeError.classList.remove('show');

    if (!unlimitedToggle.checked) {
      turnTimeInput.focus();
    }
  });

  turnTimeInput.addEventListener('input', () => {
    timeError.classList.remove('show');
  });

  starterButtons.forEach(button => {
    button.addEventListener('click', () => {
      startGame(button.dataset.start);
    });
  });

  restartBtn.addEventListener('click', showStarterSelection);

  playAgainBtn.addEventListener('click', () => {
    winnerOverlay.classList.remove('show');
  });

  rulesBtn.addEventListener('click', () => {
    rulesOverlay.classList.add('show');
  });

  closeRules.addEventListener('click', () => {
    rulesOverlay.classList.remove('show');
  });

  rulesOverlay.addEventListener('click', e => {
    if (e.target === rulesOverlay) {
      rulesOverlay.classList.remove('show');
    }
  });

  portalBtn.addEventListener('click', () => {
    portalConfirmOverlay.classList.add('show');
  });

  cancelPortalBtn.addEventListener('click', () => {
    portalConfirmOverlay.classList.remove('show');
  });

  portalConfirmOverlay.addEventListener('click', e => {
    if (e.target === portalConfirmOverlay) {
      portalConfirmOverlay.classList.remove('show');
    }
  });

  confirmPortalBtn.addEventListener('click', () => {
    stopTurnTimer();
    window.location.href = '../';
  });

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && current && !gameOver && turnLimitSeconds !== null) {
      updateTurnTimer();
    }
  });

  showStarterSelection();
})();
