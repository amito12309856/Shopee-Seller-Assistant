/**
 * core/config.js
 * ---------------------------------------------------------
 * Camada: CORE (fundação)
 * Depende de: nada. Nenhuma outra camada pode ser importada aqui.
 * Pode ser usado por: todas as outras camadas.
 *
 * Ponto único de configuração da extensão: URLs do site/API,
 * endpoints e chaves usadas no chrome.storage.local.
 *
 * ⚠️ LIMITAÇÃO IMPORTANTE:
 * O manifest.json é estático e NÃO importa este arquivo. Sempre
 * que o domínio abaixo mudar, atualize também MANUALMENTE:
 *   - "host_permissions" no manifest.json
 *   - "externally_connectable.matches" no manifest.json
 *
 * Carregado tanto pelo popup (via <script> normal) quanto pelo
 * service worker de background (via importScripts), por isso
 * usamos `globalThis` em vez de `window` — funciona nos dois
 * ambientes sem alterações.
 * ---------------------------------------------------------
 */

(function () {
  const CONFIG = Object.freeze({
    // ⚠️ Valores de DESENVOLVIMENTO: apontam para o site MVP rodando
    // localmente (veja README.md → "Testando a integração site ↔ extensão").
    // TODO: ao publicar o site de verdade, trocar por:
    //   SITE_BASE_URL: "https://app.seusaas.com"
    //   LOGIN_URL: "https://app.seusaas.com/login"
    SITE_BASE_URL: "http://localhost:5500",
    LOGIN_URL: "http://localhost:5500/index.html",

    API_BASE_URL: "https://api.seusaas.com",
    SESSION_CHECK_ENDPOINT: "/v1/extension/session",

    STORAGE_KEYS: Object.freeze({
      SESSION: "shopeeSellerAssistantSession",
      SETTINGS: "shopeeSellerAssistantConfig",
      // Parâmetros da execução ATUAL (quantidade/mensagem no momento do
      // clique em "Executar") — gravados pelo background antes de
      // injetar o content script, já que chrome.scripting.executeScript
      // com "files" não permite passar argumentos diretamente.
      RUN_PARAMS: "shopeeSellerAssistantRunParams",
    }),
  });

  globalThis.CONFIG = CONFIG;
})();
