import networkx as nx
from typing import Dict, Any
from app.core.logging import logger

def predict_delay_probability(G: nx.DiGraph, disrupted_node_id: str, severity: float) -> Dict[str, float]:
    """
    Uses Graph Theory (PageRank) to determine
    how failures propagate through the entire network topology.
    """
    logger.info(f"GNN Causal Engine analyzing structural blast radius for {disrupted_node_id}")
    
    predictions = {}
    if disrupted_node_id not in G:
        return predictions

    # 1. Compute Global Influence using PageRank (Centrality)
    # This identifies "Hubs" that amplify shocks.
    try:
        centrality = nx.pagerank(G, weight='transit_time')
    except:
        # Fallback if graph is too disconnected
        centrality = {n: 1.0/len(G) for n in G.nodes()}

    # 2. Multi-Hop Propagation (Cascading Failure Wave)
    # We simulate a "Message Passing" layer by iterating twice.
    
    # Hop 1: Direct Impacts (High severity)
    visited = {disrupted_node_id}
    level_1_neighbors = list(G.successors(disrupted_node_id))
    
    for n1 in level_1_neighbors:
        if n1 in visited: continue
        
        # INCREASED GAIN: Structural vulnerability = (Centrality * 100)
        struct_vuln = centrality.get(n1, 0) * 100
        
        # Combined Risk = (Raw Severity) + (Structural Impact)
        # Even small centrality now adds noticeable risk (e.g. +0.2 to +0.5)
        node_risk = min(1.0, (severity * 0.5) + (struct_vuln * 5.0))
        predictions[n1] = node_risk
        visited.add(n1)

        # Hop 2: Secondary Ripple (Increased visibility)
        level_2_neighbors = list(G.successors(n1))
        for n2 in level_2_neighbors:
            if n2 in visited: continue
            
            parent_impact = predictions[n1]
            n2_centrality = centrality.get(n2, 0) * 50
            secondary_risk = min(1.0, (parent_impact * 0.6) + (n2_centrality * 2.0))
            
            predictions[n2] = secondary_risk
            visited.add(n2)

    logger.info(f"Causal Wave complete. Impacted {len(predictions)} nodes structurally.")
    return predictions
