"""Ask Rich API - FastAPI application."""

from fastapi import FastAPI, status
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
import logging

from app.config import settings
from app.routes import health, ingest


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
    result = ingest.ingest()
    status_code = status.HTTP_200_OK if result.get("success") else status.HTTP_500_INTERNAL_SERVER_ERROR
    return JSONResponse(result, status_code=status_code)


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
