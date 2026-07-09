/**
 * utils/logger.js
 * ---------------------------------------------------------
 * Camada: UTILS (funções puras/genéricas)
 * Depende de: nada.
 * Pode ser usado por: todas as outras camadas.
 *
 * Antes, cada arquivo escrevia "console.log('[Background] ...')"
 * manualmente. Isso funciona, mas duplica a string de prefixo e
 * dificulta trocar o comportamento de log no futuro (ex: enviar
 * erros para um serviço externo tipo Sentry).
 *
 * Agora cada módulo cria seu próprio logger nomeado:
 *   const logger = Logger.createLogger("Background");
 *   logger.warn("algo aconteceu", detalhe);
 *   // → console.warn("[Background]", "algo aconteceu", detalhe)
 * ---------------------------------------------------------
 */

(function () {
  function createLogger(prefixo) {
    return {
      log: (...args) => console.log(`[${prefixo}]`, ...args),
      warn: (...args) => console.warn(`[${prefixo}]`, ...args),
      error: (...args) => console.error(`[${prefixo}]`, ...args),
    };
  }

  globalThis.Logger = { createLogger };
})();
