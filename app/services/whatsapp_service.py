import httpx
import structlog
from tenacity import (
    retry,
    stop_after_attempt,
    wait_exponential,
    retry_if_exception_type,
)
from app.config import get_settings

logger = structlog.get_logger(__name__)


class WhatsAppService:
    def __init__(self) -> None:
        settings = get_settings()
        self._base_url = settings.evolution_base_url
        self._api_key = settings.evolution_api_key
        self._instance = settings.evolution_instance_name
        self._destination = settings.whatsapp_destination_number
        self._timeout = httpx.Timeout(30.0, connect=10.0)

    def _headers(self) -> dict:
        return {
            "apikey": self._api_key,
            "Content-Type": "application/json",
        }

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=2, max=15),
        retry=retry_if_exception_type((httpx.TimeoutException, httpx.ConnectError)),
        reraise=True,
    )
    async def send_message(self, message: str, number: str | None = None) -> dict:
        """
        Envia mensagem de texto via Evolution API v2.

        Endpoint: POST /message/sendText/{instanceName}
        Body: {"number": "5511999999999", "text": "mensagem"}
        """
        destination = number or self._destination
        url = f"{self._base_url}/message/sendText/{self._instance}"

        logger.info(
            "whatsapp.send_start",
            instance=self._instance,
            destination=destination,
            message_length=len(message),
        )

        async with httpx.AsyncClient(timeout=self._timeout) as client:
            response = await client.post(
                url,
                json={"number": destination, "text": message},
                headers=self._headers(),
            )
            response.raise_for_status()
            result: dict = response.json()

        logger.info(
            "whatsapp.send_success",
            instance=self._instance,
            destination=destination,
            message_id=result.get("key", {}).get("id", "unknown"),
        )
        return result

    async def instance_status(self) -> dict:
        """Verifica se a instância WhatsApp está conectada."""
        url = f"{self._base_url}/instance/connectionState/{self._instance}"
        async with httpx.AsyncClient(timeout=self._timeout) as client:
            response = await client.get(url, headers=self._headers())
            response.raise_for_status()
            return dict(response.json())
