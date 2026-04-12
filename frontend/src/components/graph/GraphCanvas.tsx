"use client"

import { useMemo, useEffect, useRef } from 'react';
import ReactFlow, { 
  Background, 
  Controls, 
  MiniMap,
  NodeProps,
  EdgeProps,
  getBezierPath,
  MarkerType,
  useReactFlow,
  ReactFlowProvider,
  Handle,
  Position
} from 'reactflow';
import 'reactflow/dist/style.css';
import { motion, AnimatePresence } from 'framer-motion';
import dagre from 'dagre';

import { useGraphStore, AppNode, AppEdge } from '@/store/graphStore';
import { cn } from '@/lib/utils';
import ExplainabilityPanel from '@/components/dashboard/ExplainabilityPanel';
import { getUpstreamNodes, getDownstreamNodes } from '@/lib/graphReasoning';

const VisualContext = {
  highRiskNodeIds: new Set<string>(),
  downstreamRiskNodeIds: new Set<string>(),
  
  // Selection
  selectedNodeId: null as string | null,
  upstreamNodeIds: new Set<string>(),
  upstreamEdgeIds: new Set<string>(),
  downstreamNodeIds: new Set<string>(),
  downstreamEdgeIds: new Set<string>(),
};

// --- Custom Node Implementation ---
const CustomNode = ({ id, data, selected }: NodeProps) => {
  const simulationStatus = useGraphStore(state => state.simulationStatus);
  const isRunning = simulationStatus === 'running';

  const isHighRisk = data.risk_score && data.risk_score > 0.5;
  const isDownstreamRisk = isRunning && VisualContext.downstreamRiskNodeIds.has(id);

  const hasSelection = VisualContext.selectedNodeId !== null;
  const isSelected = VisualContext.selectedNodeId === id;
  const isUpstream = VisualContext.upstreamNodeIds.has(id);
  const isDownstream = VisualContext.downstreamNodeIds.has(id);
  const isUnrelated = hasSelection && !isSelected && !isUpstream && !isDownstream;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      className={cn(
        "relative rounded-xl border backdrop-blur-md p-4 min-w-[180px] transition-all duration-300",
        isUnrelated && "opacity-20 grayscale",
        isSelected 
          ? "border-blue-400 bg-blue-500/20 shadow-[0_0_30px_rgba(59,130,246,0.6)] z-30" 
          : isUpstream
            ? "border-amber-500/80 bg-amber-500/20 shadow-[0_0_25px_rgba(245,158,11,0.4)] z-20"
            : isDownstream
              ? "border-cyan-500/80 bg-cyan-500/20 shadow-[0_0_25px_rgba(6,182,212,0.4)] z-20"
              : isHighRisk 
                ? "bg-slate-900/90 border-red-500 shadow-[0_0_30px_rgba(239,68,68,0.5)] z-20"
                : isDownstreamRisk 
                  ? "border-amber-500/60 bg-amber-500/10 shadow-[0_0_20px_rgba(245,158,11,0.25)] z-10"
                  : "bg-slate-900/70 border-slate-700 shadow-[inset_0_1px_1px_rgba(255,255,255,0.1),0_8px_32px_0_rgba(0,0,0,0.5)]",
        !hasSelection && !isHighRisk && !isDownstreamRisk && "hover:border-slate-500 hover:shadow-[0_0_20px_rgba(59,130,246,0.15)]"
      )}
    >
      <Handle type="target" position={Position.Top} className="opacity-0 w-full h-full absolute inset-0 rounded-xl" />
      <Handle type="source" position={Position.Bottom} className="opacity-0 w-full h-full absolute inset-0 rounded-xl" />
      
      {isHighRisk && (
        <span className="absolute -top-1.5 -right-1.5 flex h-3 w-3">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
        </span>
      )}
      <div className="flex flex-col gap-1">
        <span className="text-[10px] font-medium tracking-wider text-slate-400 uppercase">
          {data.label}
        </span>
        <span className="text-sm font-semibold text-white truncate">
          {data.name}
        </span>
        
        {/* Metrics Pill */}
        <div className="mt-3 flex items-center justify-between gap-2 border-t border-white/10 pt-2">
          <div className="flex flex-col">
            <span className="text-[9px] text-white/40">RISK</span>
            <span className={cn(
              "text-xs font-mono",
              data.risk_score && data.risk_score > 0.5 ? "text-red-400" : "text-emerald-400"
            )}>
              {data.risk_score ? data.risk_score.toFixed(1) : "0.0"}
            </span>
          </div>
          <div className="flex flex-col text-center">
            <span className="text-[9px] text-white/40">CAP</span>
            <span className="text-xs font-mono text-blue-300">
              {data.capacity ? Math.round(data.capacity) : "∞"}
            </span>
          </div>
          <div className="flex flex-col text-right">
            <span className="text-[9px] text-white/40">INV</span>
            <span className="text-xs font-mono text-white/80">
              {data.inventory ? Math.round(data.inventory) : 0}
            </span>
          </div>
        </div>
      </div>
    </motion.div>
  );
};

// --- Custom Edge Implementation ---
const CustomEdge = ({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
  source,
}: EdgeProps) => {
  const simulationStatus = useGraphStore(state => state.simulationStatus);
  const isRunning = simulationStatus === 'running';

  const isHighRiskSource = isRunning && VisualContext.highRiskNodeIds.has(source);
  const hasSelection = VisualContext.selectedNodeId !== null;
  const isSelectedUpstream = VisualContext.upstreamEdgeIds.has(id);
  const isSelectedDownstream = VisualContext.downstreamEdgeIds.has(id);
  const isUnrelated = hasSelection && !isSelectedUpstream && !isSelectedDownstream;

  const [edgePath] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const edgeColor = isSelectedUpstream ? "#f59e0b" : isSelectedDownstream ? "#06b6d4" : isHighRiskSource ? "#f59e0b" : (isRunning ? "#ffffff" : "rgba(255, 255, 255, 0.4)");
  const edgeMarker = isSelectedUpstream ? "amber" : isSelectedDownstream ? "cyan" : isHighRiskSource ? "amber" : (isRunning ? "white" : "dim");
  const strokeW = (isSelectedUpstream || isSelectedDownstream || isHighRiskSource) ? 4 : 3;

  return (
    <g className={cn("react-flow__edge", isUnrelated && "opacity-20 grayscale")}>
      <motion.path
        id={id}
        style={{ ...style, zIndex: (isSelectedUpstream || isSelectedDownstream || isHighRiskSource) ? 110 : 100 }}
        className={cn(
          "react-flow__edge-path transition-all duration-300",
          (isSelectedUpstream || isSelectedDownstream || isHighRiskSource)
            ? `drop-shadow-[0_0_12px_${edgeColor}]` 
            : "drop-shadow-[0_0_6px_rgba(255,255,255,0.4)]"
        )}
        d={edgePath}
        markerEnd={`url(#arrow-${edgeMarker})`}
        fill="none"
        strokeWidth={strokeW}
        stroke={edgeColor}
        strokeDasharray={isRunning ? "8 6" : "none"}
        animate={isRunning ? {
          strokeDashoffset: [0, -100]
        } : {
          strokeDashoffset: 0
        }}
        transition={isRunning ? {
          repeat: Infinity,
          duration: 1.2,
          ease: "linear"
        } : { duration: 0.3 }}
      />
    </g>
  );
};

// --- Main Canvas Component ---
const nodeTypes = {
  custom: CustomNode,
};

const edgeTypes = {
  custom: CustomEdge,
};

// --- Dagre Layout Generator ---
const getLayoutedElements = (nodes: AppNode[], edges: AppEdge[]) => {
  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));
  
  dagreGraph.setGraph({ 
    rankdir: 'TB', 
    align: 'UL',
    nodesep: 120, 
    ranksep: 180,
    marginx: 50,
    marginy: 50
  });

  const nodeWidth = 220;
  const nodeHeight = 100;

  const clonedNodes = nodes.map(n => ({ ...n, position: { ...n.position } }));

  clonedNodes.forEach((node) => {
    dagreGraph.setNode(node.id, { width: nodeWidth, height: nodeHeight });
  });

  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target);
  });

  dagre.layout(dagreGraph);

  clonedNodes.forEach((node) => {
    const nodeWithPosition = dagreGraph.node(node.id);
    
    // React Flow centers nodes based on their top-left corner
    // Dagre returns the absolute center of the node
    const computedX = nodeWithPosition.x - nodeWidth / 2;
    const computedY = nodeWithPosition.y - nodeHeight / 2;
    
    console.log(`Node ${node.id} Computed Layout -> X: ${computedX}, Y: ${computedY}`);

    node.position = {
      x: computedX,
      y: computedY,
    };
  });

  return { nodes: clonedNodes, edges };
};

// --- Inner Canvas (Wrapped in Provider for hooks) ---
function FlowLayout() {
  const nodes = useGraphStore(state => state.nodes);
  const edges = useGraphStore(state => state.edges);
  const setNodes = useGraphStore(state => state.setNodes);
  const onNodesChange = useGraphStore(state => state.onNodesChange);
  const onEdgesChange = useGraphStore(state => state.onEdgesChange);
  const onConnect = useGraphStore(state => state.onConnect);
  
  const selectedNodeId = useGraphStore(state => state.selectedNodeId);
  const setSelectedNodeId = useGraphStore(state => state.setSelectedNodeId);
  const setHoveredNodeId = useGraphStore(state => state.setHoveredNodeId);
  const setMousePosition = useGraphStore(state => state.setMousePosition);

  const { setViewport } = useReactFlow();
  const layoutCalculatedFor = useRef<string>('');
  const previousHighRiskCount = useRef<number>(-1);

  useMemo(() => {
    const isRunning = useGraphStore.getState().simulationStatus === 'running';
    VisualContext.highRiskNodeIds.clear();
    VisualContext.downstreamRiskNodeIds.clear();
    VisualContext.selectedNodeId = selectedNodeId;
    VisualContext.upstreamNodeIds.clear();
    VisualContext.upstreamEdgeIds.clear();
    VisualContext.downstreamNodeIds.clear();
    VisualContext.downstreamEdgeIds.clear();
    
    // BFS Traversal for Selection via pure utilities
    if (selectedNodeId) {
       const upstreamIds = getUpstreamNodes(selectedNodeId, nodes, edges);
       const downstreamIds = getDownstreamNodes(selectedNodeId, nodes, edges);

       upstreamIds.forEach(id => {
         VisualContext.upstreamNodeIds.add(id);
       });
       
       // Manually tag the active edges pointing to upstream sources to draw Amber line vectors
       edges.forEach(e => {
         // If target is in the selected chain and source is explicitly in our upstream graph
         if ((e.target === selectedNodeId || VisualContext.upstreamNodeIds.has(e.target)) && VisualContext.upstreamNodeIds.has(e.source)) {
            VisualContext.upstreamEdgeIds.add(e.id);
         }
       });

       downstreamIds.forEach(id => {
         VisualContext.downstreamNodeIds.add(id);
       });

       // Manually tag the active edges pointing to downstream targets to draw Blue line vectors
       edges.forEach(e => {
         if ((e.source === selectedNodeId || VisualContext.downstreamNodeIds.has(e.source)) && VisualContext.downstreamNodeIds.has(e.target)) {
            VisualContext.downstreamEdgeIds.add(e.id);
         }
       });
    }

    if (!isRunning) return;

    let highRiskCount = 0;
    nodes.forEach(n => {
      if ((n.data.risk_score || 0) > 0.5) {
        VisualContext.highRiskNodeIds.add(n.id);
        highRiskCount++;
      }
    });

    edges.forEach(e => {
      if (VisualContext.highRiskNodeIds.has(e.source)) {
        VisualContext.downstreamRiskNodeIds.add(e.target);
      }
    });

    if (highRiskCount !== previousHighRiskCount.current) {
      console.log(`High-risk nodes detected: ${highRiskCount}`);
      previousHighRiskCount.current = highRiskCount;
    }
  }, [nodes, edges, selectedNodeId]);

  console.log("Rendering nodes:", nodes.length);
  console.log("Rendering edges:", edges.length);

  // Apply Layout
  useEffect(() => {
    const nodeIds = nodes.map(n => n.id).join(',');

    if (nodes.length > 0 && layoutCalculatedFor.current !== nodeIds) {
      console.log(`Applying layout to ${nodes.length} nodes`);
      layoutCalculatedFor.current = nodeIds;

      const { nodes: layoutedNodes } = getLayoutedElements(nodes, edges);
      setNodes([...layoutedNodes]);
      
      setTimeout(() => {
        // Calculate exact bounding box for foolproof centering
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        layoutedNodes.forEach(n => {
          if (n.position.x < minX) minX = n.position.x;
          if (n.position.y < minY) minY = n.position.y;
          if (n.position.x + 220 > maxX) maxX = n.position.x + 220; // width
          if (n.position.y + 100 > maxY) maxY = n.position.y + 100; // height
        });

        const graphW = maxX - minX;
        const graphH = maxY - minY;
        const screenW = window.innerWidth;
        const screenH = window.innerHeight;

        // Calculate safe zoom to fit graph with strict vertical/horizontal padding
        const zoom = Math.min(screenW / (graphW + 300), screenH / (graphH + 300), 1.0);

        // Center matrix mathematically exact
        const x = (screenW - graphW * zoom) / 2 - (minX * zoom);
        let y = (screenH - graphH * zoom) / 2 - (minY * zoom);
        
        // Minor nudge to ensure top nodes never hug the absolute edge
        y = Math.max(y, 120);

        setViewport({ x, y, zoom }, { duration: 800 });
      }, 50);
    }
  }, [nodes, edges, setNodes, setViewport]);

  // Map types and inject live animations if running
  const configuredNodes = useMemo(() => {
    return nodes.map(n => ({ ...n, type: 'custom' }));
  }, [nodes, selectedNodeId]);

  const configuredEdges = useMemo(() => {
    return edges.map(e => ({ 
      ...e, 
      type: 'custom'
    }));
  }, [edges, selectedNodeId]);

  return (
    <ReactFlow
      nodes={configuredNodes}
      edges={configuredEdges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onConnect={onConnect}
      onNodeClick={(_, node) => setSelectedNodeId(node.id)}
      onNodeMouseEnter={(event, node) => {
        setHoveredNodeId(node.id);
        setMousePosition({ x: event.clientX, y: event.clientY });
      }}
      onNodeMouseLeave={() => setHoveredNodeId(null)}
      onMouseMove={(event) => {
        setMousePosition({ x: event.clientX, y: event.clientY });
      }}
      onPaneClick={() => setSelectedNodeId(null)}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      className="dark"
      minZoom={0.1}
      maxZoom={4}
    >
      <Background color="#ffffff" gap={24} size={1} className="opacity-[0.08]" />
      <Controls className="bg-slate-900 border border-slate-700 text-white rounded-lg shadow-[0_0_20px_rgba(0,0,0,0.5)]" />
      <MiniMap className="bg-slate-900 border border-slate-700 rounded-xl" nodeColor="#3b82f6" maskColor="rgba(0,0,0,0.7)" />
    </ReactFlow>
  );
}

// --- Main Export ---
export default function GraphCanvas() {
  return (
    <div className="w-full h-screen relative bg-[#020617] overflow-hidden">
      <svg style={{ position: 'absolute', width: 0, height: 0 }}>
        <defs>
          <marker id="arrow-amber" markerWidth="20" markerHeight="20" viewBox="0 0 20 20" refX="10" refY="10" orient="auto-start-reverse">
            <polyline stroke="#f59e0b" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" fill="#f59e0b" points="0,5 10,10 0,15" />
          </marker>
          <marker id="arrow-cyan" markerWidth="20" markerHeight="20" viewBox="0 0 20 20" refX="10" refY="10" orient="auto-start-reverse">
            <polyline stroke="#06b6d4" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" fill="#06b6d4" points="0,5 10,10 0,15" />
          </marker>
          <marker id="arrow-white" markerWidth="20" markerHeight="20" viewBox="0 0 20 20" refX="10" refY="10" orient="auto-start-reverse">
            <polyline stroke="#ffffff" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" fill="#ffffff" points="0,5 10,10 0,15" />
          </marker>
          <marker id="arrow-dim" markerWidth="20" markerHeight="20" viewBox="0 0 20 20" refX="10" refY="10" orient="auto-start-reverse">
            <polyline stroke="rgba(255, 255, 255, 0.4)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" fill="rgba(255, 255, 255, 0.4)" points="0,5 10,10 0,15" />
          </marker>
        </defs>
      </svg>
      {/* 1. Canvas Background Upgrade */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_center,#0f172a,transparent_80%)] pointer-events-none" />
      
      {/* Subtle animated noise overlay */}
      <div 
        className="absolute inset-0 opacity-[0.02] pointer-events-none mix-blend-overlay"
        style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")` }}
      />
      
      {/* 5. Add Subtle Depth Lighting */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(59,130,246,0.08),transparent_60%)] pointer-events-none" />

      <ReactFlowProvider>
        <FlowLayout />
      </ReactFlowProvider>

      <ExplainabilityPanel />
    </div>
  );
}
