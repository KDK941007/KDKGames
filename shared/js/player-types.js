(() => {
  'use strict';
  const store=globalThis.MiniGamePortalPlayerStore;
  function profileName(){
    try{return store?.profile?.()?.displayName||'PLAYER'}catch(_){return 'PLAYER'}
  }
  function create(container,{count=2,items=[],defaultUserIndex=0,guestName=i=>`GUEST ${i+1}`,maxNameLength=10}={}){
    if(!container)throw new Error('player type container is required');
    let types=[],guestNames=[];
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
      if(!types.includes('user')&&defaultUserIndex>=0&&defaultUserIndex<n)types[defaultUserIndex]='user';
      let found=false;
      types=types.map(type=>{
        if(type!=='user')return 'guest';
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
        button.className='mg-player-type'+(type==='user'?' is-user':'');
        button.dataset.playerIndex=String(i);
        button.setAttribute('aria-pressed',type==='user'?'true':'false');
        const symbol=document.createElement('span');
        symbol.className='mg-player-type-symbol'+(item.symbolClass?' '+item.symbolClass:'');
        symbol.textContent=item.symbol||String(i+1);
        const info=document.createElement('span');info.className='mg-player-type-info';
        const mode=document.createElement('small');mode.textContent=type==='user'?'USER':'GUEST';
        const name=document.createElement('b');name.textContent=type==='user'?profileName():(guestNames[i]||fallbackGuest(i));
        info.append(mode,name);button.append(symbol,info);
        const input=document.createElement('input');
        input.type='text';input.className='mg-player-name';input.dataset.playerIndex=String(i);
        input.maxLength=maxNameLength;
        input.value=type==='user'?profileName():(guestNames[i]||fallbackGuest(i));
        input.placeholder=fallbackGuest(i);
        input.readOnly=type==='user';
        input.setAttribute('aria-label',`プレイヤー${i+1}の名前`);
        input.addEventListener('input',()=>{
          if(types[i]!=='guest')return;
          guestNames[i]=input.value.slice(0,maxNameLength);
          name.textContent=input.value.trim()||fallbackGuest(i);
          container.dispatchEvent(new CustomEvent('playernamechange',{detail:{index:i,name:name.textContent}}));
        });
        button.addEventListener('click',()=>{
          captureNames();
          if(types[i]==='user'){types[i]='guest'}else{types=types.map(()=> 'guest');types[i]='user'}
          render();
          container.dispatchEvent(new CustomEvent('playertypechange',{detail:{index:i,type:types[i]}}));
        });
        wrap.append(button,input);container.appendChild(wrap);
      });
    }
    setCount(count);
    window.addEventListener('pageshow',render);
    return {
      setCount,
      refresh:render,
      getType:i=>types[i]||'guest',
      getDisplayName(i){
        if(types[i]==='user')return profileName();
        const input=container.querySelector(`.mg-player-name[data-player-index="${i}"]`);
        const value=(input?.value||guestNames[i]||fallbackGuest(i)).trim();
        return (value||fallbackGuest(i)).slice(0,maxNameLength);
      },
      userIndex:()=>types.findIndex(x=>x==='user'),
      snapshot:()=>[...types]
    };
  }
  globalThis.MiniGamePlayerTypes={create};
})();