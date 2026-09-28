"""
Thread-safe frame buffer for sharing video frames between the
pipeline processing thread and the MJPEG streaming endpoint.
"""

import threading
import cv2
import numpy as np
import logging

logger = logging.getLogger(__name__)


class FrameBuffer:
    """
    A thread-safe single-frame buffer.

    The pipeline thread calls `put()` with each annotated frame.
    The MJPEG generator calls `get_jpeg()` to read the latest frame.
    """

    def __init__(self):
        self._frame: np.ndarray | None = None
        self._lock = threading.Lock()
        self._new_frame = threading.Event()

    def put(self, frame: np.ndarray):
        """Write a new frame (called from pipeline thread)."""
        with self._lock:
            self._frame = frame.copy()
        self._new_frame.set()

    def get(self, timeout: float = 1.0) -> np.ndarray | None:
        """Block until a new frame is available, then return it."""
        got = self._new_frame.wait(timeout=timeout)
        self._new_frame.clear()
        with self._lock:
            if self._frame is not None:
                return self._frame.copy()
        return None

    def get_jpeg(self, quality: int = 80) -> bytes | None:
        """Get the latest frame as JPEG bytes."""
        frame = self.get()
        if frame is None:
            return None
        _, jpeg = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, quality])
        return jpeg.tobytes()

    def clear(self):
        """Clear the buffer (called when pipeline stops)."""
        with self._lock:
            self._frame = None
        self._new_frame.clear()
