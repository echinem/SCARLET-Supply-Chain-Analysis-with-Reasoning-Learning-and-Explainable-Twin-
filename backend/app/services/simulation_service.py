import time
import json
import redis
from datetime import datetime, timezone
import networkx as nx

from app.core.config import settings
from app.core.logging import logger
from app.services.snapshot_service import load_graph_snapshot
from app.services.ml_causal_service import predict_delay_probability
from app.services.ml_optimization_service import compute_optimal_actions

def calculate_risk_index(G: nx.DiGraph) -> float:
    """
    Computes a structurally-weighted System Risk Index.
    Nodes with higher degree (more connections) contribute more to global risk.
    """
    total_weighted_risk = 0.0
    total_weight = 0.0
    
    for n in G.nodes():
        # Structural weight = (in_degree + out_degree + 1)
        weight = G.degree(n) + 1.0 
        total_weighted_risk += (G.nodes[n].get("risk_score", 0.0) * weight)
        total_weight += weight
        
    return total_weighted_risk / total_weight if total_weight > 0 else 0.0

def calculate_total_inventory(G: nx.DiGraph) -> float:
    return sum(G.nodes[n].get("inventory", 0.0) for n in G.nodes())

def extract_node_metrics(G: nx.DiGraph) -> dict:
    return {
        n: {
            "inventory": G.nodes[n].get("inventory", 0.0),
            "risk_score": G.nodes[n].get("risk_score", 0.0),
            "capacity": G.nodes[n].get("capacity", 100.0)
        }
        for n in G.nodes()
    }

def run_simulation(simulation_id: str, timesteps: int, disruptions: dict = None, simulation_tick_delay: float = 0.2, decision_mode: str = "human"):
    """
    Core in-memory discrete event simulation engine loop.
    Extracts the graph, runs entirely in memory, and pushes state to Redis.
    """
    logger.info(f"Starting simulation {simulation_id} for {timesteps} timesteps with {simulation_tick_delay}s delay")
    disruptions = disruptions or {}
    
    # Connect to Redis synchronously for the worker
    r = redis.Redis.from_url(settings.REDIS_URI, decode_responses=True)
    
    # 1. Load Graph into Memory
    G = load_graph_snapshot()
    
    active_disruptions = 0
    
    # 1.5 Process the new Multi-Type Structured Disruptions
    node_failures = disruptions.get("node_failures") or []
    edge_disruptions = disruptions.get("edge_disruptions") or []
    demand_spikes = disruptions.get("demand_spikes") or []
    capacity_reductions = disruptions.get("capacity_reductions") or []

    active_disruptions += len(node_failures) + len(edge_disruptions) + len(demand_spikes) + len(capacity_reductions)

    for nf in node_failures:
        tgt = nf.get("node_id")
        if tgt in G:
            # Node failure: increase risk significantly, tank inventory pipeline
            severity = nf.get("severity", 1.0)
            G.nodes[tgt]["risk_score"] = min(1.0, G.nodes[tgt].get("risk_score", 0.0) + severity)
            G.nodes[tgt]["inventory"] = 0.0
            
            # Propagate risk using ML Causal Model
            predictions = predict_delay_probability(G, tgt, severity)
            for node_id, delta_risk in predictions.items():
                G.nodes[node_id]["risk_score"] = min(1.0, G.nodes[node_id].get("risk_score", 0.0) + delta_risk)
                
            logger.info(f"[Timestep 0] node_failure injected at {tgt} with ML propagation")

    for ed in edge_disruptions:
        tgt_str = ed.get("edge_id")
        # Ensure we can parse "Source->Target" or use standard NetworkX keys
        if "->" in tgt_str:
            u, v = tgt_str.split("->")
            if G.has_edge(u, v):
                # Edge disruption: increase congestion
                G.edges[u, v]["congestion"] = G.edges[u, v].get("congestion", 0.0) + ed.get("congestion_increase", 0.5)
                logger.info(f"[Timestep 0] edge_disruption injected at {u}->{v}")

    for cr in capacity_reductions:
        tgt = cr.get("node_id")
        if tgt in G:
            # Map severity 0.1-5.0 to a 2% to 90% drop
            drop = min(cr.get("capacity_drop", 1.0) / 5.0, 0.9)
            
            # Capacity reduction
            new_capacity = max(1.0, G.nodes[tgt].get("capacity", 100.0) * (1.0 - drop))
            G.nodes[tgt]["capacity"] = new_capacity
            
            # If current inventory exceeds new capacity, the excess is lost/spoiled
            if G.nodes[tgt].get("inventory", 0.0) > new_capacity:
                G.nodes[tgt]["inventory"] = new_capacity
                
            # Increase risk score naturally when capacity drops (huge drops turn node red)
            G.nodes[tgt]["risk_score"] = min(1.0, G.nodes[tgt].get("risk_score", 0.0) + drop)
            logger.info(f"[Timestep 0] capacity_reduction injected at {tgt}")

    total_inventory = calculate_total_inventory(G)
    risk_index = calculate_risk_index(G)
    
    # Initial Push
    r.set(f"simulation:{simulation_id}", json.dumps({
        "simulation_id": simulation_id,
        "status": "running",
        "timestep": 0,
        "total_timesteps": timesteps,
        "total_inventory": total_inventory,
        "active_disruptions": active_disruptions,
        "risk_index": risk_index,
        "decision_mode": decision_mode,
        "node_metrics": extract_node_metrics(G),
        "ai_actions": [],
        "updated_at": datetime.now(timezone.utc).isoformat()
    }))

    action_history = []

    # 2. Discrete Time-Step Loop
    for t in range(1, timesteps + 1):
        # Legacy backward compatibility for old 'timestamp' dict payloads
        current_disruptions = disruptions.get(str(t), [])
        for d in current_disruptions:
            d_type = d.get("type")
            target = d.get("target")
            logger.info(f"[Timestep {t}] Legacy {d_type} injected at {target}")
            if d_type == "warehouse_failure" and target in G:
                G.nodes[target]["inventory"] = 0
                G.nodes[target]["risk_score"] = 1.0
                active_disruptions += 1
            elif d_type == "route_congestion" and G.has_edge(*target):
                u, v = target
                G.edges[u, v]["congestion"] = G.edges[u, v].get("congestion", 0.0) + 0.5
                active_disruptions += 1
                
        # Handle continuous structured modifiers for the timestep
        for ds in demand_spikes:
            tgt = ds.get("node_id")
            if tgt in G:
                # Demand spike: accelerates consumption, compounding downstream pressure
                mult = ds.get("demand_multiplier", 2.0)
                logger.info(f"[Timestep {t}] demand_spike exerting {mult}x pressure at {tgt}")
                if G.nodes[tgt].get("label") == "Customer":
                    G.nodes[tgt]["inventory"] = max(0.0, G.nodes[tgt].get("inventory", 0.0) - (10.0 * mult))
                else:
                    G.nodes[tgt]["inventory"] = max(0.0, G.nodes[tgt].get("inventory", 0.0) - (5.0 * mult))

        # Simulate inventory consumption / failure propagation
        for node_id in G.nodes():
            node = G.nodes[node_id]
            # Simple Consumption logic (default paths)
            if node.get("label") == "Customer":
                node["inventory"] = max(0.0, node.get("inventory", 0.0) - 10.0)
            elif node.get("label") == "Factory":
                current_inv = node.get("inventory", 0.0)
                cap = node.get("capacity", 500.0)
                # Only produce up to capacity, don't destroy existing inventory if it exceeds capacity suddenly
                if current_inv < cap:
                    node["inventory"] = min(cap, current_inv + 50.0)

            # Mild heuristic propagation of risk based on inventory health
            if node.get("inventory", 0.0) == 0.0 and node.get("label") != "Factory":
                node["risk_score"] = min(1.0, node.get("risk_score", 0.0) + 0.05)

        # AI Decision Mode Optimization Phase
        if decision_mode == "ai":
                actions = compute_optimal_actions(G)
                for action in actions:
                    if action["type"] == "reduce_congestion" and "edge" in action:
                        u, v = action["edge"]
                        amt = action["amount"]
                        G.edges[u, v]["congestion"] = max(0.0, G.edges[u, v].get("congestion", 0.0) - amt)
                    elif action["type"] == "rebalance_inventory":
                        src = action["from_node"]
                        dst = action["to_node"]
                        amt = action["amount"]
                        G.nodes[src]["inventory"] -= amt
                        G.nodes[dst]["inventory"] += amt
                        G.nodes[dst]["risk_score"] = max(0.0, G.nodes[dst].get("risk_score", 0.0) - 0.2)
                    
                    # Capture the log string for the UI
                    if "log" in action:
                        action_history.append({"timestep": t, "log": action["log"]})

        # Calculate new metrics
        total_inventory = calculate_total_inventory(G)
        risk_index = calculate_risk_index(G)
        node_metrics = extract_node_metrics(G)
        
        # 3. Stream to Redis
        r.set(f"simulation:{simulation_id}", json.dumps({
            "simulation_id": simulation_id,
            "status": "running",
            "timestep": t,
            "total_timesteps": timesteps,
            "total_inventory": total_inventory,
            "active_disruptions": active_disruptions,
            "risk_index": risk_index,
            "decision_mode": decision_mode,
            "node_metrics": node_metrics,
            "ai_actions": action_history,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }))
        
        # Simulate processing time delay for visualization
        time.sleep(simulation_tick_delay)

    # 4. Finalizing
    r.set(f"simulation:{simulation_id}", json.dumps({
        "simulation_id": simulation_id,
        "status": "completed",
        "timestep": timesteps,
        "total_timesteps": timesteps,
        "total_inventory": total_inventory,
        "active_disruptions": active_disruptions,
        "risk_index": risk_index,
        "decision_mode": decision_mode,
        "node_metrics": extract_node_metrics(G),
        "ai_actions": action_history,
        "updated_at": datetime.now(timezone.utc).isoformat()
    }))
    
    logger.info(f"Simulation {simulation_id} completed.")
    return True
