/**
 * shopee/executionStateMachine.js
 * ---------------------------------------------------------
 * Camada: SHOPEE (regra de negócio da automação)
 * Depende de: utils/logger.js
 * Pode ser usado por: content/
 *
 * Máquina de estados formal do fluxo de automação. Garante que só
 * existe UM estado ativo por vez (nunca dois simultâneos) e loga
 * toda transição no console.
 *
 * Estados:
 *   IDLE      → parado, aguardando "Executar".
 *   SCANNING  → lendo a página / procurando botões "Responder".
 *   RUNNING   → destacando e clicando no botão escolhido.
 *   STOPPING  → cancelamento em andamento (limpando tudo).
 *
 * Transições permitidas (qualquer outra é rejeitada e logada como
 * erro, nunca aplicada silenciosamente):
 *
 *   IDLE     → SCANNING   (clique em "Executar")
 *   SCANNING → RUNNING    (botões encontrados, indo clicar)
 *   SCANNING → IDLE       (nada encontrado/visível — não há o que rodar)
 *   SCANNING → STOPPING   ("Parar" clicado durante a busca)
 *   RUNNING  → IDLE       (clique concluído normalmente)
 *   RUNNING  → STOPPING   ("Parar" clicado durante a execução)
 *   STOPPING → IDLE       (limpeza concluída)
 *
 * O estado fica em `globalThis` (não numa variável local do módulo)
 * de propósito: o "mundo isolado" de uma aba persiste entre várias
 * injeções de content script (cada clique em "Executar" injeta os
 * arquivos de novo). Guardar em globalThis é o que permite a máquina
 * recusar uma segunda execução enquanto a primeira ainda não voltou
 * para IDLE — sem isso, cada injeção teria seu próprio estado isolado
 * e duas execuções poderiam rodar "ao mesmo tempo" sem se perceberem.
 * ---------------------------------------------------------
 */

(function () {
  const logger = Logger.createLogger("Estado");

  const ESTADOS = Object.freeze({
    IDLE: "IDLE",
    SCANNING: "SCANNING",
    RUNNING: "RUNNING",
    STOPPING: "STOPPING",
  });

  const TRANSICOES_PERMITIDAS = Object.freeze({
    [ESTADOS.IDLE]: [ESTADOS.SCANNING],
    [ESTADOS.SCANNING]: [ESTADOS.RUNNING, ESTADOS.IDLE, ESTADOS.STOPPING],
    [ESTADOS.RUNNING]: [ESTADOS.IDLE, ESTADOS.STOPPING],
    [ESTADOS.STOPPING]: [ESTADOS.IDLE],
  });

  const CHAVE_ESTADO_GLOBAL = "__ssaExecutionState";

  function lerEstadoAtual() {
    return globalThis[CHAVE_ESTADO_GLOBAL] || ESTADOS.IDLE;
  }

  function gravarEstado(novoEstado) {
    globalThis[CHAVE_ESTADO_GLOBAL] = novoEstado;
  }

  /**
   * Tenta transicionar para um novo estado. É a ÚNICA forma permitida
   * de mudar o estado — nunca é atribuído diretamente em outro lugar.
   * Transições inválidas são rejeitadas (e logadas como erro), nunca
   * aplicadas de qualquer jeito.
   *
   * @param {string} novoEstado
   * @returns {boolean} true se a transição foi aceita
   */
  function transicionarPara(novoEstado) {
    if (!ESTADOS[novoEstado]) {
      logger.error(`Estado desconhecido: "${novoEstado}" — transição ignorada.`);
      return false;
    }

    const estadoAtual = lerEstadoAtual();
    const permitido = (TRANSICOES_PERMITIDAS[estadoAtual] || []).includes(novoEstado);

    if (!permitido) {
      logger.error(`Transição inválida: ${estadoAtual} → ${novoEstado} (ignorada).`);
      return false;
    }

    gravarEstado(novoEstado);
    logger.log(`Estado: ${estadoAtual} → ${novoEstado}`);
    return true;
  }

  /**
   * @returns {string} o estado atual (um dos valores de ESTADOS)
   */
  function obterEstadoAtual() {
    return lerEstadoAtual();
  }

  /**
   * @returns {boolean} true se o estado atual for IDLE (nada rodando)
   */
  function estaOcioso() {
    return lerEstadoAtual() === ESTADOS.IDLE;
  }

  globalThis.ExecutionStateMachine = {
    ESTADOS,
    transicionarPara,
    obterEstadoAtual,
    estaOcioso,
  };
})();
