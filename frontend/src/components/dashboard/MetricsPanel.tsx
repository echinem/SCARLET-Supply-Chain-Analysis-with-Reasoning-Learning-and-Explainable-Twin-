"use client"

import { motion, AnimatePresence } from 'framer-motion';
import { PackageOpen, ShieldAlert, Activity, Cpu, User } from 'lucide-react';
import { useGraphStore } from '@/store/graphStore';
import { cn } from '@/lib/utils';

export default function MetricsPanel() {
  const { simulationStatus, simulationMetrics } = useGraphStore();

  const isIdle = simulationStatus === 'idle' || !simulationMetrics;

  return (
    <div className="absolute right-6 bottom-50 z-20 flex flex-col items-end pointer-events-none">
      <AnimatePresence>
        <motion.div
          initial={{ opacity: 0, x: 20, scale: 0.95 }}
          animate={{ opacity: 1, x: 0, scale: 1 }}
          exit={{ opacity: 0, x: 20, scale: 0.95 }}
          transition={{ duration: 0.3 }}
          className="w-72 bg-slate-900/80 backdrop-blur-xl border border-slate-700 rounded-2xl p-5 shadow-[0_0_30px_rgba(59,130,246,0.15)] pointer-events-auto"
        >
          <div className="flex flex-col gap-6">
            
            {/* Header */}
            <div className="flex flex-col gap-1">
              <h2 className="text-white font-bold flex items-center gap-2 tracking-wide">
                Live Telemetry
                {!isIdle && simulationStatus === 'running' && (
                  <span className="flex h-2 w-2 rounded-full bg-blue-500 animate-pulse ml-auto" />
                )}
              </h2>
              <p className="text-xs text-white/50">Global Network Metrics</p>
            </div>

            {/* Decision Status Badge */}
            {!isIdle && simulationMetrics && (
               <motion.div
                 initial={{ opacity: 0, y: 10 }}
                 animate={{ opacity: 1, y: 0 }}
                 className={cn(
                   "flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-semibold w-fit",
                   simulationMetrics.decision_mode === 'ai' 
                     ? "bg-cyan-500/10 border-cyan-500/30 text-cyan-400 shadow-[0_0_15px_rgba(6,182,212,0.2)]" 
                     : "bg-amber-500/10 border-amber-500/30 text-amber-400 shadow-[0_0_15px_rgba(245,158,11,0.2)]"
                 )}
               >
                 {simulationMetrics.decision_mode === 'ai' ? (
                   <><Cpu size={14} /> AI Optimized Topology</>
                 ) : (
                   <><User size={14} /> Human Oversight</>
                 )}
               </motion.div>
            )}

            {/* Metrics Grid */}
            <div className="flex flex-col gap-4">
              
              {/* Total Inventory */}
              <div className="flex items-center justify-between bg-white/5 border border-white/5 p-3 rounded-xl">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-500/20 text-blue-400 rounded-lg">
                    <PackageOpen size={16} />
                  </div>
                  <span className="text-xs text-white/50 font-medium">Global Inventory</span>
                </div>
                {isIdle ? (
                  <span className="text-sm font-mono text-white/30">--</span>
                ) : (
                  <motion.span 
                    key={simulationMetrics.total_inventory}
                    initial={{ y: -10, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    className="text-sm font-mono text-white/90"
                  >
                    {simulationMetrics.total_inventory.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </motion.span>
                )}
              </div>

              {/* Active Disruptions */}
              <div className="flex items-center justify-between bg-white/5 border border-white/5 p-3 rounded-xl">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-red-500/20 text-red-400 rounded-lg">
                    <Activity size={16} />
                  </div>
                  <span className="text-xs text-white/50 font-medium">Disruptions</span>
                </div>
                {isIdle ? (
                  <span className="text-sm font-mono text-white/30">--</span>
                ) : (
                  <motion.span 
                    key={simulationMetrics.active_disruptions}
                    initial={{ y: -10, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    className="text-sm font-mono text-white/90"
                  >
                    {simulationMetrics.active_disruptions}
                  </motion.span>
                )}
              </div>

              {/* Risk Index */}
              <div className="flex items-center justify-between bg-white/5 border border-white/5 p-3 rounded-xl">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-amber-500/20 text-amber-400 rounded-lg">
                    <ShieldAlert size={16} />
                  </div>
                  <span className="text-xs text-white/50 font-medium">System Risk</span>
                </div>
                {isIdle ? (
                  <span className="text-sm font-mono text-white/30">--</span>
                ) : (
                  <motion.span 
                    key={simulationMetrics.risk_index}
                    initial={{ y: -10, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    className="text-sm font-mono text-white/90"
                  >
                    {simulationMetrics.risk_index.toFixed(3)}
                  </motion.span>
                )}
              </div>

            </div>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
