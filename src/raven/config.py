import yaml
from pydantic import BaseModel, Field
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

class DatabaseConfig(BaseModel):
    db_path: str = "data/raven.db"

class GPSConfig(BaseModel):
    source: str = "synthetic_road"
    simulation: Dict = Field(default_factory=lambda: {
        "city": "Coimbatore, Tamil Nadu, India",
        "country": "India",
        "seed": 42
    })
    sampling_interval_seconds: float = 1.0
    speed: Dict = Field(default_factory=lambda: {"min_kmh": 20, "max_kmh": 50})
    noise: Dict = Field(default_factory=lambda: {
        "enabled": True,
        "standard_deviation_meters": 2.0,
        "max_offset_meters": 5.0
    })
    road_network: Dict = Field(default_factory=lambda: {
        "provider": "openstreetmap",
        "vehicle_network_type": "drive",
        "cache_path": "data/maps/coimbatore_roads.graphml"
    })

class TrackingConfig(BaseModel):
    max_disappeared: int
    iou_threshold: float

class AppConfig(BaseModel):
    detection: DetectionConfig
    video: VideoConfig
    output: OutputConfig
    gps: GPSConfig
    tracking: TrackingConfig
    database: DatabaseConfig = DatabaseConfig()

def load_config(config_path: str = "configs/config.yaml") -> AppConfig:
    with open(config_path, "r") as f:
        config_dict = yaml.safe_load(f)
    return AppConfig(**config_dict)
