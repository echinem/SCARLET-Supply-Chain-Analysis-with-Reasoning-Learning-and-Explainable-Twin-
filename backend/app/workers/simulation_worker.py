import json
import redis
from datetime import datetime, timezone

from app.celery_app import celery_app
from app.services.simulation_service import run_simulation
from app.core.logging import logger
from app.core.config import settings

@celery_app.task(bind=True, name="run_simulation_task", acks_late=True)
def run_simulation_task(self, simulation_id: str, timesteps: int, disruptions: dict = None, simulation_tick_delay: float = 0.2, decision_mode: str = "human"):
    """
    Background job that offloads the simulation loop to a worker process.
    """
    redis_key = f"simulation:{simulation_id}"
    
    # Establish synchronous Redis connection for the worker
    try:
        r = redis.Redis.from_url(settings.REDIS_URI, decode_responses=True)
    except Exception as e:
        logger.error(f"Worker failed to connect to Redis for simulation {simulation_id}: {e}")
        return {"status": "failed", "error": "Redis connection failed"}

    try:
        # 1. Update status to 'running' immediately when Celery task starts
        existing_data = r.get(redis_key)
        state = json.loads(existing_data) if existing_data else {"simulation_id": simulation_id}
        
        state.update({
            "status": "running",
            "updated_at": datetime.now(timezone.utc).isoformat()
        })
        r.set(redis_key, json.dumps(state))
        
        # 2. Pass off to simulation logic
        run_simulation(simulation_id, timesteps, disruptions, simulation_tick_delay, decision_mode)
        
        return {"status": "success", "simulation_id": simulation_id}
        
    except Exception as e:
        logger.error(f"Simulation {simulation_id} failed: {e}")
        
        # 3. Handle exceptions by updating Redis lifecycle keys
        try:
            existing_data = r.get(redis_key)
            state = json.loads(existing_data) if existing_data else {"simulation_id": simulation_id}
            
            state.update({
                "status": "failed",
                "error_message": str(e),
                "updated_at": datetime.now(timezone.utc).isoformat()
            })
            r.set(redis_key, json.dumps(state))
        except Exception as redis_error:
            logger.error(f"Failed to push final failed state to Redis for simulation {simulation_id}: {redis_error}")
            
        return {"status": "failed", "error": str(e)}
