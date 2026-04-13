from typing import Optional
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, field_validator
import re

from app.config_store import save_to_db, write_runtime_config

router = APIRouter(prefix="/api")

_SECRET_FIELDS = {"ai_api_key", "evolution_api_key"}


def _mask(value: str) -> str:
    if not value:
        return "***"
    visible = min(8, len(value) // 2)
    return value[:visible] + "***"


def _is_masked(value: str | None) -> bool:
    return value is not None and value.endswith("***")


class ConfigUpdateRequest(BaseModel):
    ai_api_key: Optional[str] = None
    ai_base_url: Optional[str] = None
    ai_model: Optional[str] = None
    evolution_api_key: Optional[str] = None
    evolution_instance_name: Optional[str] = None
    evolution_base_url: Optional[str] = None
    whatsapp_destination_number: Optional[str] = None
    redis_url: Optional[str] = None
    log_level: Optional[str] = None
    dedup_ttl_seconds: Optional[int] = None
    allowed_severities: Optional[list[str]] = None

    @field_validator("whatsapp_destination_number", mode="before")
    @classmethod
    def normalize_phone(cls, v: object) -> object:
        if v is None:
            return v
        cleaned = re.sub(r"[^\d]", "", str(v))
        if len(cleaned) < 10:
            raise ValueError("Número muito curto — inclua o DDI, ex: 5511999999999")
        return cleaned

    @field_validator("dedup_ttl_seconds")
    @classmethod
    def validate_ttl(cls, v: int | None) -> int | None:
        if v is not None and not (60 <= v <= 86400):
            raise ValueError("dedup_ttl_seconds deve estar entre 60 e 86400")
        return v

    @field_validator("log_level")
    @classmethod
    def validate_log_level(cls, v: str | None) -> str | None:
        if v is not None and v.upper() not in ("DEBUG", "INFO", "WARNING", "ERROR"):
            raise ValueError("log_level inválido")
        return v.upper() if v else v


@router.get("/config", summary="Retorna configuração atual (secrets mascarados)")
async def get_config(request: Request) -> dict:
    s = request.app.state.settings
    return {
        "ai_api_key": _mask(s.ai_api_key),
        "ai_base_url": s.ai_base_url,
        "ai_model": s.ai_model,
        "evolution_api_key": _mask(s.evolution_api_key),
        "evolution_instance_name": s.evolution_instance_name,
        "evolution_base_url": s.evolution_base_url,
        "whatsapp_destination_number": s.whatsapp_destination_number,
        "redis_url": s.redis_url,
        "log_level": s.log_level,
        "dedup_ttl_seconds": s.dedup_ttl_seconds,
        "allowed_severities": s.allowed_severities,
    }


@router.post("/config", summary="Salva configuração no banco e recarrega os serviços")
async def save_config(body: ConfigUpdateRequest, request: Request) -> dict:
    app = request.app
    current = app.state.settings.model_dump(
        exclude={"config_database_url"}
    )

    # Monta o dict final: começa com os valores atuais e sobrescreve com os enviados
    update: dict = {}
    for field, value in body.model_dump(exclude_none=True).items():
        # Campos secret com valor mascarado = não alterar
        if field in _SECRET_FIELDS and _is_masked(value):
            continue
        update[field] = value

    merged = {**current, **update}

    # Persiste no banco
    pool = app.state.db_pool
    try:
        await save_to_db(pool, merged)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Erro ao salvar no banco: {exc}")

    # Atualiza runtime_config.json e recarrega serviços
    write_runtime_config(merged)
    await app.state.reload_services()

    return {"status": "saved", "reloaded": True}
