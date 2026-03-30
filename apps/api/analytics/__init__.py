"""
Ask Rich Analytics Module

Provides tools for analyzing M6 event data and generating insights for corpus planning,
feedback triage, and performance monitoring.
"""

from .client import (
    AnalyticsClient,
    CloudflareKVClient,
    Event,
    QuestionEvent,
    AnswerEvent,
    FeedbackEvent,
    DailySummary,
    FeedbackTriage,
)

__all__ = [
    "AnalyticsClient",
    "CloudflareKVClient",
    "Event",
    "QuestionEvent",
    "AnswerEvent",
    "FeedbackEvent",
    "DailySummary",
    "FeedbackTriage",
]
