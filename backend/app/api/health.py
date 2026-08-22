from fastapi import APIRouter, Depends, status, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from neo4j import AsyncSession as Neo4jAsyncSession
import redis.asyncio as redis
from datetime import datetime, timezone

from app.schemas.health import HealthResponse
from app.schemas.response import format_response

from app.db.postgres import get_db_session
from app.db.neo4j import neo4j_db, get_neo4j_session
from app.db.redis import redis_db, get_redis_client
from app.core.logging import logger

router = APIRouter()

@router.get("/health", response_model=dict, status_code=status.HTTP_200_OK)
async def health_check():
    """
    Health check endpoint that verifies connectivity to PostgreSQL, Neo4j, and Redis.
    """
    postgres_status = "unknown"
    neo4j_status = "unknown"
    redis_status = "unknown"
    overall_status = "healthy"
    
    # Check Postgres
    try:
        from app.db.postgres import async_session_maker
        async with async_session_maker() as session:
            result = await session.execute(text("SELECT 1"))
            if result.scalar() == 1:
                postgres_status = "connected"
    except Exception as e:
        logger.error(f"Postgres health check failed: {e}")
        postgres_status = "disconnected"
        overall_status = "unhealthy"

    # Check Neo4j
    try:
        if neo4j_db.driver:
            await neo4j_db.driver.verify_connectivity()
            neo4j_status = "connected"
        else:
             neo4j_status = "disconnected (not initialized)"
             overall_status = "unhealthy"
    except Exception as e:
        logger.error(f"Neo4j health check failed: {e}")
        neo4j_status = "disconnected"
        overall_status = "unhealthy"

    # Check Redis
    try:
         if redis_db.client:
             await redis_db.client.ping()
             redis_status = "connected"
         else:
             redis_status = "disconnected (not initialized)"
             overall_status = "unhealthy"
    except Exception as e:
        logger.error(f"Redis health check failed: {e}")
        redis_status = "disconnected"
        overall_status = "unhealthy"
    
    health_data = HealthResponse(
        status=overall_status,
        postgres_status=postgres_status,
        neo4j_status=neo4j_status,
        redis_status=redis_status,
        timestamp=datetime.now(timezone.utc).isoformat()
    )
    
    if overall_status != "healthy":
        return format_response(
             status="error",
             data=health_data.model_dump(),
             meta={"timestamp": health_data.timestamp},
             error="One or more database connections failed"
        )
        
    return format_response(
         status="success",
         data=health_data.model_dump(),
         meta={"timestamp": health_data.timestamp}
    )
