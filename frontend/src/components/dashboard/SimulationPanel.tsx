"use client"

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Play, Square, Loader2, AlertCircle, Settings2, Plus, Trash2, Cpu, User, Activity, Network, Zap } from 'lucide-react';
import { useGraphStore } from '@/store/graphStore';
import { cn } from '@/lib/utils';

type DisruptionType = "node_failures" | "edge_disruptions" | "demand_spikes" | "capacity_reductions";

type DisruptionPayload = {
  id: string;
  type: DisruptionType;
  target: string;
  severity: number;
};

const TYPE_LABELS: Record<DisruptionType, string> = {
  node_failures: "Critical Failure",
  edge_disruptions: "Route Congestion",
  demand_spikes: "Demand Spike",
  capacity_reductions: "Capacity Drop"
};

export default function SimulationPanel() {
  const { 
    startSimulation, 
    simulationStatus, 
    currentTimestep, 
    totalTimesteps,
    error,
    nodes,
    edges,
    clearGraph,
    seedGraph,
    simulationMetrics
  } = useGraphStore();

  const [timesteps, setTimesteps] = useState(30);
  const [delay, setDelay] = useState(0.8);
  const [decisionMode, setDecisionMode] = useState<'human' | 'ai'>('human');
  const [activeTab, setActiveTab] = useState<'engine' | 'disruptions' | 'network'>('engine');
  const [logFilter, setLogFilter] = useState<'all' | 'critical'>('all');

  // Failure Injection State
  const [pendingDisruptions, setPendingDisruptions] = useState<DisruptionPayload[]>([]);
  const [selectedType, setSelectedType] = useState<DisruptionType>("node_failures");
  const [targetId, setTargetId] = useState("");
  const [severity, setSeverity] = useState(1.0);

  // Network Editor State
  const [newNodeName, setNewNodeName] = useState("");
  const [newNodeType, setNewNodeType] = useState("Warehouse");
  const [newNodeCapacity, setNewNodeCapacity] = useState(500);
  const [newNodeInventory, setNewNodeInventory] = useState(100);
  const [linkedNodes, setLinkedNodes] = useState<string[]>([]);
  const [nodeToDelete, setNodeToDelete] = useState("");

  const isRunning = simulationStatus === 'queued' || simulationStatus === 'running';

  const handleStart = () => {
    if (isRunning) return;

    const payload: any = {
      node_failures: [],
      edge_disruptions: [],
      demand_spikes: [],
      capacity_reductions: []
    };

    pendingDisruptions.forEach(d => {
      if (d.type === 'node_failures') payload.node_failures.push({ node_id: d.target, severity: d.severity });
      if (d.type === 'edge_disruptions') payload.edge_disruptions.push({ edge_id: d.target, congestion_increase: d.severity });
      if (d.type === 'demand_spikes') payload.demand_spikes.push({ node_id: d.target, demand_multiplier: d.severity });
      if (d.type === 'capacity_reductions') payload.capacity_reductions.push({ node_id: d.target, capacity_drop: d.severity });
    });

    startSimulation(timesteps, delay, decisionMode, payload);
  };

  const addDisruption = () => {
    if (!targetId.trim()) return;
    setPendingDisruptions(prev => [...prev, {
      id: Math.random().toString(36).substring(7),
      type: selectedType,
      target: targetId.trim(),
      severity
    }]);
    setTargetId("");
  };

  const removeDisruption = (id: string) => {
    setPendingDisruptions(prev => prev.filter(d => d.id !== id));
  };

  const calculateProgress = () => {
    if (totalTimesteps === 0) return 0;
    return (currentTimestep / totalTimesteps) * 100;
  };

  const handleCreateNode = async () => {
    if (!newNodeName.trim()) return;
    const genId = "N_" + Math.random().toString(36).substring(2, 8).toUpperCase();
    const nodePayload = {
      node_id: genId,
      name: newNodeName.trim(),
      label: newNodeType,
      capacity: newNodeCapacity,
      inventory: newNodeInventory,
      processing_time: 1.0,
      risk_score: 0.0
    };
    const edgePayloads = linkedNodes.map(tid => ({
      edge_id: `E_${Math.random().toString(36).substring(2, 8).toUpperCase()}`,
      source_id: genId,
      target_id: tid,
      type: "CONNECTS_TO",
      transit_time: 1.0,
      cost: 50.0,
      congestion: 0.0,
      disruption_probability: 0.05
    }));
    await useGraphStore.getState().importSubgraph({ nodes: [nodePayload], edges: edgePayloads });
    setNewNodeName("");
    setLinkedNodes([]);
  };

  const handleDeleteNode = async () => {
    if (!nodeToDelete) return;
    await useGraphStore.getState().deleteNode(nodeToDelete);
    setNodeToDelete("");
  };

  const stopSimulation = () => {
    // Logic usually handled in store or via status poll cleanup
  };

  return (
    <div className="absolute left-6 top-22 z-20 flex flex-col items-start pointer-events-none">
          <motion.div
            initial={{ opacity: 0, x: -20, scale: 0.95 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            className="w-80 bg-slate-900/80 backdrop-blur-xl border border-slate-700 rounded-2xl p-5 shadow-[0_0_30px_rgba(59,130,246,0.15)] pointer-events-auto flex flex-col gap-5 max-h-[85vh] overflow-y-auto custom-scrollbar font-sans"
          >
            {/* Header */}
            <div className="flex flex-col gap-1">
              <h2 className="text-white font-bold flex items-center gap-2 tracking-wide">
                Simulation Engine
                {isRunning && <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse ml-auto" />}
              </h2>
              <p className="text-xs text-white/50">Causally-Aware Discrete Simulation</p>
            </div>
            
            {/* Tab Navigation */}
            <div className="flex bg-slate-900/50 p-1 rounded-xl border border-slate-700/50 relative">
              <button
                onClick={() => setActiveTab('engine')}
                className={cn(
                  "flex-1 flex items-center justify-center gap-2 py-2 text-[10px] font-bold uppercase tracking-wider rounded-lg transition-all z-10",
                  activeTab === 'engine' ? "text-slate-900" : "text-slate-400 hover:text-white"
                )}
              >
                 Engine
              </button>
              <button
                onClick={() => setActiveTab('disruptions')}
                className={cn(
                  "flex-1 flex items-center justify-center gap-2 py-2 text-[10px] font-bold uppercase tracking-wider rounded-lg transition-all z-10",
                  activeTab === 'disruptions' ? "text-slate-900" : "text-slate-400 hover:text-white"
                )}
              >
                 Shocks
              </button>
              <button
                onClick={() => setActiveTab('network')}
                className={cn(
                  "flex-1 flex items-center justify-center gap-2 py-2 text-[10px] font-bold uppercase tracking-wider rounded-lg transition-all z-10",
                  activeTab === 'network' ? "text-slate-900" : "text-slate-400 hover:text-white"
                )}
              >
                 Network
              </button>
              <motion.div
                className="absolute top-1 bottom-1 w-[calc(33.33%-4px)] bg-blue-400 rounded-lg z-0"
                initial={false}
                animate={{
                  left: activeTab === 'engine' ? "4px" : activeTab === 'disruptions' ? "calc(33.33% + 2px)" : "calc(66.66%)",
                }}
              />
            </div>

            {/* TAB: ENGINE */}
            {activeTab === 'engine' && (
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-2">
                  <label className="text-[10px] text-white/40 uppercase tracking-widest font-mono">Timesteps</label>
                  <input type="range" min="1" max="100" value={timesteps} onChange={(e) => setTimesteps(parseInt(e.target.value))} disabled={isRunning} className="accent-blue-500" />
                  <div className="text-right text-[10px] font-mono text-white/80">{timesteps} ticks</div>
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-[10px] text-white/40 uppercase tracking-widest font-mono">Tick Delay (s)</label>
                  <input type="range" min="0.1" max="2.0" step="0.1" value={delay} onChange={(e) => setDelay(parseFloat(e.target.value))} disabled={isRunning} className="accent-blue-500" />
                  <div className="text-right text-[10px] font-mono text-white/80">{delay}s</div>
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-[10px] text-white/40 uppercase tracking-widest font-mono">Decision Mode</label>
                  <div className="grid grid-cols-2 gap-2 bg-black/30 p-1 rounded-lg border border-white/5">
                    <button onClick={() => setDecisionMode('human')} className={cn("py-1.5 text-[10px] rounded-md flex items-center justify-center font-bold", decisionMode === 'human' ? "bg-slate-700 text-white" : "text-slate-500 hover:bg-white/5")}>Manual</button>
                    <button onClick={() => setDecisionMode('ai')} className={cn("py-1.5 text-[10px] rounded-md flex items-center justify-center font-bold", decisionMode === 'ai' ? "bg-blue-600 text-white shadow-[0_0_10px_rgba(37,99,235,0.3)]" : "text-slate-500 hover:bg-white/5")}>AI Engine</button>
                  </div>
                </div>

                {decisionMode === 'ai' && (
                  <div className="flex flex-col gap-2 bg-blue-500/5 border border-blue-500/20 rounded-xl p-3 shadow-inner">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-[10px] font-bold text-blue-400 uppercase tracking-widest">
                        <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
                        Live AI Insights
                      </div>
                      <div className="flex bg-black/40 rounded-md p-1 gap-1">
                        <button onClick={() => setLogFilter('all')} className={cn("text-[8px] px-1.5 py-0.5 rounded", logFilter === 'all' ? "bg-slate-600" : "text-slate-500")}>ALL</button>
                        <button onClick={() => setLogFilter('critical')} className={cn("text-[8px] px-1.5 py-0.5 rounded", logFilter === 'critical' ? "bg-slate-600" : "text-slate-500")}>ACTION</button>
                      </div>
                    </div>
                    <div className="flex flex-col gap-1.5 max-h-40 overflow-y-auto custom-scrollbar font-mono pr-1">
                      {!simulationMetrics?.aiActions || simulationMetrics.aiActions.length === 0 ? (
                        <div className="text-[9px] text-white/20 italic py-4 text-center">Waiting for telemetry...</div>
                      ) : (
                        simulationMetrics.aiActions.slice().reverse()
                          .filter(a => logFilter === 'all' || a.log.includes('CRITICAL') || a.log.includes('CONGESTION'))
                          .map((action, i) => (
                          <div key={i} className={cn("text-[9px] leading-snug border-l-2 pl-2 py-0.5", action.log.includes('CRITICAL') ? "border-red-500" : action.log.includes('CONGESTION') ? "border-amber-500" : "border-blue-500/30")}>
                            <span className="text-white/30 mr-2">T{action.timestep}</span>
                            <span className={action.log.includes('CRITICAL') ? "text-red-300" : action.log.includes('CONGESTION') ? "text-amber-300" : "text-slate-300"}>{action.log}</span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* TAB: DISRUPTIONS */}
            {activeTab === 'disruptions' && (
              <div className="flex flex-col gap-4">
                <div className="bg-black/20 rounded-xl p-4 border border-white/5 flex flex-col gap-3">
                   <div className="flex flex-col gap-1">
                     <label className="text-[9px] text-white/40 uppercase font-mono">Type</label>
                     <select value={selectedType} onChange={(e) => setSelectedType(e.target.value as DisruptionType)} className="bg-slate-900 border border-slate-800 text-[10px] p-2 rounded focus:border-blue-500 outline-none text-white">
                       {Object.entries(TYPE_LABELS).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
                     </select>
                   </div>
                   <div className="flex flex-col gap-1">
                     <label className="text-[9px] text-white/40 uppercase font-mono">Target</label>
                     <select value={targetId} onChange={(e) => setTargetId(e.target.value)} className="bg-slate-900 border border-slate-800 text-[10px] p-2 rounded focus:border-blue-500 outline-none text-white">
                        <option value="">Select Target...</option>
                        {selectedType === 'edge_disruptions' ? edges.map(e => <option key={e.id} value={e.id}>{e.id}</option>) : nodes.map(n => <option key={n.id} value={n.id}>{n.data.name}</option>)}
                     </select>
                   </div>
                   <div className="flex flex-col gap-1">
                     <label className="text-[9px] text-white/40 uppercase font-mono flex justify-between">Severity <span>{severity}</span></label>
                     <input type="range" min="0.1" max="5.0" step="0.1" value={severity} onChange={(e) => setSeverity(parseFloat(e.target.value))} className="accent-amber-500" />
                   </div>
                   <button onClick={addDisruption} disabled={!targetId} className="w-full py-2 bg-blue-500 text-white text-[10px] font-bold rounded-lg hover:bg-blue-400 disabled:opacity-30">ADD SHOCK</button>
                </div>
                {pendingDisruptions.length > 0 && (
                  <div className="flex flex-col gap-2 max-h-32 overflow-y-auto">
                    {pendingDisruptions.map(d => (
                      <div key={d.id} className="flex items-center justify-between text-[10px] bg-white/5 p-2 rounded border border-white/5">
                        <span className="text-amber-400 font-bold uppercase tracking-tighter">{TYPE_LABELS[d.type]}</span>
                        <span className="text-white/60 truncate max-w-[100px]">{d.target}</span>
                        <button onClick={() => removeDisruption(d.id)} className="text-red-500 p-1 hover:bg-red-500/10 rounded"><Trash2 size={10}/></button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* TAB: NETWORK */}
            {activeTab === 'network' && (
              <div className="flex flex-col gap-4">
                 <button onClick={() => seedGraph()} className="w-full py-2 border border-blue-500/30 text-blue-400 text-[10px] font-bold rounded-xl hover:bg-blue-500/10 transition-all">SYNTHESIZE DEV NETWORK</button>
                 <button onClick={() => clearGraph()} className="w-full py-2 border border-red-500/30 text-red-500 text-[10px] font-bold rounded-xl hover:bg-red-500/10 transition-all">WIPE ALL TOPOLOGY</button>
              </div>
            )}

            {/* Footer: Progress & Controls */}
            <div className="mt-auto flex flex-col gap-3 pt-4 border-t border-white/5">
               <div className="flex flex-col gap-1">
                  <div className="flex justify-between text-[10px] font-mono text-white/40">
                    <span className="uppercase tracking-widest">{simulationStatus}</span>
                    <span>{currentTimestep}/{totalTimesteps}</span>
                  </div>
                  <div className="w-full h-1 bg-white/10 rounded-full overflow-hidden">
                    <motion.div className="h-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.6)]" initial={false} animate={{ width: `${calculateProgress()}%` }} />
                  </div>
               </div>

               <div className="flex gap-2">
                 <button 
                  onClick={handleStart} 
                  disabled={isRunning} 
                  className={cn("flex-1 py-3 rounded-xl flex items-center justify-center gap-2 text-xs font-bold transition-all shadow-lg", isRunning ? "bg-white/5 text-white/20" : "bg-white text-black hover:bg-white/90")}
                 >
                   {isRunning ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} fill="currentColor" />}
                   {simulationStatus === 'queued' ? 'QUEUING' : simulationStatus === 'running' ? 'RUNNING' : 'START SIMULATION'}
                 </button>
                 {isRunning && (
                   <button onClick={() => stopSimulation()} className="p-3 bg-red-500/20 text-red-400 rounded-xl border border-red-500/20 hover:bg-red-500/30 transition-all"><Square size={14} fill="currentColor"/></button>
                 )}
               </div>
            </div>

            {error && (
              <div className="flex items-start gap-2 text-[9px] text-red-400 bg-red-500/5 p-2 rounded border border-red-500/10">
                <AlertCircle size={10} className="mt-0.5" />
                <span>{error}</span>
              </div>
            )}
          </motion.div>
    </div>
  );
}
