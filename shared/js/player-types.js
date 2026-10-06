(() => {
  'use strict';
  const store=globalThis.MiniGamePortalPlayerStore;
  function profileName(){
    try{return store?.profile?.()?.displayName||'PLAYER'}catch(_){return 'PLAYER'}
  }
  function create(container,{count=2,items=[],defaultUserIndex=0,guestName=i=>`GUEST ${i+1}`,maxNameLength=10,cpuDifficulty=true}={}){
    if(!container)throw new Error('player type container is required');
    let types=[],guestNames=[],cpuDifficulties=[];
    let currentCount=0;
    const itemAt=i=>typeof items==='function'?(items(i)||{}):(items[i]||{});
    const fallbackGuest=i=>String(guestName(i)||`GUEST ${i+1}`).slice(0,maxNameLength);
    function captureNames(){
      container.querySelectorAll('.mg-player-name').forEach(input=>{
        const i=Number(input.dataset.playerIndex);
        if(types[i]==='guest')guestNames[i]=(input.value.trim()||fallbackGuest(i)).slice(0,maxNameLength);
      });
    }
    function setCount(next){
      captureNames();
      const n=Math.max(1,Number(next)||1);
      const old=[...types];
      types=Array.from({length:n},(_,i)=>old[i]||'guest');
      guestNames=Array.from({length:n},(_,i)=>guestNames[i]||fallbackGuest(i));
      cpuDifficulties=Array.from({length:n},(_,i)=>cpuDifficulties[i]||'normal');
      if(!types.includes('user')&&defaultUserIndex>=0&&defaultUserIndex<n)types[defaultUserIndex]='user';
      let found=false;
      types=types.map(type=>{
        if(type!=='user')return type==='cpu'?'cpu':'guest';
        if(found)return 'guest';
        found=true;return 'user';
      });
      currentCount=n;render();
    }
    function render(){
      captureNames();
      container.innerHTML='';
      container.dataset.count=String(currentCount);
      container.style.setProperty('--mg-player-cols',String(Math.min(currentCount,4)));
      types.forEach((type,i)=>{
        const item=itemAt(i);
        const wrap=document.createElement('div');wrap.className='mg-player-participant';
        const button=document.createElement('button');
        button.type='button';
        button.className='mg-player-type'+(type==='user'?' is-user':type==='cpu'?' is-cpu':'');
        button.dataset.playerIndex=String(i);
        button.setAttribute('aria-pressed',type==='user'?'true':'false');
        const symbol=document.createElement('span');
        symbol.className='mg-player-type-symbol'+(item.symbolClass?' '+item.symbolClass:'');
        symbol.textContent=item.symbol||String(i+1);
        const info=document.createElement('span');info.className='mg-player-type-info';
        const mode=document.createElement('small');mode.textContent=type==='user'?'USER':type==='cpu'?'CPU':'GUEST';
        const name=document.createElement('b');name.textContent=type==='user'?profileName():type==='cpu'?('CPU '+(i+1)):(guestNames[i]||fallbackGuest(i));
        info.append(mode,name);button.append(symbol,info);
        const input=document.createElement('input');
        input.type='text';input.className='mg-player-name';input.dataset.playerIndex=String(i);
        input.maxLength=maxNameLength;
        input.value=type==='user'?profileName():type==='cpu'?('CPU '+(i+1)):(guestNames[i]||fallbackGuest(i));
        input.placeholder=fallbackGuest(i);
        input.readOnly=type!=='guest';
        input.setAttribute('aria-label',`プレイヤー${i+1}の名前`);
        input.addEventListener('input',()=>{
          if(types[i]!=='guest')return;
          guestNames[i]=input.value.slice(0,maxNameLength);
          name.textContent=input.value.trim()||fallbackGuest(i);
          container.dispatchEvent(new CustomEvent('playernamechange',{detail:{index:i,name:name.textContent}}));
        });
        button.addEventListener('click',()=>{
          captureNames();
          if(types[i]==='user'){types[i]='guest';guestNames[i]=fallbackGuest(i)}else if(types[i]==='guest'){types[i]='cpu'}else{types[i]='user';types=types.map((type,index)=>{if(index===i)return'user';if(type==='user'){guestNames[index]=fallbackGuest(index);return'guest'}return type})}
          render();
          container.dispatchEvent(new CustomEvent('playertypechange',{detail:{index:i,type:types[i]}}));
        });
        wrap.append(button,input);
        if(type==='cpu'&&cpuDifficulty){
          const select=document.createElement('select');select.className='mg-cpu-difficulty';select.dataset.playerIndex=String(i);select.setAttribute('aria-label',`CPU ${i+1}の強さ`);
          [['weak','弱い'],['normal','普通'],['strong','強い'],['max','最強']].forEach(([value,label])=>{const option=document.createElement('option');option.value=value;option.textContent=label;select.appendChild(option)});
          select.value=cpuDifficulties[i]||'normal';
          select.addEventListener('change',()=>{cpuDifficulties[i]=select.value;container.dispatchEvent(new CustomEvent('cpudifficultychange',{detail:{index:i,difficulty:select.value}}))});
          wrap.appendChild(select);
        }
        container.appendChild(wrap);
      });
    }
    setCount(count);
    window.addEventListener('pageshow',render);
    return {
      setCount,
      refresh:render,
      getType:i=>types[i]||'guest',
      getCpuDifficulty:i=>cpuDifficulties[i]||'normal',
      getDisplayName(i){
        if(types[i]==='user')return profileName();
        if(types[i]==='cpu')return `CPU ${i+1}`;
        const input=container.querySelector(`.mg-player-name[data-player-index="${i}"]`);
        const value=(input?.value||guestNames[i]||fallbackGuest(i)).trim();
        return (value||fallbackGuest(i)).slice(0,maxNameLength);
      },
      userIndex:()=>types.findIndex(x=>x==='user'),
      snapshot:()=>[...types],
      cpuDifficultySnapshot:()=>[...cpuDifficulties]
    };
  }
  globalThis.MiniGamePlayerTypes={create};
})();