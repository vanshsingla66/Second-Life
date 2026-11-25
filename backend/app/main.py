import asyncio
from contextlib import asynccontextmanager

import httpx

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from . import config
from .cache import ReadCacheMiddleware
from .db import engine, init_db
from .routes import ai as ai_routes, auth, chats, listings, misc, swaps, wanted
from .seed import seed


async def _warm_cache() -> None:
    """Fetch the first screens once at startup so the first user doesn't wait on the database."""
    try:
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://warmup") as c:
            for url in ("/meta", "/insights", "/listings?sort=newest&page=1&page_size=12", "/wanted",
                        "/listings?sort=newest&page=2&page_size=12"):
                await c.get(url)
    except Exception:
        pass  # warming is best effort


@asynccontextmanager
async def lifespan(app: FastAPI):
    config.UPLOAD_DIR.mkdir(exist_ok=True)
    init_db()
    seed(engine)
    warm = asyncio.create_task(_warm_cache())
    ReadCacheMiddleware.rewarm = _warm_cache
    yield
    ReadCacheMiddleware.rewarm = None
    warm.cancel()


app = FastAPI(title="GREEN · Second Life API", version="1.0.0", lifespan=lifespan)

app.add_middleware(ReadCacheMiddleware)

# Bearer-token auth (no cookies), so a wildcard origin is safe and lets Expo web / LAN devices connect.
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

config.UPLOAD_DIR.mkdir(exist_ok=True)
app.mount("/uploads", StaticFiles(directory=config.UPLOAD_DIR), name="uploads")

app.include_router(misc.router)
app.include_router(auth.router)
app.include_router(auth.me_router)
app.include_router(listings.router)
app.include_router(wanted.router)
app.include_router(swaps.router)
app.include_router(ai_routes.router)
app.include_router(chats.router)
