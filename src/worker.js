// StreamFlix API: Cloudflare Worker (KV for catalog, R2 for optional self-hosted video)
const enc = new TextEncoder();
const SESSION_TTL = 8 * 3600;

/* ---------- helpers ---------- */
const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers },
  });

const b64u = (buf) =>
  btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
const hmacKey = (secret) =>
  crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);

async function signJwt(payload, secret) {
  const h = b64u(enc.encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
  const p = b64u(enc.encode(JSON.stringify(payload)));
  const sig = await crypto.subtle.sign('HMAC', await hmacKey(secret), enc.encode(`${h}.${p}`));
  return `${h}.${p}.${b64u(sig)}`;
}

async function verifyJwt(token, secret) {
  try {
    const [h, p, s] = token.split('.');
    const ok = await crypto.subtle.verify('HMAC', await hmacKey(secret), unb64u(s), enc.encode(`${h}.${p}`));
    if (!ok) return null;
    const payload = JSON.parse(new TextDecoder().decode(unb64u(p)));
    return payload.exp > Date.now() / 1000 ? payload : null;
  } catch {
    return null;
  }
}

// Constant-time string comparison (hash both sides first so lengths match)
async function safeEqual(a, b) {
  const [x, y] = await Promise.all([a, b].map((v) => crypto.subtle.digest('SHA-256', enc.encode(String(v)))));
  const ax = new Uint8Array(x), ay = new Uint8Array(y);
  let d = 0;
  for (let i = 0; i < ax.length; i++) d |= ax[i] ^ ay[i];
  return d === 0;
}

function getCookie(request, name) {
  const m = (request.headers.get('Cookie') || '').match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return m ? m[1] : null;
}

async function session(request, env) {
  const token = getCookie(request, 'session');
  return token && env.JWT_SECRET ? verifyJwt(token, env.JWT_SECRET) : null;
}

function corsHeaders(request, env) {
  const origin = request.headers.get('Origin');
  if (!origin || !env.ALLOWED_ORIGIN || origin !== env.ALLOWED_ORIGIN) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    Vary: 'Origin',
  };
}

/* ---------- catalog ---------- */
const S3 = 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample';
const SEED = [
  ['Big Buck Bunny', 'BigBuckBunny', 2008, 'Trending Now', ['Animation', 'Comedy'], true, 'A giant rabbit takes revenge on three bullying rodents.'],
  ['Sintel', 'Sintel', 2010, 'Trending Now', ['Animation', 'Fantasy'], false, 'A young woman searches for her lost dragon.'],
  ['Elephants Dream', 'ElephantsDream', 2006, 'Popular Movies', ['Animation', 'Sci-Fi'], false, 'Two strange characters explore a surreal machine world.'],
  ['Tears of Steel', 'TearsOfSteel', 2012, 'Popular Movies', ['Sci-Fi', 'Action'], false, 'Warriors and scientists try to save the world from robots.'],
].map(([title, f, year, category, genres, featured, description]) => ({
  title, year, category, genres, featured, description,
  poster: `${S3}/images/${f}.jpg`, backdrop: `${S3}/images/${f}.jpg`,
  videoUrl: `${S3}/${f}.mp4`, trailerUrl: '', maturity: 'PG-13', quality: 'HD',
}));

const newId = () => crypto.randomUUID().slice(0, 8);
const str = (v, max = 2000) => String(v ?? '').trim().slice(0, max);

function clean(b) {
  const genres = Array.isArray(b.genres) ? b.genres : String(b.genres || '').split(',');
  return {
    title: str(b.title, 200),
    description: str(b.description, 2000),
    year: Number(b.year) || new Date().getFullYear(),
    category: str(b.category, 80) || 'Popular Movies',
    genres: genres.map((g) => str(g, 40)).filter(Boolean).slice(0, 6),
    poster: str(b.poster), backdrop: str(b.backdrop),
    videoUrl: str(b.videoUrl), trailerUrl: str(b.trailerUrl),
    maturity: str(b.maturity, 10) || 'PG-13',
    quality: ['HD', '4K'].includes(b.quality) ? b.quality : 'HD',
    featured: !!b.featured,
  };
}

async function listMedia(env) {
  let { keys } = await env.MEDIA_KV.list({ prefix: 'media:' });
  if (!keys.length) {
    // First run: seed with public sample videos so the UI isn't empty
    await Promise.all(SEED.map((m) => { const id = newId(); return env.MEDIA_KV.put(`media:${id}`, JSON.stringify({ id, createdAt: Date.now(), ...m })); }));
    ({ keys } = await env.MEDIA_KV.list({ prefix: 'media:' }));
  }
  const items = await Promise.all(keys.map((k) => env.MEDIA_KV.get(k.name, 'json')));
  return items.filter(Boolean).sort((a, b) => b.createdAt - a.createdAt);
}

async function unfeatureOthers(env, id) {
  for (const m of await listMedia(env))
    if (m.id !== id && m.featured) await env.MEDIA_KV.put(`media:${m.id}`, JSON.stringify({ ...m, featured: false }));
}

/* ---------- routes ---------- */
async function api(request, env, url) {
  const p = url.pathname, method = request.method;

  if (p === '/api/media' && method === 'GET') {
    const items = await listMedia(env);
    const rows = [];
    for (const m of items) {
      let r = rows.find((x) => x.name === m.category);
      if (!r) rows.push((r = { name: m.category, items: [] }));
      r.items.push(m);
    }
    return json({ featured: items.find((m) => m.featured) || items[0] || null, rows }, 200, { 'Cache-Control': 'public, max-age=15' });
  }

  const one = p.match(/^\/api\/media\/([\w-]+)$/);
  if (one && method === 'GET') {
    const m = await env.MEDIA_KV.get(`media:${one[1]}`, 'json');
    return m ? json(m) : json({ error: 'Not found' }, 404);
  }

  if (p === '/api/admin/login' && method === 'POST') {
    if (!env.ADMIN_PASSWORD || !env.JWT_SECRET) return json({ error: 'Admin not configured' }, 500);
    const b = await request.json().catch(() => ({}));
    const userOk = await safeEqual(b.username ?? '', env.ADMIN_USERNAME || 'admin');
    const passOk = await safeEqual(b.password ?? '', env.ADMIN_PASSWORD);
    if (!(userOk && passOk)) return json({ error: 'Invalid username or password' }, 401);
    const token = await signJwt({ sub: b.username, exp: Math.floor(Date.now() / 1000) + SESSION_TTL }, env.JWT_SECRET);
    const secure = url.protocol === 'https:' ? ' Secure;' : '';
    return json({ ok: true }, 200, { 'Set-Cookie': `session=${token}; HttpOnly;${secure} SameSite=Strict; Path=/; Max-Age=${SESSION_TTL}` });
  }

  if (p === '/api/admin/logout' && method === 'POST')
    return json({ ok: true }, 200, { 'Set-Cookie': 'session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0' });

  if (p.startsWith('/api/admin/')) {
    if (!(await session(request, env))) return json({ error: 'Unauthorized' }, 401);
    if (p === '/api/admin/me') return json({ ok: true });
    if (p === '/api/admin/media' && method === 'GET') return json(await listMedia(env));

    if (p === '/api/admin/media' && method === 'POST') {
      const data = clean(await request.json().catch(() => ({})));
      if (!data.title || !data.videoUrl) return json({ error: 'Title and video URL are required' }, 400);
      const m = { id: newId(), createdAt: Date.now(), ...data };
      if (m.featured) await unfeatureOthers(env, m.id);
      await env.MEDIA_KV.put(`media:${m.id}`, JSON.stringify(m));
      return json(m, 201);
    }

    const target = p.match(/^\/api\/admin\/media\/([\w-]+)$/);
    if (target) {
      const old = await env.MEDIA_KV.get(`media:${target[1]}`, 'json');
      if (!old) return json({ error: 'Not found' }, 404);
      if (method === 'DELETE') { await env.MEDIA_KV.delete(`media:${old.id}`); return json({ ok: true }); }
      if (method === 'PUT') {
        const data = clean({ ...old, ...(await request.json().catch(() => ({}))) });
        if (!data.title || !data.videoUrl) return json({ error: 'Title and video URL are required' }, 400);
        const m = { ...old, ...data };
        if (m.featured) await unfeatureOthers(env, m.id);
        await env.MEDIA_KV.put(`media:${m.id}`, JSON.stringify(m));
        return json(m);
      }
    }
  }
  return json({ error: 'Not found' }, 404);
}

// R2 streaming with HTTP range support (seeking works in <video>)
async function stream(request, env, url) {
  if (!env.BUCKET) return json({ error: 'R2 not configured' }, 404);
  const key = decodeURIComponent(url.pathname.slice('/stream/'.length));
  const obj = await env.BUCKET.get(key, { range: request.headers });
  if (!obj) return json({ error: 'Not found' }, 404);
  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set('Accept-Ranges', 'bytes');
  headers.set('ETag', obj.httpEtag);
  headers.set('Cache-Control', 'public, max-age=86400');
  if (obj.range) {
    const offset = obj.range.offset ?? 0;
    const length = obj.range.length ?? obj.size - offset;
    headers.set('Content-Range', `bytes ${offset}-${offset + length - 1}/${obj.size}`);
    headers.set('Content-Length', String(length));
    return new Response(obj.body, { status: 206, headers });
  }
  headers.set('Content-Length', String(obj.size));
  return new Response(obj.body, { headers });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const cors = corsHeaders(request, env);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    try {
      let res;
      if (url.pathname.startsWith('/stream/')) res = await stream(request, env, url);
      else if (url.pathname.startsWith('/api/')) res = await api(request, env, url);
      else if (env.ASSETS) return env.ASSETS.fetch(request);
      else res = json({ error: 'Not found' }, 404);
      for (const [k, v] of Object.entries(cors)) res.headers.set(k, v);
      return res;
    } catch (e) {
      console.error(e);
      return json({ error: 'Server error' }, 500);
    }
  },
};
