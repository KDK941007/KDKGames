(() => {
  'use strict';
  function esc(value){
    return String(value ?? '').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  }
  function normalize(card){
    return {rank:card?.r ?? card?.rank ?? '', suit:card?.s ?? card?.suit ?? ''};
  }
  function isRedSuit(suit){return suit==='♥'||suit==='♦'}
  function cardHTML(card, options={}){
    const {rank,suit}=normalize(card);
    const back=!!options.back;
    const classes=['playingCard'];
    if(isRedSuit(suit)&&!back)classes.push('red');
    if(back)classes.push('back');
    if(options.className)classes.push(...String(options.className).split(/\s+/).filter(Boolean));
    const attrs=[];
    if(options.dataCard!==undefined&&options.dataCard!==null)attrs.push(`data-card="${esc(options.dataCard)}"`);
    if(options.ariaLabel)attrs.push(`aria-label="${esc(options.ariaLabel)}"`);
    const attrText=attrs.length?' '+attrs.join(' '):'';
    if(back)return `<div class="${classes.join(' ')}"${attrText}></div>`;
    const face=esc(rank+suit);
    return `<div class="${classes.join(' ')}"${attrText}><span>${face}</span><span class="b">${face}</span></div>`;
  }
  globalThis.MiniGamePlayingCards={cardHTML,isRedSuit};
})();
