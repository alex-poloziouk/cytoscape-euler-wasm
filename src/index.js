/**
 * cytoscape-euler-wasm
 *
 * High-performance WASM port of cytoscape-euler force-directed layout.
 * Drop-in replacement with Web Worker execution, optional multi-threading,
 * progress callbacks, and telemetry.
 *
 * Usage (ESM):
 *   import cytoscape from 'cytoscape';
 *   import cytoscapeEulerWasm from 'cytoscape-euler-wasm';
 *   cytoscape.use(cytoscapeEulerWasm);
 *
 *   const layout = cy.layout({ name: 'euler-wasm', ... });
 *   layout.run();
 *
 * Usage (script tag):
 *   <script src="cytoscape.min.js"></script>
 *   <script src="cytoscape-euler-wasm.umd.js"></script>
 *   <!-- auto-registers if cytoscape global is detected -->
 */

import EulerWasmLayout from './layout.js';

/**
 * Register the euler-wasm layout with Cytoscape.
 * @param {Function} cytoscape - The Cytoscape.js library reference
 */
function register(cytoscape) {
  if (!cytoscape) {
    console.warn('[euler-wasm] Cannot register: cytoscape argument is falsy');
    return;
  }
  cytoscape('layout', 'euler-wasm', EulerWasmLayout);
}

// Auto-register if cytoscape is available as a global
if (typeof cytoscape !== 'undefined') {  // eslint-disable-line no-undef
  register(cytoscape);                   // eslint-disable-line no-undef
}

export default register;
export { EulerWasmLayout };
