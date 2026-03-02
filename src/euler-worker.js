/**
 * Web Worker for WASM Euler layout — cytoscape-euler-wasm
 *
 * This worker is loaded via fetch → Blob URL to work from any origin
 * (including CDN). All WASM file paths are received from the main thread
 * as absolute URLs — the worker never assumes relative paths.
 *
 * Fallback chain:
 *   1. Threaded WASM (multi-core via Rayon, requires SharedArrayBuffer + COOP/COEP)
 *   2. Standard WASM (single-core)
 *
 * Threading note: Threaded WASM uses wasm-bindgen-rayon which spawns
 * sub-workers via `new Worker(import.meta.url)`. This only works when
 * the WASM files are served from the same origin as the page. CDN-hosted
 * threaded WASM will fail at sub-worker creation and gracefully fall back
 * to standard single-threaded WASM.
 */

/* eslint-env worker */
/* global self, performance, navigator */

let wasmModule = null;
let isThreaded = false;
let threadCount = 0;
let debug = false;

function log(...args) {
  if (debug) console.log('[euler-worker]', ...args);
}

/**
 * Detect SharedArrayBuffer + Atomics + cross-origin isolation.
 * All three are required for threaded WASM (Rayon thread pool).
 */
function detectThreadingSupport() {
  try {
    return (
      typeof SharedArrayBuffer !== 'undefined' &&
      typeof Atomics !== 'undefined' &&
      typeof crossOriginIsolated !== 'undefined' &&
      crossOriginIsolated === true
    );
  } catch (e) {
    return false;
  }
}

/**
 * Load threaded WASM via direct import() — preserves import.meta.url
 * so wasm-bindgen-rayon can locate its workerHelpers.js snippet and
 * spawn Rayon thread-pool workers.
 */
async function loadThreadedWasm(wasmPathThreaded, requestedThreads) {
  const jsUrl = wasmPathThreaded + 'euler_wasm.js';
  const wasmUrl = wasmPathThreaded + 'euler_wasm_bg.wasm';

  log('Loading threaded WASM from', jsUrl);

  // Direct import — import.meta.url in the module will be jsUrl,
  // allowing wasm-bindgen-rayon's workerHelpers.js to resolve correctly.
  const module = await import(jsUrl);
  await module.default({ module_or_path: wasmUrl });

  if (module.initThreadPool) {
    const maxCores = navigator.hardwareConcurrency || 4;
    threadCount = requestedThreads > 0
      ? Math.min(maxCores, requestedThreads)
      : Math.min(maxCores, 4);
    log(`Initializing thread pool: ${threadCount} of ${maxCores} cores`);
    await module.initThreadPool(threadCount);
    isThreaded = true;
  }

  return module;
}

/**
 * Load standard (single-threaded) WASM via fetch → Blob → import().
 * This approach avoids CORS issues when the worker is loaded cross-origin.
 */
async function loadStandardWasm(wasmPath) {
  const jsUrl = wasmPath + 'euler_wasm.js';
  const wasmUrl = wasmPath + 'euler_wasm_bg.wasm';

  log('Loading standard WASM from', jsUrl);

  const response = await fetch(jsUrl);
  if (!response.ok) throw new Error(`Failed to fetch ${jsUrl}: ${response.status}`);
  const jsText = await response.text();
  const blob = new Blob([jsText], { type: 'application/javascript' });
  const blobUrl = URL.createObjectURL(blob);

  try {
    const module = await import(blobUrl);
    await module.default({ module_or_path: wasmUrl });
    isThreaded = false;
    threadCount = 1;
    return module;
  } finally {
    URL.revokeObjectURL(blobUrl);
  }
}

/**
 * Initialize WASM with fallback chain: threaded → standard.
 */
async function initWasm(options) {
  const { wasmPath, wasmPathThreaded, threadCount: requestedThreads } = options;
  const loadStart = performance.now();

  // Try threaded first if supported and path provided
  if (detectThreadingSupport() && wasmPathThreaded) {
    try {
      wasmModule = await loadThreadedWasm(wasmPathThreaded, requestedThreads || 0);
      const loadTimeMs = performance.now() - loadStart;
      log(`Threaded WASM ready: ${threadCount} threads in ${loadTimeMs.toFixed(1)}ms`);
      self.postMessage({ type: 'ready', threaded: true, threadCount, loadTimeMs });
      return;
    } catch (err) {
      log('Threaded WASM failed, falling back to standard:', err.message);
    }
  }

  // Standard (single-threaded) fallback
  try {
    wasmModule = await loadStandardWasm(wasmPath);
    const loadTimeMs = performance.now() - loadStart;
    log(`Standard WASM ready in ${loadTimeMs.toFixed(1)}ms`);
    self.postMessage({ type: 'ready', threaded: false, threadCount: 1, loadTimeMs });
  } catch (err) {
    console.error('[euler-worker] Failed to load any WASM variant:', err);
    self.postMessage({ type: 'error', error: err.message });
  }
}

// ── Performance tracking ─────────────────────────────────────────────────
let runCount = 0;
let totalTimeMs = 0;

// ── Message handler ──────────────────────────────────────────────────────
self.onmessage = async function (e) {
  const { type, id } = e.data;

  if (type === 'set-debug') {
    debug = !!e.data.debug;
    return;
  }

  if (type === 'init') {
    debug = !!e.data.debug;
    await initWasm(e.data);
    return;
  }

  if (type === 'run') {
    if (!wasmModule) {
      self.postMessage({ type: 'error', id, error: 'WASM not loaded' });
      return;
    }

    try {
      const { nodes, edges, config } = e.data;
      const startTime = performance.now();

      // Progress callback — posts messages to main thread
      const progressCallback = (percent, iteration, elapsedMs) => {
        self.postMessage({ type: 'progress', id, percent, iteration, elapsedMs });
      };

      const result = wasmModule.run_euler_layout(nodes, edges, config, progressCallback);
      const wallTimeMs = performance.now() - startTime;

      // Perf tracking
      runCount++;
      totalTimeMs += wallTimeMs;
      if (debug) {
        const msPerIter = wallTimeMs / result.iterations;
        log(
          `Run #${runCount}: ${nodes.length}n ${edges.length}e → ` +
          `${result.iterations} iter in ${wallTimeMs.toFixed(1)}ms ` +
          `(${msPerIter.toFixed(2)}ms/iter) ` +
          `${result.converged ? 'converged' : 'max-iter'} ` +
          `${isThreaded ? `${threadCount}T` : '1T'}`
        );
      }

      self.postMessage({
        type: 'result',
        id,
        result: {
          positions: result.positions,
          iterations: result.iterations,
          converged: result.converged,
          time_ms: wallTimeMs,
          threaded: isThreaded,
          threadCount,
        },
      });
    } catch (err) {
      console.error('[euler-worker] Layout error:', err);
      self.postMessage({ type: 'error', id, error: err.message });
    }
  }
};
