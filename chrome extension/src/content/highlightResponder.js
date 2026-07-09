/**
 * content/highlightResponder.js
 * ---------------------------------------------------------
 * Camada: CONTENT (mecanismo de content script)
 * Depende de: utils/logger.js, shopee/selectors.js
 * Injetado automaticamente pelo manifest.json (content_scripts)
 * nas páginas do Seller Center da Shopee.
 *
 * PRIMEIRO PASSO da automação: apenas ENCONTRA e DESTACA
 * visualmente os botões "Responder". Não clica em nada, não
 * envia nada para o background, não modifica dados da página —
 * só marca visualmente e loga a contagem no console.
 * ---------------------------------------------------------
 */

(function () {
  const logger = Logger.createLogger("Content");

  const HIGHLIGHT_CLASS = "ssa-highlight-responder";
  const MARCADOR_ATRIBUTO = "data-ssa-responder";

  /**
   * Injeta (uma única vez por página) o CSS do destaque visual.
   * Usamos uma classe própria com !important para não depender do
   * CSS da Shopee nem correr o risco de ser sobrescrita por ele.
   */
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

  /**
   * Marca visualmente um botão como encontrado. Usa um atributo no
   * próprio elemento (não uma variável em memória) para lembrar
   * quem já foi processado — assim, se a página carregar mais
   * conteúdo depois e a varredura rodar de novo, ninguém é
   * contado ou destacado em duplicidade.
   *
   * @param {Element} elemento
   * @returns {boolean} true se este elemento era novo (ainda não marcado)
   */
  function destacar(elemento) {
    if (elemento.hasAttribute(MARCADOR_ATRIBUTO)) return false;

    elemento.setAttribute(MARCADOR_ATRIBUTO, "true");
    elemento.classList.add(HIGHLIGHT_CLASS);
    return true;
  }

  /**
   * Varre a página em busca de botões "Responder", destaca os que
   * ainda não tinham sido encontrados, e loga:
   *  - quantos são NOVOS nesta varredura;
   *  - quantos existem NO TOTAL na página até agora.
   */
  function varrerEDestacar() {
    const encontrados = ShopeeSelectors.encontrarBotoesResponder(document, { apenasVisiveis: false });
    const novos = encontrados.filter(destacar);

    if (novos.length > 0) {
      const total = document.querySelectorAll(`[${MARCADOR_ATRIBUTO}]`).length;
      logger.log(`${novos.length} novo(s) botão(ões) "Responder" destacado(s). Total na página: ${total}.`);
    }
  }

  garantirEstiloDestaque();
  varrerEDestacar();

  /**
   * O Seller Center é uma SPA: a lista de avaliações costuma
   * carregar ou mudar depois do carregamento inicial (paginação,
   * filtros, rolagem infinita). Por isso observamos mudanças no
   * DOM e revarremos — com um pequeno debounce para não rodar a
   * cada mutação isolada (evita rodar centenas de vezes por segundo
   * em páginas com animações/atualizações frequentes).
   */
  let debounceTimer = null;
  const observer = new MutationObserver(() => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(varrerEDestacar, 400);
  });

  observer.observe(document.body, { childList: true, subtree: true });

  logger.log("Monitorando a página em busca de novos botões \"Responder\".");
})();
