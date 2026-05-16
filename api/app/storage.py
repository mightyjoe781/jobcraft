import os
import uuid
from abc import ABC, abstractmethod

from app.config import settings


class StorageBackend(ABC):
    @abstractmethod
    async def put(self, key: str, data: bytes) -> str:
        """Store data and return an opaque path string."""

    @abstractmethod
    async def get(self, path: str) -> bytes:
        """Retrieve data by opaque path."""

    @abstractmethod
    async def delete(self, path: str) -> None:
        pass

    @abstractmethod
    def url(self, path: str) -> str:
        """Return a URL that serves this file (for internal use only)."""


class LocalStorageBackend(StorageBackend):
    def __init__(self, root: str):
        self.root = root

    def _resolve(self, path: str) -> str:
        # path format: local://<key>
        key = path.removeprefix("local://")
        return os.path.join(self.root, key)

    async def put(self, key: str, data: bytes) -> str:
        full_path = os.path.join(self.root, key)
        os.makedirs(os.path.dirname(full_path), exist_ok=True)
        with open(full_path, "wb") as f:
            f.write(data)
        return f"local://{key}"

    async def get(self, path: str) -> bytes:
        with open(self._resolve(path), "rb") as f:
            return f.read()

    async def delete(self, path: str) -> None:
        try:
            os.remove(self._resolve(path))
        except FileNotFoundError:
            pass

    def url(self, path: str) -> str:
        return self._resolve(path)


def _make_backend() -> StorageBackend:
    if settings.storage_backend == "s3":
        raise NotImplementedError("S3 backend not yet implemented — set STORAGE_BACKEND=local")
    return LocalStorageBackend(settings.storage_local_root)


storage: StorageBackend = _make_backend()


def generate_key(prefix: str, ext: str) -> str:
    """Generate a unique storage key under a prefix."""
    return f"{prefix}/{uuid.uuid4().hex}{ext}"
