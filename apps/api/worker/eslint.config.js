import js from '@eslint/js';
import globals from 'globals';

const coreStyleRules = {
  eqeqeq: ['error', 'always'],
  'no-var': 'error',
  'prefer-const': 'error',
  'no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }],
};

const structureRules = {
  'max-lines': [
    'error',
    {
      max: 150,
      skipBlankLines: true,
      skipComments: true,
    },
  ],
  'max-lines-per-function': [
    'error',
    {
      max: 40,
      skipBlankLines: true,
      skipComments: true,
      IIFEs: true,
    },
  ],
};

export default [
  js.configs.recommended,
  {
    files: ['src/**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.serviceworker,
      },
    },
    rules: coreStyleRules,
  },
  {
    files: ['src/lib/**/*.js'],
    rules: structureRules,
  },
  {
    files: ['src/**/*.test.js'],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    rules: {
      'no-unused-vars': 'off',
      'max-lines': 'off',
      'max-lines-per-function': 'off',
    },
  },
];
