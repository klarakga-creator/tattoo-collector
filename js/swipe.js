// Swipe down to close: drag a panel down and let go to dismiss it.
// Short or slow drags spring back, so normal scrolling is never mistaken for a close.
(function () {
  'use strict';
  function attach(el, opt) {
    const move = opt.move || el, fade = opt.fade || null;
    let y0 = 0, x0 = 0, t0 = 0, dy = 0, mode = null; // null | 'drag' | 'skip'
    const set = (v, anim) => {
      move.style.transition = anim ? 'transform .22s ease-out' : 'none';
      move.style.transform = v ? 'translateY(' + v + 'px)' : '';
      if (fade) { fade.style.transition = anim ? 'opacity .22s ease-out' : 'none'; fade.style.opacity = v ? String(Math.max(0, 1 - v / 400)) : ''; }
    };
    el.addEventListener('touchstart', (e) => {
      if (e.touches.length !== 1 || (opt.canStart && !opt.canStart(e))) { mode = 'skip'; return; }
      y0 = e.touches[0].clientY; x0 = e.touches[0].clientX; t0 = Date.now(); dy = 0; mode = null;
    }, { passive: true });
    el.addEventListener('touchmove', (e) => {
      if (mode === 'skip' || e.touches.length !== 1) return;
      const d = e.touches[0].clientY - y0, dx = e.touches[0].clientX - x0;
      if (mode === null) {
        if (Math.abs(d) < 6 && Math.abs(dx) < 6) return;
        // Only a downward drag that starts at the top of the content becomes a swipe.
        mode = d > 0 && Math.abs(d) > Math.abs(dx) && (!opt.atTop || opt.atTop()) ? 'drag' : 'skip';
        if (mode === 'skip') return;
        if (document.activeElement && document.activeElement.blur && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) document.activeElement.blur();
      }
      e.preventDefault();
      dy = Math.max(0, d); set(dy, false);
    }, { passive: false });
    const end = () => {
      if (mode !== 'drag') { mode = null; return; }
      mode = null;
      const fast = dy / Math.max(1, Date.now() - t0) > 0.6 && dy > 40;
      if (dy > 110 || fast) {
        set(Math.max(window.innerHeight, dy), true);
        setTimeout(() => { opt.onClose(); set(0, false); }, 200);
      } else set(0, true);
    };
    el.addEventListener('touchend', end); el.addEventListener('touchcancel', end);
  }
  window.SwipeClose = { attach };
})();
