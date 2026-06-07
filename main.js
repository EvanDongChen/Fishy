const path = require("path");
const { app, BrowserWindow, ipcMain, screen } = require("electron");

let petWindow;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

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

    const bounds = petWindow.getBounds();
    const currentX = bounds.x;
    const currentY = bounds.y;
    const nextX = currentX + Math.round(delta.dx);
    const nextY = currentY + Math.round(delta.dy);

    const display = screen.getDisplayNearestPoint({
      x: nextX + Math.round(bounds.width / 2),
      y: nextY + Math.round(bounds.height / 2)
    });

    const area = display.workArea;
    const minX = area.x;
    const maxX = area.x + area.width - bounds.width;
    const minY = area.y;
    const maxY = area.y + area.height - bounds.height;

    petWindow.setPosition(
      clamp(nextX, minX, maxX),
      clamp(nextY, minY, maxY)
    );
  });

  ipcMain.handle("pet:get-swim-state", () => {
    if (!petWindow) {
      return null;
    }

    const cursor = screen.getCursorScreenPoint();
    const bounds = petWindow.getBounds();
    const display = screen.getDisplayNearestPoint(cursor);

    return {
      cursor,
      bounds,
      workArea: display.workArea
    };
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
