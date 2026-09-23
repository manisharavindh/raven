import cv2
import numpy as np
import os

def create_synthetic_video(output_path: str, width: int = 640, height: int = 480, fps: int = 30, duration_sec: int = 3):
    os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)
    fourcc = cv2.VideoWriter_fourcc(*'mp4v')
    out = cv2.VideoWriter(output_path, fourcc, fps, (width, height))
    
    frames = fps * duration_sec
    
    # We will simulate a road with a "defect" moving downwards (as if we're driving forward)
    for i in range(frames):
        # Create a grey road background
        frame = np.full((height, width, 3), (100, 100, 100), dtype=np.uint8)
        
        # Draw some "lane markings"
        cv2.line(frame, (width//2, 0), (width//2, height), (255, 255, 255), 5)
        
        # Calculate position of the "defect" (a dark patch)
        # It starts from top and moves to bottom
        progress = i / frames
        defect_y = int(progress * height)
        defect_x = width // 2 - 50
        
        # Draw defect
        cv2.circle(frame, (defect_x, defect_y), 30, (50, 50, 50), -1)
        
        # To make YOLO detect *something*, we can paste a known pattern or just accept 0 detections.
        # Here we just generate the synthetic frames.
        
        out.write(frame)
        
    out.release()
    print(f"Generated synthetic video at {output_path} ({frames} frames)")

if __name__ == "__main__":
    create_synthetic_video("data/input/road_video.mp4")
