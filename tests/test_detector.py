import os
import cv2
import numpy as np
from src.raven.detection import YOLODetector
from src.raven.config import load_config

def test_yolo_detector():
    # Ensure models directory exists
    os.makedirs("models", exist_ok=True)
    
    # We will use yolov8n.pt which will be auto-downloaded by ultralytics to the current directory
    # if it doesn't exist. We specify confidence threshold.
    detector = YOLODetector("yolov8n.pt", confidence_threshold=0.25)
    
    # Create a dummy image (e.g. noise or simple shapes)
    # YOLO might not detect anything in pure noise, but it shouldn't crash.
    # To test actual detection, let's create an image with a car-like shape, 
    # but since this is just an architecture test, noise is fine.
    frame = np.random.randint(0, 255, (480, 640, 3), dtype=np.uint8)
    
    print("Running detector on dummy frame...")
    detections = detector.detect(frame, frame_number=1, timestamp=0.0)
    
    print(f"Detections found: {len(detections)}")
    for d in detections:
        print(d)
        
    assert isinstance(detections, list)
    print("Detector test passed successfully.")

if __name__ == "__main__":
    test_yolo_detector()
