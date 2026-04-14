from fastapi import APIRouter, Request

from app.services.metrics_service import MetricsService

router = APIRouter()


def _metrics(request: Request) -> MetricsService:
    return request.app.state.metrics_service  # type: ignore[no-any-return]


@router.get("/metrics/pipeline", summary="Métricas por estágio do pipeline de alertas")
async def pipeline_metrics(request: Request) -> dict:
    svc = _metrics(request)
    return await svc.snapshot()
