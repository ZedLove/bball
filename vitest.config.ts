import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      reporter: ['text', 'html', 'json'],
      thresholds: {
        lines: 90,
        functions: 100,
        branches: 85,
        statements: 90,
      },
    },
    include: ['**/*.test.ts'],
  },
});
