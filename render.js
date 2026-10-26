/* Musk Systems — shared renderer.
 * Inlined into index.html by scripts/update.mjs and also imported by it at build time,
 * so the pre-rendered HTML (for Google / AI crawlers) and the live client view are identical. */
(function (g) {
  const LABEL = { space: 'Space', connectivity: 'Starlink', mobility: 'Tesla', robotics: 'Optimus', ai: 'xAI & Grok', neuro: 'Neuralink', business: 'Business' };
  const ORDER = ['space', 'connectivity', 'mobility', 'robotics', 'ai', 'neuro', 'business'];
  const ART = { space: 'space', connectivity: 'connect', mobility: 'energy', robotics: 'ai', ai: 'city', neuro: 'city', business: 'planet' };
  const FALLBACK = ART;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = (d) => new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
  const isNew = (d, now) => (now || Date.now()) - new Date(d).getTime() < 36 * 3600e3;
  /* Built-in artwork is a CSS background (embedded in the page), so a card never shows a broken image.
     A publisher photo, when the feed has one, sits on top and removes itself if it fails to load. */
  const img = (i, _prefix, cls) => `<span class="${cls}" data-art="${ART[i.category] || 'planet'}" aria-hidden="true">${i.image ? `<img src="${esc(i.image)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="this.remove()">` : ''}</span>`;
  const cov = (i) => { const n = (i.sources && i.sources.length) || 1; return n > 1 ? `<span class="nc-cov" title="${esc(i.sources.join(', '))}">${n} outlets</span>` : ''; };

  function card(i, prefix = '', now) {
    return `<article class="news-card" data-cat="${esc(i.category)}"${isNew(i.date, now) ? ' data-new' : ''}>` +
      img(i, prefix, 'nc-thumb') +
      `<div class="nc-body"><div class="news-meta"><span class="news-cat">${esc(LABEL[i.category] || 'News')}</span><time datetime="${esc(i.date)}">${fmt(i.date)}</time>${isNew(i.date, now) ? '<span class="nc-new">NEW</span>' : ''}${cov(i)}</div>` +
      `<h3>${esc(i.title)}</h3>${i.snippet ? `<p class="nc-snip">${esc(i.snippet)}</p>` : ''}</div>` +
      `<a class="src" href="${esc(i.url)}" target="_blank" rel="noopener nofollow">${esc(i.source)} ↗</a></article>`;
  }

  function topStory(i, prefix = '') {
    if (!i) return '<p class="ts-empty">The first daily update will place the top story here.</p>';
    const n = (i.sources && i.sources.length) || 1;
    return img(i, prefix, 'ts-img') +
      `<div class="ts-body" data-cat="${esc(i.category)}"><p class="ts-kicker"><span class="dot live"></span>TOP STORY · ${esc(LABEL[i.category] || 'News').toUpperCase()}${n > 1 ? ` · COVERED BY ${n} OUTLETS` : ''}</p>` +
      `<h3 class="ts-title">${esc(i.title)}</h3>${i.snippet ? `<p class="ts-snip">${esc(i.snippet)}</p>` : ''}` +
      `<p class="ts-meta"><time datetime="${esc(i.date)}">${fmt(i.date)}</time> · ${esc(i.source)}</p>` +
      `<a class="btn-gold ts-btn" href="${esc(i.url)}" target="_blank" rel="noopener nofollow">Read the story <span>↗</span></a></div>`;
  }

  function ticker(items) {
    return items.slice(0, 14).map((i) => `<a href="${esc(i.url)}" target="_blank" rel="noopener nofollow"><b data-cat="${esc(i.category)}">${esc(LABEL[i.category] || 'News')}</b>${esc(i.title)}</a>`).join('');
  }

  /* 14-day volume sparkline — single series, single hue, so no legend; native <title> tooltips per point. */
  function sparkline(days) {
    const W = 260, H = 54, P = 4;
    const vals = days.map((d) => d.total);
    const max = Math.max(1, ...vals);
    const x = (k) => P + (k * (W - 2 * P)) / Math.max(1, vals.length - 1);
    const y = (v) => H - P - (v / max) * (H - 2 * P - 6);
    const line = vals.map((v, k) => `${k ? 'L' : 'M'}${x(k).toFixed(1)},${y(v).toFixed(1)}`).join('');
    const area = `${line}L${x(vals.length - 1).toFixed(1)},${H - P}L${x(0).toFixed(1)},${H - P}Z`;
    const pts = days.map((d, k) => `<g class="sp-pt"><rect x="${(x(k) - 9).toFixed(1)}" y="0" width="18" height="${H}" fill="transparent"/><circle cx="${x(k).toFixed(1)}" cy="${y(d.total).toFixed(1)}" r="${k === days.length - 1 ? 3.5 : 2.5}" fill="#04060b" stroke="#f0c06a" stroke-width="2" vector-effect="non-scaling-stroke"/><title>${esc(d.date)}: ${d.total} stor${d.total === 1 ? 'y' : 'ies'}</title></g>`).join('');
    return `<svg class="spark" viewBox="0 0 ${W} ${H}" width="100%" height="${H + 4}" preserveAspectRatio="none" role="img" aria-label="Story volume, last 14 days: ${vals.join(', ')}"><defs><linearGradient id="spg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f0c06a" stop-opacity=".45"/><stop offset="1" stop-color="#f0c06a" stop-opacity="0"/></linearGradient></defs><line x1="${P}" y1="${H - P}" x2="${W - P}" y2="${H - P}" class="sp-base" stroke="rgba(255,255,255,.14)" stroke-width="1" vector-effect="non-scaling-stroke"/><path d="${area}" fill="url(#spg)"/><path d="${line}" class="sp-line" fill="none" stroke="#f0c06a" stroke-width="2" vector-effect="non-scaling-stroke"/>${pts}</svg>`;
  }

  function pulse(b) {
    if (!b) return '';
    const counts = b.counts || {};
    const max = Math.max(1, ...ORDER.map((c) => counts[c] || 0));
    const rows = ORDER.map((c) => `<li data-cat="${c}"><button type="button" class="pl-row" data-cat="${c}"><span class="pl-name"><i></i>${LABEL[c]}</span><span class="pl-bar"><span style="width:${(((counts[c] || 0) / max) * 100).toFixed(0)}%"></span></span><b>${counts[c] || 0}</b></button></li>`).join('');
    const trend = (b.trending || []).map((t) => `<span>#${esc(t)}</span>`).join('');
    const editor = b.editor && b.editor.bullets && b.editor.bullets.length
      ? `<div class="pl-editor"><p class="pl-label">EDITOR'S BRIEFING · ${esc(b.editor.date)}</p><ul>${b.editor.bullets.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>`
      : `<p class="pl-summary">${esc(b.summary || '')}</p>`;
    return `${editor}<p class="pl-label">STORIES BY FRONTIER · ${esc(b.windowLabel || 'LAST 24H')}</p><ul class="pl-list">${rows}</ul>` +
      `<div class="pl-spark"><p class="pl-label">DAILY STORY VOLUME · 14 DAYS</p>${sparkline(b.spark || [])}<div class="sp-axis"><span>${esc((b.spark || [])[0] ? b.spark[0].date.slice(5) : '')}</span><span>TODAY</span></div></div>` +
      (trend ? `<p class="pl-label">TRENDING TODAY</p><div class="pl-trend">${trend}</div>` : '');
  }

  function status(s) {
    if (!s) return '';
    return `<span class="st-dot ${s.ok ? 'ok' : 'warn'}"></span><span class="st-text">${s.ok ? 'UPDATED' : 'PARTIAL UPDATE'} <time datetime="${esc(s.lastRun)}">${esc(String(s.lastRun).slice(0, 16).replace('T', ' '))} UTC</time></span>` +
      `<span class="st-sep"></span><span class="st-next" data-next="${esc(s.nextRun)}">NEXT ${esc(s.scheduleLabel || '')}</span>` +
      `<span class="st-sep"></span><span class="st-src">${s.sourcesOk == null ? s.sourcesTotal + ' SOURCES' : s.sourcesOk + '/' + s.sourcesTotal + ' SOURCES OK'}</span>`;
  }

  function projects(p) {
    if (!p) return '';
    return p.projects.map((x) => `<li><div><b>${esc(x.name)}</b><small>${esc(x.org)} · ${esc(x.note)}</small></div><span class="stage" aria-label="Stage ${x.stage} of 4">${[1, 2, 3, 4].map((k) => `<i${k <= x.stage ? ' class="on"' : ''}></i>`).join('')}</span><em>${esc(x.label)}</em></li>`).join('');
  }

  /* Daily Q&A — answer-first blocks that Google and AI answer engines can quote directly. */
  function answers(list) {
    if (!list || !list.length) return '';
    return list.map((x, n) => `<details class="qa"${n < 2 ? ' open' : ''}><summary><h3>${esc(x.q)}</h3><i aria-hidden="true"></i></summary><div class="qa-a"><p>${esc(x.a)}</p>` +
      (x.links && x.links.length ? `<ul class="qa-src">${x.links.map((l) => `<li><a href="${esc(l.url)}" target="_blank" rel="noopener nofollow">${esc(l.title)}</a><span>${esc(l.source)} · ${fmt(l.date)}</span></li>`).join('')}</ul>` : '') +
      `</div></details>`).join('');
  }

  g.MS_RENDER = { answers, ART, LABEL, ORDER, FALLBACK, esc, fmt, card, topStory, ticker, pulse, status, projects, sparkline };
})(typeof window !== 'undefined' ? window : globalThis);
