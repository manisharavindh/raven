from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field

class RoadSegment(BaseModel):
    road_id: str
    road_name: Optional[str] = None
    geometry: Any = Field(default=None, exclude=True)
    detection_count: int = 0
    weighted_damage_score: float = 0.0
    average_confidence: float = 0.0
    severity_score: float = 0.0
    last_detected: Optional[float] = None
