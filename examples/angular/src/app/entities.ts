export interface Entity {
  id: string;
  name: string;
  relationships: { targetId: string }[];
  layer?: number;
}

// Color palette for graph layers — bright, high saturation colors
export const LAYER_COLORS = [
  '#FF6B6B', '#4ECDC4', '#FFE66D', '#95E1D3', '#F38181',
  '#AA96DA', '#FCBAD3', '#A8D8EA', '#FF9F43', '#6C5CE7',
  '#00B894', '#E17055', '#0984E3', '#D63031', '#5F27CD',
  '#00CEC9', '#E84393', '#FDCB6E', '#1DD1A1', '#A29BFE',
  '#FD79A8', '#81ECEC', '#FFEAA7', '#FAB1A0', '#74B9FF',
];

/**
 * Shuffle an array using Fisher-Yates algorithm (returns new array).
 */
export function shuffleArray<T>(array: T[]): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * Generate random nodes within the specified range.
 */
function generateNodes(min: number, max: number): Entity[] {
  if (isNaN(min) || min < 0) min = 0;
  if (isNaN(max) || max < min) max = min;

  const numNodes = Math.floor(Math.random() * (max - min + 1)) + min;
  const nodeArray: Entity[] = [];

  for (let i = 0; i < numNodes; i++) {
    nodeArray.push({
      id: `node_${i}`,
      name: `Node ${i}`,
      relationships: [],
      layer: 0,
    });
  }

  return shuffleArray(nodeArray);
}

/**
 * Generate links to form a random tree structure.
 */
function generateLinks(
  nodeArray: Entity[],
  min: number,
  max: number,
): { from: string; to: string }[] {
  if (nodeArray.length < 2) return [];
  if (isNaN(min) || min < 1) min = 1;
  if (isNaN(max) || max < min) max = min;

  const linkArray: { from: string; to: string }[] = [];
  const nodes = [...nodeArray];
  const available = [...nodeArray];

  for (let i = 0; i < nodes.length; i++) {
    const next = nodes[i];
    const nextIdx = available.findIndex((n) => n.id === next.id);
    if (nextIdx >= 0) available.splice(nextIdx, 1);

    const children = Math.floor(Math.random() * (max - min + 1)) + min;

    for (let j = 1; j <= children; j++) {
      if (available.length === 0) break;
      const to = available[0];
      available.shift();

      linkArray.push({ from: next.id, to: to.id });
      next.relationships.push({ targetId: to.id });
    }
  }

  return linkArray;
}

/**
 * Assign layer values to nodes based on tree depth using BFS.
 */
function assignLayers(
  nodeArray: Entity[],
  links: { from: string; to: string }[],
): void {
  const childrenMap = new Map<string, string[]>();
  for (const link of links) {
    if (!childrenMap.has(link.from)) childrenMap.set(link.from, []);
    childrenMap.get(link.from)!.push(link.to);
  }

  const targetIds = new Set(links.map((l) => l.to));
  const rootIds = nodeArray.map((n) => n.id).filter((id) => !targetIds.has(id));

  const layerMap = new Map<string, number>();
  const queue: { id: string; layer: number }[] = rootIds.map((id) => ({ id, layer: 0 }));

  while (queue.length > 0) {
    const { id, layer } = queue.shift()!;
    if (layerMap.has(id)) continue;
    layerMap.set(id, layer);

    const children = childrenMap.get(id) || [];
    for (const childId of children) {
      if (!layerMap.has(childId)) {
        queue.push({ id: childId, layer: layer + 1 });
      }
    }
  }

  for (const node of nodeArray) {
    node.layer = layerMap.get(node.id) ?? 0;
  }
}

/**
 * Generate a complete random tree with nodes, links, and layer assignments.
 */
export function generateRandomTree(
  minNodes: number,
  maxNodes: number,
  minChildren: number,
  maxChildren: number,
): { nodes: Entity[]; links: { from: string; to: string }[] } {
  const nodes = generateNodes(minNodes, maxNodes);
  const links = generateLinks(nodes, minChildren, maxChildren);
  assignLayers(nodes, links);
  return { nodes, links };
}
