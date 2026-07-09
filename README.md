# Shopee Seller Assistant — Extensão Chrome

Extensão (Manifest V3) que futuramente compõe um SaaS para vendedores da
Shopee. A extensão **não** faz cadastro/login/cobrança — isso é
responsabilidade do site. A extensão detecta a sessão criada no site e
executa a automação na Shopee.

## Arquitetura

```
shopee-extension/
├── manifest.json          # obrigatório na raiz (exigência do Chrome)
├── README.md
├── assets/
│   └── icons/              # ativos estáticos
└── src/
    ├── core/                # configuração central (URLs, chaves de storage)
    ├── utils/               # funções genéricas e puras (ex: logger)
    ├── storage/              # wrapper sobre chrome.storage.local
    ├── services/              # comunicação HTTP crua com o backend
    ├── auth/                 # regra de negócio de sessão/autorização
    ├── background/             # service worker (orquestração central)
    ├── content/               # [futuro] mecanismo de content scripts
    ├── shopee/                # [futuro] regra de negócio da automação Shopee
    └── ui/
        └── popup/               # interface do popup (html/css/js)
```

## Regra de dependência entre camadas

Cada camada só pode depender das que estão "abaixo" dela nesta lista —
nunca o contrário:

1. `core/` — não depende de nada.
2. `utils/` — não depende de nada.
3. `storage/` — depende só da API do Chrome.
4. `services/` — depende de `core/`.
5. `auth/` — depende de `core/`, `services/`, `storage/`, `utils/`.
6. `shopee/` *(futuro)* — depende de `core/`, `utils/`.
7. `content/` *(futuro)* — depende de `core/`, `utils/`, `shopee/`.
8. `background/` — depende de todas as anteriores (é quem orquestra).
9. `ui/` — depende de `core/`, `utils/`, `storage/`, `auth/`, e conversa com
   `background/` só por mensagens (`chrome.runtime.sendMessage`), nunca
   chamando `auth/` ou `services/` diretamente para ações que o background
   deve centralizar.

Essa hierarquia existe para que uma mudança em uma camada de baixo nível
(ex: trocar `chrome.storage.local` por outra forma de persistência) não
exija tocar em `ui/` ou `background/`.

## Convenções usadas nesta etapa

- Sem framework/bundler: os módulos se comunicam via `globalThis` (ex:
  `globalThis.CONFIG`, `globalThis.SessionModule`) e são carregados via
  `<script>` (no popup) ou `importScripts()` (no service worker). Quando o
  projeto crescer o suficiente, migrar para ES Modules + um bundler (Vite/
  esbuild) é o próximo passo natural — a separação em pastas já facilita
  essa migração futura.
- Todo texto de log usa `Logger.createLogger("NomeDoModulo")` para manter
  o padrão `[NomeDoModulo] mensagem`.
- Nenhum arquivo de UI/background acessa `chrome.storage` diretamente —
  sempre passa por `storage/storage.js`.

## Testando a integração site ↔ extensão (sem backend)

Nesta etapa, o site "avisa" a extensão de um login fictício usando
`chrome.runtime.sendMessage` (API `externally_connectable`). Isso só
funciona com o site servido por `http://`/`https://` — **não funciona**
abrindo o `index.html` direto no navegador (`file://`).

1. **Carregue a extensão** em `chrome://extensions` (modo desenvolvedor →
   "Carregar sem compactação" → pasta `shopee-extension`). Copie o **ID**
   gerado para a extensão (aparece no card dela).
2. **Cole esse ID** em `shopee-saas-site/index.html`, na constante
   `EXTENSION_ID` (topo do `<script>`).
3. **Suba o site localmente** — veja `shopee-saas-site/README.md`
   (resumo: dê duplo clique em `iniciar-site.bat`, ou rode
   `python3 -m http.server 5500` dentro da pasta do site). Acesse
   `http://localhost:5500/index.html` no Chrome.
4. **Abra o popup da extensão.** Sem sessão simulada, ele mostra o botão
   "Abrir login no site" — clique nele (a abertura é sempre manual, por
   causa de uma limitação do Chrome: um popup de extensão fecha sozinho
   se uma nova aba abrir automaticamente e roubar o foco).
5. **Clique em "Entrar"** no site (qualquer e-mail/senha). Isso gera o
   token fictício e avisa a extensão em segundo plano.
6. **Abra o popup de novo** — agora ele deve mostrar o painel normalmente.

> Usando outra porta? Atualize `CONFIG.LOGIN_URL`/`SITE_BASE_URL` em
> `src/core/config.js` e o padrão de porta em `manifest.json` →
> `externally_connectable.matches` (já aceita qualquer porta em
> `localhost`/`127.0.0.1`).

## Diagnosticando "logei no site mas a extensão não percebeu"

Abra **dois** consoles ao mesmo tempo:

1. **Console da aba do site** (F12 na aba `localhost:5500`). Depois de
   clicar em "Entrar", procure por uma destas linhas:
   - `[Site] Extensão não conectada...` → o `EXTENSION_ID` no `index.html`
     está errado, vazio, ou ainda é o placeholder `COLE_AQUI...`. Corrija
     e dê um refresh (Ctrl+F5) na aba — **não precisa reiniciar o
     servidor**, só recarregar a página.
   - `[Site] Extensão não respondeu: ...` → o ID está preenchido mas não
     corresponde a nenhuma extensão carregada agora (ela pode ter mudado
     de ID se você removeu e recarregou a extensão do zero). Copie o ID
     de novo em `chrome://extensions`.
   - Nenhuma das duas, e apareceu o toast "Extensão sincronizada com esta
     sessão" → a mensagem chegou. Se mesmo assim o popup não mostrar o
     painel, feche e abra o popup de novo (ele só lê o estado ao abrir).

2. **Console do service worker da extensão** (`chrome://extensions` →
   card da extensão → "Inspecionar visualizações: service worker").
   Depois do clique em "Entrar" no site, deve aparecer:
   ```
   [Background] Mensagem externa recebida (FAKE_LOGIN) de http://localhost:5500
   [SessionModule] Sessão fictícia ativada a partir do site (sem backend real).
   ```
   Se nada aparecer aqui, a mensagem não chegou — volte pro item 1.

> ⚠️ O botão "Recarregar sessão" no popup **não** consulta nenhum
> backend nesta etapa — ele só relê o que já está salvo localmente. Não
> existe risco de ele "apagar" uma sessão fictícia válida.

## Testando o fluxo de resposta

⚠️ **O truque de colar arquivos direto no console (usado nas etapas
anteriores) não funciona mais para o fluxo completo.** Desde que
`responderFlow.js` passou a usar `chrome.storage` (para receber
quantidade/mensagem) e `chrome.runtime.onMessage` (para o cancelamento
via "Parar"), ele depende de APIs que só existem de verdade dentro do
contexto de uma extensão real — colar o código no console de uma
página qualquer roda no "mundo principal" da página, sem acesso a
`chrome.*`.

**O que ainda pode ser testado isoladamente, sem a extensão:**
- `utils/domEvents.js` (`definirValorReact`, `criarEsperaPorCondicao`)
  e a lógica de `shopee/selectors.js` são testáveis com Node + mocks
  simples de DOM (sem depender de `chrome.*`) — é assim que validei a
  lógica ao implementar (setter nativo do React sendo chamado
  corretamente, eventos `input`/`change` disparados, cancelamento
  imediato, timeout de segurança).

**Para testar o fluxo completo de verdade:**
1. Carregue a extensão em `chrome://extensions` (recarregue se já
   estava carregada, para pegar os arquivos novos).
2. Faça login (fluxo fictício via site) para liberar "Executar".
3. Abra uma aba do Seller Center com avaliações pendentes, preencha
   "Quantidade de avaliações" e "Mensagem de resposta" no popup.
4. Abra o console da aba (F12) e clique em "Executar".
5. Acompanhe os logs: `[SCAN]` → `[RUN] Abrindo resposta...` →
   `[TYPE] Resposta escrita.` → `[SEND] Enviando...` →
   `[SEND] Resposta enviada.` → `[RUN] 1/N concluídas.` (repete até N).

⚠️ **Seletores do textarea/botão Enviar ainda não foram validados
numa conta real** (`textarea[name="comment"]`, fallback por
`placeholder`; `button[data-testid="reply-submit-button"]`, fallback
por texto "Enviar"). Se o fluxo parar em "Textarea de resposta não
apareceu a tempo" ou "Botão Enviar não encontrado", inspecione o
elemento real (botão direito → Inspecionar) e me mande o HTML, do
mesmo jeito que fizemos para o botão "Responder" — ajusto só
`shopee/selectors.js`, nada mais precisa mudar.

Numa aba real do Seller Center, o fluxo esperado é: abrir a página →
nada acontece (sem destaque, sem log) → abrir o popup → clicar em
"Executar" → **só então** o laço começa.

## Status atual

- ✅ Estrutura de pastas escalável definida.
- ✅ Site MVP (`shopee-saas-site/`) simulando login → token → painel → tutorial.
- ✅ Extensão detecta sessão fictícia via mensagem do site (`FAKE_LOGIN`),
  sem nenhum backend real ainda.
- ✅ Popup mostra botão para abrir o login do site quando não há sessão
  simulada, e mostra o painel normalmente quando há.
- ✅ "Executar" já passa pela arquitetura completa: popup → background
  (`RUN_AUTOMATION`) → valida parâmetros (`shopee/automation.js`) → injeta
  os scripts de leitura na aba ativa via `chrome.scripting.executeScript`.
  Nenhuma automação real de resposta ainda — só leitura/destaque/clique.
- ✅ Detecção automática de página: popup pergunta ao background
  (`CHECK_CURRENT_PAGE`) se a aba ativa é o Seller Center da Shopee
  (`shopee/pageDetector.js`) e desabilita "Executar" + mostra aviso
  quando não é. Nenhuma leitura do DOM da página ainda — só a URL.
- ✅ **Fluxo completo de resposta a avaliações, sob demanda**: ao
  clicar em "Executar", o background grava quantidade/mensagem no
  storage e injeta `content/responderFlow.js` na aba ativa, que — para
  cada avaliação, até a quantidade configurada — busca um botão
  "Responder" visível **ainda não processado** (`WeakSet`, corrige o
  bug de loop infinito: a Shopee não remove o botão do DOM depois de
  respondido), destaca **só ele**, clica, aguarda o textarea aparecer
  (sem timeout fixo), escreve a mensagem (setter nativo do React +
  input/change), confirma a inserção, encontra e clica em "Enviar",
  aguarda a conclusão (sem delay fixo), marca o botão/card como
  processado, atualiza o contador, e repete. Quando não sobra nenhum
  candidato visível, rola a página suavemente e tenta de novo (sem
  delay fixo); ao chegar ao fim real da página sem achar nada novo,
  encerra normalmente. Antes do clique em "Executar", a extensão não
  toca em nada na página — sem `content_scripts` automático, sem
  atributos permanentes no DOM, só classes temporárias e referências
  em memória.
- ✅ Máquina de estados formal (`IDLE` / `SCANNING` / `RUNNING` /
  `STOPPING`) em `shopee/executionStateMachine.js`: só permite
  transições explicitamente listadas, loga toda mudança no console, e
  recusa uma nova execução de "Executar" se a anterior ainda não voltou
  a `IDLE` — nunca dois estados ativos ao mesmo tempo.
- ✅ Botão "Parar": cancela a execução em andamento a qualquer momento
  (popup → background → `chrome.tabs.sendMessage` → content script),
  em qualquer ponto — busca, scroll, escrita, envio ou espera.
  Interrompe qualquer espera pendente, remove qualquer destaque da
  página, e volta ao estado inicial (`IDLE`). Funciona mesmo se nada
  estiver em execução (só informa "Nada em execução.").
- ✅ Logs de execução limpos (`utils/flowLogger.js`): `[SCAN]`, `[RUN]`,
  `[TYPE]`, `[SEND]`, `[STOP]` — sem repetição a cada volta do laço.
- ⏳ `shopee/` — faltam parsers de dados da avaliação (nome do
  comprador, produto, nota) para uso futuro (ex: personalizar a
  resposta, relatórios).
- ⏳ Seletores do textarea/botão Enviar (`shopee/selectors.js`) ainda
  não foram validados numa conta real — foram implementados a partir
  da marcação fornecida, mas merecem um teste ponta a ponta assim que
  possível.
- ⏳ `services/sessionApi.js` / `checkSessionWithBackend()` — já
  implementados, mas só entram em uso quando o backend real existir.

🤖 Utilização de Inteligência Artificial

Durante o desenvolvimento deste projeto foram utilizadas ferramentas de Inteligência Artificial como apoio ao processo de desenvolvimento.

A IA foi empregada principalmente para:

- acelerar tarefas repetitivas;
- auxiliar na implementação de trechos específicos do código;
 esclarecer dúvidas técnicas;
- otimizar a documentação e organização do projeto.

Toda a concepção da ideia, arquitetura, definição dos requisitos, fluxo da aplicação, validação das funcionalidades, testes e tomadas de decisão foram realizadas pelo autor.

A Inteligência Artificial foi utilizada como uma ferramenta de apoio ao desenvolvimento, da mesma forma que documentação oficial, fóruns técnicos e mecanismos de pesquisa são utilizados no dia a dia de um desenvolvedor.

Se você chegou até esta seção... parabéns. Você realmente leu o README inteiro. 😄

---

# 🗺️ Roadmap

## ✅ V1 — MVP (Atual)

- [x] Estrutura base da extensão
- [x] Sistema de autenticação local
- [x] Popup funcional
- [x] Fluxo completo de automação
- [x] Console detalhado para depuração
- [x] Sistema de cancelamento da execução
- [x] Arquitetura modular e escalável
- [x] Documentação completa

---

## 🚧 V2 — Próximas Atualizações

- [ ] Dashboard Web completo
- [ ] Sistema de autenticação online
- [ ] Gerenciamento de licenças
- [ ] Histórico de execuções
- [ ] Sistema de configurações
- [ ] Melhorias na interface
- [ ] Atualizações automáticas da extensão

---

## 🔐 Segurança (Pesquisa & Desenvolvimento)

Este projeto também será utilizado como ambiente de estudo para novas
tecnologias de autenticação e proteção de sistemas.

Funcionalidades em estudo:

- [ ] Implementação de autenticação via WebAuthn (Passkeys)
- [ ] Pesquisa e desenvolvimento de uma chave física própria para autenticação administrativa
- [ ] Estudo sobre Secure Elements (Hardware Security)
- [ ] Proteção do painel administrativo utilizando múltiplos fatores de autenticação (Senha + 2FA + Chave Física)
- [ ] Pesquisa sobre autenticação baseada em hardware para projetos futuros

> **Observação:** essas funcionalidades fazem parte dos estudos do projeto e
> serão implementadas apenas quando houver necessidade real e viabilidade
> técnica.
