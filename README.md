# cytoscape-euler-wasm

[![Deploy](https://github.com/alex-poloziouk/cytoscape-euler-wasm/actions/workflows/deploy.yml/badge.svg)](https://github.com/alex-poloziouk/cytoscape-euler-wasm/actions/workflows/deploy.yml)

High-performance WebAssembly port of the [cytoscape.js-euler](https://github.com/cytoscape/cytoscape.js-euler) force-directed graph layout algorithm.

**5–10x faster** than the JavaScript implementation, depending on graph size and core count.

[**▶ Live Demo**](https://alex-poloziouk.github.io/cytoscape-euler-wasm/)

## What Is This?

A drop-in WASM replacement for `cytoscape-euler` that uses the exact same Barnes-Hut O(n log n) algorithm — the speedup comes from native WASM execution, multi-threading (Rayon), and math optimizations.

| Nodes | JS | WASM | Threads | Speedup |
|------:|-----:|------:|--------:|--------:|
| 1,000 | 6.4s | 1.2s | 2 | **5.4x** |
| 3,000 | 29.9s | 3.3s | 3 | **9.1x** |
| 5,000 | 56.7s | 5.7s | 4 | **10.0x** |

*1 000 iterations, default params, times vary by hardware.*

## Install

```bash
npm install cytoscape-euler-wasm
```

WASM binaries and the worker script are included in the package and served from [unpkg](https://unpkg.com/) CDN by default — no extra setup required for basic usage.

> **CommonJS / `require()`** is not supported. The package ships ESM source (for bundlers) and a UMD bundle (for `<script>` tags). If you need CJS interop in a bundler, most (Webpack, Rollup) handle the ESM entry automatically.

## Quick Start

### ESM (Bundler / Modern Browser)

```javascript
import cytoscape from 'cytoscape';
import cytoscapeEulerWasm from 'cytoscape-euler-wasm';

cytoscape.use(cytoscapeEulerWasm);

const cy = cytoscape({ container: document.getElementById('cy'), elements: [...] });

cy.layout({ name: 'euler-wasm' }).run();
```

### Script Tag (No Bundler)

```html
<script src="https://unpkg.com/cytoscape@3.33.1/dist/cytoscape.min.js"></script>
<script src="https://unpkg.com/cytoscape-euler-wasm/dist/cytoscape-euler-wasm.umd.js"></script>
<!-- auto-registers as 'euler-wasm' if cytoscape global is detected -->

<script>
  const cy = cytoscape({ container: document.getElementById('cy'), elements: [...] });
  cy.layout({ name: 'euler-wasm' }).run();
</script>
```

### With All Options

```javascript
const layout = cy.layout({
  name: 'euler-wasm',

  // Physics parameters — match cytoscape-euler 1.2.3 defaults.
  // Per-element params accept a function(ele) or a flat number (Hybrid approach).
  springLength: 80,            // or: edge => edge.data('weight') * 10
  springCoeff: 0.0008,         // global only — per-edge not yet supported in WASM
  mass: 4,                     // or: node => node.degree() + 1
  gravity: -1.2,
  pull: 0.001,
  theta: 0.666,
  dragCoeff: 0.02,
  movementThreshold: 1,
  timeStep: 20,
  maxIterations: 1000,
  maxSimulationTime: 60000,

  // Cytoscape layout standard options
  fit: true,
  padding: 30,
  animate: false,              // 'end' supported; true NOT supported (see note below)
  animationDuration: 500,
  animationEasing: undefined,   // CSS easing for animate:'end' (e.g. 'ease-in-out')
  boundingBox: undefined,       // {x1,y1,x2,y2} or {x1,y1,w,h} to constrain layout
  randomize: false,

  // WASM / Worker options
  threadCount: 0,              // 0 = auto (min(cores, 4)). Requires COOP/COEP headers.

  // Progress callback — called periodically during computation
  progress: ({ percent, iteration, elapsedMs }) => {
    console.log(`${percent}% — iteration ${iteration}`);
  },

  // Telemetry — detailed performance data after layout completes
  telemetry: true,
  onTelemetry: (data) => {
    console.log(`${data.iterations} iter, ${data.converged ? 'converged' : 'max-iter'}, ${data.threadCount}T, ${data.totalMs.toFixed(0)}ms`);
  },
});

layout.run();
```

> **`animate: true` is NOT supported.** The layout runs asynchronously in a Web Worker — intermediate positions cannot be rendered frame-by-frame. Use the `progress` callback for progress indication, or `animate: 'end'` to smoothly animate nodes to their final positions. Passing `true` will fall back to `'end'` with a console warning.

## WASM Loading

By default, the worker script and WASM binaries are loaded from the [unpkg](https://unpkg.com/) CDN. This works **out of the box** with zero configuration for single-threaded layouts.

For **multi-threading**, files must be same-origin — see [Self-Hosting WASM Files](#self-hosting-wasm-files-for-multi-threading) below.

### Fallback Chain

Threading support is detected at runtime. If threaded WASM fails (no `SharedArrayBuffer`, cross-origin, etc.), it gracefully falls back:

```
Threaded WASM (multi-core, Web Worker)
  → Standard WASM (single-core, Web Worker)
```

## Two Builds — Why?

| Build | Size | Requires |
|-------|------|----------|
| **Standard** (`dist/wasm/`) | ~89 KB | Any modern browser |
| **Threaded** (`dist/wasm-threaded/`) | ~160 KB | SharedArrayBuffer + COOP/COEP headers |

The Rust source is identical — only the `parallel` Cargo feature toggles `.iter()` vs `.par_iter()` (Rayon).

The standard build is your **fallback insurance** for environments where SharedArrayBuffer isn't available (CDNs without COOP/COEP, iframes, corporate proxies).

### Enabling Multi-Threading (COOP/COEP)

Your server must send these headers on **every HTML page** that uses the layout for `SharedArrayBuffer` to be available:

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

> **Without these headers**, multi-threading is unavailable and the layout automatically falls back to single-threaded WASM. Everything still works — just on one core.

<details>
<summary><strong>Vite</strong> (dev server + preview)</summary>

```javascript
// vite.config.js
export default {
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  preview: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
};
```

</details>

<details>
<summary><strong>Webpack Dev Server</strong></summary>

```javascript
// webpack.config.js
module.exports = {
  devServer: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
};
```

</details>

<details>
<summary><strong>Next.js</strong></summary>

```javascript
// next.config.js
module.exports = {
  async headers() {
    return [{
      source: '/(.*)',
      headers: [
        { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
        { key: 'Cross-Origin-Embedder-Policy', value: 'require-corp' },
      ],
    }];
  },
};
```

</details>

<details>
<summary><strong>Express</strong></summary>

```javascript
app.use((req, res, next) => {
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
  next();
});
```

</details>

<details>
<summary><strong>nginx</strong></summary>

```nginx
location / {
    add_header Cross-Origin-Opener-Policy  "same-origin" always;
    add_header Cross-Origin-Embedder-Policy "require-corp" always;
}
```

</details>

### Self-Hosting WASM Files (for Multi-Threading)

When using multi-threading, WASM files must be same-origin. Copy them from `node_modules` into your static assets:

```bash
# One-time copy — add to your build script
cp -r node_modules/cytoscape-euler-wasm/dist/wasm         public/wasm
cp -r node_modules/cytoscape-euler-wasm/dist/wasm-threaded public/wasm-threaded
cp    node_modules/cytoscape-euler-wasm/dist/euler-worker.umd.js public/euler-worker.umd.js
```

Then point the layout at your local copies:

```javascript
cy.layout({
  name: 'euler-wasm',
  wasmPath: '/wasm/',
  wasmPathThreaded: '/wasm-threaded/',
  workerUrl: '/euler-worker.umd.js',
  // threadCount defaults to 0 (auto) — uses min(cores, 4)
}).run();
```

> **Single-threaded mode needs none of this** — it works out of the box from the unpkg CDN with zero configuration.

## Configuration Reference

### Physics Parameters

| Parameter | Default | Per-Element | Description |
|-----------|---------|:-----------:|-------------|
| `springLength` | 80 | ✅ `edge => number` | Ideal edge length |
| `springCoeff` | 0.0008 | ⚠️ global only | Spring stiffness (per-edge not yet in WASM) |
| `mass` | 4 | ✅ `node => number` | Node mass |
| `gravity` | -1.2 | | Repulsion (negative = repel) |
| `pull` | 0.001 | | Pull toward origin |
| `dragCoeff` | 0.02 | | Velocity damping |
| `timeStep` | 20 | | Integration step |
| `maxIterations` | 1000 | | Max iterations |
| `movementThreshold` | 1 | | Convergence threshold |
| `theta` | 0.666 | | Barnes-Hut approximation |
| `maxSimulationTime` | 60000 | | Max time (ms) |

### Layout Options

| Parameter | Default | Description |
|-----------|---------|-------------|
| `fit` | `true` | Fit viewport to graph after layout |
| `padding` | `30` | Padding around fitted graph (px) |
| `animate` | `false` | `false` or `'end'` (`true` NOT supported) |
| `animationDuration` | `500` | Duration when `animate: 'end'` (ms) |
| `animationEasing` | `undefined` | CSS easing for `animate: 'end'` (e.g. `'ease-in-out'`) |
| `randomize` | `false` | Randomize initial positions |
| `boundingBox` | `undefined` | Constrain layout area (`{x1,y1,x2,y2}` or `{x1,y1,w,h}`) |

### WASM Options

| Parameter | Default | Description |
|-----------|---------|-------------|
| `threadCount` | `0` | Thread count (`0` = auto). Requires COOP/COEP. |
| `wasmPath` | unpkg CDN | Base URL for standard WASM files (trailing `/`) |
| `wasmPathThreaded` | unpkg CDN | Base URL for threaded WASM files (same-origin required) |
| `workerUrl` | unpkg CDN | URL to the worker script |

### Callbacks & Telemetry

| Parameter | Default | Signature | Description |
|-----------|---------|-----------|-------------|
| `progress` | `undefined` | `({ percent, iteration, elapsedMs }) => void` | Called periodically during computation |
| `ready` | `undefined` | `() => void` | Positions computed (before animation) |
| `stop` | `undefined` | `() => void` | Layout fully complete (after animation) |
| `telemetry` | `false` | | Enable performance telemetry |
| `onTelemetry` | `undefined` | `(data) => void` | Detailed perf data (requires `telemetry: true`) |

### Telemetry Data

| Field | Type | Description |
|-------|------|-------------|
| `totalMs` | `number` | Wall-clock time including Worker message overhead |
| `wasmMs` | `number` | WASM computation time (measured in Worker) |
| `iterations` | `number` | Simulation iterations completed |
| `converged` | `boolean` | Converged below `movementThreshold` |
| `threaded` | `boolean` | Multi-threaded WASM was used |
| `threadCount` | `number` | Threads used |
| `nodeCount` | `number` | Nodes in layout |
| `edgeCount` | `number` | Edges in layout |

## TypeScript

Full type declarations are included. Import the options type:

```typescript
import type { EulerWasmLayoutOptions, TelemetryData, ProgressData } from 'cytoscape-euler-wasm';
```

## SSR / Node.js

The module is **safe to import** on the server — no browser APIs are called at import time. However, `run()` requires a browser environment (Web Workers, `fetch`, WASM). Calling `run()` outside a browser throws a clear error.

**Next.js (App Router):**

```tsx
'use client';
import { useEffect, useRef } from 'react';
import cytoscape from 'cytoscape';
import eulerWasm from 'cytoscape-euler-wasm';

cytoscape.use(eulerWasm);

export default function Graph() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const cy = cytoscape({ container: ref.current, /* ... */ });
    cy.layout({ name: 'euler-wasm' }).run();
    return () => cy.destroy();
  }, []);
  return <div ref={ref} style={{ width: '100%', height: '100%' }} />;
}
```

**Nuxt / generic SSR:** Guard with a client-only check (`process.client`, `typeof window !== 'undefined'`, or a `<ClientOnly>` wrapper).

## Building From Source

### Prerequisites

```bash
# Rust + wasm32 target
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
rustup target add wasm32-unknown-unknown

# wasm-pack
cargo install wasm-pack

# For threading: nightly + rust-src
rustup toolchain install nightly
rustup component add rust-src --toolchain nightly
```

### Build WASM Binaries

```bash
cd rust
./build-all.sh           # Both builds
./build-all.sh standard  # Standard only
./build-all.sh threaded  # Threaded only
```

Output goes to `dist/wasm/` and `dist/wasm-threaded/`.

### Build JS Package

```bash
npm install
npm run build
```

Produces `dist/cytoscape-euler-wasm.umd.js` (~7 KB) and `dist/euler-worker.umd.js` (~2.5 KB).

### Run Tests

```bash
cd rust
cargo test                      # Standard (sequential)
cargo test --features parallel  # Threaded (Rayon)
```

48 tests total (46 pass, 2 ignored benchmarks).

## Running the Demo Locally

```bash
git clone https://github.com/alex-poloziouk/cytoscape-euler-wasm.git
cd cytoscape-euler-wasm
npm install
npm start
```

Open http://localhost:8080/demo/

The `npm start` script runs [local-web-server](https://github.com/lwsjs/local-web-server) with COOP/COEP headers required for multi-threaded WASM (SharedArrayBuffer). Without these headers the demo falls back to single-threaded WASM.

## Publishing to npm

```bash
npm login          # one-time
npm publish --access public
```

The `prepublishOnly` script runs the build automatically before publishing.

Alternatively, the repo includes a GitHub Actions workflow (`.github/workflows/publish.yml`) that publishes with [provenance](https://docs.npmjs.com/generating-provenance-statements) when you create a GitHub Release. To use it, add an npm Automation token as a repo secret named `NPM_TOKEN`.

## Architecture

```
cytoscape-euler-wasm/
├── src/                     # Package source (ESM)
│   ├── index.js             # Registration: cytoscape('layout', 'euler-wasm', Layout)
│   ├── layout.js            # Layout class (constructor, run, stop, destroy)
│   ├── defaults.js          # Default options + CDN path constants
│   ├── prepare.js           # Extract nodes/edges, resolve per-element functions
│   ├── wasm-service.js      # Worker lifecycle, message passing
│   └── euler-worker.js      # Web Worker (threaded → standard WASM fallback)
├── types/
│   └── index.d.ts           # TypeScript declarations
├── rust/                    # Rust WASM source
│   ├── src/
│   │   ├── lib.rs           # WASM entry point + bindings
│   │   ├── types.rs         # Config, body, spring types
│   │   ├── quadtree.rs      # Barnes-Hut O(n log n) tree
│   │   ├── spring.rs        # Spring force calculations
│   │   ├── drag.rs          # Drag/damping forces
│   │   ├── integrate.rs     # Euler integration
│   │   ├── tick.rs          # Simulation tick
│   │   ├── parallel.rs      # .iter() vs .par_iter() toggle
│   │   └── tests.rs         # 48 tests matching JS output
│   ├── Cargo.toml
│   └── build-all.sh         # Build script (standard + threaded)
├── dist/                    # Built artifacts (shipped in npm package)
│   ├── cytoscape-euler-wasm.umd.js   # UMD bundle for <script> tags
│   ├── euler-worker.umd.js           # Bundled worker script
│   ├── wasm/                          # Standard build (~89 KB)
│   └── wasm-threaded/                 # Threaded build (~160 KB)
├── demo/                    # Plain JS demo (no framework, no bundler)
│   ├── index.html
│   ├── demo.js
│   └── demo.css
├── esbuild.config.mjs       # Build config (UMD bundles)
├── .github/workflows/
│   ├── deploy.yml            # CI: build WASM + deploy to Pages
│   └── publish.yml           # CI: publish to npm with provenance
└── package.json
```

## License

MIT
