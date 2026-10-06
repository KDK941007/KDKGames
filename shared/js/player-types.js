(() => {
  'use strict';
  const store=globalThis.MiniGamePortalPlayerStore;
  function profileName(){
    try{return store?.profile?.()?.displayName||'PLAYER'}catch(_){return 'PLAYER'}
  }
  function create(container,{count=2,items=[],defaultUserIndex=0,guestName=i=>`GUEST ${i+1}`}={}){
    if(!container)throw new Error('player type container is required');
    let types=[];
    let currentCount=0;
    const itemAt=i=>typeof items==='function'?(items(i)||{}):(items[i]||{});
    function setCount(next){
      const n=Math.max(1,Number(next)||1);
      const old=[...types];
      types=Array.from({length:n},(_,i)=>old[i]||'guest');
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
      container.innerHTML='';
      container.dataset.count=String(currentCount);
      container.style.setProperty('--mg-player-cols',String(Math.min(currentCount,4)));
      types.forEach((type,i)=>{
        const item=itemAt(i);
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
        const name=document.createElement('b');name.textContent=type==='user'?profileName():guestName(i);
        info.append(mode,name);button.append(symbol,info);
        button.addEventListener('click',()=>{
          if(types[i]==='user'){types[i]='guest'}else{types=types.map(()=> 'guest');types[i]='user'}
          render();
          container.dispatchEvent(new CustomEvent('playertypechange',{detail:{index:i,type:types[i]}}));
        });
        container.appendChild(button);
      });
    }
    setCount(count);
    window.addEventListener('pageshow',render);
    return {
      setCount,
      refresh:render,
      getType:i=>types[i]||'guest',
      getDisplayName:i=>types[i]==='user'?profileName():guestName(i),
      userIndex:()=>types.findIndex(x=>x==='user'),
      snapshot:()=>[...types]
    };
  }
  globalThis.MiniGamePlayerTypes={create};
})();
