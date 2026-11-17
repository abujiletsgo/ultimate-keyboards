# Ultimate Keyboards search visibility plan (updated 2026-11-17)

Stage: **pre-launch**. The 0.3 build exists but is not notarized; the site is a waitlist page at https://hyly.world/keyboards/.

## Site audit (site-search-readiness, live, 2026-11-15)
`check_site.py https://hyly.world/keyboards/`: **FAIL 0, WARN 1, PASS 22, INFO 6.** It is indexable, has 2,969 words in raw HTML (pre-rendered), canonical, one H1, OG, SoftwareApplication + Organization + Offer JSON-LD and llms.txt, and every search and AI crawler is allowed (robots and WAF probe).
- WARN: the hub sitemap https://hyly.world/sitemap.xml (the only one robots.txt lists) does not include /keyboards/. /keyboards/sitemap.xml exists but nothing points at it.

## Fix list, in order
| # | Fix | Where | Status |
|---|---|---|---|
| 1 | Deploy the corrected copy: the live page still says J+K = Esc and mentions "Karabiner export"; the WIP source (keyboards-site, uncommitted) has Tom's combos | keyboards-site | next: owned by the site session (edits 2026-11-14 23:54) |
| 2 | llms.txt still says "press J and K together for Escape" and "Free" | keyboards-site public/llms.txt | next, with #1 |
| 3 | Price consistency: say "free to start, with paid features" in the FAQ, llms.txt and JSON-LD (Offer price 0 = the free tier); no tiers or prices until decided | keyboards-site | next: freemium (Tom, 2026-11-15) |
| 4 | Add `https://hyly.world/keyboards/` to the hub sitemap, or add `Sitemap: https://hyly.world/keyboards/sitemap.xml` to hub robots.txt | hyly-world (dirty checkout, owned by another session) | next: hub owner |
| 5 | JSON-LD: add `sameAs` (GitHub) to Organization, `softwareRequirements`, `isAccessibleForFree`/price only after #3, `downloadUrl` at launch | keyboards-site | next, with #1 |
| 6 | IndexNow submit https://hyly.world/keyboards/ | hyly.world | done 2026-11-15 (HTTP 200, Tom chose to submit before the copy fix); resubmit after #1–#3 deploy |
| 7 | Search Console + Bing Webmaster Tools: confirm hyly.world Domain property covers /keyboards/; submit /keyboards/sitemap.xml | Tom's accounts | not yet: check whether Unisinc's setup already verified the domain |

## Stage 0/1 checklist
- [x] facts.md drafted 2026-11-15 (category phrase awaits Tom's confirmation)
- [x] Waitlist page live, indexable, server-rendered (done 2026-11-14)
- [x] SoftwareApplication + Organization JSON-LD (done; sameAs missing)
- [ ] Search Console / Bing verified, sitemap submitted (#7)
- [ ] Profiles with the identical name: YouTube, X, Reddit, Product Hunt "coming soon", AlternativeTo (`[NEED FACT]` which exist)
- [ ] queries.md + panel written (done 2026-11-15); **baseline panel run**: next (16 prompts × 6 engines in Orca, about 1–2 h of agent time)
- [ ] Demo video on YouTube: the site's Flow loops plus a real screen capture of setting up home-row mods; spoken name + category phrase; chapters
- [ ] Guide: "Home row mods on a MacBook keyboard" (P01/P02), real screenshots
- [ ] Guide: "Arrow keys on the home row with a Space layer" (P03)
- [ ] Guide: "Edit and build ZMK firmware from a Mac" (P06/P07)
- [ ] Comparison page vs Karabiner-Elements / Kanata: approved by Tom 2026-11-15 (named only on this page); competitor research in marketing/competitors.md
- [ ] Privacy/permissions page (what the driver and Input Monitoring see), uninstall page
- [ ] Changelog page on the site (CHANGELOG.md exists in the repo)

## Page map
| Page | URL | Intent | Status |
|---|---|---|---|
| Product | /keyboards/ | branded + category | live |
| Home-row mods guide | /keyboards/guides/home-row-mods-macbook/ | problem | not yet |
| Layers guide | /keyboards/guides/layers-macbook/ | problem | not yet |
| ZMK on Mac guide | /keyboards/guides/zmk-firmware-mac/ | problem | not yet |
| vs Karabiner / Kanata / KeyPath | /keyboards/vs-karabiner/ | comparison | brief: briefs/vs-karabiner.md; needs our misfire test first |
| Privacy & permissions | /keyboards/privacy/ | branded ("is it safe") | not yet |
| Changelog | /keyboards/changelog/ | freshness | not yet |

## Off-site map
| Place | Honest angle | Owner leaf | Status |
|---|---|---|---|
| r/ErgoMechKeyboards, r/olkb, r/zmk | ZMK/QMK editor on Mac; answer existing "GUI for ZMK keymap" threads, disclosed as the developer | launch-and-community-posts | not yet |
| r/macapps, r/MacOS | Home-row mods on the built-in keyboard; Show-off post at launch | launch-and-community-posts | launch week |
| ZMK Discord | Tool mention in the tools channel, if the rules allow | launch-and-community-posts | not yet |
| Show HN | Open source (MIT) Mac app; launch day | launch-and-community-posts | launch week |
| YouTube | Demo + "home row mods on a MacBook" how-to | youtube-packaging | not yet |
| AlternativeTo | Listed as an alternative to Karabiner-Elements and Kanata | — | launch week |
| TextExpander "Karabiner-Elements alternatives" (Josh Centers, updated 2026-10-21) | Factual pitch once notarized | — | after launch |
| XDA (Kanata piece, 2025-11-12) | GUI angle pitch | — | after launch |
| Reddit query research | Real thread titles to replace seed queries (subagent could not reach Reddit) | — | next: af-browse |
| GitHub README | Lead with the same category phrase as facts.md; link to the site | — | next |
| "Best Mac keyboard remapper" roundups | Factual pitch to authors once a notarized build exists | — | after launch |

## Content log
| Date | Piece | URL | Distributed | Refresh |
|---|---|---|---|---|
| — | — | — | — | — |

---

## Locale expansion block: Spanish (`es`), Portuguese (`pt-BR` / `pt-PT`) and Korean (`ko`) (added 2026-11-17, `HW-SEO-15`)

Evidence base: `/Volumes/Work/projects/web/hyly-world/docs/seo/market-research-2026-11.md` and `/Volumes/Work/projects/web/hyly-world/tasks/search-everywhere/intent.md`. Query maps and frozen 14-prompt AI panels per locale live in `marketing/queries-es.md`, `marketing/queries-pt.md` and `marketing/queries-ko.md`. Store listing drafts (`world.hyly.keyboards`) live in `docs/store/` (`en-US.md`, `es-419.md`, `pt-BR.md`, `ko-KR.md`).

### 1. Multilingual routing, consoles & crawler rules (shared across `hyly.world`)
- **Locale URLs (dependency `HW-L10N-07` / `HW-L10N-40`):** `https://hyly.world/en/keyboards/`, `/es/keyboards/`, `/pt/keyboards/`, `/ko/keyboards/`, with `https://hyly.world/keyboards/` as `x-default`. Self-referencing `canonical` and `og:url` per locale (prevents WhatsApp and KakaoTalk `kakaotalk-scrap/1.0` from overwriting localized cards with English); zero IP or `Accept-Language` auto-redirects.
- **Hreflang & locale tags:** `en`, `es` (never `es-419`), `pt` (+ `pt-BR`), `ko`, `x-default`. Open Graph `og:locale`: `en_US`, `es_LA` (+ `es_ES`), `pt_BR` (+ `pt_PT`), `ko_KR`, with PNG/JPEG `og:image` inside the first 300 KB of SSR HTML. JSON-LD `SoftwareApplication` + `WebPage` carry localized `name`, `description` and `inLanguage` (`en`, `es`, `pt-BR`, `ko`) pointing to shared `https://hyly.world/#organization`.
- **Search consoles (`hyly.world` apex):** No regional search engine or webmaster console exists in Latin America, Spain, Brazil or Portugal (Google + Bing + Yahoo = 97.6%–99.6%; desktop Bing reaches ~24.5% in Mexico and ~15.9% in Brazil, grounding Copilot and ChatGPT Search). Korea is dual-engine: Google leads desktop (~61.66% StatCounter, primary for macOS/ZMK developers), while Naver leads mobile (56.49% StatCounter / 65.10% InternetTrend) and powers `AI 브리핑` + `AI탭` (`Cue:` shut down 2026-04-09). Register `hyly.world` once in Google Search Console, Bing Webmaster Tools (+ IndexNow), Naver Search Advisor (`searchadvisor.naver.com`, `Yeti`, `/sitemap.xml` + `/ko/rss.xml` + Naver IndexNow) and Daum 검색등록 (`register.search.daum.net`, `Daum`/`Daumoa`).

### 2. Localized page & content-brief plan (drafts only; no new `es`/`pt`/`ko` articles go live without Tom)
| Locale | Primary product URL | High-leverage local problem guides (hold as briefs/drafts in `marketing/` until Tom approves) | Local copy & ASO notes |
|---|---|---|---|
| **Spanish (`es`)** | `/es/keyboards/` | • `/es/keyboards/guides/n-y-tildes-teclado-ingles-mac/` (*poner la ñ y tildes en un MacBook con teclado en inglés o en Corne ZMK/QMK* — near-zero Spanish SERP competition)<br>• `/es/keyboards/guides/home-row-mods-macbook/`<br>• `/es/keyboards/vs-karabiner/` | Neutral `tú`; pair `MacBook` with `computadora/ordenador` and `celular/móvil` naturally; keep `home row mods` untranslated alongside *modificadores en la fila guía*; highlight free core + `$24` *pago único* (`$19` lanzamiento, sin suscripción). Play: `es-419`, `es-ES`, `es-US`; App Store: `es-MX`, `es-ES` (100% genuine Spanish, unaccented in 100-byte Keywords). |
| **Portuguese (`pt-BR` + `pt-PT`)** | `/pt/keyboards/` | • `/pt/keyboards/guides/cedilha-e-acentos-macbook/` (*configurar ç, acentos, pipe e barra invertida em MacBook padrão americano e teclados split ZMK/QMK*)<br>• `/pt/keyboards/guides/home-row-mods-macbook/`<br>• `/pt/keyboards/vs-karabiner/` | `pt-BR` (`você`) primary with natural `pt-PT` bridges (`celular`/`telemóvel`, `tela`/`ecrã`); state free core + *compra única* clearly; publish LGPD + GDPR compliant Portuguese privacy policy. Populate **both** `pt-BR` and `pt-PT` in Play and App Store (plus `en-GB` secondary keyword index in App Store Connect). |
| **Korean (`ko`)** | `/ko/keyboards/` | • `/ko/keyboards/guides/han-yeong-delay-macbook/` (*카라비너 JSON 없이 맥북 한/영 전환 딜레이 해결 + 홈로우 모드 세팅*)<br>• `/ko/keyboards/guides/zmk-firmware-mac/` (*맥에서 코른·스플릿 키보드 ZMK 키맵 편집 및 GitHub Actions 빌드*)<br>• `/ko/keyboards/vs-karabiner/` | Bilingual `Ultimate Keyboards (얼티밋 키보드)` in `<title>`, `<h1>` and intro; static HTML tables matching Naver `스마트블록` / `AI 브리핑` intents (`주요 기능`, `지원 맥 사양`, `설치 및 권한 안내`, `요금 및 무료 기능`); `해요체` UI/guides, `합니다체` legal, zero 번역투 (`korean-longform-naver`). Play `ko-KR`; App Store `ko` (watch 3-byte UTF-8 Hangul limit in 100-byte Keywords). |

### 3. Off-site local discovery & trust map per market

| Market | Place | Honest angle & local rules | Owner / leaf | Status |
|---|---|---|---|---|
| **Korean (`ko`)** | **Naver 블로그 (`blog.naver.com/...`)** | First-person Korean setup guides (*맥북 내장 키보드 홈로우 모드*, *한/영키 전환 세팅*, *ZMK 코른 키맵 빌드*) with real MacBook/board photos, concrete timing numbers, and one honest drawback (`애플 실리콘·macOS 13 이상 전용`) so posts qualify for Naver `D.I.A.+`, `스마트블록` and `AI 브리핑`. **Drafts only; Tom publishes.** | `korean-longform-naver` (Tom publishes) | not yet: after notarized build |
| **Korean (`ko`)** | **Naver 카페 (`맥쓰사` `cafe.naver.com/inmacbook`, `아사모` `cafe.naver.com/appleiphone`)** | Disclosed developer answers and real usage walk-throughs on *"맥북 한영키 딜레이"*, *"카라비너 대체"*, and *"맥북 키보드로 아이폰 타이핑"* threads; feeds Naver `스마트블록` and `AI탭` directly even where closed to Googlebot. **Tom posts.** | `korean-longform-naver` (Tom posts) | launch week |
| **Korean (`ko`)** | **Naver 지식iN** | Helpful, non-promotional troubleshooting answers on macOS `한/영 전환 씹힘`, Caps Lock remapping, Input Monitoring permissions, and stopping remapping cleanly; surfaces in Naver Q&A blocks and `AI 브리핑`. **Drafts only; Tom posts.** | `korean-longform-naver` | after launch |
| **Korean (`ko`)** | **클리앙 `맥당` (`clien.net/service/board/cm_mac`), 디시인사이드 `기계식키보드 마이너 갤러리`, `키보드매니아` / `키랩`, `벨로그` / `티스토리`, `디스콰이엇` (`disquiet.io`), YouTube Korea** | Transparent maker log on Disquiet; technical Velog/Tistory posts (indexed by Google KR, ChatGPT, Claude and Perplexity where Naver Cafe is blocked); ZMK/QMK visual editor showcase on `기계식키보드 갤러리` and `키랩`; Clien `맥당` introduction obeying promotion-board rules; 60s YouTube WPM/misfire proof video. | `launch-and-community-posts`, `youtube-packaging` | launch week |
| **Brazil (`pt-BR`) & Portugal (`pt-PT`)** | **Reclame Aqui (`reclameaqui.com.br`) — trust pre-emption** | **Do NOT register an *RA Empresas* company account** unless `hyly` holds an active Brazilian CNPJ. Instead, satisfy `"Ultimate Keyboards é confiável"` / `"Ultimate Keyboards Reclame Aqui"` Google searches on `/pt/keyboards/` with: MIT open-source GitHub link, Apple Developer ID notarization note, clear free-vs-Pro *compra única* pricing, no-friction refund policy (*reembolso sem burocracia*), and Portuguese support contact. Monitor `"hyly" site:reclameaqui.com.br` quarterly. | site copy (`store-and-landing-copy-kr-us`) | with `/pt/keyboards/` |
| **Brazil (`pt-BR`) & Portugal (`pt-PT`)** | **YouTube Brasil (+ Shorts / Reels / TikTok)** | 30–60s `pt-BR` captioned split-screen video: fast MacBook typing without home-row misfires, typing `ç`/`~`/`|` on a US-ANSI MacBook via a layer, and editing a wireless Corne ZMK keymap visually. | `youtube-packaging` | not yet |
| **Brazil (`pt-BR`) & Portugal (`pt-PT`)** | **TabNews (`tabnews.com.br`), `r/tecladosmecanicos`, `r/brdev`, MacMagazine (`macmagazine.com.br`), Manual do Usuário, Pplware (`pplware.sapo.pt`)** | Technical maker write-up on TabNews and `r/tecladosmecanicos` (solving ANSI/ABNT2 symbols + home-row mods + ZMK/QMK AST minimal-diff edits); editorial pitch to MacMagazine, Manual do Usuário and Pplware once notarized. | `launch-and-community-posts` | launch week |
| **LatAm, US Hispanic & Spain (`es`)** | **YouTube en español (+ Shorts / TikTok)** | Spanish-captioned screen + hands demo: *"Home row mods + cómo escribir la ñ y tildes en un MacBook con teclado en inglés"* and visual Corne ZMK keymap editing + GitHub Actions build (YouTube reaches 65%–83% weekly across US Hispanic, Mexico, Colombia, Argentina, Chile, Peru and Spain). | `youtube-packaging` | not yet |
| **LatAm (`es`)** | **Mercado Libre (`mercadolibre.com.mx`, `.com.ar`, `.com.co`, `.cl`, `.com.pe`) — hardware-substitute vocabulary only** | **Never list downloadable software or license keys on Mercado Libre** (prohibited/restricted under Mercado Libre IP policy). Use Mercado Libre's real hardware search vocabulary (*"teclado split ergonómico Corne"*, *"teclado inalámbrico ZMK"*, $120–$250 USD) in `/es/keyboards/` comparison/hero copy: test split-keyboard layers, combos and home-row mods free on your MacBook first, and edit your Corne/Lily58/Sofle ZMK or QMK board in the same Mac app if you buy one. | site copy | with `/es/keyboards/` |
| **LatAm, US Hispanic & Spain (`es`)** | **`r/ErgoMechKeyboards` (ES threads), `r/taquerosprogramadores`, `r/devsarg`, `r/chileIT`, `r/ColombiaDevs`, Applesfera, Genbeta, Hipertextual, Uptodown (`uptodown.com`)** | Answer Spanish Corne/ZMK and US-ANSI `ñ` threads (disclosed as developer); pitch Applesfera, Genbeta and Hipertextual at notarized launch; claim official macOS/Android developer profile on Uptodown (`uptodown.com/developers-console`), which ranks page 1 in Spanish for Karabiner/Mac utility queries. | `launch-and-community-posts` | launch week |

### 4. Locale checklist (2026-11-17)
- [x] `marketing/queries-es.md`, `marketing/queries-pt.md`, `marketing/queries-ko.md` drafted from real local phrasing with frozen 14-prompt AI panels (`P01`–`P14`) (done 2026-11-17, `HW-SEO-15`)
- [x] Locale rows (category phrases, Hangul spellings, accent/spacing variants) added to `marketing/facts.md` (done 2026-11-17, `HW-SEO-15`)
- [x] Companion app store listing drafts (`docs/store/en-US.md`, `es-419.md`, `pt-BR.md`, `ko-KR.md`, incl. `es-ES` and `pt-PT` notes) created within Play 30/80/4000 and App Store 30/30/170/100B/4000 limits (done 2026-11-17, `HW-SEO-15`)
- [ ] Baseline AI-panel runs for `es`, `pt` and `ko` in Orca (`ai-visibility.csv` dated locale rows) — next (`HW-SEO` panel step)
- [ ] Ship `/en/keyboards/`, `/es/keyboards/`, `/pt/keyboards/`, `/ko/keyboards/` SSR pages with reciprocal `hreflang`, `og:locale` and `inLanguage` (`HW-L10N` / site step)
- [ ] Submit sitemaps & IndexNow across Google Search Console, Bing Webmaster Tools, Naver Search Advisor and Daum 검색등록 (`hyly.world` hub step)
