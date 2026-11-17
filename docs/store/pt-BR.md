# Ultimate Keyboards — ficha da loja: `pt-BR` (Brasil) + notas `pt-PT` (Portugal)

Idioma: Português do Brasil (`você`), com bloco dedicado de adaptação para **`pt-PT`** (Portugal) no final — obrigatório porque tanto a App Store quanto o Google Play separam `pt-BR` e `pt-PT` em listagens distintas (se `pt-PT` ficar vazio na App Store de Portugal, a loja exibe inglês `en-GB` em vez do português do Brasil; `market-research-2026-11.md` §C). **Apenas rascunho — não enviado** (`intent.md`: alterações no App Store Connect proibidas agora; `world.hyly.keyboards` está em especificação em `docs/plan/type-on-android.md` e `docs/plan/type-on-iphone.md`).

Contagens em caracteres Unicode, exceto `Keywords` da App Store, medidas em bytes UTF-8 (sem acentos nem cedilha para economizar os 2 bytes UTF-8 por caractere acentuado). Nunca usar `"grátis"` ou `"gratuito"` no Título ou na Descrição curta (restrição de política do Google Play e da App Store).

## Google Play (`pt-BR`)

Idioma da ficha: `pt-BR` (Português – Brasil).

### Title
```text
Ultimate Keyboards: Teclas Mac
```
30 / 30 characters

### Short description
```text
App para digitar no celular pelo teclado do MacBook, com camadas e atalhos.
```
75 / 80 characters

### Full description
```text
O Ultimate Keyboards é um aplicativo para digitar no seu celular ou tablet Android direto pelo teclado integrado do seu MacBook por uma conexão local criptografada — mantendo seus home row mods, camadas (layers) e combinações de duas teclas funcionando do mesmo jeito.

CONECTE UMA VEZ, TROQUE COM UM ATALHO
• Leia o QR code exibido no seu Mac para parear o celular no Wi-Fi local (ou na sua rede NetBird) com criptografia de ponta a ponta (P-256 + AES-256-GCM).
• Aperte o atalho no Mac (por padrão, tocar nas duas teclas Command) para começar a digitar no celular; aperte de novo ou segure Esc para voltar ao MacBook.
• Uma barra compacta na parte inferior da tela mostra qual Mac está conectado e traz um botão de um toque para voltar na hora ao teclado normal do celular (Samsung Keyboard, Gboard ou outro) quando você sai da mesa.

PODER DE TECLADO SPLIT NO SEU MACBOOK
• Como o motor de remapeamento roda primeiro no seu Mac, seus modificadores na linha base (A, S, D, F e J, K, L, ;), a camada de setas segurando Espaço (H, J, K, L), suas camadas de acentuação, ç, pipe e barra invertida em MacBooks com teclado em inglês (padrão americano) e seus combos (K+L para Enter, I+O para Apagar, W+E para Esc) funcionam igualzinho ao digitar no celular.
• No Mac, o mesmo aplicativo configura visualmente o remapeamento de teclas do MacBook — sem editar arquivos JSON — e edita keymaps de teclados ergonômicos split com ZMK e QMK (Corne, Lily58, Sofle e outros).

LIMITES TRANSPARENTES E PRIVACIDADE (LGPD)
• Feito exclusivamente para digitação e edição de texto: não move o cursor do mouse nem aciona o botão Início ou a troca de aplicativos.
• Se a tela estiver bloqueada, nenhum campo de texto estiver aberto ou um aplicativo de banco abrir um teclado próprio de segurança, o seu Mac avisa na tela e mantém as teclas no Mac — nenhuma letra se perde no vazio.
• Sem anúncios, sem criar conta, sem gravar o que você digita e sem enviar seus textos para a nuvem (código-fonte aberto sob licença MIT).

REQUISITOS E COMPRA ÚNICA (SEM ASSINATURA)
• Este app complementar para Android pode ser baixado sem custo e sem anúncios.
• Requer o Ultimate Keyboards em um Mac com Apple Silicon (M1 ou mais recente) e macOS 13 ou superior (https://hyly.world/pt/keyboards/). Remapear o teclado do MacBook e editar ZMK/QMK no Mac fazem parte da versão gratuita; digitar no celular ou tablet usa o Ultimate Keyboards Pro no Mac (US$ 24 em compra única, US$ 19 no lançamento — sem assinatura).
```
2478 / 4000 characters

## App Store — iPhone e iPad (`pt-BR`)

Localização: `pt-BR` — Português (Brasil).

### Name
```text
Ultimate Keyboards: Teclas Mac
```
30 / 30 characters

### Subtitle
```text
Teclado do MacBook no iPhone
```
28 / 30 characters

### Promotional text
```text
Use o teclado do seu MacBook para digitar no iPhone ou iPad por Wi-Fi criptografado ou conexão direta, mantendo seus home row mods, camadas de setas, ç, acentos e combos.
```
170 / 170 characters

### Description
```text
O Ultimate Keyboards permite usar o teclado integrado do seu MacBook para digitar no seu iPhone ou iPad por uma conexão sem fio criptografada — mantendo exatamente os seus home row mods, camadas (layers) e combinações de duas teclas.

CONECTE SEM CABOS
• Ative o teclado do Ultimate Keyboards em Ajustes › Teclados (com Acesso Total para a conexão local sem fio) e leia o QR code exibido no seu Mac.
• Funciona na mesma rede Wi-Fi ou por conexão direta entre aparelhos Apple, sem cabos nem adaptadores.
• Aperte o atalho no Mac (por padrão, tocar nas duas teclas Command) para digitar no campo de texto aberto no iPhone ou iPad; aperte novamente ou segure Esc para voltar ao Mac.

HOME ROW MODS, CAMADAS, Ç E ACENTOS
• O motor do Mac processa cada tecla primeiro: seus modificadores em A, S, D, F e J, K, L, ;, as setas em H, J, K, L segurando Espaço, suas camadas para digitar ç, acentos, pipe e barra invertida em MacBooks de teclado americano e seus combos (K+L para Retorno, I+O para Apagar, W+E para Esc) funcionam na hora no iPhone e no iPad.
• No Mac, o Ultimate Keyboards configura o teclado visualmente — sem arquivos JSON — e edita keymaps de teclados split ZMK e QMK como Corne e Lily58.

LIMITES REAIS DO iOS E PRIVACIDADE
• Apenas digitação e edição de texto (não controla cursor, Spotlight nem troca de apps).
• Por segurança do iOS, campos de senha ou código e apps bancários que bloqueiam teclados de terceiros voltam automaticamente para o teclado padrão da Apple; o seu Mac mostra um aviso claro e mantém a digitação no Mac.
• Zero anúncios, zero contas e zero registro do que você digita; tudo trafega com criptografia de ponta a ponta.

REQUISITOS E COMPRA ÚNICA
• Download sem custo no iPhone e no iPad.
• Requer o Ultimate Keyboards em um Mac com Apple Silicon (M1 ou superior) e macOS 13 ou posterior (https://hyly.world/pt/keyboards/). O remapeamento no MacBook e o editor ZMK/QMK são gratuitos no Mac; digitar no iPhone e no iPad requer o Ultimate Keyboards Pro no Mac (US$ 24 em compra única, US$ 19 no lançamento — sem assinatura).
```
2058 / 4000 characters

### Keywords — `pt-BR` e `pt-PT` (sem espaços, sem acentos/cedilha para economizar bytes UTF-8, ≤ 100 bytes)
```text
macbook,remapear,digitar,celular,ipad,camadas,atalhos,acentos,cedilha,teclado,sem,fio,split
```
91 / 100 bytes

### Keywords secundárias `en-GB` (indexadas pela App Store tanto no Brasil `BRA` quanto em Portugal `PRT`, ≤ 100 bytes)
```text
home,row,mods,layers,combos,zmk,qmk,corne,karabiner,kanata,keymap,wireless,keyboard,ergonomic
```
93 / 100 bytes

## Adaptações obrigatórias para `pt-PT` (Portugal — Google Play e App Store)
- **Google Play `pt-PT` Short description (75 / 80 caracteres):**
  `App para escrever no telemóvel com o teclado do MacBook, camadas e atalhos.`
- **App Store `pt-PT` Keywords (94 / 100 bytes):**
  `macbook,remapear,escrever,telemovel,ipad,camadas,atalhos,acentos,cedilha,teclado,sem,fio,split`
- No corpo da descrição `pt-PT`, substituir `celular` por `telemóvel`, `tela` por `ecrã`, `mouse` por `rato`, `parear` por `emparelhar` e `Ajustes` por `Definições`.
