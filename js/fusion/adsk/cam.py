# Manufacturing objects are not available to scripts; the module exists so that "import adsk.cam" works.
from .core import Base


class CAM(Base):
    @staticmethod
    def cast(obj):
        return None
