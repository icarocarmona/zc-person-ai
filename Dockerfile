# =============================================================================
# Stage 1 — Build do frontend React + Vite
# =============================================================================
FROM node:20-slim AS frontend-builder

WORKDIR /frontend

COPY frontend/package*.json ./
RUN npm ci

COPY frontend/ ./
RUN npm run build

# =============================================================================
# Stage 2 — App Python (FastAPI)
# =============================================================================
FROM python:3.12-slim

RUN groupadd -r appuser && useradd -r -g appuser appuser

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    gcc \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

COPY app/ ./app/

# Copia o build do frontend para ser servido pelo FastAPI como static files
COPY --from=frontend-builder /frontend/dist ./frontend/dist

RUN mkdir -p /app/logs && chown -R appuser:appuser /app

USER appuser

EXPOSE 8000

CMD ["gunicorn", "app.main:app", \
     "--worker-class", "uvicorn.workers.UvicornWorker", \
     "--workers", "2", \
     "--bind", "0.0.0.0:8000", \
     "--timeout", "120", \
     "--access-logfile", "-", \
     "--error-logfile", "-"]
