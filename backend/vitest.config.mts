import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['tests/setup.ts'],
    include: ['tests/**/*.test.ts'],
    testTimeout: 30_000,
    // First run downloads a MongoDB binary for mongodb-memory-server.
    hookTimeout: 120_000,
    // One in-memory MongoDB at a time keeps RAM usage low on modest machines.
    pool: 'forks',
    fileParallelism: false,
  },
});
