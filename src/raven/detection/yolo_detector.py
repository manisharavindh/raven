import numpy as np
from typing import List
from ultralytics import YOLO

from .base import Detector
from .schemas import Detection, BoundingBox

class YOLODetector(Detector):
    """
    Object detector implementation using Ultralytics YOLO.
    """

    def __init__(self, model_path: str, confidence_threshold: float = 0.5):
        """
        Initialize the YOLO detector.

        Args:
            model_path: Path to the YOLO model file (e.g., 'yolov8n.pt').
            confidence_threshold: Minimum confidence score to consider a detection valid.
        """
        self.model = YOLO(model_path)
        self.confidence_threshold = confidence_threshold

    def detect(self, frame: np.ndarray, frame_number: int, timestamp: float) -> List[Detection]:
        """
        Process a single image frame and return a list of Detection objects.
        """
        results = self.model(frame, verbose=False, imgsz=1280)
        detections = []

        if not results:
            return detections

        result = results[0]
        boxes = result.boxes

        for box in boxes:
            conf = float(box.conf[0])
            if conf < self.confidence_threshold:
                continue

            # Extract coordinates (x1, y1, x2, y2)
            xyxy = box.xyxy[0].cpu().numpy()
            x1, y1, x2, y2 = map(int, xyxy)

            # Get class name
            cls_id = int(box.cls[0])
            raw_class_name = self.model.names[cls_id]
            
            # Map RDD2022 classes to readable strings
            rdd_mapping = {
                "D00": "Longitudinal Crack",
                "D10": "Transverse Crack",
                "D20": "Alligator Crack",
                "D40": "Pothole"
            }
            class_name = rdd_mapping.get(raw_class_name, raw_class_name)

            detection = Detection(
                class_name=class_name,
                confidence=conf,
                bbox=BoundingBox(x1=x1, y1=y1, x2=x2, y2=y2),
                frame_number=frame_number,
                timestamp=timestamp
            )
            detections.append(detection)

        return detections
