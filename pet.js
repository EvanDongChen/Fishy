const pet = document.getElementById("pet");

let dragging = false;
let lastX = 0;
let lastY = 0;

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
