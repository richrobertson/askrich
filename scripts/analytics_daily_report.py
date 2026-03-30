#!/usr/bin/env python3
"""
Daily analytics report for Milestone 7 operational monitoring.

Usage:
    python3 scripts/analytics_daily_report.py                # Today
    python3 scripts/analytics_daily_report.py --date 2026-03-30
    python3 scripts/analytics_daily_report.py --local-dir /tmp/events
"""

import argparse
import sys
from datetime import datetime
from pathlib import Path

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent / "apps" / "api"))

from analytics import AnalyticsClient  # noqa: E402


def format_percentage(value, precision=1):
    """Format float as percentage."""
    return f"{value * 100:.{precision}f}%"


def format_duration(ms):
    """Format milliseconds for display."""
    return f"{ms:.0f}ms"


def main():
    parser = argparse.ArgumentParser(
        description="Generate daily analytics report"
    )
    
    parser.add_argument(
        "--date",
        type=str,
        default=None,
        help="Date to report on (YYYY-MM-DD, default: today)",
    )
    
    parser.add_argument(
        "--local-dir",
        type=str,
        default=None,
        help="Local events directory for testing",
    )
    
    parser.add_argument(
        "--range",
        type=int,
        default=None,
        help="Report on last N days (instead of single day)",
    )
    
    args = parser.parse_args()
    
    # Determine date
    if args.date:
        report_date = args.date
    else:
        report_date = datetime.now().strftime("%Y-%m-%d")
    
    # Create analytics client
    client = AnalyticsClient(local_events_dir=args.local_dir)
    
    # Generate report
    if args.range:
        from datetime import timedelta
        end_dt = datetime.fromisoformat(report_date)
        start_dt = end_dt - timedelta(days=args.range - 1)
        start_date = start_dt.strftime("%Y-%m-%d")
        end_date = end_dt.strftime("%Y-%m-%d")
        print(f"Ask Rich Analytics Report — {start_date} to {end_date}\n")
        print("=" * 70)
        
        # Volume and engagement
        volume = client.question_volume(start_date, end_date)
        sentiment = client.feedback_sentiment_ratio(start_date, end_date)
        
        if volume["total"] > 0:
            feedback_rate_display = f"{(sentiment['total_feedback'] / volume['total'] * 100):.1f}%"
        else:
            feedback_rate_display = "0.0%"

        print(f"\n📊 VOLUME ({args.range} days)")
        print(f"  Total questions:     {volume['total']}")
        print(f"  Daily average:       {volume['daily_average']}")
        print(f"  Total feedback:      {sentiment['total_feedback']}")
        print(f"  Feedback rate:       {feedback_rate_display}")

        print("\n😊 QUALITY")
        print(f"  Satisfaction ratio:  {format_percentage(sentiment['satisfaction_ratio'])}")
        print(f"  Helpful:             {sentiment['helpful']}")
        print(f"  Unhelpful:           {sentiment['unhelpful']}")
        print(f"  Neutral:             {sentiment['neutral']}")
        
        # Backend performance
        perf = client.backend_performance(start_date, end_date)
        print("\n⚡ BACKEND PERFORMANCE")
        for backend, metrics in sorted(perf.items()):
            print(f"  {backend}:")
            print(f"    Count:             {metrics['count']}")
            print(f"    Avg latency:       {format_duration(metrics['avg_duration_ms'])}")
            print(f"    p95 latency:       {format_duration(metrics['p95_duration_ms'])}")
            print(f"    Avg citations:     {metrics['avg_citations']:.1f}")
        
        # Domains
        domains = client.question_domains_and_patterns(start_date, end_date, limit=5)
        print("\n🎯 QUESTION DOMAINS")
        for domain, count in sorted(domains['domains'].items(), key=lambda x: x[1], reverse=True):
            print(f"  {domain:20s} {count:4d}")
        
        if domains['recurring_patterns']:
            print("\n🔄 TOP RECURRING PATTERNS")
            for item in domains['recurring_patterns'][:3]:
                print(f"  {item['count']:2d}x {item['pattern'][:40]}")
    
    else:
        summary = client.daily_summary(report_date)
        
        print(f"Ask Rich Daily Report — {report_date}\n")
        print("=" * 70)
        
        print("\n📊 VOLUME")
        print(f"  Questions:           {summary.question_count}")
        print(f"  Answers:             {summary.answer_count}")
        print(f"  Feedback:            {summary.feedback_count}")
        print(f"  Unique questions:    {summary.unique_questions}")
        print(f"  Unique clients:      {summary.unique_clients}")

        print("\n😊 QUALITY")
        helpful_ratio = (
            summary.helpful_count / (summary.helpful_count + summary.unhelpful_count)
            if (summary.helpful_count + summary.unhelpful_count) > 0
            else 0
        )
        print(f"  Satisfaction:        {format_percentage(helpful_ratio)}")
        print(f"  Helpful:             {summary.helpful_count}")
        print(f"  Unhelpful:           {summary.unhelpful_count}")
        print(f"  Neutral:             {summary.neutral_count}")
        
        print("\n⚡ PERFORMANCE")
        print(f"  Avg latency:         {format_duration(summary.avg_duration_ms)}")
        print(f"  p95 latency:         {format_duration(summary.p95_duration_ms)}")
        print(f"  p99 latency:         {format_duration(summary.p99_duration_ms)}")
        print(f"  Avg citations:       {summary.avg_citations:.2f}")
        
        if summary.question_count == 0:
            print(f"\n⚠️  No activity on {report_date}")
    
    print("\n" + "=" * 70)
    return 0


if __name__ == "__main__":
    sys.exit(main())
