import re
from functools import lru_cache
from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # AI provider (OpenAI or OpenRouter-compatible)
    ai_api_key: str = Field(..., description="API key for the AI provider")
    ai_base_url: str = Field(
        default="https://api.openai.com/v1",
        description="Base URL for AI provider. OpenRouter: https://openrouter.ai/api/v1",
    )
    ai_model: str = Field(
        default="gpt-4o",
        description="Model name. OpenRouter example: openai/gpt-4o",
    )

    # Evolution API (WhatsApp gateway)
    evolution_api_key: str = Field(..., description="Evolution API authentication key")
    evolution_instance_name: str = Field(
        default="zabbix-alerts",
        description="WhatsApp instance name registered in Evolution API",
    )
    evolution_base_url: str = Field(
        default="http://evolution-api:8080",
        description="Evolution API base URL (internal Docker network)",
    )

    # WhatsApp destination
    whatsapp_destination_number: str = Field(
        ...,
        description="Destination number with country code, e.g. 5511999999999",
    )

    # Redis
    redis_url: str = Field(default="redis://redis:6379/0")

    # App behaviour
    log_level: str = Field(default="INFO")
    dedup_ttl_seconds: int = Field(default=1800, ge=60, le=86400)
    allowed_severities: list[str] = Field(
        default=["High", "Disaster"],
        description="Comma-separated severities to process",
    )

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
            raise ValueError("WhatsApp number too short — include country code, e.g. 5511999999999")
        return cleaned

    @property
    def evolution_send_text_url(self) -> str:
        return f"{self.evolution_base_url}/message/sendText/{self.evolution_instance_name}"


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
