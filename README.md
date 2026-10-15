# Pixel Racer — 8-bit Arcade

A browser-first endless racing game inspired by classic handheld racing games. It uses Canvas and vanilla JavaScript, saves your best score locally, supports keyboard and touch controls, and includes basic PWA/offline caching.

## Run locally

**Recommended (VS Code):**

1. Open this folder in VS Code.
2. Install the **Live Server** extension, or use any local static server.
3. Start the server and open the shown `http://localhost:...` address.

Service workers require `localhost` or HTTPS. Opening `index.html` directly with `file://` may allow gameplay but offline/PWA caching will not work.

**Optional Python server** (if Python is installed):

```bash
python -m http.server 8080
```

Then visit `http://localhost:8080`.

## Controls

- Left / Right arrow or A / D: switch lanes
- Space / Enter: start or restart
- Space / Escape: pause
- Mobile: LEFT and RIGHT touch buttons; PAUSE button

## Game rules

- Avoid other cars.
- Score increases with time and cars passed.
- Speed increases as you survive.
- Fuel gradually drains.
- Crash or run out of fuel to end the run.
- Best score is stored in browser `localStorage`.

## Project files

- `index.html` — page and HUD
- `src/main.js` — game loop, rendering, controls, collision, scoring and audio
- `src/style.css` — responsive arcade interface
- `manifest.webmanifest` — installable web app metadata
- `sw.js` — offline asset caching

## Notes / next improvements

- Add custom icon files to the manifest.
- Consider a fuel pickup mechanic, difficulty tuning, and sprite-sheet art.
- For Android/iOS packaging later, this project can be wrapped with Capacitor after testing the PWA.
- The Google Fonts import is decorative only; if offline font loading fails, the game falls back to monospace. For fully self-contained offline styling, bundle a pixel font locally.
