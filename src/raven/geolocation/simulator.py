import json
from typing import List, Optional
import logging

from src.raven.tracking.schemas import GPSPosition
from .gps import GPSProvider

logger = logging.getLogger(__name__)

class SimulatedGPSProvider(GPSProvider):
    """
    Simulates GPS positions by interpolating along a predefined route.
    """
    
    def __init__(self, route_file: str, total_video_duration: float = 300.0):
        self.route: List[GPSPosition] = []
        self.total_duration = total_video_duration
        
        try:
            with open(route_file, 'r') as f:
                data = json.load(f)
                for pt in data:
                    self.route.append(GPSPosition(latitude=pt['latitude'], longitude=pt['longitude']))
            logger.info(f"Loaded {len(self.route)} GPS waypoints from {route_file}")
        except Exception as e:
            logger.error(f"Failed to load GPS route from {route_file}: {e}")
            
    def get_position(self, timestamp: float) -> Optional[GPSPosition]:
        if not self.route:
            return None
            
        if len(self.route) == 1:
            return self.route[0]
            
        # Calculate progress
        progress = min(1.0, max(0.0, timestamp / self.total_duration))
        
        # We have N points, which means N-1 segments.
        num_segments = len(self.route) - 1
        segment_progress = progress * num_segments
        
        segment_index = int(segment_progress)
        if segment_index >= num_segments:
            return self.route[-1]
            
        t = segment_progress - segment_index
        
        p1 = self.route[segment_index]
        p2 = self.route[segment_index + 1]
        
        lat = p1.latitude + (p2.latitude - p1.latitude) * t
        lon = p1.longitude + (p2.longitude - p1.longitude) * t
        
        return GPSPosition(latitude=lat, longitude=lon)
