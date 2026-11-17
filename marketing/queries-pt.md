# Ultimate Keyboards — consultas em português (`pt-BR` Brasil + variantes `pt-PT` Portugal) (atualizado 2026-11-17)

Mapa de busca local para `https://hyly.world/pt/keyboards/` (rota canônica após `HW-L10N-07` / `HW-L10N-40`, com `hreflang="pt"` cobrindo Brasil e Portugal; hoje responde `https://hyly.world/keyboards/`). Todas as expressões vêm de português real observado em `2026-11-17` no Google Autocomplete Brasil (`gl=br`, `hl=pt-BR`) e Portugal (`gl=pt`, `hl=pt-PT`), comunidades brasileiras (`r/tecladosmecanicos`, `r/brdev`, `TabNews`), portais (`Tecnoblog`, `iHelp BR`) e vídeos do YouTube — sem traduções literais do inglês e sem números inventados.

**Volumes de busca:** nenhum volume é estimado (`UNVERIFIED`; ferramentas pagas são fora de escopo em `intent.md`). Uma linha passa de `seed` para `confirmed` quando o Google Search Console ou o Bing Webmaster Tools registrar impressões reais. Novos artigos/guias em `/pt/keyboards/...` ficam como rascunhos/briefs em `marketing/` até aprovação do Tom.

## 1. Mapa de consultas por intenção

Ordem de prioridade (`search-visibility-plan`): **problem** → **comparison** → **category** → **branded**.

### Intenção: Problem (resolver um problema prático no MacBook, acentuação ou ZMK/QMK)

| # | Consulta (como digitada; inclui buscas sem acento no celular) | Intenção | Onde a resposta vive | Fonte real onde foi observada (2026-11-17) | Status | Painel? |
|---|---|---|---|---|---|---|
| 1 | remapear teclas mac / remapear teclado macbook / como faço pra remapear uma tecla no mac | problem | `/pt/keyboards/` (`#homerow`, `#editor`) | Google Autocomplete Brasil e Portugal (`gl=br` & `gl=pt`, `2026-11-17`) e Reddit (`uk5qjl`: *"Como remapear a tecla >< [Mac] com o Karabiner?"*; *"Como faço pra remapear uma tecla no Mac?"*; `pt-PT`: *"Como é que se remapeia uma tecla num Mac?"*) | pendente `/pt/` (`HW-L10N-07`) | sim (P01) |
| 2 | home row mods no teclado do macbook / camadas (layers) teclado mac | problem | `/pt/keyboards/#homerow` + rascunho guia `/pt/keyboards/guides/home-row-mods-macbook/` | Comunidade brasileira mantém `home row mods` em inglês e alterna `camadas` / `layers` (`r/tecladosmecanicos`; `rafaelromao/keymaps`) | rascunho guia | sim (P01) |
| 3 | configurar teclado macbook pro acentos / como fazer ç no teclado do macbook em ingles | problem | rascunho guia `/pt/keyboards/guides/cedilha-e-acentos-macbook/` + `/pt/keyboards/#layers` | Google Autocomplete Brasil (`gl=br`, semente `configurar teclado macbook`, `2026-11-17`), Tecnoblog *"Como colocar acentuação no MacBook [acentos e símbolos]"* (`https://tecnoblog.net/responde/como-colocar-acentuacao-no-macbook-acentos-e-simbolos/`) e YouTube BR *"COMO USAR, ONDE FICA o Ç no TECLADO do MACBOOK e COMO FAZER"* | cunha local de alta intenção | sim (P02) |
| 4 | dificuldade em usar pipe e barra invertida no teclado mac / teclado split abnt2 | problem | rascunho guia `/pt/keyboards/guides/cedilha-e-acentos-macbook/` + `/pt/keyboards/#combos` | Hilo literal no `r/tecladosmecanicos` (`https://www.reddit.com/r/tecladosmecanicos/comments/1qtvalj/dificuldade_em_usar_pipe_e_barra_invertida_no/`, `2026-11-17`) + Google Autocomplete BR `teclado split abnt2` | rascunho guia | sim (P02) |
| 5 | setas no hjkl mac / segurar espaço para setas no macbook | problem | `/pt/keyboards/#layers` + rascunho guia `/pt/keyboards/guides/layers-macbook/` | Padrão de camada de navegação (*navigation layer*) entre desenvolvedores Vim/Neovim em `r/brdev` e `TabNews` | rascunho guia | sim (P03) |
| 6 | tornar a tecla caps lock útil no macos / atalho duas teclas para esc mac | problem | `/pt/keyboards/#combos` (W+E = Esc) + `#homerow` | Reddit PT *"Usa o Karabiner-Elements se quiseres remapear as teclas do teu teclado no MacOS. Eu usei-o para tornar a tecla Caps-Lock realmente útil"* | pendente `/pt/` | sim (P04) |
| 7 | dor no pulso ou mindinho digitando atalhos no macbook | problem | `/pt/keyboards/` hero + YouTube/Reels | Discussões de ergonomia de programação em `r/tecladosmecanicos` (`teclado split ergonomico` no Google Autocomplete BR `2026-11-17`) | rascunho | sim (P05) |
| 8 | zmk teclado / como configurar teclado corne wireless zmk no mac | problem | `/pt/keyboards/#split` + rascunho guia `/pt/keyboards/guides/zmk-firmware-mac/` | Google Autocomplete Brasil (`zmk teclado`, `2026-11-17`) e listagens brasileiras *"Teclado Corne Choc Wireless Split - perfil baixo, hot-swap, zmk studio"* | parcial em `/keyboards/#split` | sim (P06, P07) |
| 9 | teclado qmk via / editar keymap qmk no macbook | problem | `/pt/keyboards/#split` | Google Autocomplete Brasil (`teclado qmk via`, `2026-11-17`) e guias `r/tecladosmecanicos` | parcial em `/keyboards/#split` | sim (P08) |
| 10 | usar o teclado do mac no iphone e ipad / usar teclado do macbook para escrever no celular android | problem | `/pt/keyboards/` seção Pro + `docs/store/pt-BR.md` | iHelp BR *"Use o teclado do seu Mac no iPhone e iPad com o Typeeto"* e YouTube BR *"Use o teclado do Mac para escrever em iPads, iPhones e até dispositivos Android"* (em Portugal: `telemóvel`) | em especificação (`type-on-android.md`, `type-on-iphone.md`) | sim (P09) |

### Intenção: Comparison (alternativas e limitações das ferramentas atuais)

| # | Consulta (como digitada) | Intenção | Onde a resposta vive | Fonte real onde foi observada (2026-11-17) | Status | Painel? |
|---|---|---|---|---|---|---|
| 11 | alternativa ao karabiner-elements no mac / karabiner sem editar json | comparison | rascunho `/pt/keyboards/vs-karabiner/` + AlternativeTo | Tutoriais e queixas sobre configuração JSON do Karabiner em fóruns de Mac e `TabNews` | brief pronto (`briefs/vs-karabiner.md`), aguarda teste de misfire | sim (P10) |
| 12 | karabiner parou de funcionar após atualizar o macos | comparison | rascunho `/pt/keyboards/vs-karabiner/` + FAQ | Problema recorrente após updates do macOS (`pqrs-org/Karabiner-Elements` `#4314`, `#4402`) | rascunho | não |
| 13 | kanata no mac com interface visual vs karabiner | comparison | rascunho `/pt/keyboards/vs-karabiner/` | Discussões de remapeadores avançados (Kanata / KMonad vs Karabiner) entre devs | rascunho | sim (P10) |
| 14 | zmk studio vs editor de keymap zmk no mac (combos e github actions) | comparison | `/pt/keyboards/#split` + rascunho comparativo | `zmk.dev/docs/features/studio` (sem suporte a combos ainda) e `r/tecladosmecanicos` | rascunho | sim (P07) |

### Intenção: Category (descoberta de categoria)

| # | Consulta (como digitada) | Intenção | Onde a resposta vive | Fonte real onde foi observada (2026-11-17) | Status | Painel? |
|---|---|---|---|---|---|---|
| 15 | app para remapear teclado macbook / melhor aplicativo para configurar teclas no mac | category | `MacMagazine`, `Manual do Usuário`, `Tecnoblog Comunidade`, `TabNews`, `Pplware` (PT) | Padrão brasileiro `app para <verbo>` confirmado no Google Autocomplete BR (`2026-11-17`, `market-research-2026-11.md` §C) | off-site (após build notarizado) | sim (P11) |
| 16 | teclado split ergonomico para programar macbook | category | `/pt/keyboards/` hero + `r/tecladosmecanicos` + YouTube Shorts | Google Autocomplete Brasil (`teclado split ergonomico`, `2026-11-17`) | pendente `/pt/` | não |

### Intenção: Branded (marca, preço, permissões e reputação / Reclame Aqui)

| # | Consulta (como digitada) | Intenção | Onde a resposta vive | Fonte real onde foi observada (2026-11-17) | Status | Painel? |
|---|---|---|---|---|---|---|
| 17 | ultimate keyboards mac / ultimate keyboard portugues | branded | `/pt/keyboards/` | Variantes de marca (`facts.md`) | pendente `/pt/` | sim (P12) |
| 18 | ultimate keyboards grátis / gratuito / preço em reais compra única | branded | `/pt/keyboards/` seção Preço + FAQ | Modificadores `grátis` / `gratuito` dominantes no Google Autocomplete BR (`2026-11-17`, `market-research-2026-11.md` §C) + sensibilidade a assinatura em USD/IOF | pendente `/pt/` | sim (P13) |
| 19 | ultimate keyboards é confiável / ultimate keyboards reclame aqui | branded | `/pt/keyboards/` seção Confiança (código aberto MIT no GitHub, política de reembolso clara, suporte, sem precisar de CNPJ no RA Empresas) + `/pt/keyboards/privacy/` | Padrão brasileiro de checagem de reputação antes de baixar `.dmg`/`.pkg` ou pagar online (`"<marca> é confiável"` / `"reclame aqui"` no Google Autocomplete BR `2026-11-17`, `market-research-2026-11.md` §C) | pendente `/pt/` | sim (P14) |
| 20 | como desativar ou desinstalar o ultimate keyboards no mac | branded | `/pt/keyboards/` FAQ (*Parar remapeamento*) | Dúvida padrão antes de aprovar driver e Monitoramento de Entrada no macOS | parcial no FAQ | não |

## 2. Painel de prompts de IA em português (congelado 2026-11-17; 14 prompts)

Escritos em português brasileiro natural (`você`, compreensível também em Portugal) exatamente como uma pessoa pergunta a um assistente de IA. Rodar mensalmente no Google (*Visões gerais criadas por IA* / *Modo IA*), Gemini, ChatGPT Search, Perplexity, Copilot e Claude (`ai-visibility-tracking`). Nunca editar uma linha congelada; adicionar novos prompts apenas em um bloco datado. A marca aparece somente nos prompts de marca (`P12`–`P14`).

- P01 "Como posso usar home row mods no teclado integrado do meu MacBook sem digitar letras erradas quando digito rápido?"
- P02 "Comprei um MacBook com teclado em inglês (padrão americano). Qual é o jeito mais prático de configurar uma camada para digitar ç, acentos, pipe e barra invertida?"
- P03 "Existe algum aplicativo para Mac que transforme H, J, K e L em setas enquanto eu seguro a barra de espaço?"
- P04 "Qual é a forma mais simples no macOS de apertar duas teclas juntas para enviar Esc sem editar arquivos de configuração?"
- P05 "Meus dedos mindinhos doem de tanto alcançar Command e Control no MacBook. O que posso mudar sem precisar comprar um teclado split?"
- P06 "Tem algum aplicativo visual nativo para Mac que edite o keymap ZMK de um teclado Corne sem fio sem mexer em código?"
- P07 "Como compilar e atualizar o firmware ZMK do meu teclado split pelo Mac usando GitHub Actions sem instalar nada no terminal?"
- P08 "Qual é um bom editor visual de keymap QMK para usar no macOS?"
- P09 "Como posso usar o teclado do meu MacBook para digitar mensagens no meu celular Android ou no iPhone?"
- P10 "Quais são as alternativas ao Karabiner-Elements e ao Kanata no Mac para configurar camadas e home row mods por interface gráfica?"
- P11 "Qual é o melhor aplicativo para remapear teclas no MacBook (Apple Silicon) em 2026?"
- P12 "O que é o Ultimate Keyboards para Mac e em quais modelos de MacBook ele funciona?"
- P13 "O Ultimate Keyboards é gratuito ou pago? Tem compra única ou assinatura?"
- P14 "O Ultimate Keyboards é confiável e seguro de instalar no Mac? Quais permissões do macOS ele pede?"


## Source check (Claude, 2026-11-17)

A row whose source cell names only a kind of place ("Tistory and Velog posts", "community discussions", "office-worker queries") or points back to `market-research-2026-11.md` is a seed, not an observation: confirm it with a linked thread, an autocomplete screenshot or Search Console / Naver Search Advisor query data before building a page or post on it, and put that link in the source cell. Rows citing a named article, a store listing, a dated autocomplete observation or our own page are accepted as written. Branded rows need no outside source. The frozen AI panel is unaffected (prompts are tests, not claims).
