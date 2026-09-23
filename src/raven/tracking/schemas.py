from typing import List, Optional
from pydantic import BaseModel, Field

from src.raven.detection.schemas import BoundingBox

class GPSPosition(BaseModel):
    latitude: float
    longitude: float

class TrackedEvent(BaseModel):
    event_id: str
    class_name: str
    first_frame: int
    last_frame: int
    confidence_history: List[float] = Field(default_factory=list)
    bbox_history: List[BoundingBox] = Field(default_factory=list)
    gps_position: Optional[GPSPosition] = None
    evidence_path: Optional[str] = None
    status: str = "detected"
    timestamp: float = 0.0
    
    @property
    def current_confidence(self) -> float:
        if not self.confidence_history:
            return 0.0
        # return average or max? Max is good for "highest confidence detection"
        return max(self.confidence_history)
        
    @property
    def current_bbox(self) -> Optional[BoundingBox]:
        if not self.bbox_history:
            return None
        return self.bbox_history[-1]
