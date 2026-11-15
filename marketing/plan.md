# Ultimate Keyboards search visibility plan (updated 2026-11-15)

Stage: **pre-launch**. The 0.3 build exists but is not notarized; the site is a waitlist page at https://hyly.world/keyboards/.

## Site audit (site-search-readiness, live, 2026-11-15)
`check_site.py https://hyly.world/keyboards/`: **FAIL 0, WARN 1, PASS 22, INFO 6.** It is indexable, has 2,969 words in raw HTML (pre-rendered), canonical, one H1, OG, SoftwareApplication + Organization + Offer JSON-LD and llms.txt, and every search and AI crawler is allowed (robots and WAF probe).
- WARN: the hub sitemap https://hyly.world/sitemap.xml (the only one robots.txt lists) does not include /keyboards/. /keyboards/sitemap.xml exists but nothing points at it.

## Fix list, in order
| # | Fix | Where | Status |
|---|---|---|---|
| 1 | Deploy the corrected copy: the live page still says J+K = Esc and mentions "Karabiner export"; the WIP source (keyboards-site, uncommitted) has Tom's combos | keyboards-site | next: owned by the site session (edits 2026-11-14 23:54) |
| 2 | llms.txt still says "press J and K together for Escape" and "Free" | keyboards-site public/llms.txt | next, with #1 |
| 3 | Price consistency: JSON-LD `price: 0` and llms.txt "Free" vs FAQ "we'll say on launch day" | keyboards-site | blocked: Tom picks the price story |
| 4 | Add `https://hyly.world/keyboards/` to the hub sitemap, or add `Sitemap: https://hyly.world/keyboards/sitemap.xml` to hub robots.txt | hyly-world (dirty checkout, owned by another session) | next: hub owner |
| 5 | JSON-LD: add `sameAs` (GitHub) to Organization, `softwareRequirements`, `isAccessibleForFree`/price only after #3, `downloadUrl` at launch | keyboards-site | next, with #1 |
| 6 | IndexNow submit https://hyly.world/keyboards/ (key file is live on hyly.world) | after #1–#2 deploy | not yet: don't index stale facts |
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
- [ ] Comparison page vs Karabiner-Elements / Kanata: blocked until Tom decides whether naming Karabiner on a comparison page is OK (site copy rule: never mention it)
- [ ] Privacy/permissions page (what the driver and Input Monitoring see), uninstall page
- [ ] Changelog page on the site (CHANGELOG.md exists in the repo)

## Page map
| Page | URL | Intent | Status |
|---|---|---|---|
| Product | /keyboards/ | branded + category | live |
| Home-row mods guide | /keyboards/guides/home-row-mods-macbook/ | problem | not yet |
| Layers guide | /keyboards/guides/layers-macbook/ | problem | not yet |
| ZMK on Mac guide | /keyboards/guides/zmk-firmware-mac/ | problem | not yet |
| vs Karabiner / Kanata | /keyboards/vs-karabiner/ | comparison | blocked: Tom |
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
| GitHub README | Lead with the same category phrase as facts.md; link to the site | — | next |
| "Best Mac keyboard remapper" roundups | Factual pitch to authors once a notarized build exists | — | after launch |

## Content log
| Date | Piece | URL | Distributed | Refresh |
|---|---|---|---|---|
| — | — | — | — | — |
