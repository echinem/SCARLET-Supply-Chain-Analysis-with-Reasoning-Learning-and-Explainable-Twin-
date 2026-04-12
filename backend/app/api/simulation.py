import uuid
import json
import redis.asyncio as redis
from fastapi import APIRouter, Depends, status, HTTPException
from app.schemas.response import format_response
from app.schemas.simulation import (
    SimulationParams, 
    SimulationResponse, 
    SimulationStatusResponse, 
    SimulationMetricsResponse
)
from app.workers.simulation_worker import run_simulation_task
from app.db.redis import get_redis_client

from app.services.simulation_service import run_simulation

@router.post("/simulate", response_model=dict, status_code=status.HTTP_202_ACCEPTED)
async def start_simulation(params: SimulationParams, redis_client: redis.Redis = Depends(get_redis_client)):
    """Starts a simulation. (Now running synchronously for development sync)"""
    simulation_id = str(uuid.uuid4())
    
    # Pre-register status in Redis
    init_state = {
        "simulation_id": simulation_id,
        "status": "queued",
        "timestep": 0,
        "total_timesteps": params.timesteps,
        "total_inventory": 0.0,
        "active_disruptions": 0,
        "risk_index": 0.0,
        "decision_mode": params.decision_mode,
        "ai_actions": []
    }
    await redis_client.set(f"simulation:{simulation_id}", json.dumps(init_state))
    
    # Run synchronously to bypass stalled celery workers
    import asyncio
    from concurrent.futures import ThreadPoolExecutor
    
    loop = asyncio.get_event_loop()
    # Execute in a thread pool to avoid blocking the main async event loop
    executor = ThreadPoolExecutor(max_workers=1)
    loop.run_in_executor(executor, run_simulation, 
        simulation_id, 
        params.timesteps, 
        params.disruptions.model_dump() if params.disruptions else None, 
        params.simulation_tick_delay,
        params.decision_mode
    )
    
    return format_response(
        status="success", 
        data=SimulationResponse(simulation_id=simulation_id, status="queued").model_dump()
    )

@router.get("/simulation/{id}/status", response_model=dict, status_code=status.HTTP_200_OK)
async def get_simulation_status(id: str, redis_client: redis.Redis = Depends(get_redis_client)):
    """Fetches the current realtime status of a simulation."""
    data = await redis_client.get(f"simulation:{id}")
    
    if not data:
        raise HTTPException(status_code=404, detail="Simulation not found")
        
    state = json.loads(data)
    
    response = SimulationStatusResponse(
        simulation_id=state["simulation_id"],
        status=state["status"],
        decision_mode=state.get("decision_mode", "human"),
        current_timestep=state.get("timestep"),
        total_timesteps=state.get("total_timesteps"),
        metrics=state
    )
    
    return format_response(status="success", data=response.model_dump())

@router.get("/simulation/{id}/metrics", response_model=dict, status_code=status.HTTP_200_OK)
async def get_simulation_metrics(id: str, redis_client: redis.Redis = Depends(get_redis_client)):
    """Fetches highly granular timestep metrics from Redis."""
    data = await redis_client.get(f"simulation:{id}")
    
    if not data:
        raise HTTPException(status_code=404, detail="Simulation not found")
        
    state = json.loads(data)
    
    response = SimulationMetricsResponse(
        simulation_id=state["simulation_id"],
        timestep=state.get("timestep", 0),
        decision_mode=state.get("decision_mode", "human"),
        total_inventory=state.get("total_inventory", 0.0),
        active_disruptions=state.get("active_disruptions", 0),
        risk_index=state.get("risk_index", 0.0),
        node_metrics=state.get("node_metrics"),
        ai_actions=state.get("ai_actions", [])
    )
    
    return format_response(status="success", data=response.model_dump())
