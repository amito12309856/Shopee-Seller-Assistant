/**
 * shopee/selectors.js
 * ---------------------------------------------------------
 * Camada: SHOPEE (regra de negócio específica da Shopee)
 * Depende de: utils/
 * Pode ser usado por: content/
 *
 * Responsabilidade única: saber reconhecer elementos da página
 * do Seller Center. Nesta etapa, só "isso é um botão Responder?".
 * Nenhuma leitura de clique, nenhum destaque visual — isso é
 * mecanismo de content/, não regra de negócio.
 *
 * ⚠️ Isso é uma HEURÍSTICA (texto exato "Responder"), confirmada
 * por inspeção real: o Seller Center usa `<span>Responder</span>`
 * SEM nenhum `<button>`/`<a>`/`role="button"` envolvendo — por
 * isso o seletor inclui span/div, não só tags semanticamente
 * clicáveis. Se a marcação mudar, é AQUI que se ajusta — nada em
 * content/ precisa mudar por causa disso.
 * ---------------------------------------------------------
 */

(function () {
  // Inclui span/div de propósito: a Shopee usa elementos sem
  // semântica de botão (confirmado por inspeção). O filtro de
  // texto exato abaixo (ehBotaoResponder) é o que evita pegar
  // qualquer span/div aleatório da página.
  const SELETORES_CANDIDATOS = 'button, a, [role="button"], input[type="button"], input[type="submit"], span, div';

  /**
   * Verifica se o texto visível de um elemento é exatamente
   * "Responder" (ignora maiúsculas/minúsculas e espaços extras,
   * inclusive os de um eventual ícone sem texto dentro do botão).
   *
   * @param {Element} elemento
   * @returns {boolean}
   */
  function ehBotaoResponder(elemento) {
    const texto = (elemento.textContent || "").trim().replace(/\s+/g, " ");
    return texto.toLowerCase() === "responder";
  }

  /**
   * Remove duplicatas "aninhadas": quando um <span>Responder</span>
   * está sozinho dentro de um <div>Responder</div>, os dois batem o
   * filtro de texto (o texto do div é o mesmo do span, já que é seu
   * único conteúdo). Mantemos só o mais INTERNO de cada grupo — é
   * nele que um clique de usuário real aterrissaria de verdade, e
   * evita destacar/clicar duas vezes no que visualmente é um único
   * botão.
   *
   * @param {Element[]} elementos
   * @returns {Element[]}
   */
  function manterApenasMaisInternos(elementos) {
    return elementos.filter(
      (el) => !elementos.some((outro) => outro !== el && el.contains(outro))
    );
  }

  /**
   * Verifica se um elemento está de fato visível NA TELA agora —
   * não só presente no DOM. Importante porque listas grandes (como
   * a de avaliações) costumam ser "virtualizadas": a Shopee mantém
   * itens fora da tela no DOM por performance, então "existe no
   * documento" é bem diferente de "o usuário está vendo isso".
   *
   * @param {Element} elemento
   * @returns {boolean}
   */
  function estaVisivelNaTela(elemento) {
    const rect = elemento.getBoundingClientRect();

    const alturaJanela = window.innerHeight || document.documentElement.clientHeight;
    const larguraJanela = window.innerWidth || document.documentElement.clientWidth;

    const dentroDaViewport =
      rect.bottom > 0 && rect.right > 0 && rect.top < alturaJanela && rect.left < larguraJanela;

    if (!dentroDaViewport || rect.width === 0 || rect.height === 0) {
      return false;
    }

    const estilo = getComputedStyle(elemento);
    return estilo.visibility !== "hidden" && estilo.display !== "none" && Number(estilo.opacity) !== 0;
  }

  /**
   * Ordena elementos pela posição visual na tela: de cima para
   * baixo, depois da esquerda para a direita. A ordem do DOM nem
   * sempre bate com a ordem visual (grids/tabelas podem reordenar
   * via CSS) — quem decide "qual é o primeiro" deve ser a posição
   * na tela, não a posição no HTML.
   *
   * @param {Element[]} elementos
   * @returns {Element[]}
   */
  function ordenarPorPosicaoVisual(elementos) {
    return [...elementos].sort((a, b) => {
      const retA = a.getBoundingClientRect();
      const retB = b.getBoundingClientRect();
      return retA.top - retB.top || retA.left - retB.left;
    });
  }

  /**
   * Procura, dentro de uma raiz (padrão: o documento inteiro),
   * todos os elementos cujo texto é "Responder", ordenados do mais
   * próximo do topo da página para o mais distante.
   *
   * @param {ParentNode} [raiz]
   * @param {{apenasVisiveis?: boolean}} [opcoes] - por padrão, só
   *   considera elementos visíveis na tela (recomendado para
   *   qualquer ação que dependa do usuário ver o resultado, como
   *   clicar). Passe `apenasVisiveis: false` para contar/destacar
   *   TODOS os botões da página, mesmo fora da tela.
   * @returns {Element[]}
   */
  function encontrarBotoesResponder(raiz = document, { apenasVisiveis = true } = {}) {
    const candidatos = Array.from(raiz.querySelectorAll(SELETORES_CANDIDATOS));
    const combinamTexto = candidatos.filter(ehBotaoResponder);
    const unicos = manterApenasMaisInternos(combinamTexto);
    const encontrados = apenasVisiveis ? unicos.filter(estaVisivelNaTela) : unicos;

    return ordenarPorPosicaoVisual(encontrados);
  }

  /**
   * Encontra o campo de texto da caixa de resposta que abre depois de
   * clicar em "Responder". Tenta, em ordem de prioridade:
   *   1. textarea[name="comment"]
   *   2. textarea[placeholder="Insira sua resposta."]
   *
   * @returns {HTMLTextAreaElement|null}
   */
  function encontrarTextareaResposta() {
    return (
      document.querySelector('textarea[name="comment"]') ||
      document.querySelector('textarea[placeholder="Insira sua resposta."]') ||
      null
    );
  }

  /**
   * Encontra o botão "Enviar" da caixa de resposta. Tenta, em ordem
   * de prioridade:
   *   1. button[data-testid="reply-submit-button"]
   *   2. qualquer <button> cujo texto visível seja exatamente "Enviar"
   *
   * @returns {HTMLButtonElement|null}
   */
  function encontrarBotaoEnviar() {
    const porTestId = document.querySelector('button[data-testid="reply-submit-button"]');
    if (porTestId) return porTestId;

    const porTexto = Array.from(document.querySelectorAll("button")).find(
      (btn) => btn.innerText.trim() === "Enviar"
    );
    return porTexto || null;
  }

  globalThis.ShopeeSelectors = {
    encontrarBotoesResponder,
    ehBotaoResponder,
    estaVisivelNaTela,
    encontrarTextareaResposta,
    encontrarBotaoEnviar,
  };
})();
