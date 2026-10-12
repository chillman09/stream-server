const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const load = (k) => new Set(JSON.parse(localStorage.getItem(k) || '[]'));
const state = { rows: [], featured: null, list: load('myList'), liked: load('liked') };
const save = (k, set) => localStorage.setItem(k, JSON.stringify([...set]));
const all = () => state.rows.flatMap((r) => r.items);
const byId = (id) => all().find((m) => m.id === id);
const match = (id) => 70 + ([...id].reduce((a, c) => a + c.charCodeAt(0), 0) % 29);
const icons = () => window.lucide && lucide.createIcons();
const FALLBACK = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='9'%3E%3Crect width='16' height='9' fill='%23262626'/%3E%3C/svg%3E";

/* ---------- rendering ---------- */
const meta = (m) => `<div class="flex flex-wrap items-center gap-2 text-sm">
  <span class="text-green-400 font-semibold">${match(m.id)}% Match</span><span class="text-zinc-300">${esc(m.year)}</span>
  <span class="border border-zinc-500 px-1 text-xs text-zinc-300">${esc(m.maturity)}</span>
  <span class="border border-zinc-500 px-1 text-xs text-zinc-300">${esc(m.quality)}</span></div>`;

const card = (m) => `<article class="card group relative shrink-0 w-[220px] sm:w-[270px] snap-start cursor-pointer" data-id="${esc(m.id)}" tabindex="0" aria-label="${esc(m.title)}">
  <div class="relative aspect-video rounded-md overflow-hidden bg-zinc-800 shadow-lg transition duration-300 ease-out group-hover:scale-110 group-focus-within:scale-110 group-hover:z-30 group-hover:shadow-[0_0_0_1px_rgba(229,9,20,.7),0_18px_40px_rgba(0,0,0,.85)]">
    <img src="${esc(m.poster || m.backdrop)}" alt="" loading="lazy" class="w-full h-full object-cover" onerror="this.src='${FALLBACK}'">
    <div class="absolute inset-x-0 bottom-0 p-3 pt-12 bg-gradient-to-t from-black via-black/90 to-transparent opacity-0 translate-y-2 transition duration-300 delay-300 group-hover:opacity-100 group-hover:translate-y-0 group-focus-within:opacity-100 group-focus-within:translate-y-0">
      <div class="flex gap-2 mb-2">
        <button class="icon-btn !bg-white !text-ink !border-white" data-act="play" aria-label="Play ${esc(m.title)}"><i data-lucide="play" fill="currentColor"></i></button>
        <button class="icon-btn ${state.list.has(m.id) ? 'on' : ''}" data-act="list" aria-label="Toggle My List"><i data-lucide="${state.list.has(m.id) ? 'check' : 'plus'}"></i></button>
        <button class="icon-btn ${state.liked.has(m.id) ? 'on' : ''}" data-act="like" aria-label="Like"><i data-lucide="thumbs-up"></i></button>
      </div>
      <p class="text-xs font-semibold text-green-400">${match(m.id)}% Match <span class="text-zinc-300 font-normal ml-1">${esc(m.year)} · ${esc(m.quality)}</span></p>
      <p class="text-xs text-zinc-300 truncate">${esc((m.genres || []).join(' • '))}</p>
    </div>
  </div>
  <p class="mt-2 text-sm text-zinc-300 truncate transition-opacity group-hover:opacity-0">${esc(m.title)}</p>
</article>`;

const row = (name, items, id = '') => `<section class="row relative mb-2" ${id ? `id="${id}"` : ''}>
  <h2 class="px-4 md:px-12 text-lg md:text-xl font-semibold">${esc(name)}</h2>
  <div class="relative">
    <button class="arrow left-0" data-dir="-1" aria-label="Scroll left"><i data-lucide="chevron-left"></i></button>
    <div class="scroller flex gap-2 overflow-x-auto snap-x px-4 md:px-12 py-8 -my-3 scroll-smooth no-scrollbar">${items.map(card).join('')}</div>
    <button class="arrow right-0" data-dir="1" aria-label="Scroll right"><i data-lucide="chevron-right"></i></button>
  </div></section>`;

function renderHero() {
  const m = state.featured, v = $('#hero-video');
  if (!m) { $('#hero-body').innerHTML = '<p class="text-zinc-400">No titles yet. Add some in the admin dashboard.</p>'; return; }
  v.poster = m.backdrop || m.poster || '';
  if (!matchMedia('(prefers-reduced-motion: reduce)').matches) { v.src = m.trailerUrl || m.videoUrl; v.play().catch(() => {}); }
  $('#hero-body').innerHTML = `
    <h1 class="font-display text-6xl md:text-8xl leading-none tracking-wide drop-shadow-lg">${esc(m.title)}</h1>
    <div class="mt-3">${meta(m)}</div>
    <div class="flex gap-2 mt-3">${(m.genres || []).map((g) => `<span class="text-xs px-2 py-0.5 rounded-full bg-white/10 border border-white/20">${esc(g)}</span>`).join('')}</div>
    <p class="mt-4 text-zinc-200 max-w-xl line-clamp-3">${esc(m.description)}</p>
    <div class="flex gap-3 mt-6">
      <button class="btn inline-flex items-center gap-2 bg-white text-ink font-semibold px-6 py-2.5 rounded hover:bg-zinc-200" data-hero="play"><i data-lucide="play" fill="currentColor"></i>Play</button>
      <button class="btn inline-flex items-center gap-2 bg-zinc-500/60 font-semibold px-6 py-2.5 rounded hover:bg-zinc-500/40" data-hero="info"><i data-lucide="info"></i>More Info</button>
    </div>`;
}

function renderRows() {
  const mine = [...state.list].map(byId).filter(Boolean);
  $('#rows').innerHTML = (mine.length ? row('My List', mine, 'my-list') : '') + state.rows.map((r) => row(r.name, r.items)).join('');
  icons();
}

/* ---------- details modal ---------- */
function openInfo(m) {
  const el = $('#info');
  el.innerHTML = `<div class="max-w-2xl mx-auto mt-10 bg-[#181818] rounded-lg overflow-hidden shadow-2xl">
    <div class="relative aspect-video">
      <img src="${esc(m.backdrop || m.poster)}" alt="" class="w-full h-full object-cover" onerror="this.src='${FALLBACK}'">
      <div class="absolute inset-0 bg-gradient-to-t from-[#181818] to-transparent"></div>
      <button class="absolute top-3 right-3 icon-btn" data-close aria-label="Close"><i data-lucide="x"></i></button>
      <div class="absolute bottom-4 left-6"><h2 class="font-display text-5xl">${esc(m.title)}</h2>
        <button class="btn mt-2 inline-flex items-center gap-2 bg-white text-ink font-semibold px-5 py-2 rounded" data-play="${esc(m.id)}"><i data-lucide="play" fill="currentColor"></i>Play</button></div>
    </div>
    <div class="p-6 space-y-3">${meta(m)}<p class="text-zinc-200">${esc(m.description)}</p>
      <p class="text-sm text-zinc-400">Genres: <span class="text-zinc-200">${esc((m.genres || []).join(', '))}</span></p></div></div>`;
  el.classList.remove('hidden'); icons();
}
const closeInfo = () => $('#info').classList.add('hidden');

/* ---------- player ---------- */
const pv = $('#pv'), pl = $('#player');
let hls, idleTimer, current;
const fmt = (s) => (isFinite(s) ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}` : '0:00');
const setIcon = (btn, name) => { btn.innerHTML = `<i data-lucide="${name}"></i>`; icons(); };

async function openPlayer(m) {
  current = m; $('#pt').textContent = m.title;
  $('#hero-video').pause();
  if (/\.m3u8($|\?)/.test(m.videoUrl) && !pv.canPlayType('application/vnd.apple.mpegurl')) {
    if (!window.Hls) await new Promise((ok, no) => { const s = document.createElement('script'); s.src = 'https://cdn.jsdelivr.net/npm/hls.js@1.5.13/dist/hls.min.js'; s.onload = ok; s.onerror = no; document.head.appendChild(s); });
    hls = new Hls(); hls.loadSource(m.videoUrl); hls.attachMedia(pv);
  } else pv.src = m.videoUrl;
  pl.classList.remove('hidden'); requestAnimationFrame(() => pl.classList.add('open'));
  document.body.style.overflow = 'hidden';
  const pos = Number(localStorage.getItem('pos:' + m.id));
  if (pos > 5) pv.addEventListener('loadedmetadata', () => (pv.currentTime = pos), { once: true });
  pv.play().catch(() => {}); wake();
}
function closePlayer() {
  if (current && pv.currentTime) localStorage.setItem('pos:' + current.id, Math.floor(pv.currentTime));
  pv.pause(); hls?.destroy(); hls = null; pv.removeAttribute('src'); pv.load();
  if (document.fullscreenElement) document.exitFullscreen();
  pl.classList.remove('open'); document.body.style.overflow = '';
  setTimeout(() => pl.classList.add('hidden'), 300);
  if (!matchMedia('(prefers-reduced-motion: reduce)').matches) $('#hero-video').play().catch(() => {});
}
function wake() { pl.classList.remove('idle'); clearTimeout(idleTimer); idleTimer = setTimeout(() => !pv.paused && pl.classList.add('idle'), 2500); }
const toggle = () => (pv.paused ? pv.play() : pv.pause());

pv.addEventListener('play', () => setIcon($('#pplay'), 'pause'));
pv.addEventListener('pause', () => { setIcon($('#pplay'), 'play'); wake(); });
pv.addEventListener('timeupdate', () => {
  if (pv.duration) $('#seek').value = (pv.currentTime / pv.duration) * 1000;
  $('#ptime').textContent = `${fmt(pv.currentTime)} / ${fmt(pv.duration)}`;
});
pv.addEventListener('click', toggle);
pv.addEventListener('ended', () => localStorage.removeItem('pos:' + current?.id));
$('#seek').addEventListener('input', (e) => pv.duration && (pv.currentTime = (e.target.value / 1000) * pv.duration));
$('#pplay').onclick = toggle;
$('#pback').onclick = () => (pv.currentTime -= 10);
$('#pfwd').onclick = () => (pv.currentTime += 10);
$('#pvol').oninput = (e) => { pv.volume = e.target.value; pv.muted = false; };
$('#pmute').onclick = () => { pv.muted = !pv.muted; setIcon($('#pmute'), pv.muted ? 'volume-x' : 'volume-2'); };
$('#pfs').onclick = () => (document.fullscreenElement ? document.exitFullscreen() : pl.requestFullscreen?.());
$('#pclose').onclick = closePlayer;
pl.addEventListener('mousemove', wake); pl.addEventListener('touchstart', wake, { passive: true });
document.addEventListener('keydown', (e) => {
  if (!pl.classList.contains('hidden')) {
    if (e.key === 'Escape') closePlayer();
    else if (e.key === ' ') { e.preventDefault(); toggle(); }
    else if (e.key === 'ArrowLeft') pv.currentTime -= 10;
    else if (e.key === 'ArrowRight') pv.currentTime += 10;
    else if (e.key === 'f') $('#pfs').click();
    else if (e.key === 'm') $('#pmute').click();
    wake();
  } else if (e.key === 'Escape') closeInfo();
});

/* ---------- events ---------- */
document.addEventListener('click', (e) => {
  const b = e.target.closest('.btn');
  if (b) { // ripple
    const r = b.getBoundingClientRect(), s = document.createElement('span'), d = Math.max(r.width, r.height);
    s.className = 'ripple'; Object.assign(s.style, { width: d + 'px', height: d + 'px', left: e.clientX - r.left - d / 2 + 'px', top: e.clientY - r.top - d / 2 + 'px' });
    b.appendChild(s); setTimeout(() => s.remove(), 600);
  }
  const arrow = e.target.closest('.arrow');
  if (arrow) { const sc = arrow.parentElement.querySelector('.scroller'); sc.scrollBy({ left: arrow.dataset.dir * sc.clientWidth * 0.85 }); return; }
  const hero = e.target.closest('[data-hero]');
  if (hero) return hero.dataset.hero === 'play' ? openPlayer(state.featured) : openInfo(state.featured);
  const play = e.target.closest('[data-play]');
  if (play) { closeInfo(); return openPlayer(byId(play.dataset.play)); }
  if (e.target.closest('[data-close]') || e.target === $('#info')) return closeInfo();
  const act = e.target.closest('[data-act]'), c = e.target.closest('.card');
  if (!c) return;
  const m = byId(c.dataset.id);
  if (!act) return openInfo(m);
  if (act.dataset.act === 'play') return openPlayer(m);
  const [set, key] = act.dataset.act === 'list' ? [state.list, 'myList'] : [state.liked, 'liked'];
  set.has(m.id) ? set.delete(m.id) : set.add(m.id); save(key, set);
  act.dataset.act === 'list' ? renderRows() : (act.classList.toggle('on'));
});
document.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.matches?.('.card')) openInfo(byId(e.target.dataset.id)); });
$('#hero-mute').onclick = () => { const v = $('#hero-video'); v.muted = !v.muted; $('#hero-mute').innerHTML = `<i data-lucide="${v.muted ? 'volume-x' : 'volume-2'}"></i>`; icons(); };
$('#nav-list').onclick = (e) => { e.preventDefault(); ($('#my-list') || $('#rows')).scrollIntoView(); };
addEventListener('scroll', () => $('#nav').classList.toggle('nav-solid', scrollY > 40), { passive: true });

/* ---------- boot ---------- */
(async () => {
  try {
    const d = await (await fetch('/api/media')).json();
    state.rows = d.rows; state.featured = d.featured;
    renderHero(); renderRows();
  } catch {
    $('#rows').innerHTML = '<p class="px-12 pt-24 text-zinc-400">Could not load the catalog. Refresh to try again.</p>';
  }
  icons();
})();
