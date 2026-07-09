/**
 * services/sessionApi.js
 * ---------------------------------------------------------
 * Camada: SERVICES (integração com o mundo externo)
 * Depende de: core/config.js
 * Pode ser usado por: auth/
 *
 * Responsabilidade única: falar HTTP com o backend do SaaS.
 * Este arquivo NÃO decide o que os dados significam (isso é
 * trabalho da camada auth/) e NÃO grava nada em storage — só
 * busca e devolve a resposta crua (ou lança erro).
 *
 * Se um dia a API mudar de REST para GraphQL, ou o endpoint
 * mudar de nome, só este arquivo precisa ser tocado — auth/
 * continua funcionando do mesmo jeito.
 *
 * Contrato esperado do backend (a combinar com o time de API):
 *
 *   GET {API_BASE_URL}{SESSION_CHECK_ENDPOINT}
 *   Credenciais: cookie de sessão do site (credentials: "include")
 *
 *   200 OK
 *   {
 *     "authorized": true,
 *     "extensionToken": "eyJhbGciOi...",
 *     "plan": "pro",
 *     "expiresAt": 1893456000000
 *   }
 *
 *   401/403 → usuário sem sessão válida no site.
 * ---------------------------------------------------------
 */

(function () {
  /**
   * Busca o status de sessão no backend.
   * Envia os cookies do site (credentials: "include") para que o
   * backend identifique se o usuário está logado.
   *
   * @returns {Promise<{authorized: boolean, extensionToken?: string, plan?: string, expiresAt?: number}>}
   * @throws lança erro em caso de falha de rede/DNS (backend fora do ar, etc.)
   */
  async function fetchSessionStatus() {
    const url = `${CONFIG.API_BASE_URL}${CONFIG.SESSION_CHECK_ENDPOINT}`;

    const response = await fetch(url, {
      method: "GET",
      credentials: "include",
      headers: {
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      // Backend respondeu, mas usuário não está autenticado (401/403 etc.)
      return { authorized: false };
    }

    return response.json();
  }

  globalThis.SessionApi = { fetchSessionStatus };
})();
