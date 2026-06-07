const pet = document.getElementById("pet");
const fishLayer = document.querySelector(".fish-layered");
const eyeBase = document.querySelector(".eye-base");
const pupil = document.getElementById("pupil");
const heartsLayer = document.getElementById("hearts");
const bubblesLayer = document.getElementById("bubbles");
const emote = document.getElementById("emote");

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
const PUPIL_CLAMP_RADIUS_SCALE = 0.75;

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
      emote.textContent = "<3";
    }
    return;
  }

  if (nextMood === "excited") {
    pet.classList.add("is-excited");
    if (emote) {
      emote.textContent = "!!";
    }
    return;
  }

  if (nextMood === "sleepy") {
    pet.classList.add("is-sleepy");
    if (emote) {
      emote.textContent = "zzz";
    }
    return;
  }

  if (emote) {
    emote.textContent = "";
  }
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

function spawnBubble() {
  if (!bubblesLayer || !pet) {
    return;
  }

  const bubble = document.createElement("div");
  bubble.className = "bubble";

  const direction = mood === "calm" || !fishLayer
    ? 1
    : Number(getComputedStyle(fishLayer).getPropertyValue("--facing")) || 1;
  const startX = direction >= 0 ? pet.clientWidth * 0.78 : pet.clientWidth * 0.2;
  const startY = pet.clientHeight * 0.53;

  bubble.style.left = `${startX}px`;
  bubble.style.top = `${startY}px`;
  bubble.style.setProperty("--drift-x", `${(Math.random() * 10 + 6) * direction}px`);
  bubblesLayer.appendChild(bubble);
  bubble.addEventListener("animationend", () => bubble.remove(), { once: true });
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

  const active = Date.now() < pettingUntil;
  pet.classList.toggle("is-being-pet", active);

  const targetStrength = active ? 1 : 0;
  pettingStrength += (targetStrength - pettingStrength) * 0.22;
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
  const pupilSize = Math.max(2, fishWidth * eyeGeometry.pupilSizeRatio);
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

  fishLayer.style.setProperty("--pupil-x", `${dx.toFixed(2)}px`);
  fishLayer.style.setProperty("--pupil-y", `${dy.toFixed(2)}px`);
  fishLayer.style.setProperty("--pupil-size", `${pupilSize.toFixed(2)}px`);
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
    const speed = Math.min(8.5, (0.65 + distance * 0.028 + pettingStrength * 0.8) * speedBoost);
    const moveX = (dx / distance) * speed;
    const moveY = (dy / distance) * speed;

    updateSwimPose(dx, dy, speed);
    window.petApi.moveBy(moveX, moveY);
  } finally {
    swimBusy = false;
  }
}

pet.addEventListener("mouseenter", () => {
  window.petApi.setClickThrough(false);
});

pet.addEventListener("mouseleave", () => {
  if (!dragging) {
    window.petApi.setClickThrough(true);
  }
});

pet.addEventListener("mousedown", (event) => {
  dragging = true;
  lastX = event.screenX;
  lastY = event.screenY;
  lastInteractionAt = Date.now();
  setMood("excited");
  window.petApi.setClickThrough(false);
});

pet.addEventListener("mousemove", (event) => {
  if (dragging) {
    return;
  }

  if (lastPetX === null || lastPetY === null) {
    lastPetX = event.clientX;
    lastPetY = event.clientY;
    return;
  }

  const travel = Math.hypot(event.clientX - lastPetX, event.clientY - lastPetY);
  lastPetX = event.clientX;
  lastPetY = event.clientY;

  if (travel < 1.8) {
    return;
  }

  pettingUntil = Date.now() + PETTING_HOLD_MS;
  boostAffection(Math.min(2.2, travel * 0.11));
  setMood("happy");

  if (Math.random() < 0.38) {
    spawnHeart(event.offsetX - 6, event.offsetY - 12);
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
  window.petApi.setClickThrough(true);
});

pet.addEventListener("mouseleave", () => {
  lastPetX = null;
  lastPetY = null;
  pettingUntil = 0;
  refreshPettingState();
});

// Start in click-through mode so the pet does not block normal desktop interactions.
window.petApi.setClickThrough(true);
setMood("calm");
refreshPettingState();

if (eyeBase) {
  if (eyeBase.complete) {
    detectEyeCircleFromPng(eyeBase);
  }

  eyeBase.addEventListener("load", () => {
    detectEyeCircleFromPng(eyeBase);
  });
}

// Swim around autonomously with a light easing loop.
setInterval(swimRoam, 34);
setInterval(decayMood, 120);
setInterval(refreshPettingState, 80);
setInterval(() => {
  if (dragging || mood === "sleepy") {
    return;
  }

  if (Math.random() < 0.55) {
    spawnBubble();
  }
}, 1200);
