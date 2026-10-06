import pytest
from src.raven.geolocation.simulator import SyntheticRoadGPS
from src.raven.config import GPSConfig

def test_synthetic_road_gps():
    config = GPSConfig().model_dump()
    
    # We will use a smaller bounding box or mock to speed up tests, 
    # but here we test the real instantiation with cache
    gps = SyntheticRoadGPS(config)
    
    assert gps.total_length > 0
    assert len(gps.segments) > 0
    
    # Test getting points over time
    p1 = gps.get_position(0.0)
    assert p1 is not None
    assert p1.latitude > 0
    assert p1.longitude > 0
    assert p1.road_id is not None
    
    p2 = gps.get_position(10.0)
    assert p2 is not None
    
    # Check WGS84 bounds (Coimbatore is roughly 11 N, 76 E)
    assert 10.0 < p1.latitude < 12.0
    assert 76.0 < p1.longitude < 78.0

    # Ensure continuous movement
    assert p1.latitude != p2.latitude or p1.longitude != p2.longitude

def test_gps_noise():
    config = GPSConfig().model_dump()
    # disable noise
    config["noise"]["enabled"] = False
    gps_no_noise = SyntheticRoadGPS(config)
    
    # enable noise
    config["noise"]["enabled"] = True
    config["noise"]["standard_deviation_meters"] = 100.0
    gps_with_noise = SyntheticRoadGPS(config)
    
    p_clean = gps_no_noise.get_position(0.0)
    p_noisy = gps_with_noise.get_position(0.0)
    
    assert p_clean is not None and p_noisy is not None
    # Very small chance they match exactly with 100m std
    assert p_clean.latitude != p_noisy.latitude or p_clean.longitude != p_noisy.longitude

def test_reproducibility():
    config1 = GPSConfig().model_dump()
    config1["simulation"]["seed"] = 123
    
    config2 = GPSConfig().model_dump()
    config2["simulation"]["seed"] = 123
    
    gps1 = SyntheticRoadGPS(config1)
    gps2 = SyntheticRoadGPS(config2)
    
    p1 = gps1.get_position(5.0)
    p2 = gps2.get_position(5.0)
    
    assert p1.latitude == p2.latitude
    assert p1.longitude == p2.longitude
    assert p1.road_id == p2.road_id
