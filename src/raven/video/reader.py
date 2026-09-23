import cv2
import logging
from typing import Generator, Tuple, Optional, Union
import numpy as np

logger = logging.getLogger(__name__)

class VideoReader:
    """
    Reads a video file or live camera safely and provides an iterator over its frames.
    """
    
    def __init__(self, source: Union[str, int]):
        self.source = source
        self.cap = cv2.VideoCapture(source)
        
        if not self.cap.isOpened():
            raise ValueError(f"Could not open video source: {source}")
            
        self.fps = self.cap.get(cv2.CAP_PROP_FPS)
        if self.fps <= 0:
            self.fps = 30.0 # Default fallback for webcams that report 0
            
        self.width = int(self.cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        self.height = int(self.cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        self.frame_count = int(self.cap.get(cv2.CAP_PROP_FRAME_COUNT))
        
        if self.frame_count <= 0:
            logger.info(f"Opened live camera {source}: {self.width}x{self.height} @ ~{self.fps}fps")
        else:
            logger.info(f"Opened video {source}: {self.width}x{self.height} @ {self.fps}fps ({self.frame_count} frames)")
        
    def __iter__(self) -> Generator[Tuple[int, float, np.ndarray], None, None]:
        """
        Yields (frame_number, timestamp, frame_array).
        Ignores corrupt frames up to a threshold, but stops if EOF is reached.
        """
        frame_number = 0
        consecutive_failures = 0
        max_failures = 10
        
        while self.cap.isOpened():
            ret, frame = self.cap.read()
            frame_number += 1
            
            if not ret:
                # Could be EOF or corrupt frame
                # OpenCV sometimes returns False for corrupt frames in the middle of a video
                if frame_number > self.frame_count:
                    # Expected EOF
                    break
                    
                consecutive_failures += 1
                logger.warning(f"Failed to read frame {frame_number}. "
                               f"Failure {consecutive_failures}/{max_failures}")
                
                if consecutive_failures >= max_failures:
                    logger.error(f"Too many consecutive failures ({max_failures}). Aborting read.")
                    break
                continue
                
            consecutive_failures = 0
            timestamp = frame_number / self.fps if self.fps > 0 else 0.0
            
            yield frame_number, timestamp, frame
            
    def release(self):
        self.cap.release()

    def __enter__(self):
        return self
        
    def __exit__(self, exc_type, exc_val, exc_tb):
        self.release()
