from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.database import AsyncSessionLocal
from app.routers import auth as auth_router
from app.routers import resumes as resumes_router
from app.routers import tailor as tailor_router
from app.routers import ats as ats_router
from app.routers import skill_gaps as skill_gaps_router
from app.routers import dashboard as dashboard_router
from app.routers import cover_letters as cover_letters_router
from app.services.seed import seed_templates


@asynccontextmanager
async def lifespan(_: FastAPI):
    async with AsyncSessionLocal() as db:
        await seed_templates(db)
    yield


app = FastAPI(title="JobCraft API", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
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


@app.get("/health")
def health():
    return {"status": "ok"}
