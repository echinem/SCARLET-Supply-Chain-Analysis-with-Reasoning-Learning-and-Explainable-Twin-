import asyncio
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from app.api.health import router as health_router
from app.core.config import settings
from app.core.logging import logger
from app.db.neo4j import neo4j_db
from app.db.redis import redis_db
from app.db.init_neo4j import init_neo4j_constraints
from app.api.graph import router as graph_router
from app.api.simulation import router as simulation_router
from app.api.dev import router as dev_router
from app.api.routing import router as routing_router

async def connect_with_retry(db_name: str, connect_fn, max_retries: int = 10, base_delay: int = 2):
    """
    Attempt to connect to a database with exponential backoff retry.
    """
    for attempt in range(1, max_retries + 1):
        try:
            await connect_fn()
            logger.info(f"Successfully connected to {db_name}")
            return
        except Exception as e:
            if attempt == max_retries:
                logger.error(f"Failed to connect to {db_name} after {max_retries} attempts.")
                raise RuntimeError(f"Startup Exception: Could not connect to {db_name}") from e
            
            # Using exponential backoff with a base wait of 2 seconds (2, 4, 8, 16...)
            # to fulfill both 'exponential backoff' and '2 seconds' requirements.
            wait_time = base_delay ** attempt
            
            logger.warning(
                f"{db_name} connection failed ({e}). "
                f"Retrying in {wait_time}s... (Attempt {attempt}/{max_retries})"
            )
            await asyncio.sleep(wait_time)

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup actions
    logger.info(f"Starting {settings.PROJECT_NAME} API v{settings.VERSION}")
    
    # Initialize DB connections with retry mechanism
    # If all 10 retries fail, it raises a startup exception preventing FastAPI from starting
    await connect_with_retry("Neo4j", neo4j_db.connect)
    if neo4j_db.driver:
        await init_neo4j_constraints(neo4j_db.driver)
        
    await connect_with_retry("Redis", redis_db.connect)
    
    yield
    
    # Shutdown actions
    logger.info("Shutting down API...")
    await neo4j_db.close()
    await redis_db.close()

app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    lifespan=lifespan
)

origins = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
	"http://172.16.112.61:3000",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,   
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(health_router, tags=["Health"])
app.include_router(graph_router, prefix="/api", tags=["Graph Engine"])
app.include_router(simulation_router, prefix="/api", tags=["Simulation Engine"])
app.include_router(dev_router, prefix="/api/dev", tags=["Development"])
app.include_router(routing_router, prefix="/api/routing", tags=["Smart Routing"])

@app.get("/")
async def root():
    return {"message": f"Welcome to the {settings.PROJECT_NAME} API"}
