"""
Ask Rich Analytics Client

Provides programmatic access to M6 event data from Cloudflare KV for:
- Question volume and pattern analysis
- Feedback sentiment and satisfaction metrics
- Answer quality and backend performance
- Domain-specific insights

Usage:
    from analytics import AnalyticsClient, CloudflareKVClient
    
    kv = CloudflareKVClient(account_id="...", namespace_id="...", token="...")
    client = AnalyticsClient(kv_client=kv)
    
    satisfaction = client.feedback_sentiment_ratio("2026-03-01", "2026-03-30")
    negative_feedback = client.get_negative_feedback_events(limit=50)
"""

import json
import itertools
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional, Tuple
from dataclasses import dataclass, field, asdict
from collections import defaultdict
import statistics


@dataclass
class Event:
    """Base event class."""
    eventId: str
    type: str
    timestamp: str
    clientId: str


@dataclass
class QuestionEvent(Event):
    """Question event from M6."""
    question: str
    topK: int
    humorMode: str


@dataclass
class AnswerEvent(Event):
    """Answer event from M6."""
    questionEventId: str
    answer: str
    citationCount: int
    answerHash: str
    durationMs: int
    backendMode: str


@dataclass
class FeedbackEvent(Event):
    """Feedback event from M6."""
    questionEventId: str
    answerEventId: str
    sentiment: str
    optionalNote: str


@dataclass
class DailySummary:
    """Daily aggregated metrics."""
    date: str
    question_count: int = 0
    answer_count: int = 0
    feedback_count: int = 0
    helpful_count: int = 0
    unhelpful_count: int = 0
    neutral_count: int = 0
    unique_clients: int = 0
    avg_duration_ms: float = 0.0
    p95_duration_ms: float = 0.0
    p99_duration_ms: float = 0.0
    avg_citations: float = 0.0
    unique_questions: int = 0


@dataclass
class FeedbackTriage:
    """Feedback entry for triage and corpus planning."""
    questionEventId: str
    answerEventId: str
    question: str
    answer: str
    sentiment: str
    note: str
    timestamp: str
    question_timestamp: str
    answer_timestamp: str
    citations_count: int


class CloudflareKVClient:
    """
    Client for Cloudflare KV API.
    
    Requires environment variables or explicit parameters:
    - CLOUDFLARE_ACCOUNT_ID
    - CLOUDFLARE_NAMESPACE_ID
    - CLOUDFLARE_API_TOKEN
    """
    
    def __init__(
        self,
        account_id: Optional[str] = None,
        namespace_id: Optional[str] = None,
        token: Optional[str] = None,
    ):
        import os
        
        self.account_id = account_id or os.getenv("CLOUDFLARE_ACCOUNT_ID")
        self.namespace_id = namespace_id or os.getenv("CLOUDFLARE_NAMESPACE_ID")
        self.token = token or os.getenv("CLOUDFLARE_API_TOKEN")
        
        if not all([self.account_id, self.namespace_id, self.token]):
            raise ValueError(
                "Cloudflare credentials not configured. "
                "Set CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_NAMESPACE_ID, CLOUDFLARE_API_TOKEN "
                "or pass as arguments."
            )
    
    def get_key(self, key: str) -> Optional[str]:
        """Fetch a KV key value."""
        import urllib.request
        import urllib.error
        
        url = (
            f"https://api.cloudflare.com/client/v4/accounts/{self.account_id}"
            f"/storage/kv/namespaces/{self.namespace_id}/values/{key}"
        )
        headers = {"Authorization": f"Bearer {self.token}"}
        
        try:
            req = urllib.request.Request(url, headers=headers)
            with urllib.request.urlopen(req, timeout=30) as resp:
                return resp.read().decode()
        except urllib.error.HTTPError:
            return None
    
    def list_keys(self, prefix: str = "events:") -> List[str]:
        """List all KV keys with given prefix."""
        import urllib.request
        import json as json_lib
        
        url = (
            f"https://api.cloudflare.com/client/v4/accounts/{self.account_id}"
            f"/storage/kv/namespaces/{self.namespace_id}/keys?prefix={prefix}&limit=1000"
        )
        headers = {"Authorization": f"Bearer {self.token}"}
        
        try:
            req = urllib.request.Request(url, headers=headers)
            with urllib.request.urlopen(req, timeout=30) as resp:
                data = json_lib.loads(resp.read().decode())
                return [item["name"] for item in data.get("result", [])]
        except Exception:
            return []


class AnalyticsClient:
    """
    Main analytics client for Ask Rich M6 event data.
    
    Supports both local file-based analytics (for development/testing)
    and remote Cloudflare KV access (for production).
    """
    
    def __init__(
        self,
        kv_client: Optional[CloudflareKVClient] = None,
        local_events_dir: Optional[str] = None,
    ):
        """
        Initialize analytics client.
        
        Args:
            kv_client: CloudflareKVClient for production KV access
            local_events_dir: Path to local NDJSON events directory (for testing)
        """
        self.kv_client = kv_client
        self.local_events_dir = local_events_dir
    
    def parse_event(self, line: str) -> Optional[Event]:
        """Parse a single NDJSON event line."""
        try:
            data = json.loads(line)
            event_type = data.get("type")
            
            if event_type == "question":
                return QuestionEvent(**data)
            elif event_type == "answer":
                return AnswerEvent(**data)
            elif event_type == "feedback":
                return FeedbackEvent(**data)
        except Exception:
            pass
        return None
    
    def _get_events_ndjson(self, date: str) -> str:
        """
        Fetch NDJSON events for a given date.
        
        Tries local first (if configured), then falls back to KV.
        """
        if self.local_events_dir:
            import os
            path = os.path.join(self.local_events_dir, f"events_{date}.jsonl")
            try:
                with open(path, "r") as f:
                    return f.read()
            except FileNotFoundError:
                pass
        
        if self.kv_client:
            content = self.kv_client.get_key(f"events:{date}")
            return content or ""
        
        return ""
    
    def get_events(
        self,
        start_date: str,
        end_date: str,
        event_type: Optional[str] = None,
    ) -> List[Event]:
        """
        Fetch events within date range, optionally filtered by type.
        
        Args:
            start_date: ISO date string (YYYY-MM-DD)
            end_date: ISO date string (YYYY-MM-DD)
            event_type: Optional filter ('question', 'answer', 'feedback')
        
        Returns:
            List of Event objects
        """
        events = []
        current = datetime.fromisoformat(start_date)
        end = datetime.fromisoformat(end_date)
        
        while current <= end:
            date_str = current.strftime("%Y-%m-%d")
            ndjson = self._get_events_ndjson(date_str)
            
            for line in ndjson.strip().split("\n"):
                if not line:
                    continue
                event = self.parse_event(line)
                if event and (event_type is None or event.type == event_type):
                    events.append(event)
            
            current += timedelta(days=1)
        
        return events
    
    def daily_summary(self, date: str) -> DailySummary:
        """Compute daily aggregated metrics."""
        summary = DailySummary(date=date)
        
        ndjson = self._get_events_ndjson(date)
        if not ndjson.strip():
            return summary
        
        questions_by_id = {}
        answers_by_id = {}
        durations = []
        citations = []
        clients = set()
        question_hashes = set()
        
        feedback_sentiments = {"helpful": 0, "unhelpful": 0, "neutral": 0}
        
        for line in ndjson.strip().split("\n"):
            if not line:
                continue
            event = self.parse_event(line)
            if not event:
                continue
            
            clients.add(event.clientId)
            
            if isinstance(event, QuestionEvent):
                summary.question_count += 1
                questions_by_id[event.eventId] = event
                question_hashes.add(event.question[:50])  # Simple dedup
            
            elif isinstance(event, AnswerEvent):
                summary.answer_count += 1
                answers_by_id[event.eventId] = event
                durations.append(event.durationMs)
                citations.append(event.citationCount)
            
            elif isinstance(event, FeedbackEvent):
                summary.feedback_count += 1
                if event.sentiment in feedback_sentiments:
                    feedback_sentiments[event.sentiment] += 1
        
        summary.unique_clients = len(clients)
        summary.unique_questions = len(question_hashes)
        summary.helpful_count = feedback_sentiments["helpful"]
        summary.unhelpful_count = feedback_sentiments["unhelpful"]
        summary.neutral_count = feedback_sentiments["neutral"]
        
        if durations:
            summary.avg_duration_ms = statistics.mean(durations)
            summary.p95_duration_ms = (
                sorted(durations)[int(len(durations) * 0.95)]
                if len(durations) > 20 else max(durations)
            )
            summary.p99_duration_ms = (
                sorted(durations)[int(len(durations) * 0.99)]
                if len(durations) > 100 else max(durations)
            )
        
        if citations:
            summary.avg_citations = statistics.mean(citations)
        
        return summary
    
    def feedback_sentiment_ratio(
        self,
        start_date: str,
        end_date: str,
    ) -> Dict[str, Any]:
        """
        Calculate feedback sentiment distribution and satisfaction ratio.
        
        Returns:
            {
                "total_feedback": 42,
                "helpful": 38,
                "unhelpful": 3,
                "neutral": 1,
                "satisfaction_ratio": 0.9048,
                "trend": [daily summary, ...]
            }
        """
        feedbacks = self.get_events(start_date, end_date, event_type="feedback")
        
        sentiments = defaultdict(int)
        trend = []
        current = datetime.fromisoformat(start_date)
        end = datetime.fromisoformat(end_date)
        
        while current <= end:
            date_str = current.strftime("%Y-%m-%d")
            daily = self.daily_summary(date_str)
            trend.append({
                "date": date_str,
                "helpful": daily.helpful_count,
                "unhelpful": daily.unhelpful_count,
                "neutral": daily.neutral_count,
                "total": daily.feedback_count,
            })
            current += timedelta(days=1)
        
        for fb in feedbacks:
            if isinstance(fb, FeedbackEvent):
                sentiments[fb.sentiment] += 1
        
        total = sum(sentiments.values())
        helpful = sentiments.get("helpful", 0)
        
        # Satisfaction = helpful / (helpful + unhelpful)
        denominator = sentiments.get("helpful", 0) + sentiments.get("unhelpful", 0)
        satisfaction_ratio = (
            helpful / denominator if denominator > 0 else 0
        )
        
        return {
            "total_feedback": total,
            "helpful": sentiments.get("helpful", 0),
            "unhelpful": sentiments.get("unhelpful", 0),
            "neutral": sentiments.get("neutral", 0),
            "satisfaction_ratio": round(satisfaction_ratio, 4),
            "trend": trend,
        }
    
    def get_negative_feedback_events(
        self,
        start_date: Optional[str] = None,
        end_date: Optional[str] = None,
        limit: int = 100,
    ) -> List[FeedbackTriage]:
        """
        Get unhelpful feedback entries for triage.
        
        Returns list of FeedbackTriage objects with question and answer context.
        """
        if not start_date:
            start_date = (datetime.now() - timedelta(days=7)).strftime("%Y-%m-%d")
        if not end_date:
            end_date = datetime.now().strftime("%Y-%m-%d")
        
        feedback_events = self.get_events(start_date, end_date, event_type="feedback")
        question_events = self.get_events(start_date, end_date, event_type="question")
        answer_events = self.get_events(start_date, end_date, event_type="answer")
        
        questions_by_id = {q.eventId: q for q in question_events if isinstance(q, QuestionEvent)}
        answers_by_id = {a.eventId: a for a in answer_events if isinstance(a, AnswerEvent)}
        
        triage_items = []
        
        for fb in feedback_events:
            if not isinstance(fb, FeedbackEvent) or fb.sentiment != "unhelpful":
                continue
            
            q = questions_by_id.get(fb.questionEventId)
            a = answers_by_id.get(fb.answerEventId)
            
            if not q or not a:
                continue
            
            item = FeedbackTriage(
                questionEventId=fb.questionEventId,
                answerEventId=fb.answerEventId,
                question=q.question,
                answer=a.answer,
                sentiment=fb.sentiment,
                note=fb.optionalNote,
                timestamp=fb.timestamp,
                question_timestamp=q.timestamp,
                answer_timestamp=a.timestamp,
                citations_count=a.citationCount,
            )
            triage_items.append(item)
        
        # Sort by timestamp, newest first
        triage_items.sort(key=lambda x: x.timestamp, reverse=True)
        return triage_items[:limit]
    
    def question_volume(
        self,
        start_date: str,
        end_date: str,
    ) -> Dict[str, Any]:
        """
        Get question volume statistics over date range.
        
        Returns:
            {
                "total": 500,
                "daily_average": 25.0,
                "daily_breakdown": [
                    {"date": "2026-03-01", "count": 20},
                    ...
                ]
            }
        """
        current = datetime.fromisoformat(start_date)
        end = datetime.fromisoformat(end_date)
        breakdown = []
        total = 0
        
        while current <= end:
            date_str = current.strftime("%Y-%m-%d")
            daily = self.daily_summary(date_str)
            breakdown.append({
                "date": date_str,
                "count": daily.question_count,
            })
            total += daily.question_count
            current += timedelta(days=1)
        
        days = (datetime.fromisoformat(end_date) - datetime.fromisoformat(start_date)).days + 1
        
        return {
            "total": total,
            "daily_average": round(total / days, 1),
            "daily_breakdown": breakdown,
        }
    
    def question_domains_and_patterns(
        self,
        start_date: str,
        end_date: str,
        limit: int = 20,
    ) -> Dict[str, Any]:
        """
        Identify recurring question patterns and domains.
        
        Simple heuristics:
        - Technical: contains language keywords (Java, Kubernetes, etc.)
        - Behavioral: contains STAR/story keywords
        - Career: contains role/transition keywords
        - Profile: contains name/link keywords
        """
        questions = self.get_events(start_date, end_date, event_type="question")
        
        domains = defaultdict(int)
        patterns = defaultdict(int)
        
        technical_keywords = [
            "java", "kubernetes", "python", "cloud", "platform", "api",
            "distributed", "microservice", "docker", "terraform", "aws", "azure", "gcp"
        ]
        behavioral_keywords = [
            "challenge", "difficult", "conflict", "solved", "learned", "achieved",
            "responsibility", "outcome", "impact", "team", "collaboration"
        ]
        career_keywords = [
            "transition", "gap", "why", "role", "opportunity", "move", "next step",
            "background", "experience", "why you", "looking for"
        ]
        profile_keywords = [
            "github", "linkedin", "portfolio", "resume", "contact", "email",
            "phone", "website", "social", "profile"
        ]
        
        for q in questions:
            if not isinstance(q, QuestionEvent):
                continue
            
            text = q.question.lower()
            
            domain_detected = False
            for keyword in technical_keywords:
                if keyword in text:
                    domains["technical"] += 1
                    domain_detected = True
                    break
            
            if not domain_detected:
                for keyword in behavioral_keywords:
                    if keyword in text:
                        domains["behavioral"] += 1
                        domain_detected = True
                        break
            
            if not domain_detected:
                for keyword in career_keywords:
                    if keyword in text:
                        domains["career_transition"] += 1
                        domain_detected = True
                        break
            
            if not domain_detected:
                for keyword in profile_keywords:
                    if keyword in text:
                        domains["profile"] += 1
                        domain_detected = True
                        break
            
            if not domain_detected:
                domains["general"] += 1
            
            # Track recurring patterns (first 50 chars as pattern)
            pattern = text[:50]
            patterns[pattern] += 1
        
        top_patterns = sorted(
            patterns.items(),
            key=lambda x: x[1],
            reverse=True
        )[:limit]
        
        return {
            "domains": dict(sorted(domains.items(), key=lambda x: x[1], reverse=True)),
            "recurring_patterns": [
                {"pattern": p, "count": c} for p, c in top_patterns if c > 1
            ],
        }
    
    def backend_performance(
        self,
        start_date: str,
        end_date: str,
    ) -> Dict[str, Any]:
        """
        Compare backend performance (local vs. upstream vs. openai).
        """
        answers = self.get_events(start_date, end_date, event_type="answer")
        
        by_mode = defaultdict(list)
        
        for a in answers:
            if isinstance(a, AnswerEvent):
                by_mode[a.backendMode].append(a)
        
        result = {}
        for mode, events in by_mode.items():
            durations = [e.durationMs for e in events]
            citations = [e.citationCount for e in events]
            
            result[mode] = {
                "count": len(events),
                "avg_duration_ms": round(statistics.mean(durations), 1),
                "p95_duration_ms": (
                    round(sorted(durations)[int(len(durations) * 0.95)], 1)
                    if len(durations) > 20 else round(max(durations), 1)
                ),
                "avg_citations": round(statistics.mean(citations), 2),
            }
        
        return result
    
    def export_csv(
        self,
        start_date: str,
        end_date: str,
        output_path: str,
    ):
        """
        Export all events to CSV for external analysis.
        
        Columns: timestamp, type, question, answer_snippet, sentiment, citations, duration_ms
        """
        import csv
        
        questions = {q.eventId: q for q in self.get_events(start_date, end_date, event_type="question") if isinstance(q, QuestionEvent)}
        answers = {a.eventId: a for a in self.get_events(start_date, end_date, event_type="answer") if isinstance(a, AnswerEvent)}
        feedbacks = self.get_events(start_date, end_date, event_type="feedback")
        
        rows = []
        
        for fb in feedbacks:
            if not isinstance(fb, FeedbackEvent):
                continue
            
            q = questions.get(fb.questionEventId)
            a = answers.get(fb.answerEventId)
            
            rows.append({
                "timestamp": fb.timestamp,
                "question": q.question if q else "",
                "answer_snippet": a.answer[:100] if a else "",
                "sentiment": fb.sentiment,
                "citations": a.citationCount if a else 0,
                "duration_ms": a.durationMs if a else 0,
                "note": fb.optionalNote,
            })
        
        with open(output_path, "w", newline="") as f:
            writer = csv.DictWriter(
                f,
                fieldnames=["timestamp", "question", "answer_snippet", "sentiment",
                           "citations", "duration_ms", "note"]
            )
            writer.writeheader()
            writer.writerows(rows)
