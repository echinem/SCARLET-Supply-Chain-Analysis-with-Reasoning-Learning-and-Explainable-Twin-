import { create } from 'zustand'
import {
  Connection,
  Edge,
  EdgeChange,
  Node,
  NodeChange,
  addEdge,
  OnNodesChange,
  OnEdgesChange,
  OnConnect,
  applyNodeChanges,
  applyEdgeChanges,
} from 'reactflow'

export type GraphNodeData = {
  label: string;
  name: string;
  capacity?: number;
  inventory?: number;
  risk_score?: number;
  lat?: number;
  lng?: number;
}

export type GraphEdgeData = {
  type: string;
  transit_time?: number;
  cost?: number;
  congestion?: number;
}

export type AppNode = Node<GraphNodeData>;
export type AppEdge = Edge<GraphEdgeData>;

type GraphState = {
  viewMode: 'graph' | 'map';
  setViewMode: (mode: 'graph' | 'map') => void;
  nodes: AppNode[];
  edges: AppEdge[];
  routeGeometries: Record<string, [number, number][]>;
  setRouteGeometries: (geometries: Record<string, [number, number][]> | ((prev: Record<string, [number, number][]>) => Record<string, [number, number][]>)) => void;
  alternativeRoutesMap: Record<string, any[]>;
  setAlternativeRoutesMap: (updater: Record<string, any[]> | ((prev: Record<string, any[]>) => Record<string, any[]>)) => void;
  bestRouteMap: Record<string, number>;
  setBestRouteMap: (updater: Record<string, number> | ((prev: Record<string, number>) => Record<string, number>)) => void;
  isLoading: boolean;
  error: string | null;
  onNodesChange: OnNodesChange;
  onEdgesChange: OnEdgesChange;
  onConnect: OnConnect;
  setNodes: (nodes: AppNode[]) => void;
  fetchGraph: () => Promise<void>;
  seedGraph: () => Promise<void>;
  clearGraph: () => Promise<void>;
  
  // Node Mutators
  createNode: (payload: any) => Promise<void>;
  deleteNode: (nodeId: string) => Promise<void>;
  importSubgraph: (payload: any) => Promise<void>;
  
  // Simulation State
  simulationId: string | null;
  simulationStatus: 'idle' | 'queued' | 'running' | 'completed' | 'failed';
  currentTimestep: number;
  totalTimesteps: number;
  pollingIntervalId: NodeJS.Timeout | null;
  simulationMetrics: {
    total_inventory: number;
    risk_index: number;
    active_disruptions: number;
    decision_mode: 'human' | 'ai';
    aiActions: {timestep: number, log: string}[];
  } | null;
  startSimulation: (timesteps: number, delay: number, decisionMode: 'human' | 'ai', disruptions?: any) => Promise<void>;
  pollSimulationStatus: () => void;
  pollSimulationMetrics: (simId: string) => Promise<void>;

  // Selection & Hover
  selectedNodeId: string | null;
  setSelectedNodeId: (id: string | null) => void;
  hoveredNodeId: string | null;
  setHoveredNodeId: (id: string | null) => void;
  selectedExplanation: { feature: string; impact: number }[] | null;
  setSelectedExplanation: (explanation: { feature: string; impact: number }[] | null) => void;
  mousePosition: { x: number; y: number };
  setMousePosition: (pos: { x: number; y: number }) => void;

  // AI Logic
  fetchNodeExplanation: (nodeId: string) => Promise<void>;

  // UI States
  isExplainabilityDrawerOpen: boolean;
  toggleExplainabilityDrawer: () => void;
}

export const useGraphStore = create<GraphState>((set, get) => ({
  viewMode: 'graph',
  setViewMode: (mode) => set({ viewMode: mode }),
  nodes: [],
  edges: [],
  routeGeometries: {},
  setRouteGeometries: (updater) => {
    if (typeof updater === 'function') {
      set((state) => ({ routeGeometries: updater(state.routeGeometries) }));
    } else {
      set({ routeGeometries: updater });
    }
  },
  alternativeRoutesMap: {},
  setAlternativeRoutesMap: (updater) => {
    if (typeof updater === 'function') {
      set((state) => ({ alternativeRoutesMap: updater(state.alternativeRoutesMap) }));
    } else {
      set({ alternativeRoutesMap: updater });
    }
  },
  bestRouteMap: {},
  setBestRouteMap: (updater) => {
    if (typeof updater === 'function') {
      set((state) => ({ bestRouteMap: updater(state.bestRouteMap) }));
    } else {
      set({ bestRouteMap: updater });
    }
  },
  isLoading: false,
  error: null,
  pollingIntervalId: null,
  onNodesChange: (changes: NodeChange[]) => {
    set({
      nodes: applyNodeChanges(changes, get().nodes),
    });
  },
  onEdgesChange: (changes: EdgeChange[]) => {
    set({
      edges: applyEdgeChanges(changes, get().edges),
    });
  },
  onConnect: (connection: Connection) => {
    set({
      edges: addEdge(connection, get().edges),
    });
  },
  setNodes: (nodes: AppNode[]) => {
    set({ nodes });
  },
  setEdges: (edges: AppEdge[]) => {
    set({ edges });
  },

  selectedNodeId: null,
  setSelectedNodeId: (id: string | null) => {
    set({ selectedNodeId: id });
  },

  hoveredNodeId: null,
  setHoveredNodeId: (id: string | null) => {
    set({ hoveredNodeId: id });
    if (id) {
       get().fetchNodeExplanation(id);
    } else if (!get().selectedNodeId) {
       set({ selectedExplanation: null });
    }
  },

  selectedExplanation: null,
  setSelectedExplanation: (explanation) => set({ selectedExplanation: explanation }),

  mousePosition: { x: 0, y: 0 },
  setMousePosition: (pos: { x: number; y: number }) => {
    set({ mousePosition: pos });
  },

  isExplainabilityDrawerOpen: false,
  toggleExplainabilityDrawer: () => {
    set((state) => ({ isExplainabilityDrawerOpen: !state.isExplainabilityDrawerOpen }));
  },

  fetchNodeExplanation: async (nodeId: string) => {
    const node = get().nodes.find(n => n.id === nodeId);
    if (!node) return;

    try {
      const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || '';
      // We map node metrics to the routing prediction model to get a SHAP breakdown
      // of how this node's current state contributes to overall system delay/risk.
      const payload = {
        distance: 1000, // Normalized unit
        duration: 3600, // 1 hour base
        congestion: (node.data.risk_score || 0) * 0.8, // Proxy for local congestion
        demand: (node.data.inventory || 0) / (node.data.capacity || 100), 
        from_degree: 3, // Defaults if not computed
        to_degree: 3,
        from_centrality: 0.2,
        to_centrality: 0.2
      };

      const response = await fetch(`${API_BASE}/api/routing/predict-delay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await response.json();
      if (response.ok && data.explanation) {
        set({ selectedExplanation: data.explanation });
      }
    } catch (err) {
      console.error("Failed to fetch SHAP explanation:", err);
    }
  },
  
  // API Fetcher interacting with the FastAPI backend
  fetchGraph: async () => {
    set({ isLoading: true, error: null });
    
    // In a real application we would batch these or hit a unified `/graph` endpoint.
    // However, adhering strictly to the specs: GET /api/nodes and GET /api/edges
    try {
      const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || '';
      const [nodesRes, edgesRes] = await Promise.all([
        fetch(`${API_BASE}/api/nodes`),
        fetch(`${API_BASE}/api/edges`) 
      ]);

      if (!nodesRes.ok || !edgesRes.ok) {
        throw new Error('Failed to fetch graph data');
      }

      const nodesData = await nodesRes.json();
      const edgesData = await edgesRes.json();

      if (nodesData.status !== "success" || edgesData.status !== "success") {
        throw new Error('API returned unsuccessful status');
      }

      // Auto-layout based on typical supply chain routing to prevent a jumbled mess
      const layerMap: Record<string, number> = {
        'Supplier': 0,
        'Factory': 1,
        'Warehouse': 2,
        'Port': 3,
        // Since both W1/W2/W3 and W_PORT have the "Warehouse" label,
        // we override its layer dynamically in the mappedNodes loop using its node_id
        'TransportHub': 5,
        'Transport Hub': 5,
        'Customer': 6
      };
      
      const counts: Record<string, number> = {};

      const mappedNodes: AppNode[] = (nodesData.data || []).map((n: any) => {
        let layer = layerMap[n.label] ?? 7;
        
        // Special case: "W_PORT" sits under the Port
        if (n.node_id === 'W_PORT') {
            layer = 4; // Below the port (which is layer 3)
        }

        counts[layer] = (counts[layer] || 0) + 1;
        
        let xPos = counts[layer] * 250;
        
        // Let's manually center the bottleneck nodes to look nice in the standard 1-2-3-1-1-1-3 layout
        if (n.node_id === 'P1' || n.node_id === 'W_PORT' || n.node_id === 'T1') {
            xPos = 500; // Force them all to align centrally in the middle column
        }

        return {
          id: n.node_id,
          position: { 
            // Spread out nodes in the same layer horizontally
            x: xPos, 
            y: layer * 200 
          },
          data: {
            label: n.label,
            name: n.name,
            capacity: n.capacity,
            inventory: n.inventory,
            risk_score: n.risk_score,
            lat: n.lat,
            lng: n.lng
          }
        };
      });

      const mappedEdges: AppEdge[] = (edgesData.data || []).map((e: any) => ({
        id: e.edge_id,
        source: e.source_id,
        target: e.target_id,
        data: {
          type: e.type,
          transit_time: e.transit_time,
          cost: e.cost,
          congestion: e.congestion
        }
      }));

      set({ nodes: mappedNodes, edges: mappedEdges, isLoading: false });
    } catch (err: any) {
      set({ error: err.message, isLoading: false });
    }
  },

  seedGraph: async () => {
    set({ isLoading: true, error: null });
    try {
      const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || '';
      const response = await fetch(`${API_BASE}/api/dev/seed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      if (!response.ok) {
        throw new Error('Failed to seed graph');
      }
      // Re-fetch visualization immediately after seeding
      await get().fetchGraph();
    } catch (err: any) {
      set({ error: err.message, isLoading: false });
    }
  },

  clearGraph: async () => {
    set({ isLoading: true, error: null });
    try {
      const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || '';
      const response = await fetch(`${API_BASE}/api/dev/clear`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' }
      });
      if (!response.ok) {
        throw new Error('Failed to clear graph');
      }
      // Re-fetch visualization immediately after clearing
      await get().fetchGraph();
    } catch (err: any) {
      set({ error: err.message, isLoading: false });
    }
  },

  // --- External Node Mutators ---
  createNode: async (payload: any) => {
    try {
      const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || '';
      const response = await fetch(`${API_BASE}/api/nodes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!response.ok) throw new Error("Failed to create node");
      
      // Instantly resync the visual mapping against Neo4j
      await get().fetchGraph();
    } catch (err: any) {
      console.error(err);
    }
  },

  deleteNode: async (nodeId: string) => {
    try {
      const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || '';
      const response = await fetch(`${API_BASE}/api/nodes/${nodeId}`, {
        method: 'DELETE'
      });
      if (!response.ok) throw new Error("Failed to delete node");
      
      // Immediately reset selection if we deleted the target
      if (get().selectedNodeId === nodeId) {
         set({ selectedNodeId: null });
      }

      await get().fetchGraph();
    } catch (err: any) {
      console.error(err);
    }
  },

  importSubgraph: async (payload: any) => {
    try {
      const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || '';
      const response = await fetch(`${API_BASE}/api/graph/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!response.ok) throw new Error("Failed to import subgraph");
      
      await get().fetchGraph();
    } catch (err: any) {
      console.error(err);
    }
  },

  // --- Simulation Actions ---
  simulationId: null,
  simulationStatus: 'idle',
  currentTimestep: 0,
  totalTimesteps: 0,
  simulationMetrics: null,

  startSimulation: async (timesteps: number, delay: number, decisionMode: 'human' | 'ai', disruptions: any = {}) => {
    // 1. Clear any orphaned intervals on restart
    const currentInterval = get().pollingIntervalId;
    if (currentInterval) {
      clearInterval(currentInterval);
    }

    set({ 
      simulationStatus: 'queued', 
      error: null,
      currentTimestep: 0,
      totalTimesteps: timesteps,
      pollingIntervalId: null,
      simulationMetrics: null
    });

    try {
      const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || '';
      const response = await fetch(`${API_BASE}/api/simulate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          timesteps: timesteps,
          simulation_tick_delay: delay,
          decision_mode: decisionMode,
          disruptions: disruptions
        })
      });

      const data = await response.json();
      if (!response.ok || data.status !== 'success') {
        throw new Error(data.error || 'Failed to start simulation');
      }

      set({ simulationId: data.data.simulation_id });
      get().pollSimulationStatus();
    } catch (err: any) {
      set({ 
        simulationStatus: 'failed', 
        error: err.message 
      });
    }
  },

  pollSimulationStatus: () => {
    const simId = get().simulationId;
    if (!simId) return;

    // Safety clear
    const existingInterval = get().pollingIntervalId;
    if (existingInterval) clearInterval(existingInterval);

    const pollInterval = setInterval(async () => {
      try {
        const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || '';
        const response = await fetch(`${API_BASE}/api/simulation/${simId}/status`);
        const data = await response.json();

        if (!response.ok || data.status !== 'success') throw new Error('Poll failed');

        const state = data.data;
        const metrics = state.metrics; // Full state is nested in metrics field of status endpoint
        const currentStatus = state.status;
        
        // --- REACTIVITY SYNC ---
        // We update everything in ONE set call to ensure visual synchronization
        const nodeMetrics = metrics.node_metrics;
        let updatedNodes = [...get().nodes];
        
        if (nodeMetrics) {
          updatedNodes = updatedNodes.map(n => {
            if (nodeMetrics[n.id]) {
              return {
                ...n,
                data: {
                  ...n.data,
                  inventory: nodeMetrics[n.id].inventory,
                  risk_score: nodeMetrics[n.id].risk_score,
                  capacity: nodeMetrics[n.id].capacity ?? n.data.capacity
                }
              };
            }
            return n;
          });
        }

        set({
          simulationStatus: currentStatus,
          currentTimestep: state.current_timestep,
          totalTimesteps: state.total_timesteps,
          nodes: updatedNodes,
          simulationMetrics: {
            total_inventory: metrics.total_inventory,
            risk_index: metrics.risk_index,
            active_disruptions: metrics.active_disruptions,
            decision_mode: metrics.decision_mode || 'human',
            aiActions: metrics.ai_actions || []
          }
        });

        if (currentStatus === 'completed' || currentStatus === 'failed') {
          clearInterval(pollInterval);
          set({ pollingIntervalId: null });
        }
      } catch (err: any) {
        console.error("Polling Error:", err);
        clearInterval(pollInterval);
        set({ simulationStatus: 'failed', pollingIntervalId: null });
      }
    }, 250); // High-frequency polling to match backend 0.2-0.3s delay
    
    set({ pollingIntervalId: pollInterval });
  },

  pollSimulationMetrics: async (simId: string) => {
    try {
      const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || '';
      const response = await fetch(`${API_BASE}/api/simulation/${simId}/metrics`);
      const data = await response.json();

      if (!response.ok || data.status !== 'success') {
        throw new Error('Failed to fetch metrics');
      }

      console.log(`[Metrics Poll] Received metrics:`, data.data);

      const currentMetrics = get().simulationMetrics;
      const newMetrics = data.data;

      // Always remap nodes so localized risk mutations are visually caught
      // even if total macro inventory hasn't changed
      const nodeMetrics = newMetrics.node_metrics;
      let updatedNodes = get().nodes;
      if (nodeMetrics) {
        updatedNodes = get().nodes.map(n => {
          if (nodeMetrics[n.id]) {
            return {
              ...n,
              data: {
                ...n.data,
                inventory: nodeMetrics[n.id].inventory,
                risk_score: nodeMetrics[n.id].risk_score,
                capacity: nodeMetrics[n.id].capacity ?? n.data.capacity
              }
            };
          }
          return n;
        });
      }

      set({ 
        simulationMetrics: {
          total_inventory: newMetrics.total_inventory,
          risk_index: newMetrics.risk_index,
          active_disruptions: newMetrics.active_disruptions,
          decision_mode: newMetrics.decision_mode || 'human',
          aiActions: newMetrics.ai_actions || []
        },
        nodes: [...updatedNodes] // Spread operator forces structural re-evaluation in React Flow
      });
    } catch (err: any) {
      console.error("Metrics polling failed:", err);
      // We don't fail the entire simulation if metrics drop a frame
    }
  }
}));
