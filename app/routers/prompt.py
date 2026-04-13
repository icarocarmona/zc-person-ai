from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from app.services.ai_service import SYSTEM_PROMPT as DEFAULT_PROMPT
from app.config_store import save_to_db, write_runtime_config

router = APIRouter(prefix="/api")


class PromptUpdateRequest(BaseModel):
    system_prompt: str


@router.get("/prompt", summary="Retorna o system prompt atual")
async def get_prompt(request: Request) -> dict:
    s = request.app.state.settings
    is_default = not bool(s.system_prompt)
    return {
        "system_prompt": s.system_prompt if s.system_prompt else DEFAULT_PROMPT,
        "is_default": is_default,
        "default_prompt": DEFAULT_PROMPT,
    }


@router.post("/prompt", summary="Salva novo system prompt")
async def save_prompt(body: PromptUpdateRequest, request: Request) -> dict:
    app = request.app
    current = app.state.settings.model_dump(exclude={"config_database_url"})
    merged = {**current, "system_prompt": body.system_prompt}
    try:
        await save_to_db(app.state.db_pool, merged)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Erro ao salvar no banco: {exc}")
    write_runtime_config(merged)
    await app.state.reload_services()
    return {"status": "saved", "reloaded": True}


@router.post("/prompt/reset", summary="Restaura o prompt padrão")
async def reset_prompt(request: Request) -> dict:
    app = request.app
    current = app.state.settings.model_dump(exclude={"config_database_url"})
    merged = {**current, "system_prompt": ""}
    try:
        await save_to_db(app.state.db_pool, merged)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Erro ao salvar no banco: {exc}")
    write_runtime_config(merged)
    await app.state.reload_services()
    return {"status": "reset", "reloaded": True}
