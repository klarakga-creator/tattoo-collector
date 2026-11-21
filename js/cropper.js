// Full-screen photo editor: drag to move, pinch / wheel / slider to zoom, rotate,
// pick a frame shape. Resolves a JPEG Blob of the framed area, or null on cancel.
(function () {
  'use strict';
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

  async function toObjectURL(source) {
    if (source instanceof Blob) return URL.createObjectURL(source);
    // Re-fetch remote photos so the canvas isn't blocked by a cached non-CORS copy.
    const res = await fetch(source, { cache: 'no-store', mode: 'cors' });
    if (!res.ok) throw new Error('Could not load the photo');
    return URL.createObjectURL(await res.blob());
  }

  function open(source) {
    return new Promise(async (resolve) => {
      let url;
      try { url = await toObjectURL(source); } catch (e) { resolve(null); return; }
      const wrap = document.createElement('div');
      wrap.className = 'crop-wrap';
      wrap.setAttribute('role', 'dialog');
      wrap.setAttribute('aria-modal', 'true');
      wrap.setAttribute('aria-label', 'Edit photo');
      wrap.innerHTML =
        '<div class="crop-top"><button type="button" class="btn ghost" data-a="cancel">Cancel</button>' +
        '<h3>Edit photo</h3><button type="button" class="btn primary" data-a="done">Done</button></div>' +
        '<div class="crop-stage"><div class="crop-frame"><img alt="Photo being edited"></div></div>' +
        '<div class="crop-tools">' +
        '<div class="pills small crop-ratios" role="group" aria-label="Frame shape">' +
        '<button type="button" data-r="1" aria-pressed="true">Square</button>' +
        '<button type="button" data-r="0.8" aria-pressed="false">Portrait</button>' +
        '<button type="button" data-r="1.333" aria-pressed="false">Wide</button></div>' +
        '<div class="crop-zoom"><button type="button" class="icon-btn" data-a="out" aria-label="Zoom out">−</button>' +
        '<input type="range" min="1" max="6" step="0.01" value="1" aria-label="Zoom">' +
        '<button type="button" class="icon-btn" data-a="in" aria-label="Zoom in">+</button>' +
        '<button type="button" class="icon-btn" data-a="rot" aria-label="Rotate">⟳</button></div>' +
        '<p class="eyebrow">Drag to move. Pinch or slide to zoom in on the tattoo.</p></div>';
      document.body.appendChild(wrap);
      document.body.classList.add('locked');

      const img = wrap.querySelector('img'), frame = wrap.querySelector('.crop-frame'), stage = wrap.querySelector('.crop-stage');
      const range = wrap.querySelector('input[type=range]');
      // Swipe down on the title bar to cancel (the photo area itself is for moving the photo).
      if (window.SwipeClose) window.SwipeClose.attach(wrap.querySelector('.crop-top'), { move: wrap, onClose: () => finish(null) });
      const st = { z: 1, tx: 0, ty: 0, rot: 0, ratio: 1 };
      let fw = 1, fh = 1, iw = 1, ih = 1;

      const dims = () => (st.rot % 180 ? [ih, iw] : [iw, ih]);
      const base = () => { const d = dims(); return Math.max(fw / d[0], fh / d[1]); };
      function clamp() {
        st.z = Math.min(6, Math.max(1, st.z));
        const d = dims(), s = base() * st.z;
        const mx = Math.max(0, (d[0] * s - fw) / 2), my = Math.max(0, (d[1] * s - fh) / 2);
        st.tx = Math.min(mx, Math.max(-mx, st.tx)); st.ty = Math.min(my, Math.max(-my, st.ty));
      }
      function draw() {
        const s = base() * st.z;
        img.style.width = iw + 'px'; img.style.height = ih + 'px';
        img.style.left = (fw / 2 - iw / 2 + st.tx) + 'px';
        img.style.top = (fh / 2 - ih / 2 + st.ty) + 'px';
        img.style.transform = 'rotate(' + st.rot + 'deg) scale(' + s + ')';
        range.value = st.z;
      }
      function layout() {
        const pad = 20, sw = stage.clientWidth - pad * 2, sh = stage.clientHeight - pad * 2;
        let w = sw, h = w / st.ratio;
        if (h > sh) { h = sh; w = h * st.ratio; }
        fw = Math.max(1, w); fh = Math.max(1, h);
        frame.style.width = fw + 'px'; frame.style.height = fh + 'px';
        clamp(); draw();
      }
      function zoomBy(f) { const old = st.z; st.z = st.z * f; clamp(); const k = st.z / old; st.tx *= k; st.ty *= k; clamp(); draw(); }

      img.onload = () => { iw = img.naturalWidth; ih = img.naturalHeight; layout(); };
      img.src = url;
      const onResize = () => layout();
      window.addEventListener('resize', onResize);

      // Gestures
      const pts = new Map(); let pinch = null;
      stage.addEventListener('pointerdown', (e) => {
        stage.setPointerCapture(e.pointerId);
        pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (pts.size === 2) { const v = Array.from(pts.values()); pinch = { d: dist(v[0], v[1]), z: st.z }; }
      });
      stage.addEventListener('pointermove', (e) => {
        if (!pts.has(e.pointerId)) return;
        const prev = pts.get(e.pointerId), cur = { x: e.clientX, y: e.clientY };
        pts.set(e.pointerId, cur);
        if (pts.size === 1) { st.tx += cur.x - prev.x; st.ty += cur.y - prev.y; clamp(); draw(); }
        else if (pinch && pts.size === 2) {
          const v = Array.from(pts.values());
          zoomBy((pinch.z * dist(v[0], v[1]) / pinch.d) / st.z);
        }
      });
      const up = (e) => { pts.delete(e.pointerId); if (pts.size < 2) pinch = null; };
      stage.addEventListener('pointerup', up); stage.addEventListener('pointercancel', up);
      stage.addEventListener('wheel', (e) => { e.preventDefault(); zoomBy(Math.exp(-e.deltaY * 0.002)); }, { passive: false });
      range.addEventListener('input', () => zoomBy(parseFloat(range.value) / st.z));

      function finish(result) {
        window.removeEventListener('resize', onResize);
        wrap.remove();
        if (!document.querySelector('#sheetWrap:not([hidden])')) document.body.classList.remove('locked');
        URL.revokeObjectURL(url);
        resolve(result);
      }
      function exportBlob() {
        const s = base() * st.z;
        const k = Math.min(1 / s, 2000 / Math.max(fw, fh));
        const c = document.createElement('canvas');
        c.width = Math.round(fw * k); c.height = Math.round(fh * k);
        const ctx = c.getContext('2d');
        ctx.scale(k, k);
        ctx.translate(fw / 2 + st.tx, fh / 2 + st.ty);
        ctx.rotate(st.rot * Math.PI / 180);
        ctx.scale(s, s);
        ctx.drawImage(img, -iw / 2, -ih / 2);
        return new Promise((res) => { try { c.toBlob(res, 'image/jpeg', 0.9); } catch (e) { res(null); } });
      }

      wrap.addEventListener('click', async (e) => {
        const b = e.target.closest('button'); if (!b) return;
        if (b.dataset.r) {
          st.ratio = parseFloat(b.dataset.r);
          wrap.querySelectorAll('[data-r]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
          layout(); return;
        }
        const a = b.dataset.a;
        if (a === 'cancel') finish(null);
        else if (a === 'in') zoomBy(1.25);
        else if (a === 'out') zoomBy(0.8);
        else if (a === 'rot') { st.rot = (st.rot + 90) % 360; clamp(); draw(); }
        else if (a === 'done') { b.disabled = true; b.textContent = 'Saving…'; finish(await exportBlob()); }
      });
      document.addEventListener('keydown', function esc(e) {
        if (e.key === 'Escape' && document.body.contains(wrap)) { document.removeEventListener('keydown', esc); finish(null); }
      });
    });
  }

  window.Cropper = { open };
})();
