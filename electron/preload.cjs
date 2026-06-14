const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("lorekeeperDesktop", {
  runtimeMode: () => ipcRenderer.invoke("lorekeeper:runtime-mode"),
  relaunchMode: (mode) => ipcRenderer.invoke("lorekeeper:relaunch-mode", mode),
  writeClipboardText: (text) => ipcRenderer.invoke("lorekeeper:clipboard-write-text", text),
});
