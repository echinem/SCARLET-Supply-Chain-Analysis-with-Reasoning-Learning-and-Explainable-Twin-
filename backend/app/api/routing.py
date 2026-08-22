from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional

from app.services.ml_routing_service import predict_delay

router = APIRouter()

class DelayPredictionRequest(BaseModel):
    distance: float
    duration: float
    congestion: float
    demand: float
    from_degree: float
    to_degree: float
    from_centrality: float
    to_centrality: float

class DelayPredictionResponse(BaseModel):
    predicted_delay: float
    risk_level: str
    explanation: list

class RouteFeature(DelayPredictionRequest):
    route_index: int

class SimulateRequest(BaseModel):
    disruption_type: str
    routes: List[RouteFeature]
    weight: Optional[float] = 1.0

@router.post("/predict-delay", response_model=DelayPredictionResponse)
async def api_predict_delay(req: DelayPredictionRequest):
    try:
        res = predict_delay(req.model_dump())
        return res
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/simulate")
async def api_simulate_routing(req: SimulateRequest):
    """
    Applies a disruption to a set of alternative routes and recalculates delays/best route.
    """
    updated_delays = []
    best_route = None
    best_score = float('inf')
    
    for route in req.routes:
        # Apply disruptions
        route_data = route.model_dump()
        
        if req.disruption_type == "traffic_spike":
            route_data["congestion"] = min(1.0, route_data["congestion"] + 0.3)
        elif req.disruption_type == "warehouse_failure":
            route_data["congestion"] = min(1.0, route_data["congestion"] + 0.5)
        elif req.disruption_type == "demand_surge":
            route_data["demand"] = min(1.0, route_data["demand"] + 0.4)
            
        prediction = predict_delay(route_data)
        
        # Calculate Score: score = distance + (predicted_delay * weight)
        # Using route_data since it might not be changed for distance
        score = route_data["distance"] + (prediction["predicted_delay"] * req.weight)
        
        updated_delays.append({
            "route_index": route.route_index,
            "predicted_delay": prediction["predicted_delay"],
            "risk_level": prediction["risk_level"],
            "explanation": prediction["explanation"],
            "score": score,
            "new_congestion": route_data["congestion"],
            "new_demand": route_data["demand"]
        })
        
        if score < best_score:
            best_score = score
            best_route = route.route_index

    return {
        "status": "success",
        "data": {
            "updated_delays": updated_delays,
            "best_route_index": best_route
        }
    }
