const path = require("path");
const { app, BrowserWindow, ipcMain, screen } = require("electron");
const { uIOhook } = require("uiohook-napi");

let petWindow;
let lastTypingPulseAt = 0;
let preferredDisplayId = null;
let stopActiveWindowPolling = null;
const COMPACT_WINDOW_SIZE = { width: 180, height: 180 };
const MAX_DYNAMIC_WINDOW_SIZE = { width: 560, height: 520 };
let requestedWindowSize = {
  width: COMPACT_WINDOW_SIZE.width,
  height: COMPACT_WINDOW_SIZE.height
};

function getPreferredDisplay() {
  const displays = screen.getAllDisplays();
  if (preferredDisplayId === null) {
    return screen.getPrimaryDisplay();
  }

  const preferred = displays.find((display) => display.id === preferredDisplayId);
  return preferred || screen.getPrimaryDisplay();
}

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

async function setupActiveWindowPolling() {
  let activeWinFn;
  try {
    const mod = await import("active-win");
    activeWinFn = mod.default;
  } catch {
    return;
  }

  if (typeof activeWinFn !== "function") {
    return;
  }

  let lastWindowKey = "";
  const timer = setInterval(async () => {
    if (!petWindow || petWindow.isDestroyed()) {
      return;
    }

    try {
      const info = await activeWinFn();
      if (!info || !info.title) {
        return;
      }

      const appName = info.owner?.name || "";
      const title = info.title || "";

      // Ignore our own window to avoid self-comment loops.
      if (title === "Fishy Pet") {
        return;
      }

      const key = `${appName}::${title}`;
      if (key === lastWindowKey) {
        return;
      }

      lastWindowKey = key;
      petWindow.webContents.send("pet:active-window", {
        appName,
        title
      });
    } catch {
      // Ignore transient active window detection errors.
    }
  }, 1500);

  stopActiveWindowPolling = () => clearInterval(timer);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function createPetWindow() {
  const display = getPreferredDisplay();
  const margin = 24;
  const x = Math.max(0, display.workArea.x + margin);
  const y = Math.max(0, display.workArea.y + display.workArea.height - COMPACT_WINDOW_SIZE.height - margin);

  petWindow = new BrowserWindow({
    width: COMPACT_WINDOW_SIZE.width,
    height: COMPACT_WINDOW_SIZE.height,
    x,
    y,
    frame: false,
    transparent: true,
    hasShadow: false,
    roundedCorners: false,
    skipTaskbar: true,
    resizable: false,
    alwaysOnTop: true,
    fullscreenable: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js")
    }
  });

  petWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  petWindow.setAlwaysOnTop(true, "screen-saver");
  petWindow.loadFile("pet.html");
  petWindow.once("ready-to-show", () => {
    if (!petWindow || petWindow.isDestroyed()) {
      return;
    }

    petWindow.showInactive();
  });
}

function getTargetWindowSize() {
  return {
    width: clamp(
      Math.round(requestedWindowSize.width),
      COMPACT_WINDOW_SIZE.width,
      MAX_DYNAMIC_WINDOW_SIZE.width
    ),
    height: clamp(
      Math.round(requestedWindowSize.height),
      COMPACT_WINDOW_SIZE.height,
      MAX_DYNAMIC_WINDOW_SIZE.height
    )
  };
}

function applyTargetWindowSize() {
  if (!petWindow || petWindow.isDestroyed()) {
    return;
  }

  const target = getTargetWindowSize();
  const current = petWindow.getBounds();
  if (current.width === target.width && current.height === target.height) {
    return;
  }

  const area = getPreferredDisplay().workArea;
  const bottom = current.y + current.height;
  const desiredX = current.x;
  const desiredY = bottom - target.height;

  const minX = area.x;
  const maxX = area.x + area.width - target.width;
  const minY = area.y;
  const maxY = area.y + area.height - target.height;

  petWindow.setBounds({
    x: clamp(desiredX, minX, maxX),
    y: clamp(desiredY, minY, maxY),
    width: target.width,
    height: target.height
  }, false);
}

function setSettingsWindowOpen(isOpen) {
  // Renderer now drives exact size; this remains for backward compatibility.
  if (typeof isOpen !== "boolean") {
    return;
  }
}

function setChatWindowOpen(isOpen) {
  // Renderer now drives exact size; this remains for backward compatibility.
  if (typeof isOpen !== "boolean") {
    return;
  }
}

function setRequestedWindowSize(payload) {
  if (!payload || typeof payload !== "object") {
    return;
  }

  const width = Number(payload.width);
  const height = Number(payload.height);
  if (!Number.isFinite(width) || !Number.isFinite(height)) {
    return;
  }

  const snappedWidth = Math.ceil(width / 8) * 8;
  const snappedHeight = Math.ceil(height / 8) * 8;

  requestedWindowSize = {
    width: snappedWidth,
    height: snappedHeight
  };
  applyTargetWindowSize();
}

app.whenReady().then(() => {
  createPetWindow();
  setupGlobalTypingHook();
  setupActiveWindowPolling();

  ipcMain.on("pet:move", (_event, delta) => {
    if (!petWindow) {
      return;
    }

    const bounds = petWindow.getBounds();
    const currentX = bounds.x;
    const currentY = bounds.y;
    const nextX = currentX + Math.round(delta.dx);
    const nextY = currentY + Math.round(delta.dy);

    const area = getPreferredDisplay().workArea;
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
    const display = getPreferredDisplay();

    return {
      cursor,
      bounds,
      workArea: display.workArea
    };
  });

  ipcMain.handle("pet:get-monitors", () => {
    const displays = screen.getAllDisplays();
    const primary = screen.getPrimaryDisplay();

    return displays.map((display) => ({
      id: display.id,
      label: `${display.id === primary.id ? "Primary" : "Display"} ${display.id} (${display.workArea.width}x${display.workArea.height})`
    }));
  });

  ipcMain.on("pet:set-preferred-monitor", (_event, id) => {
    if (typeof id !== "number") {
      return;
    }

    preferredDisplayId = id;
  });

  ipcMain.on("pet:set-settings-open", (_event, isOpen) => {
    setSettingsWindowOpen(Boolean(isOpen));
  });

  ipcMain.on("pet:set-chat-open", (_event, isOpen) => {
    setChatWindowOpen(Boolean(isOpen));
  });

  ipcMain.on("pet:set-window-size", (_event, size) => {
    setRequestedWindowSize(size);
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
  if (typeof stopActiveWindowPolling === "function") {
    stopActiveWindowPolling();
  }

  try {
    uIOhook.stop();
  } catch {
    // Ignore stop failures during shutdown.
  }
  app.quit();
});
