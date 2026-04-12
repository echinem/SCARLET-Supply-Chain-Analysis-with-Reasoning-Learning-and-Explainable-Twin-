import { useMemo } from 'react';
import { AppNode, AppEdge, useGraphStore } from '@/store/graphStore';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Network, AlertTriangle, Box, ArrowRight, ArrowLeft, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getUpstreamNodes, getDownstreamNodes, getRiskContributors } from '@/lib/graphReasoning';

export default function ExplainabilityPanel() {
  const selectedNodeId = useGraphStore(state => state.selectedNodeId);
  const hoveredNodeId = useGraphStore(state => state.hoveredNodeId);
  const mousePosition = useGraphStore(state => state.mousePosition);
  const setSelectedNodeId = useGraphStore(state => state.setSelectedNodeId);
  const nodes = useGraphStore(state => state.nodes);
  const edges = useGraphStore(state => state.edges);
  const selectedExplanation = useGraphStore(state => state.selectedExplanation);

  const activeNodeId = hoveredNodeId || selectedNodeId;

  const node = useMemo(() => {
    if (!activeNodeId) return null;
    return nodes.find(n => n.id === activeNodeId) || null;
  }, [activeNodeId, nodes]);

  const { upstreamCount, downstreamCount, avgUpstreamRisk, contributors } = useMemo(() => {
    if (!activeNodeId) return { upstreamCount: 0, downstreamCount: 0, avgUpstreamRisk: '0.00', contributors: [] };
    
    const upstreamIds = getUpstreamNodes(activeNodeId, nodes, edges);
    const downstreamIds = getDownstreamNodes(activeNodeId, nodes, edges);
    
    let totalRisk = 0;
    let upNodeCount = 0;
    
    upstreamIds.forEach(id => {
      const n = nodes.find(nx => nx.id === id);
      if (n) {
        totalRisk += n.data.risk_score || 0;
        upNodeCount++;
      }
    });

    const riskContributorIds = getRiskContributors(activeNodeId, nodes, edges, 0.5);
    const contributors = riskContributorIds.map(id => nodes.find(n => n.id === id)).filter(Boolean) as AppNode[];

    return { 
      upstreamCount: upstreamIds.length, 
      downstreamCount: downstreamIds.length,
      avgUpstreamRisk: upNodeCount > 0 ? (totalRisk / upNodeCount).toFixed(2) : '0.00',
      contributors
    };
  }, [activeNodeId, edges, nodes]);

  const floatingPosition = useMemo(() => {
    if (typeof window === 'undefined') return { x: 0, y: 0 };
    
    const panelWidth = 384; // w-96
    const offset = 25;
    
    let x = mousePosition.x + offset;
    let y = mousePosition.y + offset;
    
    // Bounds checking
    if (x + panelWidth > window.innerWidth) {
      x = mousePosition.x - panelWidth - offset;
    }
    
    // Simple vertical bounds check (panel can be tall, but we'll just nudge it up)
    if (y + 500 > window.innerHeight) {
      y = window.innerHeight - 520;
    }

    return { x, y };
  }, [mousePosition]);

  if (!node) return null;

  const getReasoning = () => {
    const rScore = node.data.risk_score || 0;
    if (rScore > 0.5) {
      if (contributors.length > 0) {
        return `High risk driven by cascading upstream failures. ${contributors.length} direct supplier nodes are aggressively bottlenecking this tier.`;
      }
      return "Localized structural failure detected. High internal anomaly risk not directly correlated with immediate upstream bottlenecks.";
    } else {
      if (contributors.length > 0) {
        return `Node is currently stable, but exposed to severe upstream risk (${contributors.length} critical dependencies). Expect imminent supply shock.`;
      }
      return "Node operations are stable with low localized risk. Supply chain flow is nominal.";
    }
  };

  const formatShapImpact = (seconds: number) => {
    const absValue = Math.abs(seconds);
    const sign = seconds >= 0 ? '+' : '-';
    
    if (absValue < 60) {
      return `${sign}${absValue.toFixed(1)}s`;
    } else if (absValue < 3600) {
      const mins = (absValue / 60).toFixed(1);
      return `${sign}${mins}m`;
    } else {
      const hrs = (absValue / 3600).toFixed(1);
      return `${sign}${hrs}h`;
    }
  };

  return (
    <AnimatePresence>
      {activeNodeId && (
        <motion.div
          initial={{ opacity: 0, x: floatingPosition.x, y: floatingPosition.y }}
          animate={{ 
            opacity: 1, 
            x: floatingPosition.x,
            y: floatingPosition.y
          }}
          exit={{ opacity: 0 }}
          transition={{ 
            opacity: { duration: 0.2 },
            x: { type: 'spring', damping: 30, stiffness: 300, mass: 0.5 },
            y: { type: 'spring', damping: 30, stiffness: 300, mass: 0.5 }
          }}
          className="fixed left-0 top-0 w-96 flex flex-col gap-4 bg-slate-900/90 backdrop-blur-xl rounded-xl border border-slate-700 shadow-[0_20px_50px_rgba(0,0,0,0.5),0_0_30px_rgba(59,130,246,0.15)] text-slate-200 overflow-hidden z-[9999] pointer-events-none"
        >
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-slate-700/50 bg-slate-800/30">
            <div className="flex items-center gap-3">
              <Network className="w-5 h-5 text-blue-400" />
              <div>
                <h3 className="font-bold text-white text-sm">{node.data.name}</h3>
                <p className="text-[10px] text-slate-400 font-mono">{node.id} • {node.data.label}</p>
              </div>
            </div>
            <button 
              onClick={() => setSelectedNodeId(null)}
              className="p-1 hover:bg-slate-700 rounded-md transition-colors text-slate-400 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="p-5 flex flex-col gap-6 overflow-y-auto max-h-[80vh]">
            
            {/* Context Stats */}
            <div className="grid grid-cols-2 gap-3">
               <div className="bg-slate-800/50 p-3 rounded-lg border border-slate-700/50 flex flex-col gap-1">
                 <div className="flex items-center gap-2 text-slate-400 mb-1">
                   <AlertTriangle className="w-3.5 h-3.5" />
                   <span className="text-[10px] font-semibold tracking-wider">RISK SCORE</span>
                 </div>
                 <span className={cn(
                   "text-xl font-mono",
                   (node.data.risk_score || 0) > 0.5 ? "text-red-400" : "text-emerald-400"
                 )}>
                   {(node.data.risk_score || 0).toFixed(2)}
                 </span>
               </div>
               <div className="bg-slate-800/50 p-3 rounded-lg border border-slate-700/50 flex flex-col gap-1">
                 <div className="flex items-center gap-2 text-slate-400 mb-1">
                   <Box className="w-3.5 h-3.5" />
                   <span className="text-[10px] font-semibold tracking-wider">INVENTORY</span>
                 </div>
                 <span className="text-xl font-mono text-white">
                   {Math.floor(node.data.inventory || 0)}
                 </span>
               </div>
            </div>

            {/* AI Reasoning Panel */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2 text-slate-400">
                <Info className="w-4 h-4 text-blue-400" />
                <span className="text-xs font-semibold tracking-wider uppercase text-slate-300">Causal Reasoning</span>
              </div>
              <div className="bg-blue-500/10 border border-blue-500/20 p-4 rounded-lg text-sm text-blue-100 leading-relaxed shadow-[inset_0_0_10px_rgba(59,130,246,0.1)]">
                {getReasoning()}
              </div>

              {/* SHAP Feature Impact Chart */}
              {selectedExplanation && selectedExplanation.length > 0 && (
                <div className="mt-4 flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-semibold tracking-wider uppercase text-slate-500">ML Feature Impact (SHAP)</span>
                  </div>
                  <div className="space-y-3">
                    {selectedExplanation.map((exp, i) => {
                      const isPositive = exp.impact > 0;
                      const absImpact = Math.abs(exp.impact);
                      // scale the bar width based on max expected impact, capping at 100%
                      const width = Math.min(100, (absImpact / 1000) * 100); 
                      
                      return (
                        <div key={i} className="flex flex-col gap-1">
                          <div className="flex justify-between text-[11px] font-medium">
                            <span className="text-slate-300 capitalize">{exp.feature.replace('_', ' ')}</span>
                            <span className={cn(
                              "font-mono",
                              isPositive ? "text-red-400" : "text-emerald-400"
                            )}>
                              {formatShapImpact(exp.impact)}
                            </span>
                          </div>
                          <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                            <motion.div 
                              initial={{ width: 0 }}
                              animate={{ width: `${width}%` }}
                              className={cn(
                                "h-full rounded-full",
                                isPositive ? "bg-red-500/50" : "bg-emerald-500/50"
                              )}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Structural Topology */}
            <div className="flex flex-col gap-3">
              <span className="text-[10px] font-semibold tracking-wider uppercase text-slate-500">Network Topology</span>
              
              <div className="flex items-center justify-between p-3 bg-slate-800/30 rounded-lg border border-slate-800">
                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center w-8 h-8 rounded-full bg-slate-700/50">
                    <ArrowLeft className="w-4 h-4 text-amber-500" />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-sm font-medium text-slate-200">Upstream Dependencies</span>
                    <span className="text-[10px] text-slate-500">Total cascading sources</span>
                  </div>
                </div>
                <span className="text-lg font-mono text-amber-500">{upstreamCount}</span>
              </div>

              <div className="flex items-center justify-between p-3 bg-slate-800/30 rounded-lg border border-slate-800">
                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center w-8 h-8 rounded-full bg-slate-700/50">
                    <ArrowRight className="w-4 h-4 text-cyan-500" />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-sm font-medium text-slate-200">Impact Radius</span>
                    <span className="text-[10px] text-slate-500">Nodes structurally reliant</span>
                  </div>
                </div>
                <span className="text-lg font-mono text-cyan-500">{downstreamCount}</span>
              </div>

              {contributors.length > 0 && (
                <div className="mt-2 flex flex-col gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-lg shadow-[inset_0_0_10px_rgba(239,68,68,0.1)]">
                  <span className="text-[10px] font-semibold tracking-wider text-red-400 uppercase flex items-center gap-1.5">
                    <AlertTriangle className="w-3 h-3" />
                    Critical Risk Contributors
                  </span>
                  <div className="flex flex-col gap-1 max-h-32 overflow-y-auto pr-1">
                    {contributors.map(c => (
                      <div key={c.id} className="flex items-center justify-between py-1 border-b border-red-500/10 last:border-0">
                        <span className="text-xs text-slate-300 truncate pr-2">{c.data.name}</span>
                        <span className="text-xs font-mono text-red-400">{(c.data.risk_score || 0).toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
