import redis.asyncio as redis
from typing import AsyncGenerator
from app.core.config import settings
from app.core.logging import logger

class RedisConnection:
    def __init__(self):
        self.client: redis.Redis = None

    async def connect(self):
        try:
            self.client = redis.from_url(
                settings.REDIS_URI, 
                encoding="utf8", 
                decode_responses=True
            )
            # Verify connectivity
            await self.client.ping()
            logger.info("Connected to Redis successfully.")
        except Exception as e:
            logger.error(f"Failed to connect to Redis: {e}")
            raise

    async def close(self):
        if self.client:
            await self.client.close()
            logger.info("Redis connection closed.")

redis_db = RedisConnection()

async def get_redis_client() -> AsyncGenerator[redis.Redis, None]:
    if not redis_db.client:
        await redis_db.connect()
    
    try:
        yield redis_db.client
    except Exception as e:
        logger.error(f"Redis client error: {e}")
        raise
