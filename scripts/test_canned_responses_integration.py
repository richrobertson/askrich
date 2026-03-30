#!/usr/bin/env python3
"""
Integration Test: Canned Response Quality Against Live Worker

PURPOSE:
  Validates that actual worker responses match quality expectations.
  Tests run against a live worker instance (local or remote).

WHAT IT TESTS:
  ✓ Oracle CNS outcomes: Returns $2M timeline, scalability, operational readiness
  ✓ Profile queries: Returns GitHub/LinkedIn only (no project details)
  ✓ Education queries: Returns Purdue degree (no unrelated content)
  ✓ All profiles: Lists all social profiles correctly
  ✓ Sensitive contact: Refuses PII appropriately
  ✓ Technology queries: Returns tech stack (no profile links)

PREREQUISITES:
  Worker must be running locally:
    cd apps/api/worker && npx wrangler dev

USAGE:
  python3 scripts/test_canned_responses_integration.py [--url http://localhost:8787]

TEST COVERAGE:
  6 integration test cases covering:
  - Oracle CNS outcomes question routing (isOracleCnsOutcomesQuestion)
  - Profile response building (buildProfileResponse)
  - Answer quality validation (buildAnswer routing)
  - PII protection (isSensitiveContactQuery)
  - Answer length constraints

CROSSLINKS:
  - Test specification: scripts/test_canned_responses.py
  - JavaScript unit tests: apps/api/worker/src/index.test.js
  - Worker implementation: apps/api/worker/src/index.js
  - Documentation: docs/testing/CANNED_RESPONSES.md
  - README: README.md (Quality Assurance section)
  - Architecture: docs/architecture.md

WORKFLOW:
  1. Start worker: cd apps/api/worker && npx wrangler dev
  2. Run spec validator: python3 scripts/test_canned_responses.py
  3. Run integration tests: python3 scripts/test_canned_responses_integration.py
  4. Check coverage: see docs/testing/CANNED_RESPONSES.md

See: docs/testing/CANNED_RESPONSES.md for complete testing guide.
"""

import json
import argparse
from urllib.request import Request, urlopen
from urllib.error import URLError


class CannedResponseValidator:
    def __init__(self, base_url="http://localhost:8787", origin=None, user_agent=None):
        self.base_url = base_url.rstrip("/")
        self.endpoint = f"{self.base_url}/api/chat"
        self.origin = origin.strip() if isinstance(origin, str) and origin.strip() else None
        self.user_agent = user_agent or (
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/123.0.0.0 Safari/537.36"
        )

    def _build_headers(self, include_json=True):
        headers = {
            "Accept": "application/json",
            "User-Agent": self.user_agent,
        }
        if include_json:
            headers["Content-Type"] = "application/json"
        if self.origin:
            headers["Origin"] = self.origin
            headers["Referer"] = f"{self.origin.rstrip('/')}/"
        return headers

    def test_health(self):
        """Check if worker is reachable."""
        try:
            health_url = f"{self.base_url}/health"
            req = Request(health_url, headers=self._build_headers(include_json=False), method="GET")
            with urlopen(req, timeout=5) as response:  # nosec B310
                data = json.loads(response.read().decode())
                return data.get("status") == "ok"
        except Exception as e:
            print(f"✗ Health check failed: {e}")
            return False

    def ask_question(self, question, top_k=5):
        """Send a question to the worker and get the answer."""
        payload = json.dumps({"question": question, "top_k": top_k}).encode("utf-8")
        req = Request(
            self.endpoint,
            data=payload,
            headers=self._build_headers(include_json=True),
            method="POST",
        )

        try:
            with urlopen(req, timeout=10) as response:  # nosec B310
                result = json.loads(response.read().decode())
                if result.get("success"):
                    return result.get("data", {})
                else:
                    print(f"  Error: {result.get('error')}")
                    return None
        except URLError as e:
            print(f"  Request failed: {e}")
            return None

    def validate_answer(self, question, answer, shouldContain, shouldNotContain, maxLength):
        """Validate an answer against quality criteria."""
        if answer is None:
            return False, "Answer is None"

        answer_lower = answer.lower()

        # Check length
        if len(answer) > maxLength:
            return False, f"Answer too long ({len(answer)} > {maxLength})"

        # Check shouldContain
        missing = []
        for phrase in shouldContain:
            if phrase.lower() not in answer_lower:
                missing.append(phrase)

        if missing:
            return False, f"Missing expected phrases: {missing}"

        # Check shouldNotContain
        unwanted = []
        for phrase in shouldNotContain:
            if phrase.lower() in answer_lower:
                unwanted.append(phrase)

        if unwanted:
            return False, f"Found unwanted phrases: {unwanted}"

        return True, "Pass"

    def test_oracle_cns_outcomes(self):
        """Test Oracle CNS outcomes question."""
        question = "what measurable outcomes from the oracle cns migration"
        data = self.ask_question(question)
        if not data:
            return False, "Failed to get answer"

        answer = data.get("answer", "")
        return self.validate_answer(
            question,
            answer,
            ["measurable outcomes", "$2M", "scalability", "operational readiness"],
            ["GitHub", "LinkedIn", "facebook.com"],
            600,
        )

    def test_profile_link_query(self):
        """Test profile link query."""
        question = "what is your github"
        data = self.ask_question(question)
        if not data:
            return False, "Failed to get answer"

        answer = data.get("answer", "")
        return self.validate_answer(
            question,
            answer,
            ["GitHub", "github.com/richrobertson"],
            ["Oracle", "Kubernetes", "measurable outcomes"],
            400,
        )

    def test_education_query(self):
        """Test education query."""
        question = "what is your educational background"
        data = self.ask_question(question)
        if not data:
            return False, "Failed to get answer"

        answer = data.get("answer", "")
        return self.validate_answer(
            question,
            answer,
            ["Purdue", "bachelor", "2007", "management", "computer"],
            ["GitHub", "Facebook"],
            600,
        )

    def test_all_profiles(self):
        """Test requesting all profiles."""
        question = "all social profiles"
        data = self.ask_question(question)
        if not data:
            return False, "Failed to get answer"

        answer = data.get("answer", "")
        return self.validate_answer(
            question,
            answer,
            ["LinkedIn", "GitHub", "Facebook"],
            [],
            500,
        )

    def test_sensitive_contact(self):
        """Test sensitive contact (should not leak PII)."""
        question = "what is your phone number"
        data = self.ask_question(question)
        if not data:
            return False, "Failed to get answer"

        answer = data.get("answer", "")
        return self.validate_answer(
            question,
            answer,
            ["do not share private contact details", "LinkedIn"],
            ["@", "555", "phone"],
            500,
        )

    def test_technology_query(self):
        """Test technology query."""
        question = "what is your tech stack"
        data = self.ask_question(question)
        if not data:
            return False, "Failed to get answer"

        answer = data.get("answer", "")
        # Just check length and no profile links
        passed = len(answer) < 800 and "LinkedIn" not in answer
        return (passed, "Pass") if passed else (False, "Answer too long or has profile links")

    def test_technology_passion_simple(self):
        """Test simple technology passion query (tell me about technologies)."""
        question = "tell me about technologies"
        data = self.ask_question(question)
        if not data:
            return False, "Failed to get answer"

        answer = data.get("answer", "")
        return self.validate_answer(
            question,
            answer,
            ["technology", "cloud", "Kubernetes"],
            ["LinkedIn", "GitHub", "profile"],
            800,
        )

    def test_technology_passion_detailed(self):
        """Test detailed technology passion query (describe your tech expertise)."""
        question = "describe your tech expertise and passion"
        data = self.ask_question(question)
        if not data:
            return False, "Failed to get answer"

        answer = data.get("answer", "")
        return self.validate_answer(
            question,
            answer,
            ["technology", "Kubernetes", "backend"],
            ["Contact point", "oracle outcomes"],
            800,
        )


def main():
    parser = argparse.ArgumentParser(
        description="Test canned response quality against a live worker instance"
    )
    parser.add_argument("--url", default="http://localhost:8787", help="Worker base URL")
    parser.add_argument("--origin", default=None, help="Optional Origin header for prod edge routes")
    parser.add_argument(
        "--user-agent",
        default=(
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/123.0.0.0 Safari/537.36"
        ),
        help="User-Agent header used for requests",
    )
    args = parser.parse_args()

    print("=" * 60)
    print("Canned Response Quality Integration Test")
    print("=" * 60)
    print(f"Worker URL: {args.url}")
    if args.origin:
        print(f"Origin header: {args.origin}")
    print()

    validator = CannedResponseValidator(args.url, origin=args.origin, user_agent=args.user_agent)

    # Health check
    print("Checking worker health...")
    if not validator.test_health():
        print("✗ Worker is not responding. Start the worker first:")
        print("  cd apps/api/worker && npx wrangler dev")
        return 1

    print("✓ Worker is healthy")
    print()

    # Run tests
    tests = [
        ("Oracle CNS Outcomes", validator.test_oracle_cns_outcomes),
        ("Profile Link Query", validator.test_profile_link_query),
        ("Education Query", validator.test_education_query),
        ("All Profiles", validator.test_all_profiles),
        ("Sensitive Contact (PII Protection)", validator.test_sensitive_contact),
        ("Technology Query", validator.test_technology_query),
        ("Technology Passion - Simple", validator.test_technology_passion_simple),
        ("Technology Passion - Detailed", validator.test_technology_passion_detailed),
    ]

    passed = 0
    failed = 0

    print("Running integration tests:")
    print()

    for test_name, test_func in tests:
        print(f"Testing: {test_name}")
        success, message = test_func()
        if success:
            print(f"  ✓ {message}")
            passed += 1
        else:
            print(f"  ✗ {message}")
            failed += 1
        print()

    print("=" * 60)
    if failed == 0:
        print(f"All {passed} integration tests passed! ✓")
        return 0
    else:
        print(f"{passed} passed, {failed} failed ✗")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
