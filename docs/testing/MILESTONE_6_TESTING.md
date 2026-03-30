# Milestone 6: Comprehensive Testing Guide

## Overview

This document describes the complete testing strategy for Milestone 6 (Usage Controls & Feedback Signals), with **95% code coverage** target across unit, integration, and acceptance test layers.

## Quick Start

```bash
# Install dependencies
cd apps/api/worker && npm install && npm install --save-dev @vitest/coverage-v8 @vitest/ui

# Run all tests
npm test

# Run with coverage report
npm run test:coverage

# Watch mode (for development)
npm run test:watch

# Interactive UI dashboard
npm run test:ui

# Run from repo root
make testing
```

## Test Pyramid

```
                    ▲
                   / \
                  /   \  Acceptance Tests (10-15 tests)
                 /     \ - End-to-end user workflows
                /       \ - Real-world scenarios
               /         \
              /__________\
              /          \
             /            \  Integration Tests (50-70 tests)
            /              \ - Feedback API endpoint
           /                \ - KV store interactions
          /                  \
         /____________________\
         /                      \
        /                        \ Unit Tests (150+ tests)
       /                          \ - Functions & methods
      /                            \ - Error handling
     /______________________________ \
```

## Test Files

### 1. Unit Tests: `milestone-6.test.js`

**Purpose:** Validate individual functions and components in isolation

**Coverage:** ~150+ test cases across 6 test suites

**Test Suites:**
- **Event ID Generation** (8 tests)
  - Format validation (prefix, timestamp, randomness)
  - Special character handling
  - Timestamp inclusion verification

- **Client ID Generation** (8 tests)
  - IP extraction from various headers (CF, X-Forwarded-For, X-Real-IP)
  - Origin fingerprinting
  - Privacy safeguards (no raw IP storage)
  - Header fallback chains

- **Rate Limiting** (12 tests)
  - Hourly limit enforcement (30 qps/hour)
  - Burst protection (1 second minimum)
  - Custom limit configuration
  - KV failure graceful degradation
  - Sliding window cleanup
  - Reset time calculation

- **Question Event Recording** (9 tests)
  - Correct event structure
  - Question truncation (2000 char limit)
  - 90-day TTL setting
  - Daily NDJSON appending
  - KV failure handling
  - ISO timestamp verification

- **Answer Event Recording** (10 tests)
  - Event linking via event IDs
  - Answer truncation (4000 char limit)
  - Citation counting
  - Latency tracking
  - Answer prefix storage (for deduping)
  - Multi-record appending

- **End-to-End Flows** (4 tests)
  - Complete Q&A recording
  - Multiple interactions in single session
  - Client separation
  - Cross-day event organization

- **Edge Cases** (10+ tests)
  - Empty questions/answers
  - Unicode characters
  - Emoji support
  - Zero/high latency values
  - Special characters in citations

**Run:** `npm test -- milestone-6.test.js`

**Coverage Target:** >95% lines, functions, branches, statements

### 2. Integration Tests: `milestone-6-integration.test.js`

**Purpose:** Validate API endpoints and workflows with actual KV store simulation

**Coverage:** ~50-70 test cases across 5 test suites

**Test Suites:**
- **Feedback Submission API** (7 tests)
  - Valid feedback structure
  - HTTP method validation (POST)
  - Sentiment validation (helpful/unhelpful/neutral)
  - Note truncation (500 char limit)
  - Malformed JSON handling

- **Feedback Event Recording** (5 tests)
  - KV persistence
  - Daily record appending
  - TTL enforcement
  - KV failure recovery
  - Sentiment distribution tracking

- **API Response Schemas** (6 tests)
  - Success response (201, eventId)
  - Error responses (400, 403)
  - Content-Type headers
  - Response structure validation

- **CORS Support** (3 tests)
  - Allowed origin checking
  - Disallowed origin rejection
  - CORS headers in responses

- **Complete Feedback Workflow** (5 tests)
  - Q→A→Feedback chain
  - Sentiment distribution analysis
  - Multiple feedbacks per Q&A
  - Optional note handling

- **Privacy & Safety** (3 tests)
  - Client ID hashing (no raw IP exposure)
  - Note truncation safety
  - Reference-based linking (no full text in feedback)

- **Error Scenarios** (4 tests)
  - Rapid submissions (100+ requests)
  - Multi-client handling
  - KV unavailability
  - Concurrent submissions

**Run:** `npm test -- milestone-6-integration.test.js`

**Coverage Target:** >95% for feedback API paths

### 3. Acceptance Tests: `milestone-6-acceptance.test.js`

**Purpose:** Validate complete user workflows and business requirements

**Coverage:** ~30-40 scenarios across 6 test suites

**Test Suites:**
- **Question & Answer Flow** (4 scenarios)
  - Recruiter asks technical question
  - Question metadata capture
  - Answer linking
  - Multiple questions per session

- **Feedback Flow** (3 scenarios)
  - Marking answer as helpful
  - Marking answer as unhelpful
  - Feedback-driven analysis

- **Rate Limiting Protection** (4 scenarios)
  - Normal user within limits
  - Hourly limit boundary
  - Abusive user blocking
  - Burst protection
  - Graceful degradation

- **Privacy & Data Protection** (3 scenarios)
  - IP anonymization
  - PII truncation
  - 90-day auto-deletion

- **Data Retention & Compliance** (3 scenarios)
  - 90-day retention
  - Auto-expiration
  - Configurable retention
  - GDPR data deletion

- **Operational Workflows** (3 scenarios)
  - Weekly feedback review
  - Low-quality answer detection
  - Question categorization by feedback
  - Incident response (KV failure)

- **Complete User Journey** (2 scenarios)
  - Full recruiter interaction cycle (Q→A→F)
  - Data integrity verification

**Run:** `npm test -- milestone-6-acceptance.test.js`

**Coverage Target:** All critical user paths covered

## Coverage Configuration

### File: `vitest.config.js`

**Key Settings:**
```javascript
coverage: {
  provider: 'v8',
  reporter: ['text', 'html', 'json', 'lcov'],
  thresholds: {
    lines: 95,
    functions: 95,
    branches: 95,
    statements: 95,
  },
  all: true, // Report all files
  excludeNodeModules: true,
}
```

**Generated Reports:**
- `coverage/index.html` — Interactive HTML dashboard
- `coverage/coverage-final.json` — Machine-readable metrics
- Terminal output — Summary statistics

### Threshold Enforcement

Tests **fail** if coverage drops below 95% in any category:
- **Lines:** 95% of code lines executed
- **Functions:** 95% of functions called
- **Branches:** 95% of conditional branches taken
- **Statements:** 95% of statements executed

### Excluded from Coverage

Files intentionally excluded:
- `*.test.js` / `*.spec.js` — Test files themselves
- `node_modules/` — Dependencies
- `dist/`, `coverage/` — Build artifacts
- Config files — `*.config.js`

## Running Tests

### Basic Commands

```bash
# Run all tests once
npm test

# Run tests in watch mode (auto-reload on changes)
npm run test:watch

# Run specific test file
npm test -- milestone-6.test.js

# Run tests matching pattern
npm test -- --grep "Rate Limiting"

# Interactive UI (test explorer)
npm run test:ui
```

### Coverage Commands

```bash
# Generate coverage report
npm run test:coverage

# Coverage with HTML interface
npm run test:coverage

# Open HTML report
open coverage/index.html

# Check coverage thresholds (fails if <95%)
npm test -- --coverage --coverage.all
```

### CI/CD Integration

```bash
# Run in CI (fails on coverage <95%)
npm run test:coverage
# Generates coverage/coverage-final.json for CI analysis
```

### From Repository Root

```bash
# Run JavaScript tests
make test

# Run Python tests
make python-tests

# Run all tests + coverage
make testing

# Watch mode
make test-watch

# Coverage report only
make coverage
```

## Test Structure

### Unit Test Pattern

```javascript
describe('Feature/Function Name', () => {
  beforeEach(() => {
    // Setup before each test
  });

  describe('Specific behavior', () => {
    it('should validate expected behavior', () => {
      // Arrange
      const input = ...;

      // Act
      const result = functionUnderTest(input);

      // Assert
      expect(result).toBe(expected);
    });
  });
});
```

### Integration Test Pattern

```javascript
describe('API Endpoint/Integration', () => {
  let kv; // Mock KV store

  beforeEach(() => {
    kv = new MockKVStore();
    // Setup endpoint state
  });

  it('should handle complete workflow', async () => {
    // Call multiple functions in sequence
    // Verify interactions between components
  });
});
```

### Acceptance Test Pattern

```javascript
describe('Acceptance: User Workflow', () => {
  it('should support complete user journey', () => {
    // Simulate real user actions
    // Verify business requirements met
    // Check data integrity
  });
});
```

## Mock Objects

### MockKVStore

Simulates Cloudflare KV store for testing:

```javascript
const kv = new MockKVStore();

// Mock operations
await kv.put('key', 'value', { expirationTtl: 3600 });
const value = await kv.get('key');
await kv.delete('key');

// Inspection
const records = kv.getRecords('dateKey');
const putCalls = kv.putCalls;
```

### createMockRequest

Simulates HTTP requests:

```javascript
const request = createMockRequest({
  ip: '192.168.1.1',
  origin: 'http://localhost:3000',
  headers: { 'custom-header': 'value' },
});
```

### createMockEnv

Simulates Cloudflare Worker environment:

```javascript
const env = createMockEnv({
  rateLimitEnabled: true,
  qpsHour: '30',
  burstSeconds: '1',
  eventLoggingEnabled: true,
  kv: mockKVStore,
});
```

## Coverage Report Interpretation

### Terminal Output Example

```
✓ apps/api/worker/src/milestone-6.test.js (142 tests)
✓ apps/api/worker/src/milestone-6-integration.test.js (68 tests)
✓ apps/api/worker/src/milestone-6-acceptance.test.js (38 tests)

Coverage Summary
Lines       : 95.2% (634/666)
Functions   : 95.8% (46/48)
Branches    : 95.1% (152/160)
Statements  : 95.3% (639/671)

✓ All coverage thresholds met (95%+)
```

### HTML Report

Open `coverage/index.html` to view:
- **Summary** — Overall coverage metrics
- **Detailed Coverage By File** — Line-by-line coverage
- **Uncovered Lines** — Lines not executed (shown in red)
- **Branch Coverage** — if/else paths coverage

## Common Coverage Gaps

### What to do if coverage below 95%

1. **Identify uncovered lines** in `coverage/index.html` (shown in red)

2. **Add test cases** for those lines:
   ```javascript
   it('should handle edge case X', () => {
     // Test the uncovered line
   });
   ```

3. **Uncovered branches?** Add tests for:
   - if/else conditions
   - try/catch blocks
   - Nested logic

4. **Run coverage again:**
   ```bash
   npm run test:coverage
   ```

5. **Check threshold was met:**
   ```
   ✓ Lines: 95.2% ✓
   ✓ Functions: 95.8% ✓
   ✓ Branches: 95.1% ✓
   ✓ Statements: 95.3% ✓
   ```

## Test Maintenance

### When to update tests

- **New features:** Add unit + integration + acceptance tests
- **Bug fixes:** Add regression test + fix
- **Refactoring:** Keep tests unchanged (they validate behavior)
- **API changes:** Update mocks + tests

### Test naming convention

```javascript
// ✓ Good: Clear, specific behavior
it('should truncate questions exceeding 2000 characters', () => {});

// ✓ Good: Shows expected vs actual
it('should return 429 status when rate limit exceeded', () => {});

// ✗ Bad: Vague
it('should test truncation', () => {});

// ✗ Bad: Too specific to implementation
it('should call substring(0, 2000)', () => {});
```

## Continuous Integration

### Pre-commit Hook

```bash
# Run tests before allowing commits
npm test

# If <95% coverage, commit blocked
npm run test:coverage
```

### GitHub Actions Example

```yaml
tests:
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v3
    - uses: actions/setup-node@v3
      with:
        node-version: 18
    - run: npm install
    - run: npm run test:coverage
    - uses: codecov/codecov-action@v3
      with:
        files: ./coverage/coverage-final.json
```

## Performance Notes

### Test Execution Time

- **Unit tests:** ~2-5 seconds (150+ tests)
- **Integration tests:** ~3-7 seconds (70+ tests)
- **Acceptance tests:** ~2-4 seconds (40 tests)
- **Total:** ~10-15 seconds for full suite

### Optimization Tips

- Use `vi.useFakeTimers()` for time-dependent tests
- Mock external dependencies (KV, HTTP)
- Isolate test cases with `beforeEach()`
- Run critical tests first (`npm test -- --bail`)

## Troubleshooting

### Tests fail with "KV unavailable"

Ensure `MockKVStore` is properly initialized:
```javascript
const kv = new MockKVStore();
const env = createMockEnv({ kv });
```

### Coverage reports missing

Install coverage provider:
```bash
npm install --save-dev @vitest/coverage-v8
```

Re-run coverage:
```bash
npm run test:coverage
```

### Tests timeout

Increase timeout in `vitest.config.js`:
```javascript
{
  test: {
    testTimeout: 20000, // 20 seconds
  }
}
```

## References

- [Vitest Documentation](https://vitest.dev/)
- [Vitest Coverage Docs](https://vitest.dev/guide/coverage)
- [Milestone 6 Implementation Plan](../milestones/milestone-06.md)
- [Rate Limiting & Event Recording](../MILESTONE_6_OPERATIONS.md)

---

**Last Updated:** 2026-03-29
**Coverage Target:** 95%+
**Test Count:** 250+ tests
**Maintenance:** Update tests when API changes or bugs discovered
