import { Injectable } from '@angular/core';

// ============================================================================
// CONFIGURABLE CONSTANTS
// ============================================================================

export const NODE_DIMENSIONS = {
  DOT_SIZE: 20,
  ICON_SIZE: 32,
  CARD_HEIGHT: 32,
  DETAILED_HEIGHT: 48,
} as const;

export const SVG_LAYOUT = {
  PADDING: 6,
  ICON_WIDTH_CARD: 28,
  ICON_WIDTH_DETAILED: 32,
  MENU_WIDTH_CARD: 24,
  MENU_WIDTH_DETAILED: 28,
  BORDER_RADIUS: 6,
  LABEL_BORDER_RADIUS: 3,
} as const;

export const TEXT_CONFIG = {
  CHAR_WIDTH: 7,
  CHAR_WIDTH_SMALL: 5.5,
  MIN_TEXT_WIDTH: 40,
  MIN_TEXT_WIDTH_DETAILED: 50,
  FONT_SIZE_PRIMARY: 11,
  FONT_SIZE_DETAILED: 12,
  FONT_SIZE_SECONDARY: 9,
  TEXT_COLOR: 'white',
  SECONDARY_OPACITY: 0.9,
  SECONDARY_LABEL_PADDING: 6,
} as const;

export const MENU_CONFIG = {
  BUTTON_WIDTH: 18,
  BUTTON_HEIGHT: 16,
  BUTTON_RADIUS: 3,
  BUTTON_BG_COLOR: 'rgba(0, 0, 0, 0.25)',
  ARROW_COLOR: '#FFFFFF',
  ARROW_SIZE: 10,
} as const;

const SECONDARY_BG_BRIGHTNESS_OFFSET = -30;

export const BRIGHT_ICON_COLORS: readonly string[] = [
  '#FFD700', '#00FFFF', '#FF69B4', '#7CFC00', '#FF6347',
  '#00FF7F', '#FF00FF', '#FFFF00', '#00BFFF', '#FF4500',
  '#ADFF2F', '#FF1493',
];

export const RANDOM_LABELS: readonly string[] = [
  'Production', 'Development', 'Staging', 'Testing', 'Archive',
  'Primary', 'Secondary', 'Backup', 'Active', 'Inactive',
  'Critical', 'Standard', 'Legacy', 'Modern', 'Deprecated',
];

// ============================================================================
// ICON SVG DEFINITIONS
// ============================================================================

export const ICON_SVGS_CIRCLE: readonly string[] = [
  `<ellipse cx="12" cy="6" rx="6" ry="2.5" fill="white"/><path d="M6 6v10c0 1.38 2.69 2.5 6 2.5s6-1.12 6-2.5V6" fill="none" stroke="white" stroke-width="1.5"/><path d="M6 11c0 1.38 2.69 2.5 6 2.5s6-1.12 6-2.5" fill="none" stroke="white" stroke-width="1.5"/>`,
  `<rect x="5" y="4" width="14" height="6" rx="1" fill="white"/><rect x="5" y="14" width="14" height="6" rx="1" fill="white"/><circle cx="8" cy="7" r="1" fill="#333"/><circle cx="8" cy="17" r="1" fill="#333"/>`,
  `<path d="M17 11.5c0-.28-.02-.55-.06-.82A5.5 5.5 0 0 0 12 6a5.5 5.5 0 0 0-5.14 3.55A4.5 4.5 0 0 0 3 14a4.5 4.5 0 0 0 4.5 4.5h9a3.5 3.5 0 0 0 .5-6.97z" fill="white"/>`,
  `<path d="M13 4H7a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V9l-5-5zm0 1.5L16.5 9H13z" fill="white"/>`,
  `<circle cx="12" cy="12" r="3" fill="none" stroke="white" stroke-width="1.5"/><path d="M12 4v2m0 12v2m-8-8h2m12 0h2m-3.5-5.5l-1.4 1.4m-5.2 5.2l-1.4 1.4m0-8l1.4 1.4m5.2 5.2l1.4 1.4" stroke="white" stroke-width="1.5" stroke-linecap="round"/>`,
  `<circle cx="12" cy="8" r="3.5" fill="white"/><path d="M5 19v-1a7 7 0 0 1 14 0v1" fill="white"/>`,
  `<circle cx="12" cy="12" r="3" fill="white"/><circle cx="6" cy="12" r="1.5" fill="white"/><circle cx="18" cy="12" r="1.5" fill="white"/><circle cx="12" cy="6" r="1.5" fill="white"/><circle cx="12" cy="18" r="1.5" fill="white"/><line x1="9" y1="12" x2="7.5" y2="12" stroke="white" stroke-width="1.5"/><line x1="16.5" y1="12" x2="15" y2="12" stroke="white" stroke-width="1.5"/><line x1="12" y1="9" x2="12" y2="7.5" stroke="white" stroke-width="1.5"/><line x1="12" y1="16.5" x2="12" y2="15" stroke="white" stroke-width="1.5"/>`,
  `<path d="M12 4l7 4v8l-7 4-7-4V8z" fill="none" stroke="white" stroke-width="1.5"/><path d="M12 12l7-4M12 12l-7-4M12 12v8" stroke="white" stroke-width="1.5"/>`,
];

export const ICON_SVGS_CARD: readonly string[] = [
  `<ellipse cx="12" cy="4" rx="7" ry="2.5" fill="currentColor"/><path d="M5 4v16c0 1.38 3.13 2.5 7 2.5s7-1.12 7-2.5V4" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M5 10c0 1.38 3.13 2.5 7 2.5s7-1.12 7-2.5" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M5 16c0 1.38 3.13 2.5 7 2.5s7-1.12 7-2.5" fill="none" stroke="currentColor" stroke-width="1.5"/>`,
  `<rect x="3" y="2" width="18" height="6" rx="1" fill="currentColor"/><rect x="3" y="9" width="18" height="6" rx="1" fill="currentColor"/><rect x="3" y="16" width="18" height="6" rx="1" fill="currentColor"/><circle cx="6" cy="5" r="1" fill="#333"/><circle cx="6" cy="12" r="1" fill="#333"/><circle cx="6" cy="19" r="1" fill="#333"/>`,
  `<path d="M19.35 10.04A7.49 7.49 0 0 0 12 4C9.11 4 6.6 5.64 5.35 8.04A5.994 5.994 0 0 0 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96z" fill="currentColor"/>`,
  `<path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm-1 7V3.5L18.5 9H13z" fill="currentColor"/>`,
  `<path d="M19.14 12.94c.04-.31.06-.63.06-.94 0-.31-.02-.63-.06-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.49.49 0 0 0-.59-.22l-2.39.96a7.09 7.09 0 0 0-1.62-.94l-.36-2.54a.484.484 0 0 0-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96a.49.49 0 0 0-.59.22L2.74 8.87a.49.49 0 0 0 .12.61l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32a.49.49 0 0 0-.12-.61l-2.01-1.58zM12 15.6A3.6 3.6 0 1 1 12 8.4a3.6 3.6 0 0 1 0 7.2z" fill="currentColor"/>`,
  `<path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" fill="currentColor"/>`,
  `<circle cx="12" cy="12" r="4" fill="currentColor"/><circle cx="4" cy="12" r="2" fill="currentColor"/><circle cx="20" cy="12" r="2" fill="currentColor"/><circle cx="12" cy="4" r="2" fill="currentColor"/><circle cx="12" cy="20" r="2" fill="currentColor"/><line x1="8" y1="12" x2="6" y2="12" stroke="currentColor" stroke-width="2"/><line x1="18" y1="12" x2="14" y2="12" stroke="currentColor" stroke-width="2"/><line x1="12" y1="8" x2="12" y2="6" stroke="currentColor" stroke-width="2"/><line x1="12" y1="18" x2="12" y2="14" stroke="currentColor" stroke-width="2"/>`,
  `<path d="M21 16.5c0 .38-.21.71-.53.88l-7.9 4.44c-.16.12-.36.18-.57.18s-.41-.06-.57-.18l-7.9-4.44A.991.991 0 0 1 3 16.5v-9c0-.38.21-.71.53-.88l7.9-4.44c.16-.12.36-.18.57-.18s.41.06.57.18l7.9 4.44c.32.17.53.5.53.88v9zM12 4.15L5 8.09v7.82l7 3.94l7-3.94V8.09l-7-3.94z" fill="currentColor"/>`,
];

function generateMenuButton(x: number, y: number, height: number): string {
  const { BUTTON_WIDTH, BUTTON_HEIGHT, BUTTON_RADIUS, BUTTON_BG_COLOR, ARROW_COLOR, ARROW_SIZE } = MENU_CONFIG;
  const buttonY = y + (height - BUTTON_HEIGHT) / 2;
  const arrowY = buttonY + BUTTON_HEIGHT / 2 + 1;
  const arrowX = x + BUTTON_WIDTH / 2;

  return `
    <rect x="${x}" y="${buttonY}" width="${BUTTON_WIDTH}" height="${BUTTON_HEIGHT}"
          rx="${BUTTON_RADIUS}" ry="${BUTTON_RADIUS}" fill="${BUTTON_BG_COLOR}"/>
    <text x="${arrowX}" y="${arrowY}"
          text-anchor="middle" dominant-baseline="middle"
          font-family="Arial, sans-serif" font-size="${ARROW_SIZE}"
          fill="${ARROW_COLOR}">▼</text>
  `;
}

// ============================================================================
// RESULT INTERFACES
// ============================================================================

export interface SvgResult {
  svg: string;
  width: number;
  height: number;
}

// ============================================================================
// SVG SERVICE
// ============================================================================

@Injectable({ providedIn: 'root' })
export class SvgService {
  private readonly iconSvgCache = new Map<string, string>();
  private readonly cardsSvgCache = new Map<string, string>();
  private readonly detailedSvgCache = new Map<string, string>();
  private lastCardGenTime = 0;
  private lastDetailedGenTime = 0;

  // ── Public API ──────────────────────────────────────────────────────────

  generateCircleIconSvg(iconIndex: number, bgColor: string): string {
    const iconColor = BRIGHT_ICON_COLORS[iconIndex % BRIGHT_ICON_COLORS.length];
    const cacheKey = `circle-${iconIndex}-${bgColor}-${iconColor}`;

    if (this.iconSvgCache.has(cacheKey)) return this.iconSvgCache.get(cacheKey)!;

    const icon = ICON_SVGS_CIRCLE[iconIndex % ICON_SVGS_CIRCLE.length].replace(/white/g, iconColor);

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">
    <circle cx="12" cy="12" r="12" fill="${bgColor}"/>
    ${icon}
  </svg>`;

    const dataUri = `data:image/svg+xml,${encodeURIComponent(svg)}`;
    this.iconSvgCache.set(cacheKey, dataUri);
    return dataUri;
  }

  generateCardSvg(
    nodeId: string,
    label: string,
    iconIndex: number,
    bgColor: string,
    textColor: string = TEXT_CONFIG.TEXT_COLOR,
  ): SvgResult {
    const start = performance.now();
    const iconColor = BRIGHT_ICON_COLORS[iconIndex % BRIGHT_ICON_COLORS.length];
    const cacheKey = `card-${nodeId}-${label}-${iconIndex}-${bgColor}`;

    const { CARD_HEIGHT } = NODE_DIMENSIONS;
    const { ICON_WIDTH_CARD, MENU_WIDTH_CARD, PADDING, BORDER_RADIUS } = SVG_LAYOUT;
    const { CHAR_WIDTH, MIN_TEXT_WIDTH, FONT_SIZE_PRIMARY } = TEXT_CONFIG;

    const textWidth = Math.max(label.length * CHAR_WIDTH, MIN_TEXT_WIDTH);
    const totalWidth = ICON_WIDTH_CARD + textWidth + MENU_WIDTH_CARD + PADDING * 2;

    if (this.cardsSvgCache.has(cacheKey)) {
      this.lastCardGenTime += performance.now() - start;
      return { svg: this.cardsSvgCache.get(cacheKey)!, width: totalWidth, height: CARD_HEIGHT };
    }

    const icon = ICON_SVGS_CARD[iconIndex % ICON_SVGS_CARD.length].replace(/currentColor/g, iconColor);
    const textEndX = totalWidth - MENU_WIDTH_CARD - 2;
    const menuButtonX = totalWidth - MENU_WIDTH_CARD + 2;

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalWidth} ${CARD_HEIGHT}" width="${totalWidth}" height="${CARD_HEIGHT}">
    <rect x="0" y="0" width="${totalWidth}" height="${CARD_HEIGHT}" rx="${BORDER_RADIUS}" ry="${BORDER_RADIUS}" fill="${bgColor}"/>
    <g transform="translate(${PADDING}, 4) scale(0.9, 1)">${icon}</g>
    <text x="${textEndX}" y="${CARD_HEIGHT / 2 + 1}"
          text-anchor="end" dominant-baseline="middle"
          font-family="Arial, sans-serif" font-size="${FONT_SIZE_PRIMARY}" font-weight="500" fill="${textColor}">${this.escapeXml(label)}</text>
    ${generateMenuButton(menuButtonX, 0, CARD_HEIGHT)}
  </svg>`;

    const dataUri = `data:image/svg+xml,${encodeURIComponent(svg)}`;
    this.cardsSvgCache.set(cacheKey, dataUri);
    this.lastCardGenTime += performance.now() - start;
    return { svg: dataUri, width: totalWidth, height: CARD_HEIGHT };
  }

  generateDetailedSvg(
    nodeId: string,
    label: string,
    secondLabel: string,
    iconIndex: number,
    bgColor: string,
    textColor: string = TEXT_CONFIG.TEXT_COLOR,
  ): SvgResult {
    const start = performance.now();
    const iconColor = BRIGHT_ICON_COLORS[iconIndex % BRIGHT_ICON_COLORS.length];
    const cacheKey = `detailed-${nodeId}-${label}-${secondLabel}-${iconIndex}-${bgColor}`;

    const { DETAILED_HEIGHT } = NODE_DIMENSIONS;
    const { ICON_WIDTH_DETAILED, MENU_WIDTH_DETAILED, PADDING, BORDER_RADIUS, LABEL_BORDER_RADIUS } = SVG_LAYOUT;
    const { CHAR_WIDTH, CHAR_WIDTH_SMALL, MIN_TEXT_WIDTH_DETAILED, FONT_SIZE_DETAILED, FONT_SIZE_SECONDARY, SECONDARY_OPACITY, SECONDARY_LABEL_PADDING } = TEXT_CONFIG;

    const LINE2_HEIGHT = 18;
    const textWidth = Math.max(label.length * CHAR_WIDTH, MIN_TEXT_WIDTH_DETAILED);
    const secondLabelTextWidth = secondLabel.length * CHAR_WIDTH_SMALL;
    const totalWidth = Math.max(
      ICON_WIDTH_DETAILED + textWidth + MENU_WIDTH_DETAILED + PADDING * 2,
      secondLabelTextWidth + ICON_WIDTH_DETAILED + MENU_WIDTH_DETAILED + PADDING * 2,
    );

    if (this.detailedSvgCache.has(cacheKey)) {
      this.lastDetailedGenTime += performance.now() - start;
      return { svg: this.detailedSvgCache.get(cacheKey)!, width: totalWidth, height: DETAILED_HEIGHT };
    }

    const icon = ICON_SVGS_CARD[iconIndex % ICON_SVGS_CARD.length].replace(/currentColor/g, iconColor);
    const secondBgColor = this.adjustColorBrightness(bgColor, SECONDARY_BG_BRIGHTNESS_OFFSET);
    const iconScale = (DETAILED_HEIGHT - 8) / 24;
    const textEndX = totalWidth - MENU_WIDTH_DETAILED - 2;
    const menuButtonX = totalWidth - MENU_WIDTH_DETAILED + 4;
    const line2Y = DETAILED_HEIGHT * 0.55;
    const line2BgWidth = secondLabelTextWidth + SECONDARY_LABEL_PADDING * 2;
    const line2BgX = textEndX - line2BgWidth;

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalWidth} ${DETAILED_HEIGHT}" width="${totalWidth}" height="${DETAILED_HEIGHT}">
    <rect x="0" y="0" width="${totalWidth}" height="${DETAILED_HEIGHT}" rx="${BORDER_RADIUS}" ry="${BORDER_RADIUS}" fill="${bgColor}"/>
    <g transform="translate(${PADDING}, 4) scale(${iconScale})">${icon}</g>
    <text x="${textEndX}" y="${DETAILED_HEIGHT * 0.35}"
          text-anchor="end" dominant-baseline="middle"
          font-family="Arial, sans-serif" font-size="${FONT_SIZE_DETAILED}" font-weight="600" fill="${textColor}">${this.escapeXml(label)}</text>
    <rect x="${line2BgX}" y="${line2Y}" width="${line2BgWidth}" height="${LINE2_HEIGHT - 2}" rx="${LABEL_BORDER_RADIUS}" ry="${LABEL_BORDER_RADIUS}" fill="${secondBgColor}"/>
    <text x="${line2BgX + line2BgWidth - SECONDARY_LABEL_PADDING}" y="${line2Y + (LINE2_HEIGHT - 2) / 2}"
          text-anchor="end" dominant-baseline="middle"
          font-family="Arial, sans-serif" font-size="${FONT_SIZE_SECONDARY}" font-weight="400" fill="${textColor}" opacity="${SECONDARY_OPACITY}">${this.escapeXml(secondLabel)}</text>
    ${generateMenuButton(menuButtonX, 0, DETAILED_HEIGHT)}
  </svg>`;

    const dataUri = `data:image/svg+xml,${encodeURIComponent(svg)}`;
    this.detailedSvgCache.set(cacheKey, dataUri);
    this.lastDetailedGenTime += performance.now() - start;
    return { svg: dataUri, width: totalWidth, height: DETAILED_HEIGHT };
  }

  clearCaches(): void {
    this.iconSvgCache.clear();
    this.cardsSvgCache.clear();
    this.detailedSvgCache.clear();
    this.lastCardGenTime = 0;
    this.lastDetailedGenTime = 0;
  }

  resetTimingCounters(): void {
    this.lastCardGenTime = 0;
    this.lastDetailedGenTime = 0;
  }

  logGenerationSummary(nodeCount: number): void {
    const totalTime = this.lastCardGenTime + this.lastDetailedGenTime;
    console.log(`\n========== SVG Generation Summary ==========`);
    console.log(`Nodes: ${nodeCount}`);
    console.log(`Icon SVGs: ${this.iconSvgCache.size} unique`);
    console.log(`Card SVGs: ${this.cardsSvgCache.size}, ${this.lastCardGenTime.toFixed(2)}ms`);
    console.log(`Detailed SVGs: ${this.detailedSvgCache.size}, ${this.lastDetailedGenTime.toFixed(2)}ms`);
    console.log(`Total: ${totalTime.toFixed(2)}ms (${(totalTime / nodeCount).toFixed(3)}ms/node)`);
    console.log(`=============================================\n`);
  }

  getSecondaryLabel(index: number): string {
    return RANDOM_LABELS[index % RANDOM_LABELS.length];
  }

  // ── Private Helpers ─────────────────────────────────────────────────────

  private escapeXml(str: string): string {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
  }

  private adjustColorBrightness(hex: string, percent: number): string {
    const num = parseInt(hex.replace('#', ''), 16);
    const r = Math.min(255, Math.max(0, (num >> 16) + percent));
    const g = Math.min(255, Math.max(0, ((num >> 8) & 0x00ff) + percent));
    const b = Math.min(255, Math.max(0, (num & 0x0000ff) + percent));
    return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
  }
}
