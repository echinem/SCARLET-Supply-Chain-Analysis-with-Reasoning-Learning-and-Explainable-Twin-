"use client"

import { useEffect } from 'react';
import dynamic from 'next/dynamic';
import SimulationPanel from '@/components/dashboard/SimulationPanel';
import MetricsPanel from '@/components/dashboard/MetricsPanel';
// import ExplainabilityDrawer from '@/components/dashboard/ExplainabilityDrawer';
import { useGraphStore } from '@/store/graphStore';
import { cn } from '@/lib/utils';

const GraphCanvas = dynamic(
  () => import('@/components/graph/GraphCanvas'),
  { ssr: false }
);

const MapCanvas = dynamic(
  () => import('@/components/graph/MapCanvas'),
  { ssr: false }
);

export default function Home() {
  const { fetchGraph, seedGraph, nodes, isLoading, error, toggleExplainabilityDrawer, viewMode, setViewMode } = useGraphStore();

  useEffect(() => {
    // Mount fetch to grab Neo4j data via FastAPI
    fetchGraph();
  }, [fetchGraph]);

  const handleSeed = async () => {
    await seedGraph();
    await fetchGraph();
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-between bg-[#0A0A0A] text-white overflow-hidden">
      {/* HUD Layer Overlay */}
      <div className="absolute top-0 left-0 w-full p-6 z-10 pointer-events-none flex justify-between items-start">
        <div className="flex flex-col gap-1">
          <h1 className={cn("text-xl font-semibold tracking-tight", viewMode === 'map' ? "text-black" : "")}>Supply Chain Digital Twin</h1>
          <p className={cn("text-xs font-mono uppercase tracking-widest", viewMode === 'map' ? "text-black/60" : "text-white/50")}>Global Network Overview</p>
        </div>
        
        {/* Status Indicators */}
        <div className={cn("flex items-center gap-4 backdrop-blur-md px-4 py-2 rounded-full pointer-events-auto shadow-2xl border", viewMode === 'map' ? "bg-black/5 border-black/10" : "bg-white/5 border-white/10")}>
          {isLoading ? (
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-yellow-500 animate-pulse" />
              <span className={cn("text-xs font-medium", viewMode === 'map' ? "text-black/70" : "text-white/70")}>Syncing Graph Data...</span>
            </div>
          ) : error ? (
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-red-500" />
              <span className="text-xs font-medium text-red-500">{error}</span>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-emerald-500" />
              <span className={cn("text-xs font-medium", viewMode === 'map' ? "text-black/80 font-bold" : "text-white/70")}>Graph Engine Online</span>
            </div>
          )}
        </div>

        <div className="flex items-center ml-4 gap-2">
          {/* Map / Graph Toggle */}
          <div className="pointer-events-auto bg-black/40 backdrop-blur-md border border-white/10 rounded-full p-1 flex">
            <button
              onClick={() => setViewMode('graph')}
              className={cn(
                "px-4 py-1.5 rounded-full text-xs font-semibold transition-all duration-300",
                viewMode === 'graph' ? "bg-white text-black shadow-md" : "text-white/60 hover:text-white"
              )}
            >
              Graph View
            </button>
            <button
              onClick={() => setViewMode('map')}
              className={cn(
                "px-4 py-1.5 rounded-full text-xs font-semibold transition-all duration-300",
                viewMode === 'map' ? "bg-white text-black shadow-md" : "text-white/60 hover:text-white"
              )}
            >
              Map View
            </button>
          </div>

          {/* Explainability Drawer Toggle */}
          <button 
            onClick={toggleExplainabilityDrawer}
            className="pointer-events-auto flex items-center gap-2 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/30 px-4 py-2 rounded-full text-blue-400 transition-all font-medium text-xs"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
            </svg>
            AI Analysis
          </button>
        </div>
      </div>

      {/* Floating Controls */}
      <MetricsPanel />
      <SimulationPanel />
      {/* <ExplainabilityDrawer /> */}

      {/* Decorative Background Layer */}
      <div className="fixed inset-0 pointer-events-none z-[-1] bg-[#050505]">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(20,30,50,0.4),rgba(0,0,0,1))]" />
        <div 
          className="absolute inset-0 opacity-[0.03]" 
          style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)', backgroundSize: '40px 40px' }} 
        />
      </div>

      {/* Vignette */}
      <div className="fixed inset-0 pointer-events-none z-10 shadow-[inset_0_0_150px_rgba(0,0,0,0.9)]" />

      {/* Interactive WebGL/React Flow Layer or Empty State */}
      <div className="w-full h-screen absolute inset-0 text-black z-0">
        {nodes.length === 0 && !isLoading ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center z-20 gap-4">
            <h2 className="text-white/50 font-mono tracking-widest uppercase">Graph Not Initialized</h2>
            <button 
              onClick={handleSeed}
              className="px-6 py-2 bg-white/10 hover:bg-white/20 border border-white/20 rounded-lg text-white font-medium transition-all"
            >
              Seed Development Network
            </button>
          </div>
        ) : viewMode === 'graph' ? (
          <GraphCanvas />
        ) : (
          <MapCanvas />
        )}
      </div>
    </main>
  );
}
