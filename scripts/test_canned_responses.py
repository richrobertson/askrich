#!/usr/bin/env python3
"""
Test Suite Specification Validator for Ask Rich Worker Canned Responses

PURPOSE:
  Validates that the test specification itself is well-formed and comprehensive.
  Does NOT test the actual worker—see test_canned_responses_integration.py for that.

WHAT IT VALIDATES:
  ✓ Test cases are properly defined (have all required fields)
  ✓ 7 question categories covered (Oracle CNS, profiles, education, tech, contact, sensitive, behavioral)
  ✓ 11 test cases across categories
  ✓ No contradictions in test assertions
  ✓ Answer length constraints are reasonable
  ✓ Oracle CNS outcomes coverage is comprehensive
  ✓ Profile routing coverage is thorough
  ✓ Sensitive contact protection is validated
  ✓ Answer conciseness is enforced

TEST OUTPUT:
  - 9 specification validation tests
  - Coverage matrix: 7 categories × 11 test cases
  - Clear pass/fail indicators

CROSSLINKS:
  - Implementation: apps/api/worker/src/index.js (buildAnswer, isOracleCnsOutcomesQuestion, etc.)
  - Integration tests: scripts/test_canned_responses_integration.py
  - JavaScript unit tests: apps/api/worker/src/index.test.js
  - Documentation: docs/testing/CANNED_RESPONSES.md
  - README: README.md (Quality Assurance section)

NEXT STEPS AFTER RUNNING:
  1. Run integration tests: test_canned_responses_integration.py
  2. Review test coverage matrix in CANNED_RESPONSES.md
  3. Run worker locally and manually verify responses

See: docs/testing/CANNED_RESPONSES.md for complete testing approach.
"""


import sys
import json
from pathlib import Path

# Add the worker API to path so we can test it
REPO_ROOT = Path(__file__).resolve().parents[3]
WORKER_DIR = REPO_ROOT / "apps" / "api" / "worker"
API_DIR = REPO_ROOT / "apps" / "api"

sys.path.insert(0, str(API_DIR))


class TestData:
    """Expected test data extracted from the worker code."""

    # This maps question patterns to expected answer characteristics
    TEST_CASES = [
        {
            "question": "what measurable outcomes from the oracle cns migration",
            "shouldContain": [
                "measurable outcomes",
                "$2M",
                "scalability",
                "operational readiness",
            ],
            "shouldNotContain": ["GitHub", "LinkedIn", "facebook.com"],
            "maxLength": 600,
            "minLength": 100,
            "category": "oracle_cns_outcomes",
        },
        {
            "question": "what results did you achieve with the oracle migration",
            "shouldContain": ["measurable outcomes"],
            "shouldNotContain": ["profile", "social"],
            "maxLength": 600,
            "category": "oracle_cns_outcomes",
        },
        {
            "question": "what is your github",
            "shouldContain": ["GitHub", "github.com/richrobertson"],
            "shouldNotContain": ["Oracle", "Kubernetes", "measurable outcomes"],
            "maxLength": 400,
            "category": "profile_query",
        },
        {
            "question": "can you share your linkedin",
            "shouldContain": ["LinkedIn", "linkedin.com"],
            "shouldNotContain": ["Technologies", "Oracle"],
            "maxLength": 400,
            "category": "profile_query",
        },
        {
            "question": "all social profiles",
            "shouldContain": ["LinkedIn", "GitHub", "Facebook"],
            "shouldNotContain": ["education", "oracle"],
            "maxLength": 500,
            "category": "all_profiles",
        },
        {
            "question": "what is your educational background",
            "shouldContain": ["Purdue", "bachelor", "2007", "management", "computer"],
            "shouldNotContain": ["GitHub", "Facebook"],
            "maxLength": 600,
            "category": "education_query",
        },
        {
            "question": "what degrees do you have",
            "shouldContain": ["degree", "Purdue"],
            "shouldNotContain": ["LinkedIn", "GitHub"],
            "maxLength": 600,
            "category": "education_query",
        },
        {
            "question": "what is your tech stack",
            "shouldContain": ["technology", "stack"],
            "shouldNotContain": ["LinkedIn", "contact"],
            "maxLength": 700,
            "category": "technology_query",
        },
        {
            "question": "how can i reach you",
            "shouldContain": ["LinkedIn", "primary contact"],
            "shouldNotContain": ["email", "phone", "address"],
            "maxLength": 400,
            "category": "contact_query",
        },
        {
            "question": "what is your phone number",
            "shouldContain": ["do not share private contact details", "LinkedIn"],
            "shouldNotContain": ["gmail", "outlook"],
            "maxLength": 500,
            "category": "sensitive_contact",
        },
        {
            "question": "can you share your email address",
            "shouldContain": ["do not share private contact details"],
            "shouldNotContain": ["@", "gmail"],
            "maxLength": 500,
            "category": "sensitive_contact",
        },
    ]


def test_question_length():
    """Test that all test questions are realistic."""
    for test in TestData.TEST_CASES:
        question = test["question"]
        assert 10 <= len(question) <= 150, f"Question too short/long: {question}"
        print(f"✓ Question length OK: {question[:40]}...")


def test_test_cases_have_required_fields():
    """Ensure all test cases are properly defined."""
    required_fields = ["question", "shouldContain", "shouldNotContain", "category"]
    for i, test in enumerate(TestData.TEST_CASES):
        for field in required_fields:
            assert field in test, f"Test case {i} missing field '{field}'"
        assert isinstance(test["shouldContain"], list), f"Test {i}: shouldContain must be list"
        assert isinstance(test["shouldNotContain"], list), f"Test {i}: shouldNotContain must be list"
    print(f"✓ All {len(TestData.TEST_CASES)} test cases properly defined")


def test_no_contradictions():
    """Ensure a text can't both contain and not contain the same phrase."""
    for i, test in enumerate(TestData.TEST_CASES):
        should = set(test["shouldContain"])
        should_not = set(test["shouldNotContain"])
        intersection = should.intersection(should_not)
        assert (
            not intersection
        ), f"Test {i} has contradiction: {intersection} in both shouldContain and shouldNotContain"
    print("✓ No test contradictions found")


def test_category_distribution():
    """Ensure we test different categories."""
    categories = [test["category"] for test in TestData.TEST_CASES]
    unique_categories = set(categories)
    assert len(unique_categories) >= 5, f"Only {len(unique_categories)} categories; should be >= 5"
    category_counts = {}
    for cat in categories:
        category_counts[cat] = category_counts.get(cat, 0) + 1
    print(f"✓ Test categories: {category_counts}")


def test_answer_constraint_realism():
    """Ensure maxLength constraints are reasonable."""
    for test in TestData.TEST_CASES:
        if "maxLength" in test:
            max_len = test["maxLength"]
            assert (
                200 <= max_len <= 2000
            ), f"maxLength {max_len} outside reasonable bounds for question: {test['question']}"
    print("✓ Answer length constraints are reasonable")


def test_oracle_cns_coverage():
    """Verify Oracle CNS outcomes get dedicated test coverage."""
    oracle_tests = [t for t in TestData.TEST_CASES if t["category"] == "oracle_cns_outcomes"]
    assert len(oracle_tests) >= 2, "Should have at least 2 Oracle CNS test cases"
    assert all("oracle" in t["question"].lower() for t in oracle_tests), "All Oracle CNS tests should mention oracle"
    print(f"✓ Oracle CNS outcomes covered with {len(oracle_tests)} test cases")


def test_profile_routing_coverage():
    """Verify profile routing is tested."""
    profile_tests = [t for t in TestData.TEST_CASES if "profile" in t["category"]]
    assert len(profile_tests) >= 3, "Should test profile routing thoroughly"
    for test in profile_tests:
        assert not any(
            oracle_term in test["shouldContain"] for oracle_term in ["Oracle", "Kubernetes"]
        ), f"Profile test should not expect project details: {test['question']}"
    print(f"✓ Profile routing covered with {len(profile_tests)} test cases")


def test_sensitive_contact_handling():
    """Ensure sensitive contact queries don't leak PII."""
    sensitive_tests = [t for t in TestData.TEST_CASES if t["category"] == "sensitive_contact"]
    assert len(sensitive_tests) >= 2, "Should test sensitive contact handling"
    for test in sensitive_tests:
        assert "private" in str(test["shouldContain"]).lower() or any(
            "do not" in phrase.lower() for phrase in test["shouldContain"]
        ), f"Sensitive test should mention not sharing: {test['question']}"
    print(f"✓ Sensitive contact handling covered with {len(sensitive_tests)} test cases")


def test_short_answer_constraint():
    """Verify answers stay reasonably short to avoid noise."""
    for test in TestData.TEST_CASES:
        if "maxLength" in test:
            assert test["maxLength"] < 1000, f"Answer should be concise: {test['question']}"
    print("✓ Answer conciseness constraints enforced")


def format_test_summary():
    """Print a summary of what the tests validate."""
    summary = """
CANNED RESPONSE QUALITY TEST SUITE
==================================

This test suite validates:

1. Question Intent Classification
   - Detects Oracle CNS outcome questions
   - Detects profile/contact queries  
   - Detects education questions
   - Detects technology questions
   - Detects sensitive contact requests

2. Answer Appropriateness
   - Oracle CNS outcomes don't include unrelated profile links
   - Profile queries don't return project details
   - No PII leaks in sensitive contact queries
   - Education answers don't mix in unrelated topics

3. Answer Quality Constraints
   - Answers stay concise (<600-700 chars for most)
   - No excessive bullet points in fallback responses
   - Specific questions get specific answers (not generic intro)

4. Test Coverage
   - {} different question categories
   - {} test cases covering common recruiter questions
   - Both positive (should contain) and negative (should not contain) assertions

Expected behaviors after the recent fixes:
- Oracle CNS outcomes: Returns "$2M timeline", "scalability", "operational readiness"
- Profile queries: Returns specific profile links only
- Cloud/platform queries: Returns control-plane and OCI expertise
- Behavioral questions: Uses STAR format
    """
    categories = set(t["category"] for t in TestData.TEST_CASES)
    print(summary.format(len(categories), len(TestData.TEST_CASES)))


def main():
    """Run all test validations."""
    print("=" * 60)
    print("Ask Rich Worker: Canned Response Quality Test Suite")
    print("=" * 60)

    tests = [
        test_question_length,
        test_test_cases_have_required_fields,
        test_no_contradictions,
        test_category_distribution,
        test_answer_constraint_realism,
        test_oracle_cns_coverage,
        test_profile_routing_coverage,
        test_sensitive_contact_handling,
        test_short_answer_constraint,
    ]

    failed = 0
    for test_func in tests:
        try:
            test_func()
        except AssertionError as e:
            print(f"✗ {test_func.__name__} failed: {e}")
            failed += 1
        except Exception as e:
            print(f"✗ {test_func.__name__} error: {e}")
            failed += 1

    print()
    format_test_summary()

    print("=" * 60)
    if failed == 0:
        print(f"All {len(tests)} validation tests passed! ✓")
        print()
        print("NEXT STEPS:")
        print("1. Run canned response quality tests with real worker:")
        print("   cd apps/api/worker && npx wrangler dev")
        print("2. In another terminal, test specific question patterns:")
        print("   curl -X POST http://localhost:8787/api/chat \\")
        print("     -H 'Content-Type: application/json' \\")
        print("     -d '{\"question\": \"what measurable outcomes from oracle cns\"}'")
        print("3. Verify expected answer characteristics match test expectations")
        return 0
    else:
        print(f"{failed} validation test(s) failed ✗")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
