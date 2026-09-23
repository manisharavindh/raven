from abc import ABC, abstractmethod
from typing import List
import numpy as np
from .schemas import Detection

class Detector(ABC):
    """
    Model-agnostic abstract base class for object detectors.
    """

    @abstractmethod
    def detect(self, frame: np.ndarray, frame_number: int, timestamp: float) -> List[Detection]:
        """
        Process a single image frame and return a list of Detection objects.

        Args:
            frame: OpenCV image array (BGR format).
            frame_number: The sequential number of the frame in the video.
            timestamp: The timestamp of the frame in seconds.

        Returns:
            A list of Detection objects.
        """
        pass
