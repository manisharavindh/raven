import json
import os
import logging
from typing import List, Optional

from src.raven.tracking.schemas import TrackedEvent
from src.raven.storage.database import RavenDatabase

logger = logging.getLogger(__name__)

class JSONStore:
    """
    Serializes tracked events to a structured JSON file
    AND writes them to the central SQLite database.

    The JSON file is kept for backward compatibility with the dashboard
    and any external tools that read it. The database is the source of truth.
    """
    
    def __init__(self, output_file: str, db: Optional[RavenDatabase] = None):
        self.output_file = output_file
        os.makedirs(os.path.dirname(os.path.abspath(self.output_file)), exist_ok=True)
        self.db = db or RavenDatabase()

    def save(
        self,
        events: List[TrackedEvent],
        model_name: str = "pretrained-yolo",
        session_id: Optional[str] = None,
        source_type: Optional[str] = None,
        source_path: Optional[str] = None
    ):
        """
        Saves events to both the JSON file and the database.
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
            
        # 1. Write legacy JSON file (dashboard reads this)
        with open(self.output_file, 'w') as f:
            json.dump(serialized_events, f, indent=2)

        # 2. Write to central database
        if session_id:
            self.db.save_detections(
                session_id=session_id,
                events=events,
                source_type=source_type or "unknown",
                source_path=source_path or "unknown",
                model_path=model_name
            )
            
        logger.info(f"Saved {len(serialized_events)} events to {self.output_file}")
