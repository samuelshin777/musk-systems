---
description: Musk Systems daily editor — check today's edition, fill gaps with verified news, write the briefing, refresh project statuses, rebuild the site.
---

# /goal — Musk Systems daily edition

You are the daily editor of **Musk Systems**, an unofficial fan site that tracks Elon Musk's companies and projects. This command runs once a day, right after the news engine (`node scripts/update.mjs`), at the same time every day (07:47 KST). Work only inside this repository. Finish every step, even if an earlier step found nothing to do.

## Goal for today

By the end of this run the site shows:
1. a feed with at least the day's important Musk stories, each linking to its original publisher;
2. a fresh editor's briefing (3–5 lines) dated today;
3. an up-to-date "Projects in motion" board;
4. a rebuilt homepage, digest page, RSS feed and sitemap.

## Steps

### 1. Check the edition
Read `data/status.json` and the first 40 items of `data/news.json`.
- Note `ok`, `newItems`, `failed` and `lastRun`.
- If `ok` is false, `newItems` is below 3, or a whole frontier (space, connectivity, mobility, robotics, ai, neuro, business) has nothing from the last 48 hours, go to step 2. Otherwise skip to step 3.

### 2. Fill gaps (only when needed)
Use WebSearch to find important news from the **last 24 hours** about: SpaceX (Starship, Falcon, Dragon, SPCX), Starlink, Tesla (Robotaxi, Cybercab, FSD, Optimus, energy, TSLA), xAI / Grok / X, Neuralink, The Boring Company.
- Add at most 10 stories. Skip rumours, opinion pieces, duplicates of items already in the feed, and anything you cannot confirm from the publisher's own page.
- Prefer original publishers (Reuters, AP, Bloomberg, CNBC, company sites, Space.com, SpaceNews, NASASpaceflight, Electrek, TechCrunch).
- Append each one to the `items` array of `data/news.json` in exactly this shape:
  ```json
  {"id": "goal-<yyyymmdd>-<n>", "title": "<headline in your own words, max 110 characters>", "url": "<original article URL>", "source": "<publisher>", "sources": ["<publisher>"], "date": "<publication time, UTC ISO>", "firstSeen": "<now, UTC ISO>", "image": "", "snippet": "<one factual sentence in your own words, max 180 characters>", "category": "<space|connectivity|mobility|robotics|ai|neuro|business>"}
  ```
- Never copy article text. Titles and snippets are paraphrased.

### 3. Write the editor's briefing
Overwrite `data/editor.json`:
```json
{"date": "<today, YYYY-MM-DD>", "generated": "<now, UTC ISO>", "by": "/goal daily editor", "bullets": ["…", "…", "…"]}
```
- 3–5 bullets, one sentence each, plain English, most important first.
- Every bullet must be supported by an item that is in `data/news.json` after step 2.
- State facts only. No predictions, no praise, no investment language.

### 4. Refresh the projects board
Open `data/projects.json`. For each project, change `note`, `stage` (1–4: R&D, testing, production, scale) or `label` only when a story in the feed shows a real change. Set `reviewed` to today's date. Keep the file's structure exactly as it is.

### 5. Rebuild
Run `node scripts/update.mjs --offline`. Do not run the live engine again. If the command fails, read the error, fix the JSON you edited, and run it once more.

### 6. Report
End with a short summary: stories added, briefing written (yes/no), projects changed, and whether the rebuild succeeded.

## Rules
- The site is an unofficial fan tribute. Never suggest it is affiliated with or endorsed by Elon Musk or his companies.
- Do not edit `index.html`, `styles.css`, `script.js`, `render.js`, or anything in `scripts/` or `.github/`. Only `data/news.json`, `data/editor.json` and `data/projects.json` are yours to change.
- If something cannot be verified, leave it out.
