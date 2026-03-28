"""Ask Rich API - FastAPI application."""

from fastapi import FastAPI, status
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
import logging

from app.config import settings
from app.routes import health, ingest
from app.routes.chat import get_chat_service
from app.models.api import (
    ChatRequest,
    ChatResponseData,
    ChatResponseEnvelope,
    ErrorResponseEnvelope,
)


# Configure logging
logging.basicConfig(level=logging.INFO)

# Create FastAPI app
app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    debug=settings.debug,
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_allowed_origins,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def get_health():
    """Health check endpoint.

    Returns:
        JSON with status
    """
    result = await health.health_check()
    return JSONResponse(result)


@app.post("/ingest")
def run_ingest():
    """Ingestion endpoint.

    Loads documents, chunks them, embeds, and indexes.

    Returns:
        JSON with ingestion results
    """
    if not settings.enable_ingest_endpoint:
        return JSONResponse(
            {"detail": "Ingestion endpoint is disabled in this environment."},
            status_code=status.HTTP_403_FORBIDDEN,
        )

    result = ingest.ingest()
    status_code = status.HTTP_200_OK if result.get("success") else status.HTTP_500_INTERNAL_SERVER_ERROR
    return JSONResponse(result, status_code=status_code)


@app.post("/api/chat")
def chat(payload: ChatRequest):
    """Answer a recruiter question using retrieval-backed evidence."""
    try:
        service = get_chat_service()
        result = service.answer(
            question=payload.question,
            top_k=payload.top_k if payload.top_k is not None else settings.chat_top_k,
            filters=payload.filters,
            tone=payload.tone,
        )
        response = ChatResponseEnvelope(
            success=True,
            data=ChatResponseData(**result),
        )
        return JSONResponse(response.model_dump(), status_code=status.HTTP_200_OK)
    except Exception:
        logging.exception("/api/chat failed")
        error = (
            "Chat request failed due to an internal error."
            if not settings.debug
            else "Chat request failed due to an internal error. Check server logs for details."
        )
        response = ErrorResponseEnvelope(success=False, error=error)
        return JSONResponse(response.model_dump(), status_code=status.HTTP_500_INTERNAL_SERVER_ERROR)


@app.get("/")
async def root():
    """Root endpoint.

    Returns:
        Welcome message and API info
    """
    return {
        "name": settings.app_name,
        "version": settings.app_version,
        "endpoints": {
            "health": "/health (GET)",
            "ingest": "/ingest (POST)",
            "chat": "/api/chat (POST)",
        },
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=8000,
        reload=settings.debug,
    )
