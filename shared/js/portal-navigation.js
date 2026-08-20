(() => {
  'use strict';

  const script = document.currentScript;
  const portalRoot = script?.dataset?.portalRoot;
  if (!portalRoot) return;

  function goPortal() {
    location.href = portalRoot;
  }

  function isPortalControl(target) {
    if (!(target instanceof Element)) return false;
    const el = target.closest('a,button');
    if (!el) return false;

    if (el.matches('.portalBack,.portalBackBtn,.backBtn')) return true;
    if (/portal/i.test(el.id || '')) return true;

    const text = (el.textContent || '').trim();
    return /ポータルへ戻る|PORTAL/.test(text);
  }

  document.addEventListener('click', event => {
    if (!isPortalControl(event.target)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    goPortal();
  }, true);
})();
