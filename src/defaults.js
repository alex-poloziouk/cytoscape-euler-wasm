/**
 * Default options for cytoscape-euler-wasm layout.
 *
 * Physics parameters match cytoscape-euler 1.2.3 defaults.
 * Per-element parameters (springLength, springCoeff, mass) accept either
 * a flat number or a function (element => number), following the original
 * cytoscape-euler API (Hybrid approach: functions are resolved on the main
 * thread before data is sent to the Web Worker).
 *
 * NOTE: animate:true is NOT supported. This layout runs asynchronously in a
 * Web Worker — intermediate positions cannot be rendered frame-by-frame.
 * Use the `progress` callback for progress indication. animate:'end' IS
 * supported and will smoothly animate nodes to their final positions.
 */

const PKG_NAME = 'cytoscape-euler-wasm';

/**
 * Package version — replaced at build time by esbuild's `define` option.
 * Falls back to 'latest' when consuming the raw ESM source directly.
 */
const PKG_VERSION = typeof __EULER_WASM_VERSION__ !== 'undefined'
  ? __EULER_WASM_VERSION__   // eslint-disable-line no-undef
  : 'latest';

const CDN_BASE = `https://unpkg.com/${PKG_NAME}@${PKG_VERSION}`;

const defaults = {
  // === Euler physics parameters ===
  // Per-element: accepts function(ele) or number (Hybrid approach).
  // Functions are resolved once before layout runs — the WASM engine
  // receives flat numeric arrays.
  //
  // NOTE: springCoeff is treated as a GLOBAL value by the Rust engine.
  // Passing a function for springCoeff is accepted (for API compat with
  // cytoscape-euler) but will fall back to the default 0.0008.
  // Per-edge customization is supported for springLength only.
  springLength: 80,        // edge => number | number
  springCoeff: 0.0008,     // number (global only — per-edge not yet supported in WASM)
  mass: 4,                 // node => number | number

  // Global physics constants
  gravity: -1.2,
  pull: 0.001,
  theta: 0.666,
  dragCoeff: 0.02,
  movementThreshold: 1,
  timeStep: 20,
  maxIterations: 1000,
  maxSimulationTime: 60000,

  // === Cytoscape layout standard options ===
  fit: true,
  padding: 30,
  animate: false,          // 'end' supported; true NOT supported (Worker-based)
  animationDuration: 500,
  animationEasing: undefined,
  boundingBox: undefined,
  randomize: false,

  // === WASM / Worker options ===
  // Thread count for Rayon-based multi-threading.
  // 0 = auto-detect (min(cores, 4)). Requires SharedArrayBuffer + COOP/COEP.
  threadCount: 0,

  // Paths to WASM binaries. Defaults to unpkg CDN.
  // For threaded WASM, files MUST be served from the same origin (sub-workers
  // cannot be loaded cross-origin). Override these paths when self-hosting.
  wasmPath: `${CDN_BASE}/dist/wasm/`,
  wasmPathThreaded: `${CDN_BASE}/dist/wasm-threaded/`,
  workerUrl: `${CDN_BASE}/dist/euler-worker.umd.js`,

  // === Callbacks ===
  // Progress callback — called periodically during layout computation.
  // Signature: ({ percent: number, iteration: number, elapsedMs: number }) => void
  progress: undefined,

  // Standard Cytoscape layout callbacks (also fired as events on the layout).
  ready: undefined,        // () => void — layout positions computed
  stop: undefined,         // () => void — layout fully applied (after animation)

  // === Telemetry ===
  // When enabled, detailed performance data is logged and/or passed to onTelemetry.
  telemetry: false,
  onTelemetry: undefined,  // (data: TelemetryData) => void
};

export default defaults;
export { PKG_NAME, PKG_VERSION, CDN_BASE };
