(function () {
  'use strict';
  const F = window.Figure;
  const VIEWS = {
    front: { label: 'Front', fig: 'Fig. 1', name: 'Anterior', marks: ['R', 'L'] },
    back: { label: 'Back', fig: 'Fig. 2', name: 'Posterior', marks: ['L', 'R'] },
    left: { label: 'Left side', fig: 'Fig. 3', name: 'Left lateral', marks: ['A', 'P'] },
    right: { label: 'Right side', fig: 'Fig. 4', name: 'Right lateral', marks: ['P', 'A'] }
  };
  // Order matters: first match wins.
  const REGIONS = [
    ['head', 'Head & neck', /head|face|ear|neck|throat|nape|scalp|jaw/i],
    ['hands', 'Hands & wrists', /hand|wrist|finger|palm|knuckle/i],
    ['feet', 'Feet & ankles', /foot|feet|ankle|toe|heel/i],
    ['legs', 'Legs', /thigh|knee|leg|shin|calf/i],
    ['arms', 'Arms', /arm|elbow|bicep|tricep/i],
    ['chest', 'Chest & sternum', /chest|sternum|collar|breast|boob/i],
    ['ribs', 'Ribs & side', /rib|side/i],
    ['stomach', 'Stomach & hips', /stomach|belly|hip|navel|pelvi/i],
    ['back', 'Back & spine', /back|spine|shoulder blade|glute|butt|bum/i],
    ['shoulders', 'Shoulders', /shoulder/i],
    ['anywhere', 'Anywhere', /.^/]
  ];
  const regionOf = (part) => (REGIONS.find((r) => r[2].test(part || '')) || REGIONS[REGIONS.length - 1])[0];
  const regionLabel = (k) => (REGIONS.find((r) => r[0] === k) || REGIONS[REGIONS.length - 1])[1];

  const S = {
    store: null, view: 'front', filter: 'all', region: 'all',
    tattoos: [], inspo: [], urls: {}, selected: null, placing: null, geo: null, loaded: false, zoom: { s: 1, cx: 0, cy: 0 }
  };
  const $ = (s, el) => (el || document).querySelector(s);
  const $$ = (s, el) => Array.from((el || document).querySelectorAll(s));
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const clip = (s, n) => { s = String(s || ''); return s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s; };
  const fmtDate = (d) => { if (!d) return ''; const x = new Date(d + 'T00:00:00'); return isNaN(x) ? d : x.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }); };
  const img = (p) => (p && S.urls[p]) || '';
  const thumbOf = (p) => (p ? p.replace(/\.[a-z]+$/i, '') + '.thumb.jpg' : p);
  const thumb = (p) => (p && (S.urls[thumbOf(p)] || S.urls[p])) || '';
  // Photos are kept on the device after the first view, so they open instantly next time.
  // Each photo has its own path and is never changed in place, so a cached copy is always right.
  const PHOTO_CACHE = 'tc-photos-v1';
  const photoKey = (u) => { try { const x = new URL(u); return x.origin + x.pathname; } catch (e) { return u; } };
  const warmed = new Set();
  async function warmPhotos(urls) {
    if (!('caches' in window) || S.store.demo) return;
    let c; try { c = await caches.open(PHOTO_CACHE); } catch (e) { return; }
    const todo = urls.filter((u) => u && /^https:/.test(u) && !warmed.has(photoKey(u)));
    let i = 0;
    const worker = async () => {
      while (i < todo.length) {
        const u = todo[i++], k = photoKey(u); warmed.add(k);
        try { if (!(await c.match(k))) { const r = await fetch(u, { mode: 'cors', credentials: 'omit' }); if (r.ok) await c.put(k, r); } } catch (e) { warmed.delete(k); }
      }
    };
    await Promise.all([worker(), worker(), worker(), worker()]);
  }
  // Thumbnails first (they show in lists), then the full photos when the phone is idle.
  function warmAll() {
    const paths = S.tattoos.map((r) => r.image_path).concat(S.inspo.map((r) => r.image_path)).filter(Boolean);
    warmPhotos(paths.map((p) => S.urls[thumbOf(p)])).then(() => {
      const go = () => warmPhotos(paths.map((p) => S.urls[p]));
      if (window.requestIdleCallback) requestIdleCallback(go, { timeout: 3000 }); else setTimeout(go, 1500);
    });
  }
  // Drop photos that no longer belong to any tattoo or idea.
  async function prunePhotos() {
    if (!('caches' in window) || S.store.demo) return;
    try {
      const c = await caches.open(PHOTO_CACHE), keep = new Set();
      S.tattoos.concat(S.inspo).forEach((r) => { if (r.image_path) [r.image_path, thumbOf(r.image_path)].forEach((p) => { if (S.urls[p]) keep.add(photoKey(S.urls[p])); }); });
      if (!keep.size) return;
      (await c.keys()).forEach((req) => { if (!keep.has(photoKey(req.url))) c.delete(req); });
    } catch (e) { /* ignore */ }
  }
  // Show the small copy at once, then swap in the full photo as soon as it's ready.
  function progressive(el, small, full) {
    if (!el || !full || small === full) return;
    const pre = new Image(); pre.decoding = 'async';
    pre.onload = () => { if (el.isConnected || el.id === 'lbImg') el.src = full; };
    pre.src = full;
  }
  const CACHE_KEY = 'tc-cache-v1';
  function readCache() { try { return JSON.parse(localStorage.getItem(CACHE_KEY) || 'null'); } catch (e) { return null; } }
  function writeCache() { try { localStorage.setItem(CACHE_KEY, JSON.stringify({ t: S.tattoos, i: S.inspo, at: Date.now() })); } catch (e) { /* storage full or blocked */ } }

  // ---------- boot ----------
  async function boot() {
    const cfg = window.TC_CONFIG || {};
    const configured = cfg.url && cfg.key && !/YOUR_/.test(cfg.url + cfg.key) && window.supabase;
    S.store = configured ? window.Stores.SupabaseStore(cfg) : window.Stores.DemoStore();
    if (S.store.demo) { $('#demoBanner').hidden = false; $('.foot').hidden = true; }
    wireStatic();
    route();
    renderPlate();
    const session = await S.store.session();
    if (!session) return showSignIn();
    startApp();
  }

  function startApp() {
    $('#signin').hidden = true; $('#app').hidden = false;
    S.store.onChange(refresh);
    // Show what we had last time straight away, then refresh in the background.
    const c = !S.store.demo && readCache();
    if (c && c.t) {
      S.tattoos = c.t; S.inspo = c.i || [];
      const paths = S.tattoos.map((r) => r.image_path).concat(S.inspo.map((r) => r.image_path)).filter(Boolean);
      Object.assign(S.urls, S.store.cachedUrls ? S.store.cachedUrls(paths.concat(paths.map(thumbOf))) : {});
      S.loaded = true; renderAll(); warmAll();
    }
    S.store.start();
    refresh();
  }

  function showSignIn() {
    $('#app').hidden = true; $('#signin').hidden = false;
    $('#signinForm').onsubmit = async (e) => {
      e.preventDefault();
      const btn = $('#signinBtn'), err = $('#signinErr');
      btn.disabled = true; btn.textContent = 'Signing in…'; err.hidden = true;
      try {
        await S.store.signIn($('#siEmail').value.trim(), $('#siPass').value);
        startApp();
      } catch (ex) {
        err.textContent = /invalid/i.test(ex.message || '') ? 'That email and password don’t match. Check both and try again.' : (ex.message || 'Could not sign in. Check your connection and try again.');
        err.hidden = false;
      } finally { btn.disabled = false; btn.textContent = 'Sign in'; }
    };
  }

  let refreshing = false, again = false;
  async function refresh() {
    if (refreshing) { again = true; return; }
    refreshing = true;
    try {
      const [t, i] = await Promise.all([S.store.list('tattoos'), S.store.list('inspirations')]);
      S.tattoos = t; S.inspo = i;
      const paths = t.map((r) => r.image_path).concat(i.map((r) => r.image_path)).filter(Boolean);
      Object.assign(S.urls, await S.store.urls(paths.concat(paths.map(thumbOf))));
      S.loaded = true; $('#offline').hidden = true;
      if (!S.store.demo) { writeCache(); warmAll(); clearTimeout(S.pruneT); S.pruneT = setTimeout(prunePhotos, 8000); }
      if (!S.placing) renderAll(); else { renderCounts(); renderList(); renderInspo(); }
    } catch (ex) {
      console.warn(ex);
      $('#offline').hidden = false;
    } finally {
      refreshing = false;
      if (again) { again = false; refresh(); }
    }
  }

  function renderAll() {
    renderCounts(); renderPlate(); renderList(); renderInspo();
  }

  // ---------- static wiring ----------
  function wireStatic() {
    window.addEventListener('hashchange', route);
    $$('#viewSeg button').forEach((b) => b.addEventListener('click', () => setView(b.dataset.view)));
    $$('#filterSeg button').forEach((b) => b.addEventListener('click', () => {
      S.filter = b.dataset.filter;
      $$('#filterSeg button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      renderPlate(); renderList();
    }));
    const newTattoo = () => openTattooForm({ status: 'have', name: '', part: '', artist: '', date: '', notes: '' });
    $('#addTattoo').addEventListener('click', newTattoo);
    $('#navAdd').addEventListener('click', () => {
      if (location.hash === '#inspiration') openInspoForm({ region: S.region === 'all' ? 'anywhere' : S.region, link: '', note: '' });
      else newTattoo();
    });
    $('#addInspo').addEventListener('click', () => openInspoForm({ region: S.region === 'all' ? 'anywhere' : S.region, link: '', note: '' }));
    $('#cancelPlace').addEventListener('click', () => {
      const p = S.placing; stopPlacing();
      if (!p.direct) openTattooForm(p.draft); else openDetail(p.draft.id);
    });
    $('#placeDone').addEventListener('click', finishPlacing);
    $$('.zoom-ctl button').forEach((b) => b.addEventListener('click', (e) => {
      e.stopPropagation();
      const z = b.dataset.z;
      if (z === 'fit') setZoom(1); else setZoom(S.zoom.s * (z === 'in' ? 1.6 : 1 / 1.6), ghostPoint());
    }));
    wirePlateGestures();
    $('#plate').addEventListener('click', onPlateClick);
    $('#signOut').addEventListener('click', async () => { try { localStorage.removeItem(CACHE_KEY); } catch (e) { /* ignore */ } await S.store.signOut(); location.reload(); });
    $('#sheetWrap').addEventListener('click', (e) => { if (e.target.matches('.scrim') || e.target.closest('[data-close]')) closeSheet(); });
    $('#lightbox').addEventListener('click', () => { $('#lightbox').hidden = true; });
    // Swipe down to close the sheets and the photo viewer.
    const sheetEl = $('#sheetBody').closest('.sheet') || $('#sheetBody');
    window.SwipeClose.attach(sheetEl, {
      fade: $('#sheetWrap .scrim'),
      atTop: () => sheetEl.scrollTop <= 0,
      // Leave sliders and scrolled text boxes alone.
      canStart: (e) => { const t = e.target; if (t.closest('input[type=range]')) return false; const ta = t.closest('textarea'); return !(ta && ta.scrollTop > 0); },
      onClose: () => closeSheet()
    });
    window.SwipeClose.attach($('#lightbox'), { move: $('#lbImg'), fade: $('#lightbox'), onClose: () => { $('#lightbox').hidden = true; } });
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      if (!$('#lightbox').hidden) $('#lightbox').hidden = true;
      else if (!$('#sheetWrap').hidden) closeSheet();
      else if (S.placing) $('#cancelPlace').click();
    });
    let rt; window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(renderPlate, 120); });
  }

  function route() {
    const insp = location.hash === '#inspiration';
    $('#page-body').hidden = insp; $('#page-inspo').hidden = !insp;
    $$('.tabs a, .bottom-nav a').forEach((a) => a.setAttribute('aria-current', String((a.getAttribute('href') === '#inspiration') === insp)));
    if (!insp) renderPlate();
  }

  function setView(v) {
    S.view = v;
    $$('#viewSeg button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.view === v)));
    renderPlate();
  }

  // ---------- plate ----------
  const visible = () => S.tattoos.filter((t) => S.filter === 'all' || t.status === S.filter);

  function layoutColumn(items, top, bottom, gap) {
    items.sort((a, b) => a.py - b.py);
    const n = items.length; if (!n) return;
    const g = n > 1 ? Math.min(gap, (bottom - top) / (n - 1)) : gap;
    items.forEach((it) => { it.ly = Math.min(Math.max(it.target, top), bottom); });
    for (let i = 1; i < n; i++) if (items[i].ly < items[i - 1].ly + g) items[i].ly = items[i - 1].ly + g;
    if (items[n - 1].ly > bottom) {
      items[n - 1].ly = bottom;
      for (let i = n - 2; i >= 0; i--) if (items[i].ly > items[i + 1].ly - g) items[i].ly = items[i + 1].ly - g;
    }
  }

  function renderPlate() {
    const svg = $('#plate'); if (!svg) return;
    const narrow = (svg.parentNode.clientWidth || 800) < 600;
    const W = narrow ? 720 : 1040, H = 880, sc = narrow ? 0.9 : 0.98;
    const fw = F.FIG_W * sc, figX = (W - fw) / 2, figY = (H - F.FIG_H * sc) / 2 - 4;
    S.geo = { W, H, sc, figX, figY, narrow };
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);

    const r = 32;
    const items = visible().filter((t) => t.view === S.view).map((t) => ({ t, px: figX + t.x * fw, py: figY + t.y * F.FIG_H * sc }));
    const L = items.filter((i) => i.t.x < 0.5), R = items.filter((i) => i.t.x >= 0.5);
    [L, R].forEach((col) => col.forEach((i) => { i.target = narrow ? i.py - 26 : i.py; }));
    if (narrow) { layoutColumn(L, r + 12, H - r - 70, 118); layoutColumn(R, r + 12, H - r - 70, 118); }
    else { layoutColumn(L, 50, H - 50, 92); layoutColumn(R, 50, H - 50, 92); }

    let lines = '', labels = '', pins = '';
    const place = (it, leftCol) => {
      const t = it.t, sel = S.selected === t.id, planned = t.status === 'planned';
      const cy = it.ly;
      const cx = narrow ? (leftCol ? figX / 2 + 2 : W - figX / 2 - 2) : (leftCol ? figX - 56 : figX + fw + 56);
      const ang = Math.atan2(it.py - cy, it.px - cx);
      const ex = cx + Math.cos(ang) * (r + 5), ey = cy + Math.sin(ang) * (r + 5);
      const cls = (planned ? 'planned' : 'have') + (sel ? ' sel' : '');
      const seg = 'x1="' + it.px.toFixed(1) + '" y1="' + it.py.toFixed(1) + '" x2="' + ex.toFixed(1) + '" y2="' + ey.toFixed(1) + '"';
      lines += '<line class="lead ' + cls + '" ' + seg + '/><line class="lead-in ' + cls + '" clip-path="url(#onBody)" ' + seg + '/>';
      pins += '<g class="pin ' + cls + '" data-id="' + esc(t.id) + '"><circle class="hitarea" cx="' + it.px.toFixed(1) + '" cy="' + it.py.toFixed(1) + '" r="20"/>' +
        '<circle class="dot" cx="' + it.px.toFixed(1) + '" cy="' + it.py.toFixed(1) + '" r="' + (sel ? 11 : 8.5) + '"/></g>';
      const u = thumb(t.image_path);
      const thumbEl = u
        ? '<image href="' + esc(u) + '" x="' + (cx - r) + '" y="' + (cy - r) + '" width="' + 2 * r + '" height="' + 2 * r + '" preserveAspectRatio="xMidYMid slice" clip-path="url(#circ)"/>'
        : '<text class="initial" x="' + cx + '" y="' + (cy + 11) + '" text-anchor="middle">' + esc((t.name || '?').trim().charAt(0).toUpperCase()) + '</text>';
      let text;
      if (narrow) {
        const mw = figX - 12;
        text = '<text class="lb-name fit" data-max="' + mw + '" x="' + cx + '" y="' + (cy + r + 32) + '" text-anchor="middle">' + esc((t.name || 'Untitled').toUpperCase()) + '</text>' +
          '<text class="lb-part fit" data-max="' + mw + '" x="' + cx + '" y="' + (cy + r + 56) + '" text-anchor="middle">' + esc(t.part || '') + '</text>';
      } else {
        const tx = leftCol ? cx - r - 14 : cx + r + 14, anchor = leftCol ? 'end' : 'start';
        const mw = (leftCol ? tx : W - tx) - 18;
        text = '<text class="lb-name fit" data-max="' + mw + '" x="' + tx + '" y="' + (cy + 2) + '" text-anchor="' + anchor + '">' + esc((t.name || 'Untitled').toUpperCase()) + '</text>' +
          '<text class="lb-part fit" data-max="' + mw + '" x="' + tx + '" y="' + (cy + 26) + '" text-anchor="' + anchor + '">' + esc(t.part || '') + '</text>';
      }
      labels += '<g class="label ' + cls + '" data-id="' + esc(t.id) + '" tabindex="0" role="button" aria-label="' + esc((t.name || 'Untitled') + ', ' + (t.part || '')) + '">' +
        '<rect class="hitarea" x="' + (narrow ? cx - 100 : (leftCol ? cx - 250 : cx - r - 6)) + '" y="' + (cy - r - 6) + '" width="' + (narrow ? 200 : 256) + '" height="' + (narrow ? 2 * r + 76 : 2 * r + 12) + '"/>' +
        '<circle class="thumb-bg" cx="' + cx + '" cy="' + cy + '" r="' + r + '"/>' + thumbEl +
        '<circle class="thumb-ring" cx="' + cx + '" cy="' + cy + '" r="' + r + '"/>' + text + '</g>';
    };
    L.forEach((i) => place(i, true)); R.forEach((i) => place(i, false));

    let ghost = '';
    const d = S.placing && S.placing.draft;
    if (S.placing) {
      lines = ''; labels = '';
      pins = pins.replace(/class="pin /g, 'class="pin faded ');
      if (S.placing.direct) pins = pins.replace(new RegExp('<g class="pin faded [^"]*" data-id="' + esc(d.id) + '">.*?</g>'), '');
    }
    if (d && d.view === S.view && d.x != null) {
      const gr = 12 / Math.sqrt(S.zoom.s);
      ghost = '<g class="ghost-pin"><circle class="ghost-halo" cx="' + (figX + d.x * fw).toFixed(1) + '" cy="' + (figY + d.y * F.FIG_H * sc).toFixed(1) + '" r="' + (gr * 2.4).toFixed(1) + '"/>' +
        '<circle class="ghost" cx="' + (figX + d.x * fw).toFixed(1) + '" cy="' + (figY + d.y * F.FIG_H * sc).toFixed(1) + '" r="' + gr.toFixed(1) + '"/></g>';
    }

    const figT = 'translate(' + figX.toFixed(1) + ' ' + figY.toFixed(1) + ') scale(' + sc + ')' + (S.view === 'left' ? ' translate(' + F.FIG_W + ' 0) scale(-1 1)' : '');
    const clipBody = F.clipPaths(S.view).map((p) => '<path transform="' + figT + '" d="' + p + '"/>').join('');

    const m = VIEWS[S.view].marks;
    const marks = '<text class="orient" x="' + (figX - 4) + '" y="' + (figY + 70) + '" text-anchor="end">' + m[0] + '</text>' +
      '<text class="orient" x="' + (figX + fw + 4) + '" y="' + (figY + 70) + '">' + m[1] + '</text>';
    const empty = !items.length && S.loaded
      ? '<text class="empty-note" x="' + W / 2 + '" y="' + (H - 12) + '" text-anchor="middle">' +
        (S.tattoos.length ? 'NOTHING ON THIS SIDE YET' : 'TAP + TO ADD YOUR FIRST TATTOO') + '</text>'
      : '';

    svg.innerHTML =
      '<defs><clipPath id="circ" clipPathUnits="objectBoundingBox"><circle cx=".5" cy=".5" r=".5"/></clipPath>' +
      '<clipPath id="onBody">' + clipBody + '</clipPath></defs>' +
      '<g class="fig" transform="translate(' + figX.toFixed(1) + ' ' + figY.toFixed(1) + ') scale(' + sc + ')">' + F.markup(S.view) + '</g>' +
      marks + lines + pins + labels + ghost + (S.placing ? '' : empty);
    fitLabels(svg);
    applyZoom();

    const v = VIEWS[S.view];
    const here = items.length, planned = items.filter((i) => i.t.status === 'planned').length;
    const plate = $('.plate');
    plate.className = 'plate v-' + S.view + (S.placing ? ' placing' : '');
    $('#viewFig').textContent = v.fig + ' · ' + v.name;
    $('#viewTitle').textContent = v.label;
    $('#viewCount').textContent = S.loaded ? here + (here === 1 ? ' piece' : ' pieces') + (planned ? ' · ' + planned + ' planned' : '') : 'Loading…';
  }

  function svgPoint(e) {
    const svg = $('#plate'), pt = svg.createSVGPoint();
    pt.x = e.clientX; pt.y = e.clientY;
    return pt.matrixTransform(svg.getScreenCTM().inverse());
  }

  function onPlateClick(e) {
    if (S.placing) return; // placing uses pointer gestures below
    const g = e.target.closest('[data-id]');
    if (g) openDetail(g.dataset.id);
  }
  $('#plate') && $('#plate').addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.closest('[data-id]')) { e.preventDefault(); openDetail(e.target.closest('[data-id]').dataset.id); }
  });

  // ---- zoom (only while placing a pin) ----
  function applyZoom() {
    const svg = $('#plate'), g = S.geo; if (!svg || !g) return;
    const z = S.zoom;
    if (!S.placing || z.s <= 1.001) { svg.setAttribute('viewBox', '0 0 ' + g.W + ' ' + g.H); return; }
    const w = g.W / z.s, h = g.H / z.s;
    z.cx = Math.min(g.W - w / 2, Math.max(w / 2, z.cx));
    z.cy = Math.min(g.H - h / 2, Math.max(h / 2, z.cy));
    svg.setAttribute('viewBox', (z.cx - w / 2).toFixed(1) + ' ' + (z.cy - h / 2).toFixed(1) + ' ' + w.toFixed(1) + ' ' + h.toFixed(1));
  }
  function setZoom(s, focus) {
    const g = S.geo, z = S.zoom, old = z.s;
    z.s = Math.min(6, Math.max(1, s));
    if (z.s <= 1.001) { z.cx = g.W / 2; z.cy = g.H / 2; }
    else if (focus) { const k = old / z.s; z.cx = focus.x + (z.cx - focus.x) * k; z.cy = focus.y + (z.cy - focus.y) * k; }
    renderPlate(); // ghost size depends on zoom
  }
  function ghostPoint() {
    const d = S.placing && S.placing.draft, g = S.geo;
    if (!d || d.x == null || d.view !== S.view) return null;
    return { x: g.figX + d.x * F.FIG_W * g.sc, y: g.figY + d.y * F.FIG_H * g.sc };
  }

  // Put the pin at a screen point. Returns false when the point is off the body.
  function placeAtPoint(p, quiet) {
    const g = S.geo;
    const fx = (p.x - g.figX) / g.sc, fy = (p.y - g.figY) / g.sc;
    if (fx < 0 || fx > F.FIG_W || fy < 0 || fy > F.FIG_H) { if (!quiet) toast('Tap on the body itself'); return false; }
    const hx = S.view === 'left' ? F.FIG_W - fx : fx;
    const a = F.hit('bodyPath', hx, fy), b = F.hit('armPath', hx, fy);
    if (a === false && b !== true) { if (!quiet) toast('Tap on the body itself'); return false; }
    const d = S.placing.draft;
    d.view = S.view; d.x = +(fx / F.FIG_W).toFixed(4); d.y = +(fy / F.FIG_H).toFixed(4);
    if (!d.part || d.partAuto) { d.part = F.guessPart(S.view, fx, fy); d.partAuto = true; }
    updatePlaceBanner();
    return true;
  }

  function wirePlateGestures() {
    const svg = $('#plate');
    const pts = new Map(); let pinch = null, downAt = null, moved = false, dragPin = false;
    const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
    const toSvg = (cx, cy) => svgPoint({ clientX: cx, clientY: cy });
    svg.addEventListener('pointerdown', (e) => {
      if (!S.placing) return;
      e.preventDefault();
      try { svg.setPointerCapture(e.pointerId); } catch (x) { /* ignore */ }
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 1) {
        downAt = { x: e.clientX, y: e.clientY }; moved = false; dragPin = false;
        // Start dragging if the finger lands on (or near) the pin.
        const gp = ghostPoint();
        if (gp) {
          const ctm = svg.getScreenCTM();
          const sx = gp.x * ctm.a + ctm.e, sy = gp.y * ctm.d + ctm.f;
          if (Math.hypot(sx - e.clientX, sy - e.clientY) < 34) dragPin = true;
        }
      } else if (pts.size === 2) {
        const v = Array.from(pts.values()); pinch = { d: dist(v[0], v[1]), s: S.zoom.s }; moved = true; dragPin = false;
      }
    });
    svg.addEventListener('pointermove', (e) => {
      if (!S.placing || !pts.has(e.pointerId)) return;
      const prev = pts.get(e.pointerId), cur = { x: e.clientX, y: e.clientY };
      pts.set(e.pointerId, cur);
      if (pts.size === 1) {
        if (Math.hypot(cur.x - downAt.x, cur.y - downAt.y) > 6) moved = true;
        if (!moved) return;
        if (dragPin) { if (placeAtPoint(toSvg(cur.x, cur.y), true)) renderPlate(); }
        else if (S.zoom.s > 1) {
          const k = (S.geo.W / S.zoom.s) / svg.clientWidth;
          S.zoom.cx -= (cur.x - prev.x) * k; S.zoom.cy -= (cur.y - prev.y) * k; applyZoom();
        }
      } else if (pinch && pts.size === 2) {
        const v = Array.from(pts.values());
        const mid = toSvg((v[0].x + v[1].x) / 2, (v[0].y + v[1].y) / 2);
        const want = pinch.s * dist(v[0], v[1]) / pinch.d;
        if (Math.abs(want - S.zoom.s) > 0.02) setZoom(want, mid);
      }
    });
    const up = (e) => {
      if (!S.placing) { pts.clear(); return; }
      if (pts.size === 1 && pts.has(e.pointerId) && !moved && e.type === 'pointerup') {
        const p = toSvg(e.clientX, e.clientY);
        const first = S.placing.draft.x == null || S.placing.draft.view !== S.view;
        if (placeAtPoint(p)) {
          // First tap: zoom in around it so the next taps can fine-tune.
          if (first && S.zoom.s < 1.5) setZoom(2.6, p); else renderPlate();
        }
      } else if (dragPin && moved) toast('Pin moved');
      pts.delete(e.pointerId);
      if (pts.size < 2) pinch = null;
    };
    svg.addEventListener('pointerup', up);
    svg.addEventListener('pointercancel', up);
    svg.addEventListener('wheel', (e) => {
      if (!S.placing) return;
      e.preventDefault();
      setZoom(S.zoom.s * Math.exp(-e.deltaY * 0.0025), svgPoint(e));
    }, { passive: false });
  }

  function updatePlaceBanner() {
    const d = S.placing && S.placing.draft; if (!d) return;
    const placed = d.x != null;
    $('#placeMsg').textContent = placed
      ? (d.part ? d.part + '. ' : '') + 'Drag the pin or tap to move it. Pinch or use + to zoom.'
      : 'Tap the body where it goes. Pinch or use + to zoom. Switch views first if you need to.';
    $('#placeDone').disabled = !placed;
  }

  function startPlacing(d, direct) {
    S.placing = { draft: d, direct: !!direct };
    S.zoom = { s: 1, cx: S.geo ? S.geo.W / 2 : 0, cy: S.geo ? S.geo.H / 2 : 0 };
    closeSheet(true);
    if (d.view && d.view !== S.view) setView(d.view);
    $('#placeBanner').hidden = false;
    document.body.classList.add('placing');
    updatePlaceBanner();
    renderPlate();
    // Start zoomed in on an existing pin so it's easy to nudge.
    const gp = ghostPoint(); if (gp) setZoom(2.2, gp);
    window.scrollTo(0, 0);
  }
  function stopPlacing() {
    S.placing = null; S.zoom = { s: 1, cx: 0, cy: 0 };
    $('#placeBanner').hidden = true; document.body.classList.remove('placing');
    renderPlate();
  }
  async function finishPlacing() {
    const p = S.placing; if (!p || p.draft.x == null) return;
    const d = p.draft;
    if (!p.direct) { stopPlacing(); openTattooForm(d); return; }
    // Moving an existing pin: save straight away.
    const btn = $('#placeDone'); btn.disabled = true; btn.textContent = 'Saving…';
    try {
      await S.store.save('tattoos', { id: d.id, view: d.view, x: d.x, y: d.y, part: d.part });
      stopPlacing(); await refresh(); setView(d.view); toast('Pin moved');
    } catch (ex) { toast('Couldn’t save the new spot. Check your connection and try again.'); }
    finally { btn.disabled = false; btn.textContent = 'Done'; }
  }

  // ---------- counts & list ----------
  function renderCounts() {
    const have = S.tattoos.filter((t) => t.status !== 'planned').length, planned = S.tattoos.length - have;
    $('#cAll').textContent = S.tattoos.length; $('#cHave').textContent = have; $('#cPlanned').textContent = planned;
    $$('#viewSeg button').forEach((b) => {
      const n = visible().filter((t) => t.view === b.dataset.view).length;
      b.querySelector('.n').textContent = n ? n : '';
    });
  }

  function renderList() {
    renderCounts();
    const list = visible().slice().sort((a, b) => (a.status === 'planned') - (b.status === 'planned'));
    $('#listCount').textContent = list.length ? list.length + (list.length === 1 ? ' piece' : ' pieces') : '';
    if (!list.length) {
      $('#list').innerHTML = '<p class="empty-card">' + (S.loaded ? (S.tattoos.length ? 'Nothing matches this filter.' : 'Your collection is empty. Tap + to add your first tattoo and it shows up here and on the body.') : 'Loading your collection…') + '</p>';
      return;
    }
    const tones = ['coral', 'ink', 'mustard', 'violet', 'mint'];
    $('#list').innerHTML = list.map((t, k) => {
      const u = thumb(t.image_path), planned = t.status === 'planned';
      return '<button class="card tone-' + tones[k % tones.length] + '" data-open="' + esc(t.id) + '">' +
        '<span class="card-top">' +
        (u ? '<img src="' + esc(u) + '" alt="" decoding="async">' : '<span class="noimg">' + esc((t.name || '?').charAt(0).toUpperCase()) + '</span>') +
        '<span class="card-name">' + esc(t.name || 'Untitled') + '</span>' +
        '<span class="arrow" aria-hidden="true">↗</span></span>' +
        '<span class="card-tags"><span class="tag-pill"><i class="dot ' + (planned ? 'planned' : 'have') + '"></i>' + (planned ? 'Planned' : 'Inked') + '</span>' +
        (t.part ? '<span class="tag-pill">' + esc(t.part) + '</span>' : '') +
        '<span class="tag-pill">' + VIEWS[t.view].label + '</span></span></button>';
    }).join('');
    $$('#list [data-open]').forEach((b) => b.addEventListener('click', () => {
      const t = S.tattoos.find((x) => x.id === b.dataset.open);
      setView(t.view);
      if (window.innerWidth < 900) $('.plate').scrollIntoView({ behavior: 'smooth', block: 'start' });
      openDetail(t.id);
    }));
  }

  // ---------- sheet ----------
  function openSheet(html) {
    $('#sheetBody').innerHTML = html;
    $('#sheetWrap').hidden = false;
    document.body.classList.add('locked');
    $('#sheetBody').scrollTop = 0;
  }
  function closeSheet(keep) {
    $('#sheetWrap').hidden = true;
    document.body.classList.remove('locked');
    if (!keep && S.selected) { S.selected = null; renderPlate(); }
  }

  // ---------- detail ----------
  function openDetail(id) {
    const t = S.tattoos.find((x) => x.id === id); if (!t) return;
    S.selected = id; renderPlate();
    const u = img(t.image_path), sm = thumb(t.image_path) || u, reg = regionOf(t.part), ideas = S.inspo.filter((i) => i.region === reg).length;
    const pain = t.status !== 'planned' && t.pain ? t.pain + ' / 10' : '';
    const facts = [['Artist', t.artist], ['Studio', t.studio], ['Price', t.status !== 'planned' ? t.price : ''], ['Pain', pain], [t.status === 'planned' ? 'Target date' : 'Date', fmtDate(t.date)], ['Notes', t.notes]].filter((f) => f[1]);
    openSheet(
      '<div class="sheet-head"><span class="tag-pill"><i class="dot ' + (t.status === 'planned' ? 'planned' : 'have') + '"></i>' + (t.status === 'planned' ? 'Planned' : 'Inked') + '</span>' +
      '<button class="icon-btn" data-close aria-label="Close">✕</button></div>' +
      (u ? '<button class="detail-img" id="dImg" aria-label="Show full photo"><img src="' + esc(sm) + '" alt="' + esc(t.name) + '" decoding="async"></button>' : '<div class="detail-noimg">No photo yet. Edit to add one.</div>') +
      '<h3 class="detail-name">' + esc(t.name || 'Untitled') + '</h3>' +
      '<div class="card-tags"><span class="tag-pill">' + esc(t.part || 'No body part set') + '</span><span class="tag-pill">' + VIEWS[t.view].label + ' view</span></div>' +
      (facts.length ? '<dl class="facts">' + facts.map((f) => '<div><dt>' + f[0] + '</dt><dd>' + esc(f[1]) + (f[0] === 'Pain' ? painBar(t.pain) : '') + '</dd></div>').join('') + '</dl>' : '') +
      '<button class="link-btn" id="dIdeas">' + (ideas ? ideas + ' inspiration ' + (ideas === 1 ? 'idea' : 'ideas') : 'Inspiration') + ' for ' + regionLabel(reg).toLowerCase() + ' →</button>' +
      '<div class="form-actions"><button class="btn danger" id="dDel">Delete</button><span class="grow"></span><button class="btn" id="dMove">Move pin</button><button class="btn primary" id="dEdit">Edit</button></div>'
    );
    if (u) { progressive($('#dImg img'), sm, u); $('#dImg').addEventListener('click', () => lightbox(u, $('#dImg img').src)); }
    $('#dIdeas').addEventListener('click', () => { closeSheet(); S.region = reg; location.hash = '#inspiration'; renderInspo(); });
    $('#dEdit').addEventListener('click', () => openTattooForm(Object.assign({}, t)));
    $('#dMove').addEventListener('click', () => startPlacing(Object.assign({}, t), true));
    confirmButton($('#dDel'), 'Tap again to delete', async () => {
      try {
        await S.store.remove('tattoos', t.id);
        if (t.image_path) S.store.removeImage(t.image_path, thumbOf(t.image_path)).catch(() => {});
        S.tattoos = S.tattoos.filter((x) => x.id !== t.id);
        closeSheet(); renderAll(); toast('Deleted “' + (t.name || 'Untitled') + '”');
      } catch (ex) { toast('Could not delete. Check your connection and try again.'); }
    });
  }

  function confirmButton(btn, armedText, action) {
    const orig = btn.textContent; let armed = false, tm;
    btn.addEventListener('click', () => {
      if (!armed) { armed = true; btn.textContent = armedText; btn.classList.add('armed'); tm = setTimeout(() => { armed = false; btn.textContent = orig; btn.classList.remove('armed'); }, 3500); return; }
      clearTimeout(tm); btn.disabled = true; action();
    });
  }

  function lightbox(u, small) { const el = $('#lbImg'); el.src = small || u; $('#lightbox').hidden = false; progressive(el, small, u); }

  // ---------- image prep ----------
  async function prepareImage(file) {
    const draw = (src, w, h) => {
      const s = Math.min(1, 2000 / Math.max(w, h));
      const c = document.createElement('canvas'); c.width = Math.round(w * s); c.height = Math.round(h * s);
      c.getContext('2d').drawImage(src, 0, 0, c.width, c.height);
      return new Promise((res) => c.toBlob(res, 'image/jpeg', 0.86));
    };
    try { const b = await createImageBitmap(file); const out = await draw(b, b.width, b.height); if (out) return out; } catch (e) { /* fall through */ }
    try {
      const url = URL.createObjectURL(file);
      const el = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
      const out = await draw(el, el.naturalWidth, el.naturalHeight); if (out) return out;
    } catch (e) { /* fall through */ }
    if (/^image\/(png|jpeg|gif|webp)$/.test(file.type)) return file;
    throw new Error('This photo format can’t be read here. Try a JPEG or PNG.');
  }

  // ---------- tattoo form ----------
  const PARTS = ['Head', 'Behind the ear', 'Neck', 'Nape', 'Throat', 'Collarbone', 'Shoulder', 'Chest', 'Sternum', 'Underboob', 'Ribs', 'Side', 'Stomach', 'Lower stomach', 'Hip', 'Upper back', 'Shoulder blade', 'Spine', 'Mid back', 'Lower back', 'Glute', 'Upper arm', 'Inner arm', 'Elbow', 'Forearm', 'Wrist', 'Hand', 'Finger', 'Thigh', 'Back of thigh', 'Knee', 'Back of knee', 'Shin', 'Calf', 'Ankle', 'Foot'];

  function openTattooForm(d) {
    const u = d._preview || img(d.image_path);
    openSheet(
      '<div class="sheet-head"><h3>' + (d.id ? 'Edit tattoo' : 'Add a tattoo') + '</h3><button class="icon-btn" data-close aria-label="Close">✕</button></div>' +
      '<form id="tForm" class="form" novalidate>' +
      '<div id="tPhotoBox">' + photoBlock(u, 'tPhoto', 'Add a photo') + '</div>' +
      '<input type="file" id="tPhoto" accept="image/*" class="visually-hidden">' +
      '<div class="field"><label for="tName">Name</label><input id="tName" maxlength="80" autocomplete="off" placeholder="e.g. Fine-line peony" value="' + esc(d.name) + '"></div>' +
      '<fieldset class="field"><legend>Status</legend><div class="radio-seg">' +
      '<label><input type="radio" name="tStatus" value="have"' + (d.status !== 'planned' ? ' checked' : '') + '><span>I have it</span></label>' +
      '<label><input type="radio" name="tStatus" value="planned"' + (d.status === 'planned' ? ' checked' : '') + '><span>Planned</span></label></div></fieldset>' +
      '<div class="field"><span class="lbl">Placement</span><div class="place-row"><span class="place-text">' +
      (d.x != null ? 'Pinned on the ' + VIEWS[d.view].label.toLowerCase() + ' view' : 'Not placed yet') + '</span>' +
      '<button type="button" class="btn" id="placeBtn">' + (d.x != null ? 'Move pin' : 'Place on body') + '</button></div></div>' +
      '<div class="field"><label for="tPart">Body part</label><input id="tPart" list="partList" maxlength="60" autocomplete="off" placeholder="Filled in when you place it" value="' + esc(d.part) + '">' +
      '<datalist id="partList">' + PARTS.map((p) => '<option value="' + p + '">').join('') + '</datalist></div>' +
      '<div class="field"><label for="tArtist">Artist</label><input id="tArtist" maxlength="80" autocomplete="off" placeholder="Who tattooed it" value="' + esc(d.artist) + '"></div>' +
      '<div class="field"><label for="tStudio">Studio</label><input id="tStudio" maxlength="80" autocomplete="off" placeholder="Where" value="' + esc(d.studio) + '"></div>' +
      '<div id="tInked"' + (d.status === 'planned' ? ' hidden' : '') + '>' +
      '<div class="field"><label for="tPrice">Price</label><input id="tPrice" maxlength="40" autocomplete="off" inputmode="text" placeholder="e.g. R2 500 or €350" value="' + esc(d.price) + '"></div>' +
      '<fieldset class="field"><legend>Pain <span class="pain-val" id="tPainVal">' + (d.pain ? d.pain + ' / 10' : 'tap 1 to 10') + '</span></legend>' +
      '<div class="pain-scale" role="group" aria-label="Pain out of 10">' +
      [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => '<button type="button" data-pain="' + n + '" aria-pressed="' + (d.pain === n) + '" class="' + (d.pain && n <= d.pain ? 'on' : '') + '">' + n + '</button>').join('') +
      '</div></fieldset></div>' +
      '<div class="field"><label for="tDate">' + (d.status === 'planned' ? 'Target date' : 'Date') + '</label><input id="tDate" type="date" value="' + esc(d.date || '') + '"></div>' +
      '<div class="field"><label for="tNotes">Notes</label><textarea id="tNotes" rows="3" placeholder="Meaning, size, healing…">' + esc(d.notes) + '</textarea></div>' +
      '<p class="form-err" id="tErr" hidden></p>' +
      '<div class="form-actions"><button type="button" class="btn ghost" data-close>Cancel</button><span class="grow"></span><button type="submit" class="btn primary" id="tSave">Save tattoo</button></div>' +
      '</form>'
    );
    const collect = () => {
      d.name = $('#tName').value.trim();
      d.status = ($('input[name=tStatus]:checked') || {}).value || 'have';
      d.artist = $('#tArtist').value.trim(); d.studio = $('#tStudio').value.trim(); d.price = $('#tPrice').value.trim(); d.date = $('#tDate').value; d.notes = $('#tNotes').value.trim();
      d.part = $('#tPart').value.trim();
    };
    $('#tPart').addEventListener('input', () => { d.partAuto = false; });
    // Price and pain only apply to tattoos she already has.
    document.querySelectorAll('input[name=tStatus]').forEach((r) => r.addEventListener('change', () => {
      const planned = ($('input[name=tStatus]:checked') || {}).value === 'planned';
      $('#tInked').hidden = planned;
      $('label[for=tDate]').textContent = planned ? 'Target date' : 'Date';
    }));
    $('.pain-scale').addEventListener('click', (e) => {
      const b = e.target.closest('[data-pain]'); if (!b) return;
      const n = parseInt(b.dataset.pain, 10);
      d.pain = d.pain === n ? null : n;
      $('.pain-scale').querySelectorAll('[data-pain]').forEach((x) => {
        const v = parseInt(x.dataset.pain, 10);
        x.setAttribute('aria-pressed', String(v === d.pain)); x.classList.toggle('on', !!d.pain && v <= d.pain);
      });
      $('#tPainVal').textContent = d.pain ? d.pain + ' / 10' : 'tap 1 to 10';
    });
    const showPhoto = () => { $('#tPhotoBox').innerHTML = photoBlock(d._preview || img(d.image_path), 'tPhoto', 'Add a photo'); wireCrop(); };
    const cropFrom = async (src) => {
      const out = await window.Cropper.open(src);
      if (out) { d._file = out; d._ready = true; d._preview = URL.createObjectURL(out); showPhoto(); }
      else if (!(src instanceof Blob)) toast('Couldn’t open that photo for editing');
    };
    const wireCrop = () => { const b = $('#tPhotoBox [data-crop]'); if (b) b.addEventListener('click', () => cropFrom(d._file || img(d.image_path))); };
    wireCrop();
    $('#tPhoto').addEventListener('change', async (e) => {
      const f = e.target.files[0]; e.target.value = ''; if (!f) return;
      let full;
      try { full = await prepareImage(f); } catch (ex) { toast(ex.message); return; }
      d._file = full; d._ready = true; d._preview = URL.createObjectURL(full); showPhoto();
      cropFrom(full);
    });
    $('#placeBtn').addEventListener('click', () => { collect(); startPlacing(d); });
    $('#tForm').addEventListener('submit', async (e) => {
      e.preventDefault(); collect();
      const err = $('#tErr');
      if (d.x == null) { err.textContent = 'Place it on the body first, so it shows on the figure.'; err.hidden = false; return; }
      const btn = $('#tSave'); btn.disabled = true; btn.textContent = 'Saving…'; err.hidden = true;
      try {
        let path = d.image_path || null, old = null;
        if (d._file) { btn.textContent = 'Uploading photo…'; path = await uploadPhoto(d._ready ? d._file : await prepareImage(d._file)); old = d.image_path; }
        const row = { name: d.name || 'Untitled', status: d.status, view: d.view, x: d.x, y: d.y, part: d.part, artist: d.artist, studio: d.studio || '', price: d.status === 'planned' ? '' : (d.price || ''), pain: d.status === 'planned' ? null : (d.pain || null), date: d.date || null, notes: d.notes, image_path: path };
        if (d.id) row.id = d.id;
        const saved = await saveTattooRow(row);
        if (old && old !== path) S.store.removeImage(old, thumbOf(old)).catch(() => {});
        closeSheet(true);
        await refresh();
        if (saved && saved.id) { setView(saved.view); openDetail(saved.id); }
        toast('Saved');
      } catch (ex) {
        console.warn(ex);
        err.textContent = (ex && ex.message) ? 'Couldn’t save: ' + ex.message : 'Couldn’t save. Check your connection and try again.';
        err.hidden = false; btn.disabled = false; btn.textContent = 'Save tattoo';
      }
    });
  }

  // ---------- inspiration ----------
  function renderInspo() {
    const counts = {}; S.inspo.forEach((i) => { counts[i.region] = (counts[i.region] || 0) + 1; });
    const chip = (k, label, n) => '<button class="chip" data-region="' + k + '" aria-pressed="' + (S.region === k) + '">' + esc(label) + (n ? '<span class="n">' + n + '</span>' : '') + '</button>';
    $('#regionChips').innerHTML = chip('all', 'All', S.inspo.length) + REGIONS.map((r) => chip(r[0], r[1], counts[r[0]] || 0)).join('');
    $$('#regionChips .chip').forEach((b) => b.addEventListener('click', () => { S.region = b.dataset.region; renderInspo(); }));
    const items = S.inspo.filter((i) => S.region === 'all' || i.region === S.region).slice().reverse();
    if (!items.length) {
      $('#inspoGrid').innerHTML = '<div class="inspo-empty"><p>' + (S.loaded ? 'No inspiration saved' + (S.region === 'all' ? ' yet' : ' for ' + regionLabel(S.region).toLowerCase() + ' yet') + '.' : 'Loading…') + '</p><p class="muted">Save screenshots, flash sheets or artist links, sorted by where on your body you picture them.</p></div>';
      return;
    }
    $('#inspoGrid').innerHTML = items.map((i) => {
      const u = thumb(i.image_path);
      let host = ''; try { host = i.link ? new URL(i.link).hostname.replace(/^www\./, '') : ''; } catch (e) { host = ''; }
      return '<article class="inspo-card">' +
        (u ? '<button class="inspo-img" data-lb="' + esc(i.id) + '" aria-label="Show full image"><img src="' + esc(u) + '" alt="" decoding="async"></button>' : '') +
        '<div class="inspo-body"><span class="tag">' + esc(regionLabel(i.region)) + '</span>' +
        (i.note ? '<p>' + esc(i.note) + '</p>' : '') +
        (host ? '<a href="' + esc(i.link) + '" target="_blank" rel="noopener">' + esc(host) + ' ↗</a>' : '') +
        '<button class="mini" data-edit="' + esc(i.id) + '">Edit</button></div></article>';
    }).join('');
    $$('#inspoGrid [data-lb]').forEach((b) => b.addEventListener('click', () => { const p = S.inspo.find((x) => x.id === b.dataset.lb).image_path; lightbox(img(p), thumb(p)); }));
    $$('#inspoGrid [data-edit]').forEach((b) => b.addEventListener('click', () => openInspoForm(Object.assign({}, S.inspo.find((x) => x.id === b.dataset.edit)))));
  }

  function openInspoForm(d) {
    const u = img(d.image_path);
    openSheet(
      '<div class="sheet-head"><h3>' + (d.id ? 'Edit inspiration' : 'Save inspiration') + '</h3><button class="icon-btn" data-close aria-label="Close">✕</button></div>' +
      '<form id="iForm" class="form" novalidate>' +
      '<label class="photo-drop' + (u ? ' has' : '') + '" for="iPhoto">' + (u ? '<img src="' + esc(u) + '" alt="">' : '') + '<span>' + (u ? 'Change image' : (d.id ? 'Add an image' : 'Add images (you can pick several)')) + '</span></label>' +
      '<input type="file" id="iPhoto" accept="image/*" class="visually-hidden"' + (d.id ? '' : ' multiple') + '>' +
      '<div class="field"><label for="iRegion">Body part</label><select id="iRegion">' + REGIONS.map((r) => '<option value="' + r[0] + '"' + (r[0] === d.region ? ' selected' : '') + '>' + r[1] + '</option>').join('') + '</select></div>' +
      '<div class="field"><label for="iLink">Link (optional)</label><input id="iLink" type="url" inputmode="url" placeholder="https://instagram.com/…" value="' + esc(d.link) + '"></div>' +
      '<div class="field"><label for="iNote">Note</label><textarea id="iNote" rows="3" placeholder="What you like about it">' + esc(d.note) + '</textarea></div>' +
      '<p class="form-err" id="iErr" hidden></p>' +
      '<div class="form-actions">' + (d.id ? '<button type="button" class="btn danger" id="iDel">Delete</button>' : '<button type="button" class="btn ghost" data-close>Cancel</button>') +
      '<span class="grow"></span><button type="submit" class="btn primary" id="iSave">Save</button></div></form>'
    );
    let files = [];
    $('#iPhoto').addEventListener('change', (e) => {
      files = Array.from(e.target.files || []); if (!files.length) return;
      const lab = $('.photo-drop'); lab.classList.add('has');
      lab.innerHTML = '<img src="' + URL.createObjectURL(files[0]) + '" alt=""><span>' + (files.length > 1 ? files.length + ' images selected' : 'Change image') + '</span>';
      if (files.length === 1) {
        (async () => {
          let full; try { full = await prepareImage(files[0]); } catch (ex) { return; }
          const out = await window.Cropper.open(full);
          const use = out || full; use._ready = true; files = [use];
          lab.innerHTML = '<img src="' + URL.createObjectURL(use) + '" alt=""><span>Change image</span>';
        })();
      }
    });
    if (d.id) confirmButton($('#iDel'), 'Tap again to delete', async () => {
      try { await S.store.remove('inspirations', d.id); if (d.image_path) S.store.removeImage(d.image_path, thumbOf(d.image_path)).catch(() => {}); closeSheet(); await refresh(); toast('Deleted'); }
      catch (ex) { toast('Could not delete. Check your connection and try again.'); }
    });
    $('#iForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const err = $('#iErr'), btn = $('#iSave');
      let link = $('#iLink').value.trim();
      if (link && !/^https?:\/\//i.test(link)) link = 'https://' + link;
      const base = { region: $('#iRegion').value, link, note: $('#iNote').value.trim() };
      if (!d.id && !files.length && !base.link && !base.note) { err.textContent = 'Add an image, a link or a note.'; err.hidden = false; return; }
      btn.disabled = true; btn.textContent = 'Saving…'; err.hidden = true;
      try {
        if (d.id) {
          let path = d.image_path || null, old = null;
          if (files[0]) { path = await uploadPhoto(files[0]._ready ? files[0] : await prepareImage(files[0])); old = d.image_path; }
          await S.store.save('inspirations', Object.assign({ id: d.id, image_path: path }, base));
          if (old && old !== path) S.store.removeImage(old, thumbOf(old)).catch(() => {});
        } else if (files.length) {
          for (let k = 0; k < files.length; k++) {
            btn.textContent = files.length > 1 ? 'Uploading ' + (k + 1) + ' of ' + files.length + '…' : 'Uploading…';
            const path = await uploadPhoto(files[k]._ready ? files[k] : await prepareImage(files[k]));
            await S.store.save('inspirations', Object.assign({ image_path: path }, base));
          }
        } else {
          await S.store.save('inspirations', Object.assign({ image_path: null }, base));
        }
        S.region = base.region;
        closeSheet(); await refresh(); toast('Saved');
      } catch (ex) {
        console.warn(ex);
        err.textContent = (ex && ex.message) ? 'Couldn’t save: ' + ex.message : 'Couldn’t save. Check your connection and try again.';
        err.hidden = false; btn.disabled = false; btn.textContent = 'Save';
      }
    });
  }

  // ---------- photo helpers ----------
  function photoBlock(u, inputId, emptyLabel) {
    if (!u) return '<label class="photo-drop" for="' + inputId + '"><span>' + emptyLabel + '</span></label>';
    return '<div class="photo-drop has"><img src="' + esc(u) + '" alt="">' +
      '<div class="photo-actions"><button type="button" class="btn small" data-crop>Crop &amp; zoom</button>' +
      '<label class="btn small" for="' + inputId + '">Change</label></div></div>';
  }
  async function makeThumb(blob) {
    try {
      const b = await createImageBitmap(blob);
      const s = Math.min(1, 720 / Math.max(b.width, b.height));
      const c = document.createElement('canvas'); c.width = Math.round(b.width * s); c.height = Math.round(b.height * s);
      c.getContext('2d').drawImage(b, 0, 0, c.width, c.height);
      return await new Promise((res) => c.toBlob(res, 'image/jpeg', 0.82));
    } catch (e) { return null; }
  }
  // Uploads the photo plus a small copy for thumbnails, so lists load fast.
  async function uploadPhoto(blob) {
    const path = await S.store.upload(blob);
    const small = await makeThumb(blob);
    if (small) await S.store.upload(small, thumbOf(path)).catch(() => {});
    return path;
  }
  // Saves a tattoo. If the database is missing a newer column (studio, price, pain),
  // saves without it and says a quick database update is needed.
  const EXTRA_COLS = ['studio', 'price', 'pain'];
  async function saveTattooRow(row) {
    const r = Object.assign({}, row), dropped = [];
    for (let i = 0; i <= EXTRA_COLS.length; i++) {
      try {
        const saved = await S.store.save('tattoos', r);
        if (dropped.some((c) => row[c])) toast('Saved, but ' + dropped.join(' and ') + ' need a quick database update');
        return saved;
      } catch (ex) {
        const msg = (ex && ex.message) || '';
        const col = EXTRA_COLS.find((c) => c in r && new RegExp("'" + c + "'|\\b" + c + '\\b', 'i').test(msg));
        if (!col) throw ex;
        delete r[col]; dropped.push(col);
      }
    }
  }
  function painBar(n) {
    if (!n) return '';
    let h = '<span class="pain-bar" aria-hidden="true">';
    for (let i = 1; i <= 10; i++) h += '<i' + (i <= n ? ' class="on"' : '') + '></i>';
    return h + '</span>';
  }
  function fitLabels(svg) {
    svg.querySelectorAll('text.fit').forEach((t) => {
      const max = parseFloat(t.dataset.max); if (!max || !t.getComputedTextLength) return;
      let txt = t.textContent, guard = 0;
      try {
        while (t.getComputedTextLength() > max && txt.length > 2 && guard++ < 80) { txt = txt.slice(0, -1); t.textContent = txt.trimEnd() + '…'; }
      } catch (e) { /* not rendered yet */ }
    });
  }

  // ---------- toast ----------
  let tt;
  function toast(msg) {
    const t = $('#toast'); t.textContent = msg; t.hidden = false;
    clearTimeout(tt); tt = setTimeout(() => { t.hidden = true; }, 2600);
  }

  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
  boot();
  // Re-fit plate labels once the display font has loaded.
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => renderPlate());
})();
