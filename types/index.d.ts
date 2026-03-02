/**
 * TypeScript declarations for cytoscape-euler-wasm.
 *
 * Provides type safety for layout options, telemetry data, and the
 * registration function.
 */

import cytoscape from 'cytoscape';

declare const cytoscapeEulerWasm: cytoscape.Ext;
export default cytoscapeEulerWasm;

export declare class EulerWasmLayout {
  constructor(options: EulerWasmLayoutOptions);
  run(): EulerWasmLayout;
  stop(): EulerWasmLayout;
  destroy(): EulerWasmLayout;
}

/**
 * Progress data passed to the `progress` callback during layout computation.
 */
export interface ProgressData {
  /** Approximate completion percentage (0–100) */
  percent: number;
  /** Current iteration number */
  iteration: number;
  /** Elapsed time in milliseconds since layout start */
  elapsedMs: number;
}

/**
 * Telemetry data passed to the `onTelemetry` callback after layout completes.
 */
export interface TelemetryData {
  /** Wall-clock time including Worker message overhead (ms) */
  totalMs: number;
  /** WASM computation time measured in the Worker (ms) */
  wasmMs: number;
  /** Number of simulation iterations completed */
  iterations: number;
  /** Whether the simulation converged below movementThreshold */
  converged: boolean;
  /** Whether multi-threaded WASM was used */
  threaded: boolean;
  /** Number of threads used (1 for standard, >1 for threaded) */
  threadCount: number;
  /** Number of nodes in the layout */
  nodeCount: number;
  /** Number of edges in the layout */
  edgeCount: number;
}

/**
 * Layout options for cytoscape-euler-wasm.
 *
 * Physics parameters match cytoscape-euler 1.2.3 defaults.
 * Per-element parameters (springLength, springCoeff, mass) accept
 * either a flat number or a function (Hybrid approach).
 */
export interface EulerWasmLayoutOptions {
  /** Layout name — must be 'euler-wasm' */
  name: 'euler-wasm';

  // ── Euler physics parameters ───────────────────────────────────────

  /**
   * Ideal spring (edge) length.
   * Accepts a number or a function `(edge) => number` for per-edge values.
   * @default 80
   */
  springLength?: number | ((edge: cytoscape.EdgeSingular) => number);

  /**
   * Spring coefficient (stiffness).
   * Currently treated as a **global** value by the WASM engine.
   * A function is accepted for API compatibility with cytoscape-euler
   * but falls back to the default 0.0008 (per-edge coeff is not yet
   * supported in the Rust engine).
   * @default 0.0008
   */
  springCoeff?: number | ((edge: cytoscape.EdgeSingular) => number);

  /**
   * Node mass.
   * Accepts a number or a function `(node) => number` for per-node values.
   * @default 4
   */
  mass?: number | ((node: cytoscape.NodeSingular) => number);

  /** Gravity (negative = repulsion). @default -1.2 */
  gravity?: number;
  /** Pull toward origin. @default 0.001 */
  pull?: number;
  /** Barnes-Hut theta (accuracy). @default 0.666 */
  theta?: number;
  /** Drag coefficient. @default 0.02 */
  dragCoeff?: number;
  /** Convergence threshold. @default 1 */
  movementThreshold?: number;
  /** Simulation time step. @default 20 */
  timeStep?: number;
  /** Maximum iterations. @default 1000 */
  maxIterations?: number;
  /** Maximum simulation time (ms). @default 60000 */
  maxSimulationTime?: number;

  // ── Cytoscape layout standard options ──────────────────────────────

  /** Fit viewport to graph after layout. @default true */
  fit?: boolean;
  /** Padding around fitted graph (px). @default 30 */
  padding?: number;
  /**
   * Animation mode.
   * - `false`: positions applied instantly
   * - `'end'`: animate to final positions
   * - `true`: NOT SUPPORTED (falls back to 'end' with console warning)
   * @default false
   */
  animate?: boolean | 'end';
  /** Animation duration when animate:'end' (ms). @default 500 */
  animationDuration?: number;
  /** Animation easing when animate:'end'. */
  animationEasing?: string;
  /** Constrain layout to bounding box. */
  boundingBox?: cytoscape.BoundingBox12 | cytoscape.BoundingBoxWH;
  /** Randomize initial positions. @default false */
  randomize?: boolean;

  // ── WASM / Worker options ──────────────────────────────────────────

  /**
   * Thread count for Rayon multi-threading.
   * 0 = auto-detect (min(cores, 4)).
   * Requires SharedArrayBuffer + COOP/COEP headers.
   * @default 0
   */
  threadCount?: number;

  /**
   * Base URL for standard (single-threaded) WASM files.
   * Must end with `/`. Defaults to unpkg CDN.
   */
  wasmPath?: string;

  /**
   * Base URL for threaded WASM files.
   * Must end with `/`. Must be same-origin for thread pool sub-workers.
   * Defaults to unpkg CDN (will fall back to standard if cross-origin).
   */
  wasmPathThreaded?: string;

  /**
   * URL to the euler-worker.js script.
   * Fetched via `fetch()` and loaded as a Blob URL Worker.
   * Defaults to unpkg CDN.
   */
  workerUrl?: string;

  // ── Callbacks ──────────────────────────────────────────────────────

  /**
   * Progress callback — called periodically during layout computation.
   * Not available for single-iteration runs on very small graphs.
   */
  progress?: (data: ProgressData) => void;

  /** Callback when layout positions are computed (before animation). */
  ready?: () => void;

  /** Callback when layout is fully complete (after animation). */
  stop?: () => void;

  // ── Telemetry ──────────────────────────────────────────────────────

  /** Enable performance telemetry logging. @default false */
  telemetry?: boolean;

  /** Callback receiving detailed performance data after layout completes. */
  onTelemetry?: (data: TelemetryData) => void;
}

// ── Cytoscape module augmentation ────────────────────────────────────────
// Not augmenting LayoutOptions here — adding `name: 'euler-wasm'` would
// intersect with the existing `name: string` and narrow it, breaking other
// layout names. Consumers should use EulerWasmLayoutOptions directly.
