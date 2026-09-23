import json
import os
import logging
from typing import List

from src.raven.tracking.schemas import TrackedEvent

logger = logging.getLogger(__name__)

class JSONStore:
    """
    Serializes tracked events to a structured JSON file.
    """
    
    def __init__(self, output_file: str):
        self.output_file = output_file
        os.makedirs(os.path.dirname(os.path.abspath(self.output_file)), exist_ok=True)
        
    def save(self, events: List[TrackedEvent], model_name: str = "pretrained-yolo"):
        """
        Saves the events to the JSON file.
        """
        serialized_events = []
        for event in events:
            # Format according to the spec
            evt_dict = {
                "event_id": event.event_id,
                "type": event.class_name,
                "confidence": round(event.current_confidence, 4),
                "first_frame": event.first_frame,
                "last_frame": event.last_frame,
                "latitude": event.gps_position.latitude if event.gps_position else None,
                "longitude": event.gps_position.longitude if event.gps_position else None,
                "evidence": event.evidence_path,
                "status": event.status,
                "model": model_name
            }
            serialized_events.append(evt_dict)
            
        with open(self.output_file, 'w') as f:
            json.dump(serialized_events, f, indent=2)
            
        logger.info(f"Saved {len(serialized_events)} events to {self.output_file}")
