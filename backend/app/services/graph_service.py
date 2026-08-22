from neo4j import AsyncSession, exceptions
from fastapi import HTTPException, status
from typing import Dict, Any, List
from app.schemas.graph import NodeCreate, EdgeCreate, GraphImport
from app.core.logging import logger
from enum import Enum

class GraphService:
    @staticmethod
    def _clean_dict(d: dict) -> dict:
        """Removes None values for Neo4j properties and converts dates to ISO strings"""
        cleaned = {}
        for k, v in d.items():
            if v is not None:
                if hasattr(v, "isoformat"):
                    cleaned[k] = v.isoformat()
                elif isinstance(v, Enum):
                    cleaned[k] = v.value
                else:
                    cleaned[k] = v
        return cleaned

    @staticmethod
    async def create_node(session: AsyncSession, node_data: NodeCreate) -> Dict[str, Any]:
        properties = GraphService._clean_dict(node_data.model_dump(exclude={"label"}))
        label = node_data.label.value

        query = f"""
        CREATE (n:{label} $props)
        RETURN n
        """
        try:
            result = await session.run(query, props=properties)
            record = await result.single()
            if not record:
                raise HTTPException(status_code=500, detail="Failed to create node")
            return dict(record["n"].items())
        except exceptions.ConstraintError as e:
            logger.error(f"Duplicate node_id: {node_data.node_id}")
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Node with id {node_data.node_id} already exists."
            )

    @staticmethod
    async def get_all_nodes(session: AsyncSession) -> List[Dict[str, Any]]:
        query = """
        MATCH (n)
        RETURN n, labels(n)[0] as label
        """
        result = await session.run(query)
        
        nodes = []
        async for record in result:
            node_dict = dict(record["n"].items())
            if "node_id" in node_dict:
                node_dict["label"] = record["label"]
                nodes.append(node_dict)
        return nodes

    @staticmethod
    async def get_all_edges(session: AsyncSession) -> List[Dict[str, Any]]:
        query = """
        MATCH (source)-[r]->(target)
        RETURN 
            r.edge_id as edge_id,
            source.node_id as source_id,
            target.node_id as target_id,
            type(r) as type,
            r.transit_time as transit_time,
            r.cost as cost,
            r.congestion as congestion,
            r.disruption_probability as disruption_probability
        """
        result = await session.run(query)
        
        edges = []
        async for record in result:
            edges.append({
                "edge_id": record["edge_id"],
                "source_id": record["source_id"],
                "target_id": record["target_id"],
                "type": record["type"],
                "transit_time": record["transit_time"],
                "cost": record["cost"],
                "congestion": record["congestion"],
                "disruption_probability": record["disruption_probability"]
            })
        return edges

    @staticmethod
    async def get_node(session: AsyncSession, node_id: str) -> Dict[str, Any]:
        query = """
        MATCH (n)
        WHERE n.node_id = $node_id
        RETURN n, labels(n)[0] as label
        """
        result = await session.run(query, node_id=node_id)
        record = await result.single()
        
        if not record:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Node with id {node_id} not found."
            )
        
        node_dict = dict(record["n"].items())
        node_dict["label"] = record["label"]
        return node_dict

    @staticmethod
    async def delete_node(session: AsyncSession, node_id: str):
        query = """
        MATCH (n)
        WHERE n.node_id = $node_id
        DETACH DELETE n
        RETURN count(n) as deleted_count
        """
        result = await session.run(query, node_id=node_id)
        record = await result.single()
        
        if record["deleted_count"] == 0:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Node with id {node_id} not found."
            )

    @staticmethod
    async def create_edge(session: AsyncSession, edge_data: EdgeCreate) -> Dict[str, Any]:
        properties = GraphService._clean_dict(
            edge_data.model_dump(exclude={"type", "source_id", "target_id"})
        )
        rel_type = edge_data.type.value

        query = f"""
        MATCH (source) WHERE source.node_id = $source_id
        MATCH (target) WHERE target.node_id = $target_id
        CREATE (source)-[r:{rel_type} $props]->(target)
        RETURN r
        """
        try:
            result = await session.run(
                query, 
                source_id=edge_data.source_id, 
                target_id=edge_data.target_id, 
                props=properties
            )
            record = await result.single()
            
            if not record:
                # If record is None, it means the MATCH clause failed to find source or target
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Source node '{edge_data.source_id}' or Target node '{edge_data.target_id}' does not exist."
                )
            
            return dict(record["r"].items())
        except exceptions.ConstraintError as e:
            logger.error(f"Duplicate edge_id: {edge_data.edge_id}")
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Edge with id {edge_data.edge_id} already exists."
            )

    @staticmethod
    async def delete_edge(session: AsyncSession, edge_id: str):
        query = """
        MATCH ()-[r]->()
        WHERE r.edge_id = $edge_id
        DELETE r
        RETURN count(r) as deleted_count
        """
        result = await session.run(query, edge_id=edge_id)
        record = await result.single()
        
        if record["deleted_count"] == 0:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Edge with id {edge_id} not found."
            )

    @staticmethod
    async def import_subgraph(session: AsyncSession, import_data: GraphImport) -> Dict[str, int]:
        """
        Uses UNWIND for high performance batch importing within a single transaction
        """
        # Prepare Node Data
        # We group nodes by label to use parameterized label creation efficiently
        nodes_by_label: Dict[str, List[Dict]] = {}
        for node in import_data.nodes:
            label = node.label.value
            props = GraphService._clean_dict(node.model_dump(exclude={"label"}))
            if label not in nodes_by_label:
                nodes_by_label[label] = []
            nodes_by_label[label].append(props)

        nodes_created = 0
        for label, batch in nodes_by_label.items():
            query = f"""
            UNWIND $batch AS props
            MERGE (n:{label} {{node_id: props.node_id}})
            SET n += props
            """
            result = await session.run(query, batch=batch)
            summary = await result.consume()
            nodes_created += summary.counters.nodes_created

        # Prepare Edge Data
        edges_by_type: Dict[str, List[Dict]] = {}
        for edge in import_data.edges:
            rel_type = edge.type.value
            props = GraphService._clean_dict(edge.model_dump(exclude={"type"}))
            # Put source/target in the dict so UNWIND can access them
            if rel_type not in edges_by_type:
                edges_by_type[rel_type] = []
            edges_by_type[rel_type].append(props)

        edges_created = 0
        for rel_type, batch in edges_by_type.items():
            query = f"""
            UNWIND $batch AS props
            MATCH (source {{node_id: props.source_id}})
            MATCH (target {{node_id: props.target_id}})
            MERGE (source)-[r:{rel_type} {{edge_id: props.edge_id}}]->(target)
            SET r += props
            """
            result = await session.run(query, batch=batch)
            summary = await result.consume()
            edges_created += summary.counters.relationships_created

        return {
            "nodes_created": nodes_created,
            "edges_created": edges_created
        }
