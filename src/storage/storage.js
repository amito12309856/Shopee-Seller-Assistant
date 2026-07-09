/**
 * storage/storage.js
 * ---------------------------------------------------------
 * Camada: STORAGE (persistência genérica)
 * Depende de: nada (só da API chrome.storage).
 * Pode ser usado por: auth/, ui/, e futuramente shopee/.
 *
 * Encapsula chrome.storage.local em Promises simples. Nenhum
 * outro arquivo do projeto deve chamar chrome.storage.local
 * diretamente — todos passam por aqui. Vantagens:
 *  - Tratamento de erro (chrome.runtime.lastError) em um único
 *    lugar, em vez de repetido em cada callback.
 *  - Se um dia trocarmos para chrome.storage.sync (ou IndexedDB
 *    para dados maiores), só este arquivo muda.
 * ---------------------------------------------------------
 */

(function () {
  /**
   * Lê um valor salvo.
   * @param {string} key
   * @returns {Promise<any>} valor salvo, ou undefined se não existir
   */
  function getItem(key) {
    return new Promise((resolve, reject) => {
      chrome.storage.local.get([key], (result) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
          return;
        }
        resolve(result[key]);
      });
    });
  }

  /**
   * Salva um valor.
   * @param {string} key
   * @param {any} value
   * @returns {Promise<void>}
   */
  function setItem(key, value) {
    return new Promise((resolve, reject) => {
      chrome.storage.local.set({ [key]: value }, () => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
          return;
        }
        resolve();
      });
    });
  }

  /**
   * Remove um valor salvo.
   * @param {string} key
   * @returns {Promise<void>}
   */
  function removeItem(key) {
    return new Promise((resolve, reject) => {
      chrome.storage.local.remove([key], () => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
          return;
        }
        resolve();
      });
    });
  }

  globalThis.StorageModule = { getItem, setItem, removeItem };
})();
