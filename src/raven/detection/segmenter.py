import cv2
import numpy as np
import logging
from typing import Optional
from ultralytics import FastSAM

logger = logging.getLogger(__name__)

class RoadSegmenter:
    """
    Dynamically segments the drivable road surface using FastSAM.
    """
    
    def __init__(self, model_path: str = 'FastSAM-s.pt', conf: float = 0.4):
        logger.info(f"Initializing FastSAM Road Segmenter from {model_path}")
        self.model = FastSAM(model_path)
        self.conf = conf
        
    def get_road_mask(self, frame: np.ndarray) -> Optional[np.ndarray]:
        """
        Extracts the road mask by prompting FastSAM with a point at the bottom center.
        Returns a binary mask (uint8) of the same (H, W) as the frame, where 255 is road.
        """
        h, w = frame.shape[:2]
        
        # Prompt point: bottom center of the frame (highly likely to be the ego-lane road)
        prompt_points = [[w // 2, int(h * 0.90)]]
        
        # Run FastSAM with point prompt
        # We disable verbose logging to avoid spamming stdout during video processing
        results = self.model(
            frame, 
            points=prompt_points, 
            labels=[1], 
            conf=self.conf,
            verbose=False,
            device='cpu'
        )
        
        if not results or not results[0].masks:
            return None
            
        # Get the mask data (FastSAM with a single point prompt returns the best matching mask)
        mask_data = results[0].masks.data[0].cpu().numpy()
        
        # Resize mask back to original frame size (Ultralytics sometimes pads/resizes)
        mask = cv2.resize(mask_data, (w, h), interpolation=cv2.INTER_NEAREST)
        
        # Convert to uint8 binary mask (0 or 255)
        binary_mask = (mask > 0).astype(np.uint8) * 255
        
        # Fill in any small holes in the mask (like potholes themselves being excluded)
        kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (50, 50))
        binary_mask = cv2.morphologyEx(binary_mask, cv2.MORPH_CLOSE, kernel)
        
        return binary_mask
