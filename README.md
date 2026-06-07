# Fishy Desktop Pet

A tiny desktop pet built with Electron.

It runs in a transparent always-on-top window, can be dragged around, and stays click-through when you are not interacting with it.

## Requirements

- Node.js 18+
- Windows (tested target)

## Run

1. Install dependencies:

	npm install

2. Start the pet:

	npm start

## Controls

- Hover the pet to make it interactive.
- Click and drag to move it around your screen.
- Release the mouse to return it to click-through mode.

## Files

- `main.js`: Electron main process, creates the always-on-top transparent window.
- `preload.js`: Safe bridge between renderer and main process.
- `pet.html`, `pet.css`, `pet.js`: Pet visuals, animation, and drag behavior.

## Modular Fish Parts

The fish is assembled from separate image layers so you can replace parts independently with your own pixel art:

- `assets/fish/backfin.png`
- `assets/fish/body.png`
- `assets/fish/topfin.png`
- `assets/fish/bottomfin.png`
- `assets/fish/eye.png`

Guidelines for clean layering:

- Keep all part images at the same canvas size.
- Keep transparent backgrounds around each part.
- Place each part in the same relative position in its image.
- Keep filenames the same, or update the matching `<img src="...">` entries in `pet.html`.