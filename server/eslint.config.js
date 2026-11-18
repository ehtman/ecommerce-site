/**
 * eslint.config.js – ESLint "flat config".
 *
 * WHAT: ESLint reads our code and reports likely bugs (unused variables, undefined names…).
 * WHY:  Catching mistakes automatically is cheaper than finding them in production.
 * HOW:  `npm run lint` checks everything, `npm run lint:fix` fixes what it safely can.
 *       Formatting (spaces, quotes) is Prettier's job, so `eslint-config-prettier`
 *       switches off every ESLint rule that would argue with Prettier.
 */
import js from '@eslint/js'; // ESLint's own recommended rules
import globals from 'globals'; // lists of known global variables (process, describe…)
import jest from 'eslint-plugin-jest'; // extra rules that understand Jest tests
import prettier from 'eslint-config-prettier'; // turns off style rules Prettier handles

export default [
  // Folders ESLint should never look at
  { ignores: ['node_modules/**', 'coverage/**'] },

  // Base: the recommended JavaScript rules
  js.configs.recommended,

  // Our code runs in Node.js and uses ES modules (import/export)
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.node },
    },
    rules: {
      // Allow unused names that start with "_" (e.g. Express's `_req`, `_next`)
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },

  // Test files also know Jest's globals (describe, it, expect…)
  {
    files: ['tests/**/*.js'],
    ...jest.configs['flat/recommended'],
    languageOptions: { globals: { ...globals.node, ...globals.jest } },
  },

  // Must be LAST so it can switch off conflicting style rules
  prettier,
];
