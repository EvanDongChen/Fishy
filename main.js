const path = require("path");
const { app, BrowserWindow, ipcMain, screen } = require("electron");

let petWindow;

function createPetWindow() {
  const display = screen.getPrimaryDisplay();
  const size = 180;
  const margin = 24;
  const x = Math.max(0, display.workArea.x + display.workArea.width - size - margin);
  const y = Math.max(0, display.workArea.y + display.workArea.height - size - margin);

  petWindow = new BrowserWindow({
    width: size,
    height: size,
    x,
    y,
    frame: false,
    transparent: true,
    hasShadow: false,
    skipTaskbar: true,
    resizable: false,
    alwaysOnTop: true,
    fullscreenable: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js")
    }
  });

  petWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  petWindow.setAlwaysOnTop(true, "screen-saver");
  petWindow.loadFile("pet.html");
}

app.whenReady().then(() => {
  createPetWindow();

  ipcMain.on("pet:move", (_event, delta) => {
    if (!petWindow) {
      return;
    }

    const [x, y] = petWindow.getPosition();
    petWindow.setPosition(x + delta.dx, y + delta.dy);
  });

  ipcMain.on("pet:toggle-click-through", (_event, ignore) => {
    if (!petWindow) {
      return;
    }

    // Keep receiving mouse move events so hover state can turn this off again.
    petWindow.setIgnoreMouseEvents(Boolean(ignore), { forward: true });
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createPetWindow();
    }
  });
});

app.on("window-all-closed", () => {
  app.quit();
});
