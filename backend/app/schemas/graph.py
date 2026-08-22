from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime, timezone
from enum import Enum

class NodeLabel(str, Enum):
    Warehouse = "Warehouse"
    Factory = "Factory"
    TransportHub = "TransportHub"
    Port = "Port"
    Customer = "Customer"
    Supplier = "Supplier"

class RelationshipType(str, Enum):
    SHIPS_TO = "SHIPS_TO"
    SUPPLIES = "SUPPLIES"
    CONNECTS_TO = "CONNECTS_TO"

class BaseGraphModel(BaseModel):
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class NodeCreate(BaseGraphModel):
    node_id: str
    label: NodeLabel
    name: str
    lat: Optional[float] = None
    lng: Optional[float] = None
    capacity: Optional[float] = None
    inventory: Optional[float] = None
    risk_score: Optional[float] = None
    delay_probability: Optional[float] = None

class NodeResponse(NodeCreate):
    pass

class EdgeCreate(BaseGraphModel):
    edge_id: str
    source_id: str
    target_id: str
    type: RelationshipType
    transit_time: Optional[float] = None
    cost: Optional[float] = None
    congestion: Optional[float] = None
    disruption_probability: Optional[float] = None

class EdgeResponse(EdgeCreate):
    pass

class GraphImport(BaseModel):
    nodes: List[NodeCreate]
    edges: List[EdgeCreate]
