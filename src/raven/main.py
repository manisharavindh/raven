import argparse
import logging
import sys

from src.raven.config import load_config
from src.raven.detection.yolo_detector import YOLODetector
from src.raven.detection.segmenter import RoadSegmenter
from src.raven.video.reader import VideoReader
from src.raven.video.processor import VideoProcessor
from src.raven.tracking.tracker import Tracker
from src.raven.geolocation.simulator import SimulatedGPSProvider
from src.raven.evidence.capture import EvidenceCapture
from src.raven.storage.database import RavenDatabase
from src.raven.storage.json_store import JSONStore
from src.raven.reports.generator import ReportGenerator

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

def main():
    parser = argparse.ArgumentParser(description="RAVEN - Road Assessment & Visual Examination Network")
    parser.add_argument("--config", type=str, default="configs/config.yaml", help="Path to config file")
    parser.add_argument("--input", type=str, help="Path to input video")
    parser.add_argument("--output", type=str, help="Path to output video")
    parser.add_argument("--model", type=str, help="Path to model file")
    parser.add_argument("--camera", type=int, help="Camera index for live feed (overrides input video)")
    parser.add_argument("--confidence", type=float, help="Detection confidence threshold")
    parser.add_argument("--no-tracking", action="store_true", help="Disable tracking, GPS, and evidence")
    
    args = parser.parse_args()
    
    try:
        config = load_config(args.config)
    except FileNotFoundError:
        logger.error(f"Config file not found: {args.config}")
        sys.exit(1)
        
    input_source = args.camera if args.camera is not None else (args.input if args.input else config.video.input_path)
    output_path = args.output if args.output else config.video.output_path
    model_path = args.model if args.model else config.detection.model_path
    confidence = args.confidence if args.confidence is not None else config.detection.confidence_threshold

    # Determine source provenance
    if args.camera is not None:
        source_type = "live_camera"
        source_path = f"camera:{args.camera}"
    else:
        source_type = "video"
        source_path = str(input_source)
    
    logger.info("Initializing RAVEN Pipeline")
    logger.info(f"Input: {input_source}")
    logger.info(f"Model: {model_path} (thresh: {confidence})")

    # ---- Central Database ----
    db = RavenDatabase(db_path=config.database.db_path)

    # Create a session so every detection is tracked with full provenance
    config_snapshot = {
        "detection": config.detection.model_dump(),
        "video": config.video.model_dump(),
        "output": config.output.model_dump(),
        "tracking": config.tracking.model_dump(),
    }
    session_id = db.create_session(
        source_type=source_type,
        source_path=source_path,
        model_path=model_path,
        config_snapshot=config_snapshot
    )
    logger.info(f"Session: {session_id} | Source: {source_type} → {source_path}")
    
    try:
        detector = YOLODetector(model_path=model_path, confidence_threshold=confidence)
    except Exception as e:
        logger.error(f"Failed to initialize detector: {e}")
        db.finish_session(session_id, 0, 0, status="failed")
        sys.exit(1)
        
    tracker = None
    gps_provider = None
    evidence_capture = None
    json_store = JSONStore(config.output.detections_json, db=db)
    report_gen = ReportGenerator(config.output.report_json, db=db)
    
    if not args.no_tracking:
        logger.info("Initializing Tracker, GPS, and Evidence Capture")
        tracker = Tracker(
            max_disappeared=config.tracking.max_disappeared, 
            iou_threshold=config.tracking.iou_threshold
        )
        gps_provider = SimulatedGPSProvider(config.gps.model_dump())
        evidence_capture = EvidenceCapture(config.output.evidence_dir)
        
    road_segmenter = RoadSegmenter()
        
    processor = VideoProcessor(
        detector=detector, 
        output_path=output_path,
        tracker=tracker,
        gps_provider=gps_provider,
        evidence_capture=evidence_capture,
        road_segmenter=road_segmenter,
        json_store=json_store,
        report_gen=report_gen,
        session_id=session_id,
        source_type=source_type,
        source_path=source_path,
        model_path=model_path
    )
    
    frames_proc, det_count = 0, 0
    status = "completed"
    try:
        with VideoReader(input_source) as reader:
            frames_proc, det_count = processor.process(reader)
    except KeyboardInterrupt:
        logger.info("Live capture interrupted by user. Finalizing current events...")
        status = "interrupted"
    except ValueError as e:
        logger.error(f"Video reader error: {e}")
        db.finish_session(session_id, frames_proc, det_count, status="failed")
        sys.exit(1)
    except Exception as e:
        logger.error(f"Pipeline failed: {e}")
        db.finish_session(session_id, frames_proc, det_count, status="failed")
        sys.exit(1)
        
    logger.info(f"Pipeline finished successfully. Processed {frames_proc} frames with {det_count} detections.")
    
    # Final flush: save everything and close the session
    if tracker:
        completed_events = tracker.get_all_completed_events()
        json_store.save(
            completed_events,
            model_name=model_path,
            session_id=session_id,
            source_type=source_type,
            source_path=source_path
        )
        report_gen.generate(
            completed_events,
            frames_proc,
            session_id=session_id,
            source_type=source_type,
            source_path=source_path
        )
    else:
        # No tracker — still finalise the session
        db.finish_session(session_id, frames_proc, det_count, status=status)

if __name__ == "__main__":
    main()
