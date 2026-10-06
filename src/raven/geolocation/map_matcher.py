import logging
import json
import math
from typing import Dict, List, Optional
from shapely.geometry import Point, LineString, mapping
from shapely.ops import substring
import geopandas as gpd

logger = logging.getLogger(__name__)

class MapMatcher:
    def __init__(self, road_network):
        self.rn = road_network
        self.edges = self.rn.edges
        if self.edges is not None and not self.edges.empty:
            # Create a projected CRS for accurate distance calculations
            self.edges_proj = self.edges.to_crs(epsg=3857)
            self.sindex = self.edges_proj.sindex
        else:
            self.edges_proj = None
            self.sindex = None

    def get_nearest_edge(self, lat: float, lon: float, max_distance_meters: float = 15.0) -> Optional[str]:
        if self.sindex is None:
            return None
            
        pt = Point(lon, lat)
        pt_proj = gpd.GeoSeries([pt], crs="EPSG:4326").to_crs(epsg=3857).iloc[0]
        
        # Find nearest edges within buffer
        possible_matches_idx = list(self.sindex.intersection(pt_proj.buffer(max_distance_meters).bounds))
        if not possible_matches_idx:
            return None
            
        possible_matches = self.edges_proj.iloc[possible_matches_idx]
        distances = possible_matches.distance(pt_proj)
        
        min_idx = distances.idxmin()
        min_dist = distances[min_idx]
        
        if min_dist <= max_distance_meters:
            u, v, k = min_idx
            return f"{u}-{v}"
            
        return None

def subdivide_edge(geom: LineString, max_length_meters: float = 50.0) -> List[LineString]:
    """Subdivide a LineString into smaller segments based on max length in meters."""
    if geom is None or not isinstance(geom, LineString):
        return [geom]
        
    # Approximation: 1 degree latitude ~ 111,111 meters
    # This is a rough estimation for segmenting geometries in WGS84 without projecting back and forth repeatedly.
    max_length_deg = max_length_meters / 111111.0
    
    if geom.length <= max_length_deg:
        return [geom]
        
    segments = []
    current_dist = 0.0
    while current_dist < geom.length:
        end_dist = min(current_dist + max_length_deg, geom.length)
        seg = substring(geom, current_dist, end_dist)
        segments.append(seg)
        current_dist += max_length_deg
        
    return segments
