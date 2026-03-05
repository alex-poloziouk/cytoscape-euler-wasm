import { Injectable, signal, effect } from '@angular/core';

// Session storage key for all settings
const STORAGE_KEY = 'euler_wasm_angular_demo_settings';

// Default settings — match cytoscape-euler defaults exactly
const DEFAULT_SETTINGS = {
  minNodes: 1000,
  maxNodes: 1000,
  minChildren: 5,
  maxChildren: 30,
  eulerSpringLength: 80,
  eulerGravity: -1.2,
  eulerMass: 4,
  eulerSpringCoeff: 0.0008,
  eulerDragCoeff: 0.02,
  eulerMovementThreshold: 1,
  eulerMaxIterations: 1000,
  eulerMaxSimulationTime: 60000,
  eulerAnimate: false,
  eulerRandomize: true,
};

export type GraphBuilderSettings = typeof DEFAULT_SETTINGS;

/**
 * Service to manage Graph Builder settings with session storage persistence.
 */
@Injectable({ providedIn: 'root' })
export class GraphBuilderSettingsService {
  // UI state
  showPanel = signal(false);

  // Tree generation settings
  minNodes = signal(DEFAULT_SETTINGS.minNodes);
  maxNodes = signal(DEFAULT_SETTINGS.maxNodes);
  minChildren = signal(DEFAULT_SETTINGS.minChildren);
  maxChildren = signal(DEFAULT_SETTINGS.maxChildren);

  // Euler layout settings
  eulerSpringLength = signal(DEFAULT_SETTINGS.eulerSpringLength);
  eulerGravity = signal(DEFAULT_SETTINGS.eulerGravity);
  eulerMass = signal(DEFAULT_SETTINGS.eulerMass);
  eulerSpringCoeff = signal(DEFAULT_SETTINGS.eulerSpringCoeff);
  eulerDragCoeff = signal(DEFAULT_SETTINGS.eulerDragCoeff);
  eulerMovementThreshold = signal(DEFAULT_SETTINGS.eulerMovementThreshold);
  eulerMaxIterations = signal(DEFAULT_SETTINGS.eulerMaxIterations);
  eulerMaxSimulationTime = signal(DEFAULT_SETTINGS.eulerMaxSimulationTime);
  eulerAnimate = signal(DEFAULT_SETTINGS.eulerAnimate);
  eulerRandomize = signal(DEFAULT_SETTINGS.eulerRandomize);

  constructor() {
    this.loadSettings();

    // Auto-save all settings when any signal changes
    effect(() => {
      const settings: GraphBuilderSettings = {
        minNodes: this.minNodes(),
        maxNodes: this.maxNodes(),
        minChildren: this.minChildren(),
        maxChildren: this.maxChildren(),
        eulerSpringLength: this.eulerSpringLength(),
        eulerGravity: this.eulerGravity(),
        eulerMass: this.eulerMass(),
        eulerSpringCoeff: this.eulerSpringCoeff(),
        eulerDragCoeff: this.eulerDragCoeff(),
        eulerMovementThreshold: this.eulerMovementThreshold(),
        eulerMaxIterations: this.eulerMaxIterations(),
        eulerMaxSimulationTime: this.eulerMaxSimulationTime(),
        eulerAnimate: this.eulerAnimate(),
        eulerRandomize: this.eulerRandomize(),
      };
      this.saveSettings(settings);
    });
  }

  togglePanel(): void {
    this.showPanel.update((v) => !v);
  }

  // --- Tree generation updates ---

  updateMinNodes(delta: number): void {
    this.setMinNodes(this.minNodes() + delta);
  }
  updateMaxNodes(delta: number): void {
    this.setMaxNodes(this.maxNodes() + delta);
  }
  updateMinChildren(delta: number): void {
    this.setMinChildren(this.minChildren() + delta);
  }
  updateMaxChildren(delta: number): void {
    this.setMaxChildren(this.maxChildren() + delta);
  }

  setMinNodes(value: number): void {
    const v = Math.max(1, value || 1);
    this.minNodes.set(v);
    if (this.maxNodes() < v) this.maxNodes.set(v);
  }
  setMaxNodes(value: number): void {
    const v = Math.max(1, value || 1);
    this.maxNodes.set(v);
    if (this.minNodes() > v) this.minNodes.set(v);
  }
  setMinChildren(value: number): void {
    const v = Math.max(1, value || 1);
    this.minChildren.set(v);
    if (this.maxChildren() < v) this.maxChildren.set(v);
  }
  setMaxChildren(value: number): void {
    const v = Math.max(1, value || 1);
    this.maxChildren.set(v);
    if (this.minChildren() > v) this.minChildren.set(v);
  }

  // --- Euler setting updates ---

  updateEuler(param: string, delta: number): void {
    switch (param) {
      case 'springLength':
        this.setEulerSpringLength(this.eulerSpringLength() + delta);
        break;
      case 'gravity':
        this.setEulerGravity(Math.round((this.eulerGravity() + delta) * 10) / 10);
        break;
      case 'mass':
        this.setEulerMass(this.eulerMass() + delta);
        break;
      case 'springCoeff':
        this.setEulerSpringCoeff(Math.round((this.eulerSpringCoeff() + delta) * 10000) / 10000);
        break;
      case 'dragCoeff':
        this.setEulerDragCoeff(Math.round((this.eulerDragCoeff() + delta) * 100) / 100);
        break;
      case 'movementThreshold':
        this.setEulerMovementThreshold(Math.round((this.eulerMovementThreshold() + delta) * 10) / 10);
        break;
      case 'maxIterations':
        this.setEulerMaxIterations(this.eulerMaxIterations() + delta);
        break;
      case 'maxSimulationTime':
        this.setEulerMaxSimulationTime(this.eulerMaxSimulationTime() + delta);
        break;
    }
  }

  resetAllDefaults(): void {
    this.minNodes.set(DEFAULT_SETTINGS.minNodes);
    this.maxNodes.set(DEFAULT_SETTINGS.maxNodes);
    this.minChildren.set(DEFAULT_SETTINGS.minChildren);
    this.maxChildren.set(DEFAULT_SETTINGS.maxChildren);
    this.eulerSpringLength.set(DEFAULT_SETTINGS.eulerSpringLength);
    this.eulerGravity.set(DEFAULT_SETTINGS.eulerGravity);
    this.eulerMass.set(DEFAULT_SETTINGS.eulerMass);
    this.eulerSpringCoeff.set(DEFAULT_SETTINGS.eulerSpringCoeff);
    this.eulerDragCoeff.set(DEFAULT_SETTINGS.eulerDragCoeff);
    this.eulerMovementThreshold.set(DEFAULT_SETTINGS.eulerMovementThreshold);
    this.eulerMaxIterations.set(DEFAULT_SETTINGS.eulerMaxIterations);
    this.eulerMaxSimulationTime.set(DEFAULT_SETTINGS.eulerMaxSimulationTime);
    this.eulerAnimate.set(DEFAULT_SETTINGS.eulerAnimate);
    this.eulerRandomize.set(DEFAULT_SETTINGS.eulerRandomize);
  }

  // --- Validated setters ---

  setEulerSpringLength(v: number): void {
    this.eulerSpringLength.set(Math.max(10, v || DEFAULT_SETTINGS.eulerSpringLength));
  }
  setEulerGravity(v: number): void {
    this.eulerGravity.set(isNaN(v) ? DEFAULT_SETTINGS.eulerGravity : v);
  }
  setEulerMass(v: number): void {
    this.eulerMass.set(Math.max(1, v || DEFAULT_SETTINGS.eulerMass));
  }
  setEulerSpringCoeff(v: number): void {
    this.eulerSpringCoeff.set(Math.max(0.0001, v || DEFAULT_SETTINGS.eulerSpringCoeff));
  }
  setEulerDragCoeff(v: number): void {
    this.eulerDragCoeff.set(isNaN(v) ? DEFAULT_SETTINGS.eulerDragCoeff : Math.max(0, v));
  }
  setEulerMovementThreshold(v: number): void {
    this.eulerMovementThreshold.set(Math.max(0.01, v || DEFAULT_SETTINGS.eulerMovementThreshold));
  }
  setEulerMaxIterations(v: number): void {
    this.eulerMaxIterations.set(Math.max(50, v || DEFAULT_SETTINGS.eulerMaxIterations));
  }
  setEulerMaxSimulationTime(v: number): void {
    this.eulerMaxSimulationTime.set(Math.max(1000, v || DEFAULT_SETTINGS.eulerMaxSimulationTime));
  }

  /**
   * Get cytoscape-euler JS layout config (for comparison mode).
   */
  getEulerJsConfig() {
    const baseMass = this.eulerMass();
    return {
      name: 'euler' as const,
      springLength: () => this.eulerSpringLength(),
      gravity: this.eulerGravity(),
      mass: (node: any) => baseMass + node.edges().length * 5,
      springCoeff: () => this.eulerSpringCoeff(),
      dragCoeff: this.eulerDragCoeff(),
      animate: this.eulerAnimate(),
      randomize: this.eulerRandomize(),
      movementThreshold: this.eulerMovementThreshold(),
      maxIterations: this.eulerMaxIterations(),
      maxSimulationTime: this.eulerMaxSimulationTime(),
    };
  }

  /**
   * Compute optimal thread count based on graph size.
   *
   *  - < 500   → 1T (single-threaded, threading overhead not worth it)
   *  - < 1K    → 2T
   *  - < 3K    → 3T
   *  - < 10K   → 4T
   *  - >= 10K  → 0 (auto — let the engine use all available cores)
   */
  private computeThreadCount(nodeCount: number): number {
    if (nodeCount < 500) return 1;
    if (nodeCount < 1000) return 2;
    if (nodeCount < 3000) return 3;
    if (nodeCount < 10000) return 4;
    return 0;
  }

  /**
   * Get cytoscape-euler-wasm layout config (npm package API).
   * @param nodeCount — used to auto-scale thread count
   */
  getEulerWasmConfig(nodeCount: number) {
    const threadCount = this.computeThreadCount(nodeCount);
    return {
      name: 'euler-wasm' as const,
      // Physics
      springLength: this.eulerSpringLength(),
      springCoeff: this.eulerSpringCoeff(),
      mass: this.eulerMass(),
      gravity: this.eulerGravity(),
      pull: 0.001,
      theta: 0.666,
      dragCoeff: this.eulerDragCoeff(),
      movementThreshold: this.eulerMovementThreshold(),
      timeStep: 20,
      maxIterations: this.eulerMaxIterations(),
      maxSimulationTime: this.eulerMaxSimulationTime(),
      // Layout options
      fit: true,
      padding: 30,
      animate: false as const,
      randomize: this.eulerRandomize(),
      // WASM — self-hosted for multi-threading (same-origin required)
      wasmPath: '/wasm/',
      wasmPathThreaded: '/wasm-threaded/',
      workerUrl: '/euler-worker.umd.js',
      threadCount,
      // Telemetry
      telemetry: true,
    };
  }

  // --- Session storage ---

  private loadSettings(): void {
    try {
      const stored = sessionStorage.getItem(STORAGE_KEY);
      if (stored) {
        const s = { ...DEFAULT_SETTINGS, ...JSON.parse(stored) };
        this.minNodes.set(s.minNodes);
        this.maxNodes.set(s.maxNodes);
        this.minChildren.set(s.minChildren);
        this.maxChildren.set(s.maxChildren);
        this.eulerSpringLength.set(s.eulerSpringLength);
        this.eulerGravity.set(s.eulerGravity);
        this.eulerMass.set(s.eulerMass);
        this.eulerSpringCoeff.set(s.eulerSpringCoeff);
        this.eulerDragCoeff.set(s.eulerDragCoeff);
        this.eulerMovementThreshold.set(s.eulerMovementThreshold);
        this.eulerMaxIterations.set(s.eulerMaxIterations);
        this.eulerMaxSimulationTime.set(s.eulerMaxSimulationTime);
        this.eulerAnimate.set(s.eulerAnimate);
        this.eulerRandomize.set(s.eulerRandomize);
      }
    } catch (e) {
      console.warn('Failed to load settings from session storage', e);
    }
  }

  private saveSettings(settings: GraphBuilderSettings): void {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch (e) {
      console.warn('Failed to save settings to session storage', e);
    }
  }
}
