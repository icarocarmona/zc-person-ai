import asyncpg
from asyncpg import Pool

_CREATE_TABLE = """
CREATE TABLE IF NOT EXISTS agent_config (
    id         INTEGER PRIMARY KEY DEFAULT 1,
    config     JSONB   NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
"""


async def create_pool(dsn: str) -> Pool:
    return await asyncpg.create_pool(dsn, min_size=1, max_size=5)  # type: ignore[return-value]


async def init_schema(pool: Pool) -> None:
    async with pool.acquire() as conn:
        await conn.execute(_CREATE_TABLE)


async def close_pool(pool: Pool) -> None:
    await pool.close()
