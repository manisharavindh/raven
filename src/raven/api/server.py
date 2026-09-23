from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import subprocess
import signal
import os
import json
import time
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="RAVEN Control API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global state to track the pipeline subprocess
active_process = None

# Mount the evidence directory so the dashboard can load images
app.mount("/data/evidence", StaticFiles(directory="data/evidence"), name="evidence")

@app.get("/data/report.json")
async def get_report():
    try:
        with open("data/exports/report.json", "r") as f:
            return json.load(f)
    except FileNotFoundError:
        return {}

@app.get("/data/detections.json")
async def get_detections():
    try:
        with open("data/exports/detections.json", "r") as f:
            return json.load(f)
    except FileNotFoundError:
        return []

@app.post("/api/events/{event_id}/delete")
async def delete_event(event_id: str):
    try:
        with open("data/exports/detections.json", "r") as f:
            data = json.load(f)
        data = [event for event in data if event.get("event_id") != event_id]
        with open("data/exports/detections.json", "w") as f:
            json.dump(data, f, indent=2)
        return {"status": "deleted"}
    except Exception as e:
        logger.error(f"Error deleting event {event_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/events/{event_id}/clear")
async def clear_event(event_id: str):
    try:
        with open("data/exports/detections.json", "r") as f:
            data = json.load(f)
        for event in data:
            if event.get("event_id") == event_id:
                event["status"] = "cleared"
                break
        with open("data/exports/detections.json", "w") as f:
            json.dump(data, f, indent=2)
        return {"status": "cleared"}
    except Exception as e:
        logger.error(f"Error clearing event {event_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/live/start")
async def start_live_camera():
    global active_process
    
    if active_process and active_process.poll() is None:
        raise HTTPException(status_code=400, detail="Camera pipeline is already running.")
        
    try:
        # Start the pipeline as a subprocess
        # Using preexec_fn=os.setsid to create a process group so we can safely kill it
        env = os.environ.copy()
        env["PYTHONPATH"] = "src"
        
        # We run it without --display so it runs purely in the background if we want, 
        # but for now we'll just run the standard command which opens the window
        active_process = subprocess.Popen(
            ["python", "-m", "raven.main", "--camera", "0"],
            env=env,
            preexec_fn=os.setsid
        )
        return {"status": "started", "pid": active_process.pid}
    except Exception as e:
        logger.error(f"Failed to start pipeline: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/live/stop")
async def stop_live_camera():
    global active_process
    
    if not active_process or active_process.poll() is not None:
        return {"status": "not_running"}
        
    try:
        # Send SIGINT to gracefully stop and save JSONs
        os.killpg(os.getpgid(active_process.pid), signal.SIGINT)
        
        # Wait up to 5 seconds for it to finalize
        active_process.wait(timeout=5)
        
        return {"status": "stopped"}
    except subprocess.TimeoutExpired:
        # Force kill if it's stuck
        os.killpg(os.getpgid(active_process.pid), signal.SIGKILL)
        return {"status": "force_killed"}
    except Exception as e:
        logger.error(f"Error stopping pipeline: {e}")
        raise HTTPException(status_code=500, detail=str(e))
        
@app.get("/api/status")
async def get_status():
    global active_process
    is_running = active_process is not None and active_process.poll() is None
    return {"running": is_running}
