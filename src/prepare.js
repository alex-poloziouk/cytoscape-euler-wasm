/**
 * Prepare data for the WASM layout engine.
 *
 * Extracts node positions and edge connections from Cytoscape elements,
 * resolves per-element functions (Hybrid approach), and converts to the
 * format expected by the Rust WASM module.
 *
 * Hybrid approach: accepts both functions and flat numbers for springLength
 * and mass. Functions are resolved once on the main thread before data is
 * sent to the Worker — the WASM engine receives only flat numeric arrays.
 * (springCoeff is global-only — per-edge coeff is not yet supported in WASM.)
 */

/**
 * Resolve a value that may be a function or a constant.
 * @param {*} value - A number, or a function(element) => number
 * @param {*} element - Cytoscape element to pass to the function
 * @param {number} fallback - Default if value is null/undefined
 * @returns {number}
 */
function resolve(value, element, fallback) {
  if (typeof value === 'function') return value(element);
  if (value != null) return value;
  return fallback;
}

/**
 * Extract nodes from Cytoscape elements with resolved per-element values.
 *
 * @param {Object} options - Layout options (includes per-element params)
 * @param {Object} eles - Cytoscape element collection (options.eles)
 * @returns {Array<{id: string, x: number, y: number, mass: number, locked: boolean}>}
 */
export function extractNodes(options, eles) {
  const nodes = eles.nodes();
  // Normalize boundingBox — Cytoscape accepts both {x1,y1,x2,y2} and
  // {x1,y1,w,h} formats but does NOT normalize before passing to layouts.
  let bb = options.boundingBox;
  if (bb && bb.w !== undefined && bb.x2 === undefined) {
    bb = { x1: bb.x1, y1: bb.y1, x2: bb.x1 + bb.w, y2: bb.y1 + bb.h };
  }
  const result = [];

  nodes.forEach(node => {
    let pos;
    if (options.randomize) {
      pos = {
        x: bb ? bb.x1 + Math.random() * (bb.x2 - bb.x1) : Math.random() * 500 - 250,
        y: bb ? bb.y1 + Math.random() * (bb.y2 - bb.y1) : Math.random() * 500 - 250,
      };
    } else {
      pos = node.position();
    }

    result.push({
      id: node.id(),
      x: pos.x || 0,
      y: pos.y || 0,
      mass: resolve(options.mass, node, 4),
      locked: node.locked(),
    });
  });

  return result;
}

/**
 * Extract edges from Cytoscape elements with resolved per-element values.
 *
 * @param {Object} options - Layout options (includes per-element params)
 * @param {Object} eles - Cytoscape element collection (options.eles)
 * @returns {Array<{source: string, target: string, length: number}>}
 */
export function extractEdges(options, eles) {
  const edges = eles.edges();
  const result = [];

  edges.forEach(edge => {
    result.push({
      source: edge.source().id(),
      target: edge.target().id(),
      length: resolve(options.springLength, edge, 80),
    });
  });

  return result;
}

/**
 * Convert layout options to Rust-compatible config (snake_case, flat values).
 *
 * Per-element values (mass per node, springLength per edge) are already
 * resolved into the node/edge arrays by extractNodes/extractEdges.
 * The config holds global defaults/fallbacks for the simulation engine.
 *
 * If a per-element param is a function, the config fallback uses the
 * original euler default for that param.
 *
 * @param {Object} options - Layout options
 * @returns {Object} Rust-compatible config with snake_case keys
 */
export function toRustConfig(options) {
  return {
    spring_length: typeof options.springLength === 'function' ? 80 : (options.springLength ?? 80),
    spring_coeff: typeof options.springCoeff === 'function' ? 0.0008 : (options.springCoeff ?? 0.0008),
    mass: typeof options.mass === 'function' ? 4 : (options.mass ?? 4),
    gravity: options.gravity ?? -1.2,
    pull: options.pull ?? 0.001,
    theta: options.theta ?? 0.666,
    drag_coeff: options.dragCoeff ?? 0.02,
    time_step: options.timeStep ?? 20,
    movement_threshold: options.movementThreshold ?? 1,
    max_iterations: options.maxIterations ?? 1000,
    max_simulation_time: options.maxSimulationTime ?? 60000,
  };
}
