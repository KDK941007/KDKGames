(() => {
  'use strict';
  function attach(container,target,{min=1,max=2.5}={}){
    if(!container||!target)return {reset(){}};
    let scale=1,startDistance=0,startScale=1,pinching=false;
    const distance=touches=>{
      const dx=touches[0].clientX-touches[1].clientX;
      const dy=touches[0].clientY-touches[1].clientY;
      return Math.hypot(dx,dy);
    };
    const apply=()=>{
      target.style.transform=`scale(${scale})`;
      target.style.transformOrigin='center center';
      container.dataset.zoom=scale.toFixed(2);
    };
    container.addEventListener('touchstart',e=>{
      if(e.touches.length!==2)return;
      pinching=true;
      startDistance=Math.max(1,distance(e.touches));
      startScale=scale;
    },{passive:true});
    container.addEventListener('touchmove',e=>{
      if(!pinching||e.touches.length!==2)return;
      e.preventDefault();
      const ratio=distance(e.touches)/startDistance;
      scale=Math.min(max,Math.max(min,startScale*ratio));
      apply();
    },{passive:false});
    const end=e=>{if(e.touches.length<2)pinching=false};
    container.addEventListener('touchend',end,{passive:true});
    container.addEventListener('touchcancel',end,{passive:true});
    apply();
    return {reset(){scale=1;pinching=false;apply()},getScale(){return scale}};
  }
  globalThis.MiniGamePinchZoom={attach};
})();
