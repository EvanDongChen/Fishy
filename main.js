const path = require("path");
const { app, BrowserWindow, ipcMain, screen } = require("electron");
const { uIOhook } = require("uiohook-napi");

let petWindow;
let lastTypingPulseAt = 0;

function isTypingLikeKeycode(keycode) {
  // Exclude common modifiers and lock/function/navigation keys.
  const blocked = new Set([
    29, // Ctrl (left)
    3613, // Ctrl (right)
    56, // Alt (left)
    3640, // Alt (right)
    3675, // Meta (left)
    3676, // Meta (right)
    42, // Shift (left)
    54, // Shift (right)
    58, // Caps Lock
    3653, // Num Lock
    3657, // Scroll Lock
    1, // Escape
    14, // Backspace (handled as typing only in text contexts, still allow)
    15, // Tab (handled as typing only in text contexts, still allow)
    59, 60, 61, 62, 63, 64, 65, 66, 67, 68, 87, 88, // F1-F12
    57416, 57424, 57419, 57421, // Arrows
    57414, 57415, 3655, 57436, 57439 // Home/End/PgUp/PgDn/Insert/Delete
  ]);

  if (blocked.has(keycode)) {
    return false;
  }

  return true;
}

function sendTypingPulse() {
  if (!petWindow || petWindow.isDestroyed()) {
    return;
  }

  const now = Date.now();
  if (now - lastTypingPulseAt < 24) {
    return;
  }

  lastTypingPulseAt = now;
  petWindow.webContents.send("pet:global-typing");
}

function setupGlobalTypingHook() {
  uIOhook.on("keydown", (event) => {
    if (!isTypingLikeKeycode(event.keycode)) {
      return;
    }

    sendTypingPulse();
  });

  uIOhook.start();
}

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
  setupGlobalTypingHook();

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
  try {
    uIOhook.stop();
  } catch {
    // Ignore stop failures during shutdown.
  }
  app.quit();
});
