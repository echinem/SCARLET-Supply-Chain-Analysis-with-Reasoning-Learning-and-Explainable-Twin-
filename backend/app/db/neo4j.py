from neo4j import AsyncGraphDatabase, AsyncDriver
from typing import Optional, AsyncGenerator
from app.core.config import settings
from app.core.logging import logger

class Neo4jConnection:
    def __init__(self):
        self.driver: Optional[AsyncDriver] = None

    async def connect(self):
        try:
            self.driver = AsyncGraphDatabase.driver(
                settings.NEO4J_URI,
                auth=(settings.NEO4J_USER, settings.NEO4J_PASSWORD)
            )
            # Verify connectivity
            await self.driver.verify_connectivity()
            logger.info("Connected to Neo4j successfully.")
        except Exception as e:
            logger.error(f"Failed to connect to Neo4j: {e}")
            raise

    async def close(self):
        if self.driver:
            await self.driver.close()
            logger.info("Neo4j connection closed.")

neo4j_db = Neo4jConnection()

async def get_neo4j_session() -> AsyncGenerator:
    if not neo4j_db.driver:
         await neo4j_db.connect()
    
    async with neo4j_db.driver.session() as session:
        try:
            yield session
        except Exception as e:
            logger.error(f"Neo4j session error: {e}")
            raise
