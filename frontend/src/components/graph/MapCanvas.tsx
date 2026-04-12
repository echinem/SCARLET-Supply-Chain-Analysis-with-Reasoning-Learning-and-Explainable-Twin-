"use client"

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { useGraphStore, AppNode } from '@/store/graphStore';
import { cn } from '@/lib/utils';
import ExplainabilityPanel from '@/components/dashboard/ExplainabilityPanel';
import RoutingControlPanel, { RouteAlternative } from '@/components/dashboard/RoutingControlPanel';
import 'leaflet/dist/leaflet.css';

const MapContainer = dynamic(() => import('react-leaflet').then(mod => mod.MapContainer), { ssr: false });
const TileLayer = dynamic(() => import('react-leaflet').then(mod => mod.TileLayer), { ssr: false });
const Polyline = dynamic(() => import('react-leaflet').then(mod => mod.Polyline), { ssr: false });
const Marker = dynamic(() => import('react-leaflet').then(mod => mod.Marker), { ssr: false });
const Popup = dynamic(() => import('react-leaflet').then(mod => mod.Popup), { ssr: false });

export default function MapCanvas() {
  const nodes = useGraphStore(state => state.nodes);
  const edges = useGraphStore(state => state.edges);
  const selectedNodeId = useGraphStore(state => state.selectedNodeId);
  const setSelectedNodeId = useGraphStore(state => state.setSelectedNodeId);
  const setHoveredNodeId = useGraphStore(state => state.setHoveredNodeId);
  const setMousePosition = useGraphStore(state => state.setMousePosition);
  const simulationStatus = useGraphStore(state => state.simulationStatus);
  const routeGeometries = useGraphStore(state => state.routeGeometries);
  const setRouteGeometries = useGraphStore(state => state.setRouteGeometries);
  // ML Routes
  const alternativeRoutesMap = useGraphStore(state => state.alternativeRoutesMap);
  const setAlternativeRoutesMap = useGraphStore(state => state.setAlternativeRoutesMap);
  const bestRouteMap = useGraphStore(state => state.bestRouteMap);
  const setBestRouteMap = useGraphStore(state => state.setBestRouteMap);

  const isRunning = simulationStatus === 'running';

  const [L, setL] = useState<any>(null);
  
  // Internal UI purely for this specific view session
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [isSimulatingRouting, setIsSimulatingRouting] = useState(false);

  useEffect(() => {
    import('leaflet').then(setL);
  }, []);

  const nodesMap = new Map<string, AppNode>();
  nodes.forEach(n => nodesMap.set(n.id, n));

  const edgesCount = edges.length;
  const nodesCount = nodes.length;

  // ✅ SMART ROUTE FETCHING + CACHING (ALTERNATIVES)
  useEffect(() => {
    if (!edgesCount || !nodesCount) return;

    let isMounted = true;

    const fetchAllRoutes = async () => {
      // We check alternativeRoutesMap rather than localStorage directly
      const edgesToFetch = edges.filter(edge => !alternativeRoutesMap[edge.id]);
      const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000';

      for (const edge of edgesToFetch) {
        const sourceNode = nodesMap.get(edge.source);
        const targetNode = nodesMap.get(edge.target);

        if (!sourceNode?.data.lat || !sourceNode?.data.lng ||
            !targetNode?.data.lat || !targetNode?.data.lng) continue;

        try {
          const response = await fetch(
            `https://router.project-osrm.org/route/v1/driving/${sourceNode.data.lng},${sourceNode.data.lat};${targetNode.data.lng},${targetNode.data.lat}?overview=full&geometries=geojson&alternatives=3`
          );

          if (!response.ok) continue;

          const data = await response.json();

          if (data.code === 'Ok' && data.routes?.length > 0) {
            const from_degree = edges.filter(e => e.source === edge.source || e.target === edge.source).length || 1;
            const to_degree = edges.filter(e => e.source === edge.target || e.target === edge.target).length || 1;
            const from_centrality = from_degree / (nodesCount || 1);
            const to_centrality = to_degree / (nodesCount || 1);

            const routeObjs = data.routes.map((r: any, idx: number) => ({
              route_index: idx,
              coords: r.geometry.coordinates.map((c: [number, number]) => [c[1], c[0]]),
              distance: r.distance,
              duration: r.duration,
              congestion: Math.random() * 0.3,
              demand: Math.random() * 0.3,
              from_degree,
              to_degree,
              from_centrality,
              to_centrality
            }));

            try {
              // Fetch ML predictions + initial scoring
              const simRes = await fetch(`${API_BASE}/api/routing/simulate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ disruption_type: 'none', routes: routeObjs, weight: 1.0 })
              });

              if (simRes.ok) {
                const simData = await simRes.json();
                const enrichedRoutes = routeObjs.map((r: any) => {
                  const updated = simData.data.updated_delays.find((u: any) => u.route_index === r.route_index);
                  return {
                    ...r,
                    predicted_delay: updated.predicted_delay,
                    risk_level: updated.risk_level,
                    explanation: updated.explanation,
                    score: updated.score
                  };
                });

                if (isMounted) {
                  setAlternativeRoutesMap(prev => ({ ...prev, [edge.id]: enrichedRoutes }));
                  setBestRouteMap(prev => ({ ...prev, [edge.id]: simData.data.best_route_index }));
                  
                  // Fallback for legacy
                  setRouteGeometries(prev => ({
                      ...prev, 
                      [edge.id]: enrichedRoutes.find((x: any) => x.route_index === simData.data.best_route_index)?.coords || enrichedRoutes[0].coords
                  }));
                }
              } else {
                throw new Error("ML Backend error");
              }
            } catch (mlErr) {
              console.warn("ML backend unavailable, falling back to standard OSRM routes:", mlErr);
              const fallbackRoutes = routeObjs.map((r: any) => ({
                ...r,
                predicted_delay: 0,
                risk_level: 'LOW',
                explanation: [{ feature: 'ML_Backend_Offline', impact: 0 }],
                score: r.distance + r.duration
              }));
              if (isMounted) {
                setAlternativeRoutesMap(prev => ({ ...prev, [edge.id]: fallbackRoutes }));
                setBestRouteMap(prev => ({ ...prev, [edge.id]: 0 }));
              }
            }
          }
        } catch (err) {
          console.warn('OSRM error:', err);
        }

        await new Promise(res => setTimeout(res, 200));
      }
    };

    fetchAllRoutes();

    return () => { isMounted = false; };
  }, [edgesCount, nodesCount]);

  const handleTriggerDisruption = async (type: string) => {
    if (!selectedEdgeId) return;
    const routes = alternativeRoutesMap[selectedEdgeId];
    if (!routes) return;
    
    setIsSimulatingRouting(true);
    const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000';
    try {
        const simRes = await fetch(`${API_BASE}/api/routing/simulate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ disruption_type: type, routes, weight: 1.0 })
        });
        if (simRes.ok) {
            const simData = await simRes.json();
            const enrichedRoutes = routes.map((r: any) => {
                const updated = simData.data.updated_delays.find((u: any) => u.route_index === r.route_index);
                return {
                    ...r,
                    congestion: updated.new_congestion,
                    demand: updated.new_demand,
                    predicted_delay: updated.predicted_delay,
                    risk_level: updated.risk_level,
                    explanation: updated.explanation,
                    score: updated.score
                };
            });
            setAlternativeRoutesMap(prev => ({ ...prev, [selectedEdgeId]: enrichedRoutes }));
            setBestRouteMap(prev => ({ ...prev, [selectedEdgeId]: simData.data.best_route_index }));
        }
    } catch(err) {
        console.error(err);
    }
    setIsSimulatingRouting(false);
  };

  if (!L) {
    return <div className="w-full h-screen bg-[#020617]" />;
  }

  const highRiskNodeIds = new Set<string>();
  if (isRunning) {
    nodes.forEach(n => {
      if ((n.data.risk_score || 0) > 0.5) highRiskNodeIds.add(n.id);
    });
  }

  const createCustomIcon = (node: AppNode, isSelected: boolean, isHighRisk: boolean) => {
    let colorClass = "bg-slate-500 border-white";
    if (isHighRisk) colorClass = "bg-red-500 border-red-200 animate-pulse";
    else if ((node.data.risk_score || 0) > 0.2) colorClass = "bg-amber-500 border-amber-200";
    else colorClass = "bg-emerald-500 border-emerald-200";

    if (isSelected) colorClass += " ring-4 ring-blue-500 ring-opacity-50";

    return L.divIcon({
      className: 'custom-leaflet-marker',
      html: `
        <div class="relative w-4 h-4 rounded-full border-2 shadow ${colorClass}"></div>
      `,
      iconSize: [16, 16],
      iconAnchor: [8, 8],
    });
  };

  return (
    <div className="w-full h-screen relative bg-[#020617] overflow-hidden">

      {/* ✅ Loading indicator */}
      {Object.keys(alternativeRoutesMap).length < edges.length && edges.length > 0 && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-slate-900 text-white px-4 py-2 rounded-lg text-xs z-50">
          Loading AI routes...
        </div>
      )}

      {selectedEdgeId && (
        <RoutingControlPanel 
          selectedEdgeId={selectedEdgeId}
          routes={alternativeRoutesMap[selectedEdgeId] || []}
          bestRouteIndex={bestRouteMap[selectedEdgeId] ?? null}
          onTriggerDisruption={handleTriggerDisruption}
          isSimulating={isSimulatingRouting}
        />
      )}

      <MapContainer 
        center={[22.5937, 78.9629]}
        zoom={5}
        style={{ width: '100%', height: '100%' }}
        zoomControl={false}
      >
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
        />

        {/* ✅ SHOW ALL ML ALTERNATIVE ROUTES */}
        {edges.map(edge => {
          const alts = alternativeRoutesMap[edge.id];
          if (!alts || alts.length === 0) return null;
          
          const bestIdx = bestRouteMap[edge.id];
          const isHighRiskSource = isRunning && highRiskNodeIds.has(edge.source);
          
          return alts.map((alt, i) => {
            const isBest = alt.route_index === bestIdx;
            
            let color = "rgba(148, 163, 184, 0.4)"; // Muted for non-best alternatives
            let weight = 2;
            let opacity = 0.5;

            if (isBest) {
              opacity = 1.0;
              weight = isRunning ? 4 : 3;
              color = isHighRiskSource
                ? "#ef4444"
                : isRunning
                ? "#60a5fa"
                : "#10b981"; // Emerald green
            }

            return (
              <Polyline
                key={`${edge.id}-${i}`}
                positions={alt.coords}
                color={color}
                weight={weight}
                opacity={opacity}
                dashArray={isRunning && isBest ? "6, 12" : undefined}
                className={isRunning && isBest ? "flow-line" : ""}
                eventHandlers={{
                  click: () => setSelectedEdgeId(edge.id)
                }}
              />
            );
          });
        })}

        {nodes.map(node => {
          if (!node.data.lat || !node.data.lng) return null;

          const isSelected = selectedNodeId === node.id;
          const isHighRisk = isRunning && highRiskNodeIds.has(node.id);

          return (
            <Marker
              key={node.id}
              position={[node.data.lat, node.data.lng]}
              icon={createCustomIcon(node, isSelected, isHighRisk)}
              eventHandlers={{ 
                click: () => setSelectedNodeId(node.id),
                mouseover: (e) => {
                  setHoveredNodeId(node.id);
                  setMousePosition({ x: e.originalEvent.clientX, y: e.originalEvent.clientY });
                },
                mouseout: () => setHoveredNodeId(null)
              }}
            >
              <Popup>
                <div className="bg-slate-900 text-white p-3 rounded-lg min-w-[200px]">
                  <div className="text-xs text-slate-400">{node.data.label}</div>
                  <div className="font-semibold">{node.data.name}</div>
                </div>
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>

      <ExplainabilityPanel />

      {/* ✅ FLOW ANIMATION */}
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes flow {
          from { stroke-dashoffset: 0; }
          to { stroke-dashoffset: -40; }
        }
        .flow-line {
          animation: flow 1s linear infinite;
        }
      `}} />

    </div>
  );
}