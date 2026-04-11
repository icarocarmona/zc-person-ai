import logging
import sys
from contextlib import asynccontextmanager
from typing import AsyncGenerator

import structlog
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.routers import webhook
from app.services.ai_service import AIService
from app.services.dedup_service import DedupService
from app.services.whatsapp_service import WhatsAppService


def configure_logging(log_level: str) -> None:
    structlog.configure(
        processors=[
            structlog.contextvars.merge_contextvars,
            structlog.processors.add_log_level,
            structlog.processors.TimeStamper(fmt="iso"),
            structlog.dev.ConsoleRenderer()
            if log_level == "DEBUG"
            else structlog.processors.JSONRenderer(),
        ],
        wrapper_class=structlog.make_filtering_bound_logger(
            getattr(logging, log_level.upper(), logging.INFO)
        ),
        context_class=dict,
        logger_factory=structlog.PrintLoggerFactory(file=sys.stdout),
        cache_logger_on_first_use=True,
    )


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    settings = get_settings()
    configure_logging(settings.log_level)

    log = structlog.get_logger(__name__)
    log.info("app.startup", model=settings.ai_model, ai_base_url=settings.ai_base_url)

    app.state.dedup_service = DedupService()
    app.state.ai_service = AIService()
    app.state.whatsapp_service = WhatsAppService()

    log.info("app.services_initialized")

    yield

    await app.state.dedup_service.close()
    log.info("app.shutdown")


def create_app() -> FastAPI:
    app = FastAPI(
        title="Zabbix Critical Alert Agent",
        description=(
            "Recebe alertas críticos do Zabbix, analisa com IA "
            "e envia diagnóstico via WhatsApp."
        ),
        version="1.0.0",
        lifespan=lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["GET", "POST"],
        allow_headers=["*"],
    )

    app.include_router(webhook.router, tags=["Webhook"])

    @app.get("/health", tags=["Health"], summary="Health check")
    async def health() -> dict:
        redis_ok = await app.state.dedup_service.health_check()
        return {
            "status": "healthy" if redis_ok else "degraded",
            "redis": "ok" if redis_ok else "error",
        }

    return app


app = create_app()
