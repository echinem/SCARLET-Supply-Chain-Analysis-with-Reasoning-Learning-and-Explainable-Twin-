from neo4j import AsyncDriver
from app.core.logging import logger
from app.schemas.graph import NodeLabel, RelationshipType

async def init_neo4j_constraints(driver: AsyncDriver):
    """
    Idempotent initialization script that ensures unique constraints 
    and fast traversal indices exist
    """
    async with driver.session() as session:
        # 0. Unique constraints for Edge ID across Relationships
        query_edge_constraint = """
        CREATE CONSTRAINT unique_edge_id IF NOT EXISTS
        FOR ()-[r]-() REQUIRE r.edge_id IS UNIQUE
        """
        try:
            result = await session.run(query_edge_constraint)
            await result.consume()
        except Exception as e:
            logger.warning(f"Could not create edge constraint: {e}")

        # 1. Unique constraints on Node ID per label constraint
        # (Neo4j requires unique constraints to be bound to a label)
        for label in NodeLabel:
            constraint_name = f"unique_node_id_{label.value}"
            query_constraint = f"""
            CREATE CONSTRAINT {constraint_name} IF NOT EXISTS
            FOR (n:{label.value}) REQUIRE n.node_id IS UNIQUE
            """
            try:
                result = await session.run(query_constraint)
                await result.consume()
            except Exception as e:
                logger.warning(f"Could not create constraint {constraint_name}: {e}")

        # 2. Index on risk_score for fast querying
        for label in NodeLabel:
            index_name = f"index_risk_score_{label.value}"
            query_index = f"""
            CREATE INDEX {index_name} IF NOT EXISTS
            FOR (n:{label.value}) ON (n.risk_score)
            """
            try:
                result = await session.run(query_index)
                await result.consume()
            except Exception as e:
                logger.warning(f"Could not create index {index_name}: {e}")
        
        logger.info("Neo4j structural constraints and indices initialized.")
