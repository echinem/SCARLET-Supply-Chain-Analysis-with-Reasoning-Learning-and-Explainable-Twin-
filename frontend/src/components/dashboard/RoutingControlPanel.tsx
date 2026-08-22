import React from 'react';

export type RouteAlternative = {
  route_index: number;
  coords: [number, number][];
  distance: number;
  duration: number;
  congestion: number;
  demand: number;
  score: number;
  predicted_delay: number;
  risk_level: string;
  explanation: { feature: string; impact: number }[];
};

interface RoutingControlPanelProps {
  selectedEdgeId: string | null;
  routes: RouteAlternative[];
  bestRouteIndex: number | null;
  onTriggerDisruption: (type: string) => void;
  isSimulating: boolean;
}

export default function RoutingControlPanel({
  selectedEdgeId,
  routes,
  bestRouteIndex,
  onTriggerDisruption,
  isSimulating
}: RoutingControlPanelProps) {
  if (!selectedEdgeId) {
    return (
      <div className="absolute top-4 right-4 z-50 w-80 bg-[#0f172a]/80 backdrop-blur-md text-white border border-slate-700 shadow-2xl rounded-xl p-4">
        <h3 className="text-lg font-semibold mb-2">Smart Routing AI</h3>
        <p className="text-sm text-slate-400">Select a graph edge to view routing alternatives and AI explanations.</p>
      </div>
    );
  }

  const bestRoute = routes.find(r => r.route_index === bestRouteIndex);

  return (
    <div className="absolute top-4 right-4 z-50 w-96 max-h-[90vh] overflow-y-auto bg-[#0f172a]/80 backdrop-blur-md text-white border border-slate-700 shadow-2xl rounded-xl custom-scrollbar flex flex-col gap-4">
      <div className="bg-transparent border-none text-white shadow-none w-full">
        <div className="pb-2 px-4 pt-4">
          <div className="text-lg font-bold flex justify-between items-center">
            <span>Routing AI (Edge {selectedEdgeId})</span>
            {isSimulating && <span className="text-xs bg-blue-500/20 text-blue-400 px-2 py-1 rounded">Simulating...</span>}
          </div>
        </div>
        <div className="p-4 pt-0">
          <div className="flex gap-2 mb-4">
            <button 
              onClick={() => onTriggerDisruption('traffic_spike')}
              className="text-xs bg-amber-500/20 hover:bg-amber-500/40 text-amber-200 px-3 py-2 rounded transition-colors"
            >
              Traffic Spike
            </button>
            <button 
              onClick={() => onTriggerDisruption('demand_surge')}
              className="text-xs bg-purple-500/20 hover:bg-purple-500/40 text-purple-200 px-3 py-2 rounded transition-colors"
            >
              Demand Surge
            </button>
          </div>

          <div className="space-y-4">
            {routes.map((route, idx) => {
              const isBest = route.route_index === bestRouteIndex;
              return (
                <div key={idx} className={`p-3 rounded-lg border ${isBest ? 'border-emerald-500/50 bg-emerald-500/10' : 'border-slate-700 bg-slate-800/50'}`}>
                  <div className="flex justify-between items-center mb-2">
                    <span className="font-semibold text-sm">
                      Route {route.route_index + 1} {isBest && <span className="ml-2 text-xs bg-emerald-500 text-white px-2 py-0.5 rounded">BEST</span>}
                    </span>
                    <span className={`text-xs px-2 py-0.5 rounded ${route.risk_level === 'HIGH' ? 'bg-red-500/20 text-red-400' : 'bg-emerald-500/20 text-emerald-400'}`}>
                      {route.risk_level} RISK
                    </span>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-2 text-xs text-slate-300 mb-2">
                    <div>📏 {(route.distance / 1000).toFixed(1)} km</div>
                    <div>⏱ {Math.round(route.duration / 60)} min base</div>
                    <div className="col-span-2 text-amber-300">
                      ⚠️ +{Math.round(route.predicted_delay / 60)} min AI predicted delay
                    </div>
                  </div>

                  <div className="mt-3">
                    <div className="text-xs font-semibold text-slate-400 mb-1">AI Explanation (SHAP)</div>
                    {route.explanation.slice(0, 2).map((exp, i) => (
                      <div key={i} className="flex justify-between text-xs items-center bg-slate-900/50 px-2 py-1 rounded mb-1">
                        <span className="capitalize">{exp.feature.replace('_', ' ')}</span>
                        <span className={exp.impact > 0 ? "text-red-400" : "text-emerald-400"}>
                          {exp.impact > 0 ? '+' : ''}{exp.impact.toFixed(2)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
