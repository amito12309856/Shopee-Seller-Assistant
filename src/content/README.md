# content/

**Responsabilidade:** mecanismo genérico de *content scripts* — o código que
roda dentro do contexto da página da Shopee (não do popup, não do background).

Isso inclui, quando for implementado:
- Registro/injeção dos content scripts nas páginas certas.
- Ponte de mensagens entre a página e o `background/` (`chrome.runtime.sendMessage`
  / `chrome.tabs.sendMessage`).
- Ciclo de vida do script na página (quando injetar, quando remover observers, etc.).

**O que NÃO fica aqui:** seletores de DOM específicos da Shopee, regras de
"como responder uma avaliação", ou qualquer lógica que muda quando a Shopee
atualiza o layout do site — isso é responsabilidade de `../shopee/`.

Essa separação existe para que uma mudança no HTML da Shopee não obrigue a
mexer na infraestrutura de comunicação, e vice-versa.

> `responderFlow.js` já existe: é o fluxo completo acionado por
> "Executar". Para cada avaliação (até a quantidade configurada):
> encontra o botão "Responder" visível e destaca **só ele**, clica,
> aguarda o textarea aparecer (sem timeout fixo — observa o DOM),
> escreve a mensagem usando o setter nativo do React, confirma que o
> texto foi inserido, encontra e clica no botão "Enviar", aguarda a
> conclusão (o textarea sumir — de novo, sem delay fixo), atualiza o
> contador, e repete. Nunca existe mais de um botão destacado ao mesmo
> tempo, e nenhum atributo é gravado no HTML — só classes temporárias
> e variáveis em memória.
>
> **Cancelamento ("Parar"):** este arquivo registra um listener de
> `chrome.runtime.onMessage` para `STOP_AUTOMATION` antes de o laço
> começar, e ele continua vivo durante toda a execução. Se "Parar"
> chegar a qualquer momento — inclusive no meio de uma espera pelo
> textarea ou pela conclusão do envio — a execução corrente cancela a
> espera pendente, remove qualquer destaque, e interrompe o laço
> imediatamente. O listener é removido ao final (sucesso, erro ou
> cancelamento), então não acumula a cada clique em "Executar".
>
> **Logs**, via `utils/flowLogger.js`: `[SCAN]` (quantos encontrados,
> uma vez só), `[RUN]` (abrindo / contador de progresso), `[TYPE]`
> (mensagem escrita), `[SEND]` (enviando / enviada), `[STOP]`
> (interrompido). Nada de log repetitivo a cada volta do laço.
>
> ⚠️ **Nada disso roda automaticamente.** Não há `content_scripts`
> declarado no manifest — o `background/background.js` injeta este
> arquivo na aba ativa via `chrome.scripting.executeScript`, e só faz
> isso quando recebe "RUN_AUTOMATION" (clique em "Executar" no popup).
> Até esse clique, a extensão não toca em nada na página.
