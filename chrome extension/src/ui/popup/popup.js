/**
 * ui/popup/popup.js
 * ---------------------------------------------------------
 * Camada: UI (única camada com interface visual)
 * Depende de: core/, storage/, auth/ (via mensagens ao background)
 *
 * O popup NÃO fala diretamente com o backend. Ele pede para o
 * background.js fazer isso (via chrome.runtime.sendMessage),
 * mantendo toda a regra de autenticação centralizada em auth/.
 *
 * Fluxo:
 *  1. Ao abrir, mostra o último estado de sessão conhecido
 *     (cache local) para não piscar uma tela vazia.
 *  2. Em paralelo, pede ao background para revalidar a sessão.
 *  3. Se autenticado → libera a seção de Configurações.
 *     Se não → mostra botão "Abrir login no site".
 *  4. "Executar" continua sem automação real — só loga no
 *     console os dados que futuramente serão enviados ao
 *     backend/automação (shopee/) junto com o token de sessão.
 *
 * Todo o conteúdo fica dentro de uma IIFE: popup.html carrega
 * vários arquivos <script> (config.js, logger.js, storage.js,
 * sessionApi.js, session.js, popup.js) que compartilham o MESMO
 * escopo global do documento. Sem isolar em uma função, um
 * "const logger" aqui colidiria com o "const logger" de
 * auth/session.js.
 * ---------------------------------------------------------
 */

(function () {
  const logger = Logger.createLogger("Popup");

  // ----- Elementos: Sessão -----
  const sessionBadge = document.getElementById("sessionBadge");
  const sessionInfo = document.getElementById("sessionInfo");
  const btnAbrirLogin = document.getElementById("btnAbrirLogin");
  const btnRecheckSession = document.getElementById("btnRecheckSession");
  const btnSair = document.getElementById("btnSair");

  // ----- Elementos: Configurações -----
  const settingsSection = document.getElementById("settingsSection");
  const quantidadeInput = document.getElementById("quantidade");
  const mensagemInput = document.getElementById("mensagem");
  const btnSalvar = document.getElementById("btnSalvar");
  const btnExecutar = document.getElementById("btnExecutar");
  const btnParar = document.getElementById("btnParar");
  const statusEl = document.getElementById("status");
  const pageWarningEl = document.getElementById("pageWarning");

  const { STATUS } = SessionModule;

  /**
   * Exibe uma mensagem temporária em um elemento de status qualquer.
   */
  function mostrarMensagem(elemento, texto, tipo = "success") {
    elemento.textContent = texto;
    elemento.style.color = tipo === "error" ? "var(--color-error)" : "var(--color-success)";

    setTimeout(() => {
      elemento.textContent = "";
    }, 2500);
  }

  /**
   * Envia uma mensagem para o background.js e retorna a resposta
   * como Promise (chrome.runtime.sendMessage usa callback nativamente).
   */
  function enviarParaBackground(mensagem) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(mensagem, (resposta) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
          return;
        }
        resolve(resposta);
      });
    });
  }

  /**
   * Atualiza o badge visual de acordo com o status da sessão.
   */
  function atualizarBadge(status) {
    const textos = {
      [STATUS.UNKNOWN]: "Não conectado",
      [STATUS.CHECKING]: "Verificando...",
      [STATUS.AUTHENTICATED]: "Conectado",
      [STATUS.UNAUTHENTICATED]: "Não conectado",
      [STATUS.ERROR]: "Erro ao verificar",
    };

    const classes = {
      [STATUS.UNKNOWN]: "badge-inactive",
      [STATUS.CHECKING]: "badge-checking",
      [STATUS.AUTHENTICATED]: "badge-valid",
      [STATUS.UNAUTHENTICATED]: "badge-inactive",
      [STATUS.ERROR]: "badge-invalid",
    };

    sessionBadge.textContent = textos[status] || textos[STATUS.UNKNOWN];
    sessionBadge.className = `badge ${classes[status] || classes[STATUS.UNKNOWN]}`;
  }

  // Estado local só para decidir se "Executar" pode ficar habilitado —
  // depende de DUAS condições independentes: estar autenticado E estar
  // na aba certa (Seller Center da Shopee).
  let estaAutenticado = false;
  let paginaEhSellerCenter = false;

  /**
   * Liga/desliga o bloqueio visual e funcional da seção de Configurações.
   * "Executar" não é decidido aqui — ver atualizarBotaoExecutar().
   */
  function definirAcessoConfiguracoes(desbloqueado) {
    settingsSection.classList.toggle("disabled", !desbloqueado);
    btnSalvar.disabled = !desbloqueado;
  }

  /**
   * "Executar" só fica habilitado com sessão autenticada E na aba
   * certa. O aviso de página só faz sentido mostrar quando autenticado
   * (sem sessão, a seção inteira já aparece bloqueada/borrada).
   */
  function atualizarBotaoExecutar() {
    btnExecutar.disabled = !(estaAutenticado && paginaEhSellerCenter);
    pageWarningEl.classList.toggle("hidden", !estaAutenticado || paginaEhSellerCenter);
  }

  /**
   * Aplica na UI o estado atual da sessão (badge, botões, bloqueio).
   */
  function renderizarEstadoSessao(sessao) {
    atualizarBadge(sessao.status);

    estaAutenticado = sessao.status === STATUS.AUTHENTICATED;
    definirAcessoConfiguracoes(estaAutenticado);
    atualizarBotaoExecutar();

    btnAbrirLogin.classList.toggle("hidden", estaAutenticado);
    btnRecheckSession.classList.toggle("hidden", estaAutenticado);
    // "Sair" fica sempre visível: é um utilitário de reset local,
    // útil em qualquer estado (inclusive para forçar um novo teste
    // do fluxo fictício sem precisar mexer no chrome://extensions).
    btnSair.classList.remove("hidden");

    if (estaAutenticado) {
      const plano = sessao.plan ? `Plano: ${sessao.plan}` : "Sessão autenticada";
      sessionInfo.textContent = `${plano} — verificado às ${new Date(sessao.checkedAt).toLocaleTimeString("pt-BR")}`;
    } else if (sessao.status === STATUS.ERROR) {
      sessionInfo.textContent = "Não foi possível falar com o servidor. Verifique sua conexão.";
    } else {
      sessionInfo.textContent = "Faça login no site para liberar a automação.";
    }
  }

  /**
   * Recarrega o estado da sessão a partir do cache local.
   *
   * ⚠️ Nesta etapa (sem backend) esta função NÃO chama
   * CHECK_SESSION/checkSessionWithBackend(). Se chamasse, e o
   * usuário tivesse acabado de logar no site (sessão fictícia
   * já salva via FAKE_LOGIN), essa tentativa de falar com um
   * backend que não existe FALHARIA e sobrescreveria a sessão
   * fictícia boa com um estado de erro — apagando o login que
   * tinha acabado de funcionar. Por isso, por enquanto, "Verificar
   * novamente" só relê o que já está salvo (útil, por exemplo,
   * depois de corrigir o EXTENSION_ID no site e logar de novo).
   *
   * Quando o backend real existir, é aqui que voltamos a chamar
   * enviarParaBackground({ type: "CHECK_SESSION" }).
   */
  async function verificarSessao() {
    atualizarBadge(STATUS.CHECKING);

    const sessao = await SessionModule.getSession();
    renderizarEstadoSessao(sessao);
    await verificarPaginaAtual();
  }

  /**
   * Pede ao background para abrir a página de login do site.
   */
  async function abrirLogin() {
    try {
      await enviarParaBackground({ type: "OPEN_LOGIN" });
    } catch (erro) {
      logger.error("Erro ao abrir login:", erro);
    }
  }

  /**
   * Pergunta ao background se a aba ativa é o Seller Center da
   * Shopee, e atualiza o aviso/bloqueio do botão "Executar".
   *
   * Não faz nenhuma automação — só leitura da URL da aba (feita no
   * background, que já tem a permissão "tabs") e uma checagem de
   * padrão de host em shopee/pageDetector.js.
   */
  async function verificarPaginaAtual() {
    try {
      const resposta = await enviarParaBackground({ type: "CHECK_CURRENT_PAGE" });

      if (!resposta?.ok) {
        throw new Error(resposta?.error || "Falha ao verificar a página atual.");
      }

      paginaEhSellerCenter = Boolean(resposta.isSellerCenter);
      logger.log(
        paginaEhSellerCenter
          ? "Aba atual é o Seller Center da Shopee."
          : `Aba atual não é o Seller Center da Shopee (${resposta.url || "URL desconhecida"}).`
      );
    } catch (erro) {
      logger.error("Erro ao verificar a página atual:", erro);
      paginaEhSellerCenter = false;
    }

    atualizarBotaoExecutar();
  }

  /**
   * Limpa a sessão local (não afeta o cookie do site — apenas o
   * cache da extensão, forçando uma nova verificação).
   */
  async function sair() {
    try {
      await enviarParaBackground({ type: "CLEAR_SESSION" });
      renderizarEstadoSessao({ status: STATUS.UNAUTHENTICATED, checkedAt: Date.now() });
    } catch (erro) {
      logger.error("Erro ao limpar sessão:", erro);
    }
  }

  // ---------------------------------------------------------
  // Configurações (quantidade / mensagem)
  // Usa StorageModule (src/storage/storage.js) em vez de chamar
  // chrome.storage.local diretamente.
  // ---------------------------------------------------------

  async function carregarConfiguracoes() {
    const config = await StorageModule.getItem(CONFIG.STORAGE_KEYS.SETTINGS);

    if (config) {
      quantidadeInput.value = config.quantidade ?? "";
      mensagemInput.value = config.mensagem || "";
    }
  }

  async function salvarConfiguracoes() {
    const config = {
      quantidade: quantidadeInput.value,
      mensagem: mensagemInput.value.trim(),
    };

    try {
      await StorageModule.setItem(CONFIG.STORAGE_KEYS.SETTINGS, config);
      mostrarMensagem(statusEl, "Configurações salvas com sucesso!");
    } catch (erro) {
      logger.error("Erro ao salvar configurações:", erro);
      mostrarMensagem(statusEl, "Erro ao salvar configurações.", "error");
    }
  }

  /**
   * Aciona a automação (ainda placeholder) através do background.
   *
   * O popup NÃO monta o "log de execução" sozinho nem lê o token
   * de sessão diretamente — ele só manda quantidade/mensagem e
   * deixa o background.js buscar o token e repassar para
   * shopee/automation.js. Isso é o mesmo princípio já usado para
   * sessão: a UI pede, o background decide, a camada de negócio
   * (auth/ ou shopee/) executa.
   */
  async function executar() {
    btnExecutar.disabled = true;

    try {
      const resposta = await enviarParaBackground({
        type: "RUN_AUTOMATION",
        payload: {
          quantidade: quantidadeInput.value,
          mensagem: mensagemInput.value.trim(),
        },
      });

      if (!resposta?.ok) {
        throw new Error(resposta?.error || "Falha ao executar.");
      }

      const tipo = resposta.resultado?.ok ? "success" : "error";
      mostrarMensagem(statusEl, resposta.resultado?.message || "Executado.", tipo);
    } catch (erro) {
      logger.error("Erro ao executar:", erro);
      mostrarMensagem(statusEl, "Erro ao executar. Veja o console.", "error");
    } finally {
      atualizarBotaoExecutar();
    }
  }

  /**
   * Aciona o cancelamento através do background, que repassa para o
   * content script rodando na aba (só ele consegue de fato limpar
   * destaques/timers/lista em memória daquela execução).
   *
   * Funciona mesmo se nada estiver em execução — nesse caso, o
   * background só informa "Nada em execução." e não é tratado como erro.
   */
  async function parar() {
    btnParar.disabled = true;

    try {
      const resposta = await enviarParaBackground({ type: "STOP_AUTOMATION" });

      if (!resposta?.ok) {
        throw new Error(resposta?.error || "Falha ao parar.");
      }

      mostrarMensagem(statusEl, resposta.resultado?.message || "Parado.");
    } catch (erro) {
      logger.error("Erro ao parar:", erro);
      mostrarMensagem(statusEl, "Erro ao parar. Veja o console.", "error");
    } finally {
      btnParar.disabled = false;
    }
  }

  // ---------------------------------------------------------
  // Inicialização
  // ---------------------------------------------------------
  //
  // ⚠️ Nesta etapa (sem backend), a inicialização confia SÓ na
  // sessão fictícia salva localmente — a mesma que o site grava
  // via background.js quando recebe "FAKE_LOGIN" (ver
  // shopee-saas-site/index.html). Por isso NÃO chamamos
  // verificarSessao() automaticamente aqui: ela tentaria falar
  // com um backend que ainda não existe e sobrescreveria a
  // sessão fictícia com um estado de erro a cada vez que o
  // popup fosse aberto. O botão "Verificar novamente" continua
  // disponível para quando o backend real existir.
  //
  // ⚠️ IMPORTANTE: NÃO chamamos abrirLogin() automaticamente
  // aqui. chrome.tabs.create() muda o foco para a nova aba, e um
  // popup de extensão FECHA SOZINHO assim que perde o foco — ou
  // seja, abrir a aba automaticamente faria o popup se fechar
  // antes do usuário conseguir ver ou clicar em qualquer coisa
  // nele. Por isso a abertura do login continua sendo sempre uma
  // ação explícita do clique em "Abrir login no site".

  async function inicializar() {
    const sessaoCache = await SessionModule.getSession();
    renderizarEstadoSessao(sessaoCache);

    await carregarConfiguracoes();
    await verificarPaginaAtual();

    if (sessaoCache.status === STATUS.AUTHENTICATED) {
      logger.log("Sessão simulada encontrada — mostrando painel normalmente.");
    } else {
      logger.log("Nenhuma sessão simulada encontrada — aguardando clique em 'Abrir login no site'.");
    }
  }

  document.addEventListener("DOMContentLoaded", inicializar);

  btnAbrirLogin.addEventListener("click", abrirLogin);
  btnRecheckSession.addEventListener("click", verificarSessao);
  btnSair.addEventListener("click", sair);
  btnSalvar.addEventListener("click", salvarConfiguracoes);
  btnExecutar.addEventListener("click", executar);
  btnParar.addEventListener("click", parar);
})();
