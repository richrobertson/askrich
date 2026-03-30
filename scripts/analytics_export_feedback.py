#!/usr/bin/env python3
"""
Analytics feedback export script for Milestone 7.

Export negative feedback events for triage and corpus planning.

Usage:
    python3 scripts/analytics_export_feedback.py --weeks 1 --output /tmp/triage.csv
    python3 scripts/analytics_export_feedback.py --start-date 2026-03-01 --end-date 2026-03-30
"""

import argparse
import sys
from datetime import datetime, timedelta
from pathlib import Path

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent / "apps" / "api"))

from analytics import AnalyticsClient  # noqa: E402


def main():
    parser = argparse.ArgumentParser(
        description="Export negative feedback for triage"
    )
    
    date_group = parser.add_mutually_exclusive_group(required=True)
    date_group.add_argument(
        "--weeks",
        type=int,
        help="Export last N weeks of feedback",
    )
    date_group.add_argument(
        "--start-date",
        type=str,
        help="Start date (YYYY-MM-DD)",
    )
    
    parser.add_argument(
        "--end-date",
        type=str,
        help="End date (YYYY-MM-DD)",
    )
    
    parser.add_argument(
        "--output",
        type=str,
        default=None,
        help="Output CSV file path (default: stdout)",
    )
    
    parser.add_argument(
        "--local-dir",
        type=str,
        default=None,
        help="Local events directory for testing (e.g., /tmp/events)",
    )
    
    parser.add_argument(
        "--limit",
        type=int,
        default=100,
        help="Maximum feedback items to export (default: 100)",
    )
    
    args = parser.parse_args()
    
    # Determine date range
    if args.weeks:
        end_date = datetime.now()
        start_date = end_date - timedelta(weeks=args.weeks)
    else:
        end_date = datetime.fromisoformat(args.end_date or datetime.now().strftime("%Y-%m-%d"))
        start_date = datetime.fromisoformat(args.start_date)
    
    start_str = start_date.strftime("%Y-%m-%d")
    end_str = end_date.strftime("%Y-%m-%d")
    
    print(f"Exporting feedback from {start_str} to {end_str}...", file=sys.stderr)
    
    # Create analytics client
    client = AnalyticsClient(local_events_dir=args.local_dir)
    
    # Get negative feedback
    feedback_items = client.get_negative_feedback_events(
        start_date=start_str,
        end_date=end_str,
        limit=args.limit,
    )
    
    print(f"Found {len(feedback_items)} negative feedback items.", file=sys.stderr)
    
    if not feedback_items:
        print("No feedback found for date range.", file=sys.stderr)
        return 0
    
    # Export to CSV
    import csv
    
    output = sys.stdout if not args.output else open(args.output, "w", newline="")
    
    try:
        writer = csv.DictWriter(
            output,
            fieldnames=[
                "timestamp",
                "question",
                "answer_snippet",
                "citations",
                "note",
                "question_id",
                "answer_id",
            ]
        )
        writer.writeheader()
        
        for item in feedback_items:
            answer_snippet = item.answer[:100].replace("\n", " ") if item.answer else ""
            question_text = item.question[:100].replace("\n", " ") if item.question else ""
            
            writer.writerow({
                "timestamp": item.timestamp,
                "question": question_text,
                "answer_snippet": answer_snippet,
                "citations": item.citations_count,
                "note": item.note[:100] if item.note else "",
                "question_id": item.questionEventId,
                "answer_id": item.answerEventId,
            })
        
        if args.output:
            print(f"Exported {len(feedback_items)} items to {args.output}", file=sys.stderr)
    
    finally:
        if args.output:
            output.close()
    
    return 0


if __name__ == "__main__":
    sys.exit(main())
