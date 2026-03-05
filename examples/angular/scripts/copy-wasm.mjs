/**
 * Post-install script: copies WASM files from cytoscape-euler-wasm
 * into public/ for same-origin serving (required for multi-threading).
 *
 * Run automatically via: npm install → postinstall
 * Or manually: node scripts/copy-wasm.mjs
 */

import { cpSync, mkdirSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const pkg = resolve(root, 'node_modules/cytoscape-euler-wasm/dist');
const pub = resolve(root, 'public');

if (!existsSync(pkg)) {
  console.log('⚠  cytoscape-euler-wasm not installed yet — skipping WASM copy');
  process.exit(0);
}

// Copy standard WASM build
const wasmSrc = resolve(pkg, 'wasm');
const wasmDst = resolve(pub, 'wasm');
if (existsSync(wasmSrc)) {
  mkdirSync(wasmDst, { recursive: true });
  cpSync(wasmSrc, wasmDst, { recursive: true });
  console.log('✓ Copied dist/wasm/ → public/wasm/');
}

// Copy threaded WASM build
const threadedSrc = resolve(pkg, 'wasm-threaded');
const threadedDst = resolve(pub, 'wasm-threaded');
if (existsSync(threadedSrc)) {
  mkdirSync(threadedDst, { recursive: true });
  cpSync(threadedSrc, threadedDst, { recursive: true });
  console.log('✓ Copied dist/wasm-threaded/ → public/wasm-threaded/');
}

// Copy bundled worker script
const workerSrc = resolve(pkg, 'euler-worker.umd.js');
const workerDst = resolve(pub, 'euler-worker.umd.js');
if (existsSync(workerSrc)) {
  cpSync(workerSrc, workerDst);
  console.log('✓ Copied dist/euler-worker.umd.js → public/euler-worker.umd.js');
}

console.log('\nWASM files ready for same-origin serving (multi-threading enabled).\n');
