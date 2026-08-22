from fastapi import APIRouter, Depends, status
from neo4j import AsyncSession

from app.schemas.response import format_response
from app.db.neo4j import get_neo4j_session
from app.services.dev_service import DevService

router = APIRouter()

@router.post("/seed", response_model=dict, status_code=status.HTTP_201_CREATED)
async def seed_development_graph(session: AsyncSession = Depends(get_neo4j_session)):
    """Seeds the database with a pre-configured realistic supply chain network."""
    result = await DevService.seed_graph(session)
    return format_response(status="success", data=result)

@router.delete("/clear", response_model=dict, status_code=status.HTTP_200_OK)
async def clear_development_graph(session: AsyncSession = Depends(get_neo4j_session)):
    """Wipes the database down to allow for fresh seeding."""
    result = await DevService.clear_graph(session)
    return format_response(status="success", data=result)
