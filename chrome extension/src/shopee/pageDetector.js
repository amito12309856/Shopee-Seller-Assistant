/**
 * shopee/pageDetector.js
 * ---------------------------------------------------------
 * Camada: SHOPEE (regra de negócio específica da Shopee)
 * Depende de: utils/
 * Pode ser usado por: background/
 *
 * Responsabilidade única: saber diferenciar "isso é o Seller
 * Center da Shopee" de "isso não é". Nenhuma automação, nenhuma
 * leitura de aba — só a regra de decisão sobre uma URL.
 *
 * Separado de automation.js de propósito: detectar a página é
 * uma pergunta ("estou no lugar certo?"), executar é uma ação
 * ("faça algo aqui"). Mantê-las em arquivos diferentes deixa
 * claro que a automação vai, no futuro, DEPENDER do resultado
 * desta detecção antes de rodar.
 * ---------------------------------------------------------
 */

(function () {
  const logger = Logger.createLogger("Shopee");

  // O Seller Center da Shopee tem um subdomínio "seller." em
  // praticamente todos os mercados regionais (ex: seller.shopee.com.br,
  // seller.shopee.co.id, seller.shopee.tw...). Cobrimos pelo padrão
  // do host em vez de listar domínio por domínio.
  const SELLER_CENTER_HOST_PATTERN = /^seller\.shopee\./i;

  /**
   * Verifica se uma URL pertence ao Seller Center da Shopee.
   *
   * @param {string|null|undefined} url
   * @returns {boolean}
   */
  function isSellerCenterUrl(url) {
    if (!url) return false;

    try {
      const { hostname } = new URL(url);
      return SELLER_CENTER_HOST_PATTERN.test(hostname);
    } catch (erro) {
      // URL inválida (ex: "chrome://extensions") — não é Shopee, sem drama.
      logger.warn("Não foi possível interpretar a URL da aba:", url, erro);
      return false;
    }
  }

  globalThis.ShopeePageDetector = { isSellerCenterUrl };
})();
