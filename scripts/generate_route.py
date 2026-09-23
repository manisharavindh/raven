import json
import math

start_lat = 11.0168
start_lon = 76.9558

route = []
for i in range(100):
    # Make it curve smoothly like a road going northeast
    lat = start_lat + (i * 0.0001) + (math.sin(i / 10.0) * 0.0002)
    lon = start_lon + (i * 0.00015) + (math.cos(i / 15.0) * 0.0001)
    route.append({"latitude": round(lat, 6), "longitude": round(lon, 6)})

with open("data/simulated/route.json", "w") as f:
    json.dump(route, f, indent=2)

print("Generated 100 GPS waypoints for simulated road.")
