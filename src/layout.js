/**
 * Cytoscape.js layout extension for euler-wasm.
 *
 * Follows the Cytoscape layout extension contract:
 *   - constructor(options) — receives merged user + default options
 *   - run()     → returns `this` (sync), runs layout asynchronously
 *   - stop()    → cancels in-progress layout
 *   - destroy() → releases resources
 *
 * Pattern based on cytoscape-elk: run() returns `this` immediately,
 * async computation happens in a Promise, and positions are applied
 * via `eles.nodes().layoutPositions()` which handles fit, animate,
 * padding, and fires layoutstart/layoutready/layoutstop events.
 *
 * NOTE: animate:true is NOT supported. This layout runs in a Web Worker,
 * so intermediate positions cannot be rendered frame-by-frame. Use the
 * `progress` callback for progress indication. animate:'end' IS supported.
 */

import defaults from './defaults.js';
import { WasmService } from './wasm-service.js';
import { extractNodes, extractEdges, toRustConfig } from './prepare.js';

/** Key for the singleton WasmService stored on cy.scratch() */
const SCRATCH_KEY = '_eulerWasmService';

/**
 * Get or create a singleton WasmService for the given Cytoscape instance.
 * If the requested options (threadCount, paths) differ from the existing
 * service, the old one is destroyed and a new one is created.
 */
function getService(cy, options) {
  let service = cy.scratch(SCRATCH_KEY);

  // Reinitialize if threadCount or paths changed
  if (service && !service._destroyed) {
    const o = service._options;
    if (
      o.threadCount !== (options.threadCount || 0) ||
      o.wasmPath !== options.wasmPath ||
      o.wasmPathThreaded !== options.wasmPathThreaded ||
      o.workerUrl !== options.workerUrl
    ) {
      service.destroy();
      service = null;
    }
  }

  if (!service || service._destroyed) {
    service = new WasmService({
      workerUrl: options.workerUrl,
      wasmPath: options.wasmPath,
      wasmPathThreaded: options.wasmPathThreaded,
      threadCount: options.threadCount || 0,
      telemetry: options.telemetry || false,
    });
    cy.scratch(SCRATCH_KEY, service);
  }

  return service;
}

/**
 * Layout constructor.
 *
 * Uses function-style constructor (not ES6 class) because Cytoscape.js
 * internally instantiates layouts via `Layout.call(this, options)` without
 * `new`, which is incompatible with ES6 class syntax.
 *
 * @param {Object} options - Merged user + Cytoscape options.
 *   Cytoscape automatically injects `cy` and `eles` properties.
 */
function EulerWasmLayout(options) {
  this.options = { ...defaults, ...options };
  this._running = false;
  this._promise = null;

  // animate:true → downgrade to 'end' with a warning
  if (this.options.animate === true) {
    console.warn(
      '[euler-wasm] animate:true is not supported — the layout runs asynchronously ' +
      'in a Web Worker and cannot render intermediate frames. Use the `progress` ' +
      'callback for progress indication, or animate:"end" to animate nodes to ' +
      'their final positions. Falling back to animate:"end".'
    );
    this.options.animate = 'end';
  }
}

/**
 * Run the layout.
 *
 * Returns `this` synchronously (Cytoscape convention for chaining).
 * The actual computation runs asynchronously in a Web Worker.
 * Positions are applied via `eles.nodes().layoutPositions()`, which
 * fires layoutstart/layoutready/layoutstop events automatically.
 *
 * @returns {EulerWasmLayout} this (for chaining)
 */
EulerWasmLayout.prototype.run = function () {
  const options = this.options;
  const cy = options.cy;
  const eles = options.eles;

  // Early check: the layout requires browser APIs (Web Worker, fetch, Blob).
  // The module can be safely *imported* in Node.js/SSR — only run() needs a browser.
  if (typeof Worker === 'undefined') {
    throw new Error(
      '[euler-wasm] This layout requires a browser environment with Web Worker support. '
      + 'In SSR frameworks (Next.js, Nuxt, etc.), ensure the layout runs client-side only.'
    );
  }

  this._running = true;
  const layout = this;

  this._promise = (async () => {
    try {
      // Get or create singleton WASM service for this cy instance
      const service = getService(cy, options);

      if (!service.ready) {
        const ready = await service.init();
        if (!ready) {
          throw new Error('WASM Worker initialization timed out');
        }
      }

      if (!layout._running) return; // stop() was called during init

      // Extract data from Cytoscape elements
      // Per-element functions are resolved here on the main thread
      const nodes = extractNodes(options, eles);
      const edges = extractEdges(options, eles);
      const config = toRustConfig(options);

      if (!layout._running) return; // stop() was called

      // Run layout computation in the Worker
      const startTime = performance.now();
      const result = await service.run(nodes, edges, config, options.progress);
      const totalMs = performance.now() - startTime;

      if (!layout._running) return; // stop() was called

      // Build position lookup map
      const posMap = new Map();
      for (const pos of result.positions) {
        posMap.set(pos.id, pos);
      }

      // Apply positions via layoutPositions — handles fit, animate, padding,
      // and fires layoutstart/layoutready/layoutstop events.
      eles.nodes().layoutPositions(layout, options, (node) => {
        const pos = posMap.get(node.id());
        return pos ? { x: pos.x, y: pos.y } : node.position();
      });

      // Telemetry callback
      if (options.telemetry && typeof options.onTelemetry === 'function') {
        options.onTelemetry({
          totalMs,
          wasmMs: result.time_ms,
          iterations: result.iterations,
          converged: result.converged,
          threaded: result.threaded,
          threadCount: result.threadCount,
          nodeCount: nodes.length,
          edgeCount: edges.length,
        });
      }
    } catch (err) {
      console.error('[euler-wasm] Layout failed:', err);

      // Emit layoutstop so consumers listening for completion (e.g.
      // layout.one('layoutstop', resolve)) don't hang forever.
      // layoutPositions() was never called, so we emit manually.
      layout.emit('layoutstop');
    } finally {
      layout._running = false;
    }
  })();

  return this; // Cytoscape convention
};

/**
 * Stop the current layout run.
 * The Worker continues to completion (stopping a WASM computation mid-run
 * is not feasible), but positions will not be applied.
 *
 * @returns {EulerWasmLayout} this
 */
EulerWasmLayout.prototype.stop = function () {
  this._running = false;
  return this;
};

/**
 * Destroy the layout instance.
 * Does NOT destroy the shared WasmService — it persists on cy.scratch()
 * for reuse across layout runs. Call cy.scratch('_eulerWasmService')?.destroy()
 * to fully clean up when the Cytoscape instance is being destroyed.
 *
 * @returns {EulerWasmLayout} this
 */
EulerWasmLayout.prototype.destroy = function () {
  this._running = false;
  return this;
};

export default EulerWasmLayout;
