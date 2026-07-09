/**
 * auth/session.js
 * ---------------------------------------------------------
 * Camada: AUTH (regra de negócio de sessão/autorização)
 * Depende de: core/config.js, services/sessionApi.js, storage/storage.js
 * Pode ser usado por: background/
 *
 * Diferente do services/sessionApi.js (que só faz a requisição
 * HTTP crua), este módulo decide O QUE FAZER com a resposta:
 * transforma em um "estado de sessão" da extensão, salva/lê
 * esse estado no storage, e trata erros de rede como sessão
 * "não verificada" em vez de deixar a UI quebrar.
 *
 * Todo o conteúdo fica dentro de uma IIFE para que "const"/
 * "function" internos (ex: logger, SESSION_STATUS) não vazem
 * para o escopo global compartilhado — tanto o service worker
 * (importScripts) quanto o popup (múltiplas tags <script>)
 * executam vários arquivos no MESMO escopo global. Sem a IIFE,
 * um "const logger" aqui colide com um "const logger" em outro
 * arquivo. Só o que é intencionalmente exposto via
 * globalThis.SessionModule fica visível para fora.
 * ---------------------------------------------------------
 */

(function () {
  const logger = Logger.createLogger("SessionModule");

  const SESSION_STATUS = Object.freeze({
    UNKNOWN: "unknown",               // ainda não verificado nesta sessão do popup
    CHECKING: "checking",             // requisição em andamento
    AUTHENTICATED: "authenticated",   // sessão válida confirmada pelo backend
    UNAUTHENTICATED: "unauthenticated", // backend respondeu, mas usuário não está logado
    ERROR: "error",                   // não foi possível falar com o backend
  });

  const SESSION_DEFAULT = Object.freeze({
    status: SESSION_STATUS.UNKNOWN,
    token: null,
    plan: null,
    expiresAt: null,
    checkedAt: null,
  });

  /**
   * Lê o estado de sessão salvo localmente (cache).
   * @returns {Promise<typeof SESSION_DEFAULT>}
   */
  async function getSession() {
    const salvo = await StorageModule.getItem(CONFIG.STORAGE_KEYS.SESSION);
    return salvo || { ...SESSION_DEFAULT };
  }

  /**
   * Salva o estado de sessão localmente.
   * @param {object} sessionData
   * @returns {Promise<void>}
   */
  function saveSession(sessionData) {
    return StorageModule.setItem(CONFIG.STORAGE_KEYS.SESSION, sessionData);
  }

  /**
   * Remove a sessão local (logout local / forçar nova verificação).
   * @returns {Promise<void>}
   */
  function clearSession() {
    return StorageModule.removeItem(CONFIG.STORAGE_KEYS.SESSION);
  }

  /**
   * Verifica a sessão com o backend (via services/sessionApi.js) e
   * atualiza o cache local com o resultado.
   *
   * Nesta etapa do projeto o backend ainda não existe de verdade,
   * então a chamada em SessionApi.fetchSessionStatus() vai falhar
   * (erro de rede/DNS) — isso é esperado e tratado no catch.
   *
   * @returns {Promise<typeof SESSION_DEFAULT>}
   */
  async function checkSessionWithBackend() {
    try {
      const data = await SessionApi.fetchSessionStatus();

      const sessaoAtual = {
        status: data.authorized ? SESSION_STATUS.AUTHENTICATED : SESSION_STATUS.UNAUTHENTICATED,
        token: data.extensionToken || null,
        plan: data.plan || null,
        expiresAt: data.expiresAt || null,
        checkedAt: Date.now(),
      };

      await saveSession(sessaoAtual);
      return sessaoAtual;
    } catch (erro) {
      // Esperado nesta fase: backend ainda não implementado, ou usuário offline.
      logger.warn(
        "Não foi possível verificar a sessão com o backend (esperado enquanto o backend não existir):",
        erro
      );

      const sessaoErro = {
        status: SESSION_STATUS.ERROR,
        token: null,
        plan: null,
        expiresAt: null,
        checkedAt: Date.now(),
      };
      await saveSession(sessaoErro);
      return sessaoErro;
    }
  }

  /**
   * Ativa uma sessão FICTÍCIA, recebida do site via mensagem
   * externa (background.js), sem nenhuma chamada real ao backend.
   *
   * Usado nesta etapa porque ainda não existe backend: o site
   * simula um login e avisa a extensão diretamente (ver
   * background/background.js → onMessageExternal, tipo
   * "FAKE_LOGIN"). Quando o backend real existir, este método
   * pode continuar existindo (útil para ambiente de testes) ao
   * lado de checkSessionWithBackend(), que fará a validação de
   * verdade.
   *
   * @param {{token?: string, plan?: string, expiresAt?: number}} dadosFicticios
   * @returns {Promise<typeof SESSION_DEFAULT>}
   */
  async function activateFakeSession(dadosFicticios = {}) {
    const sessaoFicticia = {
      status: SESSION_STATUS.AUTHENTICATED,
      token: dadosFicticios.token || null,
      plan: dadosFicticios.plan || null,
      expiresAt: dadosFicticios.expiresAt || null,
      checkedAt: Date.now(),
    };

    logger.log("Sessão fictícia ativada a partir do site (sem backend real).");
    await saveSession(sessaoFicticia);
    return sessaoFicticia;
  }

  globalThis.SessionModule = {
    STATUS: SESSION_STATUS,
    DEFAULT: SESSION_DEFAULT,
    getSession,
    saveSession,
    clearSession,
    checkSessionWithBackend,
    activateFakeSession,
  };
})();
