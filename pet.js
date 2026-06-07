const pet = document.getElementById("pet");
const stage = document.getElementById("stage");
const fishLayer = document.querySelector(".fish-layered");
const eyeBase = document.querySelector(".eye-base");
const pupil = document.getElementById("pupil");
const heartsLayer = document.getElementById("hearts");
const bubblesLayer = document.getElementById("bubbles");
const typingLayer = document.getElementById("typing");
const emote = document.getElementById("emote");
const modeMenu = document.getElementById("mode-menu");
const settingsPanel = document.getElementById("settings-panel");
const speedInput = document.getElementById("setting-speed");
const petSensitivityInput = document.getElementById("setting-pet-sensitivity");
const heartAmountInput = document.getElementById("setting-heart-amount");
const bubbleAmountInput = document.getElementById("setting-bubble-amount");
const pupilSizeInput = document.getElementById("setting-pupil-size");
const monitorSelect = document.getElementById("setting-monitor");
const settingsCloseButton = document.getElementById("settings-close");

let dragging = false;
let lastX = 0;
let lastY = 0;
let swimPhase = 0;
let swimBusy = false;
let affection = 0;
let mood = "calm";
let lastInteractionAt = Date.now();
let lastPetX = null;
let lastPetY = null;
let roamTarget = null;
let roamPauseUntil = 0;
let pettingUntil = 0;
let pettingStrength = 0;
let wasPetting = false;
let facingHint = 1;
let petMode = "roam";
let isModeMenuOpen = false;
let pettingStrokeDistance = 0;
let pettingStrokeStartedAt = 0;
let pettingDirectionMask = 0;
let typingUntil = 0;
let pettingEmoteUntil = 0;
let chatUntil = 0;
let lastChatAt = 0;
let latestWindowInfo = null;
let lastSwimSpeed = 0;
let settings = {
  speed: 1,
  petSensitivity: 1,
  heartAmount: 1,
  bubbleAmount: 1,
  pupilSize: 1
};
const SETTINGS_KEY = "fishy.settings.v1";

const eyeGeometry = {
  centerXRatio: 0.687,
  centerYRatio: 0.442,
  radiusXRatio: 0.03,
  radiusYRatio: 0.045,
  pupilSizeRatio: 0.024
};

const eyeMask = {
  width: 0,
  height: 0,
  allowedCenters: [],
  centerX: 0,
  centerY: 0
};

const PETTING_HOLD_MS = 240;
const PETTING_EMOTE_HOLD_MS = 520;
const CHAT_HOLD_MS = 4200;
const CHAT_COOLDOWN_MS = 9000;
const PUPIL_CLAMP_RADIUS_SCALE = 0.75;
const TYPING_ACTIVE_MS = 260;
const PETTING_MIN_MOVE = 3.2;
const PETTING_STROKE_DISTANCE = 18;
const PETTING_STROKE_WINDOW_MS = 260;
const STARTUP_BOOT_MS = 260;
const MIN_WINDOW_WIDTH = 180;
const MIN_WINDOW_HEIGHT = 180;
const WINDOW_SIZE_PADDING = 16;
const WINDOW_SIZE_EPSILON = 6;
const DIR_LEFT = 1;
const DIR_RIGHT = 2;
const DIR_UP = 4;
const DIR_DOWN = 8;
let lastWindowSizeRequest = { width: 0, height: 0 };
let windowSizeMeasureQueued = false;

function countDirectionBits(mask) {
  let count = 0;
  let value = mask;
  while (value) {
    count += value & 1;
    value >>= 1;
  }
  return count;
}

function detectEyeCircleFromPng(imageElement) {
  if (!imageElement || !imageElement.naturalWidth || !imageElement.naturalHeight) {
    return;
  }

  const width = imageElement.naturalWidth;
  const height = imageElement.naturalHeight;

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) {
    return;
  }

  ctx.clearRect(0, 0, width, height);
  ctx.drawImage(imageElement, 0, 0, width, height);
  const data = ctx.getImageData(0, 0, width, height).data;

  const innerPixels = [];
  const opaquePixels = [];

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = (y * width + x) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      const a = data[idx + 3];

      if (a < 18) {
        continue;
      }

      opaquePixels.push({ x, y });
      const nearWhite = r > 210 && g > 210 && b > 210 && a > 210;
      if (nearWhite) {
        innerPixels.push({ x, y });
      }
    }
  }

  const candidates = innerPixels.length > 0 ? innerPixels : opaquePixels;
  if (candidates.length === 0) {
    return;
  }

  let sumX = 0;
  let sumY = 0;
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const p of candidates) {
    sumX += p.x;
    sumY += p.y;
    if (p.x < minX) {
      minX = p.x;
    }
    if (p.x > maxX) {
      maxX = p.x;
    }
    if (p.y < minY) {
      minY = p.y;
    }
    if (p.y > maxY) {
      maxY = p.y;
    }
  }

  const centerX = sumX / candidates.length;
  const centerY = sumY / candidates.length;

  const rawRadiusX = Math.max(1, Math.max(centerX - minX, maxX - centerX));
  const rawRadiusY = Math.max(1, Math.max(centerY - minY, maxY - centerY));
  const equivalentRadius = Math.sqrt(candidates.length / Math.PI);

  // Keep the pupil inside the detected circle/ellipse with a small inset.
  const safeRadiusX = Math.max(1, Math.min(rawRadiusX, equivalentRadius) - 0.8);
  const safeRadiusY = Math.max(1, Math.min(rawRadiusY, equivalentRadius) - 0.8);
  const pupilSize = Math.max(2, Math.min(safeRadiusX, safeRadiusY) * 0.52);

  const candidateSet = new Set();
  for (const p of candidates) {
    candidateSet.add(`${p.x},${p.y}`);
  }

  // Compute centers that keep the whole pupil disk inside the detected eye region.
  const radiusForMask = Math.max(1, Math.floor(pupilSize / 2));
  const allowedCenters = [];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let valid = true;
      for (let oy = -radiusForMask; oy <= radiusForMask && valid; oy += 1) {
        for (let ox = -radiusForMask; ox <= radiusForMask; ox += 1) {
          if (ox * ox + oy * oy > radiusForMask * radiusForMask) {
            continue;
          }
          const px = x + ox;
          const py = y + oy;
          if (px < 0 || py < 0 || px >= width || py >= height) {
            valid = false;
            break;
          }
          if (!candidateSet.has(`${px},${py}`)) {
            valid = false;
            break;
          }
        }
      }
      if (valid) {
        allowedCenters.push({ x, y });
      }
    }
  }

  eyeGeometry.centerXRatio = centerX / width;
  eyeGeometry.centerYRatio = centerY / height;
  eyeGeometry.radiusXRatio = safeRadiusX / width;
  eyeGeometry.radiusYRatio = safeRadiusY / height;
  eyeGeometry.pupilSizeRatio = pupilSize / width;

  eyeMask.width = width;
  eyeMask.height = height;
  eyeMask.allowedCenters = allowedCenters;
  eyeMask.centerX = centerX;
  eyeMask.centerY = centerY;

  if (fishLayer) {
    fishLayer.style.setProperty("--eye-center-x", `${(eyeGeometry.centerXRatio * 100).toFixed(3)}%`);
    fishLayer.style.setProperty("--eye-center-y", `${(eyeGeometry.centerYRatio * 100).toFixed(3)}%`);
    fishLayer.style.setProperty("--pupil-size", `${Math.max(2, Math.round(pupilSize * (pet ? (pet.clientWidth / width) : 1)))}px`);
  }
}

function setMood(nextMood) {
  if (!pet || mood === nextMood) {
    return;
  }

  mood = nextMood;
  pet.classList.remove("is-happy", "is-excited", "is-sleepy");

  if (nextMood === "happy") {
    pet.classList.add("is-happy");
    if (emote) {
      emote.dataset.kind = "mood";
      emote.textContent = "<3";
    }
    return;
  }

  if (nextMood === "excited") {
    pet.classList.add("is-excited");
    if (emote) {
      emote.dataset.kind = "mood";
      emote.textContent = "!!";
    }
    return;
  }

  if (nextMood === "sleepy") {
    pet.classList.add("is-sleepy");
    if (emote) {
      emote.dataset.kind = "mood";
      emote.textContent = "zzz";
    }
    return;
  }

  if (emote) {
    delete emote.dataset.kind;
    emote.textContent = "";
  }
}

function clearChatEmoteIfActive() {
  if (!emote || emote.dataset.kind !== "chat") {
    return;
  }

  delete emote.dataset.kind;
  emote.textContent = "";
  emote.style.left = "50%";
}

function spawnHeart(x, y) {
  if (!heartsLayer) {
    return;
  }

  const heart = document.createElement("div");
  heart.className = "heart";
  heart.style.left = `${x}px`;
  heart.style.top = `${y}px`;
  heart.style.setProperty("--drift-x", `${(Math.random() - 0.5) * 24}px`);
  heartsLayer.appendChild(heart);
  heart.addEventListener("animationend", () => heart.remove(), { once: true });
}

function spawnHeartsBurst(x, y) {
  const whole = Math.floor(settings.heartAmount);
  const fractional = settings.heartAmount - whole;
  const count = whole + (Math.random() < fractional ? 1 : 0);

  for (let i = 0; i < count; i += 1) {
    spawnHeart(x + (Math.random() - 0.5) * 10, y + (Math.random() - 0.5) * 8);
  }
}

function spawnBubble(options = {}) {
  // Bubbles are intentionally disabled.
  void options;
}

function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) {
      return;
    }

    const parsed = JSON.parse(raw);
    settings = {
      ...settings,
      ...parsed
    };
  } catch {
    // Ignore malformed settings and keep defaults.
  }
}

function saveSettings() {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

function applySettings() {
  if (pet) {
    pet.style.setProperty("--user-speed-mult", String(settings.speed));
  }
}

function clampSetting(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function syncSettingsInputs() {
  if (speedInput) speedInput.value = String(settings.speed);
  if (petSensitivityInput) petSensitivityInput.value = String(settings.petSensitivity);
  if (heartAmountInput) heartAmountInput.value = String(settings.heartAmount);
  if (bubbleAmountInput) bubbleAmountInput.value = String(settings.bubbleAmount);
  if (pupilSizeInput) pupilSizeInput.value = String(settings.pupilSize);
}

function isSettingsPanelOpen() {
  return Boolean(settingsPanel && settingsPanel.classList.contains("is-open"));
}

function openSettingsPanel() {
  if (!settingsPanel) {
    return;
  }

  settingsPanel.classList.add("is-open");
  settingsPanel.setAttribute("aria-hidden", "false");
  closeModeMenu();
  if (window.petApi && typeof window.petApi.setSettingsOpen === "function") {
    window.petApi.setSettingsOpen(true);
  }
  window.petApi.setClickThrough(false);
  scheduleWindowSizeSync();
}

function closeSettingsPanel() {
  if (!settingsPanel) {
    return;
  }

  settingsPanel.classList.remove("is-open");
  settingsPanel.setAttribute("aria-hidden", "true");
  if (window.petApi && typeof window.petApi.setSettingsOpen === "function") {
    window.petApi.setSettingsOpen(false);
  }
  if (!isModeMenuOpen && !dragging) {
    window.petApi.setClickThrough(true);
  }
  scheduleWindowSizeSync();
}

async function loadMonitorOptions() {
  if (!monitorSelect || !window.petApi || typeof window.petApi.getMonitors !== "function") {
    return;
  }

  const monitors = await window.petApi.getMonitors();
  monitorSelect.innerHTML = "";

  for (const monitor of monitors) {
    const option = document.createElement("option");
    option.value = String(monitor.id);
    option.textContent = monitor.label;
    monitorSelect.appendChild(option);
  }

  if (monitors.length > 0) {
    monitorSelect.value = String(monitors[0].id);
    window.petApi.setPreferredMonitor(monitors[0].id);
  }
}

function boostAffection(amount) {
  affection = Math.min(100, affection + amount);
  lastInteractionAt = Date.now();

  if (affection > 75) {
    setMood("excited");
    return;
  }

  if (affection > 24) {
    setMood("happy");
    return;
  }

  setMood("calm");
}

function decayMood() {
  const now = Date.now();
  const idleMs = now - lastInteractionAt;

  affection = Math.max(0, affection - 0.12);

  if (dragging) {
    return;
  }

  if (idleMs > 12000 && affection < 12) {
    setMood("sleepy");
    return;
  }

  if (affection > 75) {
    setMood("excited");
    return;
  }

  if (affection > 24) {
    setMood("happy");
    return;
  }

  setMood("calm");
}

function chooseRoamTarget(workArea, bounds) {
  const marginX = Math.max(34, Math.round(bounds.width * 0.32));
  const marginY = Math.max(34, Math.round(bounds.height * 0.32));

  const minX = workArea.x + marginX;
  const maxX = workArea.x + workArea.width - marginX;
  const minY = workArea.y + marginY;
  const maxY = workArea.y + workArea.height - marginY;

  const targetX = maxX > minX
    ? minX + Math.random() * (maxX - minX)
    : workArea.x + workArea.width / 2;
  const targetY = maxY > minY
    ? minY + Math.random() * (maxY - minY)
    : workArea.y + workArea.height / 2;

  return { x: targetX, y: targetY };
}

function refreshPettingState() {
  if (!pet) {
    return;
  }

  const now = Date.now();
  const active = now < pettingUntil;
  const emoteActive = active || now < pettingEmoteUntil;
  const chatActive = now < chatUntil;
  pet.classList.toggle("is-being-pet", active);
  pet.classList.toggle("is-petting-emote", emoteActive);
  pet.classList.toggle("is-chatting", chatActive);

  if (!chatActive) {
    clearChatEmoteIfActive();
  }

  if (emote && emoteActive) {
    emote.textContent = "<3";
  }

  const targetStrength = active ? 1 : 0;
  pettingStrength += (targetStrength - pettingStrength) * 0.22;
}

function trimTitle(title) {
  if (!title) {
    return "";
  }

  return title.length > 40 ? `${title.slice(0, 37)}...` : title;
}

function trimAppName(appName) {
  if (!appName) {
    return "app";
  }

  return appName.length > 24 ? `${appName.slice(0, 21)}...` : appName;
}

function detectAppCategory(appName, title) {
  const haystack = `${appName || ""} ${title || ""}`.toLowerCase();

  if (/code|visual studio|cursor|notepad\+\+|sublime|intellij|pycharm|webstorm|rider/.test(haystack)) {
    return "coding";
  }
  if (/chrome|firefox|edge|brave|opera|safari/.test(haystack)) {
    return "browser";
  }
  if (/discord|slack|teams|telegram|whatsapp|messenger/.test(haystack)) {
    return "chat";
  }
  if (/spotify|music|youtube music|vlc/.test(haystack)) {
    return "music";
  }
  if (/terminal|powershell|cmd|command prompt|windows terminal|bash|zsh|git bash/.test(haystack)) {
    return "terminal";
  }
  if (/excel|word|powerpoint|onenote|notion|obsidian|docs|sheets|office/.test(haystack)) {
    return "docs";
  }
  if (/steam|epic|battle\.net|riot|game/.test(haystack)) {
    return "gaming";
  }

  return "generic";
}

function buildWindowComment(appName, title) {
  const shortTitle = trimTitle(title);
  const app = trimAppName(appName);
  const category = detectAppCategory(appName, title);
  let templates;

  if (category === "coding") {
    templates = [
      `Coding in ${app}. Keep it clean.`,
      `${app} open. Time to ship.`,
      `Nice file: ${shortTitle}`,
      `Debug mode in ${app}?`,
      `${app} + calm fish support.`
    ];
  } else if (category === "browser") {
    templates = [
      `Browsing ${app}. Found anything good?`,
      `That tab title is wild: ${shortTitle}`,
      `${app} research session detected.`,
      `Many tabs or just enough tabs?`,
      `I can almost read: ${shortTitle}`
    ];
  } else if (category === "chat") {
    templates = [
      `${app} messages are popping off.`,
      `Reply queue in ${app}?`,
      `Social mode active in ${app}.`,
      `Be nice in chat, human.`,
      `Conversation check: ${shortTitle}`
    ];
  } else if (category === "music") {
    templates = [
      `${app} soundtrack detected.`,
      `Good vibes from ${app}.`,
      `Now playing maybe: ${shortTitle}`,
      `${app} and swimming rhythm sync.`,
      `This feels like focus music.`
    ];
  } else if (category === "terminal") {
    templates = [
      `Terminal up. Commands incoming.`,
      `${app} looks serious right now.`,
      `Ship it from ${app}.`,
      `I trust your shell skills.`,
      `Prompt spotted: ${shortTitle}`
    ];
  } else if (category === "docs") {
    templates = [
      `${app} writing session.`,
      `Document brain on in ${app}.`,
      `That title sounds important: ${shortTitle}`,
      `${app} productivity swim.`,
      `Clean notes, clean mind.`
    ];
  } else if (category === "gaming") {
    templates = [
      `${app} game mode detected.`,
      `Victory fish is on standby.`,
      `${app} looks intense.`,
      `High score energy right now.`,
      `Controller vibes from here.`
    ];
  } else {
    templates = [
      `${app} focus mode!`,
      `I see: ${shortTitle}`,
      `Working in ${app} now?`,
      `Window check: ${shortTitle}`,
      `${app} looks busy.`
    ];
  }

  return templates[Math.floor(Math.random() * templates.length)];
}

function showChatLine(text) {
  if (!pet || !emote || !text) {
    return;
  }

  emote.textContent = text;
  emote.dataset.kind = "chat";
  chatUntil = Date.now() + CHAT_HOLD_MS;
  pet.classList.add("is-chatting");

  // Reposition after layout so the bubble stays inside the window.
  requestAnimationFrame(() => {
    clampEmoteToStageBounds();
    scheduleWindowSizeSync();
  });
}

function clampEmoteToStageBounds() {
  if (!pet || !emote || !stage || !pet.classList.contains("is-chatting")) {
    return;
  }

  const bubbleHalf = emote.offsetWidth * 0.5;
  const stageWidth = stage.clientWidth;
  const petLeft = pet.offsetLeft;
  const preferredCenterInStage = petLeft + pet.clientWidth * 0.5;
  const minCenter = bubbleHalf + 10;
  const maxCenter = Math.max(minCenter, stageWidth - bubbleHalf - 10);
  const clampedCenter = Math.max(minCenter, Math.min(preferredCenterInStage, maxCenter));
  const leftInPet = clampedCenter - petLeft;

  emote.style.left = `${leftInPet}px`;
}

function isElementShown(element) {
  if (!element) {
    return false;
  }

  const style = window.getComputedStyle(element);
  return style.display !== "none" && style.visibility !== "hidden";
}

function trackElementRect(element, stageRect, bounds) {
  if (!element || !isElementShown(element)) {
    return;
  }

  const rect = element.getBoundingClientRect();
  if (!rect.width || !rect.height) {
    return;
  }

  bounds.left = Math.min(bounds.left, rect.left - stageRect.left);
  bounds.top = Math.min(bounds.top, rect.top - stageRect.top);
  bounds.right = Math.max(bounds.right, rect.right - stageRect.left);
  bounds.bottom = Math.max(bounds.bottom, rect.bottom - stageRect.top);
}

function computeRequiredWindowSize() {
  if (!stage || !pet) {
    return {
      width: MIN_WINDOW_WIDTH,
      height: MIN_WINDOW_HEIGHT
    };
  }

  const stageRect = stage.getBoundingClientRect();
  const bounds = {
    left: Number.POSITIVE_INFINITY,
    top: Number.POSITIVE_INFINITY,
    right: Number.NEGATIVE_INFINITY,
    bottom: Number.NEGATIVE_INFINITY
  };

  trackElementRect(pet, stageRect, bounds);
  if (isModeMenuOpen) {
    trackElementRect(modeMenu, stageRect, bounds);
  }
  if (isSettingsPanelOpen()) {
    trackElementRect(settingsPanel, stageRect, bounds);
  }
  if (pet.classList.contains("is-chatting")) {
    trackElementRect(emote, stageRect, bounds);
  }

  if (!Number.isFinite(bounds.left)) {
    return {
      width: MIN_WINDOW_WIDTH,
      height: MIN_WINDOW_HEIGHT
    };
  }

  const width = Math.max(
    MIN_WINDOW_WIDTH,
    Math.ceil(Math.max(bounds.right + WINDOW_SIZE_PADDING, bounds.right - bounds.left + WINDOW_SIZE_PADDING * 2))
  );
  const height = Math.max(
    MIN_WINDOW_HEIGHT,
    Math.ceil(Math.max(bounds.bottom + WINDOW_SIZE_PADDING, bounds.bottom - bounds.top + WINDOW_SIZE_PADDING * 2))
  );

  return { width, height };
}

function syncWindowSizeToContent() {
  if (!window.petApi || typeof window.petApi.setWindowSize !== "function") {
    return;
  }

  const target = computeRequiredWindowSize();
  if (
    Math.abs(target.width - lastWindowSizeRequest.width) <= WINDOW_SIZE_EPSILON
    && Math.abs(target.height - lastWindowSizeRequest.height) <= WINDOW_SIZE_EPSILON
  ) {
    return;
  }

  lastWindowSizeRequest = target;
  window.petApi.setWindowSize(target);
}

function scheduleWindowSizeSync() {
  if (windowSizeMeasureQueued) {
    return;
  }

  windowSizeMeasureQueued = true;
  requestAnimationFrame(() => {
    windowSizeMeasureQueued = false;
    syncWindowSizeToContent();
  });
}

function maybeCommentOnWindow() {
  if (!latestWindowInfo || !emote) {
    return;
  }

  const now = Date.now();
  if (now - lastChatAt < CHAT_COOLDOWN_MS) {
    return;
  }

  if (isModeMenuOpen || isSettingsPanelOpen() || dragging) {
    return;
  }

  const line = buildWindowComment(latestWindowInfo.appName, latestWindowInfo.title);
  showChatLine(line);
  lastChatAt = now;
}

function refreshTypingState() {
  if (!pet) {
    return;
  }

  const active = Date.now() < typingUntil;
  pet.classList.toggle("is-typing", active);
}

function spawnTypeSpark() {
  if (!typingLayer || !pet) {
    return;
  }

  const spark = document.createElement("div");
  spark.className = "type-spark";

  const x = pet.clientWidth * (0.28 + Math.random() * 0.44);
  const y = pet.clientHeight * (0.16 + Math.random() * 0.26);
  spark.style.left = `${x}px`;
  spark.style.top = `${y}px`;
  spark.style.setProperty("--drift-x", `${(Math.random() - 0.5) * 14}px`);

  typingLayer.appendChild(spark);
  spark.addEventListener("animationend", () => spark.remove(), { once: true });
}

function isTypingKey(event) {
  if (event.metaKey || event.altKey || event.ctrlKey) {
    return false;
  }

  if (event.key.length === 1) {
    return true;
  }

  return ["Enter", "Backspace", "Delete", "Tab", " "].includes(event.key);
}

function triggerTypingAnimationBurst() {
  typingUntil = Date.now() + TYPING_ACTIVE_MS;
  refreshTypingState();

  if (Math.random() < 0.85) {
    spawnTypeSpark();
  }
}

function handleTypingInput(event) {
  if (!isTypingKey(event)) {
    return;
  }

  triggerTypingAnimationBurst();
}

function updateModeButtonSelection() {
  if (!modeMenu) {
    return;
  }

  const buttons = modeMenu.querySelectorAll("button[data-mode]");
  for (const button of buttons) {
    const selected = button.dataset.mode === petMode;
    button.classList.toggle("is-selected", selected);
  }
}

function setPetMode(nextMode) {
  if (nextMode !== "roam" && nextMode !== "idle") {
    return;
  }

  petMode = nextMode;
  updateModeButtonSelection();
}

function openModeMenu(clientX, clientY) {
  if (!modeMenu || !pet) {
    return;
  }

  isModeMenuOpen = true;
  modeMenu.classList.add("is-open");
  modeMenu.setAttribute("aria-hidden", "false");
  updateModeButtonSelection();
  window.petApi.setClickThrough(false);

  const rect = pet.getBoundingClientRect();
  const menuWidth = 98;
  const menuHeight = 66;
  const left = Math.max(4, Math.min(clientX - rect.left, rect.width - menuWidth - 4));
  const top = Math.max(4, Math.min(clientY - rect.top, rect.height - menuHeight - 4));

  modeMenu.style.left = `${left}px`;
  modeMenu.style.top = `${top}px`;
  scheduleWindowSizeSync();
}

function closeModeMenu() {
  if (!modeMenu || !isModeMenuOpen) {
    return;
  }

  isModeMenuOpen = false;
  modeMenu.classList.remove("is-open");
  modeMenu.setAttribute("aria-hidden", "true");

  if (!dragging) {
    window.petApi.setClickThrough(true);
  }

  scheduleWindowSizeSync();
}

function updatePupilFromState(state) {
  if (!pupil || !fishLayer || !state || !state.bounds) {
    return;
  }

  const width = state.bounds.width;
  const height = state.bounds.height;
  if (!width || !height) {
    return;
  }

  const fishWidth = pet ? pet.clientWidth : width;
  const fishHeight = pet ? pet.clientHeight : height;
  const fishOffsetX = (width - fishWidth) / 2;
  const fishOffsetY = (height - fishHeight) / 2;

  let localX = state.cursor.x - state.bounds.x - fishOffsetX;
  const localY = state.cursor.y - state.bounds.y - fishOffsetY;

  const facing = Number(getComputedStyle(fishLayer).getPropertyValue("--facing")) || facingHint || 1;
  if (facing < 0) {
    localX = fishWidth - localX;
  }

  const eyeCenterX = fishWidth * eyeGeometry.centerXRatio;
  const eyeCenterY = fishHeight * eyeGeometry.centerYRatio;
  const pupilSize = Math.max(2, fishWidth * eyeGeometry.pupilSizeRatio * settings.pupilSize);
  let dx = 0;
  let dy = 0;

  if (eyeMask.allowedCenters.length > 0 && eyeMask.width > 0 && eyeMask.height > 0) {
    const desiredMaskX = (localX / fishWidth) * eyeMask.width;
    const desiredMaskY = (localY / fishHeight) * eyeMask.height;

    let best = eyeMask.allowedCenters[0];
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const point of eyeMask.allowedCenters) {
      const ddx = point.x - desiredMaskX;
      const ddy = point.y - desiredMaskY;
      const distance = ddx * ddx + ddy * ddy;
      if (distance < bestDistance) {
        bestDistance = distance;
        best = point;
      }
    }

    const targetFishX = (best.x / eyeMask.width) * fishWidth;
    const targetFishY = (best.y / eyeMask.height) * fishHeight;
    dx = targetFishX - eyeCenterX;
    dy = targetFishY - eyeCenterY;
  } else {
    const maxX = Math.max(1, fishWidth * eyeGeometry.radiusXRatio - pupilSize * 0.5);
    const maxY = Math.max(1, fishHeight * eyeGeometry.radiusYRatio - pupilSize * 0.5);
    dx = localX - eyeCenterX;
    dy = localY - eyeCenterY;

    const nx = dx / maxX;
    const ny = dy / maxY;
    const magnitude = Math.hypot(nx, ny);
    if (magnitude > 1) {
      dx = (dx / magnitude) * maxX;
      dy = (dy / magnitude) * maxY;
    }
  }

  dx *= PUPIL_CLAMP_RADIUS_SCALE;
  dy *= PUPIL_CLAMP_RADIUS_SCALE;

  const snappedPupilSize = Math.max(2, Math.round(pupilSize));

  fishLayer.style.setProperty("--pupil-x", `${dx.toFixed(2)}px`);
  fishLayer.style.setProperty("--pupil-y", `${dy.toFixed(2)}px`);
  fishLayer.style.setProperty("--pupil-size", `${snappedPupilSize}px`);
}

function updateSwimPose(dx, dy, speed) {
  if (!fishLayer) {
    return;
  }

  const moodMult = mood === "excited" ? 1.35 : mood === "sleepy" ? 0.5 : mood === "happy" ? 1.15 : 1;
  const intensity = Math.min(1, (speed * moodMult) / 8);
  const facing = dx >= 0 ? 1 : -1;
  facingHint = facing;
  swimPhase += 0.28 + intensity * 0.42;

  const foldAngle = Math.sin(swimPhase) * (6 + intensity * 10) + Math.sin(swimPhase * 1.9) * pettingStrength * 8;
  const tilt = Math.max(-7, Math.min(7, dy * 0.03)) + Math.cos(swimPhase * 1.2) * pettingStrength * 2.5;
  const bob = Math.sin(swimPhase * 0.5) * (0.6 + intensity * 1.8) + Math.sin(swimPhase * 2.05) * pettingStrength * 2.4;

  fishLayer.style.setProperty("--facing", String(facing));
  fishLayer.style.setProperty("--body-fold", `${foldAngle}deg`);
  fishLayer.style.setProperty("--swim-tilt", `${tilt}deg`);
  fishLayer.style.setProperty("--swim-bob", `${bob}px`);
}

async function swimRoam() {
  if (dragging || swimBusy) {
    return;
  }

  swimBusy = true;
  try {
    const state = await window.petApi.getSwimState();
    if (!state) {
      return;
    }

    updatePupilFromState(state);

    refreshPettingState();
    if (isModeMenuOpen) {
      updateSwimPose(facingHint, 0, 0.12);
      return;
    }

    if (isSettingsPanelOpen()) {
      updateSwimPose(facingHint, 0, 0.12);
      return;
    }

    if (petMode === "idle") {
      const isPetting = Date.now() < pettingUntil;
      if (isPetting) {
        updateSwimPose(facingHint, 0, 0.15);
        return;
      }

      const centerX = state.bounds.x + state.bounds.width / 2;
      const dxToCursor = state.cursor.x - centerX;
      const faceDx = Math.abs(dxToCursor) < 2 ? facingHint : dxToCursor;
      updateSwimPose(faceDx, 0, 0.15);
      return;
    }

    // While being petted, stay in place and only play the pose animation.
    const isPetting = Date.now() < pettingUntil;
    if (isPetting) {
      wasPetting = true;
      roamTarget = null;
      roamPauseUntil = Date.now() + 120;
      updateSwimPose(facingHint, 0, 0.3);
      return;
    }

    const centerX = state.bounds.x + state.bounds.width / 2;
    const centerY = state.bounds.y + state.bounds.height / 2;

    if (wasPetting) {
      wasPetting = false;
      roamPauseUntil = 0;
      roamTarget = chooseRoamTarget(state.workArea, state.bounds);
    }

    if (!roamTarget) {
      roamTarget = chooseRoamTarget(state.workArea, state.bounds);
    }

    const now = Date.now();
    if (now < roamPauseUntil) {
      updateSwimPose(1, 0, mood === "sleepy" ? 0.25 : 0.5);
      return;
    }

    const dx = roamTarget.x - centerX;
    const dy = roamTarget.y - centerY;
    const distance = Math.hypot(dx, dy);

    if (distance < 16) {
      const pause = mood === "sleepy"
        ? 1200 + Math.random() * 1300
        : 250 + Math.random() * 900;

      roamPauseUntil = now + pause;
      roamTarget = chooseRoamTarget(state.workArea, state.bounds);
      updateSwimPose(dx === 0 ? 1 : dx, dy, mood === "sleepy" ? 0.28 : 0.55);
      return;
    }

    const speedBoost = mood === "excited"
      ? 1.3
      : mood === "happy"
        ? 1.1
        : mood === "sleepy"
          ? 0.52
          : 1;
    const typingBoost = Date.now() < typingUntil ? 1.22 : 1;
    const speed = Math.min(8.5, (0.65 + distance * 0.028 + pettingStrength * 0.8) * speedBoost * typingBoost * settings.speed);
    const moveX = (dx / distance) * speed;
    const moveY = (dy / distance) * speed;

    lastSwimSpeed = speed;
    updateSwimPose(dx, dy, speed);
    window.petApi.moveBy(moveX, moveY);

    const trailChance = Math.min(0.95, (0.08 + speed * 0.08) * settings.bubbleAmount);
    if (Math.random() < trailChance) {
      spawnBubble({
        size: 3 + speed * 0.75,
        driftScale: 0.7 + speed * 0.08
      });
    }
  } finally {
    swimBusy = false;
  }
}

pet.addEventListener("mouseenter", () => {
  window.petApi.setClickThrough(false);
});

pet.addEventListener("mouseleave", () => {
  if (!dragging && !isModeMenuOpen && !isSettingsPanelOpen()) {
    window.petApi.setClickThrough(true);
  }
});

pet.addEventListener("contextmenu", (event) => {
  event.preventDefault();
  openModeMenu(event.clientX, event.clientY);
});

pet.addEventListener("mousedown", (event) => {
  if (event.button !== 0 || isModeMenuOpen) {
    return;
  }

  dragging = true;
  lastX = event.screenX;
  lastY = event.screenY;
  lastInteractionAt = Date.now();
  setMood("excited");
  window.petApi.setClickThrough(false);
});

pet.addEventListener("mousemove", (event) => {
  if (isModeMenuOpen || isSettingsPanelOpen()) {
    return;
  }

  if (dragging) {
    return;
  }

  if (lastPetX === null || lastPetY === null) {
    lastPetX = event.clientX;
    lastPetY = event.clientY;
    return;
  }

  const travel = Math.hypot(event.clientX - lastPetX, event.clientY - lastPetY);
  const deltaX = event.clientX - lastPetX;
  const deltaY = event.clientY - lastPetY;
  lastPetX = event.clientX;
  lastPetY = event.clientY;

  if (travel < PETTING_MIN_MOVE / settings.petSensitivity) {
    return;
  }

  const now = Date.now();
  if (!pettingStrokeStartedAt || now - pettingStrokeStartedAt > PETTING_STROKE_WINDOW_MS) {
    pettingStrokeStartedAt = now;
    pettingStrokeDistance = 0;
    pettingDirectionMask = 0;
  }

  pettingStrokeDistance += travel;

  if (Math.abs(deltaX) > 1.2 || Math.abs(deltaY) > 1.2) {
    if (Math.abs(deltaX) >= Math.abs(deltaY)) {
      pettingDirectionMask |= deltaX >= 0 ? DIR_RIGHT : DIR_LEFT;
    } else {
      pettingDirectionMask |= deltaY >= 0 ? DIR_DOWN : DIR_UP;
    }
  }

  if (
    pettingStrokeDistance < PETTING_STROKE_DISTANCE / settings.petSensitivity
    || countDirectionBits(pettingDirectionMask) < 2
  ) {
    return;
  }

  pettingStrokeDistance = 0;
  pettingStrokeStartedAt = now;
  pettingDirectionMask = 0;

  const nowForPet = Date.now();
  pettingUntil = Math.max(pettingUntil, nowForPet + PETTING_HOLD_MS);
  pettingEmoteUntil = nowForPet + PETTING_EMOTE_HOLD_MS;
  boostAffection(Math.min(2.2, travel * 0.11));
  setMood("happy");

  if (Math.random() < Math.min(0.95, 0.22 + settings.heartAmount * 0.2)) {
    spawnHeartsBurst(event.offsetX - 6, event.offsetY - 12);
  }
});

window.addEventListener("mousemove", (event) => {
  if (!dragging) {
    return;
  }

  const dx = event.screenX - lastX;
  const dy = event.screenY - lastY;
  lastX = event.screenX;
  lastY = event.screenY;

  window.petApi.moveBy(dx, dy);
});

window.addEventListener("mouseup", () => {
  if (!dragging) {
    return;
  }

  dragging = false;
  boostAffection(4);
  roamTarget = null;
  if (!isModeMenuOpen) {
    window.petApi.setClickThrough(true);
  }
});

pet.addEventListener("mouseleave", () => {
  lastPetX = null;
  lastPetY = null;
  pettingStrokeDistance = 0;
  pettingStrokeStartedAt = 0;
  pettingDirectionMask = 0;
  pettingEmoteUntil = 0;
  pettingUntil = 0;
  refreshPettingState();
});

if (modeMenu) {
  modeMenu.addEventListener("mousedown", (event) => {
    event.stopPropagation();
  });

  modeMenu.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }

    const mode = target.dataset.mode;
    if (mode) {
      setPetMode(mode);
      closeModeMenu();
      return;
    }

    const action = target.dataset.action;
    if (action === "settings") {
      openSettingsPanel();
      return;
    }

    if (!mode && !action) {
      return;
    }
  });
}

if (settingsPanel) {
  settingsPanel.addEventListener("mousedown", (event) => {
    event.stopPropagation();
  });
}

if (settingsCloseButton) {
  settingsCloseButton.addEventListener("click", () => {
    closeSettingsPanel();
  });
}

if (speedInput) {
  speedInput.addEventListener("input", () => {
    settings.speed = clampSetting(Number(speedInput.value), 0.5, 2);
    applySettings();
    saveSettings();
  });
}

if (petSensitivityInput) {
  petSensitivityInput.addEventListener("input", () => {
    settings.petSensitivity = clampSetting(Number(petSensitivityInput.value), 0.5, 2);
    saveSettings();
  });
}

if (heartAmountInput) {
  heartAmountInput.addEventListener("input", () => {
    settings.heartAmount = clampSetting(Number(heartAmountInput.value), 0, 3);
    saveSettings();
  });
}

if (bubbleAmountInput) {
  bubbleAmountInput.addEventListener("input", () => {
    settings.bubbleAmount = clampSetting(Number(bubbleAmountInput.value), 0, 3);
    saveSettings();
  });
}

if (pupilSizeInput) {
  pupilSizeInput.addEventListener("input", () => {
    settings.pupilSize = clampSetting(Number(pupilSizeInput.value), 0.6, 1.8);
    saveSettings();
  });
}

if (monitorSelect) {
  monitorSelect.addEventListener("change", () => {
    const id = Number(monitorSelect.value);
    if (!Number.isNaN(id) && window.petApi && typeof window.petApi.setPreferredMonitor === "function") {
      window.petApi.setPreferredMonitor(id);
    }
  });
}

window.addEventListener("mousedown", (event) => {
  if (isSettingsPanelOpen()) {
    if (settingsPanel && settingsPanel.contains(event.target)) {
      return;
    }

    closeSettingsPanel();
    return;
  }

  if (!isModeMenuOpen || !modeMenu || modeMenu.contains(event.target)) {
    return;
  }

  closeModeMenu();
});

window.addEventListener("keydown", handleTypingInput);

if (window.petApi && typeof window.petApi.onGlobalTyping === "function") {
  window.petApi.onGlobalTyping(() => {
    triggerTypingAnimationBurst();
  });
}

if (window.petApi && typeof window.petApi.onActiveWindow === "function") {
  window.petApi.onActiveWindow((payload) => {
    if (!payload || !payload.title) {
      return;
    }

    latestWindowInfo = {
      appName: payload.appName || "",
      title: payload.title || ""
    };
    maybeCommentOnWindow();
  });
}

// Start in click-through mode so the pet does not block normal desktop interactions.
window.petApi.setClickThrough(true);
loadSettings();
applySettings();
syncSettingsInputs();
setMood("calm");
refreshPettingState();
setPetMode("idle");

loadMonitorOptions();

if (stage) {
  stage.classList.add("is-booting");
}

if (eyeBase) {
  if (eyeBase.complete) {
    detectEyeCircleFromPng(eyeBase);
  }

  eyeBase.addEventListener("load", () => {
    detectEyeCircleFromPng(eyeBase);
  });
}

// Swim around autonomously with a light easing loop.
setTimeout(() => {
  if (stage) {
    stage.classList.remove("is-booting");
  }

  setInterval(swimRoam, 34);
  setInterval(decayMood, 120);
  setInterval(refreshPettingState, 80);
  setInterval(refreshTypingState, 80);
  scheduleWindowSizeSync();
}, STARTUP_BOOT_MS);
setInterval(() => {
  if (Date.now() >= chatUntil && pet) {
    pet.classList.remove("is-chatting");
    clearChatEmoteIfActive();
    scheduleWindowSizeSync();
  }
}, 220);

window.addEventListener("resize", () => {
  clampEmoteToStageBounds();
  scheduleWindowSizeSync();
});
scheduleWindowSizeSync();
setInterval(() => {
  if (dragging || mood === "sleepy") {
    return;
  }

  const ambientChance = Math.min(0.9, 0.25 * settings.bubbleAmount + 0.02 * lastSwimSpeed * settings.bubbleAmount);
  if (Math.random() < ambientChance) {
    spawnBubble({
      size: 4 + Math.max(0, lastSwimSpeed - 1) * 0.7,
      driftScale: 1 + lastSwimSpeed * 0.06
    });
  }
}, 1200);
