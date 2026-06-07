const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("petApi", {
  moveBy: (dx, dy) => ipcRenderer.send("pet:move", { dx, dy }),
  setClickThrough: (ignore) => ipcRenderer.send("pet:toggle-click-through", ignore),
  getSwimState: () => ipcRenderer.invoke("pet:get-swim-state"),
  onGlobalTyping: (callback) => {
    const handler = () => callback();
    ipcRenderer.on("pet:global-typing", handler);
    return () => ipcRenderer.removeListener("pet:global-typing", handler);
  }
});
