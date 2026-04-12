import networkx as nx
import numpy as np
from typing import List, Dict, Any, Tuple
from app.core.logging import logger

# REINFORCEMENT LEARNING CONFIGURATION (POLISHED)
ACTIONS = ["STABLE", "REBALANCE", "REROUTE"]
Q_TABLE = {
    (0, 2): [-1.0, 5.0, 2.0],  # Critical Inv + High Risk -> REBALANCE (1)
    (0, 1): [-0.5, 4.0, 1.0],  # Alert Inv + Med Risk -> REBALANCE (1)
    (2, 2): [0.0, 1.0, 4.0],   # Surplus Inv + High Risk -> REROUTE (2)
}

def get_state(inventory: float, risk: float, capacity: float) -> Tuple[int, int]:
    inv_ratio = inventory / capacity if capacity > 0 else 0
    inv_state = 0 if inv_ratio < 0.2 else (1 if inv_ratio < 0.7 else 2)
    risk_state = 0 if risk < 0.3 else (1 if risk < 0.6 else 2)
    return (inv_state, risk_state)

def compute_optimal_actions(G: nx.DiGraph) -> List[Dict[str, Any]]:
    """
    Refined RL Policy Engine.
    Ensures unique, progressive logging to prevent UI freezing.
    """
    actions = []
    warehouse_nodes = [n for n in G.nodes() if G.nodes[n].get("label") == "Warehouse"]

    for n_id in G.nodes():
        node = G.nodes[n_id]
        label = node.get("label")
        name = node.get("name", n_id)

        # 1. Special Handling for Suppliers
        if label == "Supplier":
            actions.append({"type": "log", "log": f"[Alpha-Mode] Supplier {name}: Operational"})
            continue

        # 2. RL Evaluation
        inv, risk, cap = node.get("inventory", 0.0), node.get("risk_score", 0.0), node.get("capacity", 100.0)
        state = get_state(inv, risk, cap)
        q_vals = Q_TABLE.get(state, [2.0, 0.0, 0.0]) # Default: STABLE
        choice = ACTIONS[np.argmax(q_vals)]

        # 3. Decision Branch with Improved Logging
        if choice == "REBALANCE":
            # Search for surplus donor
            best_wh = next((wh for wh in warehouse_nodes if G.nodes[wh].get("inventory", 0) > 50 and wh != n_id), None)
            if best_wh:
                logger.info(f"RL DECISION: Rescuing {name} from {best_wh}")
                actions.append({
                    "type": "rebalance_inventory",
                    "from_node": best_wh, "to_node": n_id, "amount": 25.0,
                    "log": f"AI POLICY: Moving stock to {name} from {best_wh}"
                })
                G.nodes[best_wh]["inventory"] -= 25.0 # Local update to prevent over-allocation

        elif choice == "REROUTE":
            # Find the MOST congested inbound edge to fix
            target_edge = None
            max_c = 0
            for u, v in G.in_edges(n_id):
                c = G.edges[u, v].get("congestion", 0)
                if c > max_c:
                    max_c = c
                    target_edge = (u, v)
            
            if target_edge:
                actions.append({
                    "type": "reduce_congestion",
                    "edge": target_edge,
                    "amount": 0.2,
                    "log": f"AI POLICY: Rerouting traffic for {name} on edge {target_edge[0]}->{target_edge[1]}"
                })
        
        elif risk > 0.4: # Only log 'STABLE' if there's some baseline risk but it's okay
            actions.append({
                "type": "log",
                "log": f"AI STATUS: {name} monitor status - NOMINAL"
            })

    return actions
