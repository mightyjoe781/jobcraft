import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

from app.config import settings
from app.database import AsyncSessionLocal
from app.routers import auth as auth_router
from app.routers import resumes as resumes_router
from app.routers import tailor as tailor_router
from app.routers import ats as ats_router
from app.routers import skill_gaps as skill_gaps_router
from app.routers import dashboard as dashboard_router
from app.routers import cover_letters as cover_letters_router
from app.routers import applications as applications_router
from app.services.seed import seed_templates

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(_: FastAPI):
    async with AsyncSessionLocal() as db:
        await seed_templates(db)
    yield


app = FastAPI(
    title="JobCraft API",
    version="0.1.0",
    lifespan=lifespan,
    # S-13: disable default OpenAPI docs in production if needed
)


# S-13: Global exception handler — never return stack traces to clients
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    logger.exception("Unhandled exception on %s %s", request.method, request.url.path)
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})


# S-05: HTTP security headers middleware (HSTS added at deploy time when HTTPS is configured)
class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; "
            "script-src 'self'; "
            "style-src 'self' 'unsafe-inline'; "
            "img-src 'self' data:; "
            "connect-src 'self'"
        )
        return response


app.add_middleware(SecurityHeadersMiddleware)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router.router)
app.include_router(resumes_router.router)
app.include_router(tailor_router.router)
app.include_router(ats_router.router)
app.include_router(skill_gaps_router.router)
app.include_router(dashboard_router.router)
app.include_router(cover_letters_router.router)
app.include_router(applications_router.router)


@app.get("/health")
def health():
    return {"status": "ok"}
