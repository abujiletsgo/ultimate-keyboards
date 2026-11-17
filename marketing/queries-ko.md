# Ultimate Keyboards (얼티밋 키보드) — 한국어 검색어 맵 (`ko`) (업데이트 2026-11-17)

`https://hyly.world/ko/keyboards/`(다국어 라우팅 `HW-L10N-07` / `HW-L10N-40` 배포 후 정규 URL, 현재는 `https://hyly.world/keyboards/`)를 위한 실제 한국어 검색어 맵입니다. 모든 문구는 `2026-11-17` 기준 한국 개발자·맥 커뮤니티(클리앙 맥당, 네이버 카페 맥쓰사·아사모, 벨로그, 티스토리, 디시인사이드 기계식키보드 마이너 갤러리)의 실제 게시글 제목과 한국어 웹 검색 결과에서 확인한 자연스러운 표현만 담았으며, 영어 키워드를 번역투로 직역하지 않았습니다.

**검색량 표기 원칙:** 유료 SEO 도구나 광고주 로그인 없이는 숫자를 추정하지 않으며(`UNVERIFIED`, `intent.md` 규칙), Google Search Console, 네이버 서치어드바이저, Bing Webmaster Tools에서 실제 노출이 잡히면 `confirmed`로 바꿉니다. 한국 사용자는 띄어쓰기를 생략한 복합어(`키보드매핑`, `한영전환`, `홈로우모드`)로도 자주 검색하므로 대표 표기와 붙여쓰기 변형을 함께 적었습니다. `/ko/keyboards/...` 하위 신규 가이드·비교 글은 Tom 승인 전까지 `marketing/` 내 초안·브리프로만 유지합니다.

## 1. 검색 의도별 쿼리 맵

우선순위(`search-visibility-plan`): **problem** → **comparison** → **category** → **branded**.

### 의도: Problem (맥북 한영전환·홈로우·방향키·ZMK/QMK 문제 해결)

| # | 실제 검색어 (띄어쓰기 변형 포함) | 의도 | 답변 위치 (자사 페이지 / 외부 채널) | 실제 확인 출처 (2026-11-17) | 상태 | 패널? |
|---|---|---|---|---|---|---|
| 1 | 맥북 한영전환 딜레이 해결 / 맥북 한영키 씹힘 / 캡스락 한영전환 안됨 | problem | 초안 가이드 `/ko/keyboards/guides/han-yeong-delay-macbook/` + `/ko/keyboards/` + 네이버 블로그·지식iN | 하우맥 *"맥북 macOS 한영키 입력 지연, 씹힘 해결방법"*, 티스토리(`jaeminkong.tistory.com/38`) *"맥 한영전환 딜레이 카라비너(무료)로 해결하기"*, 벨로그 *"맥북 카라비너 없이 hidutil로 한/영 전환 키 바꾸기"* | 한국 핵심 진입 키워드 (초안) | 예 (P02) |
| 2 | 맥북 홈로우 모드 / 맥 내장 키보드 홈 로우 모드 (Home Row Mods) | problem | `/ko/keyboards/#homerow` + 초안 가이드 `/ko/keyboards/guides/home-row-mods-macbook/` | 티스토리·벨로그 인체공학 타이핑 및 홈로우 모드 설정 글 (`market-research-2026-11.md` §D) | `/ko/` 배포 대기 | 예 (P01) |
| 3 | 맥북 키보드 매핑 / 맥 자판 배열 키 위치 변경 | problem | `/ko/keyboards/` (`#homerow`, `#editor`) | 티스토리 감돌 *"맥 키보드 매핑(자판 배열, 키 위치) 변경: Karabiner 사용법"* | `/ko/` 배포 대기 | 예 (P01) |
| 4 | 맥북 방향키 매핑 hjkl / 맥 vim 방향키 레이어 설정 | problem | `/ko/keyboards/#layers` + 초안 가이드 `/ko/keyboards/guides/layers-macbook/` | 벨로그 *"[설정] karabiner - capslock으로 방향키 매핑"*, *"[Karabiner] mac 한/영키, vim 키 설정"* | 초안 가이드 | 예 (P03) |
| 5 | 맥북 캡스락 활용 / 두 키 동시에 눌러 esc 입력 (콤보) | problem | `/ko/keyboards/#combos` (W+E = Esc, K+L = Enter) | 벨로그 *"[8] Karabiner-Elements로 CapsLock키 무한 활용하기"* | `/ko/` 배포 대기 | 예 (P04) |
| 6 | 맥북 코딩 손목 통증 / 커맨드 컨트롤 새끼손가락 피로 키 리매핑 | problem | `/ko/keyboards/` 히어로 + 네이버 블로그 사용기 초안 | 티스토리·벨로그 개발자 손목 통증 및 스플릿·홈로우 입문 글 (`market-research-2026-11.md` §D) | 초안 | 예 (P05) |
| 7 | 무선 스플릿 키보드 zmk 키맵 에디터 / 코른(corne) zmk 키맵 설정 | problem | `/ko/keyboards/#split` + 초안 가이드 `/ko/keyboards/guides/zmk-firmware-mac/` | 티스토리(`2025-08-21`, `Charybdis 무선 스플릿 키보드`), 벨로그 스플릿 키보드 빌드 로그, 디시인사이드 `기계식키보드 마이너 갤러리` | `/keyboards/#split` 일부 반영 | 예 (P06) |
| 8 | zmk 펌웨어 빌드 github actions 맥북 | problem | `/ko/keyboards/#split` + 초안 가이드 `/ko/keyboards/guides/zmk-firmware-mac/` | GitHub Gist *"ZMK의 새 키보드 쉴드 만들기 문서를 한글화 해보았습니다"* 및 국내 ZMK 빌드 가이드 | 초안 가이드 | 예 (P07) |
| 9 | qmk 키맵 설정 맥북 / 해피해킹 커스텀 키보드 맥 매핑 | problem | `/ko/keyboards/#split` | 티스토리 *"QMK 키보드를 사용한다는 것"*, 벨로그 *"[Mac OS] 해피해킹 키보드 매핑하기 - Karabiner"* | `/keyboards/#split` 일부 반영 | 예 (P08) |
| 10 | 맥북 마우스 휠 방향 전환 / scroll reverser 대체 | problem | `/ko/keyboards/` (Scroll & Mouse 기능 안내) | 벨로그·티스토리 *"[카라비너(Karabiner)] 미쳤다. Scroll Reverser 버리고 카라비너로 맥북 마우스 휠 전환"* (`README.md` `This Mac › Scroll & Mouse` 대응) | 보조 진입점 | 아니오 |
| 11 | 맥북 키보드로 아이폰 아이패드 타이핑 / 맥 키보드로 갤럭시 문자 입력 | problem | `/ko/keyboards/` Pro 섹션 + 스토어 초안 `docs/store/ko-KR.md` | the Mac *"[일시무료] 맥북 키보드를 iOS∙안드로이드 무선 키보드로 만들어 주는 'Typeeto'"*, 준호씨의 블로그 *"1Keyboard - 맥북 키보드를 이용해서 아이패드, 아이폰 키보드 타이핑하기"* | 스펙 확정 (`type-on-iphone.md`, `type-on-android.md`) | 예 (P09) |

### 의도: Comparison (카라비너·Kanata·ZMK Studio 대안 및 충돌 해결)

| # | 실제 검색어 (띄어쓰기 변형 포함) | 의도 | 답변 위치 (자사 페이지 / 외부 채널) | 실제 확인 출처 (2026-11-17) | 상태 | 패널? |
|---|---|---|---|---|---|---|
| 12 | 카라비너 대체 프로그램 / 카라비너 없이 키 매핑 | comparison | 초안 `/ko/keyboards/vs-karabiner/` (카라비너 직접 비교는 이 페이지에만 작성, Tom `2026-11-15` 승인) + 벨로그 | 벨로그 *"맥북 카라비너 없이 hidutil로 한/영 전환 키 바꾸기"* 및 `market-research-2026-11.md` §D (`카라비너 대체`) | 영문 브리프 완료, 오입력 실측 필요 | 예 (P10) |
| 13 | 맥북 카라비너 키 설정 안됨 / macos 업데이트 후 카라비너 먹통 | comparison | 초안 `/ko/keyboards/vs-karabiner/` + FAQ | 벨로그 *"맥북 m2 카라비너 키 설정 안됨 이슈 해결법"*, *"카라비너 적용 안 되는 문제 해결"* | 초안 | 예 (P10) |
| 14 | 카라비너 홈로우 모드 오입력 vs kanata 맥북 | comparison | 초안 `/ko/keyboards/vs-karabiner/` | 국내 파워유저 블로그의 카라비너 Complex Modifications 오입력 및 Kanata 전환 후기 | 초안 | 예 (P10) |
| 15 | zmk 스튜디오 키맵 에디터 차이 (콤보 지원 여부) | comparison | `/ko/keyboards/#split` + 초안 비교 섹션 | `zmk.dev/docs/features/studio` (콤보 미지원) 및 키랩·기계식키보드 갤러리 논의 | 초안 | 예 (P07) |

### 의도: Category (앱 추천·필수 유틸리티 탐색)

| # | 실제 검색어 (띄어쓰기 변형 포함) | 의도 | 답변 위치 (자사 페이지 / 외부 채널) | 실제 확인 출처 (2026-11-17) | 상태 | 패널? |
|---|---|---|---|---|---|---|
| 16 | 맥북 키보드 매핑 프로그램 추천 / m1 m2 m3 m4 맥북 필수 앱 추천 | category | 클리앙 `맥당`, 네이버 카페 `맥쓰사`, 디스콰이엇, 유튜브 `왓츠인마이맥북` | 벨로그 *"슬기로운 M1 MacBook생활 - 유용한 어플리케이션 top 10"* 및 클리앙·맥쓰사 추천 글 패턴 (`추천` 수식어) | 외부 채널 (공증 빌드 출시 후) | 예 (P11) |
| 17 | 스플릿 키보드 키맵 프로그램 추천 (코른, 릴리58) | category | 디시인사이드 `기계식키보드 갤러리`, `키보드매니아`, `키랩` | 국내 커스텀 분할 키보드 커뮤니티 질문 패턴 | 외부 채널 | 아니오 |

### 의도: Branded (브랜드 한글·영문 표기, 가격, 권한 안전성)

| # | 실제 검색어 (띄어쓰기 변형 포함) | 의도 | 답변 위치 (자사 페이지 / 외부 채널) | 실제 확인 출처 (2026-11-17) | 상태 | 패널? |
|---|---|---|---|---|---|---|
| 18 | 얼티밋 키보드 / 얼티밋키보드 맥 / ultimate keyboards | branded | `/ko/keyboards/` (`<title>`, `<h1>`, 첫 문단에 영문·한글 병기) | 한글 음차 검색 습관 (`카라비너`, `듀엣 디스플레이` 등; `market-research-2026-11.md` §D) | `/ko/` 배포 대기 | 예 (P12) |
| 19 | 얼티밋 키보드 가격 / 무료 / 구독 없는 평생 소장 앱 | branded | `/ko/keyboards/` 요금 섹션 + FAQ | 뽐뿌·클리앙의 `무료`, `구독 없는`, `평생 소장`(일회성 결제) 선호 검색 패턴 (`market-research-2026-11.md` §D) | `/ko/` 배포 대기 | 예 (P13) |
| 20 | 얼티밋 키보드 입력 모니터링 권한 안전 / 삭제 방법 | branded | `/ko/keyboards/` 신뢰·권한 섹션 + FAQ + `/ko/keyboards/privacy/` | macOS 입력 모니터링·가상 키보드 드라이버 허용 시 보안 우려 검색 패턴 | FAQ 일부 반영 | 예 (P14) |

## 2. 한국어 AI 프롬프트 패널 (2026-11-17 동결; 14개 문항)

실제 사용자가 AI 비서에게 물어보는 자연스러운 한국어 구어체로 고정했습니다. 매월 네이버 `AI 브리핑` / `AI탭`, Google `AI 개요`(AI Overviews) / `AI 모드`, ChatGPT Search, Perplexity, Gemini, Claude에서 실행하여 인용 여부와 사실 정확도를 기록합니다(`ai-visibility-tracking`). 동결된 문항은 절대 수정하지 않고, 추가가 필요하면 날짜가 적힌 새 블록으로만 덧붙입니다. 브랜드명은 브랜드 의도 문항(`P12`–`P14`)에만 포함됩니다.

- P01 "맥북 내장 키보드에서 빠르게 타이핑할 때 오입력 없이 홈로우 모드(Home Row Mods)를 쓰는 방법이 있어?"
- P02 "카라비너 JSON 설정 없이 맥북 키보드의 한/영 전환이나 캡스락 키를 깔끔하게 바꿀 수 있는 앱 있을까?"
- P03 "맥북에서 스페이스바를 누르고 있는 동안 H, J, K, L을 방향키로 쓸 수 있게 해 주는 프로그램 알려줘."
- P04 "macOS에서 두 키를 동시에 눌러 Esc나 엔터가 입력되게 콤보를 설정하려면 어떻게 해야 해?"
- P05 "맥북으로 코딩할 때 Command랑 Control 누르느라 새끼손가락이랑 손목이 아픈데 스플릿 키보드 안 사고 해결할 방법 있어?"
- P06 "코른(Corne) 같은 무선 스플릿 키보드의 ZMK 키맵을 코드 직접 안 고치고 맥에서 화면으로 편집할 수 있는 앱이 있어?"
- P07 "맥북에 개발 도구를 따로 안 깔고 GitHub Actions로 ZMK 펌웨어를 빌드해서 키보드에 올리는 가장 쉬운 방법이 뭐야?"
- P08 "macOS에서 QMK 키보드의 키 배치랑 콤보를 그래픽 화면으로 수정할 수 있는 키맵 에디터 추천해 줘."
- P09 "책상에서 맥북 키보드로 아이폰이나 갤럭시 휴대폰에 바로 카톡이나 문자를 타이핑할 수 있는 앱이 있어?"
- P10 "macOS 업데이트 때마다 말썽인 카라비너(Karabiner-Elements)나 설정이 복잡한 Kanata 대신 쓸 만한 GUI 키 매핑 앱 뭐 있어?"
- P11 "2026년 기준으로 애플 실리콘 맥북에서 쓸 수 있는 가장 편한 키보드 리매핑 프로그램이 뭐야?"
- P12 "맥용 얼티밋 키보드(Ultimate Keyboards)가 어떤 앱이고 인텔 맥에서도 돌아가?"
- P13 "얼티밋 키보드(Ultimate Keyboards)는 무료야, 유료야? 구독제인지 한 번만 결제하면 되는지 알려줘."
- P14 "얼티밋 키보드 설치할 때 입력 모니터링이랑 드라이버 권한을 달라고 하는데 안전해? 끄거나 지우는 법도 쉬워?"


## Source check (Claude, 2026-11-17)

A row whose source cell names only a kind of place ("Tistory and Velog posts", "community discussions", "office-worker queries") or points back to `market-research-2026-11.md` is a seed, not an observation: confirm it with a linked thread, an autocomplete screenshot or Search Console / Naver Search Advisor query data before building a page or post on it, and put that link in the source cell. Rows citing a named article, a store listing, a dated autocomplete observation or our own page are accepted as written. Branded rows need no outside source. The frozen AI panel is unaffected (prompts are tests, not claims).
