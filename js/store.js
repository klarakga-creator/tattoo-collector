// Data layer. Two implementations with the same shape:
//  - SupabaseStore: real, synced between devices.
//  - DemoStore: in-memory sample data, used before the app is connected.
(function () {
  'use strict';
  const BUCKET = 'photos';
  const TABLES = ['tattoos', 'inspirations'];

  function SupabaseStore(cfg) {
    const sb = window.supabase.createClient(cfg.url, cfg.key, {
      auth: { persistSession: true, autoRefreshToken: true }
    });
    const listeners = new Set();
    // Signed photo links, kept between visits so the browser can reuse its cached images.
    const URL_KEY = 'tc-urls-v1';
    const urlCache = new Map(); // path -> {url, exp}
    try { Object.entries(JSON.parse(localStorage.getItem(URL_KEY) || '{}')).forEach(([k, v]) => { if (v.exp > Date.now()) urlCache.set(k, v); }); } catch (e) { /* ignore */ }
    const saveUrls = () => { try { localStorage.setItem(URL_KEY, JSON.stringify(Object.fromEntries(urlCache))); } catch (e) { /* ignore */ } };
    const missing = new Set();
    let channel = null, timer = null;

    const emit = () => { clearTimeout(timer); timer = setTimeout(() => listeners.forEach((f) => f()), 150); };

    function listen() {
      if (channel) sb.removeChannel(channel);
      channel = sb.channel('tc-changes');
      TABLES.forEach((t) => channel.on('postgres_changes', { event: '*', schema: 'public', table: t }, emit));
      channel.subscribe();
    }

    return {
      demo: false,
      async session() { const { data } = await sb.auth.getSession(); return data.session; },
      onAuth(cb) { sb.auth.onAuthStateChange((_e, s) => cb(s)); },
      async signIn(email, password) {
        const { error } = await sb.auth.signInWithPassword({ email, password });
        if (error) throw error;
      },
      async signOut() { await sb.auth.signOut(); },
      start() {
        listen();
        // Phones pause background sockets; refresh whenever the app comes back.
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') { listen(); emit(); }
        });
        window.addEventListener('online', () => { listen(); emit(); });
      },
      onChange(cb) { listeners.add(cb); },
      async list(table) {
        const { data, error } = await sb.from(table).select('*').order('created_at', { ascending: true });
        if (error) throw error;
        return data || [];
      },
      async save(table, row) {
        const body = Object.assign({}, row);
        delete body.user_id; delete body.created_at;
        body.updated_at = new Date().toISOString();
        let res;
        if (row.id) res = await sb.from(table).update(body).eq('id', row.id).select().single();
        else { delete body.id; res = await sb.from(table).insert(body).select().single(); }
        if (res.error) throw res.error;
        emit();
        return res.data;
      },
      async remove(table, id) {
        const { error } = await sb.from(table).delete().eq('id', id);
        if (error) throw error;
        emit();
      },
      async upload(blob, name) {
        let path = name;
        if (!path) {
          const { data: sess } = await sb.auth.getSession();
          const ext = blob.type === 'image/png' ? 'png' : blob.type === 'image/webp' ? 'webp' : blob.type === 'image/gif' ? 'gif' : 'jpg';
          path = sess.session.user.id + '/' + crypto.randomUUID() + '.' + ext;
        }
        const { error } = await sb.storage.from(BUCKET).upload(path, blob, { contentType: blob.type || 'image/jpeg', upsert: false });
        if (error) throw error;
        return path;
      },
      async removeImage(...paths) { paths = paths.filter(Boolean); if (paths.length) await sb.storage.from(BUCKET).remove(paths); },
      cachedUrls(paths) { const o = {}, now = Date.now(); paths.forEach((p) => { const c = urlCache.get(p); if (c && c.exp > now) o[p] = c.url; }); return o; },
      // Signed links for private photos, cached until shortly before expiry.
      async urls(paths) {
        const now = Date.now(), out = {}, need = [];
        paths.filter(Boolean).forEach((p) => {
          const c = urlCache.get(p);
          if (c && c.exp > now) out[p] = c.url; else if (!missing.has(p)) need.push(p);
        });
        if (need.length) {
          const { data, error } = await sb.storage.from(BUCKET).createSignedUrls(need, 60 * 60 * 24 * 7);
          if (!error && data) data.forEach((d) => {
            if (d.signedUrl) { out[d.path] = d.signedUrl; urlCache.set(d.path, { url: d.signedUrl, exp: now + 1000 * 60 * 60 * 24 * 6 }); }
            else if (d.path) missing.add(d.path);
          });
          saveUrls();
        }
        return out;
      }
    };
  }

  // ---- Demo store ---------------------------------------------------------
  function sampleArt(hue, kind) {
    const ink = 'hsl(' + hue + ',35%,22%)';
    const shapes = {
      rose: '<circle cx="100" cy="90" r="34" fill="none" stroke="' + ink + '" stroke-width="5"/><path d="M100 70c-12 8-12 30 0 40 12-10 12-32 0-40z" fill="none" stroke="' + ink + '" stroke-width="4"/><path d="M100 124v52M100 150c-18-6-28-18-30-30M100 160c16-4 26-14 30-26" fill="none" stroke="' + ink + '" stroke-width="4"/>',
      moon: '<path d="M120 40a62 62 0 1 0 0 120a48 48 0 1 1 0-120z" fill="none" stroke="' + ink + '" stroke-width="5"/><circle cx="150" cy="60" r="4" fill="' + ink + '"/><circle cx="160" cy="110" r="3" fill="' + ink + '"/>',
      wave: '<path d="M20 120c30-50 60-50 80 0s50 50 80 0" fill="none" stroke="' + ink + '" stroke-width="5"/><path d="M20 150c30-40 60-40 80 0s50 40 80 0" fill="none" stroke="' + ink + '" stroke-width="3"/>',
      script: '<text x="100" y="112" text-anchor="middle" font-family="Georgia,serif" font-style="italic" font-size="40" fill="' + ink + '">amor fati</text>'
    };
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><rect width="200" height="200" fill="hsl(' + hue + ',30%,92%)"/>' + shapes[kind] + '</svg>';
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  }

  function DemoStore() {
    let n = 0;
    const id = () => 'demo-' + (++n);
    const now = () => new Date().toISOString();
    const images = { 'demo/rose': sampleArt(350, 'rose'), 'demo/moon': sampleArt(220, 'moon'), 'demo/wave': sampleArt(200, 'wave'), 'demo/script': sampleArt(30, 'script') };
    const data = {
      tattoos: [
        { id: id(), name: 'Fine-line rose', status: 'have', view: 'front', x: 0.80, y: 0.47, part: 'Left forearm', artist: 'Example studio', date: '2023-05-14', notes: 'Example entry. Your own tattoos will replace these.', image_path: 'demo/rose', created_at: now() },
        { id: id(), name: 'Crescent moon', status: 'have', view: 'back', x: 0.5, y: 0.158, part: 'Nape', artist: '', date: '2021-09-02', notes: 'Example entry.', image_path: 'demo/moon', created_at: now() },
        { id: id(), name: 'Amor fati', status: 'have', view: 'front', x: 0.37, y: 0.355, part: 'Right ribs', artist: '', date: '', notes: 'Example entry.', image_path: 'demo/script', created_at: now() },
        { id: id(), name: 'Wave band', status: 'planned', view: 'right', x: 0.51, y: 0.912, part: 'Right ankle', artist: '', date: '', notes: 'Example of a planned piece.', image_path: 'demo/wave', created_at: now() },
        { id: id(), name: 'Botanical sleeve', status: 'planned', view: 'back', x: 0.24, y: 0.36, part: 'Left upper arm', artist: '', date: '', notes: 'Example of a planned piece without a photo.', image_path: null, created_at: now() }
      ],
      inspirations: [
        { id: id(), region: 'arms', image_path: 'demo/wave', link: '', note: 'Example: flowing linework for the sleeve.', created_at: now() },
        { id: id(), region: 'ribs', image_path: 'demo/script', link: '', note: 'Example: script placement idea.', created_at: now() }
      ]
    };
    const listeners = new Set();
    const emit = () => setTimeout(() => listeners.forEach((f) => f()), 0);
    return {
      demo: true,
      async session() { return { user: { email: 'demo' } }; },
      onAuth() {}, async signIn() {}, async signOut() {},
      start() {}, onChange(cb) { listeners.add(cb); },
      async list(t) { return data[t].map((r) => Object.assign({}, r)); },
      async save(t, row) {
        if (row.id) { const i = data[t].findIndex((r) => r.id === row.id); data[t][i] = Object.assign({}, data[t][i], row); emit(); return data[t][i]; }
        const r = Object.assign({}, row, { id: id(), created_at: now() }); data[t].push(r); emit(); return r;
      },
      async remove(t, rid) { data[t] = data[t].filter((r) => r.id !== rid); emit(); },
      async upload(blob, name) { const p = name || 'demo/' + id() + '.jpg'; images[p] = URL.createObjectURL(blob); return p; },
      async removeImage(...ps) { ps.forEach((p) => delete images[p]); },
      async urls(paths) { const o = {}; paths.forEach((p) => { if (images[p]) o[p] = images[p]; }); return o; }
    };
  }

  window.Stores = { SupabaseStore, DemoStore };
})();
