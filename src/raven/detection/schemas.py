from typing import Dict
from pydantic import BaseModel

class BoundingBox(BaseModel):
    x1: int
    y1: int
    x2: int
    y2: int

class Detection(BaseModel):
    class_name: str
    confidence: float
    bbox: BoundingBox
    frame_number: int
    timestamp: float
