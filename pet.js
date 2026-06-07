const pet = document.getElementById("pet");
const fishLayer = document.querySelector(".fish-layered");
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

const PETTING_HOLD_MS = 240;

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

function updateSwimPose(dx, dy, speed) {
  if (!fishLayer) {
    return;
  }

  const moodMult = mood === "excited" ? 1.35 : mood === "sleepy" ? 0.5 : mood === "happy" ? 1.15 : 1;
  const intensity = Math.min(1, (speed * moodMult) / 8);
  const facing = dx >= 0 ? 1 : -1;
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

    refreshPettingState();

    // While being petted, stay in place and only play the pose animation.
    if (Date.now() < pettingUntil) {
      roamPauseUntil = Date.now() + 220;
      updateSwimPose(1, 0, 0.3);
      return;
    }

    const centerX = state.bounds.x + state.bounds.width / 2;
    const centerY = state.bounds.y + state.bounds.height / 2;

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
