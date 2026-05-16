"""Thin async client for the tectonic latex sidecar."""
import httpx

from app.config import settings


async def render(tex: str) -> bytes:
    """Compile .tex source and return PDF bytes. Raises on compile error."""
    async with httpx.AsyncClient(timeout=90) as client:
        resp = await client.post(f"{settings.latex_service_url}/render", json={"tex": tex})
        if resp.status_code == 422:
            detail = resp.json().get("detail", {})
            raise ValueError(f"LaTeX compile error: {detail.get('stdout', '')[-2000:]}")
        resp.raise_for_status()
        return resp.content


async def compile_check(tex: str) -> dict:
    """Return {ok: bool, errors: list[str], raw_output: str}."""
    async with httpx.AsyncClient(timeout=90) as client:
        resp = await client.post(f"{settings.latex_service_url}/compile-check", json={"tex": tex})
        resp.raise_for_status()
        return resp.json()
