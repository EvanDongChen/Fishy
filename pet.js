const pet = document.getElementById("pet");
const fishLayer = document.querySelector(".fish-layered");

let dragging = false;
let lastX = 0;
let lastY = 0;
let swimPhase = 0;
let swimBusy = false;

function updateSwimPose(dx, dy, speed) {
  if (!fishLayer) {
    return;
  }

  const intensity = Math.min(1, speed / 8);
  const facing = dx >= 0 ? 1 : -1;
  swimPhase += 0.28 + intensity * 0.42;

  const foldAngle = Math.sin(swimPhase) * (6 + intensity * 10);
  const tilt = Math.max(-7, Math.min(7, dy * 0.03));
  const bob = Math.sin(swimPhase * 0.5) * (0.6 + intensity * 1.8);

  fishLayer.style.setProperty("--facing", String(facing));
  fishLayer.style.setProperty("--body-fold", `${foldAngle}deg`);
  fishLayer.style.setProperty("--swim-tilt", `${tilt}deg`);
  fishLayer.style.setProperty("--swim-bob", `${bob}px`);
}

async function swimTowardCursor() {
  if (dragging || swimBusy) {
    return;
  }

  swimBusy = true;
  try {
    const state = await window.petApi.getSwimState();
    if (!state) {
      return;
    }

    const centerX = state.bounds.x + state.bounds.width / 2;
    const centerY = state.bounds.y + state.bounds.height / 2;

    const dx = state.cursor.x - centerX;
    const dy = state.cursor.y - centerY;
    const distance = Math.hypot(dx, dy);

    if (distance < 8) {
      updateSwimPose(1, 0, 0.8);
      return;
    }

    const speed = Math.min(8, 0.9 + distance * 0.05);
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
  window.petApi.setClickThrough(false);
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
  window.petApi.setClickThrough(true);
});

// Start in click-through mode so the pet does not block normal desktop interactions.
window.petApi.setClickThrough(true);

// Swim toward the cursor with a light easing loop.
setInterval(swimTowardCursor, 34);
