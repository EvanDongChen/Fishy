const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("petApi", {
  moveBy: (dx, dy) => ipcRenderer.send("pet:move", { dx, dy }),
  setClickThrough: (ignore) => ipcRenderer.send("pet:toggle-click-through", ignore)
});
