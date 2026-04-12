from pydantic import BaseModel
from typing import Optional

class HealthResponse(BaseModel):
    status: str
    postgres_status: str
    neo4j_status: str
    redis_status: str
    timestamp: Optional[str] = None
