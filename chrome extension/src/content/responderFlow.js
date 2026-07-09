/**
 * content/responderFlow.js
 * ---------------------------------------------------------
 * Camada: CONTENT (mecanismo de content script)
 * Depende de: utils/logger.js, utils/flowLogger.js, utils/domEvents.js,
 *             core/config.js, storage/storage.js, shopee/selectors.js,
 *             shopee/executionStateMachine.js
 * Injetado SOB DEMANDA pelo background.js (RUN_AUTOMATION) — nunca
 * automaticamente. Só roda quando o usuário clica em "Executar".
 *
 * Fluxo completo, por avaliação, repetido até a quantidade configurada:
 *   1. Procura um botão "Responder" visível que ainda NÃO foi
 *      processado (ver WeakSet `processados` abaixo). Se não achar
 *      nenhum, rola a página suavemente e tenta de novo — sem
 *      timeout fixo, só até aparecer algo novo ou chegar ao fim real
 *      da página (nesse caso, encerra normalmente).
 *   2. Clica para abrir a caixa de resposta.
 *   3. Aguarda o textarea da resposta aparecer (sem timeout fixo —
 *      observa o DOM até existir).
 *   4. Escreve a mensagem usando o setter nativo do React, dispara
 *      input/change, e confirma que o texto foi mesmo inserido.
 *   5. Encontra o botão "Enviar" e clica.
 *   6. Aguarda a conclusão (sem delay fixo — espera o textarea sumir).
 *   7. Marca o botão (e um ancestral "card") como processado — nunca
 *      mais reutilizado em buscas futuras, mesmo que continue existindo
 *      no DOM (é exatamente isso que causava o loop infinito antes
 *      desta correção: a Shopee não remove o botão depois de
 *      respondido, só para de fazer nada quando clicado de novo).
 *   8. Atualiza o contador e repete até `quantidade`.
 *
 * DEDUPLICAÇÃO (WeakSet, sem tocar no DOM): `processados` guarda
 * referências em memória — nunca um atributo/classe permanente no
 * HTML. Guardamos tanto o botão quanto um ancestral próximo (o
 * "card") como camada extra de segurança, caso a Shopee troque o nó
 * do botão em algum re-render mas mantenha o card.
 *
 * Estados (shopee/executionStateMachine.js): SCANNING enquanto conta
 * quantos existem no início; RUNNING durante o processamento de cada
 * avaliação (abrir → esperar → escrever → enviar → aguardar); STOPPING
 * quando "Parar" é acionado; sempre volta a IDLE ao final.
 *
 * CANCELAMENTO ("Parar"): um listener de chrome.runtime.onMessage para
 * "STOP_AUTOMATION" é registrado antes do laço começar e continua vivo
 * durante toda a execução (o mundo isolado da aba persiste entre
 * injeções). Cancela a espera pendente (busca/scroll/textarea/
 * conclusão), remove qualquer destaque, e interrompe o laço
 * imediatamente — em qualquer um desses pontos, não só ao clicar.
 * ---------------------------------------------------------
 */

(function () {
  const logger = Logger.createLogger("Content");
  const { ESTADOS, transicionarPara, obterEstadoAtual, estaOcioso } = ExecutionStateMachine;

  const HIGHLIGHT_CLASS = "ssa-highlight-responder";

  // Tempo mínimo que o destaque fica visível antes do clique — só
  // para o usuário conseguir PERCEBER qual botão está sendo usado.
  const DURACAO_DESTAQUE_MS = 350;

  function garantirEstiloDestaque() {
    if (document.getElementById("ssa-highlight-style")) return;

    const style = document.createElement("style");
    style.id = "ssa-highlight-style";
    style.textContent = `
      .${HIGHLIGHT_CLASS} {
        outline: 3px solid #ee4d2d !important;
        outline-offset: 2px !important;
        background-color: rgba(238, 77, 45, 0.10) !important;
        border-radius: 4px !important;
      }
    `;
    document.head.appendChild(style);
  }

  function destacar(elemento) {
    elemento.classList.add(HIGHLIGHT_CLASS);
  }

  function removerTodosOsDestaques() {
    document.querySelectorAll(`.${HIGHLIGHT_CLASS}`).forEach((el) => {
      el.classList.remove(HIGHLIGHT_CLASS);
    });
  }

  /**
   * Sobe alguns níveis a partir do botão para obter um ancestral que
   * represente "o card da avaliação" — usado como segunda camada de
   * marcação (além do próprio botão) em `processados`. Não depende de
   * nenhuma classe/atributo específico da Shopee, só da estrutura do
   * DOM em torno do botão.
   *
   * @param {Element} elemento
   * @param {number} [niveis]
   * @returns {Element|null}
   */
  function obterCardAncestral(elemento, niveis = 4) {
    let atual = elemento;
    for (let i = 0; i < niveis && atual?.parentElement; i++) {
      atual = atual.parentElement;
    }
    return atual !== elemento ? atual : null;
  }

  /**
   * Filtra os botões "Responder" visíveis, removendo qualquer um que
   * já tenha sido processado nesta execução (pelo próprio botão OU
   * pelo card ancestral) — é isso que impede o loop infinito: mesmo
   * que o botão continue existindo no DOM depois de respondido, ele
   * nunca mais é escolhido como alvo.
   *
   * @param {WeakSet} processados
   * @returns {Element[]}
   */
  function obterCandidatosNaoProcessados(processados) {
    return ShopeeSelectors.encontrarBotoesResponder(document).filter((botao) => {
      if (processados.has(botao)) return false;
      const card = obterCardAncestral(botao);
      if (card && processados.has(card)) return false;
      return true;
    });
  }

  function esperar(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Lê quantidade/mensagem gravados pelo background para ESTA
   * execução (ver background.js → RUN_AUTOMATION).
   */
  async function obterParametrosDaExecucao() {
    const params = await StorageModule.getItem(CONFIG.STORAGE_KEYS.RUN_PARAMS);
    return {
      quantidade: Number(params?.quantidade) || 0,
      mensagem: (params?.mensagem || "").toString(),
    };
  }

  async function executarFluxo() {
    if (!estaOcioso()) {
      logger.warn(
        `Já existe uma execução em andamento (estado atual: ${obterEstadoAtual()}). Ignorando novo pedido de "Executar".`
      );
      return { ok: false, message: "Já existe uma execução em andamento." };
    }

    const { quantidade, mensagem } = await obterParametrosDaExecucao();

    if (!quantidade || quantidade <= 0) {
      return { ok: false, message: "Quantidade de avaliações inválida." };
    }
    if (!mensagem.trim()) {
      return { ok: false, message: "Mensagem de resposta vazia." };
    }

    transicionarPara(ESTADOS.SCANNING);

    let cancelado = false;
    let cancelarEsperaAtual = null;
    let contador = 0;
    const processados = new WeakSet();

    /**
     * Busca a próxima avaliação elegível quando não sobra nenhum
     * candidato visível: rola a página suavemente e espera (sem
     * delay fixo) até aparecer algo novo, ou até constatar que já
     * está no fim real da página (nesse caso, encerra normalmente).
     *
     * @returns {Promise<boolean>} true se encontrou um novo candidato
     */
    async function buscarProximaAvaliacaoComScroll() {
      const MAX_TENTATIVAS = 20; // teto de segurança, não um delay
      for (let tentativa = 0; tentativa < MAX_TENTATIVAS; tentativa++) {
        if (cancelado) return false;

        const jaEstavaNoFimAntesDeRolar = DomEvents.estaNoFimDaPagina();
        DomEvents.rolarSuavemente(Math.round(window.innerHeight * 0.8));

        const espera = DomEvents.criarEsperaPorCondicao(
          () => obterCandidatosNaoProcessados(processados).length > 0,
          { timeoutMs: 4000 }
        );
        cancelarEsperaAtual = espera.cancelar;
        const resultado = await espera.promise;
        cancelarEsperaAtual = null;

        if (cancelado || resultado === "cancelado") return false;
        if (resultado) return true;

        if (jaEstavaNoFimAntesDeRolar) {
          // Já estava no fim da página antes de rolar, e mesmo assim
          // nada novo apareceu — não há mais o que buscar.
          return false;
        }
        // Ainda não estava no fim: tenta rolar mais uma vez.
      }
      return false;
    }

    /**
     * Handler de "Parar": cancela a espera pendente, remove destaques,
     * e interrompe o laço no próximo ponto de checagem.
     */
    function handleMensagem(mensagemRecebida, _sender, sendResponse) {
      if (mensagemRecebida?.type !== "STOP_AUTOMATION") return false;

      transicionarPara(ESTADOS.STOPPING);

      cancelado = true;

      if (cancelarEsperaAtual) {
        cancelarEsperaAtual();
        cancelarEsperaAtual = null;
      }

      removerTodosOsDestaques();

      FlowLogger.stop("Processo interrompido");

      transicionarPara(ESTADOS.IDLE);

      sendResponse({ ok: true, message: `Execução interrompida (${contador}/${quantidade} concluídas).` });
      return false;
    }

    chrome.runtime.onMessage.addListener(handleMensagem);

    try {
      // Varredura inicial — loga uma única vez quantos existem agora
      // (evita logar isso de novo a cada volta do laço).
      const totalInicial = ShopeeSelectors.encontrarBotoesResponder(document, { apenasVisiveis: false }).length;
      FlowLogger.scan(`Botões encontrados: ${totalInicial}`);

      if (totalInicial === 0) {
        transicionarPara(ESTADOS.IDLE);
        return { ok: false, message: 'Nenhum botão "Responder" encontrado na página.' };
      }

      while (contador < quantidade && !cancelado) {
        // Releitura silenciosa (sem log) a cada volta — só o necessário
        // para achar o próximo alvo elegível (ainda não processado),
        // sem repetir a narrativa de varredura.
        let candidatos = obterCandidatosNaoProcessados(processados);

        if (candidatos.length === 0) {
          const encontrouNovo = await buscarProximaAvaliacaoComScroll();
          if (cancelado) break;

          if (!encontrouNovo) {
            logger.log("Fim da página alcançado sem novas avaliações elegíveis — encerrando normalmente.");
            break;
          }

          candidatos = obterCandidatosNaoProcessados(processados);
          if (candidatos.length === 0) break; // segurança extra, não deveria acontecer
        }

        const botaoResponder = candidatos[0];

        transicionarPara(ESTADOS.RUNNING);

        // ----- 2. Abrir a resposta -----
        garantirEstiloDestaque();
        destacar(botaoResponder);
        FlowLogger.run("Abrindo resposta...");

        await esperar(DURACAO_DESTAQUE_MS);
        if (cancelado) break;

        DomEvents.simularCliqueReal(botaoResponder);
        removerTodosOsDestaques();

        if (cancelado) break;

        // ----- 3. Aguardar o textarea aparecer (sem timeout fixo) -----
        const esperaTextarea = DomEvents.criarEsperaPorCondicao(() => ShopeeSelectors.encontrarTextareaResposta());
        cancelarEsperaAtual = esperaTextarea.cancelar;
        const textarea = await esperaTextarea.promise;
        cancelarEsperaAtual = null;

        if (cancelado) break;

        if (!textarea || textarea === "cancelado") {
          logger.error("Textarea de resposta não apareceu a tempo — abortando esta avaliação.");
          break;
        }

        // ----- 4. Escrever a resposta -----
        DomEvents.definirValorReact(textarea, ""); // limpa qualquer conteúdo existente
        DomEvents.definirValorReact(textarea, mensagem); // escreve a mensagem configurada

        const textoRealmenteInserido = textarea.value === mensagem;
        if (!textoRealmenteInserido) {
          logger.error("A mensagem não foi inserida corretamente no textarea — abortando esta avaliação.");
          break;
        }
        FlowLogger.type("Resposta escrita.");

        if (cancelado) break;

        // ----- 5. Encontrar e clicar em "Enviar" -----
        const botaoEnviar = ShopeeSelectors.encontrarBotaoEnviar();
        if (!botaoEnviar) {
          logger.error('Botão "Enviar" não encontrado — abortando esta avaliação.');
          break;
        }

        FlowLogger.send("Enviando...");
        DomEvents.simularCliqueReal(botaoEnviar);

        // ----- 6. Aguardar conclusão (sem delay fixo) -----
        // Consideramos concluído quando o textarea de resposta some da
        // página — sinal mais confiável que temos sem conhecer algum
        // indicador específico de "envio concluído" da Shopee.
        const esperaConclusao = DomEvents.criarEsperaPorCondicao(() => !ShopeeSelectors.encontrarTextareaResposta());
        cancelarEsperaAtual = esperaConclusao.cancelar;
        await esperaConclusao.promise;
        cancelarEsperaAtual = null;

        if (cancelado) break;

        FlowLogger.send("Resposta enviada.");

        // ----- 7. Marcar como processado (nunca mais reutilizado) -----
        processados.add(botaoResponder);
        const card = obterCardAncestral(botaoResponder);
        if (card) processados.add(card);

        // ----- 8. Atualizar contador e repetir -----
        contador += 1;
        FlowLogger.run(`${contador}/${quantidade} concluídas.`);
      }

      if (!cancelado) {
        transicionarPara(ESTADOS.IDLE);
      }
      // Se cancelado, o handler de STOP_AUTOMATION já levou o estado a IDLE.

      return {
        ok: true,
        message: cancelado
          ? `Execução interrompida (${contador}/${quantidade} concluídas).`
          : `${contador}/${quantidade} avaliação(ões) concluída(s).`,
      };
    } finally {
      // Sempre remove o listener desta execução ao terminar (sucesso,
      // erro ou cancelamento) — não deixa listeners acumulando.
      chrome.runtime.onMessage.removeListener(handleMensagem);
    }
  }

  executarFluxo();
})();
