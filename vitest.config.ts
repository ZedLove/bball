import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      reporter: ['text', 'html', 'json'],
      thresholds: {
        lines: 93,
        functions: 91,
        branches: 86,
        statements: 93,
      },
    },
    include: ['**/*.test.ts'],
  },
});
