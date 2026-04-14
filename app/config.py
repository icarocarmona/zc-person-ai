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
        json_file="runtime_config.json",
        json_file_encoding="utf-8",
    )

    # -------------------------------------------------------------------------
    # AI provider
    # -------------------------------------------------------------------------
    ai_api_key: str = Field(..., description="API key para o provedor de IA")
    ai_base_url: str = Field(default="https://api.openai.com/v1")
    ai_model: str = Field(default="gpt-4o")

    # -------------------------------------------------------------------------
    # Canal de notificação
    # -------------------------------------------------------------------------
    notification_channel: str = Field(
        default="whatsapp",
        description="Canal de notificação: 'whatsapp' ou 'telegram'",
    )

    # -------------------------------------------------------------------------
    # Evolution API / WhatsApp (opcionais quando canal = telegram)
    # -------------------------------------------------------------------------
    evolution_api_key: str = Field(default="", description="Chave da Evolution API")
    evolution_instance_name: str = Field(default="zabbix-alerts")
    evolution_base_url: str = Field(default="http://evolution-api:8080")
    whatsapp_destination_number: str = Field(
        default="",
        description="Número de destino com DDI, ex: 5511999999999",
    )

    # -------------------------------------------------------------------------
    # Telegram (opcionais quando canal = whatsapp)
    # -------------------------------------------------------------------------
    telegram_bot_token: str = Field(default="", description="Token do bot Telegram (BotFather)")
    telegram_chat_id: str = Field(default="", description="Chat ID do destino Telegram")

    # -------------------------------------------------------------------------
    # Redis
    # -------------------------------------------------------------------------
    redis_url: str = Field(default="redis://redis:6379/0")

    # -------------------------------------------------------------------------
    # Banco de configuração (bootstrap — lido do env, nunca do banco)
    # -------------------------------------------------------------------------
    config_database_url: str = Field(
        default="postgresql://agent:agent_secret@postgres-config/agent_config",
    )

    # -------------------------------------------------------------------------
    # Comportamento do agente
    # -------------------------------------------------------------------------
    log_level: str = Field(default="INFO")
    dedup_ttl_seconds: int = Field(default=1800, ge=60, le=86400)
    allowed_severities: list[str] = Field(default=["High", "Disaster"])

    # -------------------------------------------------------------------------
    # Zabbix (opcional — usado pela tela de integração Zabbix)
    # -------------------------------------------------------------------------
    zabbix_url: str = Field(default="", description="URL do Zabbix (ex: http://localhost:8090)")
    zabbix_api_user: str = Field(default="Admin", description="Usuário da API do Zabbix")
    zabbix_api_password: str = Field(default="", description="Senha da API do Zabbix")

    # -------------------------------------------------------------------------
    # AI System Prompt (vazio = usa o prompt padrão embutido em ai_service.py)
    # -------------------------------------------------------------------------
    system_prompt: str = Field(
        default="",
        description="Prompt customizado para o modelo de IA. Vazio = usa o padrão.",
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
        if not v:
            return v
        cleaned = re.sub(r"[^\d]", "", str(v))
        if cleaned and len(cleaned) < 10:
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
            _CsvAwareEnvSource(settings_cls),
            _SafeJsonConfigSource(settings_cls),
            _CsvAwareDotEnvSource(settings_cls),
        )


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
