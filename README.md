# New Year Countdown Premium

A highly aesthetic, premium New Year Countdown application. Featuring a modern glassmorphism design, real-time physics-based particle systems (snow and fireworks), spatial audio, and full Progressive Web App (PWA) support.

## 🌟 Features

- **Premium Glassmorphism UI**: High-end styling utilizing CSS variables, backdrop filters, and smooth easing transitions.
- **Dynamic Physics Engine**: Custom HTML5 Canvas rendering for drifting snow and celebratory fireworks with gravity and drag physics.
- **Multiple Timezones**: Built-in support for multiple global timezones, utilizing the `Intl.DateTimeFormat` API for accurate midnight calculation without NaN errors.
- **Audio Engine**: Synthesized sound effects using the Web Audio API for ticks and celebration chimes. No external audio files required.
- **Dark/Light Themes**: Fluid transitions between beautiful, carefully curated dark and light color palettes.
- **Responsive & Accessible**: Fully mobile-first design, keyboard navigable, and uses semantic ARIA attributes for screen reader support.
- **PWA Ready**: Includes a service worker (`sw.js`) and `manifest.json` for offline capabilities and native-like installation on devices.

## 🛠️ Technology Stack

- **HTML5**: Semantic structure, accessibility (`aria` tags), SVG icons.
- **CSS3**: Vanilla CSS with advanced techniques including CSS Variables, Fluid Typography (`clamp`), CSS Grid/Flexbox, Hardware-accelerated compositing (`will-change`, `transform`), and dark/light mode toggling.
- **JavaScript (ES6+)**:
  - `requestAnimationFrame` for high-performance canvas loops.
  - Page Visibility API to pause rendering and save battery when the tab is inactive.
  - `Intl` API for accurate timezone calculations.
  - Web Audio API for programmatic sound generation.
  - Service Workers for offline caching.

## 📁 File Structure

- `index.html`: The main entry point containing the application shell and SVG icons.
- `style.css`: Comprehensive design system, tokens, layout, and animations.
- `script.js`: Core application logic, canvas rendering loop, audio synthesis, and DOM manipulation.
- `sw.js`: Service worker for caching core assets, enabling PWA support.
- `manifest.json`: Web app manifest for installation and configuration.
- `worker.js`: Off-main-thread canvas logic (can be used for further performance scaling).

## 🚀 How to Run

1. Clone the repository or download the files.
2. Serve the directory using any local HTTP server. For example:
   - Using Python: `python -m http.server 8000`
   - Using Node (npx): `npx serve .`
   - Using VS Code: Open with the "Live Server" extension.
3. Open `http://localhost:8000` (or the provided port) in your browser.

*Note: For the Service Worker (PWA functionality) to register correctly, the application must be served over HTTPS or `localhost`.*

## 🎨 Design System

The styling is driven by a robust token-based CSS system at the top of `style.css`.
- Uses `--dur-fast`, `--dur-base`, and `--dur-slow` for consistent animation timing.
- Color palettes are defined using `hsl()` to easily derive transparent/glowing variants.
- Strict hardware-acceleration rules are used: animations only target `transform`, `opacity`, and `will-change`.

## ⚙️ How the Timezone Calculation Works

The application calculates the precise timestamp of midnight for the target timezone using a coarse-to-fine binary search mechanism alongside the native `Intl.DateTimeFormat` API. This guarantees accuracy without needing heavy external libraries like Moment.js or date-fns.

---
*Built with modern web standards.*
