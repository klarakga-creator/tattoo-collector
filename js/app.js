(function () {
  'use strict';
  const F = window.Figure;
  const VIEWS = {
    front: { label: 'Front', fig: 'Fig. 1', name: 'Anterior view', marks: ['R', 'L'] },
    back: { label: 'Back', fig: 'Fig. 2', name: 'Posterior view', marks: ['L', 'R'] },
    left: { label: 'Left side', fig: 'Fig. 3', name: 'Left lateral view', marks: ['A', 'P'] },
    right: { label: 'Right side', fig: 'Fig. 4', name: 'Right lateral view', marks: ['P', 'A'] }
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
    tattoos: [], inspo: [], urls: {}, selected: null, placing: null, geo: null, loaded: false
  };
  const $ = (s, el) => (el || document).querySelector(s);
  const $$ = (s, el) => Array.from((el || document).querySelectorAll(s));
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const clip = (s, n) => { s = String(s || ''); return s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s; };
  const fmtDate = (d) => { if (!d) return ''; const x = new Date(d + 'T00:00:00'); return isNaN(x) ? d : x.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }); };
  const img = (p) => (p && S.urls[p]) || '';

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
      Object.assign(S.urls, await S.store.urls(paths));
      S.loaded = true; $('#offline').hidden = true;
      renderAll();
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
    $('#addTattoo').addEventListener('click', () => openTattooForm({ status: 'have', name: '', part: '', artist: '', date: '', notes: '' }));
    $('#addInspo').addEventListener('click', () => openInspoForm({ region: S.region === 'all' ? 'anywhere' : S.region, link: '', note: '' }));
    $('#cancelPlace').addEventListener('click', () => { const d = S.placing.draft; stopPlacing(); openTattooForm(d); });
    $('#plate').addEventListener('click', onPlateClick);
    $('#signOut').addEventListener('click', async () => { await S.store.signOut(); location.reload(); });
    $('#sheetWrap').addEventListener('click', (e) => { if (e.target.matches('.scrim') || e.target.closest('[data-close]')) closeSheet(); });
    $('#lightbox').addEventListener('click', () => { $('#lightbox').hidden = true; });
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
    $$('.tabs a').forEach((a) => a.setAttribute('aria-current', String((a.getAttribute('href') === '#inspiration') === insp)));
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
    const narrow = (svg.parentNode.clientWidth || 800) < 640;
    const W = narrow ? 720 : 1000, H = 900, sc = narrow ? 0.92 : 1;
    const fw = F.FIG_W * sc, figX = (W - fw) / 2, figY = (H - F.FIG_H * sc) / 2 + 4;
    S.geo = { W, H, sc, figX, figY, narrow };
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);

    const r = narrow ? 30 : 30;
    const items = visible().filter((t) => t.view === S.view).map((t) => ({ t, px: figX + t.x * fw, py: figY + t.y * F.FIG_H * sc }));
    const L = items.filter((i) => i.t.x < 0.5), R = items.filter((i) => i.t.x >= 0.5);
    [L, R].forEach((col) => col.forEach((i) => { i.target = narrow ? i.py - 22 : i.py; }));
    if (narrow) { layoutColumn(L, r + 10, H - r - 62, 112); layoutColumn(R, r + 10, H - r - 62, 112); }
    else { layoutColumn(L, 44, H - 50, 88); layoutColumn(R, 44, H - 50, 88); }

    let lines = '', labels = '', pins = '';
    const place = (it, leftCol) => {
      const t = it.t, sel = S.selected === t.id, planned = t.status === 'planned';
      let cx, cy = it.ly;
      if (narrow) cx = leftCol ? figX / 2 + 4 : W - figX / 2 - 4;
      else cx = leftCol ? figX - 74 : figX + fw + 74;
      const ang = Math.atan2(it.py - cy, it.px - cx);
      const ex = cx + Math.cos(ang) * (r + 4), ey = cy + Math.sin(ang) * (r + 4);
      const cls = 'lead ' + (planned ? 'planned' : 'have') + (sel ? ' sel' : '');
      lines += '<line class="' + cls + '" x1="' + it.px.toFixed(1) + '" y1="' + it.py.toFixed(1) + '" x2="' + ex.toFixed(1) + '" y2="' + ey.toFixed(1) + '"/>';
      pins += '<g class="pin ' + (planned ? 'planned' : 'have') + (sel ? ' sel' : '') + '" data-id="' + esc(t.id) + '"><circle class="hitarea" cx="' + it.px.toFixed(1) + '" cy="' + it.py.toFixed(1) + '" r="18"/><circle class="dot" cx="' + it.px.toFixed(1) + '" cy="' + it.py.toFixed(1) + '" r="' + (sel ? 9 : 7) + '"/></g>';
      const u = img(t.image_path);
      const thumb = u
        ? '<image href="' + esc(u) + '" x="' + (cx - r) + '" y="' + (cy - r) + '" width="' + 2 * r + '" height="' + 2 * r + '" preserveAspectRatio="xMidYMid slice" clip-path="url(#circ)"/>'
        : '<text class="initial" x="' + cx + '" y="' + (cy + 10) + '" text-anchor="middle">' + esc((t.name || '?').trim().charAt(0).toUpperCase()) + '</text>';
      let text;
      if (narrow) {
        text = '<text class="lb-name" x="' + cx + '" y="' + (cy + r + 30) + '" text-anchor="middle">' + esc(clip(t.name || 'Untitled', 14)) + '</text>' +
          '<text class="lb-part" x="' + cx + '" y="' + (cy + r + 54) + '" text-anchor="middle">' + esc(clip(t.part, 18)) + '</text>';
      } else {
        const tx = leftCol ? cx - r - 16 : cx + r + 16, anchor = leftCol ? 'end' : 'start';
        text = '<text class="lb-name" x="' + tx + '" y="' + (cy + 1) + '" text-anchor="' + anchor + '">' + esc(clip(t.name || 'Untitled', 20)) + '</text>' +
          '<text class="lb-part" x="' + tx + '" y="' + (cy + 25) + '" text-anchor="' + anchor + '">' + esc(clip(t.part, 26)) + '</text>';
      }
      labels += '<g class="label ' + (planned ? 'planned' : 'have') + (sel ? ' sel' : '') + '" data-id="' + esc(t.id) + '" tabindex="0" role="button" aria-label="' + esc((t.name || 'Untitled') + ', ' + (t.part || '')) + '">' +
        '<rect class="hitarea" x="' + (narrow ? cx - 100 : (leftCol ? cx - 260 : cx - r - 6)) + '" y="' + (cy - r - 6) + '" width="' + (narrow ? 200 : 266) + '" height="' + (narrow ? 2 * r + 70 : 2 * r + 12) + '"/>' +
        '<circle class="thumb-bg" cx="' + cx + '" cy="' + cy + '" r="' + r + '"/>' + thumb +
        '<circle class="thumb-ring" cx="' + cx + '" cy="' + cy + '" r="' + r + '"/>' + text + '</g>';
    };
    L.forEach((i) => place(i, true)); R.forEach((i) => place(i, false));

    // Ghost pin while placing
    let ghost = '';
    const d = S.placing && S.placing.draft;
    if (d && d.view === S.view && d.x != null) {
      ghost = '<circle class="ghost" cx="' + (figX + d.x * fw).toFixed(1) + '" cy="' + (figY + d.y * F.FIG_H * sc).toFixed(1) + '" r="9"/>';
    }

    const m = VIEWS[S.view].marks;
    const marks = '<text class="orient" x="' + (figX - 8) + '" y="' + (figY + 40) + '" text-anchor="end">' + m[0] + '</text>' +
      '<text class="orient" x="' + (figX + fw + 8) + '" y="' + (figY + 40) + '">' + m[1] + '</text>';

    const empty = !items.length && S.loaded
      ? '<text class="empty-note" x="' + W / 2 + '" y="' + (H - 14) + '" text-anchor="middle">' +
        (S.tattoos.length ? 'Nothing on this view yet' : 'Tap “Add tattoo” to place your first one') + '</text>'
      : '';

    svg.innerHTML =
      '<defs><clipPath id="circ" clipPathUnits="objectBoundingBox"><circle cx=".5" cy=".5" r=".5"/></clipPath></defs>' +
      '<g class="fig" transform="translate(' + figX.toFixed(1) + ' ' + figY.toFixed(1) + ') scale(' + sc + ')">' + F.markup(S.view) + '</g>' +
      marks + lines + pins + labels + ghost + empty;

    const v = VIEWS[S.view];
    const here = items.length, planned = items.filter((i) => i.t.status === 'planned').length;
    $('#caption').innerHTML = '<span class="fig-no">' + v.fig + '</span><span class="fig-name">' + v.name + '</span>' +
      '<span class="fig-count">' + (S.loaded ? here + (here === 1 ? ' piece' : ' pieces') + (planned ? ' · ' + planned + ' planned' : '') : 'Loading…') + '</span>';
    $('.plate').classList.toggle('placing', !!S.placing);
  }

  function svgPoint(e) {
    const svg = $('#plate'), pt = svg.createSVGPoint();
    pt.x = e.clientX; pt.y = e.clientY;
    return pt.matrixTransform(svg.getScreenCTM().inverse());
  }

  function onPlateClick(e) {
    if (S.placing) return placeAt(e);
    const g = e.target.closest('[data-id]');
    if (g) openDetail(g.dataset.id);
  }
  $('#plate') && $('#plate').addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.closest('[data-id]')) { e.preventDefault(); openDetail(e.target.closest('[data-id]').dataset.id); }
  });

  function placeAt(e) {
    const p = svgPoint(e), g = S.geo;
    const fx = (p.x - g.figX) / g.sc, fy = (p.y - g.figY) / g.sc;
    if (fx < 0 || fx > F.FIG_W || fy < 0 || fy > F.FIG_H) return toast('Tap on the body itself');
    const hx = S.view === 'left' ? F.FIG_W - fx : fx;
    const a = F.hit('bodyPath', hx, fy), b = F.hit('armPath', hx, fy);
    if (a === false && b !== true) return toast('Tap on the body itself');
    const d = S.placing.draft;
    d.view = S.view; d.x = +(fx / F.FIG_W).toFixed(4); d.y = +(fy / F.FIG_H).toFixed(4);
    if (!d.part || d.partAuto) { d.part = F.guessPart(S.view, fx, fy); d.partAuto = true; }
    renderPlate();
    setTimeout(() => { stopPlacing(); openTattooForm(d); }, 260);
  }

  function startPlacing(d) {
    S.placing = { draft: d };
    closeSheet(true);
    if (d.view && d.view !== S.view) setView(d.view);
    $('#placeBanner').hidden = false;
    renderPlate();
    $('.plate').scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  function stopPlacing() { S.placing = null; $('#placeBanner').hidden = true; renderPlate(); }

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
      $('#list').innerHTML = '<p class="muted">' + (S.loaded ? (S.tattoos.length ? 'Nothing matches this filter.' : 'Your collection is empty. Add your first tattoo and it will show up here and on the body.') : 'Loading your collection…') + '</p>';
      return;
    }
    $('#list').innerHTML = list.map((t) => {
      const u = img(t.image_path);
      return '<button class="card" data-open="' + esc(t.id) + '">' +
        (u ? '<img src="' + esc(u) + '" alt="" loading="lazy">' : '<span class="noimg">' + esc((t.name || '?').charAt(0).toUpperCase()) + '</span>') +
        '<span class="card-body"><span class="card-name">' + esc(t.name || 'Untitled') + '</span>' +
        '<span class="card-part">' + esc(t.part || '') + '</span>' +
        '<span class="pill ' + (t.status === 'planned' ? 'planned' : 'have') + '">' + (t.status === 'planned' ? 'Planned' : 'Inked') + '</span></span></button>';
    }).join('');
    $$('#list [data-open]').forEach((b) => b.addEventListener('click', () => {
      const t = S.tattoos.find((x) => x.id === b.dataset.open);
      setView(t.view); $('.plate').scrollIntoView({ behavior: 'smooth', block: 'start' });
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
    const u = img(t.image_path), reg = regionOf(t.part), ideas = S.inspo.filter((i) => i.region === reg).length;
    const facts = [['Artist / studio', t.artist], [t.status === 'planned' ? 'Target date' : 'Date', fmtDate(t.date)], ['Notes', t.notes]].filter((f) => f[1]);
    openSheet(
      '<div class="sheet-head"><span class="pill ' + (t.status === 'planned' ? 'planned' : 'have') + '">' + (t.status === 'planned' ? 'Planned' : 'Inked') + '</span>' +
      '<button class="icon-btn" data-close aria-label="Close">✕</button></div>' +
      (u ? '<button class="detail-img" id="dImg" aria-label="Show full photo"><img src="' + esc(u) + '" alt="' + esc(t.name) + '"></button>' : '<div class="detail-noimg">No photo yet. Edit to add one.</div>') +
      '<h3 class="detail-name">' + esc(t.name || 'Untitled') + '</h3>' +
      '<p class="detail-part">' + esc(t.part || 'No body part set') + ' · ' + VIEWS[t.view].label + ' view</p>' +
      (facts.length ? '<dl class="facts">' + facts.map((f) => '<div><dt>' + f[0] + '</dt><dd>' + esc(f[1]) + '</dd></div>').join('') + '</dl>' : '') +
      '<button class="link-btn" id="dIdeas">' + (ideas ? ideas + ' inspiration ' + (ideas === 1 ? 'idea' : 'ideas') : 'Inspiration') + ' for ' + regionLabel(reg).toLowerCase() + ' →</button>' +
      '<div class="form-actions"><button class="btn danger" id="dDel">Delete</button><span class="grow"></span><button class="btn primary" id="dEdit">Edit</button></div>'
    );
    if (u) $('#dImg').addEventListener('click', () => lightbox(u));
    $('#dIdeas').addEventListener('click', () => { closeSheet(); S.region = reg; location.hash = '#inspiration'; renderInspo(); });
    $('#dEdit').addEventListener('click', () => openTattooForm(Object.assign({}, t)));
    confirmButton($('#dDel'), 'Tap again to delete', async () => {
      try {
        await S.store.remove('tattoos', t.id);
        if (t.image_path) S.store.removeImage(t.image_path).catch(() => {});
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

  function lightbox(u) { $('#lbImg').src = u; $('#lightbox').hidden = false; }

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
      '<label class="photo-drop' + (u ? ' has' : '') + '" for="tPhoto">' + (u ? '<img src="' + esc(u) + '" alt="">' : '') + '<span>' + (u ? 'Change photo' : 'Add a photo') + '</span></label>' +
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
      '<div class="grid2"><div class="field"><label for="tArtist">Artist / studio</label><input id="tArtist" maxlength="80" value="' + esc(d.artist) + '"></div>' +
      '<div class="field"><label for="tDate">Date</label><input id="tDate" type="date" value="' + esc(d.date || '') + '"></div></div>' +
      '<div class="field"><label for="tNotes">Notes</label><textarea id="tNotes" rows="3" placeholder="Meaning, size, healing, price…">' + esc(d.notes) + '</textarea></div>' +
      '<p class="form-err" id="tErr" hidden></p>' +
      '<div class="form-actions"><button type="button" class="btn ghost" data-close>Cancel</button><span class="grow"></span><button type="submit" class="btn primary" id="tSave">Save tattoo</button></div>' +
      '</form>'
    );
    const collect = () => {
      d.name = $('#tName').value.trim();
      d.status = ($('input[name=tStatus]:checked') || {}).value || 'have';
      d.artist = $('#tArtist').value.trim(); d.date = $('#tDate').value; d.notes = $('#tNotes').value.trim();
      d.part = $('#tPart').value.trim();
    };
    $('#tPart').addEventListener('input', () => { d.partAuto = false; });
    $('#tPhoto').addEventListener('change', (e) => {
      const f = e.target.files[0]; if (!f) return;
      d._file = f; d._preview = URL.createObjectURL(f);
      const lab = $('.photo-drop'); lab.classList.add('has'); lab.innerHTML = '<img src="' + d._preview + '" alt=""><span>Change photo</span>';
    });
    $('#placeBtn').addEventListener('click', () => { collect(); startPlacing(d); });
    $('#tForm').addEventListener('submit', async (e) => {
      e.preventDefault(); collect();
      const err = $('#tErr');
      if (d.x == null) { err.textContent = 'Place it on the body first, so it shows on the figure.'; err.hidden = false; return; }
      const btn = $('#tSave'); btn.disabled = true; btn.textContent = 'Saving…'; err.hidden = true;
      try {
        let path = d.image_path || null, old = null;
        if (d._file) { btn.textContent = 'Uploading photo…'; path = await S.store.upload(await prepareImage(d._file)); old = d.image_path; }
        const row = { name: d.name || 'Untitled', status: d.status, view: d.view, x: d.x, y: d.y, part: d.part, artist: d.artist, date: d.date || null, notes: d.notes, image_path: path };
        if (d.id) row.id = d.id;
        const saved = await S.store.save('tattoos', row);
        if (old && old !== path) S.store.removeImage(old).catch(() => {});
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
      const u = img(i.image_path);
      let host = ''; try { host = i.link ? new URL(i.link).hostname.replace(/^www\./, '') : ''; } catch (e) { host = ''; }
      return '<article class="inspo-card">' +
        (u ? '<button class="inspo-img" data-lb="' + esc(i.id) + '" aria-label="Show full image"><img src="' + esc(u) + '" alt="" loading="lazy"></button>' : '') +
        '<div class="inspo-body"><span class="tag">' + esc(regionLabel(i.region)) + '</span>' +
        (i.note ? '<p>' + esc(i.note) + '</p>' : '') +
        (host ? '<a href="' + esc(i.link) + '" target="_blank" rel="noopener">' + esc(host) + ' ↗</a>' : '') +
        '<button class="mini" data-edit="' + esc(i.id) + '">Edit</button></div></article>';
    }).join('');
    $$('#inspoGrid [data-lb]').forEach((b) => b.addEventListener('click', () => lightbox(img(S.inspo.find((x) => x.id === b.dataset.lb).image_path))));
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
    });
    if (d.id) confirmButton($('#iDel'), 'Tap again to delete', async () => {
      try { await S.store.remove('inspirations', d.id); if (d.image_path) S.store.removeImage(d.image_path).catch(() => {}); closeSheet(); await refresh(); toast('Deleted'); }
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
          if (files[0]) { path = await S.store.upload(await prepareImage(files[0])); old = d.image_path; }
          await S.store.save('inspirations', Object.assign({ id: d.id, image_path: path }, base));
          if (old && old !== path) S.store.removeImage(old).catch(() => {});
        } else if (files.length) {
          for (let k = 0; k < files.length; k++) {
            btn.textContent = files.length > 1 ? 'Uploading ' + (k + 1) + ' of ' + files.length + '…' : 'Uploading…';
            const path = await S.store.upload(await prepareImage(files[k]));
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
})();
