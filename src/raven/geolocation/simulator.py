import logging
import random
import math
from typing import Optional

from src.raven.tracking.schemas import GPSPosition
from src.raven.geolocation.gps import GPSProvider
from src.raven.geolocation.road_network import RoadNetwork

logger = logging.getLogger(__name__)

def add_gps_noise(lat: float, lon: float, std_dev_m: float, max_offset_m: float, seed_offset: int) -> tuple[float, float]:
    """
    Add random noise to GPS coordinates.
    """
    if std_dev_m <= 0:
        return lat, lon
        
    random.seed(seed_offset)
    dist = min(abs(random.gauss(0, std_dev_m)), max_offset_m)
    angle = random.uniform(0, 2 * math.pi)
    
    lat_offset = (dist * math.cos(angle)) / 111111.0
    lon_offset = (dist * math.sin(angle)) / (111111.0 * math.cos(math.radians(lat)))
    
    return lat + lat_offset, lon + lon_offset

class SyntheticRoadGPS(GPSProvider):
    """
    Simulates GPS positions by driving along real roads using OSMnx.
    """
    def __init__(self, config_dict=None):
        if config_dict is None:
            config_dict = {}
        
        sim_config = config_dict.get("simulation", {})
        self.city = sim_config.get("city", "Coimbatore, Tamil Nadu, India")
        self.seed = sim_config.get("seed", 42)
        
        speed_config = config_dict.get("speed", {})
        self.min_speed = speed_config.get("min_kmh", 20)
        self.max_speed = speed_config.get("max_kmh", 50)
        
        noise_config = config_dict.get("noise", {})
        self.noise_enabled = noise_config.get("enabled", True)
        self.noise_std = noise_config.get("standard_deviation_meters", 2.0)
        self.noise_max = noise_config.get("max_offset_meters", 5.0)
        
        rn_config = config_dict.get("road_network", {})
        cache_path = rn_config.get("cache_path", "data/maps/coimbatore_roads.graphml")
        network_type = rn_config.get("vehicle_network_type", "drive")
        
        self.road_network = RoadNetwork(city=self.city, cache_path=cache_path, network_type=network_type)
        self.route_nodes = self.road_network.get_random_route(seed=self.seed)
        self.segments = self.road_network.get_route_geometry(self.route_nodes)
        
        if not self.segments:
            logger.warning("Generated route has no segments.")
            self.total_length = 0
        else:
            # OSMnx length is in meters, geometry.length is in degrees
            self.total_length = sum(seg['length'] for seg in self.segments)
            logger.info(f"Initialized SyntheticRoadGPS with route of {len(self.segments)} segments, {self.total_length:.2f}m length.")
        
    def get_position(self, timestamp: float) -> Optional[GPSPosition]:
        if not self.segments:
            return None
            
        avg_speed_kmh = (self.min_speed + self.max_speed) / 2.0
        avg_speed_ms = avg_speed_kmh * (1000.0 / 3600.0)
        distance_travelled = timestamp * avg_speed_ms
        
        if distance_travelled >= self.total_length:
            last_seg = self.segments[-1]
            geom = last_seg['geometry']
            pt = geom.interpolate(1.0, normalized=True)
            return self._build_position(pt.y, pt.x, timestamp, avg_speed_kmh, last_seg, 1.0)
            
        current_dist = 0.0
        for seg in self.segments:
            seg_len = seg['length']
            if current_dist + seg_len >= distance_travelled:
                dist_on_seg = distance_travelled - current_dist
                fraction = dist_on_seg / seg_len if seg_len > 0 else 0
                geom = seg['geometry']
                pt = geom.interpolate(fraction, normalized=True)
                
                return self._build_position(pt.y, pt.x, timestamp, avg_speed_kmh, seg, fraction)
                
            current_dist += seg_len
            
        return None
        
    def _build_position(self, lat: float, lon: float, timestamp: float, speed: float, seg: dict, route_pos: float) -> GPSPosition:
        if self.noise_enabled:
            seed_offset = self.seed + int(timestamp * 100)
            lat, lon = add_gps_noise(lat, lon, self.noise_std, self.noise_max, seed_offset)
            
        return GPSPosition(
            latitude=lat,
            longitude=lon,
            timestamp=timestamp,
            speed_kmh=speed,
            heading=0.0,
            road_id=f"{seg['u']}-{seg['v']}",
            road_name=seg['name'],
            route_position=route_pos,
            city=self.city
        )

# For backward compatibility with any hardcoded imports
SimulatedGPSProvider = SyntheticRoadGPS
