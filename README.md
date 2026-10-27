# MUSK SYSTEMS — 일론 머스크 트리뷰트 & 데일리 뉴스 자동 운영 사이트

비공식 팬 트리뷰트 사이트입니다. 2페이지 스크롤 비주얼 디자인이며, 매일 **07:47 (한국 시간, 22:47 UTC)** 에 뉴스가 자동으로 갱신됩니다.

## 게시 방식: GitHub Pages (FTP 사용 안 함)
2026-10-27부터 사이트는 GitHub Pages에서 직접 열립니다. 매일 07:47 실행의 마지막 단계(`pages`)가 새 판을 바로 게시하므로 FTP 업로드나 서버 로그인 오류가 생기지 않습니다.
한 번만 하는 설정은 **SETUP.html**을 열고 순서대로 하면 됩니다. 저장소 공개 전환(무료 계정일 때), Pages 켜기, 변수 정리, 도메인 DNS 연결, 첫 실행 순서입니다.
- 미리보기 주소: https://samuelshin777.github.io/musk-systems/
- FTP는 `DEPLOY_TARGET=ftp`일 때만 보조 업로드로 시도하며, 실패해도 실행을 멈추지 않습니다.

## FTP 업로드 방법 (예전 방식)
1. **`musk-systems-FTP-upload.zip`** 을 내 컴퓨터에서 먼저 압축 해제합니다. ZIP 파일 자체를 서버에 올리면 사이트가 열리지 않습니다.
2. 압축을 푼 폴더 **안의 내용물 전체**(index.html, web.config, .htaccess, assets, data, news, feed.xml, sitemap.xml, robots.txt, llms.txt, llms-full.txt, styles.css)를 웹 루트(`/`, `public_html`, `wwwroot` 등)에 올립니다.
3. `https://내도메인.com/` 으로 접속해 확인합니다.

- **IIS(윈도우) 서버**: `web.config`가 webp 이미지, json, txt, xml 파일 형식을 설정합니다.
- **Apache 서버**: `.htaccess`가 같은 역할을 합니다.
- **ASP 0138 오류**: index.html 안에 ASP가 서버 코드로 오인하는 글자(`<script`가 스크립트 안에 있는 경우, `<%`, `%>`)가 들어가면 생깁니다. 이제는 매일 빌드할 때 자동으로 검사하며, 해당 글자가 발견되면 빌드를 멈추고 오류를 알립니다.

## 매일 자동 운영 구조 (Daily Edition)

```
매일 07:47 KST ── GitHub Actions (.github/workflows/daily-update.yml)
   │
   ├─ 1. 뉴스 엔진      node scripts/update.mjs
   │                   구글 뉴스 9개 검색어 + 전문 매체 RSS 8개 수집 → 같은 기사 묶기("N outlets")
   │                   → 중요도 순위(최신성·보도 매체 수·매체 신뢰도·주요 이벤트) → 사이트 전체 재생성
   │
   ├─ 2. /goal         Claude Code가 /goal 명령 실행 (.claude/commands/goal.md)
   │                   빠진 주요 뉴스를 웹 검색으로 보충 → 오늘의 에디터 브리핑 작성
   │                   → 프로젝트 진행 현황 갱신 → 사이트 재생성
   │                   (ANTHROPIC_API_KEY 시크릿이 있을 때만 실행, 없으면 1번만으로 운영)
   │
   ├─ 3. 검증          news.json이 비었거나 오늘 날짜로 갱신되지 않았으면 실패 처리
   ├─ 4. 커밋·배포      GitHub Pages 또는 FTP
   └─ 5. 경보          실패 시 GitHub 이슈 자동 생성
```

**안전장치**
- 모든 뉴스 출처가 실패해도 기존 뉴스를 지우지 않고 이전 판을 유지합니다.
- 갱신이 26시간 넘게 멈추면, 방문자 브라우저가 직접 최신 뉴스를 불러오는 실시간 모드로 전환됩니다.
- 화면 상단 상태바에 마지막 업데이트 시각, 다음 업데이트까지 남은 시간(카운트다운), 정상 응답한 뉴스 출처 수가 표시됩니다.

## 뉴스 화면 구성 (2페이지)
- **LATEST 티커**: 최신 헤드라인이 흐르는 띠
- **TOP STORY**: 오늘 가장 중요한 기사 한 건을 크게 표시
- **TODAY'S PULSE**: 에디터 브리핑, 분야별 기사 수 막대그래프(누르면 해당 분야만 보기), 14일 기사량 그래프, 오늘의 트렌드
- **LIVE MUSK FEED**: 분야 필터, 헤드라인 검색, NEW 표시, 보도 매체 수, 더 보기
- **PROJECTS IN MOTION**: 6개 프로젝트의 4단계 진행 현황 (매일 /goal이 갱신)
- 하단 중앙: 살라후딘 그룹 로고

## 설치 (GitHub, 약 10분)
1. GitHub에 새 저장소를 만들고 이 폴더 전체를 업로드합니다 (`.github`, `.claude` 숨김 폴더 포함).
2. Settings → Secrets and variables → Actions
   - **Variables**: `SITE_URL` = `https://내도메인.com`
   - **Secrets** (선택): `ANTHROPIC_API_KEY` — 넣으면 매일 `/goal` 에디터 단계가 함께 실행됩니다.
3. 호스팅 선택
   - GitHub Pages: Settings → Pages → Source를 **GitHub Actions**로 설정
   - 기존 FTP 호스팅: Variables에 `DEPLOY_TARGET=ftp`, Secrets에 `FTP_SERVER`, `FTP_USERNAME`, `FTP_PASSWORD`
4. Actions 탭 → "Daily Musk news update" → **Run workflow**로 첫 실행. 이후 매일 07:47 KST에 자동 실행됩니다.
5. Google Search Console · Bing Webmaster · 네이버 서치어드바이저에 `https://내도메인.com/sitemap.xml`을 제출합니다.

### 내 PC나 서버에서 /goal 직접 실행
```
cd musk-site
node scripts/update.mjs          # 뉴스 엔진
claude "/goal"                   # Claude Code 에디터 단계
```
리눅스 서버 cron 예시 (07:47 KST):
```
47 22 * * * cd /var/www/musk-site && SITE_URL=https://내도메인.com node scripts/update.mjs && claude -p "/goal"
```
Node 18 이상이 필요하며 외부 패키지는 없습니다. 네트워크 없이 재생성만 하려면 `node scripts/update.mjs --offline`을 실행합니다.

## index.html 한 파일로 동작
디자인(CSS), 동작(JS), 이미지 9장이 모두 index.html 안에 들어 있습니다. 파일 하나만 열거나 올려도 화면이 깨지지 않습니다. 매일 자동 업데이트도 같은 방식으로 index.html을 다시 만들기 때문에 항상 단독 파일로 유지됩니다. 디자인을 고칠 때는 `styles.css`, `script.js`, `render.js`를 수정한 뒤 `node scripts/update.mjs --offline`을 실행하세요.

## 구글·AI 검색 노출 구조 (매일 자동 갱신)
| 단계 | 내용 | 목적 |
|---|---|---|
| 1. 답변형 콘텐츠 | 2페이지 "TODAY'S ANSWERS" — 사람들이 가장 많이 검색하는 질문 6개와 그날의 출처가 달린 답변 | 구글 추천 스니펫, AI 답변 인용 |
| 2. 구조화 데이터 | FAQPage, WebPage(speakable), ItemList, Person/Organization JSON-LD — 화면 내용과 동일 | 리치 결과, 음성 검색, AI의 개체 인식 |
| 3. AI 전용 문서 | `llms.txt`(요약), `llms-full.txt`(오늘 판 전체: 답변·브리핑·프로젝트·사실·헤드라인 40개) | ChatGPT·Claude·Perplexity 등이 바로 읽는 정리본 |
| 4. 데이터 파일 | `data/answers.json`, `news.json`, `briefing.json`, `projects.json` | AI·앱이 가져가기 쉬운 형식 |
| 5. 크롤러 허용 | `robots.txt` — Googlebot, Bingbot, 네이버(Yeti), GPTBot, OAI-SearchBot, ClaudeBot, PerplexityBot 등 허용 | 수집 차단 방지 |
| 6. 신선도 신호 | 매일 날짜별 페이지, sitemap `lastmod`, RSS, IndexNow 알림(INDEXNOW_KEY 설정 시) | 빠른 재수집 |
| 7. 홍보 문구 | 제목·설명·홍보 밴드에 "Elon Musk news today", SpaceX·Tesla·Starlink·xAI·Neuralink 키워드를 자연스럽게 배치 | 검색어 일치 |

숨김 텍스트나 키워드 나열은 쓰지 않았습니다. 구글이 스팸으로 분류해 오히려 순위가 떨어지기 때문입니다. 검색 1위를 보장하는 코드는 없으며, 노출은 꾸준한 업데이트와 사이트 공개 기간에 따라 늘어납니다.

## 광고 문의 이메일
`site.config.json`의 `contactEmail`을 실제 주소로 바꾸면, 다음 업데이트부터 광고 카드에 그 주소가 표시됩니다.

## 실행 시간 바꾸기
`site.config.json`의 `schedule`(hourUtc, minuteUtc, label)과 `.github/workflows/daily-update.yml`의 `cron` 값을 같은 시각으로 바꿉니다.

## 폴더 구성
| 파일 | 역할 |
|---|---|
| `index.html` | 메인 페이지 (2페이지 스크롤) |
| `styles.css` / `script.js` / `render.js` | 디자인 / 애니메이션·필터·카운트다운·실시간 모드 / 서버와 브라우저가 함께 쓰는 뉴스 렌더러 |
| `assets/` | 히어로·카드·지구 이미지, 살라후딘 그룹 로고 |
| `data/news.json` | 뉴스 (매일 갱신) |
| `data/briefing.json`, `data/editor.json` | 오늘의 펄스·에디터 브리핑 |
| `data/projects.json` | 프로젝트 진행 현황 |
| `data/status.json`, `data/history.json` | 운영 상태, 14~60일 기사량 기록 |
| `news/` | 날짜별 뉴스 다이제스트와 아카이브 |
| `feed.xml`, `sitemap.xml`, `robots.txt`, `llms.txt`, `SEO-KEYWORDS-HASHTAGS.txt` | RSS, 검색엔진·AI 검색용 파일 (매일 갱신) |
| `scripts/update.mjs` | 뉴스 엔진 |
| `.claude/commands/goal.md` | `/goal` 데일리 에디터 명령 |
| `.github/workflows/daily-update.yml` | 매일 자동 실행 스케줄 |
| `site.config.json` | 도메인, 검색어, 매체 RSS, 실행 시간 설정 |

## 고지
비공식 팬 트리뷰트 사이트이며 일론 머스크 및 SpaceX·Tesla·xAI·X·Neuralink·The Boring Company와 무관합니다. 뉴스는 직접 쓴 요약 제목과 원문 링크만 표시합니다. 히어로 이미지는 제공된 목업에서 잘라 쓴 일러스트이므로, 공개 전 초상권 검토를 권장합니다.
