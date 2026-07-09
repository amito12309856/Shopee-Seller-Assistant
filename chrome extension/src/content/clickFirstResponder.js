/**
 * content/clickFirstResponder.js
 * ---------------------------------------------------------
 * Camada: CONTENT (mecanismo de content script)
 * Depende de: utils/logger.js, utils/domEvents.js, shopee/selectors.js
 * Injetado automaticamente pelo manifest.json (content_scripts)
 * nas páginas do Seller Center da Shopee.
 *
 * ESCOPO DESTA ETAPA, DE PROPÓSITO BEM LIMITADO:
 *   Clicar no PRIMEIRO botão "Responder" encontrado na página.
 *   Só isso. Nenhuma outra ação.
 *
 * NÃO faz (ainda, de propósito):
 *  - Não clica em mais de um botão.
 *  - Não preenche nenhum campo de resposta.
 *  - Não envia/confirma nada.
 *  - Não avisa o background nem o popup do resultado.
 *  - Não usa quantidade/mensagem configurados no popup — esta ação é
 *    independente do fluxo "Executar" (RUN_AUTOMATION); é um
 *    experimento isolado, não a automação completa.
 * ---------------------------------------------------------
 */

(function () {
  const logger = Logger.createLogger("Content");

  let jaClicou = false;
  let jaLogouAusencia = false;
  let observer;

  function pararDeObservar() {
    if (observer) observer.disconnect();
  }

  /**
   * Pega um pedaço de texto de um ancestral próximo do botão, só
   * para o log — ajuda a identificar visualmente QUAL avaliação foi
   * clicada (ex: nome do comprador, produto), sem depender de
   * nenhuma estrutura específica da página.
   *
   * @param {Element} elemento
   * @returns {string}
   */
  function contextoParaLog(elemento) {
    let atual = elemento;
    for (let nivel = 0; nivel < 5 && atual; nivel++) {
      const texto = (atual.textContent || "").trim().replace(/\s+/g, " ");
      if (texto.length > 15) {
        return texto.slice(0, 80) + (texto.length > 80 ? "..." : "");
      }
      atual = atual.parentElement;
    }
    return "(sem contexto identificável)";
  }

  /**
   * Tenta clicar no primeiro botão "Responder" encontrado. Só
   * executa uma vez de verdade — chamadas seguintes (inclusive as
   * disparadas pelo MutationObserver) são ignoradas depois do
   * primeiro clique bem-sucedido.
   */
  function clicarPrimeiroResponder() {
    if (jaClicou) return;

    // apenasVisiveis (padrão true): só considera botões que estão
    // de fato na tela agora — a lista de avaliações é virtualizada
    // (existem mais no DOM do que o usuário vê), então "o primeiro
    // do DOM" pode não ser nada que o usuário consiga ver.
    const botoes = ShopeeSelectors.encontrarBotoesResponder(document);
    if (botoes.length === 0) {
      // Ainda não apareceu na página (SPA carregando) — o
      // MutationObserver abaixo vai tentar de novo quando o DOM mudar.
      // Loga só uma vez para não gerar ruído a cada mutação do DOM.
      if (!jaLogouAusencia) {
        logger.log('Ainda nenhum botão "Responder" visível na tela — aguardando o conteúdo carregar.');
        jaLogouAusencia = true;
      }
      return;
    }

    const primeiro = botoes[0];
    jaClicou = true;

    const diagnostico = DomEvents.verificarSobreposicao(primeiro);
    if (!diagnostico.ok) {
      logger.warn(
        'Aviso: outro elemento parece estar sobreposto ao "Responder" nas coordenadas do clique — ' +
          "isso pode ser a causa de o clique não abrir a caixa de resposta.",
        diagnostico.elementoNoTopo
      );
    }

    logger.log(
      `Clicando no primeiro botão "Responder" visível (de ${botoes.length} visível(is) agora). ` +
        `Contexto: "${contextoParaLog(primeiro)}". Nenhuma outra ação será executada.`
    );
    DomEvents.simularCliqueReal(primeiro);
    logger.log("Clique realizado.");

    pararDeObservar();
  }

  observer = new MutationObserver(clicarPrimeiroResponder);

  clicarPrimeiroResponder();

  if (!jaClicou) {
    observer.observe(document.body, { childList: true, subtree: true });
  }
})();
