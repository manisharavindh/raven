import cv2
import logging
import os
from typing import List, Optional
import numpy as np

from src.raven.detection.base import Detector
from src.raven.detection.schemas import Detection
from src.raven.video.reader import VideoReader
from src.raven.tracking.tracker import Tracker
from src.raven.tracking.schemas import TrackedEvent
from src.raven.geolocation.gps import GPSProvider
from src.raven.evidence.capture import EvidenceCapture

logger = logging.getLogger(__name__)

class VideoProcessor:
    """
    Processes video frames through a Detector, Tracker, Geolocation and Evidence Capture.
    """
    def __init__(
        self, 
        detector: Detector, 
        output_path: str,
        tracker: Optional[Tracker] = None,
        gps_provider: Optional[GPSProvider] = None,
        evidence_capture: Optional[EvidenceCapture] = None,
        roi_polygon: Optional[List[List[float]]] = None
    ):
        self.detector = detector
        self.output_path = output_path
        self.tracker = tracker
        self.gps_provider = gps_provider
        self.evidence_capture = evidence_capture
        self.roi_polygon = roi_polygon
        
        # Ensure output directory exists
        os.makedirs(os.path.dirname(os.path.abspath(self.output_path)), exist_ok=True)
        
    def process(self, reader: VideoReader):
        """
        Process the entire video from the reader.
        """
        fourcc = cv2.VideoWriter_fourcc(*'mp4v')
        out = cv2.VideoWriter(self.output_path, fourcc, reader.fps, (reader.width, reader.height))
        
        if not out.isOpened():
            raise ValueError(f"Could not open VideoWriter for {self.output_path}")
            
        logger.info(f"Starting video processing. Output will be saved to {self.output_path}")
        
        processed_frames = 0
        total_detections = 0
        
        for frame_number, timestamp, frame in reader:
            # 1. Detection
            raw_detections = self.detector.detect(frame, frame_number, timestamp)
            
            # 1b. ROI Filtering
            detections = []
            if self.roi_polygon:
                # Convert relative polygon to absolute pixel coordinates
                h, w = frame.shape[:2]
                abs_polygon = np.array([
                    [int(pt[0] * w), int(pt[1] * h)] for pt in self.roi_polygon
                ], np.int32)
                
                for det in raw_detections:
                    # Check if the bottom-center of the bounding box is in the ROI
                    center_x = (det.bbox.x1 + det.bbox.x2) / 2.0
                    bottom_y = det.bbox.y2
                    
                    if cv2.pointPolygonTest(abs_polygon, (center_x, bottom_y), False) >= 0:
                        detections.append(det)
            else:
                detections = raw_detections

            total_detections += len(detections)
            
            # 2. Tracking & GPS & Evidence
            active_events = []
            if self.tracker:
                active_events = self.tracker.update(detections)
                
                # Fetch GPS for active events
                if self.gps_provider:
                    current_gps = self.gps_provider.get_position(timestamp)
                    for event in active_events:
                        event.gps_position = current_gps
                        
                # Capture evidence for mature events that don't have it yet
                if self.evidence_capture:
                    for event in active_events:
                        # Simple rule: if we've seen it for 3 frames and haven't captured evidence
                        if not event.evidence_path and len(event.confidence_history) >= 3:
                            event.evidence_path = self.evidence_capture.capture(frame, event)
            
            # 3. Annotation
            # Draw tracked events if available, otherwise raw detections
            if self.tracker:
                annotated_frame = self._annotate_tracked_events(frame, active_events)
            else:
                annotated_frame = self._annotate_frame(frame, detections)
                
            # Draw ROI if present
            if self.roi_polygon:
                h, w = frame.shape[:2]
                abs_polygon = np.array([
                    [int(pt[0] * w), int(pt[1] * h)] for pt in self.roi_polygon
                ], np.int32)
                cv2.polylines(annotated_frame, [abs_polygon], isClosed=True, color=(255, 0, 0), thickness=2)
            
            # 4. Write and Display
            out.write(annotated_frame)
            
            # Show live feed on display
            cv2.imshow("RAVEN Live Feed", annotated_frame)
            if cv2.waitKey(1) & 0xFF == ord('q'):
                logger.info("Live feed stopped by user (pressed 'q').")
                break
                
            processed_frames += 1
            
            if processed_frames % 30 == 0:
                if reader.frame_count <= 0:
                    logger.info(f"Processed {processed_frames} frames (LIVE)...")
                else:
                    logger.info(f"Processed {processed_frames}/{reader.frame_count} frames...")
                
        out.release()
        cv2.destroyAllWindows()
        logger.info(f"Processing complete. {processed_frames} frames processed. "
                    f"{total_detections} total raw detections.")
        
        # Log completed events if tracking
        if self.tracker:
            completed = self.tracker.get_all_completed_events()
            logger.info(f"Tracker finalized {len(completed)} unique defect events.")
            
        return processed_frames, total_detections
        
    def _annotate_tracked_events(self, frame: np.ndarray, events: List[TrackedEvent]) -> np.ndarray:
        annotated = frame.copy()
        
        for event in events:
            bbox = event.current_bbox
            if not bbox:
                continue
                
            cv2.rectangle(
                annotated,
                (bbox.x1, bbox.y1),
                (bbox.x2, bbox.y2),
                (0, 255, 0), # Green for tracked
                2
            )
            
            label = f"{event.event_id} | {event.class_name} {event.current_confidence:.2f}"
            (text_width, text_height), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.5, 1)
            
            cv2.rectangle(
                annotated,
                (bbox.x1, bbox.y1 - text_height - 5),
                (bbox.x1 + text_width, bbox.y1),
                (0, 255, 0),
                -1
            )
            
            cv2.putText(
                annotated,
                label,
                (bbox.x1, bbox.y1 - 5),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.5,
                (0, 0, 0),
                1
            )
            
        return annotated

    def _annotate_frame(self, frame: np.ndarray, detections: List[Detection]) -> np.ndarray:
        annotated = frame.copy()
        
        for det in detections:
            bbox = det.bbox
            cv2.rectangle(annotated, (bbox.x1, bbox.y1), (bbox.x2, bbox.y2), (0, 0, 255), 2)
            label = f"{det.class_name} {det.confidence:.2f}"
            (text_width, text_height), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.5, 1)
            cv2.rectangle(annotated, (bbox.x1, bbox.y1 - text_height - 5), (bbox.x1 + text_width, bbox.y1), (0, 0, 255), -1)
            cv2.putText(annotated, label, (bbox.x1, bbox.y1 - 5), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1)
            
        return annotated
