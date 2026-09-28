import json
import os
import logging
from typing import List, Optional
import datetime
import uuid

from src.raven.tracking.schemas import TrackedEvent
from src.raven.storage.database import RavenDatabase

logger = logging.getLogger(__name__)

class ReportGenerator:
    """
    Generates an aggregate JSON summary report for a video survey session.
    Also finalises the session in the central database.
    """
    
    def __init__(self, output_file: str, db: Optional[RavenDatabase] = None):
        self.output_file = output_file
        os.makedirs(os.path.dirname(os.path.abspath(self.output_file)), exist_ok=True)
        self.db = db or RavenDatabase()
        
    def generate(
        self,
        events: List[TrackedEvent],
        total_frames: int,
        session_id: Optional[str] = None,
        source_type: Optional[str] = None,
        source_path: Optional[str] = None
    ):
        """
        Generates and saves the report.
        """
        survey_id = session_id or f"SURVEY-{uuid.uuid4().hex[:8].upper()}"
        
        # Calculate statistics
        total_defects = len(events)
        
        breakdown = {}
        total_confidence = 0.0
        
        for event in events:
            if event.class_name not in breakdown:
                breakdown[event.class_name] = 0
            breakdown[event.class_name] += 1
            total_confidence += event.current_confidence
            
        avg_confidence = total_confidence / total_defects if total_defects > 0 else 0.0
        
        report_dict = {
            "survey_id": survey_id,
            "source_type": source_type or "unknown",
            "source_path": source_path or "unknown",
            "timestamp": datetime.datetime.now().isoformat(),
            "surveyed_frames": total_frames,
            "total_defects": total_defects,
            "average_confidence": round(avg_confidence, 4),
            "breakdown": breakdown
        }
        
        # 1. Write legacy JSON report
        with open(self.output_file, 'w') as f:
            json.dump(report_dict, f, indent=2)

        # 2. Finalise session in the database
        if session_id:
            self.db.finish_session(
                session_id=session_id,
                total_frames=total_frames,
                total_detections=total_defects,
                status="completed"
            )
            
        logger.info(f"Generated report {survey_id} to {self.output_file}")
