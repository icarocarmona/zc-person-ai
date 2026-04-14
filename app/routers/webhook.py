import time
import structlog
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import JSONResponse

from app.config import get_settings
from app.models import ZabbixWebhookPayload
from app.services.dedup_service import DedupService
from app.services.ai_service import AIService
from app.services.metrics_service import MetricsService

logger = structlog.get_logger(__name__)
router = APIRouter()


def _dedup(request: Request) -> DedupService:
    return request.app.state.dedup_service  # type: ignore[no-any-return]


def _ai(request: Request) -> AIService:
    return request.app.state.ai_service  # type: ignore[no-any-return]


def _metrics(request: Request) -> MetricsService:
    return request.app.state.metrics_service  # type: ignore[no-any-return]


def _notifier(request: Request):  # type: ignore[return]
    """Retorna o serviço de notificação correto baseado no canal configurado."""
    settings = get_settings()
    if settings.notification_channel == "telegram":
        return request.app.state.telegram_service
    return request.app.state.whatsapp_service


@router.post("/webhook/zabbix", summary="Recebe alertas críticos do Zabbix")
async def receive_zabbix_alert(
    payload: ZabbixWebhookPayload,
    dedup: DedupService = Depends(_dedup),
    ai: AIService = Depends(_ai),
    notifier=Depends(_notifier),
    metrics: MetricsService = Depends(_metrics),
) -> JSONResponse:
    start = time.monotonic()
    settings = get_settings()

    log = logger.bind(
        trigger_id=payload.trigger_id,
        event_id=payload.event_id,
        host=payload.host,
        severity=payload.severity,
        status=payload.status,
    )
    log.info("webhook.received")
    await metrics.incr("received")

    # 1. Filtro de severidade
    if payload.severity not in settings.allowed_severities:
        log.info("webhook.ignored", reason="severity_not_actionable", severity=payload.severity)
        await metrics.incr("filtered")
        return JSONResponse(
            status_code=200,
            content={
                "status": "ignored",
                "reason": f"severity '{payload.severity}' not in {settings.allowed_severities}",
            },
        )

    # 2. Deduplicação (fail-open: se o Redis cair, processa mesmo assim)
    dedup_key = payload.dedup_key
    try:
        if await dedup.is_duplicate(dedup_key):
            log.info("webhook.ignored", reason="duplicate", dedup_key=dedup_key)
            await metrics.incr("deduplicated")
            return JSONResponse(
                status_code=200,
                content={"status": "ignored", "reason": "duplicate within dedup window"},
            )
    except Exception as exc:
        log.warning("webhook.dedup_error_failopen", error=str(exc))

    # 3. Análise de IA (fail-open: usa mensagem básica se a IA falhar)
    try:
        log.info("webhook.ai_analysis_start")
        report = await ai.analyze_alert(payload)
        log.info("webhook.ai_analysis_complete", priority=report.priority)
    except Exception as exc:
        log.warning("webhook.ai_fallback", error=str(exc))
        report = ai.fallback_report(payload)
    await metrics.incr("analyzed")

    # 4. Envio de notificação (WhatsApp ou Telegram)
    channel = settings.notification_channel
    try:
        log.info("webhook.notification_send_start", channel=channel)
        result = await notifier.send_message(report.raw_text)
        log.info("webhook.notification_send_complete", channel=channel)
        await metrics.incr("notified")
    except Exception as exc:
        log.error("webhook.notification_send_failed", channel=channel, error=str(exc), exc_info=True)
        await metrics.incr("failed")
        raise HTTPException(status_code=502, detail=f"Notification send failed: {exc}")

    elapsed = round(time.monotonic() - start, 2)
    log.info("webhook.complete", elapsed_seconds=elapsed, channel=channel)

    # Extrai o message_id compatível com WhatsApp e Telegram
    notification_message_id = (
        result.get("key", {}).get("id")              # WhatsApp
        or result.get("result", {}).get("message_id")  # Telegram
    )

    return JSONResponse(
        status_code=200,
        content={
            "status": "processed",
            "trigger_id": payload.trigger_id,
            "event_id": payload.event_id,
            "priority": report.priority,
            "channel": channel,
            "notification_message_id": notification_message_id,
            "elapsed_seconds": elapsed,
        },
    )
