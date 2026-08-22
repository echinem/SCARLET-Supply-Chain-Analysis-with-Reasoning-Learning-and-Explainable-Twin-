from pydantic import BaseModel, Field
from typing import Optional, Dict
from typing import Optional, Dict, List

class NodeFailure(BaseModel):
    node_id: str
    severity: float = Field(default=1.0, ge=0.0)

class EdgeDisruption(BaseModel):
    edge_id: str
    congestion_increase: float = Field(default=0.5, ge=0.0)

class DemandSpike(BaseModel):
    node_id: str
    demand_multiplier: float = Field(default=2.0, ge=1.0)

class CapacityReduction(BaseModel):
    node_id: str
    capacity_drop: float = Field(default=0.5, ge=0.0)

class DisruptionsConfig(BaseModel):
    node_failures: Optional[List[NodeFailure]] = None
    edge_disruptions: Optional[List[EdgeDisruption]] = None
    demand_spikes: Optional[List[DemandSpike]] = None
    capacity_reductions: Optional[List[CapacityReduction]] = None

class SimulationParams(BaseModel):
    timesteps: int = Field(default=30, gt=0, le=365)
    disruptions: Optional[DisruptionsConfig] = None
    simulation_tick_delay: float = Field(default=0.2, ge=0.0, le=2.0)
    decision_mode: str = Field(default="human", pattern="^(human|ai)$")

class SimulationResponse(BaseModel):
    simulation_id: str
    status: str

class SimulationStatusResponse(BaseModel):
    simulation_id: str
    status: str
    decision_mode: str
    current_timestep: Optional[int] = None
    total_timesteps: Optional[int] = None
    metrics: Optional[dict] = None

class SimulationMetricsResponse(BaseModel):
    simulation_id: str
    timestep: int
    decision_mode: str
    total_inventory: float
    active_disruptions: int
    risk_index: float
    node_metrics: Optional[Dict[str, dict]] = None
    ai_actions: Optional[List[dict]] = None
