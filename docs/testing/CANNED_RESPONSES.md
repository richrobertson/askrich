# Canned Response Quality Tests

This directory contains test suites to validate the quality of canned question/answer responses in the Ask Rich worker.

## Overview

The worker contains hardcoded responses for certain question types. See [apps/api/worker/src/index.js](../../../apps/api/worker/src/index.js) for implementation.

Response types tested:
- **Oracle CNS outcomes** - Returns specific measurable results (see `isOracleCnsOutcomesQuestion()`)
- **Profile queries** - Returns public profile links (see `buildProfileResponse()`)
- **Education queries** - Returns degree and university info
- **Technology queries** - Returns tech stack and platforms
- **Behavioral questions** - Returns STAR-formatted answers (see `buildBehavioralAnswer()`)
- **Sensitive contact** - Refuses PII and redirects to LinkedIn

These tests ensure responses are:
- **Focused** - Answers match the question intent (see `buildAnswer()`)
- **Concise** - No excessive noise or irrelevant content
- **Safe** - No PII leaks, especially for contact queries
- **Routed correctly** - Questions route to the right answer pattern (see intent detection)

## Test Suites

### 1. Unit Test Suite: `test_canned_responses.py`

Validates the test **specification** itself - ensures test cases are well-formed and comprehensive.

**Run:**
```bash
python3 scripts/test_canned_responses.py
```

**What it checks:**
- Question/answer test cases are properly defined
- Oracle CNS outcomes get dedicated test coverage
- Profile routing is thoroughly tested
- Sensitive contact handling is validated
- Answer lengths stay reasonable (<600-1000 chars)

**Test cases:** 11 test cases across 7 question categories.
See: `TestData.TEST_CASES` in [scripts/test_canned_responses.py](../../../scripts/test_canned_responses.py).

**Output:**
```
All 9 validation tests passed! ✓

CANNED RESPONSE QUALITY TEST SUITE
- 7 different question categories
- 11 test cases covering common recruiter questions
```

### 2. Integration Test Suite: `test_canned_responses_integration.py`

Tests actual worker responses against quality criteria.

**Prerequisites:**
- Worker running locally: `cd apps/api/worker && npx wrangler dev`

**Run:**
```bash
python3 scripts/test_canned_responses_integration.py [--url http://localhost:8787]
```

**Test cases:**
1. **Oracle CNS Outcomes** - Verifies "$2M timeline", "scalability", "operational readiness"
   - Validates: `isOracleCnsOutcomesQuestion()` routing works correctly
2. **Profile Link Query** - Ensures GitHub URL is returned (not Oracle project details)
   - Validates: Profile routing doesn't mix in unrelated content
3. **Education Query** - Returns Purdue degree info (not profile links)
   - Validates: Education classification prevents profile link injection
4. **All Profiles** - Lists LinkedIn, GitHub, Facebook (no unrelated content)
   - Validates: Complete profile list request works end-to-end
5. **Sensitive Contact** - Refuses phone number and PII (no credentials leaked)
   - Validates: `isSensitiveContactQuery()` properly protects private contact info
6. **Technology Query** - Returns tech stack info (no profile links)
   - Validates: Technology classification isolates tech-specific answers

**Example output:**
```
Testing: Oracle CNS Outcomes
  ✓ Pass

Testing: Profile Link Query
  ✓ Pass

All 6 integration tests passed! ✓
```

**Related code:**
- Worker intent detection: [apps/api/worker/src/index.js](../../../apps/api/worker/src/index.js)
- Profile response builder: `buildProfileResponse()` in worker
- Answer builder: `buildAnswer()` in worker

### 3. Worker Test File: `apps/api/worker/src/index.test.js`

JavaScript/Vitest-based unit tests for answer functions. 40+ test assertions.

**Test coverage:**
- Question intent detection (`isBehavioralQuestion()`, `isOracleCnsOutcomesQuestion()`, etc.)
- Profile response routing (`buildProfileResponse()`)
- Answer quality constraints (length, content, bulleting)
- STAR answer formatting (`formatStarAnswer()`)
- Behavioral answer quality (`buildBehavioralAnswer()`)
- Corpus ranking (`rankCorpus()`)
- Integration: end-to-end answer quality for common questions

**Currently:** Test file created but requires `npm install vitest` and Node.js runtime.
**Status:** Ready to run when Node environment is available.

**Test structure:**
```javascript
describe('Canned Response Quality Tests', () => {
  describe('Question Intent Detection', () => { ... })
  describe('Oracle CNS Outcomes Answer Quality', () => { ... })
  describe('Profile Query Routing', () => { ... })
  // ... more test suites
})
```

See: [apps/api/worker/src/index.test.js](../../../apps/api/worker/src/index.test.js)

## Test Data

Test cases defined in `TestData.TEST_CASES` in `test_canned_responses.py`:

| Question Pattern | Expected Behavior | Validation |
|---|---|---|
| "oracle cns outcomes" | Returns "$2M", "scalability", "operational readiness" | Must not include profile links |
| "what is your github" | Returns GitHub URL | Must not include Oracle/project details |
| "all social profiles" | Lists LinkedIn, GitHub, Facebook | Single focused response |
| "educational background" | Returns Purdue, degree, 2007 | No profile links |
| "phone number" (sensitive) | "do not share private contact details" | No @, no digits |
| "tech stack" | Returns technologies | No contact info |

## Recent Improvements

PR: Improved canned answer quality

**Changes:**
- Added specific Oracle CNS outcomes path instead of generic fallback
- Changed intent classification from retrieved text to user question
- Reduced fallback bullets from 3 to 2 (less noise)
- Added cloud/control-plane relevance summary
- Tightened profile routing so non-profile questions don't get profile links

**Result:** 
- Oracle outcomes questions get focused answers (~200 chars) instead of mixing in profile links
- Profile queries return only profile info (no project details)
- Technology queries get tech-specific answers

## CI/CD Integration

Add to your CI pipeline:

```bash
# Unit test the test specification
python3 scripts/test_canned_responses.py

# Integration test against running worker (requires worker to be up)
python3 scripts/test_canned_responses_integration.py --url https://your-worker-url
```

## Extending Tests

To add a new canned response quality test:

1. Add test case to `TestData.TEST_CASES` in `test_canned_responses.py`:
   ```python
   {
       "question": "your question here",
       "shouldContain": ["phrase1", "key_concept"],
       "shouldNotContain": ["unwanted"],
       "maxLength": 600,
       "category": "category_name"
   }
   ```

2. If adding a new answer category, implement the detection logic in the worker (e.g., `isMyQueryType()`)

3. Run the tests:
   ```bash
   python3 scripts/test_canned_responses.py  # Validate test definition
   python3 scripts/test_canned_responses_integration.py  # Test actual responses
   ```

## Troubleshooting

### Integration test fails with "Worker is not responding"
```bash
# Start the worker in a separate terminal
cd apps/api/worker
npx wrangler dev

# In another terminal, run the test
python3 scripts/test_canned_responses_integration.py
```

### Answer too long error
If an answer exceeds `maxLength`, it indicates the fallback is returning too many bullets or including irrelevant content.

**Debug:**
1. Check which phrase triggered the long response
2. Review `buildAnswer()` in `apps/api/worker/src/index.js`
3. May indicate a question is routing to the wrong path

### Missing expected phrase
If a test fails because an expected phrase is missing:
1. Verify the corpus has the phrase (check `CORPUS` in `index.js`)
2. Check if question-intent detection is working (`isBehavioralQuestion`, etc.)
3. Review answer building logic for the question category

## Files

- `scripts/test_canned_responses.py` - Unit test specification validator
- `scripts/test_canned_responses_integration.py` - Live worker integration tests
- `apps/api/worker/src/index.test.js` - JavaScript unit tests (requires Node runtime)
- `apps/api/worker/package.json` - Test dependencies
