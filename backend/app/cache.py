"""Tiny in-process read cache for public GET endpoints.

The database can be a network hop away (e.g. Supabase in another region), so repeated browsing would otherwise pay
for several round trips per screen. Public pages are cached for a few seconds and the whole cache is cleared on any
successful write, so users never see stale data after their own changes. User-specific endpoints are never cached.
"""
import asyncio
import time
from typing import Awaitable, Callable, Optional

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

TTL_SECONDS = 90
MAX_ENTRIES = 300
PUBLIC_PREFIXES = ("/listings", "/wanted", "/sellers", "/insights", "/meta")
PRIVATE_PATHS = ("/listings/mine", "/wanted/mine")
# POSTs that don't change any public data: signing in, live price suggestions, photo uploads, AI calls, chat messages.
NON_MUTATING_PREFIXES = ("/auth", "/price", "/uploads", "/ai", "/chats")


class ReadCacheMiddleware(BaseHTTPMiddleware):
    store: dict[str, tuple[float, int, bytes, str]] = {}
    # Set by the app at startup: refills the first screens in the background after a write clears the cache.
    rewarm: Optional[Callable[[], Awaitable[None]]] = None
    _rewarm_task: Optional[asyncio.Task] = None

    @classmethod
    def clear(cls) -> None:
        cls.store.clear()

    @staticmethod
    def _cacheable(path: str) -> bool:
        return path.startswith(PUBLIC_PREFIXES) and path not in PRIVATE_PATHS

    async def dispatch(self, request: Request, call_next):
        if request.method == "GET" and self._cacheable(request.url.path):
            key = f"{request.url.path}?{request.url.query}"
            hit = self.store.get(key)
            if hit and time.monotonic() - hit[0] < TTL_SECONDS:
                return Response(hit[2], status_code=hit[1], media_type=hit[3], headers={"X-Cache": "HIT"})
            response = await call_next(request)
            if response.status_code != 200:
                return response
            body = b"".join([chunk async for chunk in response.body_iterator])
            if len(self.store) >= MAX_ENTRIES:
                self.store.clear()
            media = response.headers.get("content-type", "application/json")
            self.store[key] = (time.monotonic(), 200, body, media)
            return Response(body, status_code=200, media_type=media, headers={"X-Cache": "MISS"})

        response = await call_next(request)
        if (request.method not in ("GET", "HEAD", "OPTIONS") and response.status_code < 400
                and not request.url.path.startswith(NON_MUTATING_PREFIXES)):
            self.clear()
            self._schedule_rewarm()
        return response

    @classmethod
    def _schedule_rewarm(cls) -> None:
        if cls.rewarm is None or (cls._rewarm_task and not cls._rewarm_task.done()):
            return
        cls._rewarm_task = asyncio.get_running_loop().create_task(cls.rewarm())
