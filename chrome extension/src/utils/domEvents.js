/**
 * utils/domEvents.js
 * ---------------------------------------------------------
 * Camada: UTILS (função genérica, sem regra de negócio)
 * Depende de: nada (só APIs padrão do navegador: DOM/Events).
 * Pode ser usado por: content/ — só faz sentido onde existe um
 * `document` de página real; não é carregado no background nem
 * no popup (por isso não entra no importScripts do service worker).
 *
 * Por que isso existe: `elemento.click()` nativo às vezes não é
 * suficiente sozinho (alguns handlers exigem `bubbles`/`cancelable`
 * configuráveis, que `.click()` não permite). A estratégia usada
 * aqui é: tentar `.click()` primeiro (prioridade, mais simples), e
 * SEMPRE reforçar com um `dispatchEvent(MouseEvent)` logo depois —
 * essa segunda parte foi CONFIRMADA funcionando manualmente no
 * Seller Center real, então mantemos as duas por segurança.
 *
 * ⚠️ Já testamos uma versão anterior que também disparava
 * pointerdown/mousedown/mouseup antes do click — e ela NÃO
 * funcionava, enquanto o click simples funciona. Por isso esta
 * versão é deliberadamente mínima: só os dois eventos que se
 * provaram necessários, nada além disso.
 * ---------------------------------------------------------
 */

(function () {
  function centroDoElemento(elemento) {
    const rect = elemento.getBoundingClientRect();
    return {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    };
  }

  /**
   * Simula um clique de usuário num elemento: rola até ele ficar
   * visível, tenta `.click()` nativo (prioridade), e sempre reforça
   * com um `dispatchEvent(MouseEvent)` — a técnica confirmada
   * funcionando manualmente no Seller Center real.
   *
   * @param {Element} elemento
   */
  function simularCliqueReal(elemento) {
    elemento.scrollIntoView({ block: "center", inline: "center" });

    // Prioridade: .click() nativo. Envolvido em try/catch porque
    // alguns elementos (ex: <span>/<div> sem semântica de botão)
    // podem não implementar .click() de forma útil — sem problema,
    // o dispatchEvent abaixo garante o clique de qualquer forma.
    try {
      elemento.click();
    } catch {
      // Ignorado de propósito — o dispatchEvent abaixo é o que
      // realmente importa e já foi confirmado funcionando.
    }

    const coordenadas = centroDoElemento(elemento);
    const evento = new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      view: window,
      clientX: coordenadas.x,
      clientY: coordenadas.y,
      button: 0,
    });

    elemento.dispatchEvent(evento);
  }

  /**
   * Diagnóstico: verifica se o elemento que REALMENTE está no topo
   * visual, nas coordenadas de clique do elemento-alvo, é o próprio
   * elemento (ou um descendente/ancestral dele) — ou se é outra
   * coisa (ex: um overlay transparente, um tooltip, uma camada de
   * loading) capturando o clique antes que ele chegue no alvo.
   *
   * Não muda o clique em si; só ajuda a diagnosticar por que um
   * clique "correto" às vezes não produz efeito nenhum na página.
   *
   * @param {Element} elemento
   * @returns {{ok: boolean, elementoNoTopo: Element|null}}
   */
  function verificarSobreposicao(elemento) {
    const coordenadas = centroDoElemento(elemento);
    const elementoNoTopo = document.elementFromPoint(coordenadas.x, coordenadas.y);

    const semObstrucao =
      elementoNoTopo === elemento ||
      elemento.contains(elementoNoTopo) ||
      (elementoNoTopo && elementoNoTopo.contains(elemento));

    return { ok: Boolean(semObstrucao), elementoNoTopo };
  }

  /**
   * Escreve um valor num <textarea>/<input> CONTROLADO PELO REACT.
   *
   * Por que não basta `elemento.value = texto`: o React intercepta o
   * setter nativo de `value` numa instância controlada, então uma
   * atribuição direta não avisa o React que algo mudou — a UI (e
   * qualquer validação) simplesmente ignora a mudança. A correção é
   * chamar o setter NATIVO do protótipo (não o da instância, que o
   * React sobrescreveu) e, na sequência, disparar "input"/"change"
   * manualmente para o React perceber e atualizar seu estado interno.
   *
   * @param {HTMLTextAreaElement|HTMLInputElement} elemento
   * @param {string} valor
   */
  function definirValorReact(elemento, valor) {
    const prototipo =
      elemento.tagName === "TEXTAREA" ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;

    const setterNativo = Object.getOwnPropertyDescriptor(prototipo, "value").set;
    setterNativo.call(elemento, valor);

    elemento.dispatchEvent(new Event("input", { bubbles: true }));
    elemento.dispatchEvent(new Event("change", { bubbles: true }));
  }

  /**
   * Cria uma espera CANCELÁVEL e SEM DELAY FIXO: em vez de esperar um
   * tempo arbitrário, observa o DOM (MutationObserver) e resolve assim
   * que `condicaoFn()` retornar algo verdadeiro (ex: um elemento
   * encontrado, ou `true` quando um elemento deixou de existir).
   *
   * Um `timeoutMs` de segurança existe só como circuito de proteção
   * (evita travar para sempre se algo inesperado acontecer na
   * página) — NÃO é o mecanismo de espera em si, é um teto máximo.
   *
   * @param {() => any} condicaoFn - roda a cada mutação do DOM (e uma
   *   vez imediatamente); a espera termina quando o retorno for "truthy".
   * @param {{timeoutMs?: number}} [opcoes]
   * @returns {{promise: Promise<any>, cancelar: () => void}}
   *   `promise` resolve com o valor retornado por `condicaoFn()` (ou
   *   `null` se o tempo de segurança esgotar, ou `"cancelado"` se
   *   `cancelar()` for chamado).
   */
  function criarEsperaPorCondicao(condicaoFn, { timeoutMs = 15000 } = {}) {
    let observer;
    let idTimeoutSeguranca;
    let resolverExterno;
    let concluido = false;

    function limpar() {
      if (observer) observer.disconnect();
      clearTimeout(idTimeoutSeguranca);
    }

    const promise = new Promise((resolve) => {
      resolverExterno = resolve;

      const resultadoImediato = condicaoFn();
      if (resultadoImediato) {
        concluido = true;
        resolve(resultadoImediato);
        return;
      }

      observer = new MutationObserver(() => {
        if (concluido) return;
        const resultado = condicaoFn();
        if (resultado) {
          concluido = true;
          limpar();
          resolve(resultado);
        }
      });

      observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        characterData: true,
      });

      idTimeoutSeguranca = setTimeout(() => {
        if (!concluido) {
          concluido = true;
          limpar();
          resolve(null);
        }
      }, timeoutMs);
    });

    function cancelar() {
      if (concluido) return;
      concluido = true;
      limpar();
      resolverExterno("cancelado");
    }

    return { promise, cancelar };
  }

  /**
   * Verifica se a página já está rolada até o fim (com uma pequena
   * tolerância). Usado para decidir se vale a pena continuar rolando
   * em busca de mais conteúdo, ou se já chegamos ao limite real.
   *
   * @param {number} [tolerancia] - em pixels
   * @returns {boolean}
   */
  function estaNoFimDaPagina(tolerancia = 4) {
    const el = document.scrollingElement || document.documentElement;
    return el.scrollTop + window.innerHeight >= el.scrollHeight - tolerancia;
  }

  /**
   * Rola a página suavemente para baixo (não instantaneamente) — só
   * inicia o scroll; quem chama decide como esperar o novo conteúdo
   * (normalmente com criarEsperaPorCondicao).
   *
   * @param {number} pixels
   */
  function rolarSuavemente(pixels) {
    window.scrollBy({ top: pixels, left: 0, behavior: "smooth" });
  }

  globalThis.DomEvents = {
    simularCliqueReal,
    verificarSobreposicao,
    definirValorReact,
    criarEsperaPorCondicao,
    estaNoFimDaPagina,
    rolarSuavemente,
  };
})();
