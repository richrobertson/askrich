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
 */

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Test environment
    environment: 'node',
    globals: true,

    // Coverage configuration
    coverage: {
      // Coverage provider (v8 is recommended for JavaScript)
      provider: 'v8',

      // Directories to include in coverage analysis
      include: [
        'src/**/*.js',
        '!src/**/*.test.js',
        '!src/**/*.spec.js',
      ],

      // Files/patterns to exclude from coverage
      exclude: [
        'node_modules/',
        'dist/',
        'coverage/',
        '**/*.test.js',
        '**/*.spec.js',
        '**/*.config.js',
      ],

      // Coverage reporters
      reporter: [
        'text', // Terminal output
        'text-summary', // Summary in terminal
        'json', // Machine-readable JSON
        'html', // Interactive HTML report
        'html-spa', // Single-page HTML report
        'lcov', // LCOV format for CI integration
        'json-summary', // Summary JSON for CI
      ],

      // Output directory for coverage reports
      reportsDirectory: './coverage',

      // Coverage thresholds - ALL must be ≥95%
      thresholds: {
        lines: 95,
        functions: 95,
        branches: 95,
        statements: 95,

        // Per-file thresholds for critical files
        'src/milestone-6.test.js': {
          lines: 95,
          functions: 95,
          branches: 95,
          statements: 95,
        },
        'src/milestone-6-integration.test.js': {
          lines: 95,
          functions: 95,
          branches: 95,
          statements: 95,
        },
        'src/milestone-6-acceptance.test.js': {
          lines: 95,
          functions: 95,
          branches: 95,
          statements: 95,
        },
      },

      // Skip coverage for specific files
      all: true, // Report coverage for ALL files, not just tested ones

      // Detailed branch coverage tracking
      includeBranchTransitions: true,

      // Exclude coverage for specific statements/lines (use sparingly)
      excludeNodeModules: true,

      // Generate coverage on every run for CI
      forceReportTransform: true,

      // Fail tests if coverage thresholds not met
      reportOnFailure: true,
    },

    // Test reporter configuration
    reporters: ['verbose', 'html'],

    // Include source maps for better error reporting
    sourcemap: true,

    // Test timeout (ms)
    testTimeout: 10000,

    // Bail on first failure (set to false for full run)
    bail: 0,

    // Mockable globals
    globals: true,

    // Setup files (runs before all tests)
    setupFiles: [],

    // Include/exclude patterns
    include: [
      '**/*.test.{js,ts}',
      '**/*.spec.{js,ts}',
    ],

    exclude: [
      'node_modules',
      'dist',
      '.idea',
      '.git',
      '.cache',
      'coverage',
    ],

    // Enable isolating test environments
    isolate: true,

    // Threads configuration
    threads: true,
    maxThreads: 4,
    minThreads: 1,

    // Snapshot testing
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
