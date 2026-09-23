import yaml
from pydantic import BaseModel
from typing import Dict, List, Optional

class DetectionConfig(BaseModel):
    model_path: str
    confidence_threshold: float
    roi_polygon: Optional[List[List[float]]] = None

class VideoConfig(BaseModel):
    input_path: str
    output_path: str

class OutputConfig(BaseModel):
    evidence_dir: str
    detections_json: str
    report_json: str

class GPSConfig(BaseModel):
    simulated_route: str

class TrackingConfig(BaseModel):
    max_disappeared: int
    iou_threshold: float

class AppConfig(BaseModel):
    detection: DetectionConfig
    video: VideoConfig
    output: OutputConfig
    gps: GPSConfig
    tracking: TrackingConfig

def load_config(config_path: str = "configs/config.yaml") -> AppConfig:
    with open(config_path, "r") as f:
        config_dict = yaml.safe_load(f)
    return AppConfig(**config_dict)
