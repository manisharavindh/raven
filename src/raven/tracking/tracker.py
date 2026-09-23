import math
from typing import List, Dict, Optional
import logging

from src.raven.detection.schemas import Detection, BoundingBox
from .schemas import TrackedEvent

logger = logging.getLogger(__name__)

class Tracker:
    """
    Robust IoU-based object tracker to group detections into events.
    """
    
    def __init__(self, max_disappeared: int = 10, iou_threshold: float = 0.3):
        self.next_event_id = 1
        self.max_disappeared = max_disappeared
        self.iou_threshold = iou_threshold
        
        # Currently active tracked events
        self.active_events: Dict[str, TrackedEvent] = {}
        # How many frames since we last saw this event
        self.disappeared_counts: Dict[str, int] = {}
        # Events that have matured and completed
        self.completed_events: List[TrackedEvent] = []

    def _calculate_iou(self, bbox1: BoundingBox, bbox2: BoundingBox) -> float:
        x_left = max(bbox1.x1, bbox2.x1)
        y_top = max(bbox1.y1, bbox2.y1)
        x_right = min(bbox1.x2, bbox2.x2)
        y_bottom = min(bbox1.y2, bbox2.y2)

        if x_right < x_left or y_bottom < y_top:
            return 0.0

        intersection_area = (x_right - x_left) * (y_bottom - y_top)
        bbox1_area = (bbox1.x2 - bbox1.x1) * (bbox1.y2 - bbox1.y1)
        bbox2_area = (bbox2.x2 - bbox2.x1) * (bbox2.y2 - bbox2.y1)
        
        iou = intersection_area / float(bbox1_area + bbox2_area - intersection_area + 1e-6)
        return iou

    def update(self, detections: List[Detection]) -> List[TrackedEvent]:
        """
        Update the tracker with new detections for the current frame.
        Returns a list of ALL currently active events.
        """
        if len(detections) == 0:
            # Increment disappeared for all active events
            for event_id in list(self.active_events.keys()):
                self.disappeared_counts[event_id] += 1
                if self.disappeared_counts[event_id] > self.max_disappeared:
                    self._deregister(event_id)
            return list(self.active_events.values())
        
        if len(self.active_events) == 0:
            for i, det in enumerate(detections):
                self._register(det)
        else:
            event_ids = list(self.active_events.keys())
            event_bboxes = [self.active_events[eid].current_bbox for eid in event_ids]
            input_bboxes = [det.bbox for det in detections]
            
            # IoU matrix
            iou_matrix = []
            for eb in event_bboxes:
                row = [self._calculate_iou(eb, ib) for ib in input_bboxes]
                iou_matrix.append(row)
                
            used_event_indices = set()
            used_input_indices = set()
            
            # Simple greedy matching based on highest IoU
            for _ in range(min(len(event_ids), len(detections))):
                max_iou = -1.0
                best_i, best_j = -1, -1
                
                for i in range(len(event_ids)):
                    if i in used_event_indices: continue
                    for j in range(len(detections)):
                        if j in used_input_indices: continue
                        if iou_matrix[i][j] > max_iou:
                            max_iou = iou_matrix[i][j]
                            best_i = i
                            best_j = j
                            
                if max_iou >= self.iou_threshold:
                    det = detections[best_j]
                    event_id = event_ids[best_i]
                    event = self.active_events[event_id]
                    
                    event.last_frame = det.frame_number
                    event.confidence_history.append(det.confidence)
                    event.bbox_history.append(det.bbox)
                    
                    self.disappeared_counts[event_id] = 0
                    used_event_indices.add(best_i)
                    used_input_indices.add(best_j)
                else:
                    break # No more good matches
            
            # Any event that wasn't matched gets its disappeared count incremented
            for i, event_id in enumerate(event_ids):
                if i not in used_event_indices:
                    self.disappeared_counts[event_id] += 1
                    if self.disappeared_counts[event_id] > self.max_disappeared:
                        self._deregister(event_id)
                        
            # Register new events for unmatched input detections
            for j, det in enumerate(detections):
                if j not in used_input_indices:
                    self._register(det)

        return list(self.active_events.values())

    def _register(self, detection: Detection):
        event_id = f"RAVEN-{self.next_event_id:05d}"
        self.next_event_id += 1
        
        event = TrackedEvent(
            event_id=event_id,
            class_name=detection.class_name,
            first_frame=detection.frame_number,
            last_frame=detection.frame_number,
            confidence_history=[detection.confidence],
            bbox_history=[detection.bbox],
            status="detected",
            timestamp=detection.timestamp
        )
        self.active_events[event_id] = event
        self.disappeared_counts[event_id] = 0

    def _deregister(self, event_id: str):
        # Move from active to completed
        event = self.active_events.pop(event_id)
        self.disappeared_counts.pop(event_id)
        
        # Increased robustness: only keep events that were seen for at least 5 frames
        if len(event.confidence_history) >= 5:
            self.completed_events.append(event)
        
    def get_all_completed_events(self) -> List[TrackedEvent]:
        # Flush any remaining active events to completed
        for event_id in list(self.active_events.keys()):
            self._deregister(event_id)
        return self.completed_events
