const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("petApi", {
  moveBy: (dx, dy) => ipcRenderer.send("pet:move", { dx, dy }),
  setClickThrough: (ignore) => ipcRenderer.send("pet:toggle-click-through", ignore),
  getSwimState: () => ipcRenderer.invoke("pet:get-swim-state"),
  getMonitors: () => ipcRenderer.invoke("pet:get-monitors"),
  setPreferredMonitor: (id) => ipcRenderer.send("pet:set-preferred-monitor", id),
  setSettingsOpen: (open) => ipcRenderer.send("pet:set-settings-open", open),
  setChatOpen: (open) => ipcRenderer.send("pet:set-chat-open", open),
  setWindowSize: (size) => ipcRenderer.send("pet:set-window-size", size),
  onActiveWindow: (callback) => {
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on("pet:active-window", handler);
    return () => ipcRenderer.removeListener("pet:active-window", handler);
  },
  onGlobalTyping: (callback) => {
    const handler = () => callback();
    ipcRenderer.on("pet:global-typing", handler);
    return () => ipcRenderer.removeListener("pet:global-typing", handler);
  }
});
