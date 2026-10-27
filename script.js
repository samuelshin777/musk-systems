(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const yr = $('#year'); if (yr) yr.textContent = new Date().getFullYear();

  /* ---------- starfield ---------- */
  const sc = $('#stars'), sx = sc.getContext('2d');
  let W, H, stars = [], shooters = [], mx = 0, my = 0;
  function sizeStars() {
    W = sc.width = innerWidth * devicePixelRatio; H = sc.height = innerHeight * devicePixelRatio;
    stars = Array.from({ length: Math.min(420, (innerWidth * innerHeight) / 3200) }, () => ({
      x: Math.random() * W, y: Math.random() * H, r: Math.random() * 1.3 + .2, z: Math.random() * .8 + .2,
      t: Math.random() * 6.28, c: Math.random() < .12 ? '255,220,160' : Math.random() < .2 ? '160,215,255' : '255,255,255'
    }));
  }
  sizeStars(); addEventListener('resize', sizeStars);
  addEventListener('mousemove', (e) => { mx = e.clientX / innerWidth - .5; my = e.clientY / innerHeight - .5; });
  function drawStars(t) {
    sx.clearRect(0, 0, W, H);
    for (const s of stars) {
      const a = .35 + .65 * Math.abs(Math.sin(t / 1400 + s.t));
      sx.fillStyle = `rgba(${s.c},${a * s.z})`;
      sx.beginPath(); sx.arc(s.x - mx * 30 * s.z * devicePixelRatio, s.y - my * 30 * s.z * devicePixelRatio, s.r * devicePixelRatio, 0, 6.28); sx.fill();
    }
    if (Math.random() < .006) shooters.push({ x: Math.random() * W, y: Math.random() * H * .5, l: 0, v: 14 * devicePixelRatio });
    shooters = shooters.filter((s) => s.l < 60);
    for (const s of shooters) {
      s.l++; s.x += s.v; s.y += s.v * .45;
      const g = sx.createLinearGradient(s.x, s.y, s.x - 120 * devicePixelRatio, s.y - 54 * devicePixelRatio);
      g.addColorStop(0, `rgba(255,236,190,${1 - s.l / 60})`); g.addColorStop(1, 'rgba(255,236,190,0)');
      sx.strokeStyle = g; sx.lineWidth = 1.4 * devicePixelRatio;
      sx.beginPath(); sx.moveTo(s.x, s.y); sx.lineTo(s.x - 120 * devicePixelRatio, s.y - 54 * devicePixelRatio); sx.stroke();
    }
  }

  /* ---------- page-2 network arcs ---------- */
  const ac = $('#arcs'), ax = ac.getContext('2d');
  const page2 = $('#planet');
  let AW, AH, nodes = [], arcs = [];
  function sizeArcs() {
    AW = ac.width = page2.offsetWidth * devicePixelRatio; AH = ac.height = page2.offsetHeight * devicePixelRatio;
    const pts = [[.17, .2], [.24, .3], [.46, .17], [.5, .24], [.56, .36], [.72, .22], [.8, .3], [.3, .5], [.62, .5], [.86, .55], [.12, .42], [.4, .38]];
    nodes = pts.map(([x, y]) => ({ x: x * AW, y: y * AH * .9 }));
    arcs = Array.from({ length: 14 }, () => {
      const a = nodes[Math.floor(Math.random() * nodes.length)];
      let b = nodes[Math.floor(Math.random() * nodes.length)]; if (a === b) b = nodes[(nodes.indexOf(a) + 3) % nodes.length];
      return { a, b, p: Math.random(), s: .002 + Math.random() * .004 };
    });
  }
  function drawArcs(t) {
    ax.clearRect(0, 0, AW, AH);
    for (const n of nodes) {
      const pulse = 3 + 2 * Math.sin(t / 500 + n.x);
      ax.fillStyle = 'rgba(255,214,140,.9)'; ax.shadowBlur = 16; ax.shadowColor = '#f0c06a';
      ax.beginPath(); ax.arc(n.x, n.y, pulse * devicePixelRatio * .6, 0, 6.28); ax.fill();
    }
    ax.shadowBlur = 0;
    for (const r of arcs) {
      const cx = (r.a.x + r.b.x) / 2, cy = Math.min(r.a.y, r.b.y) - Math.abs(r.a.x - r.b.x) * .35;
      ax.strokeStyle = 'rgba(111,211,255,.18)'; ax.lineWidth = devicePixelRatio;
      ax.beginPath(); ax.moveTo(r.a.x, r.a.y); ax.quadraticCurveTo(cx, cy, r.b.x, r.b.y); ax.stroke();
      r.p = (r.p + r.s) % 1; const q = r.p, iq = 1 - q;
      const px = iq * iq * r.a.x + 2 * iq * q * cx + q * q * r.b.x, py = iq * iq * r.a.y + 2 * iq * q * cy + q * q * r.b.y;
      ax.fillStyle = '#fff3d0'; ax.shadowBlur = 14; ax.shadowColor = '#6fd3ff';
      ax.beginPath(); ax.arc(px, py, 2.2 * devicePixelRatio, 0, 6.28); ax.fill(); ax.shadowBlur = 0;
    }
  }
  sizeArcs(); addEventListener('resize', sizeArcs);
  let p2visible = false;
  new IntersectionObserver(([e]) => { p2visible = e.isIntersecting; if (e.isIntersecting) sizeArcs(); }).observe(page2);

  function loop(t) { drawStars(t); if (p2visible) drawArcs(t); if (!reduce) requestAnimationFrame(loop); }
  requestAnimationFrame(loop);

  /* ---------- hero parallax ---------- */
  const para = $$('[data-parallax]');
  addEventListener('mousemove', () => {
    if (reduce) return;
    for (const el of para) { const k = +el.dataset.parallax; el.style.transform = `translate(${-mx * k}px,${-my * k}px)`; }
  });

  /* ---------- scroll: progress, nav + dots ---------- */
  const bar = $('.scroll-progress span');
  const navLinks = $$('.nav a'), dots = $$('.page-dots a');
  const sections = ['home', 'frontiers', 'planet', 'timeline', 'projects'].map((id) => document.getElementById(id));
  function onScroll() {
    const h = document.documentElement; bar.style.width = (h.scrollTop / (h.scrollHeight - h.clientHeight)) * 100 + '%';
    const onP2 = page2.getBoundingClientRect().top < innerHeight * .5;
    dots.forEach((d, i) => d.classList.toggle('is-active', onP2 ? i === 1 : i === 0));
    let cur = 'home';
    for (const s of sections) if (s && s.getBoundingClientRect().top < innerHeight * .45) cur = s.id;
    navLinks.forEach((a) => a.classList.toggle('is-active', a.getAttribute('href') === '#' + cur));
  }
  addEventListener('scroll', onScroll, { passive: true }); onScroll();

  /* ---------- mobile menu ---------- */
  const menu = $('.menu-btn'), nav = $('#nav');
  menu?.addEventListener('click', () => { const o = menu.getAttribute('aria-expanded') === 'true'; menu.setAttribute('aria-expanded', String(!o)); nav.classList.toggle('open', !o); });
  navLinks.forEach((a) => a.addEventListener('click', () => { menu?.setAttribute('aria-expanded', 'false'); nav.classList.remove('open'); }));

  /* ---------- counters ---------- */
  const counters = $$('[data-count]');
  const io = new IntersectionObserver((ents) => ents.forEach((e) => {
    if (!e.isIntersecting) return; io.unobserve(e.target);
    const el = e.target, end = +el.dataset.count, pre = el.dataset.prefix || '', suf = el.dataset.suffix || '', t0 = performance.now();
    const step = (t) => { const k = Math.min(1, (t - t0) / 1800), v = Math.round(end * (1 - Math.pow(1 - k, 4))); el.textContent = pre + v.toLocaleString('en-US') + suf; if (k < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  }), { threshold: .6 });
  counters.forEach((c) => io.observe(c));

  /* ---------- live news v2: daily edition + countdown + live fallback ---------- */
  const R = window.MS_RENDER;
  const grid = $('#news-grid');
  const PAGE = 8;
  let cat = 'all', q = '', shown = PAGE, allItems = null;
  const moreBtn = $('#more-btn');
  function applyView() {
    const cards = $$('.news-card', grid);
    let visible = 0;
    cards.forEach((c) => {
      const match = (cat === 'all' || c.dataset.cat === cat) && (!q || c.textContent.toLowerCase().includes(q));
      c.hidden = !match;
      if (match) { visible++; c.classList.toggle('is-hidden-more', visible > shown); }
    });
    if (moreBtn) moreBtn.hidden = visible <= shown;
    const nc = $('#news-count'); if (nc) nc.textContent = `${visible} STORIES`;
    $$('.pl-row').forEach((r) => r.classList.toggle('on', r.dataset.cat === cat));
  }
  function setCat(c) { cat = c; shown = PAGE; $$('.chip').forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.cat === c))); applyView(); }
  $$('.chip').forEach((ch) => ch.addEventListener('click', () => setCat(ch.dataset.cat)));
  document.addEventListener('click', (e) => { const r = e.target.closest('.pl-row'); if (r) setCat(cat === r.dataset.cat ? 'all' : r.dataset.cat); });
  $$('.f-card[data-filter]').forEach((card) => card.addEventListener('click', () => setCat(card.dataset.filter)));
  $('#feed-q')?.addEventListener('input', (e) => { q = e.target.value.trim().toLowerCase(); shown = PAGE; applyView(); });
  moreBtn?.addEventListener('click', () => { shown += PAGE; applyView(); });

  function renderEdition(items) {
    if (!R || !items || !items.length) return;
    allItems = items;
    grid.innerHTML = items.slice(0, 60).map((i) => R.card(i, '', Date.now())).join('');
    const tk = $('#ticker'); if (tk) { tk.innerHTML = R.ticker(items); dupTicker(); }
    applyView();
  }
  function dupTicker() {
    const tk = $('#ticker'); if (!tk || tk.dataset.dup === '1' || !tk.children.length) return;
    tk.innerHTML += tk.innerHTML; tk.dataset.dup = '1';
  }
  dupTicker();

  // countdown to the next scheduled edition
  let nextRun = null;
  function tick() {
    const el = $('.st-next'); if (!el) return;
    if (!nextRun) nextRun = new Date(el.dataset.next);
    if (isNaN(nextRun)) return;
    let ms = nextRun - Date.now();
    if (ms < 0) ms = (ms % 86400000) + 86400000; // already past (stale build): show time to the following slot
    const h = Math.floor(ms / 3600e3), m = Math.floor(ms / 60e3) % 60, s = Math.floor(ms / 1e3) % 60;
    el.innerHTML = `NEXT EDITION IN <b>${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}</b>`;
  }
  setInterval(tick, 1000); tick();

  async function liveFallback() {
    // Only used when the daily build is missing or older than staleAfterHours (scheduler stopped).
    const rss = 'https://news.google.com/rss/search?q=' + encodeURIComponent('Elon Musk OR SpaceX OR Starship OR Starlink OR Tesla OR Neuralink OR xAI when:1d') + '&hl=en-US&gl=US&ceid=US:en';
    const r = await fetch('https://api.rss2json.com/v1/api.json?rss_url=' + encodeURIComponent(rss));
    const j = await r.json();
    if (j.status !== 'ok' || !j.items?.length) return;
    const CATS = [['neuro', /neuralink|blindsight|brain/i], ['robotics', /optimus|humanoid/i], ['ai', /\bxai\b|grok|\bai\b/i], ['connectivity', /starlink/i], ['space', /spacex|starship|falcon|dragon|rocket|launch|nasa|mars|orbit/i], ['mobility', /tesla|robotaxi|cybercab|fsd|self-driving|boring/i]];
    const classify = (t) => (CATS.find(([, re]) => re.test(t)) || ['business'])[0];
    renderEdition(j.items.map((i) => {
      const parts = i.title.split(' - '); const source = parts.length > 1 ? parts.pop() : (i.author || 'News');
      return { title: parts.join(' - '), url: i.link, source, sources: [source], date: new Date(i.pubDate.replace(' ', 'T') + 'Z').toISOString(), category: classify(i.title) };
    }));
    $('#status-bar')?.classList.add('live-mode');
  }

  /* Daily edition loader.
     The edition is rebuilt every morning on GitHub and published to GitHub Pages (LIVE_BASE).
     A copy of this page hosted anywhere else (e.g. Cafe24) pulls that day's edition from there,
     so the site updates daily without FTP uploads or DNS changes. GitHub Pages allows cross-site reads (CORS). */
  const LIVE_BASE = 'https://samuelshin777.github.io/musk-systems/';
  const onLiveHost = location.href.startsWith(LIVE_BASE);
  const bases = (/^https?:$/.test(location.protocol) && !onLiveHost) ? [LIVE_BASE, ''] : ['', LIVE_BASE];
  const bust = '?v=' + new Date().toISOString().slice(0, 13);
  async function getJSON(name) {
    for (const b of bases) {
      try { const r = await fetch(b + 'data/' + name + bust, { cache: 'no-store' }); if (r.ok) return await r.json(); } catch (_) { /* try next */ }
    }
    return null;
  }
  function renderAll({ news, status, briefing, projects, answers }) {
    if (!R) return;
    if (news?.items?.length) renderEdition(news.items);
    if (status) { const sb = $('#status-bar'); if (sb) sb.innerHTML = R.status(status); nextRun = null; tick(); }
    if (briefing) {
      const ts = $('#top-story'); if (ts && briefing.topStory) ts.innerHTML = R.topStory(briefing.topStory);
      const pl = $('#pulse'); if (pl) pl.innerHTML = R.pulse(briefing);
      const ed = $('#edition-date'); if (ed) ed.textContent = briefing.date || '';
    }
    if (projects?.projects) { const ul = $('.proj'); if (ul) ul.innerHTML = R.projects(projects); }
    if (answers?.answers?.length) { const qa = $('#qa-list'); if (qa) qa.innerHTML = R.answers(answers.answers); }
    const day = (news?.updated || '').slice(0, 10);
    const pill = $('.updated-pill'); if (pill && day) pill.innerHTML = `<i class="dot live"></i> NEWS FEED UPDATED ${day}`;
  }
  (async () => {
    const [news, status, briefing, projects, answers] = await Promise.all(['news.json', 'status.json', 'briefing.json', 'projects.json', 'answers.json'].map(getJSON));
    if (!news) { applyView(); try { await liveFallback(); } catch (_) { /* offline */ } return; }
    renderAll({ news, status, briefing, projects, answers });
    const stale = (status?.staleAfterHours || 26) * 3600e3;
    if (Date.now() - new Date(news.updated).getTime() > stale) { try { await liveFallback(); } catch (_) { /* keep edition */ } }
  })();
  applyView();

  /* ---------- copy buttons (email, site link) ---------- */
  document.addEventListener('click', async (e) => {
    const b = e.target.closest('.copy-btn'); if (!b) return;
    const text = b.hasAttribute('data-copy-url') ? location.href.split('#')[0] : ($(b.dataset.copy)?.textContent || '').trim();
    const label = b.textContent;
    try { await navigator.clipboard.writeText(text); b.textContent = 'Copied'; }
    catch (_) {
      const t = $(b.dataset.copy || 'x');
      if (t) { const r = document.createRange(); r.selectNodeContents(t); const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r); b.textContent = 'Selected — press Ctrl+C'; }
      else b.textContent = text;
    }
    b.classList.add('done'); setTimeout(() => { b.textContent = label; b.classList.remove('done'); }, 2200);
  });
  // open the matching answer when someone arrives from search with #answers
  if (location.hash === '#answers') $('#answers')?.scrollIntoView();

  /* ---------- timeline: arrows, drag, auto-drift ---------- */
  const tl = $('#tl');
  const by = (d) => tl.scrollBy({ left: d * 420, behavior: 'smooth' });
  $('.tl-prev').addEventListener('click', () => by(-1)); $('.tl-next').addEventListener('click', () => by(1));
  let drag = null;
  tl.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, s: tl.scrollLeft }; tl.style.scrollSnapType = 'none'; });
  addEventListener('pointerup', () => { drag = null; tl.style.scrollSnapType = ''; });
  addEventListener('pointermove', (e) => { if (drag) tl.scrollLeft = drag.s - (e.clientX - drag.x); });
  let hover = false; tl.addEventListener('mouseenter', () => hover = true); tl.addEventListener('mouseleave', () => hover = false);
  if (!reduce) setInterval(() => { if (hover || drag || !p2visible) return; if (tl.scrollLeft + tl.clientWidth >= tl.scrollWidth - 4) tl.scrollTo({ left: 0, behavior: 'smooth' }); else by(1); }, 4200);

  /* ---------- hashtag marquee ---------- */
  const track = $('#tag-cloud');
  if (track && track.children.length) { const clone = track.cloneNode(true); clone.removeAttribute('id'); clone.setAttribute('aria-hidden', 'true'); track.parentNode.appendChild(clone); }

  /* ---------- launch sequence ---------- */
  const layer = $('#launch-layer');
  $('#launch-btn')?.addEventListener('click', () => {
    layer.classList.remove('go'); void layer.offsetWidth; layer.classList.add('go');
    setTimeout(() => { layer.classList.remove('go'); page2.scrollIntoView({ behavior: 'smooth' }); }, 2300);
  });

  /* ---------- search ---------- */
  const panel = $('#search-panel'), input = $('#site-search'), out = $('#search-results');
  const open = (q = '') => { panel.hidden = false; document.body.classList.add('modal-open'); input.value = q; run(q); setTimeout(() => input.focus(), 30); };
  const close = () => { panel.hidden = true; document.body.classList.remove('modal-open'); };
  $('.search-open').addEventListener('click', () => open());
  $('.search-close').addEventListener('click', close);
  panel.addEventListener('click', (e) => { if (e.target === panel) close(); });
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && !panel.hidden) close(); });
  function run(q) {
    q = q.trim().toLowerCase().replace(/^#/, '');
    if (!q) { out.innerHTML = '<a href="#frontiers">Browse the frontiers <span>→</span></a>'; return; }
    const pool = $$('.f-card, .news-card, .proj li, .tl li, .top-story, .qa');
    const flat = q.replace(/\s+/g, '');
    const hits = pool.filter((el) => { const t = el.innerText.toLowerCase(); return t.includes(q) || t.replace(/\s+/g, '').includes(flat); });
    if (!hits.length) { out.innerHTML = '<p>No match. Try Starship, Starlink, Tesla, Optimus, Grok or Neuralink.</p>'; return; }
    out.innerHTML = hits.slice(0, 10).map((el) => {
      const title = (el.querySelector('h3, b')?.textContent || 'Result').trim();
      if (el.classList.contains('qa')) return `<a href="#answers">${esc(title)}<span>→</span></a>`;
      const ext = el.querySelector('a.src, a.ts-btn');
      const target = el.closest('[id]')?.id || 'planet';
      return ext ? `<a href="${esc(ext.href)}" target="_blank" rel="noopener nofollow">${esc(title)}<span>↗</span></a>` : `<a href="#${target}">${esc(title)}<span>→</span></a>`;
    }).join('');
    $$('a', out).forEach((a) => a.addEventListener('click', close));
  }
  input.addEventListener('input', (e) => run(e.target.value));
  document.addEventListener('click', (e) => {
    const a = e.target.closest('.marquee-track a[data-tag]'); if (!a) return;
    e.preventDefault(); open(a.dataset.tag.replace(/([a-z])([A-Z0-9])/g, '$1 $2'));
  });
})();
