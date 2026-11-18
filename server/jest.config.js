/**
 * jest.config.js – how Jest finds and runs our tests.
 *
 * Our code uses ES modules ("type": "module"), so the npm scripts start Jest with
 * `node --experimental-vm-modules`. No Babel transform is needed.
 */
export default {
  testEnvironment: 'node', // we test a server, not a browser
  transform: {}, // run the code as-is (native ES modules, no Babel)
  setupFiles: ['<rootDir>/tests/setup/env.js'], // runs BEFORE each test file: sets test env vars
  globalSetup: '<rootDir>/tests/setup/globalSetup.js', // starts ONE in-memory MongoDB for the run
  globalTeardown: '<rootDir>/tests/setup/globalTeardown.js', // stops it at the end
  testMatch: ['<rootDir>/tests/**/*.test.js'], // test files end with .test.js
  testTimeout: 30000, // the first run downloads MongoDB, so be patient
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/server.js', // starts a real server: checked manually, not in tests
    '!src/db/scripts/**', // one-off CLI scripts (seed, indexes)
    '!src/modules/models.js', // only re-exports, nothing to test
  ],
  coverageThreshold: {
    // The test run FAILS if coverage drops below these numbers (an industry "quality gate")
    global: { lines: 90, statements: 90, functions: 90, branches: 80 },
  },
};
