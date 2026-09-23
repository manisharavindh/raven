from abc import ABC, abstractmethod
from typing import Optional
from src.raven.tracking.schemas import GPSPosition

class GPSProvider(ABC):
    """
    Abstract interface for providing GPS coordinates.
    """
    @abstractmethod
    def get_position(self, timestamp: float) -> Optional[GPSPosition]:
        """
        Get the GPS position at a given timestamp.
        """
        pass
