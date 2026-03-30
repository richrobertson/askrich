/**
 * Vitest Configuration for Milestone 6 Testing
 *
 * This configuration enforces:
 * - 95% code coverage across all metrics (lines, functions, branches, statements)
 * - Automatic coverage reports in HTML, JSON, and terminal formats
 * - Detailed branch coverage tracking
 * - Support for coverage thresholds per file
 *
 * RUNNING TESTS WITH COVERAGE:
 *   npm run test:coverage              # Run tests and generate coverage report
 *   npm run test:coverage:html         # Open HTML coverage report
 *
 * COVERAGE REPORTS GENERATED:
 *   - coverage/index.html              # Interactive HTML report
 *   - coverage/coverage-final.json     # Machine-readable JSON
 *   - stdout                          # Terminal summary
 *
 * DESIGN PRINCIPLES:
 *   1. Fail fast: Stop on first error with bail: 0
 *   2. Isolate tests: Each test runs in isolated environment
 *   3. Parallel execution: Use worker threads for speed
 *   4. Comprehensive coverage: 95% threshold on all source files
 *   5. Multiple reporters: Different formats for different use cases (CI/CD, local, dashboards)
 */
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // ========================================================================
    // TEST ENVIRONMENT & RUNTIME
    // ========================================================================
    
    // Use Node.js test environment (not browser/jsdom)
    environment: 'node',
    // Enable global test functions (describe, it, expect) without imports
    globals: true,

    // ========================================================================
    // CODE COVERAGE CONFIGURATION
    // ========================================================================
    
    coverage: {
      // V8 is the recommended coverage provider for JavaScript
      // Provides accurate branch coverage and inline source maps
      provider: 'v8',

      // SOURCE FILES TO ANALYZE
      // Include all JS files except test files that are already excluded
      include: [
        'src/**/*.js',
        '!src/**/*.test.js',
        '!src/**/*.spec.js',
      ],

      // EXCLUDE FROM COVERAGE ANALYSIS
      // Test files and node_modules are already excluded
      exclude: [
        'node_modules/',
        'dist/',
        'coverage/',
        '**/*.test.js',
        '**/*.spec.js',
        '**/*.config.js',
      ],

      // ======================================================================
      // COVERAGE REPORTERS
      // ======================================================================
      // Multiple formats for different consumption methods:
      // - text: Human-readable terminal output
      // - json: Machine-readable for metrics/dashboards
      // - html: Interactive report for local browsing
      // - lcov: Standard format for CI/CD integration
      reporter: [
        'text',           // Terminal output (summary + detailed)
        'text-summary',   // Terminal summary only
        'json',           // Machine-readable JSON
        'html',           // Interactive HTML report
        'html-spa',       // Single-page HTML report
        'lcov',           // LCOV format for CI integration
        'json-summary',   // Summary JSON for CI
      ],

      // Directory where all coverage reports are written
      reportsDirectory: './coverage',

      // ======================================================================
      // COVERAGE THRESHOLDS
      // ======================================================================
      // MANDATORY: All metrics must be >= 95% or tests fail
      // Ensures code quality and catches regressions
      // Metrics:
      //   - lines: % of source code lines executed
      //   - functions: % of functions called
      //   - branches: % of conditional branches taken
      //   - statements: % of statements executed
      thresholds: {
        // Global thresholds (applied to all source files)
        lines: 95,
        functions: 95,
        branches: 95,
        statements: 95,
      },

      // Report coverage for ALL files, not just tested ones
      // Ensures dead/untested code is visible in reports
      all: true,

      // Track branch transition coverage (more granular than basic branch coverage)
      // Detects both: line A→B and line B→A paths
      includeBranchTransitions: true,

      // Automatically exclude node_modules from coverage
      excludeNodeModules: true,

      // Transform coverage data on every run (ensures fresh reports)
      forceReportTransform: true,

      // Fail tests if coverage thresholds not met
      // Prevents coverage degradation
      reportOnFailure: true,
    },

    // ========================================================================
    // TEST EXECUTION CONFIGURATION
    // ========================================================================
    
    // Test reporters: how results are displayed
    // 'verbose' shows each test name and result
    // 'html' generates interactive report
    reporters: ['verbose', 'html'],

    // Include source maps for better error messages and stack traces
    sourcemap: true,

    // Timeout for individual test cases (10 seconds)
    // Prevents hanging tests from blocking test suite
    testTimeout: 10000,

    // Whether to stop on first failure
    // 0 = continue running all tests and report failures at end
    bail: 0,

    // ========================================================================
    // TEST ISOLATION & PARALLELIZATION
    // ========================================================================
    
    // Run each test in isolated environment
    // Prevents test pollution and cross-contamination
    isolate: true,

    // Enable parallel test execution using worker threads
    // Significant speedup on multi-core machines
    threads: true,
    maxThreads: 4,  // Use up to 4 workers
    minThreads: 1,  // Always use at least 1 worker

    // ========================================================================
    // TEST DISCOVERY & INCLUSION
    // ========================================================================
    
    // Patterns for test files to run
    include: [
      '**/*.test.{js,ts}',
      '**/*.spec.{js,ts}',
    ],

    // Files/directories to exclude from test discovery
    exclude: [
      'node_modules',
      'dist',
      '.idea',
      '.git',
      '.cache',
      'coverage',
    ],

    // ========================================================================
    // SNAPSHOT TESTING
    // ========================================================================
    
    snapshot: {
      snapshotFormat: {
        printBasicPrototype: false,
      },
    },

    // Hook configuration
    hooks: {
      // Run after all tests complete
      afterAll: [],
    },
  },
});
