import cv2
import os
import numpy as np
import logging

from src.raven.tracking.schemas import TrackedEvent

logger = logging.getLogger(__name__)

class EvidenceCapture:
    """
    Captures visual evidence for tracked events.
    """
    
    def __init__(self, evidence_dir: str):
        self.evidence_dir = evidence_dir
        os.makedirs(self.evidence_dir, exist_ok=True)
        
    def capture(self, frame: np.ndarray, event: TrackedEvent) -> str:
        """
        Saves a frame as evidence for the event.
        Returns the path to the saved image.
        """
        if not event.current_bbox:
            return ""
            
        annotated = frame.copy()
        bbox = event.current_bbox
        
        # Draw bounding box
        cv2.rectangle(
            annotated,
            (bbox.x1, bbox.y1),
            (bbox.x2, bbox.y2),
            (0, 0, 255),
            2
        )
        
        # Draw text: Event ID, Class, Confidence
        label = f"{event.event_id} | {event.class_name} {event.current_confidence:.2f}"
        
        (text_width, text_height), baseline = cv2.getTextSize(
            label, cv2.FONT_HERSHEY_SIMPLEX, 0.5, 1
        )
        
        cv2.rectangle(
            annotated,
            (bbox.x1, bbox.y1 - text_height - 5),
            (bbox.x1 + text_width, bbox.y1),
            (0, 0, 255),
            -1
        )
        
        cv2.putText(
            annotated,
            label,
            (bbox.x1, bbox.y1 - 5),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.5,
            (255, 255, 255),
            1
        )
        
        filename = f"{event.event_id}.jpg"
        filepath = os.path.join(self.evidence_dir, filename)
        
        cv2.imwrite(filepath, annotated)
        logger.debug(f"Captured evidence for {event.event_id} at {filepath}")
        
        return filepath
