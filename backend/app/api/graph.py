from fastapi import APIRouter, Depends, status
from neo4j import AsyncSession
from typing import Dict, Any

from app.schemas.response import format_response
from app.schemas.graph import NodeCreate, NodeResponse, EdgeCreate, EdgeResponse, GraphImport
from app.db.neo4j import get_neo4j_session
from app.services.graph_service import GraphService

router = APIRouter()

@router.post("/nodes", response_model=dict, status_code=status.HTTP_201_CREATED)
async def create_node(node: NodeCreate, session: AsyncSession = Depends(get_neo4j_session)):
    """Creates a single node unconditionally."""
    new_node = await GraphService.create_node(session, node)
    return format_response(status="success", data=new_node)

@router.get("/nodes", response_model=dict, status_code=status.HTTP_200_OK)
async def get_all_nodes(session: AsyncSession = Depends(get_neo4j_session)):
    """Retrieves all nodes in the graph."""
    nodes = await GraphService.get_all_nodes(session)
    return format_response(status="success", data=nodes)

@router.get("/nodes/{node_id}", response_model=dict, status_code=status.HTTP_200_OK)
async def get_node(node_id: str, session: AsyncSession = Depends(get_neo4j_session)):
    """Retrieves a single node by its unique node_id."""
    node = await GraphService.get_node(session, node_id)
    return format_response(status="success", data=node)

@router.delete("/nodes/{node_id}", response_model=dict, status_code=status.HTTP_200_OK)
async def delete_node(node_id: str, session: AsyncSession = Depends(get_neo4j_session)):
    """Deletes a single node and its connected edges."""
    await GraphService.delete_node(session, node_id)
    return format_response(status="success", data={"message": "Node deleted"})

@router.post("/edges", response_model=dict, status_code=status.HTTP_201_CREATED)
async def create_edge(edge: EdgeCreate, session: AsyncSession = Depends(get_neo4j_session)):
    """Creates an edge between two existing nodes."""
    new_edge = await GraphService.create_edge(session, edge)
    return format_response(status="success", data=new_edge)

@router.get("/edges", response_model=dict, status_code=status.HTTP_200_OK)
async def get_all_edges(session: AsyncSession = Depends(get_neo4j_session)):
    """Retrieves all relationships in the graph."""
    edges = await GraphService.get_all_edges(session)
    return format_response(status="success", data=edges)

@router.delete("/edges/{edge_id}", response_model=dict, status_code=status.HTTP_200_OK)
async def delete_edge(edge_id: str, session: AsyncSession = Depends(get_neo4j_session)):
    """Deletes a relationship edge by its unique edge_id."""
    await GraphService.delete_edge(session, edge_id)
    return format_response(status="success", data={"message": "Edge deleted"})

@router.post("/graph/import", response_model=dict, status_code=status.HTTP_201_CREATED)
async def import_subgraph(import_data: GraphImport, session: AsyncSession = Depends(get_neo4j_session)):
    """
    Batch imports nodes and edges. Uses efficient UNWIND queries inside a Neo4j transaction.
    """
    result_counts = await GraphService.import_subgraph(session, import_data)
    return format_response(status="success", data=result_counts)
