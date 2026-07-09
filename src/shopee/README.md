# shopee/

**Responsabilidade:** regra de negócio **específica da Shopee** — a parte que
sabe como o site da Shopee funciona por dentro.

Isso inclui, quando for implementado:
- Seletores de DOM (ex: onde fica o botão de responder avaliação).
- Parsers de dados da página (extrair nome do produto, nota da avaliação, etc.).
- Fluxos de automação (ex: "abrir avaliação → preencher resposta → confirmar").

**O que NÃO fica aqui:** mecanismo de injeção de script ou comunicação com o
background — isso é responsabilidade de `../content/`.

Essa pasta tende a mudar com mais frequência que qualquer outra do projeto,
já que depende do layout da Shopee, que a própria Shopee pode alterar sem
aviso. Mantê-la isolada facilita localizar e corrigir rapidamente quando isso
acontecer.

> `automation.js` já existe como ponto de entrada (`executarAutomacao()`),
> mas ainda não faz nenhuma automação real — só valida parâmetros e loga.
>
> `pageDetector.js` já existe e decide se uma URL é do Seller Center da
> Shopee (`isSellerCenterUrl()`), usado pelo popup para avisar o usuário
> quando a aba ativa não é a certa. Ainda não lê nada do DOM da página —
> só compara o host da URL.
>
> `selectors.js` já existe e decide o que conta como "botão Responder"
> na página (`encontrarBotoesResponder()`) — usado pelo content script
> para destacar visualmente e para clicar. É uma heurística por texto
> exato; **confirmado por inspeção real** que o Seller Center usa
> `<span>Responder</span>` sem nenhuma tag semanticamente clicável
> envolvendo, por isso o seletor inclui `span`/`div` (com deduplicação
> de aninhados, mantendo sempre o elemento mais interno). Também expõe
> `encontrarTextareaResposta()` (`textarea[name="comment"]`, com
> fallback por `placeholder`) e `encontrarBotaoEnviar()`
> (`button[data-testid="reply-submit-button"]`, com fallback por texto
> exato "Enviar") — ambos ainda não validados numa conta real.
>
> `executionStateMachine.js` já existe: máquina de estados formal
> (`IDLE` / `SCANNING` / `RUNNING` / `STOPPING`) usada pelo
> `content/responderFlow.js`. Só permite transições explicitamente
> listadas — qualquer outra é rejeitada e logada como erro, nunca
> aplicada silenciosamente. O estado vive em `globalThis` (não numa
> variável local) de propósito: isso é o que permite recusar uma nova
> execução de "Executar" enquanto a anterior ainda não voltou a `IDLE`.
>
> `automation.js` (validação de quantidade/mensagem) continua em uso
> pelo `background.js` antes de injetar `content/responderFlow.js` — o
> fluxo de resposta em si (abrir → escrever → enviar → repetir) já
> está implementado em `content/responderFlow.js`, usando os
> seletores acima.
>
> Próximo passo natural aqui: parsers de dados da avaliação (nome do
> comprador, produto, nota) para personalizar a resposta ou gerar
> relatórios — ainda não implementado.
