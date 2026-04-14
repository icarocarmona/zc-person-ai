"""
Telegram Bot — recebe comandos via long polling e despacha para ferramentas.

Comandos disponíveis:
  /ajuda           Lista de comandos
  /problemas       Alertas ativos no Zabbix
  /cpu [host]      Análise de CPU com top processos
  /diagnostico <host>  Diagnóstico completo com IA
"""
import asyncio
import os
import structlog
import httpx
import redis.asyncio as aioredis

logger = structlog.get_logger(__name__)

_LOCK_KEY = "telegram_bot_poller_leader"
_LOCK_TTL = 30       # segundos — expira se o worker morrer
_LOCK_REFRESH = 10   # renova o lock a cada N segundos

HELP_TEXT = (
    "🤖 *Zabbix Alert Agent — Comandos*\n\n"
    "🚨 /problemas — Alertas ativos agora\n"
    "🖥️ /hosts — Lista todos os hosts e status\n"
    "⚡ /cpu \\[host\\] — Análise de CPU com top processos\n"
    "🔍 /diagnostico \\<host\\> — Diagnóstico completo com IA\n\n"
    "_Exemplo: /cpu test\\-server_"
)


class TelegramBotPoller:
    """Polling de updates do Telegram em background (long-poll 25s)."""

    def __init__(self, token: str, chat_id: str, redis_url: str = "redis://redis:6379/0") -> None:
        self._token = token
        self._chat_id = str(chat_id)
        self._base = f"https://api.telegram.org/bot{token}"
        self._redis_url = redis_url
        self._worker_id = f"worker-{os.getpid()}"
        self._offset = 0
        self._task: asyncio.Task | None = None
        self._app = None  # set via attach()

    def attach(self, app) -> None:
        """Recebe a referência ao app FastAPI para acessar settings e serviços."""
        self._app = app

    async def start(self) -> None:
        self._task = asyncio.create_task(self._poll_loop(), name="telegram-poller")
        logger.info("telegram_bot.started", chat_id=self._chat_id)

    async def stop(self) -> None:
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        logger.info("telegram_bot.stopped")

    # ─── Internal ──────────────────────────────────────────────────────────────

    async def _poll_loop(self) -> None:
        """Garante que apenas 1 worker (o líder) faça polling via Redis lock."""
        while True:
            try:
                acquired = await self._try_acquire_lock()
                if not acquired:
                    logger.debug("telegram_bot.standby", worker=self._worker_id)
                    await asyncio.sleep(_LOCK_REFRESH)
                    continue

                logger.info("telegram_bot.leader", worker=self._worker_id)
                await self._run_as_leader()

            except asyncio.CancelledError:
                await self._release_lock()
                raise
            except Exception as exc:
                logger.warning("telegram_bot.poll_error", error=str(exc))
                await asyncio.sleep(5)

    async def _run_as_leader(self) -> None:
        """Loop de polling enquanto este worker for o líder."""
        last_refresh = asyncio.get_event_loop().time()

        async with httpx.AsyncClient(timeout=httpx.Timeout(35.0, connect=10.0)) as client:
            while True:
                try:
                    resp = await client.get(
                        f"{self._base}/getUpdates",
                        params={
                            "offset": self._offset,
                            "timeout": 25,
                            "allowed_updates": ["message", "callback_query"],
                        },
                    )
                    if resp.status_code == 200:
                        for update in resp.json().get("result", []):
                            self._offset = update["update_id"] + 1
                            asyncio.create_task(self._dispatch(update))

                    # Renova o lock periodicamente
                    now = asyncio.get_event_loop().time()
                    if now - last_refresh >= _LOCK_REFRESH:
                        renewed = await self._refresh_lock()
                        if not renewed:
                            logger.warning("telegram_bot.lost_leader", worker=self._worker_id)
                            return  # perdeu o lock — volta para _poll_loop
                        last_refresh = now

                except asyncio.CancelledError:
                    raise
                except Exception as exc:
                    logger.warning("telegram_bot.poll_error", error=str(exc))
                    await asyncio.sleep(5)

    async def _try_acquire_lock(self) -> bool:
        try:
            r = aioredis.from_url(self._redis_url, decode_responses=True)
            acquired = await r.set(_LOCK_KEY, self._worker_id, nx=True, ex=_LOCK_TTL)
            await r.aclose()
            return bool(acquired)
        except Exception:
            return True  # fail-open: se Redis estiver fora, roda sem lock

    async def _refresh_lock(self) -> bool:
        try:
            r = aioredis.from_url(self._redis_url, decode_responses=True)
            current = await r.get(_LOCK_KEY)
            if current != self._worker_id:
                await r.aclose()
                return False
            await r.expire(_LOCK_KEY, _LOCK_TTL)
            await r.aclose()
            return True
        except Exception:
            return True  # fail-open

    async def _release_lock(self) -> None:
        try:
            r = aioredis.from_url(self._redis_url, decode_responses=True)
            current = await r.get(_LOCK_KEY)
            if current == self._worker_id:
                await r.delete(_LOCK_KEY)
            await r.aclose()
        except Exception:
            pass

    async def _dispatch(self, update: dict) -> None:
        try:
            # Callback query (botão inline pressionado)
            if "callback_query" in update:
                cq = update["callback_query"]
                await self._answer_callback(cq["id"])
                chat_id = str(cq["message"]["chat"]["id"])
                if chat_id != self._chat_id:
                    return
                await self._handle_command(cq["data"], chat_id)
                return

            msg = update.get("message", {})
            if not msg:
                return
            text = (msg.get("text") or "").strip()
            chat_id = str(msg["chat"]["id"])

            # Segurança: só responde ao chat configurado
            if chat_id != self._chat_id:
                logger.warning("telegram_bot.unauthorized_chat", chat_id=chat_id)
                return

            if not text.startswith("/"):
                return

            await self._handle_command(text, chat_id)

        except Exception as exc:
            logger.error("telegram_bot.dispatch_error", error=str(exc))

    async def _handle_command(self, text: str, chat_id: str) -> None:
        cmd, _, args = text.partition(" ")
        cmd = cmd.lower().split("@")[0]  # remove @botname se presente
        host = args.strip() or None

        logger.info("telegram_bot.command", cmd=cmd, host=host)

        if cmd in ("/ajuda", "/start", "/help"):
            await self._send(chat_id, HELP_TEXT)
            return

        # Importa as ferramentas lazy para não criar dependências circulares
        from app.tools.problems_tool import run_problems
        from app.tools.hosts_tool import run_hosts
        from app.tools.cpu_tool import run_cpu
        from app.tools.diagnose_tool import run_diagnose

        settings = self._app.state.settings if self._app else None

        if cmd == "/problemas":
            await self._send(chat_id, "⏳ Consultando alertas ativos\\.\\.\\.")
            result = await run_problems(settings)
        elif cmd == "/hosts":
            await self._send(chat_id, "⏳ Listando hosts\\.\\.\\.")
            result = await run_hosts(settings)
        elif cmd == "/cpu":
            await self._send(chat_id, f"⏳ Analisando CPU{' em ' + host if host else ''}\\.\\.\\.")
            result = await run_cpu(settings, host)
        elif cmd == "/diagnostico":
            if not host:
                result = "⚠️ Uso: /diagnostico \\<host\\>\n_Exemplo: /diagnostico test\\-server_"
            else:
                await self._send(chat_id, f"⏳ Rodando diagnóstico em *{_esc(host)}*\\.\\.\\.")
                ai_service = self._app.state.ai_service if self._app else None
                result = await run_diagnose(settings, host, ai_service)
        else:
            result = f"❓ Comando desconhecido: `{_esc(cmd)}`\n\nUse /ajuda para ver os comandos disponíveis\\."

        await self._send(chat_id, result)

    async def _send(self, chat_id: str, text: str) -> None:
        try:
            async with httpx.AsyncClient(timeout=httpx.Timeout(30.0)) as client:
                await client.post(
                    f"{self._base}/sendMessage",
                    json={"chat_id": chat_id, "text": text, "parse_mode": "MarkdownV2"},
                )
        except Exception as exc:
            logger.error("telegram_bot.send_error", error=str(exc))

    async def _answer_callback(self, callback_query_id: str) -> None:
        try:
            async with httpx.AsyncClient(timeout=httpx.Timeout(5.0)) as client:
                await client.post(
                    f"{self._base}/answerCallbackQuery",
                    json={"callback_query_id": callback_query_id},
                )
        except Exception:
            pass


def _esc(text: str) -> str:
    """Escapa caracteres especiais do MarkdownV2 do Telegram."""
    for ch in r"_*[]()~`>#+-=|{}.!":
        text = text.replace(ch, f"\\{ch}")
    return text
