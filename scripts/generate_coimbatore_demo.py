import os
import json
import random
import datetime
import math
import argparse
import uuid
import logging
from pathlib import Path
import geopandas as gpd
from shapely.geometry import Point, LineString
import networkx as nx
import osmnx as ox

logging.basicConfig(level=logging.INFO, format='%(asctime)s [%(levelname)s] %(message)s')
logger = logging.getLogger("DemoGenerator")

def get_args():
    parser = argparse.ArgumentParser(description="Generate synthetic RAVEN demo dataset for Coimbatore")
    parser.add_argument("--seed", type=int, default=20261006)
    parser.add_argument("--vehicles", type=int, default=5)
    parser.add_argument("--routes", type=int, default=5)
    parser.add_argument("--city", type=str, default="Coimbatore, Tamil Nadu, India")
    parser.add_argument("--outdir", type=str, default="data/demo/coimbatore")
    return parser.parse_args()

def add_gps_noise(lat, lon, max_noise_m):
    dist = random.uniform(0, max_noise_m)
    angle = random.uniform(0, 2 * math.pi)
    lat_offset = (dist * math.cos(angle)) / 111111.0
    lon_offset = (dist * math.sin(angle)) / (111111.0 * math.cos(math.radians(lat)))
    return lat + lat_offset, lon + lon_offset

def generate():
    args = get_args()
    random.seed(args.seed)
    
    outdir = Path(args.outdir)
    outdir.mkdir(parents=True, exist_ok=True)
    
    logger.info(f"Downloading/Loading OSM network for {args.city}...")
    cache_path = Path("data/maps/coimbatore_roads.graphml")
    
    if cache_path.exists():
        G = ox.load_graphml(cache_path)
    else:
        G = ox.graph_from_place(args.city, network_type="drive", simplify=True)
        cache_path.parent.mkdir(parents=True, exist_ok=True)
        ox.save_graphml(G, cache_path)
        
    nodes, edges = ox.graph_to_gdfs(G)
    logger.info(f"Loaded {len(nodes)} nodes, {len(edges)} edges.")
    
    # Generate roads.geojson
    # For JSON serialization, clean up the data types
    edges_clean = edges.copy()
    
    # drop cols that are not json serializable (like osmid lists)
    cols_to_keep = ['geometry', 'name', 'highway', 'length', 'maxspeed', 'lanes', 'oneway']
    edges_clean = edges_clean[[c for c in cols_to_keep if c in edges_clean.columns]]
    edges_clean = edges_clean.reset_index()
    edges_clean['road_id'] = edges_clean.apply(lambda row: f"{row['u']}-{row['v']}", axis=1)
    
    # Fill NA to prevent JSON issues
    edges_clean = edges_clean.fillna("")
    
    roads_geojson = json.loads(edges_clean.to_json())
    with open(outdir / "roads.geojson", "w") as f:
        json.dump(roads_geojson, f)
    
    # Generate Routes
    logger.info(f"Generating {args.routes} routes...")
    node_list = list(nodes.index)
    
    routes = []
    for _ in range(args.routes):
        for _ in range(10): # try up to 10 times to find a valid route
            start = random.choice(node_list)
            end = random.choice(node_list)
            try:
                path = nx.shortest_path(G, start, end, weight='length')
                if len(path) > 10:
                    routes.append(path)
                    break
            except nx.NetworkXNoPath:
                continue
                
    # Generate Tracks and Detections
    vehicle_tracks = []
    detections = []
    
    defect_types = ["PTHL", "LONGITUDINAL CRACK", "TRANSVERSE CRACK", "ALLIGATOR CRACK", "OTHER CORRUPTION"]
    severity_levels = ["low", "moderate", "high", "severe"]
    
    base_time = datetime.datetime.now().replace(hour=9, minute=0, second=0, microsecond=0)
    
    aggregated_damage = {} # road_id -> {stats}
    
    logger.info("Simulating vehicle movement and synthetic detections...")
    for route_idx, path in enumerate(routes):
        v_id = f"RAVEN-DEMO-{route_idx+1:03d}"
        
        current_time = base_time + datetime.timedelta(minutes=random.randint(0, 60))
        frame_counter = 0
        fps = 30
        
        for i in range(len(path)-1):
            u = path[i]
            v = path[i+1]
            
            # get edge geometry
            edge_data = G.get_edge_data(u, v)[0]
            road_id = f"{u}-{v}"
            road_name = edge_data.get('name', 'Unknown Road')
            if isinstance(road_name, list): road_name = road_name[0]
            
            if 'geometry' in edge_data:
                geom = edge_data['geometry']
            else:
                geom = LineString([Point((nodes.loc[u]['x'], nodes.loc[u]['y'])), 
                                   Point((nodes.loc[v]['x'], nodes.loc[v]['y']))])
                
            length_m = edge_data.get('length', 50)
            # simulate 25km/h = ~7m/s
            speed_ms = random.uniform(5, 10)
            
            # interpolate points every 1 second
            time_spent = int(length_m / speed_ms)
            if time_spent < 1: time_spent = 1
            
            for t_offset in range(time_spent):
                fraction = t_offset / time_spent
                pt = geom.interpolate(fraction, normalized=True)
                
                # add to track
                track_point = {
                    "type": "Feature",
                    "properties": {
                        "vehicle_id": v_id,
                        "timestamp": current_time.isoformat(),
                        "speed_kmh": speed_ms * 3.6,
                        "road_id": road_id
                    },
                    "geometry": {
                        "type": "Point",
                        "coordinates": [pt.x, pt.y] # GeoJSON is lon, lat
                    }
                }
                vehicle_tracks.append(track_point)
                
                # generate detection? (15% chance per second)
                if random.random() < 0.15:
                    d_lat, d_lon = add_gps_noise(pt.y, pt.x, 3.0)
                    
                    # Randomize damage
                    prob = random.random()
                    if prob < 0.70:
                        sev = "low"
                    elif prob < 0.85:
                        sev = "moderate"
                    elif prob < 0.95:
                        sev = "high"
                    else:
                        sev = "severe"
                        
                    det = {
                        "event_id": f"RAVEN-DEMO-{uuid.uuid4().hex[:6].upper()}",
                        "dataset_type": "synthetic",
                        "vehicle_id": v_id,
                        "timestamp": current_time.isoformat(),
                        "latitude": d_lat,
                        "longitude": d_lon,
                        "type": random.choice(defect_types),
                        "confidence": random.uniform(0.55, 0.95),
                        "severity": sev,
                        "road_id": road_id,
                        "road_name": road_name,
                        "frame": frame_counter,
                        "source": "synthetic_demo"
                    }
                    detections.append(det)
                    
                    # Aggregate
                    if road_id not in aggregated_damage:
                        aggregated_damage[road_id] = {
                            "road_name": road_name,
                            "detection_count": 0,
                            "severity_sum": 0.0,
                            "event_ids": [],
                            "geometry": geom
                        }
                    
                    aggregated_damage[road_id]["detection_count"] += 1
                    aggregated_damage[road_id]["event_ids"].append(det["event_id"])
                    
                    weight = {"low": 1, "moderate": 2, "high": 3, "severe": 4}[sev]
                    aggregated_damage[road_id]["severity_sum"] += weight
                
                # advance time
                current_time += datetime.timedelta(seconds=1)
                frame_counter += fps

    # Generate road_damage.geojson
    logger.info("Aggregating road damage GeoJSON...")
    road_damage_features = []
    
    for rid, stats in aggregated_damage.items():
        avg_sev = stats["severity_sum"] / stats["detection_count"]
        
        if avg_sev < 1.5: dl = "low"
        elif avg_sev < 2.5: dl = "moderate"
        elif avg_sev < 3.5: dl = "high"
        else: dl = "severe"
        
        # cap score
        score = min(avg_sev / 4.0 + (stats["detection_count"] / 100.0), 1.0)
        
        feature = {
            "type": "Feature",
            "properties": {
                "road_id": rid,
                "road_name": stats["road_name"],
                "damage_score": score,
                "damage_level": dl,
                "detection_count": stats["detection_count"],
                "event_ids": stats["event_ids"]
            },
            "geometry": {
                "type": "LineString",
                "coordinates": list(stats["geometry"].coords)
            }
        }
        road_damage_features.append(feature)
        
    road_damage_geojson = {
        "type": "FeatureCollection",
        "features": road_damage_features
    }
    
    with open(outdir / "road_damage.geojson", "w") as f:
        json.dump(road_damage_geojson, f)
        
    # Write tracks
    vehicle_track_geojson = {
        "type": "FeatureCollection",
        "features": vehicle_tracks
    }
    with open(outdir / "vehicle_track.geojson", "w") as f:
        json.dump(vehicle_track_geojson, f)
        
    # Write detections
    with open(outdir / "detections.json", "w") as f:
        json.dump(detections, f)
        
    # Write metadata
    metadata = {
        "dataset_name": "RAVEN Coimbatore Synthetic Demo",
        "dataset_type": "synthetic",
        "city": args.city,
        "generated_at": datetime.datetime.now().isoformat(),
        "random_seed": args.seed,
        "vehicles": args.vehicles,
        "routes": args.routes,
        "detections": len(detections),
        "gps_points": len(vehicle_tracks),
        "warning": "This dataset contains synthetic detections and synthetic vehicle telemetry. Road geometry is based on OpenStreetMap data."
    }
    with open(outdir / "metadata.json", "w") as f:
        json.dump(metadata, f, indent=2)
        
    # Write dataset manifest
    manifest = {
        "id": "cbe-synthetic-demo",
        "name": "Coimbatore Synthetic Demo",
        "type": "synthetic",
        "files": {
            "roads": "roads.geojson",
            "road_damage": "road_damage.geojson",
            "detections": "detections.json",
            "vehicle_track": "vehicle_track.geojson",
            "metadata": "metadata.json"
        }
    }
    with open(outdir / "dataset.json", "w") as f:
        json.dump(manifest, f, indent=2)

    logger.info("========================================")
    logger.info(" RAVEN SYNTHETIC DATA GENERATOR")
    logger.info("========================================")
    logger.info(f"City: {args.city}")
    logger.info(f"Roads downloaded: {len(edges)}")
    logger.info(f"Vehicles/Routes: {args.routes}")
    logger.info(f"GPS points: {len(vehicle_tracks)}")
    logger.info(f"Synthetic detections: {len(detections)}")
    logger.info("Output:")
    logger.info(f"✓ {outdir}/roads.geojson")
    logger.info(f"✓ {outdir}/road_damage.geojson")
    logger.info(f"✓ {outdir}/detections.json")
    logger.info(f"✓ {outdir}/vehicle_track.geojson")
    logger.info(f"✓ {outdir}/metadata.json")
    logger.info(f"✓ {outdir}/dataset.json")

if __name__ == "__main__":
    generate()
