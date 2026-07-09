/**
 * utils/flowLogger.js
 * ---------------------------------------------------------
 * Camada: UTILS (função genérica, sem regra de negócio)
 * Depende de: nada.
 * Pode ser usado por: content/ (e futuramente shopee/, quando o
 * preenchimento/envio de resposta for implementado).
 *
 * Logger dedicado à NARRATIVA DE EXECUÇÃO — diferente do
 * utils/logger.js (que prefixa por módulo, ex: "[Content]",
 * "[Background]", útil para diagnóstico geral). Este aqui existe
 * para mostrar só as etapas que o usuário precisa acompanhar
 * durante uma execução, com tags fixas e sem ruído:
 *
 *   [SCAN]  → varredura da página (quantos botões encontrados)
 *   [RUN]   → processando uma avaliação
 *   [WAIT]  → aguardando algo aparecer na página (ex: textarea)
 *   [TYPE]  → mensagem inserida no campo de resposta
 *   [SEND]  → resposta enviada
 *   [STOP]  → processo interrompido
 *
 * Note que [WAIT]/[TYPE]/[SEND] ainda não têm nenhuma automação por
 * trás nesta etapa (preenchimento/confirmação de resposta não estão
 * implementados) — as funções existem prontas para quando esse
 * comportamento for construído, sem precisar mexer no logger de novo.
 * ---------------------------------------------------------
 */

(function () {
  function log(tag, mensagem) {
    console.log(`[${tag}]`, mensagem);
  }

  globalThis.FlowLogger = {
    scan: (mensagem) => log("SCAN", mensagem),
    run: (mensagem) => log("RUN", mensagem),
    wait: (mensagem) => log("WAIT", mensagem),
    type: (mensagem) => log("TYPE", mensagem),
    send: (mensagem) => log("SEND", mensagem),
    stop: (mensagem) => log("STOP", mensagem),
  };
})();
