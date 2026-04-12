import networkx as nx
from neo4j import GraphDatabase
from app.core.config import settings
from app.core.logging import logger

def load_graph_snapshot() -> nx.DiGraph:
    """
    Connects synchronously to Neo4j (for Celery worker context) 
    and returns an in-memory NetworkX DiGraph preserving all Node/Edge properties.
    """
    logger.info("Loading Neo4j graph snapshot into memory...")
    
    # We use sync driver here as this is executed synchronously within a Celery worker
    driver = GraphDatabase.driver(
        settings.NEO4J_URI, 
        auth=(settings.NEO4J_USER, settings.NEO4J_PASSWORD)
    )
    
    G = nx.DiGraph()
    
    with driver.session() as session:
        # 1. Fetch all Nodes
        nodes_query = "MATCH (n) RETURN n, labels(n)[0] as label"
        nodes_result = session.run(nodes_query)
        
        for record in nodes_result:
            node_data = dict(record["n"].items())
            node_id = node_data.get("node_id")
            if not node_id:
                continue
                
            # Embed label and existing properties
            node_data["label"] = record["label"]
            G.add_node(node_id, **node_data)
        
        # 2. Fetch all Edges
        edges_query = """
        MATCH (source)-[r]->(target)
        RETURN source.node_id as source_id, target.node_id as target_id, r, type(r) as type
        """
        edges_result = session.run(edges_query)
        
        for record in edges_result:
            source_id = record["source_id"]
            target_id = record["target_id"]
            if not source_id or not target_id:
                continue
                
            edge_data = dict(record["r"].items())
            edge_data["type"] = record["type"]
            G.add_edge(source_id, target_id, **edge_data)
            
    driver.close()
    
    logger.info(f"Snapshot loaded successfully: {G.number_of_nodes()} Nodes, {G.number_of_edges()} Edges")
    return G
