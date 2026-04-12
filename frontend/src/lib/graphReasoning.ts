import { AppNode, AppEdge } from '@/store/graphStore';

/**
 * Builds O(1) adjacency maps for lightning-fast graph traversal.
 * Prevents O(N^2) inner loops matching edges during BFS.
 */
function buildAdjacencyMaps(edges: AppEdge[]) {
  const downstreamMap = new Map<string, string[]>();
  const upstreamMap = new Map<string, string[]>();

  for (const edge of edges) {
    if (!downstreamMap.has(edge.source)) downstreamMap.set(edge.source, []);
    downstreamMap.get(edge.source)!.push(edge.target);

    if (!upstreamMap.has(edge.target)) upstreamMap.set(edge.target, []);
    upstreamMap.get(edge.target)!.push(edge.source);
  }

  return { downstreamMap, upstreamMap };
}

/**
 * Recursively fetches all structural upstream dependencies flowing into a node.
 */
export function getUpstreamNodes(nodeId: string, nodes: AppNode[], edges: AppEdge[]): string[] {
  const { upstreamMap } = buildAdjacencyMaps(edges);
  const visited = new Set<string>();
  const queue = [nodeId];

  while (queue.length > 0) {
    const current = queue.shift()!;
    const sources = upstreamMap.get(current) || [];
    
    for (const src of sources) {
      if (!visited.has(src)) {
        visited.add(src);
        queue.push(src);
      }
    }
  }

  return Array.from(visited);
}

/**
 * Recursively fetches all structural downstream dependencies reliant on a node.
 */
export function getDownstreamNodes(nodeId: string, nodes: AppNode[], edges: AppEdge[]): string[] {
  const { downstreamMap } = buildAdjacencyMaps(edges);
  const visited = new Set<string>();
  const queue = [nodeId];

  while (queue.length > 0) {
    const current = queue.shift()!;
    const targets = downstreamMap.get(current) || [];
    
    for (const tgt of targets) {
      if (!visited.has(tgt)) {
        visited.add(tgt);
        queue.push(tgt);
      }
    }
  }

  return Array.from(visited);
}

/**
 * Calculates precisely which upstream nodes are currently at high risk 
 * of throttling or starving the given node.
 */
export function getRiskContributors(nodeId: string, nodes: AppNode[], edges: AppEdge[], threshold = 0.5): string[] {
  const upstreamIds = getUpstreamNodes(nodeId, nodes, edges);
  const upstreamSet = new Set(upstreamIds);
  
  return nodes
    .filter(n => upstreamSet.has(n.id) && (n.data.risk_score || 0) >= threshold)
    .map(n => n.id);
}

/**
 * Predicts the full geographic impact radius if the specified node were to critically fail.
 */
export function getImpactRadius(nodeId: string, nodes: AppNode[], edges: AppEdge[]): string[] {
    // Structural impact radius is theoretically equivalent to the downstream cascade,
    // though this can be expanded later for multi-echelon severity modeling.
    return getDownstreamNodes(nodeId, nodes, edges);
}
