/**
 * esbuild configuration for cytoscape-euler-wasm.
 *
 * Produces two outputs:
 *   1. dist/cytoscape-euler-wasm.umd.js — IIFE bundle for <script> tag usage
 *   2. dist/euler-worker.umd.js — Standalone worker script (no ES module syntax)
 *
 * ESM consumers import src/index.js directly (no bundling needed).
 * The UMD bundle auto-registers if a `cytoscape` global is detected.
 */

import * as esbuild from 'esbuild';
import { readFileSync } from 'fs';

const pkg = JSON.parse(readFileSync('./package.json', 'utf8'));

// ── 1. Main layout library (IIFE for <script> tags) ─────────────────────

await esbuild.build({
  entryPoints: ['src/index.js'],
  bundle: true,
  format: 'iife',
  globalName: 'cytoscapeEulerWasm',
  outfile: 'dist/cytoscape-euler-wasm.umd.js',
  minify: true,
  sourcemap: true,
  target: ['es2020'],
  define: {
    '__EULER_WASM_VERSION__': JSON.stringify(pkg.version),
  },
  // cytoscape is a peer dependency but not imported in our code —
  // it's injected via options.cy. No external needed.
  footer: {
    // Auto-register with the cytoscape global after IIFE executes
    js: ';if(typeof cytoscape!=="undefined")cytoscapeEulerWasm.default(cytoscape);',
  },
});

console.log(`✓ dist/cytoscape-euler-wasm.umd.js (v${pkg.version})`);

// ── 2. Worker script (IIFE, standalone) ──────────────────────────────────

await esbuild.build({
  entryPoints: ['src/euler-worker.js'],
  bundle: true,
  format: 'iife',
  outfile: 'dist/euler-worker.umd.js',
  minify: true,
  sourcemap: true,
  target: ['es2020'],
});

console.log('✓ dist/euler-worker.umd.js');

console.log('\nBuild complete.');
