/**
 * Internal WASM service — manages Worker lifecycle and message passing.
 *
 * Used by the Layout class, not intended for direct consumer use.
 * One service instance is shared per Cytoscape instance (singleton on cy.scratch).
 * The Worker is loaded via fetch → Blob URL for cross-origin compatibility.
 */

export class WasmService {
  /**
   * @param {Object} options
   * @param {string} options.workerUrl - URL to the euler-worker script
   * @param {string} options.wasmPath - Base URL for standard WASM files (trailing /)
   * @param {string} options.wasmPathThreaded - Base URL for threaded WASM files (trailing /)
   * @param {number} options.threadCount - Thread count (0 = auto)
   * @param {boolean} options.telemetry - Enable debug logging in Worker
   */
  constructor(options) {
    this._worker = null;
    this._workerReady = false;
    this._pendingCallbacks = new Map();
    this._nextCallId = 1;
    this._progressCallback = null;
    this._options = { ...options };
    this._threadCount = 0;
    this._threaded = false;
    this._destroyed = false;
    this._blobUrl = null;
    this._initFailed = false;
  }

  get ready() { return this._workerReady; }
  get threadCount() { return this._threadCount; }
  get threaded() { return this._threaded; }

  /**
   * Initialize the Worker and wait for WASM to load.
   * @param {number} [timeoutMs=15000] - Maximum time to wait for Worker ready
   * @returns {Promise<boolean>} true if ready, false if timed out
   */
  async init(timeoutMs = 15000) {
    await this._createWorker();
    return this._waitForReady(timeoutMs);
  }

  /**
   * Create the Web Worker from the configured workerUrl.
   * Uses fetch → Blob URL to work cross-origin (e.g. unpkg CDN).
   */
  async _createWorker() {
    // Terminate existing worker if any
    if (this._worker) {
      for (const [, cb] of this._pendingCallbacks) {
        cb.reject(new Error('Worker reinitialized'));
      }
      this._pendingCallbacks.clear();
      this._worker.terminate();
      this._worker = null;
      this._workerReady = false;
    }

    const { workerUrl, wasmPath, wasmPathThreaded, threadCount, telemetry } = this._options;

    // Resolve all paths to absolute URLs — the worker runs from a Blob URL
    // so it has no base URL for resolving relative paths.
    const base = typeof document !== 'undefined' ? document.baseURI : undefined;
    const resolveUrl = (url) => new URL(url, base).href;

    // Fetch worker script and create Blob URL
    const response = await fetch(workerUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch worker script from ${workerUrl}: ${response.status}`);
    }
    const text = await response.text();
    const blob = new Blob([text], { type: 'application/javascript' });
    this._blobUrl = URL.createObjectURL(blob);

    this._worker = new Worker(this._blobUrl);

    this._worker.onmessage = (e) => this._handleMessage(e.data);
    this._worker.onerror = (e) => {
      console.error('[euler-wasm] Worker error:', e);
    };

    // Send init message with absolute WASM paths
    this._worker.postMessage({
      type: 'init',
      wasmPath: resolveUrl(wasmPath),
      wasmPathThreaded: resolveUrl(wasmPathThreaded),
      threadCount: threadCount || 0,
      debug: telemetry || false,
    });
  }

  /**
   * Handle messages from the Worker.
   */
  _handleMessage(data) {
    const { type, id } = data;

    if (type === 'ready') {
      this._workerReady = true;
      this._threadCount = data.threadCount || 1;
      this._threaded = !!data.threaded;
      // Safe to revoke blob URL now — Worker is fully loaded
      if (this._blobUrl) {
        URL.revokeObjectURL(this._blobUrl);
        this._blobUrl = null;
      }
    } else if (type === 'progress' && this._progressCallback) {
      this._progressCallback({
        percent: data.percent,
        iteration: data.iteration,
        elapsedMs: data.elapsedMs,
      });
    } else if (type === 'result' && id !== undefined) {
      const cb = this._pendingCallbacks.get(id);
      if (cb) {
        cb.resolve(data.result);
        this._pendingCallbacks.delete(id);
      }
    } else if (type === 'error') {
      if (id !== undefined) {
        const cb = this._pendingCallbacks.get(id);
        if (cb) {
          cb.reject(new Error(data.error || 'Worker error'));
          this._pendingCallbacks.delete(id);
        }
      } else {
        // Init error — Worker couldn't load WASM
        this._initFailed = true;
        console.error('[euler-wasm] Worker initialization error:', data.error);
      }
    }
  }

  /**
   * Run the layout computation in the Worker.
   *
   * @param {Array} nodes - [{id, x, y, mass, locked}]
   * @param {Array} edges - [{source, target, length}]
   * @param {Object} config - Rust-compatible config (snake_case)
   * @param {Function} [onProgress] - Progress callback
   * @returns {Promise<{positions, iterations, converged, time_ms, threaded, threadCount}>}
   */
  async run(nodes, edges, config, onProgress) {
    if (!this._workerReady) {
      throw new Error('WASM service not ready — call init() first');
    }

    this._progressCallback = onProgress || null;
    const id = this._nextCallId++;

    return new Promise((resolve, reject) => {
      this._pendingCallbacks.set(id, {
        resolve: (result) => { this._progressCallback = null; resolve(result); },
        reject: (error) => { this._progressCallback = null; reject(error); },
      });
      this._worker.postMessage({ type: 'run', id, nodes, edges, config });
    });
  }

  /**
   * Destroy the service and terminate the Worker.
   */
  destroy() {
    this._destroyed = true;
    if (this._worker) {
      for (const [, cb] of this._pendingCallbacks) {
        cb.reject(new Error('Service destroyed'));
      }
      this._pendingCallbacks.clear();
      this._worker.terminate();
      this._worker = null;
      this._workerReady = false;
    }
    if (this._blobUrl) {
      URL.revokeObjectURL(this._blobUrl);
      this._blobUrl = null;
    }
  }

  /**
   * Wait for the Worker to signal ready.
   * @param {number} timeoutMs
   * @returns {Promise<boolean>}
   */
  _waitForReady(timeoutMs) {
    if (this._workerReady) return Promise.resolve(true);
    return new Promise((resolve) => {
      const start = Date.now();
      const check = setInterval(() => {
        if (this._workerReady) {
          clearInterval(check);
          resolve(true);
        } else if (this._initFailed || Date.now() - start > timeoutMs) {
          clearInterval(check);
          resolve(false);
        }
      }, 20);
    });
  }
}
