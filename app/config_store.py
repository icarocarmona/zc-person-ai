import json
from pathlib import Path
from asyncpg import Pool

# Arquivo gerado em runtime com as configs do banco.
# Tem prioridade máxima no Pydantic Settings (acima do .env).
RUNTIME_CONFIG_PATH = Path("runtime_config.json")


async def load_from_db(pool: Pool) -> dict | None:
    """Lê a configuração salva no banco. Retorna None se ainda não foi configurado."""
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT config::text AS config FROM agent_config WHERE id = 1"
        )
        if row is None:
            return None
        return json.loads(row["config"])


async def save_to_db(pool: Pool, data: dict) -> None:
    """Persiste a configuração no banco (upsert)."""
    async with pool.acquire() as conn:
        await conn.execute(
            """
            INSERT INTO agent_config (id, config, updated_at)
            VALUES (1, $1::jsonb, NOW())
            ON CONFLICT (id) DO UPDATE
                SET config     = EXCLUDED.config,
                    updated_at = EXCLUDED.updated_at
            """,
            json.dumps(data),
        )


def write_runtime_config(data: dict) -> None:
    """Escreve runtime_config.json para que o Pydantic Settings o leia."""
    RUNTIME_CONFIG_PATH.write_text(json.dumps(data, indent=2), encoding="utf-8")


def ensure_runtime_config() -> None:
    """Garante que runtime_config.json existe (evita erro do Pydantic com arquivo ausente)."""
    if not RUNTIME_CONFIG_PATH.exists():
        RUNTIME_CONFIG_PATH.write_text("{}", encoding="utf-8")
