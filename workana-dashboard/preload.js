const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  // Controles da janela
  minimize: () => ipcRenderer.send("win:minimize"),
  maximize: () => ipcRenderer.send("win:maximize"),
  close: () => ipcRenderer.send("win:close"),

  // Login Workana
  abrirLogin: () => ipcRenderer.send("workana:abrir-login"),

  // Scraping manual (botão SYNC NOW)
  iniciarScraping: () => ipcRenderer.invoke("workana:iniciar-scraping"),

  // Abre projeto no browser Electron com sessão logada
  abrirProjeto: (url) => ipcRenderer.send("workana:abrir-projeto", url),

  // Ouve quando a sessão foi capturada com sucesso pelo Electron
  onSessaoCapturada: (callback) =>
    ipcRenderer.on("workana:sessao-capturada", (_, dados) => callback(dados)),

  // Abre janela Workana com proposta pré-preenchida
  preencherProposta: (url, texto) =>
    ipcRenderer.send("workana:preencher-proposta", { url, texto }),
});
