import uuid
from neo4j import AsyncSession
from fastapi import HTTPException
from app.schemas.graph import GraphImport, NodeCreate, EdgeCreate, NodeLabel, RelationshipType

class DevService:
    @staticmethod
    async def clear_graph(session: AsyncSession) -> dict:
        """
        Wipes the entire database to allow for fresh seeding.
        """
        delete_query = "MATCH (n) DETACH DELETE n"
        result = await session.run(delete_query)
        summary = await result.consume()
        return {"message": "Graph base cleared.", "nodes_deleted": summary.counters.nodes_deleted, "relationships_deleted": summary.counters.relationships_deleted}

    @staticmethod
    async def seed_graph(session: AsyncSession) -> dict:
        """
        Creates a realistic development seed network of 7 nodes and connecting edges.
        """
        # Node Definitions
        nodes = [
            # 🔴 PORT (Global Entry)
            NodeCreate(
                node_id="P1",
                name="Mumbai Port",
                label=NodeLabel.Port,
                lat=19.0760,
                lng=72.8777,
                capacity=25000,
                inventory=18000,
                risk_score=0.6,
                delay_probability=0.25
            ),

            # 🔵 SUPPLIERS (Industrial zones)
            NodeCreate(node_id="S1", name="Gujarat Supplier", label=NodeLabel.Supplier, lat=22.2587, lng=71.1924, capacity=15000, inventory=12000, risk_score=0.15, delay_probability=0.05),
            NodeCreate(node_id="S2", name="Punjab Supplier", label=NodeLabel.Supplier, lat=31.1471, lng=75.3412, capacity=12000, inventory=10000, risk_score=0.1, delay_probability=0.04),
            NodeCreate(node_id="S3", name="Tamil Nadu Supplier", label=NodeLabel.Supplier, lat=11.1271, lng=78.6569, capacity=10000, inventory=8000, risk_score=0.2, delay_probability=0.06),

            # 🏭 FACTORIES
            NodeCreate(node_id="F1", name="Pune Manufacturing Unit", label=NodeLabel.Factory, lat=18.5204, lng=73.8567, capacity=8000, inventory=3000, risk_score=0.2, delay_probability=0.08),
            NodeCreate(node_id="F2", name="Bangalore Manufacturing Unit", label=NodeLabel.Factory, lat=12.9716, lng=77.5946, capacity=10000, inventory=4000, risk_score=0.25, delay_probability=0.1),

            # 📦 WAREHOUSES (Tier 1 Distribution)
            NodeCreate(node_id="W1", name="Delhi Mega Warehouse", label=NodeLabel.Warehouse, lat=28.6139, lng=77.2090, capacity=20000, inventory=15000, risk_score=0.18, delay_probability=0.06),
            NodeCreate(node_id="W2", name="Jaipur Warehouse", label=NodeLabel.Warehouse, lat=26.9124, lng=75.7873, capacity=18000, inventory=12000, risk_score=0.15, delay_probability=0.05),
            NodeCreate(node_id="W3", name="Lucknow Warehouse", label=NodeLabel.Warehouse, lat=26.8467, lng=80.9462, capacity=15000, inventory=10000, risk_score=0.12, delay_probability=0.04),

            # 🚢 PORT WAREHOUSE
            NodeCreate(node_id="W_PORT", name="Mumbai Port Terminal", label=NodeLabel.Warehouse, lat=19.0760, lng=72.8777, capacity=25000, inventory=5000, risk_score=0.10, delay_probability=0.03),

            # 🚛 CENTRAL HUB (Logistics pivot)
            NodeCreate(node_id="T1", name="Nagpur Central Hub", label=NodeLabel.TransportHub, lat=21.1458, lng=79.0882, capacity=12000, inventory=2000, risk_score=0.22, delay_probability=0.12),

            # 🧍 CUSTOMERS (Tier 2 cities)
            NodeCreate(node_id="C1", name="Bhopal Customer Zone", label=NodeLabel.Customer, lat=23.2599, lng=77.4126, capacity=12000, inventory=4000, risk_score=0.06, delay_probability=0.02),
            NodeCreate(node_id="C2", name="Patna Customer Zone", label=NodeLabel.Customer, lat=25.5941, lng=85.1376, capacity=10000, inventory=3000, risk_score=0.05, delay_probability=0.02),
            NodeCreate(node_id="C3", name="Hyderabad Customer Zone", label=NodeLabel.Customer, lat=17.3850, lng=78.4867, capacity=8000, inventory=2000, risk_score=0.04, delay_probability=0.01),
        ]
        
        # Edge Definitions (Dependencies & Shipping Routes)
        edges = [
            
            # Suppliers to Factories
            EdgeCreate(edge_id="E1", source_id="S1", target_id="F1", type=RelationshipType.SUPPLIES, transit_time=1.5, cost=300.0, congestion=0.2, disruption_probability=0.05),
            EdgeCreate(edge_id="E2", source_id="S2", target_id="F1", type=RelationshipType.SUPPLIES, transit_time=1.0, cost=200.0, congestion=0.15, disruption_probability=0.04),
            EdgeCreate(edge_id="E3", source_id="S3", target_id="F2", type=RelationshipType.SUPPLIES, transit_time=1.2, cost=250.0, congestion=0.18, disruption_probability=0.06),
            
            # Factories to Warehouses (above Port)
            EdgeCreate(edge_id="E4", source_id="F1", target_id="W1", type=RelationshipType.SHIPS_TO, transit_time=0.8, cost=120.0, congestion=0.2, disruption_probability=0.03),
            EdgeCreate(edge_id="E5", source_id="F1", target_id="W2", type=RelationshipType.SHIPS_TO, transit_time=0.9, cost=130.0, congestion=0.22, disruption_probability=0.04),
            EdgeCreate(edge_id="E6", source_id="F2", target_id="W3", type=RelationshipType.SHIPS_TO, transit_time=1.1, cost=150.0, congestion=0.25, disruption_probability=0.05),
            
            # ALL Warehouses converge on the Port (Centerpoint)
            EdgeCreate(edge_id="E7", source_id="W1", target_id="P1", type=RelationshipType.SHIPS_TO, transit_time=0.5, cost=100.0, congestion=0.3, disruption_probability=0.02),
            EdgeCreate(edge_id="E8", source_id="W2", target_id="P1", type=RelationshipType.SHIPS_TO, transit_time=0.6, cost=110.0, congestion=0.35, disruption_probability=0.03),
            EdgeCreate(edge_id="E9", source_id="W3", target_id="P1", type=RelationshipType.SHIPS_TO, transit_time=0.7, cost=115.0, congestion=0.32, disruption_probability=0.04),
            
            # Port to Port's Warehouse
            EdgeCreate(edge_id="E10", source_id="P1", target_id="W_PORT", type=RelationshipType.CONNECTS_TO, transit_time=0.2, cost=50.0, congestion=0.1, disruption_probability=0.01),
            
            # Port's Warehouse to Transport Hub
            EdgeCreate(edge_id="E11", source_id="W_PORT", target_id="T1", type=RelationshipType.CONNECTS_TO, transit_time=1.5, cost=300.0, congestion=0.4, disruption_probability=0.06),
            
            # Transport Hub distributes to all Customers
            EdgeCreate(edge_id="E12", source_id="T1", target_id="C1", type=RelationshipType.SHIPS_TO, transit_time=1.2, cost=220.0, congestion=0.35, disruption_probability=0.05),
            EdgeCreate(edge_id="E13", source_id="T1", target_id="C2", type=RelationshipType.SHIPS_TO, transit_time=1.5, cost=250.0, congestion=0.4, disruption_probability=0.06),
            EdgeCreate(edge_id="E14", source_id="T1", target_id="C3", type=RelationshipType.SHIPS_TO, transit_time=1.8, cost=280.0, congestion=0.45, disruption_probability=0.08),
        ]

        from app.services.graph_service import GraphService
        import_data = GraphImport(nodes=nodes, edges=edges)
        
        # Check if graph is already seeded to avoid constraint errors
        check_query = "MATCH (n) RETURN COUNT(n) as count"
        result = await session.run(check_query)
        record = await result.single()
        if record and record["count"] > 0:
            return {"message": "Graph is already populated. Clear it first before seeding.", "nodes_created": 0, "edges_created": 0}

        return await GraphService.import_subgraph(session, import_data)
