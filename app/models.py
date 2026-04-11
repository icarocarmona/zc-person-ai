from typing import Optional
from pydantic import BaseModel, Field


class ZabbixWebhookPayload(BaseModel):
    """
    Payload enviado pelo Zabbix via webhook media type.
    Todos os campos chegam como strings (interpolação de macros do Zabbix).
    """

    trigger_id: str = Field(..., alias="triggerId")
    trigger_name: str = Field(..., alias="triggerName")
    host: str = Field(..., alias="host")
    host_ip: Optional[str] = Field(default=None, alias="hostIp")
    severity: str = Field(..., alias="severity")
    description: str = Field(default="", alias="description")
    event_id: str = Field(..., alias="eventId")
    status: str = Field(..., alias="status")       # "PROBLEM" | "RESOLVED"
    timestamp: str = Field(..., alias="timestamp")
    item_name: Optional[str] = Field(default=None, alias="itemName")
    item_value: Optional[str] = Field(default=None, alias="itemValue")
    tags: Optional[str] = Field(default=None, alias="tags")
    url: Optional[str] = Field(default=None, alias="url")

    model_config = {"populate_by_name": True}

    @property
    def dedup_key(self) -> str:
        return f"dedup:{self.trigger_id}:{self.status}"


class DiagnosticReport(BaseModel):
    """Resultado estruturado da análise de IA."""

    problem_description: str
    probable_cause: str
    remediation_steps: list[str]
    priority: str           # "CRÍTICO" | "ALTO" | "MÉDIO"
    estimated_impact: str
    raw_text: str           # Mensagem formatada final para o WhatsApp
