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

TELEGRAM_API = "https://api.telegram.org"


class TelegramService:
    def __init__(self) -> None:
        settings = get_settings()
        self._token = settings.telegram_bot_token
        self._chat_id = settings.telegram_chat_id
        self._timeout = httpx.Timeout(30.0, connect=10.0)

    def _url(self, method: str) -> str:
        return f"{TELEGRAM_API}/bot{self._token}/{method}"

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=2, max=15),
        retry=retry_if_exception_type((httpx.TimeoutException, httpx.ConnectError)),
        reraise=True,
    )
    async def send_message(self, text: str) -> dict:
        """
        Envia mensagem via Telegram Bot API.
        Usa parse_mode=HTML. Mesmo contrato de send_message() do WhatsAppService.
        """
        logger.info(
            "telegram.send_start",
            chat_id=self._chat_id,
            message_length=len(text),
        )

        async with httpx.AsyncClient(timeout=self._timeout) as client:
            response = await client.post(
                self._url("sendMessage"),
                json={
                    "chat_id": self._chat_id,
                    "text": text,
                    "parse_mode": "HTML",
                },
            )
            response.raise_for_status()
            result: dict = response.json()

        logger.info(
            "telegram.send_success",
            chat_id=self._chat_id,
            message_id=result.get("result", {}).get("message_id", "unknown"),
        )
        return result

    async def get_me(self) -> dict:
        """Verifica conectividade com a API do Telegram sem enviar mensagem."""
        async with httpx.AsyncClient(timeout=self._timeout) as client:
            response = await client.get(self._url("getMe"))
            response.raise_for_status()
            return dict(response.json())
