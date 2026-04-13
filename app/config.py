import re
from functools import lru_cache
from typing import Any, Tuple, Type

from pydantic import Field, field_validator
from pydantic_settings import (
    BaseSettings,
    DotEnvSettingsSource,
    EnvSettingsSource,
    JsonConfigSettingsSource,
    PydanticBaseSettingsSource,
    SettingsConfigDict,
)


# ---------------------------------------------------------------------------
# Campos do tipo list[str] que vêm do .env como CSV (ex: High,Disaster).
# O EnvSettingsSource do Pydantic v2 tenta parsear como JSON e falha.
# As subclasses abaixo convertem o CSV para lista antes de entregar ao Pydantic.
# ---------------------------------------------------------------------------
_CSV_FIELDS = {"allowed_severities"}


class _CsvAwareEnvSource(EnvSettingsSource):
    def prepare_field_value(
        self, field_name: str, field: Any, value: Any, value_is_complex: bool
    ) -> Any:
        if field_name in _CSV_FIELDS and isinstance(value, str) and not value.strip().startswith("["):
            return [s.strip() for s in value.split(",") if s.strip()]
        return super().prepare_field_value(field_name, field, value, value_is_complex)


class _CsvAwareDotEnvSource(DotEnvSettingsSource):
    def prepare_field_value(
        self, field_name: str, field: Any, value: Any, value_is_complex: bool
    ) -> Any:
        if field_name in _CSV_FIELDS and isinstance(value, str) and not value.strip().startswith("["):
            return [s.strip() for s in value.split(",") if s.strip()]
        return super().prepare_field_value(field_name, field, value, value_is_complex)


class _SafeJsonConfigSource(JsonConfigSettingsSource):
    """Não quebra se runtime_config.json ainda não existe."""

    def __call__(self) -> dict[str, Any]:
        try:
            return super().__call__()
        except Exception:
            return {}


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
        # runtime_config.json é gerado pelo config_store a partir do banco.
        # Tem prioridade acima do .env (ver settings_customise_sources).
        json_file="runtime_config.json",
        json_file_encoding="utf-8",
    )

    # -------------------------------------------------------------------------
    # AI provider (OpenAI ou OpenRouter-compatible)
    # -------------------------------------------------------------------------
    ai_api_key: str = Field(..., description="API key para o provedor de IA")
    ai_base_url: str = Field(
        default="https://api.openai.com/v1",
        description="Base URL do provedor. OpenRouter: https://openrouter.ai/api/v1",
    )
    ai_model: str = Field(
        default="gpt-4o",
        description="Modelo. OpenRouter: openai/gpt-4o ou anthropic/claude-sonnet-4-5",
    )

    # -------------------------------------------------------------------------
    # Evolution API (WhatsApp gateway)
    # -------------------------------------------------------------------------
    evolution_api_key: str = Field(..., description="Chave de autenticação da Evolution API")
    evolution_instance_name: str = Field(
        default="zabbix-alerts",
        description="Nome da instância WhatsApp na Evolution API",
    )
    evolution_base_url: str = Field(
        default="http://evolution-api:8080",
        description="URL base da Evolution API (rede interna Docker)",
    )

    # -------------------------------------------------------------------------
    # WhatsApp destino
    # -------------------------------------------------------------------------
    whatsapp_destination_number: str = Field(
        ...,
        description="Número de destino com DDI, ex: 5511999999999",
    )

    # -------------------------------------------------------------------------
    # Redis
    # -------------------------------------------------------------------------
    redis_url: str = Field(default="redis://redis:6379/0")

    # -------------------------------------------------------------------------
    # Banco de configuração (bootstrap — sempre lido do env, nunca do banco)
    # -------------------------------------------------------------------------
    config_database_url: str = Field(
        default="postgresql://agent:agent_secret@postgres-config/agent_config",
        description="DSN do banco Postgres usado para persistir as configurações",
    )

    # -------------------------------------------------------------------------
    # Comportamento do agente
    # -------------------------------------------------------------------------
    log_level: str = Field(default="INFO")
    dedup_ttl_seconds: int = Field(default=1800, ge=60, le=86400)
    allowed_severities: list[str] = Field(
        default=["High", "Disaster"],
        description="Severidades a processar (vírgula no .env, lista no JSON)",
    )

    # -------------------------------------------------------------------------
    # Validators
    # -------------------------------------------------------------------------
    @field_validator("allowed_severities", mode="before")
    @classmethod
    def parse_severities(cls, v: object) -> list[str]:
        if isinstance(v, str):
            return [s.strip() for s in v.split(",") if s.strip()]
        return v  # type: ignore[return-value]

    @field_validator("whatsapp_destination_number", mode="before")
    @classmethod
    def normalize_phone(cls, v: str) -> str:
        cleaned = re.sub(r"[^\d]", "", str(v))
        if len(cleaned) < 10:
            raise ValueError("Número muito curto — inclua o DDI, ex: 5511999999999")
        return cleaned

    # -------------------------------------------------------------------------
    # Computed
    # -------------------------------------------------------------------------
    @property
    def evolution_send_text_url(self) -> str:
        return f"{self.evolution_base_url}/message/sendText/{self.evolution_instance_name}"

    # -------------------------------------------------------------------------
    # Source priority: env vars > runtime_config.json (banco) > .env
    # -------------------------------------------------------------------------
    @classmethod
    def settings_customise_sources(
        cls,
        settings_cls: Type[BaseSettings],
        init_settings: PydanticBaseSettingsSource,
        env_settings: PydanticBaseSettingsSource,
        dotenv_settings: PydanticBaseSettingsSource,
        file_secret_settings: PydanticBaseSettingsSource,
    ) -> Tuple[PydanticBaseSettingsSource, ...]:
        return (
            init_settings,
            _CsvAwareEnvSource(settings_cls),      # env vars (docker-compose overrides)
            _SafeJsonConfigSource(settings_cls),   # runtime_config.json gerado pelo banco
            _CsvAwareDotEnvSource(settings_cls),   # .env (fallback)
        )


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
