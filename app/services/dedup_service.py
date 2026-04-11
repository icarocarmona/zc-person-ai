import redis.asyncio as aioredis
import structlog
from app.config import get_settings

logger = structlog.get_logger(__name__)


class DedupService:
    def __init__(self) -> None:
        settings = get_settings()
        self._redis = aioredis.from_url(
            settings.redis_url,
            encoding="utf-8",
            decode_responses=True,
            socket_connect_timeout=5,
            socket_timeout=5,
            retry_on_timeout=True,
        )
        self._ttl = settings.dedup_ttl_seconds

    async def is_duplicate(self, key: str) -> bool:
        """
        Retorna True se o alerta já foi processado recentemente.
        Usa SET NX EX como operação atômica para evitar race conditions.
        """
        result = await self._redis.set(key, "1", nx=True, ex=self._ttl)
        # result é None quando a chave já existia (duplicata)
        is_dup = result is None
        if is_dup:
            logger.info("dedup.duplicate_detected", key=key)
        else:
            logger.info("dedup.new_alert", key=key, ttl_seconds=self._ttl)
        return is_dup

    async def reset(self, key: str) -> None:
        """Remove uma chave de dedup (útil para reprocessamento manual)."""
        await self._redis.delete(key)

    async def health_check(self) -> bool:
        try:
            return bool(await self._redis.ping())
        except Exception:
            return False

    async def close(self) -> None:
        await self._redis.aclose()
