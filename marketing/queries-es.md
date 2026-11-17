# Ultimate Keyboards — consultas en español (`es`: Hispanoamérica, EE. UU. hispano y España) (actualizado 2026-11-17)

Mapa de búsqueda local para `https://hyly.world/es/keyboards/` (ruta canónica una vez desplegado `HW-L10N-07` / `HW-L10N-40`; hoy responde `https://hyly.world/keyboards/`). Todas las frases provienen de lenguaje real en español observado el `2026-11-17` en títulos de hilos de Reddit, artículos editoriales en español, soporte oficial de Apple, tutoriales de YouTube y búsquedas de hardware en Mercado Libre; ninguna es traducción literal del inglés (nunca usar *"modificaciones de fila de casa"* para *home row mods*).

**Volúmenes de búsqueda:** no se inventa ningún volumen (`UNVERIFIED`; sin herramientas de pago por regla de `intent.md`). Una fila pasa de `seed` (observada en comunidad/editorial/autocompletado) a `confirmed` cuando Google Search Console o Bing Webmaster Tools registren impresiones reales. Las guías y comparativas nuevas en `/es/keyboards/...` permanecen como borradores/briefs en `marketing/` hasta que Tom apruebe su publicación.

## 1. Mapa de consultas por intención

Orden de valor para un producto pequeño (`search-visibility-plan`): **problem** → **comparison** → **category** → **branded**.

### Intención: Problem (resolver un problema concreto en Mac, teclado en inglés o ZMK/QMK)

| # | Consulta (tal como se busca) | Intención | Dónde vive la respuesta | Fuente real donde se observó (2026-11-17) | Estado | ¿Panel? |
|---|---|---|---|---|---|---|
| 1 | remapear teclas teclado mac / cambiar teclas de modificación mac | problem | `/es/keyboards/` (`#homerow`, `#editor`) | Apple Support ES *"Cambiar el comportamiento de las teclas de modificación del Mac"* (`https://support.apple.com/es-es/guide/mac-help/mchlp1145/mac`) y Reddit `r/osx` (`imx1wt`: *"Usa Karabiner-Elements si quieres remapear las teclas de tu teclado en MacOS"*) | pendiente `/es/` (`HW-L10N-07`) | sí (P01) |
| 2 | home row mods en teclado macbook / modificadores en la fila guía mac | problem | `/es/keyboards/#homerow` + borrador guía `/es/keyboards/guides/home-row-mods-macbook/` | Uso real de `home row mods` sin traducir + *"fila guía / fila central"* en comunidades de teclados en español (`r/ErgoMechKeyboards` ES) | borrador guía | sí (P01) |
| 3 | cómo poner la ñ en macbook con teclado en inglés / escribir tildes en teclado inglés mac | problem | borrador guía `/es/keyboards/guides/n-y-tildes-teclado-ingles-mac/` + `/es/keyboards/#layers` | YouTube *"Cómo poner la Ñ en tu MacBook con teclado en inglés (fácil)"* (`https://www.youtube.com/watch?v=GkTRuPafKo4`), FreeCodeCamp Español *"Cómo escribir letras con tildes en Mac"* (`https://www.freecodecamp.org/espanol/news/como-escribir-letras-con-tildes-en-mac/`) y Reddit `r/Spanish` (`1l4v2d6`: *"Atajo de teclado para la ñ cuando usas U.S. International - PC Keyboard en Mac"*) | oportunidad clave (casi cero competencia en ZMK/capas) | sí (P02) |
| 4 | cambiar bloq mayús por escape o control en mac | problem | `/es/keyboards/#combos` (W+E = Esc) + `#homerow` | Reddit `r/osx` (`imx1wt`: *"hacer que mi tecla de Bloq Mayús fuera realmente útil"*) | pendiente `/es/` | sí (P04) |
| 5 | flechas en hjkl mac / crear capas de teclado en macbook | problem | `/es/keyboards/#layers` + borrador guía `/es/keyboards/guides/layers-macbook/` | Patrón de capas (*layers* / mantener Espacio para flechas) en guías de QMK/Karabiner en español | borrador guía | sí (P03) |
| 6 | dolor de muñeca o meñique por atajos command y control en macbook | problem | `/es/keyboards/` hero + borrador guía ergonómica + vídeos cortos | Consultas ergonómicas de programadores sobre teclados divididos (*split*) en español (`YouTube` *"Corne Keyboard - El mejor teclado para programar?"*) | borrador guía | sí (P05) |
| 7 | mapeos de teclado corne para programadores / poner la ñ en teclado corne zmk | problem | `/es/keyboards/#split` + borrador guía `/es/keyboards/guides/zmk-firmware-mac/` | Hilo literal en Reddit `r/ErgoMechKeyboards` (`1927tqc`: *"Mapeos de teclado Corne para programadores?"*, `2024-01-09`) | borrador guía | sí (P06) |
| 8 | configurar teclado inalámbrico zmk en mac sin código (corne, lily58, sofle) | problem | `/es/keyboards/#split` + borrador guía `/es/keyboards/guides/zmk-firmware-mac/` | Hilo literal en Reddit `r/ErgoMechKeyboards` (`1i3b06l`: *"Repositorio para teclados inalámbricos que usan ZMK con soporte para corne, lily58, SofleV1..."*, `2025-01-06`) y YouTube *"corne keyboard full wireless nicenano tutorial (guia facil)"* | parcial en `/keyboards/#split` | sí (P06, P07) |
| 9 | crear y flashear keymap con qmk en mac / configurar qmk en español | problem | `/es/keyboards/#split` + YouTube | DEV Community ES *"Crear y flashear tu propio keymap con QMK firmware"* y YouTube *"Tutorial de QMK en español - Cómo programar tu teclado mecánico custom"* | parcial en `/keyboards/#split` | sí (P08) |
| 10 | usar el teclado del mac para escribir en el iphone o android | problem | `/es/keyboards/` sección Pro + ficha `docs/store/es-419.md` | Applesfera / ABC *"Utiliza el teclado bluetooth de tu Mac en tu iPhone o iPad con Typeeto"* (cobertura editorial de escritura desde Mac hacia móvil/celular) | en especificación (`type-on-iphone.md`, `type-on-android.md`) | sí (P09) |

### Intención: Comparison (comparativas y fricción con herramientas actuales)

| # | Consulta (tal como se busca) | Intención | Dónde vive la respuesta | Fuente real donde se observó (2026-11-17) | Estado | ¿Panel? |
|---|---|---|---|---|---|---|
| 11 | alternativa a karabiner-elements para mac / qué tan difícil es usar karabiner | comparison | borrador `/es/keyboards/vs-karabiner/` (única página que nombra a Karabiner, aprobado por Tom `2026-11-15`) + AlternativeTo | Reddit `r/mac` (`1f0b0u0`: *"¿Qué tan fácil o difícil te resulta usar Karabiner-Elements?"*) y Uptodown ES (`https://karabiner-elements.uptodown.com/mac`) | brief listo (`briefs/vs-karabiner.md`), falta test propio de misfires | sí (P10) |
| 12 | reasignar teclado de mac sin editar archivos de configuración de kanata | comparison | borrador `/es/keyboards/vs-karabiner/` | Hilo literal en Reddit `r/mac` (`1j53h7n`: *"Reasigna tu teclado de Mac sin editar archivos de configuración de Kanata"*) | borrador | sí (P10) |
| 13 | karabiner dejó de funcionar al actualizar macos | comparison | borrador `/es/keyboards/vs-karabiner/` + FAQ | Queja recurrente en foros Mac y GitHub (`pqrs-org/Karabiner-Elements` `#4314`, `#4402`) | borrador | no |
| 14 | zmk studio vs editor de keymap para mac (combos y github actions) | comparison | `/es/keyboards/#split` + borrador comparativa | Documentación ZMK Studio (`zmk.dev/docs/features/studio`: sin combos aún) y YouTube *"VIA Configuracion CORNE - TUTORIAL"* | borrador | sí (P07) |

### Intención: Category (búsqueda de herramienta o sustituto físico)

| # | Consulta (tal como se busca) | Intención | Dónde vive la respuesta | Fuente real donde se observó (2026-11-17) | Estado | ¿Panel? |
|---|---|---|---|---|---|---|
| 15 | mejor programa para remapear teclas en mac 2026 | category | reseñas en `Genbeta`, `Applesfera`, `AlternativeTo`, `YouTube` | Listas editoriales de utilidades para Mac en `Genbeta` y `Applesfera` | off-site (tras lanzamiento notarizado) | sí (P11) |
| 16 | teclado split ergonómico corne (probar capas antes de comprar teclado dividido) | category | `/es/keyboards/` hero (*poder de teclado dividido en tu MacBook*) + YouTube | Búsquedas de hardware sustituto en **Mercado Libre** (*"Corne Keyboard"*, *"Teclado Ergonómico Split Corne"* en México, Colombia, Argentina, Chile y Ecuador) — no vender software en Mercado Libre, sino captar en web a quien duda antes de gastar $120–$250 USD | pendiente `/es/` | no |

### Intención: Branded (marca, precio, permisos y compatibilidad)

| # | Consulta (tal como se busca) | Intención | Dónde vive la respuesta | Fuente real donde se observó (2026-11-17) | Estado | ¿Panel? |
|---|---|---|---|---|---|---|
| 17 | ultimate keyboards mac / ultimate keyboard español | branded | `/es/keyboards/` | Variantes de marca (`facts.md`) + modificador local `español` | pendiente `/es/` | sí (P12) |
| 18 | ultimate keyboards gratis / precio / pago único sin suscripción | branded | `/es/keyboards/` sección Precio + FAQ | Hábito de búsqueda en LATAM y España (`gratis`, `precio`, `pago único` frente a suscripciones en USD; `market-research-2026-11.md` §B) | pendiente `/es/` | sí (P13) |
| 19 | es seguro ultimate keyboards mac / qué permisos pide | branded | `/es/keyboards/` sección Confianza + FAQ + `/es/keyboards/privacy/` | Dudas habituales al aprobar extensión de controlador y *Monitorización de entrada* en macOS | parcial en FAQ | sí (P14) |
| 20 | cómo desactivar o desinstalar ultimate keyboards en mac | branded | `/es/keyboards/` FAQ (*Detener remapeo*) | Consulta de seguridad antes de instalar un remapeador de teclado | parcial en FAQ | no |

## 2. Panel de prompts de IA en español (congelado 2026-11-17; 14 prompts)

Redactados en español neutro (`tú`, natural tanto en Hispanoamérica/EE. UU. como en España) tal como una persona pregunta a un asistente. Ejecutar mensualmente en Google AI Overviews / AI Mode, Gemini, ChatGPT Search, Perplexity, Copilot y Claude (`ai-visibility-tracking`). Nunca editar una fila congelada; añadir bloques nuevos con fecha. La marca solo aparece en los prompts de intención de marca (`P12`–`P14`).

- P01 "¿Cómo puedo usar home row mods en el teclado integrado de mi MacBook sin que fallen letras al escribir rápido?"
- P02 "Tengo un MacBook con teclado en inglés (ANSI). ¿Cuál es la forma más cómoda de configurar una capa para escribir la ñ y las tildes sin cambiar de teclado?"
- P03 "¿Hay alguna aplicación para Mac que me deje mantener presionado Espacio y usar H, J, K y L como teclas de flecha?"
- P04 "¿Cómo hago en macOS para que al pulsar dos teclas a la vez se envíe Escape sin perder Bloq Mayús?"
- P05 "Me duelen los meñiques de tanto usar Command y Control programando en mi MacBook. ¿Qué opciones tengo sin comprar un teclado ergonómico dividido?"
- P06 "¿Existe un editor visual nativo en Mac para configurar el keymap ZMK de un teclado Corne inalámbrico sin editar código a mano?"
- P07 "¿Cómo puedo compilar el firmware ZMK de mi teclado dividido desde un Mac usando GitHub Actions sin instalar herramientas de terminal?"
- P08 "¿Qué programa visual recomiendas en macOS para editar las teclas y combos de un teclado QMK?"
- P09 "¿Cómo puedo usar el teclado de mi MacBook para escribir mensajes largos en mi iPhone o en mi teléfono Android?"
- P10 "¿Qué alternativas hay a Karabiner-Elements y Kanata en Mac para configurar capas y home row mods con interfaz gráfica?"
- P11 "¿Cuál es la mejor aplicación para remapear el teclado de un MacBook con Apple Silicon en 2026?"
- P12 "¿Qué es Ultimate Keyboards para Mac y en qué Macs funciona?"
- P13 "¿Ultimate Keyboards es gratis o cuánto cuesta? ¿Es de pago único o suscripción?"
- P14 "¿Es seguro instalar Ultimate Keyboards en macOS y qué permisos del sistema necesita?"


## Source check (Claude, 2026-11-17)

A row whose source cell names only a kind of place ("Tistory and Velog posts", "community discussions", "office-worker queries") or points back to `market-research-2026-11.md` is a seed, not an observation: confirm it with a linked thread, an autocomplete screenshot or Search Console / Naver Search Advisor query data before building a page or post on it, and put that link in the source cell. Rows citing a named article, a store listing, a dated autocomplete observation or our own page are accepted as written. Branded rows need no outside source. The frozen AI panel is unaffected (prompts are tests, not claims).
