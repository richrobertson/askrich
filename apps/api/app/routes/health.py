"""Health check endpoint."""


async def health_check() -> dict:
    """Return health status.

    Returns:
        Dictionary with status
    """
    return {"status": "ok"}
