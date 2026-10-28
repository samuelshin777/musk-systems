#!/usr/bin/env node
/**
 * Musk Systems — daily news engine v2
 * ===================================
 * One run = one daily edition. Scheduled once a day (see .github/workflows/daily-update.yml),
 * and also called by the /goal command (.claude/commands/goal.md).
 *
 *  1. COLLECT   Google News RSS (config.googleQueries) + direct publisher feeds (config.feeds),
 *               2 retries per source, 4 sources in parallel
 *  2. CLEAN     relevance filter, thumbnail + snippet extraction, story clustering
 *               (the same story from several outlets becomes one item with "N outlets")
 *  3. RANK      score = recency + coverage + source quality + milestone keywords
 *  4. ANALYSE   keyword & hashtag ranking from all visible site text + headlines
 *  5. PUBLISH   index.html AUTO blocks, data/*.json, news/YYYY-MM-DD.html digests, archive,
 *               feed.xml, sitemap.xml, robots.txt, llms.txt, SEO-KEYWORDS-HASHTAGS.txt
 *  6. REPORT    data/status.json (health, source success, next scheduled run)
 *
 * Safety: never wipes the feed. If every source fails, the previous edition is kept and
 * status.ok=false is written so the watchdog and the /goal command can react.
 *
 *   node scripts/update.mjs            normal daily run
 *   node scripts/update.mjs --offline  rebuild every output from data/*.json only (no network)
 * Env: SITE_URL (overrides config.siteUrl), INDEXNOW_KEY (optional search-engine ping)
 * Requires Node 18+. No npm dependencies.
 */
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const p = (...s) => path.join(ROOT, ...s);
const OFFLINE = process.argv.includes('--offline');
const readJSON = async (f, fb) => (existsSync(p(f)) ? JSON.parse(await readFile(p(f), 'utf8')) : fb);

const config = await readJSON('site.config.json');
const SITE = (process.env.SITE_URL || config.siteUrl).replace(/\/$/, '');
const NOW = new Date();
const TODAY = NOW.toISOString().slice(0, 10);
const HOUR = 3600e3;

await import(pathToFileURL(p('render.js')).href);
const R = globalThis.MS_RENDER;
const { esc, LABEL } = R;

/* ---------- helpers ---------- */
const decode = (s = '') => s
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').trim();
const stripTags = (s) => decode(decode(s).replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
const clip = (s, n) => (s.length <= n ? s : s.slice(0, s.lastIndexOf(' ', n - 1) > n * 0.6 ? s.lastIndexOf(' ', n - 1) : n - 1) + '…');
const norm = (t) => t.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
const fmtDate = R.fmt;
const hash = (s) => { let h = 5381; for (const c of s) h = ((h << 5) + h + c.charCodeAt(0)) >>> 0; return h.toString(36); };
const replaceBlock = (html, name, content) => {
  const re = new RegExp(`(<!-- AUTO:${name}:START -->)[\\s\\S]*?(<!-- AUTO:${name}:END -->)`);
  if (!re.test(html)) throw new Error(`Marker AUTO:${name} not found in index.html`);
  return html.replace(re, (_, a, b) => a + content + b); // function form: '$' in CSS/JS/headlines stays literal
};
const withSite = (s) => s.split('https://YOUR-DOMAIN.com').join(SITE);

/* ---------- classification & relevance ---------- */
const CATEGORIES = [
  ['neuro', /neuralink|blindsight|brain[- ]computer|telepathy|brain implant/i],
  ['robotics', /optimus|humanoid/i],
  ['ai', /\bxai\b|grok|colossus|artificial intelligence|\bai\b|data cent(er|re)/i],
  ['connectivity', /starlink|starshield|satellite internet|direct[- ]to[- ]cell/i],
  ['space', /spacex|starship|falcon|dragon|starbase|rocket|launch|nasa|artemis|mars|orbit|super heavy/i],
  ['mobility', /tesla|robotaxi|cybercab|cybertruck|\bfsd\b|self[- ]driving|model [3ysx]|megapack|powerwall|boring company|tunnel/i],
  ['business', /ipo|shares|stock|nasdaq|valuation|earnings|investor|merger|deal|trillion|spcx|tsla/i]
];
const RELEVANT = /musk|spacex|starship|starlink|starshield|tesla|optimus|neuralink|\bxai\b|grok|boring company|cybercab|robotaxi|falcon 9|falcon heavy|starbase|super heavy|\bspcx\b|\btsla\b/i;
const classify = (t) => (CATEGORIES.find(([, re]) => re.test(t)) || ['business'])[0];
const T1 = new Set(config.sourceTiers.tier1.map((s) => s.toLowerCase()));
const T2 = new Set(config.sourceTiers.tier2.map((s) => s.toLowerCase()));
const tierOf = (src = '') => (T1.has(src.toLowerCase()) ? 3 : T2.has(src.toLowerCase()) ? 1.5 : 0);
const MILESTONE = /launch|landing|catch|ipo|earnings|record|first|unveil|approv|fda|faa|acquir|merger|lawsuit|recall|crash|explod|orbit|milestone|deliver/i;

/* ---------- 1. collect ---------- */
async function fetchText(url) {
  let last;
  for (let attempt = 1; attempt <= 3; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 20000);
    try {
      const res = await fetch(url, { signal: ctrl.signal, headers: { 'User-Agent': 'MuskSystemsBot/2.0 (+' + SITE + ')', Accept: 'application/rss+xml, application/xml, text/xml, */*' } });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return await res.text();
    } catch (e) { last = e; await new Promise((r) => setTimeout(r, 1500 * attempt)); }
    finally { clearTimeout(timer); }
  }
  throw last;
}

function parseFeed(xml, src) {
  const blocks = [...xml.matchAll(/<(item|entry)\b[\s\S]*?<\/\1>/g)].map((m) => m[0]);
  return blocks.map((b) => {
    const get = (tag) => { const m = b.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`)); return m ? m[1] : ''; };
    const attr = (tag, a) => { const m = b.match(new RegExp(`<${tag}\\b[^>]*\\b${a}="([^"]+)"`)); return m ? decode(m[1]) : ''; };
    let title = stripTags(get('title'));
    let url = decode(get('link')) || attr('link', 'href');
    const date = new Date(decode(get('pubDate') || get('published') || get('updated') || get('dc:date')));
    const source = stripTags(get('source')) || src.name;
    if (src.google && source && title.endsWith(' - ' + source)) title = title.slice(0, -(source.length + 3));
    const body = decode(get('content:encoded') || get('description') || get('summary') || get('content'));
    let image = '';
    const media = b.match(/<media:(?:content|thumbnail)\b[^>]*\burl="([^"]+)"/);
    const encl = b.match(/<enclosure\b[^>]*\burl="([^"]+)"[^>]*type="image/) || b.match(/<enclosure\b[^>]*type="image[^"]*"[^>]*\burl="([^"]+)"/);
    const inline = body.match(/<img\b[^>]*\bsrc="([^"]+)"/i);
    image = decode((media && media[1]) || (encl && encl[1]) || (inline && inline[1]) || '');
    if (!/^https:\/\//.test(image) || /pixel|1x1|feedburner|gravatar/i.test(image)) image = '';
    const snippet = src.google ? '' : clip(stripTags(body), 190);
    return { title, url, source, date: isNaN(date) ? NOW.toISOString() : date.toISOString(), image, snippet };
  }).filter((i) => i.title && /^https?:\/\//.test(i.url) && RELEVANT.test(i.title + ' ' + i.snippet));
}

const sources = [
  ...config.googleQueries.map((q) => ({ name: 'Google News · ' + q, google: true, url: `https://news.google.com/rss/search?q=${encodeURIComponent(q + ' when:2d')}&hl=en-US&gl=US&ceid=US:en` })),
  ...config.feeds.map((f) => ({ ...f, google: false }))
];
const store = await readJSON('data/news.json', { items: [] });
const prevIds = new Set(store.items.map((i) => i.id || hash(i.url)));
const fresh = [];
const failed = [];
let sourcesOk = 0;

if (!OFFLINE) {
  const queue = [...sources];
  await Promise.all(Array.from({ length: 4 }, async () => {
    for (let s; (s = queue.shift());) {
      try {
        const got = parseFeed(await fetchText(s.url), s);
        sourcesOk++; fresh.push(...got);
        console.log(`✓ ${s.name}: ${got.length}`);
      } catch (e) { failed.push(s.name); console.warn(`✗ ${s.name}: ${e.message}`); }
    }
  }));
}

/* ---------- 2. clean & cluster ---------- */
const STOP_T = new Set('the a an and or of to in on for with as at by from is are was be its it after new says said over into up about will could than that this how why what more amid via his her their has have just now report reports'.split(' '));
const tokens = (t) => new Set(norm(t).split(' ').filter((w) => w.length > 2 && !STOP_T.has(w)));
const jaccard = (a, b) => { let n = 0; for (const w of a) if (b.has(w)) n++; return n / (a.size + b.size - n || 1); };

const pool = [
  ...store.items.map((i) => ({ ...i, sources: i.sources || [i.source], firstSeen: i.firstSeen || i.date })),
  ...fresh.map((i) => ({ ...i, sources: [i.source], firstSeen: NOW.toISOString() }))
];
const clusters = [];
for (const it of pool) {
  const tk = tokens(it.title);
  const t = new Date(it.date).getTime();
  const c = clusters.find((c) => c.urls.has(it.url) || (Math.abs(c.t - t) < 3 * 24 * HOUR && jaccard(c.tk, tk) >= 0.5));
  if (c) { c.members.push(it); c.urls.add(it.url); } else clusters.push({ tk, t, urls: new Set([it.url]), members: [it] });
}
let items = clusters.map(({ members }) => {
  const rep = [...members].sort((a, b) => tierOf(b.source) - tierOf(a.source) || (b.image ? 1 : 0) - (a.image ? 1 : 0) || (b.snippet || '').length - (a.snippet || '').length)[0];
  const srcs = [...new Set(members.flatMap((m) => m.sources))];
  return {
    id: hash(rep.url), title: rep.title, url: rep.url, source: rep.source, sources: srcs,
    date: members.map((m) => m.date).sort()[0],
    firstSeen: members.map((m) => m.firstSeen).sort()[0],
    image: rep.image || members.find((m) => m.image)?.image || '',
    snippet: rep.snippet || members.find((m) => m.snippet)?.snippet || '',
    category: rep.category || classify(rep.title + ' ' + (rep.snippet || ''))
  };
});

/* ---------- 3. rank ---------- */
for (const i of items) {
  const ageH = Math.max(0, (NOW - new Date(i.date)) / HOUR);
  const bestTier = Math.max(...i.sources.map(tierOf));
  i.score = +(10 * Math.exp(-ageH / 36) + 2 * Math.min(i.sources.length, 6) + bestTier + (MILESTONE.test(i.title) ? 2 : 0) + (/musk/i.test(i.title) ? 1 : 0)).toFixed(2);
}
const cutoff = NOW.getTime() - config.keepDays * 24 * HOUR;
items = items
  .sort((a, b) => new Date(b.date) - new Date(a.date))
  .filter((i, n) => new Date(i.date).getTime() >= cutoff || n < config.homepageCards)
  .slice(0, config.maxItems);
const newItems = items.filter((i) => !prevIds.has(i.id)).length;

const editionOk = OFFLINE || sourcesOk > 0;
if (!editionOk) console.warn('All sources failed — keeping the previous edition.');
await writeFile(p('data/news.json'), JSON.stringify({ updated: editionOk ? NOW.toISOString() : store.updated, items }, null, 2));

/* ---------- history (14/60-day volume) ---------- */
const history = await readJSON('data/history.json', { days: {} });
const byDay = {};
for (const i of items) {
  const d = i.date.slice(0, 10);
  (byDay[d] ||= { total: 0 }); byDay[d].total++; byDay[d][i.category] = (byDay[d][i.category] || 0) + 1;
}
for (const [d, v] of Object.entries(byDay)) if (!history.days[d] || v.total >= history.days[d].total) history.days[d] = v;
for (const d of Object.keys(history.days)) if (new Date(d).getTime() < NOW.getTime() - 60 * 24 * HOUR) delete history.days[d];
await writeFile(p('data/history.json'), JSON.stringify(history, null, 2));
const spark = Array.from({ length: 14 }, (_, k) => {
  const d = new Date(NOW.getTime() - (13 - k) * 24 * HOUR).toISOString().slice(0, 10);
  return { date: d, total: history.days[d]?.total || 0 };
});

/* ---------- 4. analyse: keywords & hashtags ---------- */
const PHRASES = {
  'Elon Musk': 'ElonMusk', 'SpaceX': 'SpaceX', 'Starship': 'Starship', 'Starlink': 'Starlink', 'Tesla': 'Tesla',
  'Optimus': 'Optimus', 'Neuralink': 'Neuralink', 'Blindsight': 'Blindsight', 'Telepathy': 'NeuralinkTelepathy',
  'xAI': 'xAI', 'Grok': 'Grok', 'Cybercab': 'Cybercab', 'Robotaxi': 'Robotaxi', 'FSD': 'FSD', 'Full Self-Driving': 'FSD',
  'Falcon 9': 'Falcon9', 'Falcon Heavy': 'FalconHeavy', 'Dragon': 'SpaceXDragon', 'Super Heavy': 'SuperHeavy',
  'Starbase': 'Starbase', 'Boring Company': 'BoringCompany', 'Mars': 'Mars', 'Moon': 'Moon', 'Artemis': 'Artemis',
  'NASA': 'NASA', 'FAA': 'FAA', 'PayPal': 'PayPal', 'Zip2': 'Zip2', 'IPO': 'SpaceXIPO', 'SPCX': 'SPCX', 'TSLA': 'TSLA',
  'Nasdaq': 'Nasdaq', 'Megapack': 'Megapack', 'earnings': 'Earnings', 'Cybertruck': 'Cybertruck',
  'reusable': 'ReusableRockets', 'satellite': 'SatelliteInternet', 'humanoid': 'HumanoidRobot',
  'artificial intelligence': 'ArtificialIntelligence', 'robot': 'Robotics', 'electric': 'ElectricVehicles',
  'autonomous': 'AutonomousDriving', 'brain': 'BrainComputerInterface', 'orbit': 'SpaceExploration',
  'multiplanetary': 'Multiplanetary', 'energy': 'CleanEnergy', 'first principles': 'FirstPrinciples',
  'innovation': 'Innovation', 'future': 'FutureTech', 'data cent': 'OrbitalDataCenters', 'catch': 'TowerCatch'
};
const countPhrases = (text) => {
  const m = new Map();
  for (const [phrase, tag] of Object.entries(PHRASES)) {
    const re = new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), phrase === phrase.toLowerCase() ? 'gi' : 'g');
    const n = (text.match(re) || []).length;
    if (n) m.set(tag, (m.get(tag) || 0) + n);
  }
  return m;
};
let siteHtml = await readFile(p('index.html'), 'utf8');
const visible = siteHtml
  .replace(/<!-- AUTO:(\w+):START -->[\s\S]*?<!-- AUTO:\1:END -->/g, ' ')
  .replace(/<head>[\s\S]*?<\/head>/, ' ').replace(/<script[\s\S]*?<\/script>/g, ' ')
  .replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ');
const corpus = visible + ' ' + items.slice(0, 60).map((i) => i.title + '. ' + i.snippet).join(' . ').repeat(2);
const scores = countPhrases(corpus);
['MuskSystems', 'ElonMusk', 'FutureTechnology', 'SystemsThinking'].forEach((t) => scores.set(t, (scores.get(t) || 0) + 3));
const hashtags = [...scores.entries()].sort((a, b) => b[1] - a[1]).slice(0, 40).map(([tag, score]) => ({ tag: '#' + tag, score }));
const TAG_TO_PHRASE = Object.fromEntries(Object.entries(PHRASES).map(([ph, t]) => [t, ph === ph.toLowerCase() ? t.replace(/([a-z])([A-Z0-9])/g, '$1 $2') : ph]));
const keywords = hashtags.slice(0, 25).map((h) => TAG_TO_PHRASE[h.tag.slice(1)] || h.tag.slice(1).replace(/([a-z])([A-Z0-9])/g, '$1 $2'));
await writeFile(p('data/hashtags.json'), JSON.stringify({ updated: NOW.toISOString(), hashtags, keywords }, null, 2));

/* ---------- daily briefing ---------- */
const within = (h) => items.filter((i) => NOW - new Date(i.date) < h * HOUR);
let windowItems = within(24), windowLabel = 'LAST 24H';
if (windowItems.length < 3) { windowItems = within(24 * 7); windowLabel = 'LAST 7 DAYS'; }
if (windowItems.length < 3) { windowItems = items.slice(0, 20); windowLabel = 'LATEST 20'; }
const counts = {};
for (const i of windowItems) counts[i.category] = (counts[i.category] || 0) + 1;
const ranked = [...(within(48).length ? within(48) : windowItems)].sort((a, b) => b.score - a.score);
const topStory = ranked[0] || items[0] || null;
const mostActive = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
const trendMap = countPhrases(windowItems.map((i) => i.title).join(' . '));
['ElonMusk', 'MuskSystems'].forEach((t) => trendMap.delete(t));
const editorFile = await readJSON('data/editor.json', null);
const editorFresh = editorFile && NOW - new Date(editorFile.generated || editorFile.date) < 30 * HOUR;
const briefing = {
  date: TODAY,
  windowLabel,
  total: windowItems.length,
  counts,
  topStory,
  topList: ranked.filter((i) => i !== topStory).slice(0, 6),
  trending: [...trendMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([t]) => t),
  spark,
  summary: `${windowItems.length} stories (${windowLabel.toLowerCase()}). Most active frontier: ${mostActive ? LABEL[mostActive[0]] : '—'}.${topStory ? ` Top story: ${topStory.title}.` : ''}`,
  editor: editorFresh ? editorFile : null
};
await writeFile(p('data/briefing.json'), JSON.stringify(briefing, null, 2));

/* ---------- status ---------- */
const next = new Date(Date.UTC(NOW.getUTCFullYear(), NOW.getUTCMonth(), NOW.getUTCDate(), config.schedule.hourUtc, config.schedule.minuteUtc));
if (next <= NOW) next.setUTCDate(next.getUTCDate() + 1);
const prevStatus = await readJSON('data/status.json', null);
const status = {
  engine: 'v2',
  lastRun: NOW.toISOString(),
  mode: OFFLINE ? 'offline-rebuild' : 'live',
  ok: OFFLINE ? true : sourcesOk > 0 && newItems >= config.minNewItemsForHealthy,
  editionKept: !editionOk,
  sourcesOk: OFFLINE ? (prevStatus?.sourcesOk ?? null) : sourcesOk,
  sourcesTotal: sources.length,
  failed: OFFLINE ? (prevStatus?.failed || []) : failed,
  newItems,
  totalItems: items.length,
  nextRun: next.toISOString(),
  scheduleLabel: config.schedule.label,
  staleAfterHours: config.schedule.staleAfterHours
};
await writeFile(p('data/status.json'), JSON.stringify(status, null, 2));

/* ---------- 5. publish: homepage ---------- */
const projects = await readJSON('data/projects.json', null);

/* daily answers — answer-first Q&A for Google featured snippets and AI answer engines */
const sentence = (t) => (t ? t.trim().replace(/[.\s]*$/, '.') : '');
const proj = (name) => projects?.projects.find((x) => x.name.toLowerCase().startsWith(name.toLowerCase()));
const latestIn = (cats, n = 3) => items.filter((i) => cats.includes(i.category)).slice(0, n);
const linkOf = (i) => ({ title: i.title, url: i.url, source: i.source, date: i.date });
const headlineLine = (list) => list.length ? ` Latest: ${list.slice(0, 2).map((i) => `${sentence(i.title).slice(0, -1)} (${i.source}, ${fmtDate(i.date)})`).join('; ')}.` : '';
const editorText = briefing.editor?.bullets?.length ? briefing.editor.bullets.slice(0, 3).join(' ') : briefing.summary;
const qa = [
  { q: 'What is the latest Elon Musk news today?', a: `As of ${fmtDate(NOW)}: ${editorText}`, links: ranked.slice(0, 3).map(linkOf) },
  { q: 'What is SpaceX working on right now?', a: [proj('Starship') && `Starship: ${sentence(proj('Starship').note)}`, proj('Starlink') && `Starlink: ${sentence(proj('Starlink').note)}`].filter(Boolean).join(' ') + headlineLine(latestIn(['space', 'connectivity'])), links: latestIn(['space', 'connectivity']).map(linkOf) },
  { q: 'What is Tesla working on right now?', a: [proj('Cybercab') && `Cybercab and Robotaxi: ${sentence(proj('Cybercab').note)}`, proj('Optimus') && `Optimus: ${sentence(proj('Optimus').note)}`].filter(Boolean).join(' ') + headlineLine(latestIn(['mobility', 'robotics'])), links: latestIn(['mobility', 'robotics']).map(linkOf) },
  { q: 'What are xAI and Neuralink doing now?', a: [proj('Grok') && `xAI and Grok: ${sentence(proj('Grok').note)}`, proj('Telepathy') && `Neuralink: ${sentence(proj('Telepathy').note)}`].filter(Boolean).join(' ') + headlineLine(latestIn(['ai', 'neuro'])), links: latestIn(['ai', 'neuro']).map(linkOf) },
  { q: 'How often is Musk Systems updated?', a: `A new edition is built automatically every day at ${config.schedule.label.replace(/^DAILY /, '')} (${String(config.schedule.hourUtc).padStart(2, '0')}:${String(config.schedule.minuteUtc).padStart(2, '0')} UTC). This edition was built on ${fmtDate(NOW)} from ${sources.length} sources and holds ${items.length} stories, each linked to its original publisher.`, links: [] },
  { q: 'Is Musk Systems an official Elon Musk website?', a: 'No. Musk Systems is an independent, unofficial fan tracker. It is not affiliated with or endorsed by Elon Musk, SpaceX, Tesla, xAI, X, Neuralink or The Boring Company, and nothing on it is investment advice.', links: [] }
];
await writeFile(p('data/answers.json'), JSON.stringify({ updated: NOW.toISOString(), answers: qa }, null, 2));

/* embedded artwork + inlined CSS/JS: index.html runs on its own, with or without the assets folder */
const ART_FILES = { hero: 'hero-launch', space: 'card-space', connect: 'card-connect', energy: 'card-energy', ai: 'card-ai', city: 'card-city', planet: 'planet-map', sat: 'satellite', logo: 'salahuddin-logo' };
const artVars = async (mode) => {
  const out = [];
  for (const [k, file] of Object.entries(ART_FILES)) {
    const fp = p('assets', file + '.webp');
    if (!existsSync(fp)) continue;
    out.push(`--art-${k}:url(${mode === 'embed' ? `"data:image/webp;base64,${(await readFile(fp)).toString('base64')}"` : `"${mode}assets/${file}.webp"`})`);
  }
  return `:root{${out.join(';')}}`;
};
const inlineCss = `<style id="ms-css">${await artVars('embed')}\n${await readFile(p('styles.css'), 'utf8')}</style>`;
/* ASP/IIS-safe inlining: classic ASP servers that parse .html stop with "ASP 0138 nested script block"
   when a script contains the text "<script", and treat "<%" / "%>" / runat as server code. Refuse to build if any appear. */
const ASP_TRAPS = [/<\/?script/i, /<%/, /%>/, /runat\s*=/i];
const safeJs = (js, name) => {
  for (const re of ASP_TRAPS) if (re.test(js)) throw new Error(`${name} contains ${re} — remove it so ASP/IIS hosts can serve index.html`);
  return js;
};
const inlineJs = `<script id="ms-render">${safeJs(await readFile(p('render.js'), 'utf8'), 'render.js')}</script>\n<script id="ms-app">${safeJs(await readFile(p('script.js'), 'utf8'), 'script.js')}</script>`;
const homeList = items.slice(0, config.homepageCards);
const ld = {
  '@context': 'https://schema.org', '@type': 'ItemList', '@id': `${SITE}/#latest-news`,
  name: 'Latest Elon Musk news', dateModified: NOW.toISOString(), keywords: keywords.join(', '),
  itemListElement: homeList.slice(0, 20).map((i, n) => ({ '@type': 'ListItem', position: n + 1, url: i.url, name: i.title }))
};
const blocks = {
  NEWS: homeList.length ? homeList.map((i) => R.card(i, '', NOW.getTime())).join('\n') : '<p class="news-empty">News will appear after the first daily update.</p>',
  TOPSTORY: R.topStory(topStory),
  TICKER: R.ticker(items),
  PULSE: R.pulse(briefing),
  STATUS: R.status(status),
  PROJECTS: R.projects(projects),
  PROJECTS_DATE: projects ? `REVIEWED ${fmtDate(projects.reviewed).toUpperCase()}` : '',
  HASHTAGS: hashtags.map((h, n) => `<a href="#" data-tag="${esc(h.tag.slice(1))}" class="${n < 6 ? 't1' : n < 16 ? 't2' : ''}">${esc(h.tag)}</a>`).join(''),
  JSONLD: `<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>`,
  KEYWORDS: `<meta name="keywords" content="${esc(keywords.join(', '))}">`,
  UPDATED: `<p class="updated-pill"><i class="dot live"></i> NEWS FEED UPDATED ${TODAY}</p>`,
  ANSWERS: R.answers(qa),
  FACTSDATE: fmtDate(projects?.reviewed || NOW),
  FAQLD: `<script type="application/ld+json">${JSON.stringify({
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'FAQPage', '@id': `${SITE}/#answers`, dateModified: NOW.toISOString(), mainEntity: qa.map((x) => ({ '@type': 'Question', name: x.q, acceptedAnswer: { '@type': 'Answer', text: x.a } })) },
      { '@type': 'WebPage', '@id': `${SITE}/#webpage`, url: `${SITE}/`, name: 'Elon Musk news today — Musk Systems', dateModified: NOW.toISOString(), inLanguage: 'en',
        speakable: { '@type': 'SpeakableSpecification', cssSelector: ['#pulse .pl-editor', '.qa-a p'] },
        about: [{ '@type': 'Person', name: 'Elon Musk' }, ...['SpaceX', 'Tesla', 'xAI', 'Neuralink', 'The Boring Company'].map((n) => ({ '@type': 'Organization', name: n }))],
        isPartOf: { '@id': `${SITE}/#website` } }
    ]
  }).replace(/</g, '\\u003c')}</script>`,
  CSS: inlineCss,
  JS: inlineJs
};
for (const [k, v] of Object.entries(blocks)) siteHtml = replaceBlock(siteHtml, k, v);
const finalHtml = withSite(siteHtml).split('ads@YOUR-DOMAIN.com').join(config.contactEmail || 'ads@YOUR-DOMAIN.com');
{ // every <script> tag must open and close once, with nothing script-like nested inside, and no ASP delimiters anywhere
  const opens = (finalHtml.match(/<script\b/gi) || []).length, closes = (finalHtml.match(/<\/script>/gi) || []).length;
  const inner = [...finalHtml.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].some(([, body]) => /<script/i.test(body));
  if (opens !== closes || inner || /<%|%>/.test(finalHtml)) throw new Error('index.html failed the ASP/IIS safety check');
}
await writeFile(p('index.html'), finalHtml);

/* ---------- digest pages ---------- */
await mkdir(p('news'), { recursive: true });
const dayGroups = {};
for (const i of items) (dayGroups[i.date.slice(0, 10)] ||= []).push(i);
const digestArt = await artVars('../');
const pageShell = (title, desc, canonical, body, extraLd) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title><meta name="description" content="${esc(desc)}"><link rel="canonical" href="${canonical}">
<meta name="robots" content="index, follow, max-snippet:-1, max-image-preview:large"><meta name="theme-color" content="#04060b">
<link href="https://fonts.googleapis.com/css2?family=Sora:wght@500;700;800&family=Inter:wght@400;600&family=JetBrains+Mono&display=swap" rel="stylesheet">
<link rel="stylesheet" href="../styles.css"><style>${digestArt}</style><link rel="alternate" type="application/rss+xml" href="${SITE}/feed.xml">
<script type="application/ld+json">${JSON.stringify(extraLd).replace(/</g, '\\u003c')}</script></head>
<body class="digest-page"><header class="site-header"><a class="brand" href="../"><span><b>MUSK SYSTEMS</b><small>UNOFFICIAL FAN TRIBUTE</small></span></a><nav class="nav digest-nav"><a href="../">Home</a><a href="../#planet">Live feed</a><a href="./">Archive</a></nav></header>
<main class="digest">${body}</main>
<footer class="site-footer"><a class="maker" href="../" aria-label="Salahuddin Group, creator of this site"><span class="maker-img" role="img" aria-label="Salahuddin Group logo"></span></a><p class="disclaimer">Unofficial fan tribute · Not affiliated with Elon Musk or his companies · Headlines link to original publishers.</p><p class="credit">Created by Chairman Shin Heung Seop, Salahuddin Group</p></footer></body></html>`;

const days = Object.keys(dayGroups).sort().reverse().slice(0, 60);
for (const day of days) {
  const list = [...dayGroups[day]].sort((a, b) => b.score - a.score);
  const groups = R.ORDER.filter((c) => list.some((i) => i.category === c));
  const body = `<p class="eyebrow"><span class="line"></span>DAILY DIGEST · ${fmtDate(day).toUpperCase()}</p>
<h1>Elon Musk news — ${fmtDate(day)}</h1>
<p class="intro">${list.length} stor${list.length > 1 ? 'ies' : 'y'} about ${groups.map((g) => LABEL[g]).join(', ')}, collected automatically and ranked by coverage and importance. Each item links to its original publisher.</p>
<article class="panel top-story digest-top">${R.topStory(list[0], '../')}</article>
${groups.map((g) => `<h2>${esc(LABEL[g]).toUpperCase()}</h2><div class="news-list">${list.filter((i) => i.category === g).map((i) => R.card(i, '../', NOW.getTime())).join('')}</div>`).join('\n')}`;
  const ldDay = { '@context': 'https://schema.org', '@type': 'CollectionPage', name: `Elon Musk news — ${day}`, url: `${SITE}/news/${day}.html`, datePublished: day, dateModified: NOW.toISOString(), isPartOf: { '@type': 'WebSite', name: config.siteName, url: SITE + '/' }, mainEntity: { '@type': 'ItemList', itemListElement: list.map((i, n) => ({ '@type': 'ListItem', position: n + 1, url: i.url, name: i.title })) } };
  await writeFile(p('news', `${day}.html`), pageShell(`Elon Musk News ${day} | SpaceX, Tesla, Starlink, xAI, Neuralink — Musk Systems`, `Daily digest for ${day}: ${list.slice(0, 3).map((i) => i.title).join(' · ')}`.slice(0, 300), `${SITE}/news/${day}.html`, body, ldDay));
}
const existingDays = (await readdir(p('news'))).filter((f) => /^\d{4}-\d{2}-\d{2}\.html$/.test(f)).map((f) => f.slice(0, 10)).sort().reverse();
await writeFile(p('news', 'index.html'), pageShell('Elon Musk Daily News Archive | Musk Systems', 'Archive of daily digests covering Elon Musk, SpaceX, Starship, Starlink, Tesla, Optimus, xAI and Neuralink.', `${SITE}/news/`,
  `<p class="eyebrow"><span class="line"></span>ARCHIVE</p><h1>Daily news archive</h1><p class="intro">${existingDays.length} daily editions. A new one is published automatically every day.</p>
<ul class="arch">${existingDays.map((d) => `<li class="panel"><a href="${d}.html"><b>${fmtDate(d)}</b><em>${(dayGroups[d] || []).length || ''}</em><span>${esc((dayGroups[d] || []).slice(0, 2).map((i) => i.title).join(' · ') || 'Archived digest')}</span></a></li>`).join('')}</ul>`,
  { '@context': 'https://schema.org', '@type': 'CollectionPage', name: 'Elon Musk daily news archive', url: `${SITE}/news/` }));

/* ---------- feeds, sitemap, robots, llms.txt, SEO report ---------- */
await writeFile(p('feed.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:media="http://search.yahoo.com/mrss/"><channel>
<title>${esc(config.siteName)} — daily Elon Musk news</title><link>${SITE}/</link>
<atom:link href="${SITE}/feed.xml" rel="self" type="application/rss+xml"/>
<description>Unofficial fan tracker of Elon Musk, SpaceX, Starlink, Tesla, Optimus, xAI and Neuralink news. Updated daily.</description>
<language>en</language><lastBuildDate>${NOW.toUTCString()}</lastBuildDate><ttl>1440</ttl>
${items.slice(0, 50).map((i) => `<item><title>${esc(i.title)}</title><link>${esc(i.url)}</link><guid isPermaLink="false">${i.id}</guid><pubDate>${new Date(i.date).toUTCString()}</pubDate><category>${esc(LABEL[i.category])}</category><source url="${esc(i.url)}">${esc(i.source)}</source>${i.snippet ? `<description>${esc(i.snippet)}</description>` : ''}${i.image ? `<media:content url="${esc(i.image)}" medium="image"/>` : ''}</item>`).join('\n')}
</channel></rss>
`);

const urls = [{ loc: `${SITE}/`, lastmod: TODAY, freq: 'daily', pr: '1.0' }, { loc: `${SITE}/news/`, lastmod: TODAY, freq: 'daily', pr: '0.8' },
  ...existingDays.map((d) => ({ loc: `${SITE}/news/${d}.html`, lastmod: d === TODAY ? TODAY : d, freq: d === TODAY ? 'hourly' : 'monthly', pr: '0.6' }))];
await writeFile(p('sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${u.loc}</loc><lastmod>${u.lastmod}</lastmod><changefreq>${u.freq}</changefreq><priority>${u.pr}</priority></url>`).join('\n')}
</urlset>
`);

await writeFile(p('robots.txt'), `# Search engines and AI search / answer engines are welcome.
User-agent: *
Allow: /

${['Googlebot', 'Bingbot', 'Yeti', 'Google-Extended', 'OAI-SearchBot', 'ChatGPT-User', 'GPTBot', 'ClaudeBot', 'Claude-SearchBot', 'PerplexityBot', 'Applebot'].map((b) => `User-agent: ${b}\nAllow: /`).join('\n')}

Sitemap: ${SITE}/sitemap.xml
# Plain-text summaries for AI assistants: ${SITE}/llms.txt and ${SITE}/llms-full.txt
`);

await writeFile(p('llms.txt'), `# ${config.siteName} — Elon Musk achievements, projects and daily news

> Unofficial fan tribute that documents Elon Musk's achievements and tracks his current projects (SpaceX, Starship, Starlink, Tesla, Optimus, Cybercab, xAI/Grok, Neuralink, The Boring Company). A new daily edition is generated automatically (${config.schedule.label}). Last update: ${NOW.toISOString()}.

## Today's briefing
${briefing.summary}
${briefing.editor ? briefing.editor.bullets.map((b) => `- ${b}`).join('\n') : ''}

## Main pages
- Home: ${SITE}/
- Live news feed: ${SITE}/#planet
- Today's digest: ${SITE}/news/${days[0] || TODAY}.html
- Daily news archive: ${SITE}/news/
- Full plain-text edition: ${SITE}/llms-full.txt
- Today's answers (Q&A): ${SITE}/#answers · ${SITE}/data/answers.json
- RSS feed: ${SITE}/feed.xml
- Machine-readable data: ${SITE}/data/news.json, ${SITE}/data/briefing.json, ${SITE}/data/projects.json, ${SITE}/data/hashtags.json

## Latest headlines (links go to original publishers)
${items.slice(0, 20).map((i) => `- ${i.date.slice(0, 10)} [${LABEL[i.category]}] ${i.title} — ${i.source}${i.sources.length > 1 ? ` (+${i.sources.length - 1} outlets)` : ''}: ${i.url}`).join('\n')}

## Projects in motion
${projects ? projects.projects.map((x) => `- ${x.name} (${x.org}) — ${x.label}: ${x.note}`).join('\n') : ''}

## Topics and hashtags (auto-generated from site text and headlines)
${hashtags.slice(0, 25).map((h) => h.tag).join(' ')}

## Editorial note
Independent, unofficial fan site. Not affiliated with or endorsed by Elon Musk, SpaceX, Tesla, xAI, X, Neuralink or The Boring Company. Not investment advice.
`);

await writeFile(p('SEO-KEYWORDS-HASHTAGS.txt'), `MUSK SYSTEMS — KEYWORD & HASHTAG REPORT (auto-generated ${NOW.toISOString()})
==========================================================================

TOP KEYWORDS (by frequency across visible site text + headlines)
${keywords.map((k, n) => `${String(n + 1).padStart(2)}. ${k}`).join('\n')}

TRENDING TODAY (${windowLabel})
${briefing.trending.map((t) => '#' + t).join(' ')}

HASHTAGS (score = weighted occurrences)
${hashtags.map((h) => `${h.tag}  (${h.score})`).join('\n')}

READY-TO-POST SETS (3–8 per post)
Today:      #ElonMusk ${briefing.trending.slice(0, 5).map((t) => '#' + t).join(' ')}
Space:      #ElonMusk #SpaceX #Starship #Starlink #SpaceExploration #Mars
Tesla:      #ElonMusk #Tesla #Robotaxi #Cybercab #Optimus #AutonomousDriving
AI/Neuro:   #ElonMusk #xAI #Grok #ArtificialIntelligence #Neuralink #BrainComputerInterface
Brand:      #MuskSystems #ElonMusk #FutureTechnology #SystemsThinking
`);

/* llms-full.txt — the whole edition as one Markdown file, for AI assistants and answer engines */
await writeFile(p('llms-full.txt'), `# ${config.siteName} — full daily edition, ${fmtDate(NOW)}

> Unofficial fan tracker of Elon Musk's companies and projects. Rebuilt automatically every day (${config.schedule.label}) from ${sources.length} news sources. Every headline links to its original publisher. Not affiliated with Elon Musk or his companies. Last update: ${NOW.toISOString()}.

Site: ${SITE}/ · Archive: ${SITE}/news/ · RSS: ${SITE}/feed.xml

## Today's answers
${qa.map((x) => `### ${x.q}\n${x.a}${x.links.length ? '\nSources:\n' + x.links.map((l) => `- [${l.title}](${l.url}) — ${l.source}, ${l.date.slice(0, 10)}`).join('\n') : ''}`).join('\n\n')}

## Editor's briefing
${briefing.editor ? briefing.editor.bullets.map((b) => `- ${b}`).join('\n') : briefing.summary}

## Projects in motion (reviewed ${projects?.reviewed || TODAY})
${projects ? projects.projects.map((x) => `- **${x.name}** (${x.org}) — stage ${x.stage}/4, ${x.label}: ${sentence(x.note)}`).join('\n') : ''}

## Quick facts
- SpaceX: founded 2002; listed on Nasdaq as SPCX on 12 June 2026.
- Starship: fully reusable launch system; third-generation V3 first flew in May 2026.
- Starlink: first satellites launched in 2019; more than 10,000 active.
- Tesla: Elon Musk has been CEO since 2008; Nasdaq: TSLA.
- xAI: founded 2023; combined with SpaceX in February 2026.
- Neuralink: founded 2016; first human implant in 2024.
- The Boring Company: founded 2016.

## Headlines (newest first)
${items.slice(0, 40).map((i) => `- ${i.date.slice(0, 10)} · ${LABEL[i.category]} · [${i.title}](${i.url}) — ${i.source}${i.sources.length > 1 ? ` (+${i.sources.length - 1} outlets)` : ''}${i.snippet ? `\n  ${i.snippet}` : ''}`).join('\n')}

## Trending topics
${hashtags.slice(0, 20).map((h) => h.tag).join(' ')}
`);

/* ---------- 6. notify (optional) ---------- */
if (process.env.INDEXNOW_KEY && !OFFLINE && !SITE.includes('YOUR-DOMAIN')) {
  const key = process.env.INDEXNOW_KEY;
  await writeFile(p(`${key}.txt`), key);
  try {
    const res = await fetch('https://api.indexnow.org/indexnow', {
      method: 'POST', headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ host: new URL(SITE).host, key, keyLocation: `${SITE}/${key}.txt`, urlList: [...urls.slice(0, 5).map((u) => u.loc), `${SITE}/llms-full.txt`] })
    });
    console.log('IndexNow:', res.status);
  } catch (e) { console.warn('IndexNow failed:', e.message); }
}

console.log(`Edition ${TODAY}: ${items.length} stories (${newItems} new) · sources ${status.sourcesOk}/${status.sourcesTotal} · ok=${status.ok} · next ${status.nextRun}`);
if (!OFFLINE && sourcesOk === 0) process.exitCode = 2; // lets the workflow open an alert issue
