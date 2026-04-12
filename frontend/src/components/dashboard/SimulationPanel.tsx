"use client"

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Play, Square, Loader2, AlertCircle, Settings2, Plus, Trash2, ChevronDown, ChevronUp, Cpu, User, Activity, Network, Zap } from 'lucide-react';
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

  // Failure Injection State
  const [showInjectors, setShowInjectors] = useState(false);
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

    // Transform generic disruptions into structured backend payloads
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
    
    // Auto-gen a short ID
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

    const edgePayloads = linkedNodes.map(targetId => ({
      edge_id: `E_${Math.random().toString(36).substring(2, 8).toUpperCase()}`,
      source_id: genId,
      target_id: targetId,
      type: "CONNECTS_TO",
      transit_time: 1.0,
      cost: 50.0,
      congestion: 0.0,
      disruption_probability: 0.05
    }));

    await useGraphStore.getState().importSubgraph({
      nodes: [nodePayload],
      edges: edgePayloads
    });

    setNewNodeName("");
    setNewNodeCapacity(500);
    setLinkedNodes([]);
  };

  const handleDeleteNode = async () => {
    if (!nodeToDelete) return;
    await useGraphStore.getState().deleteNode(nodeToDelete);
    setNodeToDelete("");
  };

  return (
    <div className="absolute left-6 top-22 z-20 flex flex-col items-start pointer-events-none">
          <motion.div
            initial={{ opacity: 0, x: -20, scale: 0.95 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            transition={{ duration: 0.2 }}
            className="w-80 bg-slate-900/80 backdrop-blur-xl border border-slate-700 rounded-2xl p-5 shadow-[0_0_30px_rgba(59,130,246,0.15)] pointer-events-auto flex flex-col gap-6 max-h-[85vh] overflow-y-auto custom-scrollbar"
          >
            {/* Header */}
            <div className="flex flex-col gap-1">
              <h2 className="text-white font-bold flex items-center gap-2 tracking-wide">
                Simulation Engine
                {isRunning && <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse ml-auto" />}
              </h2>
              <p className="text-xs text-white/50">Configure and monitor discrete time-steps</p>
            </div>
            
            {/* Tab Navigation */}
            <div className="flex bg-slate-900/50 p-1 rounded-xl border border-slate-700/50 relative mb-2">
              <button
                onClick={() => setActiveTab('engine')}
                className={cn(
                  "flex-1 flex items-center justify-center gap-2 py-2 text-xs font-semibold rounded-lg transition-all duration-300 z-10",
                  activeTab === 'engine' ? "text-slate-900" : "text-slate-400 hover:text-white"
                )}
              >
                <Settings2 size={14} /> Engine
              </button>
              <button
                onClick={() => setActiveTab('disruptions')}
                className={cn(
                  "flex-1 flex items-center justify-center gap-2 py-2 text-xs font-semibold rounded-lg transition-all duration-300 z-10",
                  activeTab === 'disruptions' ? "text-slate-900" : "text-slate-400 hover:text-white"
                )}
              >
                <Activity size={14} /> Shocks
              </button>
              <button
                onClick={() => setActiveTab('network')}
                className={cn(
                  "flex-1 flex items-center justify-center gap-2 py-2 text-xs font-semibold rounded-lg transition-all duration-300 z-10",
                  activeTab === 'network' ? "text-slate-900" : "text-slate-400 hover:text-white"
                )}
              >
                <Network size={14} /> Network
              </button>

              {/* Animated Background Pill */}
              <motion.div
                className={cn(
                  "absolute top-1 bottom-1 w-[calc(33.33%-4px)] bg-blue-400 rounded-lg z-0"
                )}
                initial={false}
                animate={{
                  left: activeTab === 'engine' ? "4px" : activeTab === 'disruptions' ? "calc(33.33% + 2px)" : "calc(66.66%)",
                }}
                transition={{ type: "spring", stiffness: 300, damping: 25 }}
              />
            </div>

            {/* TAB: ENGINE */}
            {activeTab === 'engine' && (
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex flex-col gap-6 pt-2"
              >
            {/* Controls */}
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <label className="text-xs text-white/40 uppercase tracking-wider font-mono">Timesteps</label>
                <input 
                  type="range" 
                  min="1" 
                  max="100" 
                  value={timesteps}
                  onChange={(e) => setTimesteps(parseInt(e.target.value))}
                  disabled={isRunning}
                  className="accent-blue-500 cursor-pointer disabled:opacity-50"
                />
                <div className="text-right text-xs font-mono text-white/80">{timesteps} ticks</div>
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-xs text-white/40 uppercase tracking-wider font-mono">Tick Delay (Seconds)</label>
                <input 
                  type="range" 
                  min="0.1" 
                  max="2.0" 
                  step="0.1"
                  value={delay}
                  onChange={(e) => setDelay(parseFloat(e.target.value))}
                  disabled={isRunning}
                  className="accent-blue-500 cursor-pointer disabled:opacity-50"
                />
                <div className="flex justify-between items-center text-xs font-mono">
                  <span className="text-white/40 text-[9px] tracking-wide">Higher delay improves visual clarity</span>
                  <span className="text-white/80">{delay}s</span>
                </div>
              </div>

              <div className="flex flex-col gap-2 mt-2">
                <label className="text-xs text-white/40 uppercase tracking-wider font-mono">Intervention Mode</label>
                <div className="flex bg-slate-900 border border-slate-700/50 rounded-lg p-1 relative">
                  <button
                    onClick={() => setDecisionMode('human')}
                    disabled={isRunning}
                    className={cn(
                      "flex-1 flex items-center justify-center gap-2 py-2 text-xs font-medium rounded-md transition-all z-10",
                      decisionMode === 'human' ? "text-white" : "text-slate-500 hover:text-slate-300",
                      isRunning && "opacity-50 cursor-not-allowed"
                    )}
                  >
                    <User size={14} /> Manual
                  </button>
                  <button
                    onClick={() => setDecisionMode('ai')}
                    disabled={isRunning}
                    className={cn(
                      "flex-1 flex items-center justify-center gap-2 py-2 text-xs font-medium rounded-md transition-all z-10",
                      decisionMode === 'ai' ? "text-white" : "text-slate-500 hover:text-slate-300",
                      isRunning && "opacity-50 cursor-not-allowed"
                    )}
                  >
                    <Cpu size={14} /> AI Engine
                  </button>
                  
                  {/* Sliding pill background */}
                  <motion.div
                    className={cn(
                      "absolute top-1 bottom-1 w-[calc(50%-4px)] rounded-md z-0",
                      decisionMode === 'ai' ? "bg-blue-600 shadow-[0_0_15px_rgba(37,99,235,0.4)]" : "bg-slate-700"
                    )}
                    initial={false}
                    animate={{ left: decisionMode === 'human' ? "4px" : "calc(50%)" }}
                    transition={{ type: "spring", stiffness: 400, damping: 30 }}
                  />
                </div>
              </div>

              </div>
            </motion.div>
            )}

            {/* TAB: DISRUPTIONS */}
            {activeTab === 'disruptions' && (
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex flex-col gap-4 pt-2"
              >
                {/* Expandable Failure Injection Layer */}
                <div className="flex flex-col border border-slate-700/50 rounded-xl overflow-hidden bg-slate-800/30">
                  <div className="flex items-center justify-between p-3 text-sm font-medium text-slate-300 w-full text-left">
                    Failure Injection Payload Data
                  </div>
                  
                  <div className="flex flex-col gap-4 p-4 border-t border-slate-700/50 overflow-y-auto custom-scrollbar">
                    <div className="flex flex-col gap-2">
                       <label className="text-[10px] text-white/40 uppercase tracking-wider">Disruption Type</label>
                       <select 
                         value={selectedType}
                         onChange={(e) => setSelectedType(e.target.value as DisruptionType)}
                         disabled={isRunning}
                         className="bg-slate-900 border border-slate-700 text-xs text-slate-300 rounded-md p-2 focus:outline-none focus:border-blue-500"
                       >
                         {Object.entries(TYPE_LABELS).map(([key, label]) => (
                           <option key={key} value={key}>{label}</option>
                         ))}
                       </select>
                    </div>

                    <div className="flex flex-col gap-2">
                       <label className="text-[10px] text-white/40 uppercase tracking-wider">
                         Target Entity
                       </label>
                       {selectedType === 'edge_disruptions' ? (
                          <select 
                            value={targetId}
                            onChange={(e) => setTargetId(e.target.value)}
                            disabled={isRunning}
                            className="bg-slate-900 border border-slate-700 text-xs text-slate-300 rounded-md p-2 focus:outline-none focus:border-blue-500"
                          >
                            <option value="">Select Edge Constraint...</option>
                            {edges.map(e => (
                              <option key={e.id} value={e.id}>{`[${e.data?.type}] ${e.source} \u2192 ${e.target}`}</option>
                            ))}
                          </select>
                       ) : (
                          <select 
                            value={targetId}
                            onChange={(e) => setTargetId(e.target.value)}
                            disabled={isRunning}
                            className="bg-slate-900 border border-slate-700 text-xs text-slate-300 rounded-md p-2 focus:outline-none focus:border-blue-500"
                          >
                            <option value="">Select Node Topology...</option>
                            {nodes.map(n => (
                              <option key={n.id} value={n.id}>{n.data.name} ({n.data.label})</option>
                            ))}
                          </select>
                       )}
                    </div>

                    <div className="flex flex-col gap-2">
                       <label className="text-[10px] text-white/40 uppercase tracking-wider flex justify-between">
                         Severity Metric
                         <span className="text-blue-400 font-mono">{severity.toFixed(1)}</span>
                       </label>
                       <input 
                         type="range" 
                         min="0.1" 
                         max="5.0" 
                         step="0.1"
                         value={severity}
                         onChange={(e) => setSeverity(parseFloat(e.target.value))}
                         disabled={isRunning}
                         className="accent-amber-500 cursor-pointer disabled:opacity-50"
                       />
                    </div>

                    <button 
                      onClick={addDisruption}
                      disabled={isRunning || !targetId.trim()}
                      className="flex items-center justify-center gap-2 py-2 mt-1 bg-blue-500/20 text-blue-400 font-medium text-xs rounded-lg border border-blue-500/30 hover:bg-blue-500/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Plus size={14} /> Add Disruption
                    </button>

                    {/* Pending Disruptions List */}
                    {pendingDisruptions.length > 0 && (
                      <div className="flex flex-col gap-2 mt-2">
                        <span className="text-[10px] text-white/40 uppercase tracking-wider border-b border-white/5 pb-1">Queued Payloads</span>
                        <div className="flex flex-col gap-1.5 max-h-32 overflow-y-auto custom-scrollbar">
                          <AnimatePresence>
                            {pendingDisruptions.map(d => (
                              <motion.div 
                                key={d.id}
                                initial={{ opacity: 0, x: -10 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, scale: 0.9 }}
                                className="flex items-center justify-between bg-slate-900 border border-slate-700/50 p-2 rounded-md group"
                              >
                                <div className="flex flex-col truncate pr-2">
                                  <span className="text-[10px] text-amber-500 font-semibold">{TYPE_LABELS[d.type]}</span>
                                  <span className="text-[10px] text-slate-300 truncate font-mono">{d.target}</span>
                                </div>
                                <button 
                                  onClick={() => removeDisruption(d.id)}
                                  disabled={isRunning}
                                  className="text-slate-500 hover:text-red-400 shrink-0 p-1 rounded transition-colors disabled:opacity-50"
                                >
                                  <Trash2 size={12} />
                                </button>
                              </motion.div>
                            ))}
                          </AnimatePresence>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            )}

            {/* TAB: NETWORK */}
            {activeTab === 'network' && (
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex flex-col gap-4 pt-2"
              >
                <div className="flex flex-col border border-slate-700/50 rounded-xl overflow-hidden bg-slate-800/30">
                  <div className="flex items-center justify-between p-3 text-sm font-medium text-slate-300 w-full text-left bg-slate-800/50">
                    Macro Topology Generator
                  </div>
                  <div className="flex flex-col gap-4 p-4 border-t border-slate-700/50">
                    <div className="flex flex-col gap-2">
                       <label className="text-[10px] text-white/40 uppercase tracking-wider">Node Name</label>
                       <input 
                         type="text"
                         value={newNodeName}
                         onChange={(e) => setNewNodeName(e.target.value)}
                         placeholder="e.g. Texas Central Hub"
                         disabled={isRunning}
                         className="bg-slate-900 border border-slate-700 text-xs text-slate-300 rounded-md p-2 focus:outline-none focus:border-blue-500"
                       />
                    </div>
                    
                    <div className="flex flex-col gap-2">
                       <label className="text-[10px] text-white/40 uppercase tracking-wider">Node Type</label>
                       <select 
                         value={newNodeType}
                         onChange={(e) => setNewNodeType(e.target.value)}
                         disabled={isRunning}
                         className="bg-slate-900 border border-slate-700 text-xs text-slate-300 rounded-md p-2 focus:outline-none focus:border-blue-500"
                       >
                         <option value="Warehouse">Warehouse</option>
                         <option value="Factory">Factory</option>
                         <option value="Customer">Customer</option>
                         <option value="Transport Hub">Transport Hub</option>
                       </select>
                    </div>

                    <div className="flex flex-col gap-2">
                       <label className="text-[10px] text-white/40 uppercase tracking-wider">Connect To (Optional)</label>
                       <div className="bg-slate-900 border border-slate-700 rounded-md p-2 max-h-32 overflow-y-auto custom-scrollbar flex flex-col gap-1">
                         {nodes.length === 0 && <span className="text-xs text-white/40 italic">No existing nodes</span>}
                         {nodes.map(n => (
                           <label key={n.id} className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer hover:bg-slate-800/50 p-1 rounded transition-colors">
                             <input 
                               type="checkbox" 
                               checked={linkedNodes.includes(n.id)}
                               onChange={(e) => {
                                 if (e.target.checked) setLinkedNodes([...linkedNodes, n.id]);
                                 else setLinkedNodes(linkedNodes.filter(id => id !== n.id));
                               }}
                               disabled={isRunning}
                               className="accent-blue-500 w-3 h-3 bg-slate-800 border-slate-600 rounded cursor-pointer"
                             />
                             <span className="truncate">{n.data.name} ({n.id})</span>
                           </label>
                         ))}
                       </div>
                    </div>

                    <div className="flex flex-col gap-2">
                       <label className="text-[10px] text-white/40 uppercase tracking-wider flex justify-between">
                         Max Capacity <span className="text-emerald-400 font-mono">{newNodeCapacity}</span>
                       </label>
                       <input 
                         type="range" 
                         min="50" 
                         max="1000" 
                         step="50"
                         value={newNodeCapacity}
                         onChange={(e) => setNewNodeCapacity(parseInt(e.target.value))}
                         disabled={isRunning}
                         className="accent-emerald-500 cursor-pointer disabled:opacity-50"
                       />
                    </div>

                    <div className="flex flex-col gap-2">
                       <label className="text-[10px] text-white/40 uppercase tracking-wider flex justify-between">
                         Initial Inventory <span className="text-blue-400 font-mono">{newNodeInventory}</span>
                       </label>
                       <input 
                         type="range" 
                         min="0" 
                         max="1000" 
                         step="10"
                         value={newNodeInventory}
                         onChange={(e) => setNewNodeInventory(parseInt(e.target.value))}
                         disabled={isRunning}
                         className="accent-blue-500 cursor-pointer disabled:opacity-50"
                       />
                    </div>

                    <button 
                      onClick={handleCreateNode}
                      disabled={isRunning || !newNodeName.trim()}
                      className="flex items-center justify-center gap-2 py-2 mt-2 bg-emerald-500/20 text-emerald-400 font-medium text-xs rounded-lg border border-emerald-500/30 hover:bg-emerald-500/30 transition-colors disabled:opacity-50"
                    >
                      <Plus size={14} /> Synthesize Node
                    </button>
                  </div>
                </div>

                <div className="flex flex-col border border-red-900/30 rounded-xl overflow-hidden bg-red-950/20 mt-2">
                  <div className="flex items-center justify-between p-3 text-xs font-medium text-red-400 w-full text-left bg-red-900/10">
                    Topology Disintegration
                  </div>
                  <div className="flex flex-col gap-3 p-4 border-t border-red-900/30">
                     <select 
                       value={nodeToDelete}
                       onChange={(e) => setNodeToDelete(e.target.value)}
                       disabled={isRunning}
                       className="bg-slate-900 border border-red-900/50 text-xs text-slate-300 rounded-md p-2 focus:outline-none focus:border-red-500"
                     >
                       <option value="">Select Target...</option>
                       {nodes.map(n => (
                         <option key={n.id} value={n.id}>{n.data.name} ({n.id})</option>
                       ))}
                     </select>
                     <button 
                       onClick={handleDeleteNode}
                       disabled={isRunning || !nodeToDelete}
                       className="flex items-center justify-center gap-2 py-2 bg-red-500/20 text-red-500 font-medium text-xs rounded-lg border border-red-500/30 hover:bg-red-500/30 transition-colors disabled:opacity-50"
                     >
                       <Trash2 size={14} /> Disintegrate Link
                     </button>
                  </div>
                </div>

                {/* DB Admin Functions */}
                <div className="flex flex-col border border-orange-900/30 rounded-xl overflow-hidden bg-orange-950/20 mt-2">
                  <div className="flex items-center justify-between p-3 text-xs font-medium text-orange-400 w-full text-left bg-orange-900/10">
                    Database Administration
                  </div>
                  <div className="flex flex-col gap-3 p-4 border-t border-orange-900/30">
                     <button 
                       onClick={() => clearGraph()}
                       disabled={isRunning || (nodes.length === 0 && edges.length === 0)}
                       className="flex items-center justify-center gap-2 py-2 bg-orange-500/20 text-orange-500 font-medium text-xs rounded-lg border border-orange-500/30 hover:bg-orange-500/30 transition-colors disabled:opacity-50"
                     >
                       <Trash2 size={14} /> Wipe All Topology
                     </button>
                     <button 
                       onClick={() => seedGraph()}
                       disabled={isRunning || nodes.length > 0}
                       className="flex items-center justify-center gap-2 py-2 bg-blue-500/20 text-blue-400 font-medium text-xs rounded-lg border border-blue-500/30 hover:bg-blue-500/30 transition-colors disabled:opacity-50"
                     >
                       <Plus size={14} /> Synthesize Dev Network
                     </button>
                  </div>
                </div>
              </motion.div>
            )}

            {/* Progress Bar */}
            {simulationStatus !== 'idle' && (
              <div className="flex flex-col gap-2 mt-1">
                <div className="flex justify-between text-xs font-mono text-white/50">
                  <span className="uppercase text-[10px] tracking-widest">{simulationStatus}</span>
                  <span>{currentTimestep} / {totalTimesteps}</span>
                </div>
                <div className="w-full h-1 bg-white/10 rounded-full overflow-hidden">
                  <motion.div 
                    className={cn(
                      "h-full",
                      simulationStatus === 'failed' ? "bg-red-500" : "bg-blue-500"
                    )}
                    initial={{ width: 0 }}
                    animate={{ width: `${calculateProgress()}%` }}
                    transition={{ duration: 0.3 }}
                  />
                </div>
              </div>
            )}

            {/* AI Reasoning Logs */}
            {decisionMode === 'ai' && simulationMetrics?.aiActions && simulationMetrics.aiActions.length > 0 && (
              <div className="flex flex-col gap-2 bg-black/40 border border-slate-700/50 rounded-xl p-3 mt-1">
                <div className="flex items-center gap-2 text-[10px] font-bold text-blue-400 uppercase tracking-widest">
                  <Zap size={10} fill="currentColor" />
                  Live AI Insights
                </div>
                <div className="flex flex-col gap-2 max-h-32 overflow-y-auto custom-scrollbar pt-1">
                  {simulationMetrics.aiActions.slice().reverse().map((action, i) => (
                    <motion.div 
                      key={i}
                      initial={{ opacity: 0, x: -5 }}
                      animate={{ opacity: 1, x: 0 }}
                      className="text-[10px] font-mono leading-relaxed border-l-2 border-blue-500/30 pl-2 py-0.5"
                    >
                      <span className="text-white/40 mr-2">T{action.timestep}</span>
                      <span className="text-slate-200">{action.log}</span>
                    </motion.div>
                  ))}
                </div>
              </div>
            )}

            {/* Error Output */}
            {error && (
              <div className="flex items-start gap-2 text-xs text-red-400 bg-red-500/10 border border-red-500/20 p-3 rounded-lg mt-1">
                <AlertCircle size={14} className="mt-0.5 shrink-0" />
                <span className="leading-snug">{error}</span>
              </div>
            )}

            {/* Action Button */}
            <motion.button
              whileHover={{ scale: isRunning ? 1 : 1.02 }}
              whileTap={{ scale: isRunning ? 1 : 0.98 }}
              onClick={handleStart}
              disabled={isRunning}
              className={cn(
                "w-full py-3 rounded-xl flex items-center justify-center gap-2 text-sm font-medium transition-colors mt-2",
                isRunning 
                  ? "bg-white/5 text-white/40 cursor-not-allowed" 
                  : "bg-white text-black hover:bg-white/90 shadow-[0_0_15px_rgba(255,255,255,0.4)]"
              )}
            >
              {simulationStatus === 'queued' ? (
                <><Loader2 size={16} className="animate-spin" /> Queuing</>
              ) : simulationStatus === 'running' ? (
                <><Square size={16} fill="currentColor" /> Running</>
              ) : (
                <><Play size={16} fill="currentColor" /> Start Simulation</>
              )}
            </motion.button>

          </motion.div>
    </div>
  );
}
