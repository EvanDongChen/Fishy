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

## Modular SVG Parts

The fish is now assembled from separate SVG files so you can replace parts independently with your own pixel art:

- `assets/fish/body.svg`
- `assets/fish/tail.svg`
- `assets/fish/fin-top.svg`
- `assets/fish/fin-bottom.svg`
- `assets/fish/eye.svg`

Keep each file on the same `viewBox="0 0 260 160"` so all layers align correctly.