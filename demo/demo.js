/**
 * cytoscape-euler-wasm Demo
 *
 * Plain JS demo comparing WASM vs JS force-directed layout performance.
 * No build tools, no framework — just Cytoscape.js, the WASM module, and this file.
 *
 * Uses the cytoscape-euler-wasm package API:
 *   cy.layout({ name: 'euler-wasm', ... }).run()
 */

import cytoscapeEulerWasm from '../src/index.js';

// ── Color palette for tree layers (high contrast on white background) ────────
const LAYER_COLORS = [
  '#e74c3c', '#2980b9', '#27ae60', '#8e44ad', '#d35400',
  '#16a085', '#c0392b', '#2c3e50', '#f39c12', '#1abc9c',
  '#9b59b6', '#e67e22', '#3498db', '#e84393', '#00b894',
  '#6c5ce7', '#d63031', '#0984e3', '#e17055', '#6ab04c',
];

// ── State ────────────────────────────────────────────────────────────────────
let cy = null;
let layoutRunning = false;

// ── DOM refs ─────────────────────────────────────────────────────────────────
const $ = (id) => document.getElementById(id);

const dom = {
  cy: $('cy'),
  btnGenerate: $('btn-generate'),
  btnWasm: $('btn-wasm'),
  btnJs: $('btn-js'),
  btnCompare: $('btn-compare'),
  nodeCount: $('node-count'),
  minChildren: $('min-children'),
  maxChildren: $('max-children'),
  springLength: $('spring-length'),
  springCoeff: $('spring-coeff'),
  mass: $('mass'),
  gravity: $('gravity'),
  pull: $('pull'),
  dragCoeff: $('drag-coeff'),
  timeStep: $('time-step'),
  theta: $('theta'),
  movementThreshold: $('movement-threshold'),
  maxIterations: $('max-iterations'),
  maxSimTime: $('max-sim-time'),
  threadCount: $('thread-count'),
  threadHint: $('thread-hint'),
  progressOverlay: $('progress-overlay'),
  progressLabel: $('progress-label'),
  progressFill: $('progress-fill'),
  progressText: $('progress-text'),
  results: $('results'),
  resultPlaceholder: $('result-placeholder'),
  resultWasm: $('result-wasm'),
  resultJs: $('result-js'),
  resultSpeedup: $('result-speedup'),
  resultWasmTime: $('result-wasm-time'),
  resultWasmDetail: $('result-wasm-detail'),
  resultJsTime: $('result-js-time'),
  resultJsDetail: $('result-js-detail'),
  resultSpeedupValue: $('result-speedup-value'),
};

// ── Seeded PRNG (mulberry32) — deterministic graph & positions ───────────────
const DEFAULT_SEED = 12345;

function createPRNG(seed = DEFAULT_SEED) {
  return () => {
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── Graph Generation ─────────────────────────────────────────────────────────

function generateRandomTree(nodeCount, minChildren, maxChildren, random = Math.random) {
  const nodes = [];
  for (let i = 0; i < nodeCount; i++) {
    nodes.push({ id: `n${i}`, layer: 0 });
  }

  // Shuffle (Fisher-Yates)
  for (let i = nodes.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [nodes[i], nodes[j]] = [nodes[j], nodes[i]];
  }

  // Build tree
  const edges = [];
  const available = [...nodes];
  for (const node of nodes) {
    const idx = available.indexOf(node);
    if (idx >= 0) available.splice(idx, 1);

    const children = Math.floor(random() * (maxChildren - minChildren + 1)) + minChildren;
    for (let j = 0; j < children && available.length > 0; j++) {
      const child = available.shift();
      edges.push({ source: node.id, target: child.id });
    }
  }

  // BFS to assign layers
  const childMap = new Map();
  for (const e of edges) {
    if (!childMap.has(e.source)) childMap.set(e.source, []);
    childMap.get(e.source).push(e.target);
  }
  const targets = new Set(edges.map(e => e.target));
  const roots = nodes.filter(n => !targets.has(n.id)).map(n => n.id);
  const layerMap = new Map();
  const queue = roots.map(id => ({ id, layer: 0 }));
  while (queue.length > 0) {
    const { id, layer } = queue.shift();
    if (layerMap.has(id)) continue;
    layerMap.set(id, layer);
    for (const child of (childMap.get(id) || [])) {
      if (!layerMap.has(child)) queue.push({ id: child, layer: layer + 1 });
    }
  }
  for (const node of nodes) node.layer = layerMap.get(node.id) ?? 0;

  return { nodes, edges };
}

function buildCytoscapeElements(nodes, edges) {
  const elements = [];
  for (const node of nodes) {
    const color = LAYER_COLORS[node.layer % LAYER_COLORS.length];
    elements.push({ data: { id: node.id, color } });
  }
  for (const edge of edges) {
    elements.push({ data: { id: `${edge.source}-${edge.target}`, source: edge.source, target: edge.target } });
  }
  return elements;
}

// ── Deterministic Starting Positions ─────────────────────────────────────────

function resetPositions() {
  const random = createPRNG(DEFAULT_SEED);
  const spread = 500;
  cy.batch(() => {
    cy.nodes().forEach(node => {
      node.position({
        x: (random() - 0.5) * spread * 2,
        y: (random() - 0.5) * spread * 2,
      });
    });
  });
}

// ── Layout Config from DOM ───────────────────────────────────────────────────

/** Parse a numeric input, returning fallback when the field is empty or invalid */
const num = (el, fallback) => { const v = parseFloat(el.value); return isNaN(v) ? fallback : v; };

function getLayoutConfig() {
  return {
    springLength: num(dom.springLength, 80),
    springCoeff: num(dom.springCoeff, 0.0008),
    mass: num(dom.mass, 4),
    gravity: num(dom.gravity, -1.2),
    pull: num(dom.pull, 0.001),
    dragCoeff: num(dom.dragCoeff, 0.02),
    timeStep: num(dom.timeStep, 20),
    maxIterations: num(dom.maxIterations, 1000),
    movementThreshold: num(dom.movementThreshold, 1),
    theta: num(dom.theta, 0.666),
    maxSimulationTime: num(dom.maxSimTime, 60000),
  };
}

function getEffectiveThreadCount() {
  const manual = +dom.threadCount.value;
  return manual; // 0 = auto (let the service decide)
}

// ── Progress Bar ─────────────────────────────────────────────────────────────

function showProgress(percent, label, isJs = false) {
  dom.progressOverlay.classList.remove('hidden');
  dom.progressLabel.textContent = label || (isJs ? 'JS: computing...' : 'WASM: computing...');
  dom.progressFill.style.width = `${percent}%`;
  dom.progressFill.className = 'progress-fill' + (isJs ? ' js' : '');
  dom.progressText.textContent = isJs ? 'progress not available' : `${percent}%`;
  dom.progressText.className = 'progress-text' + (isJs ? ' js' : '');
}

function hideProgress() {
  dom.progressOverlay.classList.add('hidden');
}

// ── Button State ─────────────────────────────────────────────────────────────

function setRunning(running) {
  layoutRunning = running;
  dom.btnGenerate.disabled = running;
  dom.btnWasm.disabled = running;
  dom.btnJs.disabled = running;
  dom.btnCompare.disabled = running;
}

// ── Results Display ──────────────────────────────────────────────────────────

function showResult(engine, timeMs, detail) {
  // Hide placeholder once we have real results
  if (dom.resultPlaceholder) dom.resultPlaceholder.classList.add('hidden');
  const seconds = (timeMs / 1000).toFixed(2);

  if (engine === 'wasm') {
    dom.resultWasm.classList.remove('hidden');
    dom.resultWasmTime.textContent = `${seconds}s`;
    dom.resultWasmDetail.textContent = detail || '';
  } else {
    dom.resultJs.classList.remove('hidden');
    dom.resultJsTime.textContent = `${seconds}s`;
    // cytoscape-euler doesn't expose iteration count or convergence status
    dom.resultJsDetail.textContent = detail || '';
  }
}

function showSpeedup(wasmMs, jsMs) {
  dom.resultSpeedup.classList.remove('hidden');
  const ratio = wasmMs > 0 ? jsMs / wasmMs : Infinity;
  dom.resultSpeedupValue.textContent = ratio === Infinity ? '∞' : `${ratio.toFixed(1)}x`;
  dom.resultSpeedupValue.className = 'result-value ' +
    (ratio >= 2 ? 'speedup-good' : ratio >= 1 ? 'speedup-ok' : 'speedup-bad');
}

function clearResults() {
  dom.resultWasm.classList.add('hidden');
  dom.resultJs.classList.add('hidden');
  dom.resultSpeedup.classList.add('hidden');
  if (dom.resultPlaceholder) dom.resultPlaceholder.classList.remove('hidden');
}

// ── WASM Layout (via cytoscape-euler-wasm package API) ───────────────────────

async function runWasmLayout() {
  const nodeCount = cy.nodes().length;
  if (nodeCount === 0) return null;

  setRunning(true);
  resetPositions();
  showProgress(0, 'WASM: computing...');

  const config = getLayoutConfig();
  const start = performance.now();
  let telemetryResult = null;

  try {
    const layout = cy.layout({
      name: 'euler-wasm',
      ...config,
      fit: true,
      animate: false,
      randomize: false,
      threadCount: getEffectiveThreadCount(),

      // Self-hosted WASM paths (same-origin for threading support)
      wasmPath: '../dist/wasm/',
      wasmPathThreaded: '../dist/wasm-threaded/',
      workerUrl: '../dist/euler-worker.umd.js',

      // Progress callback
      progress: (p) => {
        const elapsed = (p.elapsedMs / 1000).toFixed(2);
        const label = `WASM: ${elapsed}s — iter ${p.iteration}`;
        showProgress(p.percent, label);
      },

      // Telemetry
      telemetry: true,
      onTelemetry: (data) => { telemetryResult = data; },
    });

    // Wait for layout to finish (listen for layoutstop event)
    await new Promise((resolve) => {
      layout.one('layoutstop', resolve);
      layout.run();
    });

    const elapsed = performance.now() - start;
    hideProgress();

    if (telemetryResult) {
      const converged = telemetryResult.converged ? 'converged' : 'max iter';
      const detail = `(${telemetryResult.iterations} iter, ${converged}, ${telemetryResult.threadCount}T)`;
      showResult('wasm', elapsed, detail);
    } else {
      showResult('wasm', elapsed);
    }

    return { timeMs: elapsed, result: telemetryResult };
  } catch (err) {
    hideProgress();
    console.error('WASM layout error:', err);
    return null;
  } finally {
    setRunning(false);
  }
}

// ── JS Layout ────────────────────────────────────────────────────────────────

function runJsLayout() {
  return new Promise((resolve) => {
    const nodeCount = cy.nodes().length;
    if (nodeCount === 0) { resolve(null); return; }

    setRunning(true);
    resetPositions();

    showProgress(0, 'JS: computing...', true);

    const config = getLayoutConfig();

    // Give the UI a tick to update before blocking
    setTimeout(() => {
      try {
        const start = performance.now();

        const layout = cy.layout({
          name: 'euler',
          springLength: () => config.springLength,
          springCoeff: () => config.springCoeff,
          mass: () => config.mass,
          gravity: config.gravity,
          pull: config.pull,
          theta: config.theta,
          timeStep: config.timeStep,
          dragCoeff: config.dragCoeff,
          movementThreshold: config.movementThreshold,
          maxIterations: config.maxIterations,
          maxSimulationTime: config.maxSimulationTime,
          animate: false,
          randomize: false,
        });

        layout.one('layoutstop', () => {
          const elapsed = performance.now() - start;
          hideProgress();
          cy.fit();

          showResult('js', elapsed);
          setRunning(false);
          resolve({ timeMs: elapsed });
        });

        layout.run();
      } catch (err) {
        hideProgress();
        console.error('JS layout error:', err);
        setRunning(false);
        resolve(null);
      }
    }, 20);
  });
}

// ── Compare Mode ─────────────────────────────────────────────────────────────

async function runCompare() {
  if (cy.nodes().length === 0) return;

  clearResults();

  // Run WASM first
  const wasmResult = await runWasmLayout();
  if (!wasmResult) return;

  // Small delay for UI to settle
  await new Promise(r => setTimeout(r, 100));

  // Run JS
  const jsResult = await runJsLayout();
  if (!jsResult) return;

  // Show speedup
  showSpeedup(wasmResult.timeMs, jsResult.timeMs);
}

// ── Generate Graph ───────────────────────────────────────────────────────────

function onGenerate() {
  if (layoutRunning) return;

  const nodeCount = Math.max(10, num(dom.nodeCount, 1000));
  const minChildren = Math.max(1, num(dom.minChildren, 5));
  const maxChildren = Math.max(minChildren, num(dom.maxChildren, 30));

  cy.elements().remove();
  clearResults();

  const random = createPRNG(DEFAULT_SEED);
  const { nodes, edges } = generateRandomTree(nodeCount, minChildren, maxChildren, random);
  const elements = buildCytoscapeElements(nodes, edges);
  cy.add(elements);

  resetPositions();
  cy.zoom(0.2);
  cy.center();

  // Show graph size in the results placeholder
  if (dom.resultPlaceholder) {
    dom.resultPlaceholder.textContent = `${nodes.length} nodes, ${edges.length} edges — run a layout to see results`;
  }
}

// ── Init ─────────────────────────────────────────────────────────────────────

function init() {
  // Guard CDN globals — fail visibly if scripts didn't load
  if (typeof cytoscape === 'undefined' || typeof cytoscapeEuler === 'undefined') {
    document.body.innerHTML = '<p style="padding:2em;color:#c0392b;font-size:16px">'
      + 'Failed to load Cytoscape.js or cytoscape-euler from CDN. Check your network connection.</p>';
    return;
  }

  // Register extensions
  cytoscape.use(cytoscapeEuler);         // JS comparison layout
  cytoscape.use(cytoscapeEulerWasm);     // WASM layout (from package)

  // Create Cytoscape instance
  cy = cytoscape({
    container: dom.cy,
    style: [
      {
        selector: 'node',
        style: {
          width: 6,
          height: 6,
          'background-color': 'data(color)',
          'background-opacity': 0.9,
          'border-width': 0,
        },
      },
      {
        selector: 'edge',
        style: {
          width: 0.5,
          'line-color': '#bbb',
          opacity: 0.5,
          'curve-style': 'haystack',
        },
      },
      {
        selector: 'node:selected',
        style: {
          'border-width': 2,
          'border-color': '#ff4757',
        },
      },
    ],
    layout: { name: 'preset' },
    textureOnViewport: true,
    minZoom: 0.01,
    maxZoom: 4,
  });

  // Wire up buttons
  dom.btnGenerate.addEventListener('click', onGenerate);
  dom.btnWasm.addEventListener('click', () => { clearResults(); runWasmLayout(); });
  dom.btnJs.addEventListener('click', () => { clearResults(); runJsLayout(); });
  dom.btnCompare.addEventListener('click', runCompare);

  // Thread count hint
  dom.threadCount.addEventListener('input', () => {
    const v = +dom.threadCount.value;
    dom.threadHint.textContent = v === 0 ? '0 = auto' : `${v} thread${v !== 1 ? 's' : ''}`;
  });

  // Generate initial graph
  onGenerate();
}

// Start
init();
