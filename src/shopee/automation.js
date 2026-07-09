/**
 * shopee/automation.js
 * ---------------------------------------------------------
 * Camada: SHOPEE (regra de negócio específica da Shopee)
 * Depende de: utils/
 * Pode ser usado por: background/
 *
 * Este é o PONTO ÚNICO DE ENTRADA da automação. O background.js
 * não sabe (e não deveria saber) como responder avaliações na
 * Shopee — ele só recebe o pedido do popup e repassa pra cá.
 *
 * Nesta etapa, executarAutomacao() ainda NÃO faz nenhuma
 * automação real: não abre aba, não injeta content script, não
 * toca no site da Shopee. Só valida os parâmetros recebidos e
 * loga o que faria. Isso existe para já deixar pronta a
 * "tubulação" (popup → background → shopee) que vai ser usada
 * de verdade quando a automação for implementada — nesse
 * momento, só o CORPO desta função muda; nada em background/
 * ou ui/ precisa mudar.
 *
 * Passos reais que entrarão aqui no futuro (ainda não implementados):
 *   1. Localizar/abrir uma aba da Shopee (chrome.tabs).
 *   2. Enviar uma mensagem para o content script correspondente
 *      (src/content/), que sabe manipular a página.
 *   3. O content script usa seletores/parsers que também vão
 *      morar em shopee/ (arquivos futuros, ex: selectors.js).
 *   4. Agregar o resultado (quantas avaliações foram
 *      respondidas, falhas, etc.) e devolver para o background.
 * ---------------------------------------------------------
 */

(function () {
  const logger = Logger.createLogger("Shopee");

  /**
   * Valida os parâmetros recebidos antes de "executar".
   * Mantido separado para já existir um lugar único de validação
   * quando regras de negócio reais forem adicionadas (ex: limite
   * máximo de avaliações por execução, mensagem obrigatória, etc.).
   *
   * @param {{quantidade?: string|number, mensagem?: string}} parametros
   * @returns {{valido: boolean, erro?: string}}
   */
  function validarParametros({ quantidade, mensagem } = {}) {
    const quantidadeNumerica = Number(quantidade);

    if (!quantidade || Number.isNaN(quantidadeNumerica) || quantidadeNumerica <= 0) {
      return { valido: false, erro: "Quantidade de avaliações inválida." };
    }

    if (!mensagem || !mensagem.trim()) {
      return { valido: false, erro: "Mensagem de resposta não pode ficar vazia." };
    }

    return { valido: true };
  }

  /**
   * Executa (futuramente) o fluxo de automação. Nesta etapa,
   * apenas valida e loga — não interage com a Shopee de nenhuma forma.
   *
   * @param {{quantidade: string|number, mensagem: string, token: string|null}} parametros
   * @returns {Promise<{ok: boolean, message: string}>}
   */
  async function executarAutomacao(parametros = {}) {
    const { quantidade, mensagem, token } = parametros;

    const validacao = validarParametros({ quantidade, mensagem });
    if (!validacao.valido) {
      logger.warn("Execução rejeitada:", validacao.erro);
      return { ok: false, message: validacao.erro };
    }

    logger.log("Pedido de automação recebido (automação real ainda não implementada).");
    logger.log("Quantidade de avaliações:", quantidade);
    logger.log("Mensagem de resposta:", mensagem);
    logger.log("Token de sessão (uso interno, virá do backend futuramente):", token);

    return {
      ok: true,
      message: "Simulação registrada no console — nenhuma automação real foi executada.",
    };
  }

  globalThis.ShopeeAutomation = { executarAutomacao, validarParametros };
})();
