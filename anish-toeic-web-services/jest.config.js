/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/*.test.ts'],
  setupFiles: ['<rootDir>/jest.setup.js'],
  setupFilesAfterEnv: ['<rootDir>/jest.teardown-setup.js'],
  globalTeardown: '<rootDir>/jest.globalTeardown.js',
  // ponytail: remove runInBand/detectOpenHandles when CI confirms clean teardown
  // runInBand: process isolation; detectOpenHandles: catch leaks in dev
  // maxWorkers: 1 required for --runInBand; omit for parallel default
};
