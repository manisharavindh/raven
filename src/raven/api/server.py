from fastapi import FastAPI, HTTPException, Query, UploadFile, File, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import StreamingResponse
import os
import json
import glob
import time
import threading
import logging
import asyncio
from typing import Optional

from src.raven.config import load_config
from src.raven.storage.database import RavenDatabase
from src.raven.video.frame_buffer import FrameBuffer

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

# Central database instance
db = RavenDatabase()

# Mount the evidence directory so the dashboard can load images
os.makedirs("data/evidence", exist_ok=True)
app.mount("/data/evidence", StaticFiles(directory="data/evidence"), name="evidence")

# Mount the demo dataset directory
os.makedirs("data/demo", exist_ok=True)
app.mount("/demo", StaticFiles(directory="data/demo"), name="demo")


# ================================================================== #
#  Pipeline Runner — runs detection in a background thread
# ================================================================== #

class PipelineRunner:
    """
    Manages a single RAVEN pipeline running in a background thread.
    Exposes a FrameBuffer for MJPEG streaming to the dashboard.
    """

    def __init__(self):
        self.thread: Optional[threading.Thread] = None
        self.stop_event = threading.Event()
        self.frame_buffer = FrameBuffer()
        self._is_running = False
        self.source_type: Optional[str] = None
        self.source_path: Optional[str] = None
        self.session_id: Optional[str] = None
        self.status = "idle"        # idle | running | completed | failed | stopped
        self.error: Optional[str] = None
        self.frames_processed = 0
        self.detections_count = 0

    @property
    def is_running(self) -> bool:
        return self._is_running

    def start(self, input_source, source_type: str, source_path: str):
        if self._is_running:
            raise RuntimeError("Pipeline is already running")

        self.stop_event.clear()
        self.frame_buffer.clear()
        self.source_type = source_type
        self.source_path = source_path
        self.status = "running"
        self.error = None
        self.frames_processed = 0
        self.detections_count = 0
        self._is_running = True

        self.thread = threading.Thread(
            target=self._run,
            args=(input_source, source_type, source_path),
            daemon=True,
        )
        self.thread.start()

    def stop(self):
        if not self._is_running:
            return
        logger.info("Sending stop signal to pipeline...")
        self.stop_event.set()
        if self.thread and self.thread.is_alive():
            self.thread.join(timeout=15)
        self._is_running = False
        self.status = "stopped"
        self.frame_buffer.clear()

    def _run(self, input_source, source_type: str, source_path: str):
        """Executed inside the background thread."""
        # Late imports to keep the module light at import time
        from src.raven.detection.yolo_detector import YOLODetector
        from src.raven.detection.segmenter import RoadSegmenter
        from src.raven.video.reader import VideoReader
        from src.raven.video.processor import VideoProcessor
        from src.raven.tracking.tracker import Tracker
        from src.raven.geolocation.simulator import SimulatedGPSProvider
        from src.raven.evidence.capture import EvidenceCapture
        from src.raven.storage.json_store import JSONStore
        from src.raven.reports.generator import ReportGenerator

        try:
            config = load_config()
            run_db = RavenDatabase(db_path=config.database.db_path)

            model_path = config.detection.model_path
            confidence = config.detection.confidence_threshold

            # Create session
            config_snapshot = {
                "detection": config.detection.model_dump(),
                "video": config.video.model_dump(),
                "output": config.output.model_dump(),
                "tracking": config.tracking.model_dump(),
            }
            self.session_id = run_db.create_session(
                source_type=source_type,
                source_path=source_path,
                model_path=model_path,
                config_snapshot=config_snapshot,
            )
            logger.info(f"Pipeline session: {self.session_id}")

            detector = YOLODetector(
                model_path=model_path,
                confidence_threshold=confidence,
            )
            tracker = Tracker(
                max_disappeared=config.tracking.max_disappeared,
                iou_threshold=config.tracking.iou_threshold,
            )
            gps_provider = SimulatedGPSProvider(config.gps.model_dump())
            evidence_capture = EvidenceCapture(config.output.evidence_dir)
            json_store = JSONStore(config.output.detections_json, db=run_db)
            report_gen = ReportGenerator(config.output.report_json, db=run_db)
            road_segmenter = RoadSegmenter()

            output_path = config.video.output_path

            processor = VideoProcessor(
                detector=detector,
                output_path=output_path,
                tracker=tracker,
                gps_provider=gps_provider,
                evidence_capture=evidence_capture,
                road_segmenter=road_segmenter,
                json_store=json_store,
                report_gen=report_gen,
                session_id=self.session_id,
                source_type=source_type,
                source_path=source_path,
                model_path=model_path,
                frame_buffer=self.frame_buffer,
                headless=True,
                stop_event=self.stop_event,
            )

            with VideoReader(input_source) as reader:
                self.frames_processed, self.detections_count = processor.process(reader)

            # Final flush
            completed_events = tracker.get_all_completed_events()
            final_status = "stopped" if self.stop_event.is_set() else "completed"
            json_store.save(
                completed_events,
                model_name=model_path,
                session_id=self.session_id,
                source_type=source_type,
                source_path=source_path,
            )
            report_gen.generate(
                completed_events,
                self.frames_processed,
                session_id=self.session_id,
                source_type=source_type,
                source_path=source_path,
            )

            self.status = final_status
            logger.info(f"Pipeline finished: {self.status}")

        except Exception as e:
            self.error = str(e)
            self.status = "failed"
            logger.error(f"Pipeline failed: {e}", exc_info=True)
        finally:
            self._is_running = False
            # Keep last frame visible for a moment, then clear
            time.sleep(0.5)
            self.frame_buffer.clear()


# Global singleton
pipeline = PipelineRunner()


# ================================================================== #
#  MJPEG Video Feed
# ================================================================== #

@app.get("/api/feed")
async def video_feed():
    """
    MJPEG stream of annotated frames from the running pipeline.
    Connect with: <img src="/api/feed" />
    """
    def generate():
        while pipeline.is_running:
            jpeg = pipeline.frame_buffer.get_jpeg(quality=75)
            if jpeg:
                yield (
                    b"--frame\r\n"
                    b"Content-Type: image/jpeg\r\n\r\n" + jpeg + b"\r\n"
                )
            else:
                time.sleep(0.03)

    if not pipeline.is_running:
        raise HTTPException(status_code=204, detail="No pipeline running")

    return StreamingResponse(
        generate(),
        media_type="multipart/x-mixed-replace; boundary=frame",
    )


# ================================================================== #
#  Video file management
# ================================================================== #

VIDEO_EXTENSIONS = {".mp4", ".avi", ".mov", ".mkv", ".webm", ".m4v"}

@app.get("/api/videos")
async def list_videos():
    """List available video files in data/input/."""
    input_dir = "data/input"
    if not os.path.isdir(input_dir):
        return []

    videos = []
    for f in sorted(os.listdir(input_dir)):
        ext = os.path.splitext(f)[1].lower()
        if ext in VIDEO_EXTENSIONS:
            full_path = os.path.join(input_dir, f)
            size_bytes = os.path.getsize(full_path)
            videos.append({
                "filename": f,
                "path": full_path,
                "size_mb": round(size_bytes / (1024 * 1024), 1),
            })
    return videos


@app.post("/api/videos/upload")
async def upload_video(file: UploadFile = File(...)):
    """Upload a video file to data/input/."""
    if not file.filename:
        raise HTTPException(400, "No file provided")

    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in VIDEO_EXTENSIONS:
        raise HTTPException(400, f"Unsupported format: {ext}. Use: {VIDEO_EXTENSIONS}")

    os.makedirs("data/input", exist_ok=True)
    save_path = os.path.join("data/input", file.filename)

    content = await file.read()
    with open(save_path, "wb") as f:
        f.write(content)

    size_mb = round(len(content) / (1024 * 1024), 1)
    logger.info(f"Uploaded video: {file.filename} ({size_mb} MB)")
    return {"filename": file.filename, "path": save_path, "size_mb": size_mb}


# ================================================================== #
#  Pipeline control
# ================================================================== #

@app.post("/api/detect/start")
async def start_detection(video_path: str = Query(..., description="Path to video file")):
    """Start detection pipeline on a video file."""
    if pipeline.is_running:
        raise HTTPException(400, "A pipeline is already running. Stop it first.")

    if not os.path.isfile(video_path):
        raise HTTPException(404, f"Video not found: {video_path}")

    pipeline.start(
        input_source=video_path,
        source_type="video",
        source_path=video_path,
    )
    return {"status": "started", "source": video_path, "session_id": pipeline.session_id}


@app.post("/api/live/start")
async def start_live_camera(camera: int = Query(0, description="Camera index")):
    """Start live camera detection pipeline."""
    if pipeline.is_running:
        raise HTTPException(400, "A pipeline is already running. Stop it first.")

    pipeline.start(
        input_source=camera,
        source_type="live_camera",
        source_path=f"camera:{camera}",
    )
    return {"status": "started", "camera": camera, "session_id": pipeline.session_id}


@app.post("/api/live/stop")
@app.post("/api/detect/stop")
async def stop_pipeline():
    """Stop the currently running pipeline."""
    if not pipeline.is_running:
        return {"status": "not_running"}

    pipeline.stop()
    return {"status": "stopped"}


@app.get("/api/status")
async def get_status():
    """Current pipeline status."""
    return {
        "running": pipeline.is_running,
        "status": pipeline.status,
        "source_type": pipeline.source_type,
        "source_path": pipeline.source_path,
        "session_id": pipeline.session_id,
        "frames_processed": pipeline.frames_processed,
        "detections_count": pipeline.detections_count,
        "error": pipeline.error,
    }


# ================================================================== #
#  Legacy data endpoints (dashboard backward compat)
# ================================================================== #

@app.get("/data/report.json")
async def get_report():
    """Returns report from the latest session."""
    try:
        report = db.get_latest_report()
        if report:
            return report
        with open("data/exports/report.json", "r") as f:
            return json.load(f)
    except FileNotFoundError:
        return {}


@app.get("/data/detections.json")
async def get_detections():
    """Returns detections from the latest session."""
    try:
        detections = db.get_latest_detections()
        if detections:
            return [
                {
                    "event_id": d["event_id"],
                    "type": d["class_name"],
                    "confidence": d["confidence"],
                    "first_frame": d["first_frame"],
                    "last_frame": d["last_frame"],
                    "latitude": d["latitude"],
                    "longitude": d["longitude"],
                    "evidence": d["evidence_path"],
                    "status": d["status"],
                    "model": d["model_path"],
                    "source_type": d["source_type"],
                    "source_path": d["source_path"],
                    "detected_at": d["detected_at"],
                    "road_id": json.loads(d["extra"]).get("road_id") if d.get("extra") else None,
                    "road_name": json.loads(d["extra"]).get("road_name") if d.get("extra") else None,
                }
                for d in detections
            ]
        with open("data/exports/detections.json", "r") as f:
            return json.load(f)
    except FileNotFoundError:
        return []


# ================================================================== #
#  Purge all data
# ================================================================== #

@app.delete("/api/data/purge")
async def purge_all_data():
    """Wipe ALL data: database, JSON files, evidence images."""
    errors = []

    try:
        with db._transaction() as conn:
            conn.execute("DELETE FROM detections")
            conn.execute("DELETE FROM sessions")
        logger.info("Purged all rows from database")
    except Exception as e:
        errors.append(f"Database purge failed: {e}")

    for filepath in ["data/exports/detections.json", "data/exports/report.json"]:
        try:
            if os.path.exists(filepath):
                with open(filepath, "w") as f:
                    if filepath.endswith("detections.json"):
                        json.dump([], f)
                    else:
                        json.dump({}, f)
        except Exception as e:
            errors.append(f"Failed to clear {filepath}: {e}")

    try:
        evidence_dir = "data/evidence"
        if os.path.isdir(evidence_dir):
            for img_file in glob.glob(os.path.join(evidence_dir, "RAVEN-*.jpg")):
                os.remove(img_file)
            logger.info("Deleted all evidence images")
    except Exception as e:
        errors.append(f"Evidence cleanup failed: {e}")

    if errors:
        return {"status": "partial", "errors": errors}
    return {"status": "purged"}

# ================================================================== #
#  Map & GeoJSON endpoints
# ================================================================== #

map_network = None

@app.get("/api/map/roads")
async def get_map_roads():
    global map_network
    if map_network is None:
        try:
            from src.raven.geolocation.road_network import RoadNetwork
            map_network = RoadNetwork()
        except Exception as e:
            logger.error(f"Failed to load map network: {e}")
            raise HTTPException(500, "Failed to load road geometry")
            
    detections = db.get_latest_detections()
    
    # Hook up map matcher for real GPS data (if road_id is missing)
    map_matcher = None
    
    roads = {}
    for d in detections:
        extra = json.loads(d["extra"]) if d.get("extra") else {}
        road_id = extra.get("road_id")
        # If no road_id, OR if it's an old OSM Way ID (no dash), use MapMatcher
        if not road_id or "-" not in str(road_id):
            if map_matcher is None:
                from src.raven.geolocation.map_matcher import MapMatcher
                map_matcher = MapMatcher(map_network)
            
            # 15m threshold for map matching as requested
            road_id = map_matcher.get_nearest_edge(d["latitude"], d["longitude"], max_distance_meters=15.0)
            
            if not road_id:
                # Unmatched detection, skip for road damage layer
                continue
            
        if road_id not in roads:
            roads[road_id] = {
                "road_name": extra.get("road_name") or "Unknown Road",
                "detection_count": 0,
                "confidence_sum": 0.0,
                "severity_sum": 0.0,
                "event_ids": []
            }
            
        roads[road_id]["detection_count"] += 1
        roads[road_id]["confidence_sum"] += d["confidence"]
        roads[road_id]["event_ids"].append(d["event_id"])
        
        # Severity weights: low=1, medium=2, high=3, critical=4
        if d["class_name"].lower() == "pothole":
            weight = 4
        elif d["class_name"].lower().startswith("crack"):
            weight = 2
        else:
            weight = 1
            
        roads[road_id]["severity_sum"] += weight
        
    features = []
    if map_network.edges is not None:
        from src.raven.geolocation.map_matcher import subdivide_edge
        from shapely.geometry import mapping
        
        for road_id, stats in roads.items():
            avg_conf = stats["confidence_sum"] / stats["detection_count"]
            # density approximation: detection_count
            raw_score = stats["detection_count"] * avg_conf * (stats["severity_sum"] / stats["detection_count"])
            # normalized to 0-1
            damage_score = min(1.0, raw_score / 15.0)
            
            if damage_score < 0.2: damage_level = "healthy"
            elif damage_score < 0.4: damage_level = "low"
            elif damage_score < 0.6: damage_level = "moderate"
            elif damage_score < 0.8: damage_level = "high"
            else: damage_level = "severe"
            
            try:
                # Parse u-v
                if "-" in str(road_id):
                    parts = str(road_id).split("-")
                    if len(parts) >= 2:
                        u, v = int(parts[0]), int(parts[1])
                        
                        # Iterate through all keys (parallel edges) between u and v
                        # In osmnx MultiDiGraph, loc[(u, v)] returns a DataFrame of all keys
                        try:
                            edges_df = map_network.edges.loc[(u, v)]
                            for key, edge_data in edges_df.iterrows():
                                geom = edge_data.get("geometry")
                                if geom is not None:
                                    features.append({
                                        "type": "Feature",
                                        "properties": {
                                            "road_id": str(road_id),
                                            "road_name": stats["road_name"],
                                            "damage_score": damage_score,
                                            "damage_level": damage_level,
                                            "detection_count": stats["detection_count"],
                                            "event_ids": stats["event_ids"]
                                        },
                                        "geometry": mapping(geom)
                                    })
                        except KeyError:
                            pass
            except Exception as e:
                logger.error(f"Error extracting geometry for {road_id}: {e}")
                
    return {
        "type": "FeatureCollection",
        "features": features
    }


# ================================================================== #
#  Database-powered query endpoints
# ================================================================== #

@app.get("/api/sessions")
async def list_sessions():
    return db.get_all_sessions()

@app.get("/api/sessions/{session_id}")
async def get_session(session_id: str):
    session = db.get_session(session_id)
    if not session:
        raise HTTPException(404, "Session not found")
    return session

@app.get("/api/sessions/{session_id}/detections")
async def get_session_detections(session_id: str):
    session = db.get_session(session_id)
    if not session:
        raise HTTPException(404, "Session not found")
    return db.get_detections_for_session(session_id)

@app.get("/api/detections")
async def query_detections(
    source_type: Optional[str] = Query(None),
    class_name: Optional[str] = Query(None),
    limit: int = Query(1000),
):
    return db.get_all_detections(source_type=source_type, class_name=class_name, limit=limit)

@app.get("/api/stats")
async def get_stats():
    return db.get_summary_stats()


# ================================================================== #
#  Event actions
# ================================================================== #

@app.post("/api/events/{event_id}/delete")
async def delete_event(event_id: str):
    deleted = db.delete_detection(event_id)
    try:
        with open("data/exports/detections.json", "r") as f:
            data = json.load(f)
        data = [e for e in data if e.get("event_id") != event_id]
        with open("data/exports/detections.json", "w") as f:
            json.dump(data, f, indent=2)
    except Exception:
        pass
    if not deleted:
        raise HTTPException(404, "Event not found")
    return {"status": "deleted"}

@app.post("/api/events/{event_id}/clear")
async def clear_event(event_id: str):
    updated = db.update_detection_status(event_id, "cleared")
    try:
        with open("data/exports/detections.json", "r") as f:
            data = json.load(f)
        for e in data:
            if e.get("event_id") == event_id:
                e["status"] = "cleared"
                break
        with open("data/exports/detections.json", "w") as f:
            json.dump(data, f, indent=2)
    except Exception:
        pass
    if not updated:
        raise HTTPException(404, "Event not found")
    return {"status": "cleared"}


# ================================================================== #
#  WebSocket: Real-time Telemetry
# ================================================================== #

@app.websocket("/ws/telemetry")
async def ws_telemetry(websocket: WebSocket):
    """
    Push telemetry data (detections, report, pipeline status) to the
    dashboard in real time. Replaces the 500ms HTTP polling loop.

    The server sends JSON messages of the form:
        { "type": "telemetry", "detections": [...], "report": {...}, "status": {...} }

    Only sends when data has actually changed, minimizing bandwidth.
    """
    await websocket.accept()
    logger.info("WebSocket telemetry client connected")

    last_detections_hash = None
    last_report_hash = None
    last_status_hash = None

    try:
        while True:
            # Build current telemetry snapshot
            detections_payload = []
            report_payload = {}
            status_payload = {
                "running": pipeline.is_running,
                "status": pipeline.status,
                "source_type": pipeline.source_type,
                "source_path": pipeline.source_path,
                "session_id": pipeline.session_id,
                "frames_processed": pipeline.frames_processed,
                "detections_count": pipeline.detections_count,
                "error": pipeline.error,
            }

            # Detections
            try:
                detections = db.get_latest_detections()
                if detections:
                    detections_payload = [
                        {
                            "event_id": d["event_id"],
                            "type": d["class_name"],
                            "confidence": d["confidence"],
                            "first_frame": d["first_frame"],
                            "last_frame": d["last_frame"],
                            "latitude": d["latitude"],
                            "longitude": d["longitude"],
                            "evidence": d["evidence_path"],
                            "status": d["status"],
                            "model": d["model_path"],
                            "source_type": d["source_type"],
                            "source_path": d["source_path"],
                            "detected_at": d["detected_at"],
                            "road_id": json.loads(d["extra"]).get("road_id") if d.get("extra") else None,
                            "road_name": json.loads(d["extra"]).get("road_name") if d.get("extra") else None,
                        }
                        for d in detections
                    ]
                else:
                    try:
                        with open("data/exports/detections.json", "r") as f:
                            detections_payload = json.load(f)
                    except (FileNotFoundError, json.JSONDecodeError):
                        detections_payload = []
            except Exception:
                detections_payload = []

            # Report
            try:
                report = db.get_latest_report()
                if report:
                    report_payload = report
                else:
                    with open("data/exports/report.json", "r") as f:
                        report_payload = json.load(f)
            except (FileNotFoundError, json.JSONDecodeError):
                report_payload = {}

            # Check what changed
            det_hash = json.dumps(detections_payload, sort_keys=True)
            rep_hash = json.dumps(report_payload, sort_keys=True, default=str)
            stat_hash = json.dumps(status_payload, sort_keys=True)

            changes = {}
            if det_hash != last_detections_hash:
                changes["detections"] = detections_payload
                last_detections_hash = det_hash
            if rep_hash != last_report_hash:
                changes["report"] = report_payload
                last_report_hash = rep_hash
            if stat_hash != last_status_hash:
                changes["status"] = status_payload
                last_status_hash = stat_hash

            if changes:
                changes["type"] = "telemetry"
                await websocket.send_json(changes)

            # When pipeline is running, push faster for real-time feel
            interval = 0.3 if pipeline.is_running else 1.0
            await asyncio.sleep(interval)

    except WebSocketDisconnect:
        logger.info("WebSocket telemetry client disconnected")
    except Exception as e:
        logger.error(f"WebSocket telemetry error: {e}")
        try:
            await websocket.close()
        except Exception:
            pass


# ================================================================== #
#  WebSocket: Real-time Video Feed (Binary Frames)
# ================================================================== #

@app.websocket("/ws/feed")
async def ws_video_feed(websocket: WebSocket):
    """
    Push annotated video frames as binary JPEG data over WebSocket.
    
    Much more efficient than MJPEG:
    - No HTTP overhead per frame
    - Client controls backpressure naturally
    - Binary frames = smaller payload than base64
    - WebSocket compression can be negotiated
    
    The client renders frames to a <canvas> element for zero-flicker display.
    """
    await websocket.accept()
    logger.info("WebSocket video feed client connected")

    try:
        while True:
            if not pipeline.is_running:
                # Send a status message so client knows pipeline stopped
                await websocket.send_json({"type": "status", "running": False})
                await asyncio.sleep(1.0)
                continue

            # get_jpeg blocks on threading.Event, so we MUST run it in a threadpool
            # otherwise it freezes the FastAPI asyncio event loop!
            jpeg = await asyncio.to_thread(pipeline.frame_buffer.get_jpeg, 75)
            if jpeg:
                # Send binary frame directly — no base64 encoding overhead
                await websocket.send_bytes(jpeg)
            else:
                await asyncio.sleep(0.016)  # ~60fps max poll rate

    except WebSocketDisconnect:
        logger.info("WebSocket video feed client disconnected")
    except Exception as e:
        logger.error(f"WebSocket video feed error: {e}")
        try:
            await websocket.close()
        except Exception:
            pass
