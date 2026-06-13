const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("lorekeeperDesktop", {
  runtimeMode: () => ipcRenderer.invoke("lorekeeper:runtime-mode"),
  relaunchMode: (mode) => ipcRenderer.invoke("lorekeeper:relaunch-mode", mode),
});
