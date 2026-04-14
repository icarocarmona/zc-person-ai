"""
Pipeline metrics — contadores por estágio + timestamp do último evento.

Persistência em Redis:
  pipeline:count:{stage}:{YYYY-MM-DD}  → INCR (TTL 48h)
  pipeline:last:{stage}                → unix ts (TTL 7d)

Uso fail-open: qualquer erro de Redis é logado e ignorado — métricas nunca
devem bloquear o pipeline principal.
"""
from __future__ import annotations

import time
from datetime import datetime, timezone
from typing import Literal

import redis.asyncio as aioredis
import structlog

from app.config import get_settings

logger = structlog.get_logger(__name__)

Stage = Literal["received", "filtered", "deduplicated", "analyzed", "notified", "failed"]
STAGES: tuple[Stage, ...] = ("received", "filtered", "deduplicated", "analyzed", "notified", "failed")

_COUNT_TTL = 48 * 3600
_LAST_TTL = 7 * 24 * 3600


def _today() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


class MetricsService:
    def __init__(self) -> None:
        settings = get_settings()
        self._redis = aioredis.from_url(
            settings.redis_url,
            encoding="utf-8",
            decode_responses=True,
            socket_connect_timeout=3,
            socket_timeout=3,
            retry_on_timeout=True,
        )

    async def incr(self, stage: Stage) -> None:
        try:
            count_key = f"pipeline:count:{stage}:{_today()}"
            last_key = f"pipeline:last:{stage}"
            pipe = self._redis.pipeline()
            pipe.incr(count_key)
            pipe.expire(count_key, _COUNT_TTL)
            pipe.set(last_key, int(time.time()), ex=_LAST_TTL)
            await pipe.execute()
        except Exception as exc:
            logger.warning("metrics.incr_failed", stage=stage, error=str(exc))

    async def snapshot(self) -> dict:
        """Retorna contador-dia e last_event_at por estágio."""
        today = _today()
        try:
            pipe = self._redis.pipeline()
            for s in STAGES:
                pipe.get(f"pipeline:count:{s}:{today}")
                pipe.get(f"pipeline:last:{s}")
            results = await pipe.execute()
        except Exception as exc:
            logger.warning("metrics.snapshot_failed", error=str(exc))
            return {
                "stages": {s: {"count_today": 0, "last_event_at": None, "ok": False} for s in STAGES},
                "redis_ok": False,
            }

        stages: dict[str, dict] = {}
        for i, s in enumerate(STAGES):
            count_raw = results[i * 2]
            last_raw = results[i * 2 + 1]
            count = int(count_raw) if count_raw else 0
            last_ts = int(last_raw) if last_raw else None
            stages[s] = {
                "count_today": count,
                "last_event_at": (
                    datetime.fromtimestamp(last_ts, tz=timezone.utc).isoformat() if last_ts else None
                ),
                "ok": True,
            }
        return {"stages": stages, "redis_ok": True}

    async def close(self) -> None:
        await self._redis.aclose()
