# Angular Demo — cytoscape-euler-wasm

An Angular 21+ demo that consumes the [`cytoscape-euler-wasm`](https://www.npmjs.com/package/cytoscape-euler-wasm) npm package to run a force-directed graph layout powered by Rust/WASM with optional multi-threading.

## What This Demonstrates

### npm Package Consumption

The demo installs `cytoscape-euler-wasm` from the npm registry and uses the standard Cytoscape layout API:

```ts
import cytoscapeEulerWasm from 'cytoscape-euler-wasm';
cytoscape.use(cytoscapeEulerWasm);

cy.layout({ name: 'euler-wasm', ...options }).run();
```

The package handles Web Worker creation, WASM loading, thread pool initialization, and position application internally — no custom services needed.

### Multi-Threading via COOP/COEP

Multi-threaded WASM requires `SharedArrayBuffer`, which browsers only enable when the page is served with specific HTTP headers. The Angular dev server is configured in `angular.json` with:

```json
"headers": {
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Embedder-Policy": "require-corp"
}
```

**Why self-host WASM files?** Browsers require `SharedArrayBuffer`-using resources to be served from the same origin. The `postinstall` script copies WASM files from `node_modules/cytoscape-euler-wasm/dist/` into `public/` so they're served at `/wasm/`, `/wasm-threaded/`, and `/euler-worker.umd.js` — all same-origin.

### Adaptive Thread Count

Thread count scales with graph size to balance computation overhead vs. parallelism benefit:

| Nodes  | Threads |
|--------|---------|
| < 500  | 1 (single-threaded WASM) |
| < 1K   | 2 |
| < 3K   | 3 |
| < 10K  | 4 |
| >= 10K | 0 (auto — all available cores) |

### Multi-Zoom SVG Node Rendering

Four zoom levels with class-based style switching and hysteresis to prevent flip-flopping:

| Zoom     | Mode     | Visual |
|----------|----------|--------|
| < 0.3    | dots     | Colored circles (20px) |
| 0.3–0.7  | icons    | SVG icons in circles (32px) |
| 0.7–1.4  | cards    | Single-line named cards |
| > 1.4    | detailed | Two-line cards with secondary labels |

### Position Scaling on Zoom Transitions

When transitioning from small node visuals (dots/icons) to larger ones (cards/detailed), node positions are scaled outward from the graph center to prevent overlap:

- **icons → cards**: positions × 3x
- **cards → detailed**: additional × 1.2x (3.6x total)
- **Zooming back out**: positions contract to original scale
- Pan adjusts to keep the view centered during scaling

### WASM vs JS Comparison

Toggle between `cytoscape-euler-wasm` (WASM) and `cytoscape-euler` (JS) to compare performance. The WASM layout shows:

- **Progress bar** — real-time percent during computation
- **Telemetry** — iterations, convergence status, thread count, WASM compute time

## Quick Start

```bash
cd examples/angular
npm install        # also runs postinstall to copy WASM files
npm start          # serves at http://localhost:4200
```

## Project Structure

```
examples/angular/
├── angular.json                  # COOP/COEP headers, CommonJS allowlist
├── package.json                  # npm deps, postinstall script
├── scripts/
│   └── copy-wasm.mjs             # Copies WASM files to public/ on install
├── public/                       # Static assets (WASM files copied here)
│   ├── wasm/                     # Standard single-threaded WASM build
│   ├── wasm-threaded/            # Multi-threaded WASM build (Rayon)
│   └── euler-worker.umd.js       # Bundled Web Worker script
└── src/
    ├── main.ts                   # Bootstrap
    ├── index.html                # HTML shell
    ├── styles.css                # Global styles
    └── app/
        ├── app.ts                # Main component — layout, zoom, scaling
        ├── app.html              # Template — settings panel, progress bar
        ├── app.css               # Component styles
        ├── app.config.ts         # Angular application config
        ├── entities.ts           # Random tree generation with BFS layers
        ├── graph-builder-settings.service.ts   # Settings with session storage
        └── svg.service.ts        # SVG generation/caching for 4 zoom levels
```

## Key Files

### `scripts/copy-wasm.mjs`

Postinstall script that copies three assets from `node_modules/cytoscape-euler-wasm/dist/` to `public/`:

1. `wasm/` — Standard single-threaded WASM (89KB `.wasm`)
2. `wasm-threaded/` — Multi-threaded WASM with Rayon (160KB `.wasm`)
3. `euler-worker.umd.js` — Bundled Web Worker that loads WASM and runs layout

### `graph-builder-settings.service.ts`

Angular service managing all configurable physics parameters via signals. Settings persist to `sessionStorage` automatically via an `effect()`. Provides:

- `getEulerWasmConfig(nodeCount)` — config for WASM layout with adaptive threading
- `getEulerJsConfig()` — config for JS layout comparison

### `app.ts`

Main component handling:

- **Cytoscape initialization** with zoom-level aware styling
- **Tree generation** with layer-based coloring and 4-level SVG nodes
- **Layout execution** via WASM (with progress/telemetry) or JS (with optional animation)
- **Position scaling** on zoom transitions to prevent node overlap
- **Cleanup** — destroys Cytoscape instance on component destroy

## Production Deployment

For production, ensure your web server sends the COOP/COEP headers:

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

Without these, the browser will fall back to single-threaded WASM automatically.

The WASM files in `public/` must be served from the same origin as the page. If using a CDN, ensure the CDN origin matches or configure appropriate CORS headers.
