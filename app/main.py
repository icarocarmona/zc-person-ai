import logging
import os
import sys
from contextlib import asynccontextmanager
from pathlib import Path
from typing import AsyncGenerator

import structlog
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.config import get_settings
from app.config_store import ensure_runtime_config, load_from_db, write_runtime_config
from app.db import close_pool, create_pool, init_schema
from app.routers import webhook
from app.routers import config as config_router
from app.routers import status as status_router
from app.routers import prompt as prompt_router
from app.routers import zabbix as zabbix_router
from app.routers import metrics as metrics_router
from app.services.ai_service import AIService
from app.services.dedup_service import DedupService
from app.services.metrics_service import MetricsService
from app.services.whatsapp_service import WhatsAppService
from app.services.telegram_service import TelegramService
from app.services.telegram_bot import TelegramBotPoller


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


async def reload_services(app: FastAPI) -> None:
    """Re-cria os serviços com as configurações mais recentes do banco."""
    log = structlog.get_logger(__name__)
    try:
        if hasattr(app.state, "dedup_service"):
            await app.state.dedup_service.close()

        get_settings.cache_clear()

        new_settings = get_settings()
        configure_logging(new_settings.log_level)
        app.state.settings = new_settings
        app.state.dedup_service = DedupService()
        app.state.ai_service = AIService()
        app.state.whatsapp_service = WhatsAppService()
        app.state.telegram_service = TelegramService()

        log.info("app.services_reloaded", model=new_settings.ai_model, channel=new_settings.notification_channel)
    except Exception as exc:
        log.error("app.reload_failed", error=str(exc))
        raise


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    # 1. Conectar ao banco de configurações
    db_url = os.environ.get(
        "CONFIG_DATABASE_URL",
        "postgresql://agent:agent_secret@postgres-config/agent_config",
    )
    pool = await create_pool(db_url)
    await init_schema(pool)
    app.state.db_pool = pool

    # 2. Carregar config do banco → escrever runtime_config.json
    db_config = await load_from_db(pool)
    if db_config:
        write_runtime_config(db_config)
    else:
        ensure_runtime_config()

    # 3. Inicializar settings + serviços
    settings = get_settings()
    configure_logging(settings.log_level)

    log = structlog.get_logger(__name__)
    log.info(
        "app.startup",
        model=settings.ai_model,
        channel=settings.notification_channel,
        db_config_loaded=db_config is not None,
    )

    app.state.settings = settings
    app.state.dedup_service = DedupService()
    app.state.ai_service = AIService()
    app.state.whatsapp_service = WhatsAppService()
    app.state.telegram_service = TelegramService()
    app.state.metrics_service = MetricsService()
    app.state.reload_services = lambda: reload_services(app)

    log.info("app.services_initialized")

    # ── Telegram Bot Poller (bidirectional commands) ──────────────────────────
    bot_poller: TelegramBotPoller | None = None
    if settings.telegram_bot_token and settings.telegram_chat_id:
        bot_poller = TelegramBotPoller(
            settings.telegram_bot_token,
            settings.telegram_chat_id,
            redis_url=settings.redis_url,
        )
        bot_poller.attach(app)
        await bot_poller.start()
        app.state.telegram_bot = bot_poller
        log.info("app.telegram_bot_started", chat_id=settings.telegram_chat_id)
    else:
        log.info("app.telegram_bot_skipped", reason="token or chat_id not configured")

    yield

    if bot_poller:
        await bot_poller.stop()
    await app.state.dedup_service.close()
    await app.state.metrics_service.close()
    await close_pool(pool)
    log.info("app.shutdown")


def create_app() -> FastAPI:
    app = FastAPI(
        title="Zabbix Critical Alert Agent",
        description=(
            "Recebe alertas críticos do Zabbix, analisa com IA "
            "e envia diagnóstico via WhatsApp ou Telegram."
        ),
        version="2.0.0",
        lifespan=lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["GET", "POST"],
        allow_headers=["*"],
    )

    app.include_router(webhook.router, tags=["Webhook"])
    app.include_router(config_router.router, tags=["Config"])
    app.include_router(status_router.router, tags=["Status"])
    app.include_router(prompt_router.router, tags=["Prompt"])
    app.include_router(zabbix_router.router, tags=["Zabbix"])
    app.include_router(metrics_router.router, tags=["Metrics"])

    @app.get("/health", tags=["Health"], summary="Health check")
    async def health() -> dict:
        redis_ok = await app.state.dedup_service.health_check()
        return {
            "status": "healthy" if redis_ok else "degraded",
            "redis": "ok" if redis_ok else "error",
        }

    frontend_dist = Path(__file__).parent.parent / "frontend" / "dist"
    if frontend_dist.exists():
        app.mount("/", StaticFiles(directory=str(frontend_dist), html=True), name="frontend")

    return app


app = create_app()
