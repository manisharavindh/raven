import os
import logging
import random
import osmnx as ox
from shapely.geometry import Point, LineString

logger = logging.getLogger(__name__)

class RoadNetwork:
    def __init__(self, city: str = "Coimbatore, Tamil Nadu, India", cache_path: str = "data/maps/coimbatore_roads.graphml", network_type: str = "drive"):
        self.city = city
        self.cache_path = cache_path
        self.network_type = network_type
        self.graph = None
        self.nodes = None
        self.edges = None
        
        self.load_network()
        
    def load_network(self):
        ox.settings.use_cache = True
        ox.settings.log_console = False
        
        if os.path.exists(self.cache_path):
            logger.info(f"Loading road network from cache: {self.cache_path}")
            try:
                self.graph = ox.load_graphml(self.cache_path)
                self.nodes, self.edges = ox.graph_to_gdfs(self.graph)
            except Exception as e:
                logger.error(f"Failed to load cached graph: {e}. Re-downloading...")
                self.graph = None
                
        if self.graph is None:
            logger.info(f"Downloading road network for {self.city}...")
            try:
                self.graph = ox.graph_from_place(self.city, network_type=self.network_type, simplify=True)
                self.nodes, self.edges = ox.graph_to_gdfs(self.graph)
                os.makedirs(os.path.dirname(self.cache_path), exist_ok=True)
                ox.save_graphml(self.graph, self.cache_path)
                logger.info(f"Saved road network to {self.cache_path}")
            except Exception as e:
                logger.error(f"Failed to download road network: {e}")
                raise
                
    def get_random_route(self, seed: int, min_length: int = 10, max_length: int = 50) -> list:
        """
        Generate a connected random route in the road network.
        Returns a list of node IDs.
        """
        random.seed(seed)
        nodes_list = list(self.graph.nodes())
        
        # Try to find a valid route
        for _ in range(100):
            start_node = random.choice(nodes_list)
            current_node = start_node
            route = [current_node]
            
            target_length = random.randint(min_length, max_length)
            
            for _ in range(target_length):
                neighbors = list(self.graph.successors(current_node))
                # Prevent immediate u-turns if possible
                if len(route) > 1:
                    neighbors = [n for n in neighbors if n != route[-2]]
                
                if not neighbors:
                    # Dead end, fallback to any neighbor
                    neighbors = list(self.graph.successors(current_node))
                    
                if not neighbors:
                    break
                    
                next_node = random.choice(neighbors)
                route.append(next_node)
                current_node = next_node
                
            if len(route) >= min_length:
                return route
                
        return route # fallback

    def get_route_geometry(self, route: list):
        """
        Convert a list of node IDs to a linestring geometry and metadata.
        Returns a list of edge dicts with geometry and metadata.
        """
        segments = []
        for u, v in zip(route[:-1], route[1:]):
            edge_data = self.graph.get_edge_data(u, v)
            if edge_data:
                data = edge_data[0]
                geometry = data.get('geometry')
                if geometry is None:
                    p_u = Point(self.graph.nodes[u]['x'], self.graph.nodes[u]['y'])
                    p_v = Point(self.graph.nodes[v]['x'], self.graph.nodes[v]['y'])
                    geometry = LineString([p_u, p_v])
                
                name = data.get('name', 'Unknown Road')
                if isinstance(name, list):
                    name = name[0]
                    
                osmid = data.get('osmid', '')
                if isinstance(osmid, list):
                    osmid = osmid[0]
                    
                segments.append({
                    'u': u,
                    'v': v,
                    'geometry': geometry,
                    'length': data.get('length', geometry.length),
                    'name': name,
                    'osmid': str(osmid)
                })
        return segments
