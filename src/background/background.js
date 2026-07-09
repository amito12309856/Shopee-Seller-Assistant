/**
 * background/background.js
 * ---------------------------------------------------------
 * Camada: BACKGROUND (service worker — orquestração)
 * Depende de: core/, utils/, storage/, services/, auth/
 * Pode ser usado por: ninguém importa o background — ele é o
 * ponto de entrada declarado no manifest.json.
 *
 * É o "hub" central da extensão:
 *  - Ponto único que aciona a verificação de sessão.
 *  - Abre a aba de login do site quando não há sessão válida.
 *  - Recebe um "aviso" do site (via externally_connectable)
 *    quando o login acontece, para reverificar a sessão.
 *  - Nesta etapa (sem backend), também recebe do site uma
 *    sessão FICTÍCIA pronta ("FAKE_LOGIN") e apenas a salva —
 *    ver auth/session.js → activateFakeSession().
 *  - Recebe o pedido de "Executar" do popup ("RUN_AUTOMATION"), valida
 *    quantidade/mensagem, grava esses parâmetros no storage, e SÓ
 *    ENTÃO injeta content/responderFlow.js na aba ativa
 *    (chrome.scripting.executeScript) — nada roda automaticamente
 *    ao abrir a Shopee. O background NÃO conhece os detalhes de como
 *    abrir/escrever/enviar a resposta funcionam, só decide QUANDO
 *    injetar e repassa os parâmetros via storage.
 *  - Recebe o pedido de "Parar" do popup ("STOP_AUTOMATION") e
 *    repassa para a aba ativa via chrome.tabs.sendMessage — quem
 *    sabe cancelar de verdade (limpar destaques, timers, laço em
 *    andamento) é o próprio responderFlow.js rodando na aba.
 *  - Responde "estou na Shopee?" ("CHECK_CURRENT_PAGE"), lendo a
 *    aba ativa e delegando a decisão para shopee/pageDetector.js.
 *
 * A automação de resposta (abrir → escrever → enviar → repetir) já
 * está implementada em content/responderFlow.js, usando os seletores
 * reais do Seller Center (shopee/selectors.js).
 * ---------------------------------------------------------
 */

// importScripts precisa ficar no nível superior do arquivo.
// Os caminhos são relativos à localização deste script
// (src/background/), por isso "../" sobe até src/.
importScripts(
  "../core/config.js",
  "../utils/logger.js",
  "../storage/storage.js",
  "../services/sessionApi.js",
  "../auth/session.js",
  "../shopee/automation.js",
  "../shopee/pageDetector.js"
);

// A partir daqui, tudo dentro de uma IIFE: cada arquivo carregado
// via importScripts roda no MESMO escopo global do service worker.
// Sem isolar em uma função, um "const logger" aqui colidiria com
// o "const logger" declarado dentro de auth/session.js (erro:
// "Identifier 'logger' has already been declared"). Só o que for
// necessário fora deste arquivo é exposto via listeners do
// próprio chrome.runtime — não precisamos expor nada em globalThis
// aqui, já que o background é o topo da cadeia (ninguém importa
// background.js).
(function () {
  const logger = Logger.createLogger("Background");

  chrome.runtime.onInstalled.addListener((details) => {
    logger.log("Shopee Seller Assistant instalado/atualizado.", details.reason);
  });

  /**
   * Mensagens vindas de DENTRO da extensão (popup, e futuramente
   * content scripts). Usamos um "type" para rotear cada ação.
   */
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    switch (message?.type) {
      case "CHECK_SESSION": {
        SessionModule.checkSessionWithBackend()
          .then((session) => sendResponse({ ok: true, session }))
          .catch((erro) => sendResponse({ ok: false, error: String(erro) }));
        return true; // mantém o canal aberto para resposta assíncrona
      }

      case "OPEN_LOGIN": {
        chrome.tabs.create({ url: CONFIG.LOGIN_URL });
        sendResponse({ ok: true });
        return false;
      }

      case "CLEAR_SESSION": {
        SessionModule.clearSession()
          .then(() => sendResponse({ ok: true }))
          .catch((erro) => sendResponse({ ok: false, error: String(erro) }));
        return true;
      }

      case "RUN_AUTOMATION": {
        // Fluxo, nesta ordem:
        //  1. Valida quantidade/mensagem (regra de negócio, em
        //     shopee/automation.js — inalterada).
        //  2. Confirma que a aba ativa é o Seller Center (mesma
        //     checagem de CHECK_CURRENT_PAGE, reaproveitada aqui
        //     como defesa extra — o popup já não deixa clicar em
        //     "Executar" fora da Shopee, mas o background não deve
        //     confiar cegamente nisso).
        //  3. Grava quantidade/mensagem no storage — é assim que o
        //     content script (injetado via "files", sem suporte a
        //     argumentos diretos) recebe os parâmetros desta execução.
        //  4. SÓ ENTÃO injeta os scripts de leitura/resposta na aba
        //     — nada roda antes disso, nada roda automaticamente.
        (async () => {
          try {
            const sessao = await SessionModule.getSession();
            const resultadoValidacao = await ShopeeAutomation.executarAutomacao({
              quantidade: message.payload?.quantidade,
              mensagem: message.payload?.mensagem,
              token: sessao.token,
            });

            if (!resultadoValidacao.ok) {
              sendResponse({ ok: true, resultado: resultadoValidacao });
              return;
            }

            const abas = await chrome.tabs.query({ active: true, currentWindow: true });
            const abaAtiva = abas && abas[0];

            if (!abaAtiva?.id || !ShopeePageDetector.isSellerCenterUrl(abaAtiva.url)) {
              logger.warn("RUN_AUTOMATION recusado: aba ativa não é o Seller Center.", abaAtiva?.url);
              sendResponse({
                ok: true,
                resultado: { ok: false, message: "A aba ativa não é o Seller Center da Shopee." },
              });
              return;
            }

            await StorageModule.setItem(CONFIG.STORAGE_KEYS.RUN_PARAMS, {
              quantidade: message.payload?.quantidade,
              mensagem: message.payload?.mensagem,
            });

            logger.log("Injetando o fluxo de resposta na aba ativa (só agora, por causa do clique em Executar).");

            await chrome.scripting.executeScript({
              target: { tabId: abaAtiva.id },
              files: [
                "src/core/config.js",
                "src/utils/logger.js",
                "src/utils/flowLogger.js",
                "src/utils/domEvents.js",
                "src/storage/storage.js",
                "src/shopee/selectors.js",
                "src/shopee/executionStateMachine.js",
                "src/content/responderFlow.js",
              ],
            });

            sendResponse({
              ok: true,
              resultado: { ok: true, message: "Execução iniciada na aba ativa." },
            });
          } catch (erro) {
            logger.error("Erro ao executar RUN_AUTOMATION:", erro);
            sendResponse({ ok: false, error: String(erro) });
          }
        })();
        return true;
      }

      case "CHECK_CURRENT_PAGE": {
        chrome.tabs.query({ active: true, currentWindow: true }, (abas) => {
          const abaAtiva = abas && abas[0];
          const url = abaAtiva?.url || null;
          const isSellerCenter = ShopeePageDetector.isSellerCenterUrl(url);

          sendResponse({ ok: true, isSellerCenter, url });
        });
        return true; // sendResponse é chamado dentro do callback assíncrono
      }

      case "STOP_AUTOMATION": {
        // Quem sabe cancelar de verdade é o responderFlow.js rodando
        // na aba (só ele tem acesso aos timers/destaques/lista em
        // memória daquela execução) — o background só repassa o pedido.
        (async () => {
          try {
            const abas = await chrome.tabs.query({ active: true, currentWindow: true });
            const abaAtiva = abas && abas[0];

            if (!abaAtiva?.id) {
              sendResponse({ ok: true, resultado: { ok: true, message: "Nada em execução." } });
              return;
            }

            chrome.tabs.sendMessage(abaAtiva.id, { type: "STOP_AUTOMATION" }, (resposta) => {
              // Se não havia nenhum responderFlow.js rodando/escutando
              // naquela aba, o Chrome seta lastError ("Could not
              // establish connection..."). Isso é esperado quando não
              // há nada para parar — não é uma falha real, só lemos
              // o erro para o Chrome não logar um aviso não tratado.
              const semExecucaoAtiva = Boolean(chrome.runtime.lastError);

              sendResponse({
                ok: true,
                resultado: semExecucaoAtiva
                  ? { ok: true, message: "Nada em execução." }
                  : resposta || { ok: true, message: "Execução interrompida." },
              });
            });
          } catch (erro) {
            logger.error("Erro ao processar STOP_AUTOMATION:", erro);
            sendResponse({ ok: false, error: String(erro) });
          }
        })();
        return true;
      }

      default:
        return false;
    }
  });

  /**
   * Mensagens vindas de FORA da extensão — do site do SaaS
   * (declarado em "externally_connectable" no manifest).
   *
   * Dois tipos de mensagem são aceitos nesta etapa:
   *
   *  - "SESSION_UPDATED": "campainha" para o cenário com backend
   *    real (futuro). O site só avisa que algo mudou; o token
   *    em si é sempre buscado pela própria extensão em
   *    checkSessionWithBackend() — o site nunca envia o token
   *    por aqui nesse fluxo.
   *
   *  - "FAKE_LOGIN": usado AGORA, enquanto não existe backend.
   *    O site simula um login e já manda os dados fictícios
   *    prontos (token/plano/validade). A extensão só salva —
   *    não há validação real nenhuma nesta etapa.
   */
  chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
    const origemAutorizada =
      typeof sender.origin === "string" && sender.origin.startsWith(CONFIG.SITE_BASE_URL);

    logger.log(`Mensagem externa recebida (${message?.type}) de`, sender.origin);

    if (!origemAutorizada) {
      logger.warn("Mensagem externa recusada — origem não autorizada:", sender.origin);
      sendResponse({ ok: false, error: "Origem não autorizada." });
      return false;
    }

    if (message?.type === "SESSION_UPDATED") {
      SessionModule.checkSessionWithBackend()
        .then((session) => sendResponse({ ok: true, session }))
        .catch((erro) => sendResponse({ ok: false, error: String(erro) }));
      return true;
    }

    if (message?.type === "FAKE_LOGIN") {
      SessionModule.activateFakeSession(message.payload)
        .then((session) => sendResponse({ ok: true, session }))
        .catch((erro) => sendResponse({ ok: false, error: String(erro) }));
      return true;
    }

    return false;
  });
})();
