import { Component, AfterViewInit, signal, inject, OnDestroy } from '@angular/core';
import cytoscape from 'cytoscape';
import { Entity, generateRandomTree, LAYER_COLORS, shuffleArray } from './entities';
import { GraphBuilderSettingsService } from './graph-builder-settings.service';
import { SvgService, NODE_DIMENSIONS, ICON_SVGS_CIRCLE } from './svg.service';

// @ts-ignore — cytoscape-euler has no types
import euler from 'cytoscape-euler';
// @ts-ignore — cytoscape-euler-wasm has no types
import cytoscapeEulerWasm from 'cytoscape-euler-wasm';

// Register both layout extensions
cytoscape.use(euler);
cytoscape.use(cytoscapeEulerWasm);

// Zoom levels: dots → icons → cards → detailed
type ZoomMode = 'dots' | 'icons' | 'cards' | 'detailed';

const { DOT_SIZE, ICON_SIZE, CARD_HEIGHT, DETAILED_HEIGHT } = NODE_DIMENSIONS;

// Scale factors for zoom transitions - spreads nodes apart to prevent overlap
// with larger node visuals (cards, detailed views).
//
// L2->L3 (icons->cards): positions multiplied by CARD_SCALE_FACTOR
// L3->L4 (cards->detailed): additional DETAILED_SCALE_FACTOR applied
// Total at L4: CARD_SCALE_FACTOR * DETAILED_SCALE_FACTOR = 3.6x spread
const CARD_SCALE_FACTOR = 3;
const DETAILED_SCALE_FACTOR = 1.2;

/**
 * Unified stylesheet with class-based selectors for each zoom level.
 */
const UNIFIED_STYLESHEET: cytoscape.StylesheetStyle[] = [
  // === BASE ===
  { selector: 'node', style: { 'border-width': 0, 'background-opacity': 1 } },
  { selector: 'edge', style: { 'line-color': '#666' } },

  // === DOTS ===
  {
    selector: 'node.dots',
    style: {
      width: DOT_SIZE, height: DOT_SIZE,
      'background-color': 'data(color)', 'background-opacity': 0.9, shape: 'ellipse',
    },
  },
  {
    selector: 'edge.dots',
    style: { width: 0.5, opacity: 0.3, 'curve-style': 'haystack', 'target-arrow-shape': 'none' },
  },

  // === ICONS ===
  {
    selector: 'node.icons',
    style: {
      width: ICON_SIZE, height: ICON_SIZE,
      'background-image': 'data(iconSvg)', 'background-width': '100%', 'background-height': '100%',
      'background-fit': 'contain', shape: 'ellipse',
    },
  },
  {
    selector: 'edge.icons',
    style: { width: 1, opacity: 0.5, 'curve-style': 'haystack', 'target-arrow-shape': 'none' },
  },

  // === CARDS ===
  {
    selector: 'node.cards',
    style: {
      shape: 'round-rectangle', width: 'data(cardWidth)', height: CARD_HEIGHT,
      'background-image': 'data(cardSvg)', 'background-width': '100%', 'background-height': '100%',
      'background-fit': 'contain',
    },
  },
  {
    selector: 'edge.cards',
    style: {
      width: 1.5, opacity: 1, 'curve-style': 'bezier',
      'target-arrow-shape': 'triangle', 'target-arrow-color': '#666',
    },
  },

  // === DETAILED ===
  {
    selector: 'node.detailed',
    style: {
      shape: 'round-rectangle', width: 'data(detailedWidth)', height: DETAILED_HEIGHT,
      'background-image': 'data(detailedSvg)', 'background-width': '100%', 'background-height': '100%',
      'background-fit': 'contain',
    },
  },
  {
    selector: 'edge.detailed',
    style: {
      width: 2, opacity: 1, 'curve-style': 'bezier',
      'target-arrow-shape': 'triangle', 'target-arrow-color': '#666',
    },
  },

  // === SELECTION ===
  { selector: 'node:selected', style: { 'border-width': 3, 'border-color': '#ff4757' } },
  { selector: 'edge:selected', style: { width: 3, opacity: 1, 'line-color': '#ff4757', 'target-arrow-color': '#ff4757' } },
];

@Component({
  selector: 'app-root',
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App implements AfterViewInit, OnDestroy {
  private readonly ZOOM_THRESHOLDS = [0.3, 0.7, 1.4];
  private readonly ZOOM_MODES: ZoomMode[] = ['dots', 'icons', 'cards', 'detailed'];
  private readonly HYSTERESIS = 0.05;

  private currentZoomMode: ZoomMode = 'dots';
  private lastZoom = 1;

  /**
   * Tracks current position scaling state:
   *   0 = unscaled (L1/L2: dots/icons) - original layout positions
   *   1 = card-scaled (L3: cards) - positions * 3x
   *   2 = detailed-scaled (L4: detailed) - positions * 3.6x total
   *
   * Reset to 0 when generating new graph or re-running layout.
   */
  private scaleLevel: 0 | 1 | 2 = 0;

  private cy!: cytoscape.Core;
  private timerInterval?: ReturnType<typeof setInterval>;
  private layerColors: string[] = [...LAYER_COLORS];

  settings = inject(GraphBuilderSettingsService);
  svgService = inject(SvgService);

  layoutTime = signal<string | null>(null);
  useWasmLayout = signal(true);
  progressPercent = signal<number | null>(null);
  telemetryInfo = signal<string | null>(null);

  ngOnDestroy(): void {
    if (this.timerInterval) clearInterval(this.timerInterval);
    this.cy?.destroy();
  }

  toggleWasmLayout(): void {
    this.useWasmLayout.update((v) => !v);
  }

  rerunLayout(): void {
    if (!this.cy) return;
    const nodeCount = this.cy.nodes().length;
    if (nodeCount > 0) {
      // Reset to unscaled positions before layout
      this.scaleLevel = 0;
      this.currentZoomMode = 'dots';
      this.cy.elements().removeClass('dots icons cards detailed').addClass('dots');
      this.runLayout(nodeCount);
    }
  }

  /**
   * Generate a random tree and display it.
   */
  onGenerateTree(): void {
    if (!this.cy) return;

    this.cy.elements().remove();
    this.svgService.clearCaches();
    this.layerColors = shuffleArray([...LAYER_COLORS]);

    const { nodes, links } = generateRandomTree(
      this.settings.minNodes(),
      this.settings.maxNodes(),
      this.settings.minChildren(),
      this.settings.maxChildren(),
    );

    const elements = this.treeToElements(nodes, links);
    this.cy.add(elements);

    this.cy.elements().addClass('dots');
    this.currentZoomMode = 'dots';
    this.scaleLevel = 0;  // Reset scale level for fresh graph

    this.runLayout(nodes.length);
  }

  /**
   * Convert tree data to cytoscape elements with layer-based coloring and cached SVGs.
   */
  private treeToElements(
    nodes: Entity[],
    links: { from: string; to: string }[],
  ): cytoscape.ElementDefinition[] {
    const elements: cytoscape.ElementDefinition[] = [];
    this.svgService.resetTimingCounters();

    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      const color = this.layerColors[(node.layer ?? 0) % this.layerColors.length];
      const label = node.name || node.id;
      const iconIndex = i % ICON_SVGS_CIRCLE.length;
      const secondLabel = this.svgService.getSecondaryLabel(i);
      const iconSvg = this.svgService.generateCircleIconSvg(iconIndex, color);
      const cardResult = this.svgService.generateCardSvg(node.id, label, iconIndex, color);
      const detailedResult = this.svgService.generateDetailedSvg(node.id, label, secondLabel, iconIndex, color);

      elements.push({
        data: {
          id: node.id,
          label,
          layer: node.layer,
          color,
          iconIndex,
          secondLabel,
          iconSvg,
          cardSvg: cardResult.svg,
          cardWidth: cardResult.width,
          detailedSvg: detailedResult.svg,
          detailedWidth: detailedResult.width,
        },
      });
    }

    this.svgService.logGenerationSummary(nodes.length);

    for (const link of links) {
      elements.push({
        data: { id: `${link.from}-${link.to}`, source: link.from, target: link.to },
      });
    }

    return elements;
  }

  ngAfterViewInit(): void {
    this.cy = cytoscape({
      container: document.getElementById('cy'),
      style: UNIFIED_STYLESHEET,
      layout: { name: 'preset' },
      wheelSensitivity: 0.5,
      minZoom: 0.01,
      maxZoom: 10,
    });

    this.cy.on('zoom', () => this.handleZoomChange());
  }

  /**
   * Determine zoom mode with hysteresis to prevent flip-flopping at boundaries.
   */
  private handleZoomChange(): void {
    const zoom = this.cy.zoom();
    const zoomingIn = zoom > this.lastZoom;
    this.lastZoom = zoom;

    const h = zoomingIn ? this.HYSTERESIS : -this.HYSTERESIS;

    let modeIndex = 0;
    for (let i = 0; i < this.ZOOM_THRESHOLDS.length; i++) {
      if (zoom >= this.ZOOM_THRESHOLDS[i] + h) modeIndex = i + 1;
    }

    const mode = this.ZOOM_MODES[modeIndex];
    if (mode !== this.currentZoomMode) {
      const previousMode = this.currentZoomMode;
      this.currentZoomMode = mode;
      this.cy.elements().removeClass('dots icons cards detailed').addClass(mode);

      // Scale positions when transitioning to/from card modes
      this.handlePositionScaling(previousMode, mode);
    }
  }

  /**
   * Scale node positions when transitioning between zoom modes.
   *
   * Scale Levels:
   *   0 = unscaled (dots/icons) - original layout positions
   *   1 = card-scaled - positions * CARD_SCALE_FACTOR (3x)
   *   2 = detailed-scaled - positions * CARD_SCALE_FACTOR * DETAILED_SCALE_FACTOR (3.6x total)
   *
   * Handles all transition cases including multi-level jumps (e.g., L1→L4).
   * Scaling is cumulative: L1→L4 applies both CARD and DETAILED factors.
   */
  private handlePositionScaling(_from: ZoomMode, to: ZoomMode): void {
    let targetLevel: 0 | 1 | 2;
    if (to === 'dots' || to === 'icons') {
      targetLevel = 0;
    } else if (to === 'cards') {
      targetLevel = 1;
    } else {
      targetLevel = 2;
    }

    if (targetLevel === this.scaleLevel) return;

    if (targetLevel > this.scaleLevel) {
      // Scaling UP: apply factors in order (card first, then detailed)
      if (this.scaleLevel === 0 && targetLevel >= 1) {
        this.scalePositions(CARD_SCALE_FACTOR);
      }
      if (this.scaleLevel <= 1 && targetLevel === 2) {
        this.scalePositions(DETAILED_SCALE_FACTOR);
      }
    } else {
      // Scaling DOWN: remove factors in reverse order
      if (this.scaleLevel === 2 && targetLevel <= 1) {
        this.scalePositions(1 / DETAILED_SCALE_FACTOR);
      }
      if (this.scaleLevel >= 1 && targetLevel === 0) {
        this.scalePositions(1 / CARD_SCALE_FACTOR);
      }
    }

    this.scaleLevel = targetLevel;
  }

  /**
   * Scale all node positions relative to graph center.
   *
   * Spreads out (or contracts) node positions to accommodate
   * larger (or smaller) visual representations without re-running layout.
   * Adjusts pan to keep current view point stationary on screen.
   * Does NOT modify zoom level (avoids re-triggering handleZoomChange).
   */
  private scalePositions(factor: number): void {
    if (this.cy.nodes().length === 0) return;

    const bb = this.cy.elements().boundingBox();
    const centerX = (bb.x1 + bb.x2) / 2;
    const centerY = (bb.y1 + bb.y2) / 2;

    const currentZoom = this.cy.zoom();
    const currentPan = this.cy.pan();
    const screenCenterX = this.cy.width() / 2;
    const screenCenterY = this.cy.height() / 2;

    // Current graph point at screen center
    const viewCenterX = (screenCenterX - currentPan.x) / currentZoom;
    const viewCenterY = (screenCenterY - currentPan.y) / currentZoom;

    // Scale each node position relative to graph center
    this.cy.nodes().forEach(node => {
      const pos = node.position();
      node.position({
        x: centerX + (pos.x - centerX) * factor,
        y: centerY + (pos.y - centerY) * factor,
      });
    });

    // Adjust pan to keep view center at same screen position
    const newViewCenterX = centerX + (viewCenterX - centerX) * factor;
    const newViewCenterY = centerY + (viewCenterY - centerY) * factor;
    this.cy.pan({
      x: screenCenterX - newViewCenterX * currentZoom,
      y: screenCenterY - newViewCenterY * currentZoom,
    });
  }

  // ── Layout Execution ────────────────────────────────────────────────────

  private runLayout(nodeCount: number): void {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = undefined;
    }
    this.progressPercent.set(null);
    this.telemetryInfo.set(null);

    const start = performance.now();

    const onLayoutComplete = (extraInfo?: string) => {
      if (this.timerInterval) {
        clearInterval(this.timerInterval);
        this.timerInterval = undefined;
      }
      this.progressPercent.set(null);
      const elapsed = ((performance.now() - start) / 1000).toFixed(2);
      const info = extraInfo ? ` ${extraInfo}` : '';
      this.layoutTime.set(`${elapsed}s (${nodeCount} nodes)${info}`);
    };

    if (this.useWasmLayout()) {
      this.runWasmLayout(nodeCount, onLayoutComplete);
    } else {
      this.runJsLayout(nodeCount, start, onLayoutComplete);
    }
  }

  /**
   * Run layout using the cytoscape-euler-wasm npm package.
   *
   * Uses the standard Cytoscape layout API — the package handles
   * Web Worker creation, WASM loading, and threading internally.
   */
  private runWasmLayout(nodeCount: number, onComplete: (extra?: string) => void): void {
    this.layoutTime.set('computing layout (WASM)...');
    this.progressPercent.set(0);

    let completed = false;

    const config = {
      ...this.settings.getEulerWasmConfig(nodeCount),

      // Progress callback — called ~every 50 iterations from the WASM engine
      progress: ({ percent }: { percent: number }) => {
        this.progressPercent.set(percent);
      },

      // Telemetry — detailed perf data after layout completes
      onTelemetry: (data: any) => {
        completed = true;
        const mode = data.threaded ? `${data.threadCount}T` : '1T';
        const converge = data.converged ? 'converged' : 'max-iter';
        this.telemetryInfo.set(
          `WASM: ${data.iterations} iter, ${converge}, ${mode}, ${data.wasmMs.toFixed(0)}ms compute`,
        );
        onComplete(` [WASM, ${data.iterations} iter, ${converge}, ${mode}]`);
      },
    };

    const layout = this.cy.layout(config as any);

    // Fallback: if onTelemetry never fires (e.g. telemetry disabled),
    // complete via layoutstop event instead.
    layout.one('layoutstop', () => {
      if (!completed) {
        onComplete(' [WASM]');
      }
    });

    layout.run();
  }

  /**
   * Run layout using the JS cytoscape-euler package (for comparison).
   */
  private runJsLayout(nodeCount: number, start: number, onComplete: (extra?: string) => void): void {
    const config = this.settings.getEulerJsConfig();

    if (this.settings.eulerAnimate()) {
      this.layoutTime.set('0.00s');
      this.timerInterval = setInterval(() => {
        this.layoutTime.set(`${((performance.now() - start) / 1000).toFixed(2)}s`);
      }, 50);

      const layout = this.cy.layout(config as any);
      layout.one('layoutstop', () => onComplete(' [JS]'));
      layout.run();
    } else {
      this.layoutTime.set('computing layout (JS)...');
      setTimeout(() => {
        const layout = this.cy.layout(config as any);
        layout.run();
        onComplete(' [JS]');
      }, 10);
    }
  }
}
